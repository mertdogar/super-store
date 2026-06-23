import * as Y from "yjs";

/**
 * Encoding helpers between plain JS leaf values and what a Yjs container can
 * store. Containers (Y.Map / Y.Array) hold either nested shared types
 * (decomposed StoreValue children + the store's own collection types) or
 * "opaque" leaf values handled here.
 *
 * Yjs can store JSON-ish values (null, number, string, boolean, plain
 * Object, Array, Uint8Array), but NOT `undefined` (it drops the key), nor
 * `Map`/`Set` (they serialize to `{}`, silently losing data). We round-trip
 * those through tagged sentinels. Opaque objects/arrays are deep-cloned on
 * the way in so the doc never aliases a caller-held reference.
 */

// Null-byte-prefixed so they cannot realistically collide with real data.
const UNDEFINED_SENTINEL = " __sv_undefined__";
const TAG = " __sv_tag__";

export type Tagged =
  | { [TAG]: "Map"; entries: Array<[unknown, unknown]> }
  | { [TAG]: "Set"; values: unknown[] };

export function isYType(v: unknown): v is Y.AbstractType<unknown> {
  return v instanceof Y.AbstractType;
}

/** Canonical, key-order-independent stringification used only for hashing Set
 * members / Map keys. Distinct objects with identical content collapse (value
 * semantics), and `undefined`-valued properties are preserved (distinct from
 * absent), unlike `JSON.stringify`. */
function stableStringify(v: unknown): string {
  if (v === undefined) return "u";
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v as object).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

/** A stable string key for a Set member or Map key, type-tagged so that the
 * number `1` and the string `"1"` never collide, and key-order-independent for
 * object members. Note: object members/keys are compared by content, not
 * reference — two distinct objects with equal content map to one slot, and
 * such members carry no stable identity across collaborating peers. */
export function hashKey(k: unknown): string {
  if (k === null) return "null";
  const t = typeof k;
  if (t === "object") return "o:" + stableStringify(k);
  return t + ":" + String(k);
}

/** JS leaf value -> Yjs-storable opaque value. Plain objects/arrays are
 * deep-cloned so a later mutation of the caller's reference cannot silently
 * corrupt the document. */
export function encodeLeaf(v: unknown): unknown {
  if (v === undefined) return UNDEFINED_SENTINEL;
  if (v instanceof Map) {
    return { [TAG]: "Map", entries: [...v].map(([k, val]) => [encodeLeaf(k), encodeLeaf(val)]) };
  }
  if (v instanceof Set) {
    return { [TAG]: "Set", values: [...v].map(encodeLeaf) };
  }
  if (v !== null && typeof v === "object") {
    // Opaque plain object/array — clone to isolate the doc from the caller.
    return structuredClone(v);
  }
  return v;
}

/** Yjs-storable opaque value -> JS leaf value. */
export function decodeLeaf(v: unknown): unknown {
  if (v === UNDEFINED_SENTINEL) return undefined;
  if (v !== null && typeof v === "object" && TAG in (v as object)) {
    const tagged = v as Tagged;
    if (tagged[TAG] === "Map") {
      return new Map(tagged.entries.map(([k, val]) => [decodeLeaf(k), decodeLeaf(val)]));
    }
    if (tagged[TAG] === "Set") {
      return new Set(tagged.values.map(decodeLeaf));
    }
  }
  return v;
}

/** A plain object/array is one document mode decomposes into a nested Y type.
 * Everything else (scalars, Map, Set, class instances, Y types) stays an opaque
 * leaf via the codec. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v) || v instanceof Map || v instanceof Set || isYType(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Compile `opaque` path globs into a predicate over a node's path (relative to
 * the store root). `*` matches exactly one segment (a record key / array index),
 * so `elements.*.value` marks every element's `value` subtree atomic. A matched
 * node — and everything under it — is stored as a single opaque leaf. */
export function compileOpaque(patterns: string[]): (path: string[]) => boolean {
  if (patterns.length === 0) return () => false;
  const compiled = patterns.map((p) => p.split("."));
  return (path) =>
    compiled.some(
      (pat) => pat.length === path.length && pat.every((seg, i) => seg === "*" || seg === path[i]),
    );
}

const DEEP_NOTHING = Symbol("deep-nothing");

/** Document-mode read: a nested Y type -> plain JSON, recursively; a leaf ->
 * decoded value. No `Y.*` and no handle ever leaks. */
export function materializeDeep(yval: unknown): unknown {
  if (yval instanceof Y.Map) {
    const out: Record<string, unknown> = {};
    for (const k of yval.keys()) out[k] = materializeDeep(yval.get(k));
    return out;
  }
  if (yval instanceof Y.Array) return yval.toArray().map(materializeDeep);
  return decodeLeaf(yval);
}

/** Prefix/suffix diff for a Y.Array of opaque leaf elements (§1a — arrays are
 * element-opaque in document mode: positional insert/delete merges, whole-
 * element replace is LWW). Returns whether the array was mutated. */
export function patchArrayLeaf(ya: Y.Array<unknown>, next: unknown[]): boolean {
  const old = ya.toArray().map(decodeLeaf);
  let changed = false;
  let p = 0;
  while (p < old.length && p < next.length && deepEqual(old[p], next[p])) p++;
  let s = 0;
  while (
    s < old.length - p &&
    s < next.length - p &&
    deepEqual(old[old.length - 1 - s], next[next.length - 1 - s])
  ) {
    s++;
  }
  const delCount = old.length - p - s;
  const insItems = next.slice(p, next.length - s).map(encodeLeaf);
  if (delCount > 0) {
    ya.delete(p, delCount);
    changed = true;
  }
  if (insItems.length > 0) {
    ya.insert(p, insItems);
    changed = true;
  }
  return changed;
}

/** Recurse-diff a single key of a Y.Map (§1d — diff into an existing subtree,
 * never detach-and-replace, so a concurrent edit on a sibling survives a whole-
 * tree write). Returns whether anything changed. */
export function setDeepKey(
  target: Y.Map<unknown>,
  key: string,
  v: unknown,
  isOpaque: (path: string[]) => boolean,
  path: string[],
  isPartial: boolean,
): boolean {
  const childPath = [...path, key];
  const cur = target.get(key);
  if (isPlainObject(v) && !isOpaque(childPath)) {
    let changed = false;
    let m = cur instanceof Y.Map ? cur : null;
    if (!m) {
      m = new Y.Map();
      target.set(key, m);
      changed = true;
    }
    return patchDeep(m, v, isOpaque, childPath, isPartial) || changed;
  }
  if (Array.isArray(v) && !isOpaque(childPath)) {
    let changed = false;
    let a = cur instanceof Y.Array ? cur : null;
    if (!a) {
      a = new Y.Array();
      target.set(key, a);
      changed = true;
    }
    return patchArrayLeaf(a, v) || changed;
  }
  const curLeaf = isYType(cur) ? DEEP_NOTHING : decodeLeaf(cur);
  if (curLeaf === DEEP_NOTHING || !deepEqual(curLeaf, v)) {
    target.set(key, encodeLeaf(v));
    return true;
  }
  return false;
}

/** Document-mode write: recurse `source` (plain JSON) into `target` (a nested Y
 * type), diffing so unchanged data is never rewritten. `isPartial` (update path)
 * merges keys and never deletes; full (set path) deletes keys absent from
 * `source`. Returns whether anything changed — callers bubble this into `_dirty`
 * so `set()`/`update()` report (and emit on) real change only. */
export function patchDeep(
  target: Y.Map<unknown> | Y.Array<unknown>,
  source: unknown,
  isOpaque: (path: string[]) => boolean,
  path: string[] = [],
  isPartial = false,
): boolean {
  if (target instanceof Y.Array) {
    return Array.isArray(source) ? patchArrayLeaf(target, source) : false;
  }
  if (!isPlainObject(source)) return false;
  const keys = Object.keys(source);
  let changed = false;
  if (!isPartial) {
    const want = new Set(keys);
    for (const k of Array.from(target.keys())) {
      if (!want.has(k)) {
        target.delete(k);
        changed = true;
      }
    }
  }
  for (const k of keys) {
    if (setDeepKey(target, k, source[k], isOpaque, path, isPartial)) changed = true;
  }
  return changed;
}

/** Deep structural equality used by the diff-and-patch to decide whether a
 * key/element actually changed, so unchanged data is never rewritten (which
 * would tombstone it and bloat the doc). Independent of the user's `isEqual`,
 * which gates the whole set(). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k))) return false;
    return true;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  return ak.every(
    (k) =>
      k in (b as object) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}
