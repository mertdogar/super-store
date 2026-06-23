# super-store recipes

End-to-end, best-practice patterns. Each recipe is short intro plus runnable TypeScript. Every
example uses only the public surface:

```ts
import { StoreValue, STORE_ORIGIN } from "@super-store/store"
import { useStore, useStoreSelector } from "@super-store/react"
```

## 1. A local-only store

Omit `doc` and the store stays **unbound** — a plain in-memory value with identical semantics to a
normal in-memory store. Nothing persists, nothing syncs. Use this for ephemeral UI state.

```ts
import { StoreValue } from "@super-store/store"

const grid = new StoreValue({ enabled: true, size: 16 })

grid.subscribe(() => {
  console.log("grid changed:", grid.getSnapshot())
})

grid.set({ enabled: true, size: 32 }) // true — data changed, listeners fire
grid.set({ enabled: true, size: 32 }) // still notifies in unbound mode

grid.getSnapshot() // { enabled: true, size: 32 } — cached, reference-stable
```

You can bind it later (inject a doc, call `enableUndo()`, touch `.doc`) without changing this code.

## 2. An object store with `update` + `select`

`update(partial)` is for **object stores only**: it merges plain keys in place instead of replacing
the whole value. `select(selector, isEqual?)` returns a `{ subscribe, getSnapshot }` pair whose
snapshot is memoised under `isEqual` — so a derived view only changes when its slice changes.

```ts
import { StoreValue } from "@super-store/store"

const user = new StoreValue({
  name: "Ada",
  email: "ada@example.com",
  prefs: { theme: "dark" },
})

// Merge one key — name and prefs are untouched.
user.update({ email: "ada@new.example.com" })

// A derived, memoised view of just the name.
const name = user.select((s) => s.name)
name.subscribe(() => console.log("name is now", name.getSnapshot()))

user.update({ prefs: { theme: "light" } }) // name view does NOT fire
user.update({ name: "Ada Lovelace" })       // name view fires once
```

`update` throws on non-object stores — use `set` for scalars, arrays, `Set`, and `Map`.

## 3. Nested StoreValue for per-field merge (keyed collection)

A plain nested object is stored **opaquely**: written as a deep clone and replaced wholesale, so
concurrent edits to two of its fields clobber each other. To get per-field CRDT merge, make the
sub-object a **nested `StoreValue`**. This is the canvas-board shape: a root map keyed by id (so two
peers adding different shapes merge), each value a nested `StoreValue` (so two peers editing
different fields of the same shape merge).

```ts
import { StoreValue, type Shape } from "@super-store/store"

type Board = Record<string, StoreValue<Shape>>

const board = new StoreValue<Board>({})

function addShape(id: string, shape: Shape) {
  // Add a keyed entry whose value is its own StoreValue → per-field merge.
  board.update({ [id]: new StoreValue(shape) })
}

addShape("a", { id: "a", x: 10, y: 10, w: 100, h: 60, fill: "#f00" })

// Edit one field of one shape — identity preserved, only x is patched.
board.value["a"].update({ x: 42 })

// Fully unwrapped snapshot — no StoreValue handles, safe to render.
board.getSnapshot() // { a: { id: "a", x: 42, y: 10, w: 100, h: 60, fill: "#f00" } }
```

`board.value` is the handle tree (children stay `StoreValue` instances); `board.getSnapshot()` is
fully unwrapped. A child change fires the child's listeners and the parent's.

## 4. Collaboration over your own transport

No `yjs` import. Peers reconcile by exchanging Yjs update bytes through the sync surface:
`onUpdate` (observe outgoing), `applyUpdate` (merge incoming), `encodeState` (a catch-up snapshot).

The echo-break is `meta.local`: it is `true` for updates this store produced (user writes and
undo/redo) and `false` for updates injected via `applyUpdate`. Push only local updates, and a merged
remote update is never echoed back.

### Client

```ts
import { StoreValue, type Shape } from "@super-store/store"

type Board = Record<string, StoreValue<Shape>>
const board = new StoreValue<Board>({}, { name: "board" })

// Push only our own edits onto the wire.
board.onUpdate((update, { local }) => {
  if (local) bus.send({ type: "update", update })
})

// Merge remote edits — these arrive with local:false, so they are never re-sent.
bus.on("update", ({ update }) => board.applyUpdate(update))

// Catch up a late joiner: the snapshot is just encodeState() bytes.
bus.on("snapshot", ({ snapshot }) => board.applyUpdate(snapshot))
```

### Server (a co-writer that holds a StoreValue too)

The server owns its own `StoreValue`. Relayed client merges arrive via `applyUpdate` (`local:false`);
the server's own edits are `local:true`. So the same `if (local)` rule lets the server broadcast its
own writes and relayed client writes without echoing a merge back to its sender.

```ts
import { StoreValue, type Shape } from "@super-store/store"

type Board = Record<string, StoreValue<Shape>>
const board = new StoreValue<Board>({}, { name: "board" })

// New client joined → send full state so it catches up.
function onJoin(socket: Socket) {
  socket.send({ type: "snapshot", snapshot: board.encodeState() })
}

// A client's bytes arrive → merge, then fan out to everyone else.
function onClientUpdate(from: Socket, update: Uint8Array) {
  board.applyUpdate(update)
  for (const s of sockets) if (s !== from) s.send({ type: "update", update })
}

// The server is also a co-writer; its own writes go out to all clients.
board.onUpdate((update, { local }) => {
  if (local) for (const s of sockets) s.send({ type: "update", update })
})

// Example server-authoritative write.
board.update({ cursor: new StoreValue({ id: "cursor", x: 0, y: 0, w: 0, h: 0, fill: "#000" }) })
```

## 5. Yjs provider injection (y-websocket + y-indexeddb)

If you'd rather own the `Y.Doc` and wire real Yjs providers, inject the doc. Injecting a doc
**requires `name`** (the root key in the doc). Reads start from whatever the doc holds (empty/defaults
until a provider syncs), then fill in reactively. **Document wins on join**: if the doc already holds
data, the constructor's initial value is ignored and the existing state is adopted.

```ts
import * as Y from "yjs"
import { IndexeddbPersistence } from "y-indexeddb"
import { WebsocketProvider } from "y-websocket"
import { StoreValue, type Shape } from "@super-store/store"

const WS_URL = "wss://example.com"

const doc = new Y.Doc()
new IndexeddbPersistence("my-app", doc)        // offline cache
new WebsocketProvider(WS_URL, "room-1", doc)   // live sync

type Board = Record<string, StoreValue<Shape>>
const board = new StoreValue<Board>({}, { doc, name: "board" })

board.subscribe(() => render(board.getSnapshot()))
```

You can also reach the doc on a lazily-bound store via `board.doc` (it binds to a private doc on
first access) and attach providers there.

## 6. Persistence: save and reload via `encodeState` / `applyUpdate`

`encodeState()` returns the full state as one update — persist those bytes anywhere. To reload,
construct a fresh store and feed the bytes back with `applyUpdate`.

```ts
import { StoreValue } from "@super-store/store"

// --- Save ---
const store = new StoreValue({ count: 0, items: ["a", "b"] }, { name: "doc" })
store.set({ count: 1, items: ["a", "b", "c"] })

const bytes: Uint8Array = store.encodeState()
await saveToDisk("doc.bin", bytes) // your storage

// --- Reload, later / elsewhere ---
const restored = new StoreValue({ count: 0, items: [] as string[] }, { name: "doc" })
restored.applyUpdate(await loadFromDisk("doc.bin"))

restored.getSnapshot() // { count: 1, items: ["a", "b", "c"] }
```

Because the bytes are merged (not replaced), you can `applyUpdate` several saved snapshots into one
store and they reconcile.

## 7. Undo / redo

Opt in per root — it's off by default because Yjs's `UndoManager` pins deleted content and disables
GC for tracked types. Only this store's own writes are tracked (tagged with `STORE_ORIGIN`); remote
merges via `applyUpdate` are never undone. An undo flows through the normal observer, so listeners
fire and the snapshot refreshes — and in a synced app it propagates to peers like any other edit.

```ts
import { StoreValue } from "@super-store/store"

// Enable at construction…
const doc = new StoreValue({ title: "Untitled" }, { undo: true })

// …or later, optionally with a coalescing window:
// doc.enableUndo({ captureTimeout: 500 })

doc.set({ title: "Draft" })
doc.set({ title: "Final" })

doc.canUndo // true
doc.undo()
doc.getSnapshot() // { title: "Draft" }

doc.redo()
doc.getSnapshot() // { title: "Final" }

doc.canRedo // false after the redo
```

`doc.undoManager` exposes the raw `Y.UndoManager` if you need it.

## 8. React: `useStore` + `useStoreSelector` selective re-render

`useStore` subscribes a component to the whole snapshot. `useStoreSelector` re-renders only when the
selected slice changes under `isEqual`. Pass the store's pre-bound `subscribe`/`getSnapshot` straight
through — never wrap them. Both hooks work identically against an unbound or a bound store: a remote
merge re-renders exactly like a local `set()`.

```tsx
import { StoreValue, type Shape } from "@super-store/store"
import { useStore, useStoreSelector } from "@super-store/react"

type Board = Record<string, StoreValue<Shape>>
const board = new StoreValue<Board>({}, { name: "board" })

// Re-renders on ANY board change.
function ShapeCount() {
  const snapshot = useStore(board)
  return <span>{Object.keys(snapshot).length} shapes</span>
}

// Re-renders only when this one shape's x changes.
function ShapeX({ id }: { id: string }) {
  const x = useStoreSelector(board, (s) => s[id]?.x)
  return <span>x = {x}</span>
}
```

`useStoreSelector` tolerates an unstable inline selector, so you can pass an arrow directly.

## 9. Migrations and compaction

These are out of scope for the core API (v1) and handled as recipes.

### Schema migrations (`schemaVersion`, additive-only)

Keep a `schemaVersion` field in the state and make only additive changes. On load, read the version
and bring old state forward with normal writes before the app reads it.

```ts
import { StoreValue } from "@super-store/store"

type AppState = {
  schemaVersion: number
  title: string
  tags?: string[] // added in v2
}

const CURRENT = 2

const store = new StoreValue<AppState>({ schemaVersion: CURRENT, title: "" }, { name: "app" })
store.applyUpdate(await loadFromDisk("app.bin"))

function migrate(s: StoreValue<AppState>) {
  const v = s.getSnapshot().schemaVersion
  if (v < 2) s.update({ tags: [], schemaVersion: 2 }) // additive
  // future: if (v < 3) ...
}

migrate(store)
```

### Doc compaction

Long-lived docs accumulate history. To compact, copy the current state into a fresh `Y.Doc` and bind
a new store to it.

```ts
import * as Y from "yjs"
import { StoreValue } from "@super-store/store"

function compact(doc: Y.Doc): Y.Doc {
  const fresh = new Y.Doc()
  Y.applyUpdate(fresh, Y.encodeStateAsUpdate(doc))
  return fresh
}

// Rebind onto the compacted doc.
const compacted = compact(oldStore.doc)
const store = new StoreValue(initial, { doc: compacted, name: "app" })
```
