# Collaboration & persistence

A `StoreValue` is backed by a Yjs CRDT, so two stores reconcile by exchanging Yjs update bytes.
Collaboration and persistence are opt-in and live behind the same surface as a local store —
`set`, `update`, `subscribe`, `getSnapshot` work identically whether the store is unbound or bound.

There are two ways to move bytes between stores:

- **Path A — attach a Yjs provider.** You own the `Y.Doc`; inject it and wire providers
  (`y-websocket`, `y-indexeddb`, …) yourself.
- **Path B — relay bytes over your own transport.** Use the sync surface
  (`encodeState` / `applyUpdate` / `onUpdate`) and never import `yjs`.

Both produce the same Yjs update encoding on the wire.

## Path A — attach a Yjs provider

Inject a `doc`, then attach providers to it. Injecting a doc binds the store eagerly and
**requires a `name`** (the root key in the doc).

```ts
import * as Y from "yjs"
import { IndexeddbPersistence } from "y-indexeddb"
import { WebsocketProvider } from "y-websocket"
import { StoreValue } from "@super-store/store"

type Shape = { id: string; x: number; y: number }

const doc = new Y.Doc()
new IndexeddbPersistence("my-app", doc)        // offline cache
new WebsocketProvider(WS_URL, "room-1", doc)   // real-time sync

const shapes = new StoreValue<Record<string, Shape>>(
  {},
  { doc, name: "shapes" },                       // injecting a doc REQUIRES name
)
```

Reads start from whatever the doc currently holds — empty or defaults until a provider syncs —
then update reactively as bytes arrive. A remote merge fires listeners and refreshes the snapshot
exactly like a local `set()`.

> With a provider, tolerate the initial render: state starts at defaults and fills in as the doc
> syncs.

If you already have a private-doc store and just need to attach a provider, reach for `.doc`
(it lazily binds to a private doc on first access):

```ts
const store = new StoreValue({ count: 0 }, { name: "counter" })
new WebsocketProvider(WS_URL, "room-1", store.doc)
```

## Path B — relay bytes over your own transport

When you'd rather push bytes through your own channel (WebSocket, BroadcastChannel, an RPC bus),
use the sync surface. No `yjs` import anywhere.

```ts
import { StoreValue } from "@super-store/store"

const store = new StoreValue({ count: 0 }, { name: "counter" })

// Push only THIS store's own edits onto the wire.
const stop = store.onUpdate((update, { local }) => {
  if (local) bus.send({ update })
})

// Merge bytes from a peer.
bus.on("update", ({ update }) => store.applyUpdate(update))
```

Three methods carry the whole protocol:

| Method | Purpose |
| --- | --- |
| `encodeState(): Uint8Array` | Full state as one update — a catch-up snapshot, or bytes to persist. |
| `applyUpdate(update: Uint8Array): void` | Merge a peer or persisted update; drives reactivity. |
| `onUpdate(cb): () => void` | Observe outgoing updates; returns an unsubscribe function. |

### The `{ local }` echo-break

`meta.local` is **true** for updates this store produced — user writes *and* undo/redo — and
**false** for updates injected via `applyUpdate`. Push only local updates and you never echo a
remote merge back onto the wire.

```ts
store.onUpdate((update, { local }) => {
  if (!local) return        // ignore merges we just applied
  bus.send({ update })
})
```

### Catch-up on join

A late joiner needs the full state, not just the next delta. Send `encodeState()` as a snapshot and
apply it with `applyUpdate`:

```ts
// Existing peer answers a join with a snapshot.
bus.on("join", ({ peer }) => peer.send({ snapshot: store.encodeState() }))

// Newcomer catches up.
bus.on("snapshot", ({ snapshot }) => store.applyUpdate(snapshot))
```

`applyUpdate` is tagged so undo never reverts a merged update — a peer's edits stay out of your
local undo stack.

### Server as a co-writer

A server can hold a `StoreValue` too and participate as a co-writer. The same `{ local }` flag
distinguishes the server's own edits (true) from relayed client merges (false):

```ts
const board = new StoreValue<Record<string, Shape>>({}, { name: "board" })

board.onUpdate((update, { local }) => {
  if (local) broadcast({ update })            // the server's own co-writer edits
})

onClientUpdate((clientId, update) => {
  board.applyUpdate(update)                    // merge a client edit (local === false)
  broadcastExcept(clientId, { update })        // relay to the other clients
})

onClientJoin((clientId) => send(clientId, { snapshot: board.encodeState() }))
```

## Document wins on join

Binding to a doc that already holds data **ignores the constructor's initial value and adopts the
existing state**. This is what makes a late join correct: the newcomer's defaults never clobber the
shared document.

```ts
const doc = new Y.Doc()
Y.applyUpdate(doc, savedBytes)                 // doc already has shapes

// The {} initial value is ignored — `shapes` reads the doc's existing state.
const shapes = new StoreValue<Record<string, Shape>>({}, { doc, name: "shapes" })
```

The same holds for Path B: `applyUpdate(snapshot)` after construction adopts the snapshot's state.

## Persistence

`encodeState()` returns the full state as bytes; save them anywhere. To reload, construct a fresh
store and merge the bytes with `applyUpdate`.

```ts
// Save
const bytes = store.encodeState()
await fs.writeFile("state.bin", bytes)

// Reload into a fresh store
const restored = new StoreValue({ count: 0 }, { name: "counter" })
restored.applyUpdate(await fs.readFile("state.bin"))
```

For local-first persistence on the web, Path A with `y-indexeddb` keeps a doc cached across reloads
automatically.

## Caveat: the doc-init race

If two peers both construct on an *empty* doc concurrently, both seed it from their initial values.
For a true concurrent first write, use a **server-authoritative seed**: have one party (the server)
create and seed the doc, and let clients join an already-populated document — where *document wins on
join* takes over. Sequential join, the normal provider flow, is fine.

## Example

The [`synced-canvas`](https://github.com/mertdogar/super-store/tree/main/examples/synced-canvas)
example is a collaborative canvas built on Path B: clients relay sync-surface bytes over the wire,
and the server holds a `StoreValue` as a co-writer. The board is a
`StoreValue<Record<string, StoreValue<Shape>>>` — the root `Y.Map` keyed by id gives per-shape
merge, and each shape being a nested `StoreValue` gives per-field merge. It also wires up undo/redo
and a `useStoreSelector` render demo, with no `yjs` import in the app.
