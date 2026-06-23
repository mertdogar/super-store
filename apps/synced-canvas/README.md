# synced-canvas (super-store)

A tiny collaborative canvas: **synced JSON state over [super-line](https://www.npmjs.com/package/@super-line/core), backed by a [super-store](../../packages/store) CRDT**. Multiple browser tabs edit the same board live; the server holds the canonical document, persists it, and can mutate it too.

It's a port of super-line's `synced-canvas-yjs` example with **only super-store** at the app layer — there is **no `import … from "yjs"` anywhere** in this app, even though the wire still carries a CRDT.

## What it demonstrates

- **super-store is the whole state layer.** The board is a `StoreValue`; the UI reads it through `useStore` / `useStoreSelector`. No hand-rolled `Y.Map` helpers.
- **Collaboration with no Yjs import.** The sync layer moves bytes with super-store's three sync methods — `encodeState()`, `applyUpdate()`, `onUpdate()` — and super-line relays them. The bytes are still a CRDT update encoding; the app just never sees `Y.*`.
- **Per-field CRDT merge.** Each shape is its **own nested `StoreValue`**, so one user dragging a shape while another recolors the *same* shape merges per field instead of clobbering.
- **The server is a co-writer.** "Server nudge" mutates the canonical board server-side via the same helpers the client uses; clients see it land tagged `server`.
- **Server-side persistence.** The document of record lives in an in-memory map on the server (swap for a file/DB/Redis) and survives a reload.
- **Undo/redo** (super-store, opt-in): only *your* edits revert — remote merges are never undone — and an undo propagates to peers like any edit.
- **Selective subscription:** a `useStoreSelector` shape-count re-renders only when the count changes, not on every drag (watch the "selector renders" counter hold steady while you drag).
- **Local-only state:** the snap-to-grid toggle is an **unbound** `StoreValue` that is never synced.
- **A debug side panel** mirrors the synced JSON live and logs recent patches — derived by diffing super-store snapshots — each tagged by origin (`local` / `peer` / `server`), so you can literally watch the server's nudge land as a `server` patch.

## Run

```bash
pnpm install                                              # from the repo root, once
pnpm --filter @super-store/example-synced-canvas dev
```

Open <http://localhost:5173> in **two windows**. Drag shapes, "Add shape", double-click to delete, hit "Server nudge", "Undo". Reload a tab — state persists on the server.

## How it works

| Piece | Role |
| --- | --- |
| `store.ts` | The board model: shapes as a keyed map of nested `StoreValue`s, with mutation helpers. Pure super-store — no super-line. |
| `contract.ts` | The super-line wire: `joinDoc` (catch-up snapshot), `pushUpdate` (client → server), `update` (server → clients). Carries base64 blobs only. |
| `sync.ts` | The **only** place bytes move: `board.onUpdate` pushes local edits; `board.applyUpdate` takes merges + the catch-up down. No yjs. |
| `server.ts` | A `StoreValue` per room (the same primitive as the client); one `onUpdate` is the single fan-out + persist point; `serverNudge` co-writes via the shared helpers. |
| `App.tsx` | Holds the board (`{ undo: true }`), drives the canvas with `useStore`, and renders the board + debug panel. |
| `patch-log.ts` | Derives the origin-tagged patch log by diffing successive super-store snapshots. |
| `origin.ts` | Threads the `local` / `peer` / `server` / `sync` tag from the app to the logger without Yjs origins. |

The echo-break: `board.onUpdate((bytes, { local }) => …)` reports `local: true` for this store's own writes (user edits **and** undo/redo) and `false` for updates applied from the wire — so only local edits are pushed, and merges are never echoed. On the server, that same flag distinguishes the co-writer (`server`) from a relayed client edit (`peer`).

## Differences from the super-line `synced-canvas-yjs` original

1. The app and server import **no yjs**; `StoreValue` + the sync surface replace the Yjs `Y.Map`/`observeDeep`/transaction-origin machinery.
2. The patch log is a **super-store snapshot diff**, not native `observeDeep` events.
3. Same-shape concurrent edits merge **per field** because each shape is a nested `StoreValue` (a plain object would be opaque / last-writer-wins).
4. Adds **undo/redo**, a **selector** render demo, and **local-only** UI state — none in the original.
