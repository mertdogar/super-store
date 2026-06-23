import { describe, it, expect, vi } from "vitest";
import * as Y from "yjs";
import { StoreValue } from "../store-value";

// Helper: build a root store bound to a fresh injected Y.Doc.
function bound<T>(value: T, opts?: { isEqual?: (a: T, b: T) => boolean }) {
  return new StoreValue(value, { ...opts, doc: new Y.Doc(), name: "root" });
}

// ─── Bound primitives ─────────────────────────────────────────────────────────

describe("bound — primitives", () => {
  it("holds the initial number", () => {
    const s = bound(42);
    expect(s.value).toBe(42);
    expect(s.getSnapshot()).toBe(42);
  });

  it("set() updates and returns true; emits once", () => {
    const s = bound(1);
    const listener = vi.fn();
    s.subscribe(listener);
    expect(s.set(2)).toBe(true);
    expect(s.value).toBe(2);
    expect(s.getSnapshot()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("set() returns false and does not emit when value is equal", () => {
    const s = bound(1);
    const listener = vi.fn();
    s.subscribe(listener);
    expect(s.set(1)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribing stops notifications", () => {
    const s = bound(0);
    const listener = vi.fn();
    const unsub = s.subscribe(listener);
    unsub();
    s.set(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("update() throws for scalar stores", () => {
    const s = bound(1);
    expect(() => s.update(2 as never)).toThrow();
  });

  it("round-trips null", () => {
    const s = bound<null | number>(null);
    expect(s.value).toBe(null);
    s.set(5);
    expect(s.value).toBe(5);
    s.set(null);
    expect(s.value).toBe(null);
  });

  it("round-trips undefined via sentinel", () => {
    const s = bound<undefined | number>(undefined);
    expect(s.value).toBe(undefined);
    expect(s.getSnapshot()).toBe(undefined);
    s.set(7);
    expect(s.value).toBe(7);
    s.set(undefined);
    expect(s.value).toBe(undefined);
  });
});

// ─── Bound objects ────────────────────────────────────────────────────────────

describe("bound — objects", () => {
  it("holds the initial object", () => {
    const s = bound({ x: 1, y: 2 });
    expect(s.value).toEqual({ x: 1, y: 2 });
    expect(s.getSnapshot()).toEqual({ x: 1, y: 2 });
  });

  it("update() merges partial values and emits once", () => {
    const s = bound({ x: 1, y: 2 });
    const listener = vi.fn();
    s.subscribe(listener);
    expect(s.update({ x: 10 })).toBe(true);
    expect(s.value).toEqual({ x: 10, y: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("getSnapshot() is reference-stable between calls when nothing changed", () => {
    const s = bound({ x: 1, y: 2 });
    expect(s.getSnapshot()).toBe(s.getSnapshot());
  });

  it("getSnapshot() returns a new reference after set()", () => {
    const s = bound({ x: 1 });
    const snap1 = s.getSnapshot();
    s.set({ x: 2 });
    const snap2 = s.getSnapshot();
    expect(snap1).not.toBe(snap2);
    expect(snap2).toEqual({ x: 2 });
  });

  it("value is isolated from the input object after set()", () => {
    const s = bound({ x: 1 });
    const next = { x: 2 };
    s.set(next);
    next.x = 99;
    expect(s.value.x).toBe(2);
  });

  it("round-trips an undefined property", () => {
    const s = bound<{ a: number | undefined; b: number }>({ a: undefined, b: 1 });
    expect("a" in (s.value as object)).toBe(true);
    expect(s.value.a).toBe(undefined);
    expect(s.value.b).toBe(1);
  });
});

// ─── Diff-and-patch keeps the doc small ────────────────────────────────────────

describe("bound — diff-and-patch (no clobber, no bloat)", () => {
  it("re-setting the same value writes nothing (doc size unchanged)", () => {
    const s = bound({ a: 1, b: 2, c: 3 });
    const base = Y.encodeStateAsUpdate(s.doc).length;
    for (let i = 0; i < 50; i++) s.set({ a: 1, b: 2, c: 3 });
    expect(Y.encodeStateAsUpdate(s.doc).length).toBe(base);
  });

  it("changing one key only rewrites that key", () => {
    const s = bound<{ a: number; b: number; c: number }>({ a: 1, b: 2, c: 3 });
    const before = Y.encodeStateAsUpdate(s.doc).length;
    s.set({ a: 1, b: 2, c: 99 });
    const after = Y.encodeStateAsUpdate(s.doc).length;
    expect(after).toBeGreaterThan(before);
    expect(s.value.c).toBe(99);
    // Hot-path churn stays bounded thanks to the per-key equality guard.
    for (let i = 0; i < 100; i++) s.set({ a: 1, b: 2, c: i });
    const churned = Y.encodeStateAsUpdate(s.doc).length;
    expect(churned).toBeLessThan(after * 4);
  });
});

// ─── Bound arrays (diff-and-patch) ─────────────────────────────────────────────

describe("bound — arrays", () => {
  it("holds and replaces array content", () => {
    const s = bound([1, 2, 3]);
    expect(s.value).toEqual([1, 2, 3]);
    s.set([1, 2, 3, 4]);
    expect(s.value).toEqual([1, 2, 3, 4]);
    s.set([0, 2, 3, 4]);
    expect(s.value).toEqual([0, 2, 3, 4]);
    s.set([2, 3]);
    expect(s.value).toEqual([2, 3]);
  });

  it("appending only inserts the new tail (prefix preserved in Y.Array)", () => {
    const s = bound<number[]>([1, 2, 3]);
    const ya = s.getYType() as Y.Array<unknown>;
    const firstItem = ya.get(0);
    s.set([1, 2, 3, 4, 5]);
    // The original items were not deleted+reinserted — same logical content.
    expect(ya.get(0)).toBe(firstItem);
    expect(s.value).toEqual([1, 2, 3, 4, 5]);
  });
});

// ─── Bound Set / Map ───────────────────────────────────────────────────────────

describe("bound — Set", () => {
  it("round-trips a string Set and replaces it", () => {
    const s = bound(new Set(["a", "b"]));
    expect(s.value).toEqual(new Set(["a", "b"]));
    s.set(new Set(["a", "b", "c"]));
    expect(s.value).toEqual(new Set(["a", "b", "c"]));
  });

  it("preserves member types (numbers stay numbers)", () => {
    const s = bound(new Set([1, 2, 3]));
    expect(s.value).toEqual(new Set([1, 2, 3]));
    expect([...s.value].every((n) => typeof n === "number")).toBe(true);
  });
});

describe("bound — Map", () => {
  it("round-trips a string-keyed Map", () => {
    const s = bound(new Map([["a", 1]]));
    expect(s.value).toEqual(new Map([["a", 1]]));
    s.set(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
    expect(s.value).toEqual(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
  });

  it("round-trips a non-string-keyed Map with types preserved", () => {
    const s = bound(
      new Map<number, string>([
        [1, "one"],
        [2, "two"],
      ]),
    );
    expect(s.value).toEqual(
      new Map([
        [1, "one"],
        [2, "two"],
      ]),
    );
    expect([...s.value.keys()].every((k) => typeof k === "number")).toBe(true);
  });
});

// ─── Bound composite (lazy adoption cascade) ───────────────────────────────────

describe("bound — composite with child StoreValues (lazy adoption)", () => {
  function makePos() {
    const x = new StoreValue(1);
    const y = new StoreValue(2);
    const pos = new StoreValue({ x, y }, { doc: new Y.Doc(), name: "pos" });
    return { x, y, pos };
  }

  it("adopts unbound children and resolves them in the snapshot", () => {
    const { pos } = makePos();
    expect(pos.getSnapshot()).toEqual({ x: 1, y: 2 });
  });

  it("parent re-emits when a child changes; snapshot reflects it", () => {
    const { x, pos } = makePos();
    const listener = vi.fn();
    pos.subscribe(listener);
    const before = pos.getSnapshot();
    x.set(99);
    expect(listener).toHaveBeenCalledTimes(1);
    const after = pos.getSnapshot();
    expect(after).not.toBe(before);
    expect(after).toEqual({ x: 99, y: 2 });
  });

  it("own listeners and child listeners both fire independently", () => {
    const { x, pos } = makePos();
    const parentListener = vi.fn();
    const childListener = vi.fn();
    pos.subscribe(parentListener);
    x.subscribe(childListener);
    x.set(5);
    expect(parentListener).toHaveBeenCalledTimes(1);
    expect(childListener).toHaveBeenCalledTimes(1);
  });

  it("update() recurses into a nested child, preserving its identity", () => {
    const overlay = new StoreValue({ handleSize: 3, strokeWidth: 1.5 });
    const parent = new StoreValue(
      { showRulers: false, overlay },
      { doc: new Y.Doc(), name: "cfg" },
    );
    const before = parent.value.overlay;
    parent.update({ showRulers: true, overlay: { handleSize: 5 } as never });
    expect(parent.value.overlay).toBe(before);
    expect(overlay.value).toEqual({ handleSize: 5, strokeWidth: 1.5 });
    expect(parent.value.showRulers).toBe(true);
    expect(parent.getSnapshot()).toEqual({
      showRulers: true,
      overlay: { handleSize: 5, strokeWidth: 1.5 },
    });
  });

  it("set() that swaps a child for a plain value rebuilds the shape", () => {
    const child = new StoreValue(1);
    const parent = new StoreValue<{ field: StoreValue<number> | number }>(
      { field: child },
      { doc: new Y.Doc(), name: "r" },
    );
    parent.set({ field: 42 });
    expect(parent.value.field).toBe(42);
    parent.update({ field: 100 });
    expect(parent.value.field).toBe(100);
  });

  it("set() un-subscribes a replaced child", () => {
    const oldChild = new StoreValue(1);
    const newChild = new StoreValue(10);
    const parent = new StoreValue<{ child: StoreValue<number> }>(
      { child: oldChild },
      { doc: new Y.Doc(), name: "r" },
    );
    const listener = vi.fn();
    parent.subscribe(listener);
    parent.set({ child: newChild });
    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();
    oldChild.set(999);
    expect(listener).not.toHaveBeenCalled();
    newChild.set(20);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("throws when nesting an already-bound child", () => {
    const child = new StoreValue(1);
    void child.doc; // force-bind to its own private doc
    expect(() => new StoreValue({ child }, { doc: new Y.Doc(), name: "r" })).toThrow(
      /already bound/,
    );
  });
});

// ─── Bound isEqual / select ────────────────────────────────────────────────────

describe("bound — custom isEqual & select", () => {
  it("set() bails when isEqual returns true even if reference differs", () => {
    const isEqual = (a: { x: number }, b: { x: number }) => a.x === b.x;
    const s = bound({ x: 1 }, { isEqual });
    const listener = vi.fn();
    s.subscribe(listener);
    expect(s.set({ x: 1 })).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("update() respects isEqual when the merged value is equivalent", () => {
    const isEqual = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      a.x === b.x && a.y === b.y;
    const s = bound({ x: 1, y: 2 }, { isEqual });
    const listener = vi.fn();
    s.subscribe(listener);
    expect(s.update({ x: 1 })).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("select() returns a stable projection until it changes", () => {
    const a = new StoreValue("idle");
    const b = new StoreValue<Set<string>>(new Set());
    const parent = new StoreValue({ a, b }, { doc: new Y.Doc(), name: "r" });
    const view = parent.select((s) => s.b);
    const first = view.getSnapshot();
    a.set("dragging");
    expect(view.getSnapshot()).toBe(first);
    b.set(new Set(["x"]));
    expect(view.getSnapshot()).not.toBe(first);
    expect(view.getSnapshot()).toEqual(new Set(["x"]));
  });
});

// ─── Lazy root binding ─────────────────────────────────────────────────────────

describe("lazy root binding", () => {
  it("an unbound store binds to a private doc on .doc access, preserving value", () => {
    const s = new StoreValue({ count: 1 });
    expect(s.value).toEqual({ count: 1 });
    expect(s.doc).toBeInstanceOf(Y.Doc);
    expect(s.value).toEqual({ count: 1 });
    const listener = vi.fn();
    s.subscribe(listener);
    s.set({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(s.value).toEqual({ count: 2 });
  });

  it("getYType() returns the backing shared type", () => {
    const s = new StoreValue({ a: 1 });
    expect(s.getYType()).toBeInstanceOf(Y.Map);
    const arr = new StoreValue([1, 2, 3]);
    expect(arr.getYType()).toBeInstanceOf(Y.Array);
  });

  it("dispose() tears down without throwing", () => {
    const s = bound({ x: 1 });
    expect(() => s.dispose()).not.toThrow();
  });
});
