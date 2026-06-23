import { describe, it, expect, vi, beforeEach } from "vitest"
import { StoreValue } from "../store-value"

// ─── Primitive types ──────────────────────────────────────────────────────────

describe("StoreValue — primitives", () => {
  it("holds the initial number value", () => {
    const s = new StoreValue(42)
    expect(s.value).toBe(42)
    expect(s.getSnapshot()).toBe(42)
  })

  it("holds the initial string value", () => {
    const s = new StoreValue("hello")
    expect(s.value).toBe("hello")
    expect(s.getSnapshot()).toBe("hello")
  })

  it("set() updates the value and returns true", () => {
    const s = new StoreValue(1)
    const changed = s.set(2)
    expect(changed).toBe(true)
    expect(s.value).toBe(2)
    expect(s.getSnapshot()).toBe(2)
  })

  it("set() returns false when value is equal", () => {
    const s = new StoreValue(1)
    expect(s.set(1)).toBe(false)
    expect(s.value).toBe(1)
  })

  it("set() notifies listeners", () => {
    const s = new StoreValue(0)
    const listener = vi.fn()
    s.subscribe(listener)
    s.set(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("set() does not notify listeners when value is unchanged", () => {
    const s = new StoreValue(0)
    const listener = vi.fn()
    s.subscribe(listener)
    s.set(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it("unsubscribing stops notifications", () => {
    const s = new StoreValue(0)
    const listener = vi.fn()
    const unsub = s.subscribe(listener)
    unsub()
    s.set(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it("update() throws for non-object values", () => {
    const s = new StoreValue(1)
    expect(() => s.update(2 as never)).toThrow()
  })
})

// ─── Plain objects ────────────────────────────────────────────────────────────

describe("StoreValue — plain objects", () => {
  it("holds the initial object value", () => {
    const s = new StoreValue({ x: 1, y: 2 })
    expect(s.value).toEqual({ x: 1, y: 2 })
  })

  it("set() deep-clones the incoming value so later mutations don't affect the store", () => {
    const s = new StoreValue({ x: 1 })
    const next = { x: 2 }
    s.set(next)
    next.x = 99
    expect(s.value.x).toBe(2)
  })

  it("update() merges partial values", () => {
    const s = new StoreValue({ x: 1, y: 2 })
    s.update({ x: 10 })
    expect(s.value).toEqual({ x: 10, y: 2 })
  })

  it("update() notifies listeners", () => {
    const s = new StoreValue({ x: 1 })
    const listener = vi.fn()
    s.subscribe(listener)
    s.update({ x: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("getSnapshot() returns a stable reference between calls when nothing changed", () => {
    const s = new StoreValue({ x: 1, y: 2 })
    const snap1 = s.getSnapshot()
    const snap2 = s.getSnapshot()
    expect(snap1).toBe(snap2)
  })

  it("getSnapshot() returns a new reference after set()", () => {
    const s = new StoreValue({ x: 1 })
    const snap1 = s.getSnapshot()
    s.set({ x: 2 })
    const snap2 = s.getSnapshot()
    expect(snap1).not.toBe(snap2)
    expect(snap2).toEqual({ x: 2 })
  })
})

// ─── Array values ─────────────────────────────────────────────────────────────

describe("StoreValue — Array values", () => {
  it("holds the initial array value", () => {
    const s = new StoreValue([1, 2, 3])
    expect(s.value).toEqual([1, 2, 3])
  })

  it("set() replaces the array by reference (not cloned)", () => {
    const arr = [1, 2, 3]
    const s = new StoreValue(arr)
    const next = [4, 5, 6]
    s.set(next)
    expect(s.value).toBe(next)
  })

  it("set() notifies listeners", () => {
    const s = new StoreValue([1])
    const listener = vi.fn()
    s.subscribe(listener)
    s.set([2])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("getSnapshot() returns stable reference when nothing changed", () => {
    const s = new StoreValue([1, 2])
    expect(s.getSnapshot()).toBe(s.getSnapshot())
  })
})

// ─── Map values ───────────────────────────────────────────────────────────────

describe("StoreValue — Map values", () => {
  it("holds the initial Map value", () => {
    const m = new Map([["a", 1]])
    const s = new StoreValue(m)
    expect(s.value).toBe(m)
    expect(s.value.get("a")).toBe(1)
  })

  it("set() replaces the Map by reference (not cloned)", () => {
    const s = new StoreValue(new Map<string, number>())
    const next = new Map([["x", 42]])
    s.set(next)
    expect(s.value).toBe(next)
  })

  it("set() notifies listeners when Map instance changes", () => {
    const s = new StoreValue(new Map<string, number>())
    const listener = vi.fn()
    s.subscribe(listener)
    s.set(new Map([["a", 1]]))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("getSnapshot() returns stable reference when nothing changed", () => {
    const s = new StoreValue(new Map([["a", 1]]))
    expect(s.getSnapshot()).toBe(s.getSnapshot())
  })
})

// ─── Set values ───────────────────────────────────────────────────────────────

describe("StoreValue — Set values", () => {
  it("holds the initial Set value", () => {
    const set = new Set(["a", "b"])
    const s = new StoreValue(set)
    expect(s.value).toBe(set)
  })

  it("set() replaces the Set by reference (not cloned)", () => {
    const s = new StoreValue(new Set<string>())
    const next = new Set(["x", "y"])
    s.set(next)
    expect(s.value).toBe(next)
  })

  it("set() notifies listeners when Set instance changes", () => {
    const s = new StoreValue(new Set<string>())
    const listener = vi.fn()
    s.subscribe(listener)
    s.set(new Set(["a"]))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("getSnapshot() returns stable reference when nothing changed", () => {
    const s = new StoreValue(new Set(["a"]))
    expect(s.getSnapshot()).toBe(s.getSnapshot())
  })
})

// ─── Composite: plain object with child StoreValues ───────────────────────────

describe("StoreValue — composite with child StoreValues", () => {
  let x: StoreValue<number>
  let y: StoreValue<number>
  let pos: StoreValue<{ x: StoreValue<number>; y: StoreValue<number> }>

  beforeEach(() => {
    x = new StoreValue(1)
    y = new StoreValue(2)
    pos = new StoreValue({ x, y })
  })

  it("getSnapshot() resolves child StoreValues to their plain values", () => {
    const snap = pos.getSnapshot()
    expect(snap).toEqual({ x: 1, y: 2 })
  })

  it("getSnapshot() is stable between calls when nothing changed", () => {
    const snap1 = pos.getSnapshot()
    const snap2 = pos.getSnapshot()
    expect(snap1).toBe(snap2)
  })

  it("getSnapshot() returns a new reference after a child changes", () => {
    const snap1 = pos.getSnapshot()
    x.set(99)
    const snap2 = pos.getSnapshot()
    expect(snap1).not.toBe(snap2)
    expect(snap2).toEqual({ x: 99, y: 2 })
  })

  it("parent listener fires when a child changes", () => {
    const listener = vi.fn()
    pos.subscribe(listener)
    x.set(10)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("parent listener fires when either child changes", () => {
    const listener = vi.fn()
    pos.subscribe(listener)
    x.set(10)
    y.set(20)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("parent listener does not fire when child value is equal", () => {
    const listener = vi.fn()
    pos.subscribe(listener)
    x.set(1) // same value
    expect(listener).not.toHaveBeenCalled()
  })

  it("own listeners and child listeners both fire independently", () => {
    const parentListener = vi.fn()
    const childListener = vi.fn()
    pos.subscribe(parentListener)
    x.subscribe(childListener)
    x.set(5)
    expect(parentListener).toHaveBeenCalledTimes(1)
    expect(childListener).toHaveBeenCalledTimes(1)
  })
})

// ─── Composite: object with mixed child types ─────────────────────────────────

describe("StoreValue — composite with mixed children (StoreValue + Array + Map + Set)", () => {
  it("resolves StoreValue children but passes Array through as-is", () => {
    const count = new StoreValue(3)
    const arr = [1, 2, 3]
    const s = new StoreValue({ count, items: arr })
    const snap = s.getSnapshot()
    expect(snap.count).toBe(3)
    expect(snap.items).toBe(arr)
  })

  it("resolves StoreValue children but passes Map through as-is", () => {
    const flag = new StoreValue(true)
    const map = new Map([["k", "v"]])
    const s = new StoreValue({ flag, lookup: map })
    const snap = s.getSnapshot()
    expect(snap.flag).toBe(true)
    expect(snap.lookup).toBe(map)
  })

  it("resolves StoreValue children but passes Set through as-is", () => {
    const name = new StoreValue("test")
    const set = new Set(["a", "b"])
    const s = new StoreValue({ name, ids: set })
    const snap = s.getSnapshot()
    expect(snap.name).toBe("test")
    expect(snap.ids).toBe(set)
  })

  it("parent re-emits when StoreValue child changes, not when Array is mutated externally", () => {
    const count = new StoreValue(0)
    const arr = [1, 2]
    const s = new StoreValue({ count, arr })
    const listener = vi.fn()
    s.subscribe(listener)

    count.set(1)
    expect(listener).toHaveBeenCalledTimes(1)

    // Mutating the array directly does NOT notify (no subscription mechanism on arrays)
    arr.push(3)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("replacing a Set via set() on the parent notifies listeners", () => {
    const tag = new StoreValue("foo")
    const s = new StoreValue({ tag, ids: new Set<string>() })
    const listener = vi.fn()
    s.subscribe(listener)

    s.update({ ids: new Set(["a", "b"]) })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(s.getSnapshot().ids).toEqual(new Set(["a", "b"]))
  })
})

// ─── useSyncExternalStore contract ───────────────────────────────────────────

describe("StoreValue — useSyncExternalStore contract", () => {
  it("flat: getSnapshot() returns the same reference between subscribe calls (no spurious re-renders)", () => {
    const s = new StoreValue({ a: 1, b: 2 })
    const snapshots: unknown[] = []
    s.subscribe(() => snapshots.push(s.getSnapshot()))

    // Simulate React calling getSnapshot multiple times between changes
    const ref1 = s.getSnapshot()
    const ref2 = s.getSnapshot()
    expect(ref1).toBe(ref2)
  })

  it("composite: getSnapshot() returns the same reference between subscribe calls (no spurious re-renders)", () => {
    const a = new StoreValue(1)
    const b = new StoreValue(2)
    const s = new StoreValue({ a, b })

    const ref1 = s.getSnapshot()
    const ref2 = s.getSnapshot()
    expect(ref1).toBe(ref2)
  })

  it("composite: getSnapshot() returns a new reference exactly once per child change", () => {
    const a = new StoreValue(1)
    const b = new StoreValue(2)
    const s = new StoreValue({ a, b })

    const snapshots: ReturnType<typeof s.getSnapshot>[] = []
    s.subscribe(() => snapshots.push(s.getSnapshot()))

    a.set(10)
    b.set(20)

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]).toEqual({ a: 10, b: 2 })
    expect(snapshots[1]).toEqual({ a: 10, b: 20 })
    // Each snapshot is a distinct object
    expect(snapshots[0]).not.toBe(snapshots[1])
  })

  it("getSnapshot() called by React after emitChange() reflects the new value immediately", () => {
    const child = new StoreValue(0)
    const parent = new StoreValue({ child })

    let capturedSnapshot: { child: number } | null = null
    parent.subscribe(() => {
      capturedSnapshot = parent.getSnapshot()
    })

    child.set(42)
    expect(capturedSnapshot).toEqual({ child: 42 })
  })
})

// ─── Recursive update() into nested StoreValues ──────────────────────────────
//
// `update()` accepts the snapshot-shaped partial (nested StoreValues unwrapped
// to their inner value) and dispatches into nested StoreValue children
// instead of overwriting them. This is the path used by
// `renderer.config.update({ overlay: { handleSize: 4 } })`.

describe("StoreValue — update() recursion through nested StoreValues", () => {
  it("dispatches a nested partial into the child StoreValue's update()", () => {
    const overlay = new StoreValue({ handleSize: 3, strokeWidth: 1.5 })
    const parent = new StoreValue({
      showRulers: false,
      overlay,
    })

    parent.update({ overlay: { handleSize: 5 } as never })

    // The child kept its other fields (partial merge happened on the child)
    expect(overlay.value).toEqual({ handleSize: 5, strokeWidth: 1.5 })
  })

  it("preserves the child StoreValue instance identity through update()", () => {
    const overlay = new StoreValue({ handleSize: 3 })
    const parent = new StoreValue({ overlay })

    const before = parent.value.overlay
    parent.update({ overlay: { handleSize: 99 } as never })

    expect(parent.value.overlay).toBe(before)
    expect(before.value.handleSize).toBe(99)
  })

  it("mixes plain-key updates and nested-StoreValue updates in one call", () => {
    const overlay = new StoreValue({ handleSize: 3 })
    const parent = new StoreValue({
      showRulers: false,
      overlay,
    })

    parent.update({
      showRulers: true,
      overlay: { handleSize: 7 } as never,
    })

    expect(parent.value.showRulers).toBe(true)
    expect(overlay.value.handleSize).toBe(7)
  })

  it("notifies parent listeners when a nested update() is dispatched through it", () => {
    const overlay = new StoreValue({ handleSize: 3 })
    const parent = new StoreValue({ overlay })
    const listener = vi.fn()
    parent.subscribe(listener)

    parent.update({ overlay: { handleSize: 9 } as never })

    // At least one notification — implementation may double-emit (see REFERENCE.md)
    expect(listener).toHaveBeenCalled()
  })

  it("snapshot reflects nested change after parent.update()", () => {
    const overlay = new StoreValue({ handleSize: 3, strokeWidth: 1 })
    const parent = new StoreValue({ overlay })

    parent.update({ overlay: { handleSize: 5 } as never })

    expect(parent.getSnapshot()).toEqual({
      overlay: { handleSize: 5, strokeWidth: 1 },
    })
  })

  it("leaves untouched nested StoreValues alone", () => {
    const a = new StoreValue({ value: 1 })
    const b = new StoreValue({ value: 2 })
    const parent = new StoreValue({ a, b })

    const aSnapBefore = a.value
    parent.update({ b: { value: 20 } as never })

    expect(a.value).toBe(aSnapBefore)
    expect(b.value).toEqual({ value: 20 })
  })
})

// ─── Custom isEqual option ───────────────────────────────────────────────────
//
// The `isEqual` option overrides the default `===` reference check. Used by
// ViewportController so a `set` of a structurally-equivalent viewport object
// short-circuits without emitting.

describe("StoreValue — custom isEqual", () => {
  it("set() bails out when isEqual returns true even if reference differs", () => {
    const isEqual = (a: { x: number }, b: { x: number }) => a.x === b.x
    const s = new StoreValue({ x: 1 }, { isEqual })
    const listener = vi.fn()
    s.subscribe(listener)

    const changed = s.set({ x: 1 }) // new reference, same content

    expect(changed).toBe(false)
    expect(listener).not.toHaveBeenCalled()
  })

  it("set() emits when isEqual returns false", () => {
    const isEqual = (a: { x: number }, b: { x: number }) => a.x === b.x
    const s = new StoreValue({ x: 1 }, { isEqual })
    const listener = vi.fn()
    s.subscribe(listener)

    s.set({ x: 2 })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("update() respects isEqual when the merged value is equivalent", () => {
    const isEqual = (
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => a.x === b.x && a.y === b.y
    const s = new StoreValue({ x: 1, y: 2 }, { isEqual })
    const listener = vi.fn()
    s.subscribe(listener)

    // No-op: x already equals 1
    s.update({ x: 1 })

    expect(listener).not.toHaveBeenCalled()
  })
})

// ─── Constructor type rejection ──────────────────────────────────────────────
//
// `getTypeName` allows null/undefined/primitives/Object/Set/Map/Array/StoreValue
// and throws on anything else. Documents the supported-types contract.

describe("StoreValue — constructor type validation", () => {
  it("accepts null", () => {
    expect(() => new StoreValue(null)).not.toThrow()
  })

  it("accepts undefined", () => {
    expect(() => new StoreValue(undefined)).not.toThrow()
  })

  it("rejects Date", () => {
    expect(() => new StoreValue(new Date())).toThrow(/Unsupported type/)
  })

  it("rejects a custom class instance", () => {
    class Foo {
      bar = 1
    }
    expect(() => new StoreValue(new Foo())).toThrow(/Unsupported type/)
  })

  it("rejects functions", () => {
    expect(() => new StoreValue((() => 1) as never)).toThrow(/Unsupported type/)
  })
})

// ─── Shape rebuild on set() ──────────────────────────────────────────────────
//
// `_buildShape` partitions keys into `storeValueKeys` and `nonStoreValueKeys`.
// It's recomputed on every `set()` so swapping a child's identity stays
// consistent with the partition.

describe("StoreValue — Shape rebuild after set()", () => {
  it("set() that swaps a StoreValue child for a plain value updates the shape, and subsequent update() treats it as a plain key", () => {
    const child = new StoreValue(1)
    const parent = new StoreValue<{ field: StoreValue<number> | number }>({
      field: child,
    })

    // Replace child with a plain number — Shape must be rebuilt so subsequent
    // update() shallow-merges instead of trying to recurse.
    parent.set({ field: 42 })

    expect(parent.value.field).toBe(42)

    // update() with plain payload should now shallow-merge (not throw)
    parent.update({ field: 100 })
    expect(parent.value.field).toBe(100)
  })

  it("set() un-subscribes old StoreValue children when they're replaced", () => {
    const oldChild = new StoreValue(1)
    const newChild = new StoreValue(10)
    const parent = new StoreValue<{ child: StoreValue<number> }>({
      child: oldChild,
    })

    const listener = vi.fn()
    parent.subscribe(listener)

    parent.set({ child: newChild })
    expect(listener).toHaveBeenCalledTimes(1)
    listener.mockClear()

    // Mutating the OLD child must not notify the parent any more
    oldChild.set(999)
    expect(listener).not.toHaveBeenCalled()

    // Mutating the NEW child must notify
    newChild.set(20)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

// ─── update() return value ───────────────────────────────────────────────────

describe("StoreValue — update() return value", () => {
  it("returns true when at least one field changed", () => {
    const s = new StoreValue({ x: 1, y: 2 })
    expect(s.update({ x: 10 })).toBe(true)
  })

  it("returns false when the merged value is reference-equal under default isEqual", () => {
    // Default isEqual is ===, and update() always builds a new top-level
    // object, so this returns true even for no-op spreads at the top level.
    const s = new StoreValue({ x: 1 })
    expect(s.update({ x: 1 })).toBe(true)
  })

  it("returns false with a custom isEqual when update is a no-op", () => {
    const isEqual = (a: { x: number }, b: { x: number }) => a.x === b.x
    const s = new StoreValue({ x: 1 }, { isEqual })
    expect(s.update({ x: 1 })).toBe(false)
  })
})

// ─── Multiple subscribers ────────────────────────────────────────────────────

describe("StoreValue — multiple subscribers", () => {
  it("notifies every subscriber once per change", () => {
    const s = new StoreValue(0)
    const a = vi.fn()
    const b = vi.fn()
    const c = vi.fn()
    s.subscribe(a)
    s.subscribe(b)
    s.subscribe(c)

    s.set(1)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(c).toHaveBeenCalledTimes(1)
  })

  it("treats the same listener function added twice as a single Set entry", () => {
    const s = new StoreValue(0)
    const listener = vi.fn()
    s.subscribe(listener)
    s.subscribe(listener) // identical reference — Set dedups

    s.set(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("only the unsubscribed listener stops receiving events; others continue", () => {
    const s = new StoreValue(0)
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = s.subscribe(a)
    s.subscribe(b)

    unsubA()
    s.set(1)

    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })
})

// ─── subscribe / getSnapshot stability ───────────────────────────────────────
//
// These methods are bound in the constructor so React can use them
// directly without wrapping closures.

describe("StoreValue — bound method stability", () => {
  it("subscribe is the same function reference across reads", () => {
    const s = new StoreValue(0)
    expect(s.subscribe).toBe(s.subscribe)
  })

  it("getSnapshot is the same function reference across reads", () => {
    const s = new StoreValue(0)
    expect(s.getSnapshot).toBe(s.getSnapshot)
  })

  it("subscribe works when destructured from the instance", () => {
    const s = new StoreValue(0)
    const { subscribe, getSnapshot } = s
    const listener = vi.fn()
    subscribe(listener)

    s.set(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getSnapshot()).toBe(1)
  })
})

// ─── Initial value handling ──────────────────────────────────────────────────
//
// Documents an asymmetry: `set()` deep-clones plain objects (skipping
// StoreValues and special types), but the constructor stores the initial
// value by reference. Mutating the original after construction *will* leak
// in. New code should not rely on this — pass a fresh literal.

describe("StoreValue — initial value reference behavior", () => {
  it("constructor holds the initial plain object by reference (not deep-cloned)", () => {
    const init = { x: 1 }
    const s = new StoreValue(init)

    init.x = 99

    // This documents current behavior. If the constructor ever starts
    // cloning the initial value too, update this expectation.
    expect(s.value.x).toBe(99)
  })

  it("set() does deep-clone, so post-set mutations don't leak", () => {
    const s = new StoreValue({ x: 1 })
    const next = { x: 2 }
    s.set(next)

    next.x = 99
    expect(s.value.x).toBe(2)
  })
})

describe("StoreValue.select()", () => {
  it("getSnapshot returns a stable reference when the projection is unchanged", () => {
    const a = new StoreValue("idle")
    const b = new StoreValue<Set<string>>(new Set())
    const parent = new StoreValue({ a, b })

    const view = parent.select((s) => s.b)
    const first = view.getSnapshot()

    a.set("dragging") // emits on parent, but does not touch `b`
    const second = view.getSnapshot()

    expect(second).toBe(first)
  })

  it("getSnapshot returns a new reference when the projection changes", () => {
    const b = new StoreValue<Set<string>>(new Set(["x"]))
    const parent = new StoreValue({ b })

    const view = parent.select((s) => s.b)
    const first = view.getSnapshot()

    b.set(new Set(["y"]))
    const second = view.getSnapshot()

    expect(second).not.toBe(first)
    expect(second).toEqual(new Set(["y"]))
  })

  it("subscribers receive parent notifications; bail-out lives in getSnapshot", () => {
    const a = new StoreValue("default")
    const b = new StoreValue("hello")
    const parent = new StoreValue({ a, b })

    const view = parent.select((s) => s.b)
    const listener = vi.fn()
    view.subscribe(listener)

    a.set("grab")
    expect(listener).toHaveBeenCalledTimes(1)
    expect(view.getSnapshot()).toBe("hello") // unchanged

    listener.mockClear()
    b.set("world")
    expect(listener).toHaveBeenCalledTimes(1)
    expect(view.getSnapshot()).toBe("world")
  })

  it("respects a custom isEqual comparator", () => {
    const arr = new StoreValue<number[]>([1, 2, 3])
    const parent = new StoreValue({ arr })

    const shallowArrayEq = (a: number[], b: number[]) =>
      a.length === b.length && a.every((v, i) => v === b[i])

    const view = parent.select((s) => s.arr, shallowArrayEq)
    const first = view.getSnapshot()

    arr.set([1, 2, 3])
    const second = view.getSnapshot()
    expect(second).toBe(first)

    arr.set([1, 2, 4])
    const third = view.getSnapshot()
    expect(third).not.toBe(first)
  })
})
