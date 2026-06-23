# Getting started

super-store gives you one primitive — `StoreValue<T>` — that behaves like a plain in-memory store but is backed by a Yjs CRDT. You write to it the same way whether it's a local-only value or a fully synced, collaborative one. Persistence, real-time sync, and undo/redo are opt-in and live behind the same surface.

## Install

```bash
pnpm add @super-store/store          # yjs comes with it
pnpm add @super-store/react react    # for the hooks
```

`@super-store/store` has one runtime dependency (`yjs`) and no React. `@super-store/react` lists `@super-store/store` and `react >=18` as peer dependencies.

## A local counter

Start with a value. `new StoreValue(0)` is **unbound** — a plain in-memory store, no doc, no sync.

```ts
import { StoreValue } from "@super-store/store"

const count = new StoreValue(0)

const unsubscribe = count.subscribe(() => {
  console.log("count is now", count.getSnapshot())
})

count.set(1)   // logs "count is now 1" → returns true
count.set(2)   // logs "count is now 2" → returns true

unsubscribe()
```

Two methods carry the reactivity:

- `subscribe(fn)` registers a listener and returns an unsubscribe function.
- `getSnapshot()` returns the current value. It's cached and reference-stable — it only rebuilds when the data actually changes.

Both are **pre-bound** in the constructor, so you can pass them straight by reference (this is exactly what the React hooks do).

### No-op on equal

`set(value)` returns `true` only when the data actually changed. Setting the current value again is a no-op: no listeners fire, and it returns `false`.

```ts
const count = new StoreValue(2)

count.set(2)   // → false, no listeners fire
count.set(3)   // → true
```

This invariant — return value ⇔ change ⇔ emit — holds in bound mode too, where a structurally-identical `set` makes zero mutations.

## An object store

`StoreValue` holds objects just as well as scalars.

```ts
import { StoreValue } from "@super-store/store"

const user = new StoreValue({ name: "Ada", role: "admin", seats: 3 })

user.subscribe(() => console.log(user.getSnapshot()))

user.set({ name: "Ada", role: "admin", seats: 5 })
```

For partial changes, use `update` — it merges plain keys instead of replacing the whole value:

```ts
user.update({ seats: 5 })            // → { name: "Ada", role: "admin", seats: 5 }
user.update({ role: "owner" })       // → { name: "Ada", role: "owner", seats: 5 }
```

`update` is for **object stores only** and throws on non-object stores. Use `set` to replace a value wholesale; use `update` to merge keys.

## Nested children

A `StoreValue` field can itself be a `StoreValue`. Composing them keeps each child a live, independently-subscribable handle.

```ts
import { StoreValue } from "@super-store/store"

const x = new StoreValue(1)
const y = new StoreValue(2)
const pos = new StoreValue({ x, y })

pos.value.x.set(10)            // write through the child handle
pos.getSnapshot()             // { x: 10, y: 2 }
```

Two things to know:

- **`value` is the handle tree.** `pos.value.x` is the same `StoreValue` instance you passed in — read and write it directly.
- **`getSnapshot()` is fully unwrapped.** It returns plain data (`{ x: 10, y: 2 }`), with every nested `StoreValue` replaced by its value. The type is `InferStoreValueSnapshot<T>`.

A child change fires the child's listeners *and* the parent's:

```ts
pos.subscribe(() => console.log("pos changed", pos.getSnapshot()))
pos.value.x.set(20)           // logs "pos changed { x: 20, y: 2 }"
```

Why nest at all? In synced mode, each nested `StoreValue` becomes its own CRDT node, so concurrent edits to different fields merge. A plain nested object is stored opaquely and replaced wholesale — so reach for a nested `StoreValue` whenever you want per-field merge.

## Make it collaborative

Everything above runs locally with no doc. To persist or sync, you bind the store to a Yjs document — without changing how you read or write it. Two paths:

**Inject a doc** and wire your own Yjs providers:

```ts
import * as Y from "yjs"
import { StoreValue } from "@super-store/store"

const doc = new Y.Doc()
// attach providers (IndexedDB, WebSocket, …) to `doc` here
const user = new StoreValue({ name: "Ada", seats: 3 }, { doc, name: "user" })
```

Injecting a doc **requires** a `name` (the root key in the doc).

**Or relay bytes over your own transport** — no `yjs` import needed:

```ts
import { StoreValue } from "@super-store/store"

const store = new StoreValue({ name: "Ada", seats: 3 })

store.onUpdate((update, { local }) => {
  if (local) bus.send({ update })          // push only your own edits
})
bus.on("update", ({ update }) => store.applyUpdate(update))   // merge remote
```

The reactivity is identical: a remote merge fires listeners exactly like a local `set()`.

Next:

- [Collaboration & persistence](/guide/collaboration) — providers, the sync surface, and undo/redo.
- [React](/guide/react) — `useStore` and `useStoreSelector`.
