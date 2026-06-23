import { describe, it, expect, vi } from "vitest";
import * as Y from "yjs";
import { StoreValue } from "../store-value";

function bound<T>(value: T, opts?: { isEqual?: (a: T, b: T) => boolean }) {
  return new StoreValue(value, { ...opts, doc: new Y.Doc(), name: "root" });
}

// ─── return ⟺ emit ⟺ actual change (findings: reactivity/lifecycle decoupling) ──

describe("review — set()/update() return reflects actual change, consistent with emit", () => {
  it("object: a content-equal new value is a no-op (returns false, no emit, stable snapshot)", () => {
    const s = bound({ a: 1, b: 2 });
    const l = vi.fn();
    s.subscribe(l);
    const snap = s.getSnapshot();
    expect(s.set({ a: 1, b: 2 })).toBe(false);
    expect(l).not.toHaveBeenCalled();
    expect(s.getSnapshot()).toBe(snap);
  });

  it("object: a real change returns true and emits exactly once", () => {
    const s = bound({ a: 1, b: 2 });
    const l = vi.fn();
    s.subscribe(l);
    expect(s.set({ a: 1, b: 3 })).toBe(true);
    expect(l).toHaveBeenCalledTimes(1);
  });

  it("array / Set / Map: content-equal set is a no-op", () => {
    const arr = bound([1, 2, 3]);
    const la = vi.fn();
    arr.subscribe(la);
    expect(arr.set([1, 2, 3])).toBe(false);
    expect(la).not.toHaveBeenCalled();

    const set = bound(new Set(["a"]));
    const ls = vi.fn();
    set.subscribe(ls);
    expect(set.set(new Set(["a"]))).toBe(false);
    expect(ls).not.toHaveBeenCalled();

    const map = bound(new Map([["a", 1]]));
    const lm = vi.fn();
    map.subscribe(lm);
    expect(map.set(new Map([["a", 1]]))).toBe(false);
    expect(lm).not.toHaveBeenCalled();
  });

  it("update() of only-unchanged keys returns false and does not emit", () => {
    const s = bound({ a: 1, b: 2 });
    const l = vi.fn();
    s.subscribe(l);
    expect(s.update({ a: 1 })).toBe(false);
    expect(l).not.toHaveBeenCalled();
  });

  it("update() that changes only a nested child returns true and emits", () => {
    const overlay = new StoreValue({ size: 1 });
    const parent = new StoreValue({ overlay }, { doc: new Y.Doc(), name: "r" });
    const l = vi.fn();
    parent.subscribe(l);
    expect(parent.update({ overlay: { size: 2 } as never })).toBe(true);
    expect(l).toHaveBeenCalledTimes(1);
    expect(overlay.value).toEqual({ size: 2 });
  });
});

// ─── _onYChange no longer stales the snapshot under a custom isEqual ─────────────

describe("review — snapshot never goes stale on a real change", () => {
  it("a composite with isEqual:()=>true still refreshes snapshot + emits when a child changes", () => {
    const x = new StoreValue(1);
    const parent = new StoreValue({ x }, { doc: new Y.Doc(), name: "r", isEqual: () => true });
    const l = vi.fn();
    parent.subscribe(l);
    x.set(42);
    expect(l).toHaveBeenCalledTimes(1);
    expect(parent.getSnapshot()).toEqual({ x: 42 }); // snapshot fresh, not stale
    expect(parent.value.x.value).toBe(42); // the live handle tracks it too
  });
});

// ─── deep snapshot unwrap (no raw StoreValue handle leaks) ───────────────────────

describe("review — getSnapshot fully unwraps nested composites", () => {
  it("bound 3-level composite", () => {
    const g = new StoreValue(5);
    const mid = new StoreValue({ g });
    const root = new StoreValue({ mid }, { doc: new Y.Doc(), name: "r" });
    const snap = root.getSnapshot();
    expect(snap).toEqual({ mid: { g: 5 } });
    expect(snap.mid.g).toBe(5);
    expect(snap.mid).not.toBeInstanceOf(StoreValue);
  });

  it("unbound 3-level composite", () => {
    const g = new StoreValue(5);
    const mid = new StoreValue({ g });
    const root = new StoreValue({ mid });
    expect(root.getSnapshot()).toEqual({ mid: { g: 5 } });
  });
});

// ─── hashKey: object members/keys are content-canonical (order-independent) ──────

describe("review — Set/Map with object members/keys", () => {
  it("object Set members round-trip and are key-order independent", () => {
    const s = bound(new Set<Record<string, number>>([{ a: 1, b: 2 }]));
    expect(s.value).toEqual(new Set([{ a: 1, b: 2 }]));
    // distinct-content objects stay distinct
    const s2 = bound(new Set<Record<string, number>>([{ a: 1 }, { a: 2 }]));
    expect(s2.value.size).toBe(2);
    // equal-content objects collapse (value semantics) — documented behaviour
    const s3 = bound(
      new Set<Record<string, number>>([
        { a: 1, b: 2 },
        { b: 2, a: 1 },
      ]),
    );
    expect(s3.value.size).toBe(1);
  });

  it("object-keyed Map round-trips", () => {
    const m = bound(new Map<Record<string, number>, string>([[{ id: 1 }, "x"]]));
    const entries = [...m.value.entries()];
    expect(entries).toHaveLength(1);
    expect(entries[0][0]).toEqual({ id: 1 });
    expect(entries[0][1]).toBe("x");
  });
});

// ─── opaque values isolated from caller references (no silent doc corruption) ────

describe("review — opaque object/array values are deep-cloned on write", () => {
  it("mutating a nested object passed to set() does not corrupt the doc", () => {
    const inner = { a: 1 };
    const s = bound<{ cfg: { a: number } }>({ cfg: inner });
    inner.a = 999;
    expect(s.value.cfg.a).toBe(1);
  });

  it("mutating an array element-object after set() does not corrupt the doc", () => {
    const item = { n: 1 };
    const s = bound<{ items: { n: number }[] }>({ items: [item] });
    item.n = 999;
    expect(s.value.items[0].n).toBe(1);
  });
});

// ─── dispose() guard ────────────────────────────────────────────────────────────

describe("review — dispose() makes further writes loud, not silently stale", () => {
  it("set()/update() after dispose() throw", () => {
    const s = bound({ x: 1 });
    s.dispose();
    expect(() => s.set({ x: 2 })).toThrow(/disposed/);
    expect(() => s.update({ x: 2 })).toThrow(/disposed/);
  });

  it("dispose() is idempotent", () => {
    const s = bound({ x: 1 });
    s.dispose();
    expect(() => s.dispose()).not.toThrow();
  });
});

// ─── deep binding cascades (probe E & J) ─────────────────────────────────────────

describe("review — deep binding cascades", () => {
  it("set() replacing a child with a new child that has its own children", () => {
    const oldChild = new StoreValue<Record<string, unknown>>({ v: 1 });
    const parent = new StoreValue<{ c: StoreValue<Record<string, unknown>> }>(
      { c: oldChild },
      { doc: new Y.Doc(), name: "r" },
    );
    const grand = new StoreValue(7);
    const newChild = new StoreValue<Record<string, unknown>>({ nested: grand });
    parent.set({ c: newChild });
    expect(parent.getSnapshot()).toEqual({ c: { nested: 7 } });
    grand.set(8);
    expect(parent.getSnapshot()).toEqual({ c: { nested: 8 } });
  });

  it("3-level unbound tree, lazy-bound via .doc, leaf change emits root once", () => {
    const leaf = new StoreValue(1);
    const mid = new StoreValue({ leaf });
    const root = new StoreValue({ mid });
    void root.doc; // lazy-bind the whole tree
    const l = vi.fn();
    root.subscribe(l);
    leaf.set(2);
    expect(l).toHaveBeenCalledTimes(1);
    expect(root.getSnapshot()).toEqual({ mid: { leaf: 2 } });
  });
});

// ─── divergence is mode-consistent only where intended ───────────────────────────

describe("review — documented unbound vs bound divergence", () => {
  it("unbound emits on a reference-different equal-content set (default ===); bound does not", () => {
    const unbound = new StoreValue({ a: 1 });
    const lu = vi.fn();
    unbound.subscribe(lu);
    expect(unbound.set({ a: 1 })).toBe(true);
    expect(lu).toHaveBeenCalledTimes(1);

    const b = bound({ a: 1 });
    const lb = vi.fn();
    b.subscribe(lb);
    expect(b.set({ a: 1 })).toBe(false);
    expect(lb).not.toHaveBeenCalled();
  });
});
