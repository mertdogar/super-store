import * as Y from "yjs";
import { decodeLeaf, deepEqual, encodeLeaf, hashKey, isYType } from "./codec";

/** Origin tag for every write this library makes, so observers (and, later,
 * UndoManager) can distinguish local store writes from remote merges. */
export const STORE_ORIGIN = Symbol.for("@super-store/store");

/**
 * The resolved snapshot view of `T`: every nested `StoreValue<V>` field is
 * unwrapped to its inner `V`. Returned by `getSnapshot()`, which is what
 * React's `useSyncExternalStore` consumes.
 */
export type InferStoreValueSnapshot<T> = {
  [K in keyof T]: T[K] extends StoreValue<infer V> ? V : T[K];
};

/**
 * The shape `update()` accepts: every top-level key is optional, and any
 * nested `StoreValue<V>` value is itself recursively partial-through-stores.
 */
export type StoreUpdate<T> = {
  [K in keyof T]?: T[K] extends StoreValue<infer V> ? StoreUpdate<V> : T[K];
};

const specialTypes = ["Set", "Map", "Array", "StoreValue"] as const;

const supportedTypes = [
  "null",
  "undefined",
  "string",
  "number",
  "boolean",
  "Object",
  ...specialTypes,
] as const;

type TypeName = (typeof supportedTypes)[number];
type YKind = "scalar" | "object" | "array" | "set" | "map";

function getTypeName<T>(value: T): TypeName {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") {
    const name = (value as object).constructor.name;
    if (specialTypes.includes(name as never)) return name as TypeName;
    if (name === "Object") return "Object";
    throw new Error(`Unsupported type: ${name}`);
  }
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  throw new Error(`Unsupported type: ${typeof value}`);
}

function yKindOf(typeName: TypeName): YKind {
  switch (typeName) {
    case "Object":
      return "object";
    case "Array":
      return "array";
    case "Set":
      return "set";
    case "Map":
      return "map";
    default:
      return "scalar";
  }
}

function isOneOfSpecialTypes(value: unknown) {
  return specialTypes.includes(getTypeName(value) as never);
}

function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

function cloneSkippingStoreValues<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as object)) {
    result[k] = isOneOfSpecialTypes(v) ? v : structuredClone(v);
  }
  return result as T;
}

export type Shape<K> = {
  readonly nonStoreValueKeys: ReadonlyArray<K>;
  readonly storeValueKeys: ReadonlyArray<K>;
};

export interface StoreValueOptions<T> {
  isEqual?: (a: T, b: T) => boolean;
  name?: string;
  debug?: boolean;
  /** Inject a Yjs document to persist/sync this store. Attach providers
   * (y-indexeddb, y-websocket, …) to this doc yourself. Omit for a private
   * in-memory doc that is created lazily on first Yjs access. */
  doc?: Y.Doc;
}

/**
 * Reactive primitive backed by Yjs. A `StoreValue` is a typed *handle* over a
 * Yjs shared type. It has two backing modes:
 *
 * - **unbound** — a plain in-memory value (identical semantics to the original
 *   in-memory store). This is the state for local-only stores and for children
 *   that have not yet been adopted by a bound parent.
 * - **bound** — backed by a Yjs type inside a `Y.Doc`. Reads materialise from
 *   the doc; writes go through `doc.transact` as a diff-and-patch; reactivity
 *   is driven by `observeDeep`.
 *
 * Binding is lazy and cascades from the root: a root binds when a `doc` is
 * injected or on first access to `.doc` / `.getYType()`; nested children bind
 * when their parent binds (their value is copied into a nested Y type and their
 * handle repointed — instance identity is preserved).
 */
export class StoreValue<T> {
  protected _value: T;
  protected listeners: Set<() => void> = new Set();
  protected isEqual: (a: T, b: T) => boolean;
  protected _partialUpdateSupported: boolean;
  protected _name: string;
  protected _debug: boolean;
  protected _shape!: Shape<keyof T>;
  private _childUnsubs: Array<() => void> = [];
  private _initialTypeName: TypeName;
  private _snapshot!: InferStoreValueSnapshot<T>;
  getSnapshot: () => InferStoreValueSnapshot<T>;
  subscribe: (listener: () => void) => () => void;

  // ─── Yjs bound-mode state ──────────────────────────────────────────────
  private _bound = false;
  private _yKind: YKind;
  private _rootKey: string;
  private _doc: Y.Doc | null = null;
  private _ownsDoc = false;
  private _ytype: Y.AbstractType<any> | null = null;
  /** key → child handle, for object stores. */
  private _children: Map<string, StoreValue<unknown>> = new Map();
  private _yobserver: (() => void) | null = null;
  /** Set by the patch helpers whenever they actually mutate the Y type, so
   * set()/update() can report (and emit on) genuine change only. */
  private _dirty = false;
  private _disposed = false;
  private _activated = false;

  constructor(value: T, options?: StoreValueOptions<T>) {
    this._value = value;
    this._initialTypeName = getTypeName(value);
    this._name = options?.name ?? `${this._initialTypeName} StoreValue`;
    this._rootKey = options?.name ?? "root";
    this._debug = options?.debug ?? false;
    this.isEqual = options?.isEqual ?? ((a, b) => a === b);
    this._partialUpdateSupported = this._initialTypeName === "Object";
    this._yKind = yKindOf(this._initialTypeName);
    this.getSnapshot = this._getSnapshot.bind(this);
    this.subscribe = this._subscribe.bind(this);

    if (options?.doc) {
      this._bindRoot(options.doc, false);
    } else {
      this._watchChildren(value);
      this._snapshot = this._buildSnapshot();
      this._shape = this._buildShape();
    }
  }

  get value() {
    return this._value;
  }

  /** The backing Yjs document. Accessing it lazily binds an unbound store to a
   * private in-memory doc. Attach persistence/sync providers here. */
  get doc(): Y.Doc {
    if (this._disposed) throw new Error("StoreValue has been disposed");
    if (!this._bound) this._bindRoot(new Y.Doc(), true);
    return this._doc!;
  }

  /** The backing Yjs shared type. Lazily binds (private doc) if needed. */
  getYType(): Y.AbstractType<unknown> {
    if (this._disposed) throw new Error("StoreValue has been disposed");
    if (!this._bound) this._bindRoot(new Y.Doc(), true);
    return this._ytype!;
  }

  /**
   * Replace the value. In bound mode this is a recursive diff-and-patch inside
   * a single transaction — unchanged data is never rewritten (so the doc does
   * not bloat and concurrent edits merge). Returns `true` iff the value was
   * considered changed under `isEqual`.
   */
  set(value: T): boolean {
    if (this._disposed) throw new Error("StoreValue has been disposed");
    if (this.isEqual(this._value, value)) return false;
    if (this._bound) {
      const kind = yKindOf(getTypeName(value));
      if (kind !== this._yKind) {
        throw new Error(
          `Cannot change a bound StoreValue's root kind from ${this._yKind} to ${kind}`,
        );
      }
      this._dirty = false;
      this._doc!.transact(() => this._patch(value), STORE_ORIGIN);
      // Honest return: true iff the diff-and-patch actually mutated the doc
      // (which is exactly when the observer fires and emits). A structurally
      // identical value is a no-op — unlike the in-memory store, which emits
      // on any reference-different set under the default `===`.
      return this._dirty;
    }
    this._value = isOneOfSpecialTypes(value) ? value : cloneSkippingStoreValues(value);
    this._watchChildren(this._value);
    this._shape = this._buildShape();
    this.emitChange();
    return true;
  }

  /**
   * Apply a partial update. Object stores only. Plain keys are merged; nested
   * `StoreValue` children receive a recursive `update()` so partial updates
   * propagate without losing child identity. In bound mode the whole update is
   * one transaction (one emit per affected handle).
   */
  update(value: StoreUpdate<T>): boolean {
    if (this._disposed) throw new Error("StoreValue has been disposed");
    if (!this._partialUpdateSupported) {
      throw new Error(
        `Partial updates are not supported for this value type ${typeof this._value}`,
      );
    }
    if (this._bound) return this._updateBound(value);

    const storeValueUpdates = pick(value, this._shape.storeValueKeys);
    for (const [key, updateValue] of Object.entries(storeValueUpdates)) {
      const storeValue = this._value[key as keyof T] as StoreValue<unknown>;
      storeValue.update(updateValue as never);
    }
    const nonStoreValueUpdates = pick(value, this._shape.nonStoreValueKeys);
    const newValue = { ...this._value, ...nonStoreValueUpdates };
    return this.set(newValue as T);
  }

  private _updateBound(value: StoreUpdate<T>): boolean {
    this._dirty = false;
    let childChanged = false;
    this._doc!.transact(() => {
      const plain: Record<string, unknown> = {};
      for (const [k, uv] of Object.entries(value)) {
        const child = this._children.get(k);
        if (child) {
          if (child.update(uv as never)) childChanged = true;
        } else {
          plain[k] = uv;
        }
      }
      const merged = { ...(this._value as object), ...plain };
      if (!this.isEqual(this._value, merged as T)) {
        for (const [k, val] of Object.entries(plain)) this._setKey(k, val);
      }
    }, STORE_ORIGIN);
    // `_dirty` reflects plain-key writes on this handle; childChanged reflects
    // nested child updates. Either means a genuine change occurred.
    return this._dirty || childChanged;
  }

  _subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitChange() {
    this._snapshot = this._buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  /** Tear down observers and, if this store created its own private doc,
   * destroy it. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this._yobserver && this._ytype) this._ytype.unobserveDeep(this._yobserver);
    this._yobserver = null;
    for (const child of this._children.values()) child.dispose();
    this._childUnsubs.forEach((u) => u());
    this._childUnsubs = [];
    if (this._ownsDoc && this._doc) this._doc.destroy();
  }

  select<R>(
    selector: (snapshot: InferStoreValueSnapshot<T>) => R,
    isEqual: (a: R, b: R) => boolean = Object.is,
  ): {
    subscribe: (listener: () => void) => () => void;
    getSnapshot: () => R;
  } {
    let cached: { value: R } | null = null;
    return {
      subscribe: this.subscribe,
      getSnapshot: () => {
        const next = selector(this._snapshot);
        if (cached !== null && isEqual(cached.value, next)) return cached.value;
        cached = { value: next };
        return next;
      },
    };
  }

  // ─── Snapshot / shape (mode-agnostic; operate on `_value`) ──────────────

  private _buildShape(): Shape<keyof T> {
    const nonStoreValueKeys: (keyof T)[] = [];
    const storeValueKeys: (keyof T)[] = [];
    for (const [k, v] of Object.entries((this._value || {}) as object)) {
      if (v instanceof StoreValue) storeValueKeys.push(k as keyof T);
      else nonStoreValueKeys.push(k as keyof T);
    }
    return { nonStoreValueKeys, storeValueKeys } as Shape<keyof T>;
  }

  private _buildSnapshot(): InferStoreValueSnapshot<T> {
    const v = this._value;
    if (typeof v !== "object" || v === null) return v as InferStoreValueSnapshot<T>;
    let hasChild = false;
    for (const child of Object.values(v as object)) {
      if (child instanceof StoreValue) {
        hasChild = true;
        break;
      }
    }
    if (!hasChild) return v as InferStoreValueSnapshot<T>;
    const resolved: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(v as object)) {
      // getSnapshot() (not .value) so nested composites unwrap recursively —
      // no raw StoreValue handle ever leaks into the snapshot.
      resolved[k] = child instanceof StoreValue ? child.getSnapshot() : child;
    }
    return resolved as InferStoreValueSnapshot<T>;
  }

  _getSnapshot(): InferStoreValueSnapshot<T> {
    return this._snapshot;
  }

  private _watchChildren(value: T): void {
    this._childUnsubs.forEach((u) => u());
    this._childUnsubs = [];
    if (typeof value !== "object" || value === null) return;
    for (const child of Object.values(value as object)) {
      if (child instanceof StoreValue) {
        this._childUnsubs.push(child._subscribe(() => this.emitChange()));
      }
    }
  }

  // ─── Yjs binding ────────────────────────────────────────────────────────

  private _bindRoot(doc: Y.Doc, ownsDoc: boolean) {
    this._doc = doc;
    this._ownsDoc = ownsDoc;
    this._bound = true;
    this._childUnsubs.forEach((u) => u());
    this._childUnsubs = [];
    this._ytype = this._yKind === "array" ? doc.getArray(this._rootKey) : doc.getMap(this._rootKey);
    // Seed the initial value only into an EMPTY doc. If the doc already holds
    // data (persistence reload, or joining a session whose state was applied
    // before construction), the doc is the source of truth: skip the seed and
    // hydrate from it (_activateTree adopts the existing structure). The
    // initial value is then ignored — document-wins, the standard CRDT join.
    if (this._isEmptyRoot()) {
      doc.transact(() => this._populateTree(), STORE_ORIGIN);
    }
    this._activateTree();
  }

  private _isEmptyRoot(): boolean {
    const ytype = this._ytype!;
    return ytype instanceof Y.Array ? ytype.length === 0 : (ytype as Y.Map<unknown>).size === 0;
  }

  /** Write `_value` into `_ytype`, recursing into and binding child handles.
   * Must run inside a transaction; observers are NOT attached here. */
  private _populateTree(): void {
    const ytype = this._ytype!;
    const v = this._value;
    switch (this._yKind) {
      case "scalar":
        (ytype as Y.Map<unknown>).set("v", encodeLeaf(v));
        break;
      case "object":
        for (const [k, val] of Object.entries(v as object)) {
          if (val instanceof StoreValue) this._attachChild(k, val);
          else (ytype as Y.Map<unknown>).set(k, encodeLeaf(val));
        }
        break;
      case "array":
        (ytype as Y.Array<unknown>).insert(0, (v as unknown[]).map(encodeLeaf));
        break;
      case "set":
        for (const m of v as Set<unknown>) (ytype as Y.Map<unknown>).set(hashKey(m), encodeLeaf(m));
        break;
      case "map":
        for (const [k, val] of v as Map<unknown, unknown>) {
          (ytype as Y.Map<unknown>).set(hashKey(k), [encodeLeaf(k), encodeLeaf(val)]);
        }
        break;
    }
  }

  /** Materialise `_value` from `_ytype`, attach the deep observer, recurse into
   * children. Idempotent (guarded by `_activated`) so it can be called both for
   * freshly-populated children and for children adopted from an existing doc.
   * Must run AFTER the populate transaction has committed. */
  private _activateTree(): void {
    if (this._activated) return;
    // Adopt any nested Y types that are not yet tracked as child handles
    // (the hydrate path: a populated doc whose children we did not create).
    this._reconcileChildren();
    this._value = this._materialize();
    this._shape = this._buildShape();
    // Activate children first so their `_value` is materialised before this
    // node snapshots them — otherwise the snapshot captures the children's
    // stale input instances and the first change swaps the references.
    for (const child of this._children.values()) child._activateTree();
    this._snapshot = this._buildSnapshot();
    this._yobserver = () => this._onYChange();
    this._ytype!.observeDeep(this._yobserver);
    this._activated = true;
  }

  /** Create a nested Y type for a child, integrate it, populate it. Does not
   * activate the child (caller decides when). */
  private _attachChild(key: string, child: StoreValue<unknown>): void {
    if (child._bound) {
      throw new Error(
        "Cannot nest a StoreValue that is already bound to a document. Build it inline or keep it unbound until adoption.",
      );
    }
    const childY = child._yKind === "array" ? new Y.Array() : new Y.Map();
    (this._ytype as Y.Map<unknown>).set(key, childY);
    child._doc = this._doc;
    child._ownsDoc = false;
    child._bound = true;
    child._ytype = childY;
    child._childUnsubs.forEach((u) => u());
    child._childUnsubs = [];
    child._populateTree();
    this._children.set(key, child);
  }

  /** Reconcile child handles against the nested Y types actually present under
   * this object's Y.Map: adopt newly-appeared subtrees (hydration / remote
   * merge) and detach ones that vanished. Adopted children are created un-
   * activated; the caller activates them. Returns true if anything changed. */
  private _reconcileChildren(): boolean {
    if (this._yKind !== "object") return false;
    const ymap = this._ytype as Y.Map<unknown>;
    let changed = false;
    for (const k of ymap.keys()) {
      const v = ymap.get(k);
      if (isYType(v) && !this._children.has(k)) {
        this._children.set(k, StoreValue._adopt(v, this._doc!));
        changed = true;
      }
    }
    for (const [k, child] of Array.from(this._children)) {
      const v = ymap.has(k) ? ymap.get(k) : undefined;
      if (!isYType(v)) {
        child._detach();
        this._children.delete(k);
        changed = true;
      }
    }
    return changed;
  }

  /** Build an un-activated child handle bound to an already-populated Y type
   * (no seed). Kind is inferred from the Y type: Y.Array -> array, Y.Map ->
   * object. (A remotely-added Set/Map/scalar child encoded as a Y.Map cannot be
   * distinguished and is treated as an object — a documented limitation for the
   * rare cross-schema case; the common object/array children adopt correctly.) */
  private static _adopt(ytype: Y.AbstractType<unknown>, doc: Y.Doc): StoreValue<unknown> {
    const placeholder = ytype instanceof Y.Array ? [] : {};
    const sv = new StoreValue<unknown>(placeholder);
    sv._bound = true;
    sv._doc = doc;
    sv._ownsDoc = false;
    sv._ytype = ytype;
    sv._childUnsubs.forEach((u) => u());
    sv._childUnsubs = [];
    return sv;
  }

  private _materialize(): T {
    const ytype = this._ytype!;
    switch (this._yKind) {
      case "scalar":
        return decodeLeaf((ytype as Y.Map<unknown>).get("v")) as T;
      case "object": {
        const out: Record<string, unknown> = {};
        for (const k of (ytype as Y.Map<unknown>).keys()) {
          const v = (ytype as Y.Map<unknown>).get(k);
          if (isYType(v)) {
            const child = this._children.get(k);
            // A nested Y type with no local handle is a foreign/remote subtree
            // we have not adopted yet — skip it rather than leak `undefined`.
            // (M3 adopts these on hydration / remote merge.)
            if (child === undefined) continue;
            out[k] = child;
          } else {
            out[k] = decodeLeaf(v);
          }
        }
        return out as T;
      }
      case "array":
        return (ytype as Y.Array<unknown>).toArray().map(decodeLeaf) as T;
      case "set":
        return new Set([...(ytype as Y.Map<unknown>).values()].map(decodeLeaf)) as T;
      case "map":
        return new Map(
          [...(ytype as Y.Map<[unknown, unknown]>).values()].map(([k, v]) => [
            decodeLeaf(k),
            decodeLeaf(v),
          ]),
        ) as T;
    }
  }

  private _onYChange(): void {
    // The deep observer fires only when this subtree's Yjs data actually
    // changed (local no-op writes are already filtered at set()/update()
    // entry by `isEqual`, and the diff-and-patch writes nothing when content
    // is unchanged). So always re-materialise, rebuild the snapshot, and emit
    // — mirroring the in-memory store's unconditional emitChange-on-change.
    // (Do NOT gate on `isEqual` here: a custom field-ignoring `isEqual` would
    // leave the snapshot stale after a real change, tearing useSyncExternalStore.)
    //
    // A remote merge may add/remove nested child subtrees — reconcile handles,
    // then activate any newly-adopted ones (idempotent for existing children).
    if (this._reconcileChildren()) {
      for (const child of this._children.values()) child._activateTree();
    }
    this._value = this._materialize();
    this._shape = this._buildShape();
    this._snapshot = this._buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  // ─── Diff-and-patch writes (bound mode) ─────────────────────────────────

  private _patch(value: T): void {
    const ytype = this._ytype!;
    switch (this._yKind) {
      case "scalar": {
        if (!deepEqual(decodeLeaf((ytype as Y.Map<unknown>).get("v")), value)) {
          (ytype as Y.Map<unknown>).set("v", encodeLeaf(value));
          this._dirty = true;
        }
        break;
      }
      case "object": {
        const keys = new Set(Object.keys(value as object));
        for (const k of Array.from((ytype as Y.Map<unknown>).keys())) {
          if (!keys.has(k)) this._deleteKey(k);
        }
        for (const [k, val] of Object.entries(value as object)) this._setKey(k, val);
        break;
      }
      case "array":
        this._patchArray(value as unknown[]);
        break;
      case "set": {
        const want = new Map<string, unknown>();
        for (const m of value as Set<unknown>) want.set(hashKey(m), m);
        for (const k of Array.from((ytype as Y.Map<unknown>).keys())) {
          if (!want.has(k)) {
            (ytype as Y.Map<unknown>).delete(k);
            this._dirty = true;
          }
        }
        for (const [hk, m] of want) {
          if (!(ytype as Y.Map<unknown>).has(hk)) {
            (ytype as Y.Map<unknown>).set(hk, encodeLeaf(m));
            this._dirty = true;
          }
        }
        break;
      }
      case "map": {
        const want = new Map<string, [unknown, unknown]>();
        for (const [k, v] of value as Map<unknown, unknown>) want.set(hashKey(k), [k, v]);
        for (const k of Array.from((ytype as Y.Map<unknown>).keys())) {
          if (!want.has(k)) {
            (ytype as Y.Map<unknown>).delete(k);
            this._dirty = true;
          }
        }
        for (const [hk, [k, v]] of want) {
          const cur = (ytype as Y.Map<[unknown, unknown]>).get(hk);
          if (!cur || !deepEqual(decodeLeaf(cur[0]), k) || !deepEqual(decodeLeaf(cur[1]), v)) {
            (ytype as Y.Map<unknown>).set(hk, [encodeLeaf(k), encodeLeaf(v)]);
            this._dirty = true;
          }
        }
        break;
      }
    }
  }

  private _patchArray(next: unknown[]): void {
    const ya = this._ytype as Y.Array<unknown>;
    const old = ya.toArray().map(decodeLeaf);
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
      this._dirty = true;
    }
    if (insItems.length > 0) {
      ya.insert(p, insItems);
      this._dirty = true;
    }
  }

  private _deleteKey(key: string): void {
    const child = this._children.get(key);
    if (child) {
      child._detach();
      this._children.delete(key);
    }
    if ((this._ytype as Y.Map<unknown>).has(key)) {
      (this._ytype as Y.Map<unknown>).delete(key);
      this._dirty = true;
    }
  }

  private _setKey(key: string, val: unknown): void {
    const child = this._children.get(key);
    if (val instanceof StoreValue) {
      if (child === val) return;
      this._deleteKey(key);
      this._attachChild(key, val);
      this._children.get(key)!._activateTree();
      this._dirty = true;
      return;
    }
    if (child) {
      child._detach();
      this._children.delete(key);
    }
    const ymap = this._ytype as Y.Map<unknown>;
    const cur = ymap.has(key) && !isYType(ymap.get(key)) ? decodeLeaf(ymap.get(key)) : NOTHING;
    if (!deepEqual(cur, val)) {
      ymap.set(key, encodeLeaf(val));
      this._dirty = true;
    }
  }

  /** Revert this (formerly bound) subtree to unbound in-memory mode, keeping
   * its last materialised value. Used when a parent replaces/removes a child:
   * the orphaned handle keeps working locally but no longer touches the doc. */
  private _detach(): void {
    if (this._yobserver && this._ytype) this._ytype.unobserveDeep(this._yobserver);
    this._yobserver = null;
    for (const child of this._children.values()) child._detach();
    this._bound = false;
    this._activated = false;
    this._ytype = null;
    this._doc = null;
    this._ownsDoc = false;
    this._watchChildren(this._value);
    this._shape = this._buildShape();
  }
}

const NOTHING = Symbol("nothing");
