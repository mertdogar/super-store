import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { StoreValue } from "../store-value";

/** Bidirectional sync of two docs to convergence (exchange full state both
 * ways; one round is enough for these small cases). */
function sync2(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
}

describe("document mode — field-level merge of nested objects", () => {
  it("DoD: concurrent edits to different fields of the same nested object both survive", () => {
    type El = { el: { x: number; color: string } };
    const a = new StoreValue<El, "document">({ el: { x: 1, color: "red" } }, { mode: "document" });
    const b = new StoreValue<El, "document">({} as never, { mode: "document" });
    b.applyUpdate(a.encodeState());

    // Document mode types update() as DeepPartial<T> — nested partial, no cast.
    a.update({ el: { x: 2 } });
    b.update({ el: { color: "blue" } });
    sync2(a.doc, b.doc);

    expect(a.getSnapshot()).toEqual({ el: { x: 2, color: "blue" } });
    expect(b.getSnapshot()).toEqual({ el: { x: 2, color: "blue" } });
  });

  it("whole-tree set() preserves a concurrent edit on an untouched sibling subtree", () => {
    const a = new StoreValue(
      { panel: { open: true }, sidebar: { width: 100 } },
      { mode: "document" },
    );
    const b = new StoreValue<{ panel: { open: boolean }; sidebar: { width: number } }, "document">(
      {} as never,
      { mode: "document" },
    );
    b.applyUpdate(a.encodeState());

    // A re-exports the WHOLE tree via set() (loadScene / re-export path),
    // changing only `panel`. B concurrently edits the untouched `sidebar`.
    a.set({ panel: { open: false }, sidebar: { width: 100 } });
    b.update({ sidebar: { width: 250 } });
    sync2(a.doc, b.doc);

    expect(a.getSnapshot()).toEqual({ panel: { open: false }, sidebar: { width: 250 } });
    expect(b.getSnapshot()).toEqual({ panel: { open: false }, sidebar: { width: 250 } });
  });

  it("set() reports change (so a sync layer relays the delta) for a deep grandchild edit", () => {
    const a = new StoreValue({ el: { transform: { x: 1 } } }, { mode: "document" });
    a.encodeState(); // force-bind
    expect(a.set({ el: { transform: { x: 2 } } })).toBe(true);
    expect(a.set({ el: { transform: { x: 2 } } })).toBe(false); // no-op
  });

  it("reads are plain JSON — no StoreValue or Y.* leaks", () => {
    const a = new StoreValue({ el: { nested: { deep: [1, 2] } } }, { mode: "document" });
    a.encodeState();
    const snap = a.getSnapshot();
    expect(snap).toEqual({ el: { nested: { deep: [1, 2] } } });
    expect(snap.el).not.toBeInstanceOf(StoreValue);
    expect(snap.el).not.toBeInstanceOf(Y.AbstractType);
  });
});

describe("document mode — opaque subtrees stay atomic (correctness, not perf)", () => {
  it("an opaque discriminated-union subtree does whole-value LWW, not field-merge", () => {
    const opaque = ["el.value"];
    type Doc = { el: { value: Record<string, unknown> } };
    const a = new StoreValue<Doc, "document">(
      { el: { value: { kind: "text", text: "hi" } } },
      { mode: "document", opaque },
    );
    const b = new StoreValue<Doc, "document">({} as never, { mode: "document", opaque });
    b.applyUpdate(a.encodeState());

    // Two peers switch the union to different variants. Field-merge would make a
    // Frankenstein {kind, text, src}. Opaque => one variant wins whole.
    a.update({ el: { value: { kind: "rect", w: 10 } } });
    b.update({ el: { value: { kind: "image", src: "u" } } });
    sync2(a.doc, b.doc);

    const va = a.getSnapshot().el.value;
    const vb = b.getSnapshot().el.value;
    expect(va).toEqual(vb); // converged
    // exactly one intact variant, never a merged blob
    expect([
      JSON.stringify({ kind: "rect", w: 10 }),
      JSON.stringify({ kind: "image", src: "u" }),
    ]).toContain(JSON.stringify(va));
  });
});
