import { describe, it, expect, vi } from "vitest";
import { createStore } from "../store";

describe("Store — composition via named roots", () => {
  it("mints independent named roots on one owned doc, no yjs import", () => {
    const store = createStore();
    const scene = store.root("scene", { title: "untitled", els: { a: { x: 1 } } }, { mode: "document" });
    const settings = store.root("settings", { theme: "dark" });

    expect(scene.getSnapshot()).toEqual({ title: "untitled", els: { a: { x: 1 } } });
    expect(settings.getSnapshot()).toEqual({ theme: "dark" });
    expect(store.doc).toBeDefined();
  });

  it("root() is idempotent per name — same handle, no double-bind", () => {
    const store = createStore();
    const a = store.root("scene", { x: 1 }, { mode: "document" });
    const b = store.root("scene", { x: 999 });
    expect(a).toBe(b);
    expect(a.getSnapshot()).toEqual({ x: 1 });
  });

  it("scoped reactivity — a change in one root does not notify another root's subscribers", () => {
    const store = createStore();
    const scene = store.root("scene", { x: 1 }, { mode: "document" });
    const settings = store.root("settings", { theme: "dark" });

    const sceneCb = vi.fn();
    const settingsCb = vi.fn();
    scene.subscribe(sceneCb);
    settings.subscribe(settingsCb);

    settings.update({ theme: "light" });
    expect(settingsCb).toHaveBeenCalled();
    expect(sceneCb).not.toHaveBeenCalled();
  });

  it("two peers sharing the wire converge; concurrent writes to different roots both survive", () => {
    const a = createStore();
    const aScene = a.root("scene", { title: "t" }, { mode: "document" });
    a.root("settings", { theme: "dark" }, { mode: "document" });

    const b = createStore();
    b.root("scene", {} as { title: string }, { mode: "document" });
    const bSettings = b.root("settings", {} as { theme: string }, { mode: "document" });
    b.applyUpdate(a.encodeState());

    // concurrent edits to DIFFERENT roots
    aScene.update({ title: "renamed" });
    bSettings.update({ theme: "light" });

    // exchange both ways
    b.applyUpdate(a.encodeState());
    a.applyUpdate(b.encodeState());

    expect(a.export()).toEqual({ scene: { title: "renamed" }, settings: { theme: "light" } });
    expect(b.export()).toEqual({ scene: { title: "renamed" }, settings: { theme: "light" } });
    expect(aScene.getSnapshot()).toEqual({ title: "renamed" });
    expect(bSettings.getSnapshot()).toEqual({ theme: "light" });
  });

  it("export() gathers all roots; load() routes each key back to its root", () => {
    const store = createStore();
    store.root("scene", { title: "a" }, { mode: "document" });
    store.root("settings", { theme: "dark" }, { mode: "document" });

    expect(store.export()).toEqual({ scene: { title: "a" }, settings: { theme: "dark" } });

    store.load({ scene: { title: "b" }, settings: { theme: "light" } });
    expect(store.export()).toEqual({ scene: { title: "b" }, settings: { theme: "light" } });
  });

  // NOTE: config-drift detection (different mode/opaque across peers) is NOT in
  // super-store — storing config in the synced doc breaks pure incremental relay
  // (clock-gap). It belongs in @super-line/store-sync's out-of-band handshake.
  // See DESIGN §4.2.

  it("onUpdate reports local vs applied so a sync layer can break echoes", () => {
    const a = createStore();
    a.root("scene", { x: 1 }, { mode: "document" });
    const b = createStore();
    const bScene = b.root("scene", {} as { x: number }, { mode: "document" });

    const locals: boolean[] = [];
    b.onUpdate((_u, meta) => locals.push(meta.local));

    b.applyUpdate(a.encodeState()); // remote merge -> local:false
    bScene.update({ x: 2 }); // own write -> local:true

    expect(locals).toContain(false);
    expect(locals).toContain(true);
  });
});
