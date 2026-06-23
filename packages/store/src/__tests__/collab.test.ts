import { describe, it, expect, vi } from "vitest";
import * as Y from "yjs";
import { StoreValue, STORE_ORIGIN } from "../store-value";

/** Apply `from`'s full state onto `to` (simulates a sync provider delivering an
 * update). */
function sync(from: Y.Doc, to: Y.Doc) {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from));
}

// ─── Persistence reload / hydration from an already-populated doc ───────────────

describe("collab — hydration (document wins over the initial value)", () => {
  it("constructing on a populated doc adopts its data, ignoring the initial value", () => {
    const docA = new Y.Doc();
    const a = new StoreValue({ count: 5, tags: ["x"] }, { doc: docA, name: "s" });
    a.update({ count: 6 });

    // Persist -> reload: serialize docA, rebuild a fresh doc, construct anew.
    const docB = new Y.Doc();
    sync(docA, docB);
    const b = new StoreValue({ count: 0, tags: [] as string[] }, { doc: docB, name: "s" });

    expect(b.value).toEqual({ count: 6, tags: ["x"] });
  });

  it("hydrates a scalar / Set / Map root from the doc", () => {
    const docA = new Y.Doc();
    new StoreValue(42, { doc: docA, name: "n" });
    new StoreValue(new Set(["a", "b"]), { doc: docA, name: "set" });
    new StoreValue(new Map([["k", 1]]), { doc: docA, name: "map" });

    const docB = new Y.Doc();
    sync(docA, docB);
    expect(new StoreValue(0, { doc: docB, name: "n" }).value).toBe(42);
    expect(new StoreValue(new Set<string>(), { doc: docB, name: "set" }).value).toEqual(
      new Set(["a", "b"]),
    );
    expect(new StoreValue(new Map<string, number>(), { doc: docB, name: "map" }).value).toEqual(
      new Map([["k", 1]]),
    );
  });

  it("hydrates and tracks a nested child StoreValue from the doc", () => {
    const docA = new Y.Doc();
    const overlayA = new StoreValue({ size: 1, color: "red" });
    new StoreValue({ overlay: overlayA }, { doc: docA, name: "cfg" });

    const docB = new Y.Doc();
    sync(docA, docB);
    const b = new StoreValue(
      { overlay: new StoreValue({ size: 0, color: "" }) },
      { doc: docB, name: "cfg" },
    );
    expect(b.getSnapshot()).toEqual({ overlay: { size: 1, color: "red" } });

    // A edits the child; deliver to B; B's adopted child reflects it.
    overlayA.update({ size: 9 });
    sync(docA, docB);
    expect(b.getSnapshot()).toEqual({ overlay: { size: 9, color: "red" } });
  });
});

// ─── Conflict-free convergence ──────────────────────────────────────────────────

describe("collab — convergence across two docs", () => {
  it("array: concurrent appends merge (no clobber)", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new StoreValue<string[]>([], { doc: docA, name: "list" });
    const b = new StoreValue<string[]>([], { doc: docB, name: "list" });

    a.set(["a"]);
    b.set(["b"]);
    sync(docA, docB);
    sync(docB, docA);

    expect(a.value).toEqual(b.value); // converged to the same order
    expect(new Set(a.value)).toEqual(new Set(["a", "b"])); // both edits survived
  });

  it("object: concurrent edits to different keys both survive", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new StoreValue({ x: 0, y: 0 }, { doc: docA, name: "s" });
    sync(docA, docB);
    const b = new StoreValue({ x: 0, y: 0 }, { doc: docB, name: "s" });

    a.update({ x: 1 });
    b.update({ y: 2 });
    sync(docA, docB);
    sync(docB, docA);

    expect(a.value).toEqual({ x: 1, y: 2 });
    expect(b.value).toEqual({ x: 1, y: 2 });
  });

  it("Set: concurrent adds merge", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new StoreValue(new Set<string>(), { doc: docA, name: "set" });
    const b = new StoreValue(new Set<string>(), { doc: docB, name: "set" });

    a.set(new Set(["a"]));
    b.set(new Set(["b"]));
    sync(docA, docB);
    sync(docB, docA);

    expect(a.value).toEqual(new Set(["a", "b"]));
    expect(b.value).toEqual(new Set(["a", "b"]));
  });

  it("scalar: concurrent sets converge (last-writer-wins, deterministic)", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new StoreValue(0, { doc: docA, name: "n" });
    sync(docA, docB);
    const b = new StoreValue(0, { doc: docB, name: "n" });

    a.set(1);
    b.set(2);
    sync(docA, docB);
    sync(docB, docA);

    expect(a.value).toBe(b.value); // both converge to the same winner
    expect([1, 2]).toContain(a.value);
  });
});

// ─── Remote merges drive reactivity ─────────────────────────────────────────────

describe("collab — remote merges notify listeners", () => {
  it("a listener fires when a remote update is applied", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new StoreValue({ x: 0 }, { doc: docA, name: "s" });
    sync(docA, docB);
    const b = new StoreValue({ x: 0 }, { doc: docB, name: "s" });

    const l = vi.fn();
    b.subscribe(l);
    a.update({ x: 7 });
    sync(docA, docB);

    expect(l).toHaveBeenCalledTimes(1);
    expect(b.value).toEqual({ x: 7 });
  });

  it("a remotely-added object key appears in value and snapshot", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new StoreValue<Record<string, number>>({ x: 1 }, { doc: docA, name: "s" });
    sync(docA, docB);
    const b = new StoreValue<Record<string, number>>({ x: 1 }, { doc: docB, name: "s" });

    a.set({ x: 1, y: 2 });
    sync(docA, docB);
    expect(b.value).toEqual({ x: 1, y: 2 });
  });
});

// ─── Origin tagging (foundation for undo in M4) ─────────────────────────────────

describe("collab — local writes are origin-tagged", () => {
  it("local set() tags the transaction with STORE_ORIGIN", () => {
    const doc = new Y.Doc();
    const s = new StoreValue(0, { doc, name: "n" });
    let captured: unknown = "unset";
    (s.getYType() as Y.Map<unknown>).observe((_e, tx) => {
      captured = tx.origin;
    });
    s.set(1);
    expect(captured).toBe(STORE_ORIGIN);
  });

  it("a remote applyUpdate carries a different origin", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    new StoreValue(0, { doc: docA, name: "n" });
    sync(docA, docB);
    const b = new StoreValue(0, { doc: docB, name: "n" });

    const a = new StoreValue(0, { doc: docA, name: "n" });
    let captured: unknown = STORE_ORIGIN;
    (b.getYType() as Y.Map<unknown>).observe((_e, tx) => {
      captured = tx.origin;
    });
    a.set(5);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA), "remote");
    expect(captured).toBe("remote");
  });
});
