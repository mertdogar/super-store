# Plan: `apps/synced-canvas` — a super-store collaboration showcase

A faithful port of super-line's `examples/synced-canvas-yjs`, with **only super-store**
at the app layer (zero `yjs` import) plus three super-store-native extras the original
couldn't show. super-line relays the opaque CRDT bytes super-store hands it.

> Status: planned. Built milestone-by-milestone (M1–M7), each verified
> (typecheck + lint + tests) and committed before the next.

## Thesis (what this proves)

The original syncs by relaying **Yjs update bytes** over super-line. super-store *is* Yjs
underneath, so the same wire works — but the app never sees it. The whole collaborative
canvas talks only to `StoreValue` + the `@super-store/react` hooks. "Yjs hidden" holds all
the way through collaboration — the one place it currently leaked.

## Package change (prerequisite): a 3-method sync surface on `StoreValue`

`@super-store/store` gains a thin, lazily-binding sync surface, all `Uint8Array`-based:

```ts
encodeState(): Uint8Array                  // → Y.encodeStateAsUpdate(this._doc)
applyUpdate(update: Uint8Array): void      // → Y.applyUpdate(this._doc, update, APPLY_ORIGIN)
onUpdate(cb: (update: Uint8Array, meta: { local: boolean }) => void): () => void
                                           // local = (origin !== APPLY_ORIGIN)
```

`local` means **"not injected via `applyUpdate`"** — so user edits (STORE_ORIGIN) *and*
undos (UndoManager origin) are `local:true` and get relayed; only applied remote merges are
`local:false`. This one definition makes the client echo-break, the server `server`/`peer`
tag, and undo-propagation all fall out. New tests: two-`StoreValue` convergence; `onUpdate`
local flag for set/update/applyUpdate/undo; `applyUpdate` triggers reactivity.

## Data model (verified by the M1 probe)

`StoreValue<Record<id, StoreValue<Shape>>>` — root `Y.Map` keyed by id (per-shape merge),
each shape a nested `StoreValue` → nested `Y.Map` (per-field merge). `Shape = { id, x, y,
color, label, order }`; z-order is the per-shape `order` field sorted at read (the ADR rule).

Helpers (confirmed against `set`/`_setKey`/`_updateBound`):
- add: `board.set({ ...board.value, [id]: new StoreValue(shape) })` (existing children keep identity)
- move: `board.value[id]?.update({ x, y })`  ·  front: `board.value[id]?.update({ order })`
- delete: `const next = { ...board.value }; delete next[id]; board.set(next)`
- read: `Object.values(board.getSnapshot()).sort((a, b) => a.order - b.order)`

## Architecture

| Piece | Role |
|---|---|
| `store.ts` | `Shape`, `board` factory, mutation helpers. Pure super-store. Replaces `crdt.ts`. |
| `contract.ts` | Unchanged from the original (`joinDoc`/`pushUpdate`/`serverNudge` + `update` w/ `origin`). |
| `b64.ts` | Unchanged — base64-wrap bytes for the JSON transport. |
| `sync.ts` | The only place bytes move: `onUpdate(local→push)`, `applyUpdate` on `update`/catch-up. No yjs. |
| `server.ts` | `StoreValue` per room; hydrate via `applyUpdate`; one `onUpdate` = fan-out + persist; `serverNudge` co-writes via `board.value[id].update`. `{local}` → `server`/`peer`. In-memory `Map` persistence via `encodeState`. |
| `App.tsx` | `useStore(board)` drives the board; `useStoreSelector` for shape count; unbound `StoreValue` for snap-to-grid; Undo/Redo buttons. |
| `DebugPanel` | Live JSON mirror (`useStore`) + patch log derived by diffing successive snapshots, tagged `local`/`peer`/`server` (catch-up tagged `sync`, skipped). |

## Extras (all three)
- Undo/redo — client `board` `{ undo: true }`; only local edits revert; undo propagates to peers.
- `useStoreSelector` — header "N shapes" re-renders on add/delete, not on every drag.
- Local-only unbound `StoreValue` — per-client snap-to-grid toggle, never synced.

## Deps / tooling / placement
- Location `apps/synced-canvas` (the `apps/*` workspace glob already exists).
- super-line `@super-line/{core,client,server,react,transport-websocket}: ^0.4.0` from npm (published).
- super-store via `workspace:*`. React 18.3. Vite + `@vitejs/plugin-react`, `tsx` server,
  `concurrently` dev. Vite `resolve.dedupe: ['react','react-dom']`. Ports 8788 (ws) / 5173.
  No StrictMode (one WS connection).

## Deltas vs the super-line original
1. App/server import no yjs; `StoreValue` + the sync surface replace the Yjs machinery.
2. Patch log is a snapshot diff, not native `observeDeep` events.
3. Same-shape concurrent edits merge per-field because each shape is a nested `StoreValue`.
4. Adds undo/redo, selector, and local-only state.

## Milestones (each: typecheck + lint + tests green, then commit)
1. Probe the data-model ergonomics → lock the helpers.
2. Package sync surface + tests + docs.
3. Scaffold the app; verify install resolves.
4. store/contract/sync/server — two tabs sync + persist + nudge.
5. App + DebugPanel.
6. Extras — undo/redo, selector, snap-to-grid.
7. README + final verify.
