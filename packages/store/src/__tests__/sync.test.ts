import { describe, expect, it, vi } from "vitest";
import { StoreValue } from "../store-value";

// The sync surface: encodeState / applyUpdate / onUpdate. Moving CRDT bytes in
// and out of a store with no Yjs import — the basis for collaboration and
// persistence layered on top (see examples/synced-canvas).

describe("sync surface", () => {
  it("encodeState -> applyUpdate converges two stores", () => {
    const a = new StoreValue<Record<string, number>>({}, { name: "doc" });
    a.set({ x: 1, y: 2 });
    const b = new StoreValue<Record<string, number>>({}, { name: "doc" });
    b.applyUpdate(a.encodeState());
    expect(b.getSnapshot()).toEqual({ x: 1, y: 2 });
  });

  it("encodeState round-trips for persistence (reload into a fresh store)", () => {
    const live = new StoreValue<Record<string, number>>({}, { name: "doc" });
    live.set({ a: 10, b: 20 });
    const bytes = live.encodeState();

    const reloaded = new StoreValue<Record<string, number>>({}, { name: "doc" });
    reloaded.applyUpdate(bytes);
    expect(reloaded.getSnapshot()).toEqual({ a: 10, b: 20 });
  });

  it("applyUpdate drives reactivity (listeners fire, snapshot updates)", () => {
    const a = new StoreValue<Record<string, number>>({}, { name: "doc" });
    a.set({ x: 5 });
    const b = new StoreValue<Record<string, number>>({}, { name: "doc" });
    const listener = vi.fn();
    b.subscribe(listener);
    b.applyUpdate(a.encodeState());
    expect(listener).toHaveBeenCalled();
    expect(b.getSnapshot()).toEqual({ x: 5 });
  });

  it("onUpdate.local is true for writes and undo, false for applyUpdate", () => {
    const a = new StoreValue<Record<string, number>>({}, { name: "doc", undo: true });
    const flags: boolean[] = [];
    a.onUpdate((_u, { local }) => flags.push(local));

    a.set({ x: 1 }); // local user write

    const other = new StoreValue<Record<string, number>>({}, { name: "doc" });
    other.set({ y: 9 });
    a.applyUpdate(other.encodeState()); // applied remote merge

    a.undo(); // reverts the x:1 write

    expect(flags).toEqual([true, false, true]);
  });

  it("onUpdate unsubscribe stops delivery", () => {
    const a = new StoreValue<Record<string, number>>({}, { name: "doc" });
    const fn = vi.fn();
    const off = a.onUpdate(fn);
    a.set({ x: 1 });
    off();
    a.set({ x: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("onUpdate relay converges nested StoreValue children per-field", () => {
    type Board = Record<string, StoreValue<{ x: number; color: string }>>;
    const a = new StoreValue<Board>({}, { name: "shapes" });
    const b = new StoreValue<Board>({}, { name: "shapes" });
    // Two-way relay: push only local updates; applied merges are not echoed.
    a.onUpdate((u, { local }) => {
      if (local) b.applyUpdate(u);
    });
    b.onUpdate((u, { local }) => {
      if (local) a.applyUpdate(u);
    });

    a.set({ ...a.value, S: new StoreValue({ x: 0, color: "#000" }) });
    a.value["S"]!.update({ x: 100 }); // A moves
    b.value["S"]!.update({ color: "#f00" }); // B recolors the SAME shape

    expect(a.getSnapshot()["S"]).toEqual({ x: 100, color: "#f00" });
    expect(b.getSnapshot()).toEqual(a.getSnapshot());
  });
});
