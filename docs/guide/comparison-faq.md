# Comparison & FAQ

How super-store relates to the tools you might reach for instead, and answers to the
questions that come up most often.

## Comparison

### vs. plain Yjs

With Yjs directly you hand-write the shared types and the observers:

```ts
import * as Y from "yjs"

const doc = new Y.Doc()
const pos = doc.getMap("pos")
pos.set("x", 1)
pos.set("y", 2)
pos.observeDeep(() => {
  render({ x: pos.get("x"), y: pos.get("y") })
})
```

You own the type mapping, the read/write code, and the observer wiring. super-store is a typed
handle over the same Yjs types: you write plain values and it does the diff-and-patch inside one
transaction for you.

```ts
import { StoreValue } from "@super-store/store"

const pos = new StoreValue({ x: 1, y: 2 })
pos.subscribe(() => render(pos.getSnapshot()))
pos.set({ x: 1, y: 3 }) // diff-and-patch in one transaction
```

You can still drop down to Yjs when you need to: `store.doc` and `store.getYType()` hand you the
underlying `Y.Doc` and shared type, and the [sync surface](#vs-a-provider) lets you move update
bytes without importing Yjs at all. super-store is a convenience layer, not a replacement — the
CRDT *is* Yjs.

### vs. valtio-yjs / syncedstore

Those bind a Yjs doc to a JavaScript **proxy**: you mutate the proxy in place and the library
traps the mutation. super-store is the opposite end of that trade-off — an **explicit handle**
with a `set` / `update` API and a `getSnapshot()` you read:

```ts
const store = new StoreValue({ count: 0 })

store.update({ count: 1 })       // explicit write
store.getSnapshot()              // explicit read: { count: 1 }

// in-place mutation is NOT supported:
store.value.count = 1            // don't — stale snapshot, and in bound mode it won't converge
```

Practical differences:

| | proxy stores | super-store |
| --- | --- | --- |
| writing | mutate in place | `set` / `update` |
| reading | read the proxy | `getSnapshot()` (cached, reference-stable) |
| React | varies per library | core is React-agnostic; `@super-store/react` is a thin layer |
| change signal | proxy traps | `subscribe()` + the `set`/`update` return value |

Because the core ships no React dependency, the same `StoreValue` works in a Node server (the
server can hold a store and be a co-writer) and in the browser unchanged.

### vs. a plain in-memory store / zustand

A plain store keeps state in memory and emits on every reference-different write. super-store
**mirrors that API** — construct with a value, `subscribe`, read a snapshot — but is backed by a
CRDT, so persistence, real-time sync, and undo/redo are all opt-in behind the same surface.

The only behavioral tweaks to keep in mind:

- A `set()` of a structurally-identical value is a **no-op** in bound mode: it returns `false` and
  does not emit. The invariant in bound mode is *return value ⇔ emit ⇔ an actual change*. A naive
  in-memory store emits on any reference-different set.
- With a provider attached, state starts at your defaults and **fills in as the doc syncs** —
  tolerate the initial render.
- Always write through `set` / `update`; never mutate `store.value` in place.

If you don't need persistence, collaboration, or undo, a plain store is simpler — reach for
super-store when you want those without changing how you read and subscribe. An **unbound**
`StoreValue` (no doc injected, no sync method called) behaves like a plain in-memory store, so you
can adopt it locally and turn on a backing doc later.

## FAQ

### Does super-store replace my state manager?

Not necessarily. It's a store primitive, not a full state-management framework. It covers the
"hold a value, subscribe, read a snapshot" shape and adds CRDT-backed persistence/sync/undo. If
your app's state already fits a single reactive value (or a tree of them), it can be your store.
If you rely on framework-specific features outside that shape, keep your manager and use
super-store for the slices that need collaboration or persistence.

In React, `useStore` is just:

```ts
import { useStore, useStoreSelector } from "@super-store/react"

function Counter({ store }) {
  const { count } = useStore(store) // useSyncExternalStore(store.subscribe, store.getSnapshot)
  return <span>{count}</span>
}

function CountLabel({ store }) {
  // re-renders only when the selected value changes under isEqual
  const count = useStoreSelector(store, (s) => s.count)
  return <span>{count}</span>
}
```

### What about SSR / the initial render?

`getSnapshot()` returns a cached, reference-stable snapshot rebuilt only when the data actually
changes, so `useSyncExternalStore` won't tear. Two things to expect:

- An **unbound** store renders its constructed value immediately — fine for SSR and the first
  client paint.
- With a **provider** attached, the bound store starts from whatever the doc currently holds
  (empty or your defaults) and fills in reactively as the provider syncs. Design the initial
  render to tolerate defaults; it re-renders when the real data arrives.

### Can I store `Date` or class instances?

No. `Date`, class instances, and functions **throw at construction** — the same as the in-memory
store, because Yjs would corrupt them. Store the primitive form instead (e.g. an ISO string or
epoch number for a date) and reconstruct the rich type in your view layer.

`Set`, `Map`, and `undefined` *are* supported — they round-trip through tagged sentinels.

### How do I do schema migrations?

Out of scope for v1, but there's a recipe: keep a `schemaVersion` field in the store and make only
**additive** changes.

```ts
const store = new StoreValue({
  schemaVersion: 2,
  title: "",
  tags: [], // added in v2 — additive, so old docs just read the default
})
```

Because a bound store **adopts the existing document on join** (document wins — the constructor
value is ignored when the doc already holds data), you can't rely on the constructor to backfill
new fields into an already-populated doc. Additive, default-safe fields keep old and new clients
interoperable.

### How do I compact a doc that has grown?

CRDTs accumulate history. To compact, copy the current state into a fresh `Y.Doc` via Yjs's own
encoding (this drops tombstones/history):

```ts
import * as Y from "yjs"

const fresh = new Y.Doc()
Y.applyUpdate(fresh, Y.encodeStateAsUpdate(doc))
```

Then bind a new `StoreValue` to `fresh`. This is a manual recipe, not a built-in operation.

### What's the doc-init race?

If two peers both construct on an **empty** doc concurrently, both seed it with their constructor
value, and the seeds merge. For true concurrent first-write, use a **server-authoritative seed**:
have one place create the initial state. The normal provider flow — a client joins, the doc syncs,
the client sees existing data and adopts it (document wins) — is sequential and fine.

### Does it handle awareness / presence (cursors, who's online)?

No — awareness/presence is out of scope for v1. The `StoreValue` API is for **document state**.
If you need presence, own a Yjs `Awareness` instance directly against the same `Y.Doc`:

```ts
const doc = store.doc // lazily binds to a private doc if you haven't injected one
// attach your provider and own a Y Awareness on `doc` yourself
```

Keep presence (ephemeral, per-connection) separate from the persisted state in your `StoreValue`.

### How do I sync without importing Yjs?

Relay the update bytes over your own transport with the sync surface:

```ts
store.onUpdate((update, { local }) => {
  if (local) bus.send({ update }) // push only your own edits
})
bus.on("update", ({ update }) => store.applyUpdate(update)) // merge remote
bus.on("join", ({ snapshot }) => store.applyUpdate(snapshot)) // snapshot = store.encodeState()
```

`meta.local` is `true` for updates this store produced (user writes and undo/redo) and `false`
for updates injected via `applyUpdate`, so your sync layer pushes only local updates and never
echoes a remote merge. For persistence, save `encodeState()` bytes and `applyUpdate(bytes)` into a
fresh store to reload.
