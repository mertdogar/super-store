import { describe, it, expect, vi } from "vitest";
import * as Y from "yjs";
import { StoreValue } from "../store-value";

describe("undo — opt-in via constructor option", () => {
  it("undo() reverts the last change and redo() re-applies it", () => {
    const s = new StoreValue({ count: 0 }, { doc: new Y.Doc(), name: "s", undo: true });
    s.update({ count: 1 });
    s.update({ count: 2 });
    expect(s.value).toEqual({ count: 2 });

    s.undo();
    expect(s.value).toEqual({ count: 1 });
    s.undo();
    expect(s.value).toEqual({ count: 0 });

    s.redo();
    expect(s.value).toEqual({ count: 1 });
  });

  it("canUndo / canRedo reflect the stack state", () => {
    const s = new StoreValue(0, { doc: new Y.Doc(), name: "n", undo: true });
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    s.set(1);
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(false);
    s.undo();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(true);
  });

  it("undo() emits so listeners fire and the snapshot refreshes", () => {
    const s = new StoreValue({ x: 1 }, { doc: new Y.Doc(), name: "s", undo: true });
    s.set({ x: 2 });
    const l = vi.fn();
    s.subscribe(l);
    const snapBefore = s.getSnapshot();
    s.undo();
    expect(l).toHaveBeenCalledTimes(1);
    expect(s.getSnapshot()).not.toBe(snapBefore);
    expect(s.getSnapshot()).toEqual({ x: 1 });
  });

  it("captureTimeout 0 gives per-set undo steps", () => {
    const s = new StoreValue<string[]>([], { doc: new Y.Doc(), name: "l", undo: true });
    s.set(["a"]);
    s.set(["a", "b"]);
    s.undo();
    expect(s.value).toEqual(["a"]); // only the last set reverted
  });

  it("undo reverts a change to a nested child (root-scoped manager)", () => {
    const overlay = new StoreValue({ size: 1 });
    const parent = new StoreValue({ overlay }, { doc: new Y.Doc(), name: "cfg", undo: true });
    parent.update({ overlay: { size: 5 } as never });
    expect(overlay.value).toEqual({ size: 5 });
    parent.undo();
    expect(overlay.value).toEqual({ size: 1 });
    expect(parent.getSnapshot()).toEqual({ overlay: { size: 1 } });
  });
});

describe("undo — enableUndo() method", () => {
  it("can be enabled after construction (lazily binds an unbound store)", () => {
    const s = new StoreValue({ v: 1 });
    s.enableUndo();
    expect(s.doc).toBeInstanceOf(Y.Doc);
    s.update({ v: 2 });
    s.undo();
    expect(s.value).toEqual({ v: 1 });
  });

  it("is idempotent and exposes the raw UndoManager", () => {
    const s = new StoreValue(0, { doc: new Y.Doc(), name: "n" });
    s.enableUndo();
    const um = s.undoManager;
    s.enableUndo();
    expect(s.undoManager).toBe(um);
    expect(um).toBeInstanceOf(Y.UndoManager);
  });
});

describe("undo — defaults & boundaries", () => {
  it("undo()/redo() are no-ops and canUndo is false when not enabled", () => {
    const s = new StoreValue(0, { doc: new Y.Doc(), name: "n" });
    expect(s.canUndo).toBe(false);
    expect(s.undoManager).toBe(null);
    s.set(1);
    expect(() => s.undo()).not.toThrow();
    expect(s.value).toBe(1); // unchanged
  });

  it("remote (untracked-origin) changes are never undone", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new StoreValue({ x: 0, y: 0 }, { doc: docA, name: "s" });
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const b = new StoreValue({ x: 0, y: 0 }, { doc: docB, name: "s", undo: true });

    b.update({ x: 1 }); // local, tracked
    a.update({ y: 9 }); // remote
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    expect(b.value).toEqual({ x: 1, y: 9 });

    b.undo(); // reverts only the local x change
    expect(b.value).toEqual({ x: 0, y: 9 });
  });

  it("dispose() tears down the UndoManager", () => {
    const s = new StoreValue(0, { doc: new Y.Doc(), name: "n", undo: true });
    s.set(1);
    expect(() => s.dispose()).not.toThrow();
    expect(s.undoManager).toBe(null);
  });
});
