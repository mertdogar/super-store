# Examples

Runnable examples live in the repo under [`examples/`](https://github.com/mertdogar/super-store/tree/main/examples). Clone the repo, `pnpm install`, and run the one you want.

## synced-canvas

A tiny collaborative canvas: a board of draggable shapes synced live across browser tabs, with a server that persists the document and can mutate it as a co-writer. State is a `StoreValue`; the wire is [super-line](https://github.com/mertdogar/super-line) relaying the CRDT bytes super-store hands it — **with no `yjs` import anywhere in the app**.

It shows, in one place:

- a `StoreValue<Record<id, StoreValue<Shape>>>` driving the UI through `useStore`, with **per-field CRDT merge** (each shape is its own nested `StoreValue`);
- collaboration over a transport you own, using only `encodeState` / `applyUpdate` / `onUpdate`;
- a server that runs the **same** `StoreValue` primitive and acts as a co-writer;
- **undo/redo** (only your own edits revert), a `useStoreSelector` render demo, and **local-only** unbound state (snap-to-grid);
- a live debug panel: the synced JSON plus an origin-tagged patch log derived from snapshot diffs.

```bash
pnpm --filter @super-store/example-synced-canvas dev
```

Open <http://localhost:5173> in two windows.

→ [`examples/synced-canvas`](https://github.com/mertdogar/super-store/tree/main/examples/synced-canvas)
