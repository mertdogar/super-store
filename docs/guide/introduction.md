# Why super-store

Most state libraries make you choose up front. You write your app against a plain in-memory store,
and then the day you need real-time collaboration, offline persistence, or undo/redo, you discover the
only way to get them is to rewrite the state layer around a CRDT API — its document model, its
transactions, its observers leaking through every component.

super-store removes the choice. You keep writing in-memory-style state with `StoreValue<T>`. The CRDT
(Yjs) is already underneath, hidden, and each superpower is opt-in behind the same surface.

```ts
import { StoreValue } from "@super-store/store"

const counter = new StoreValue(0)
counter.set(counter.getSnapshot() + 1)
counter.subscribe(() => console.log(counter.getSnapshot()))
```

That is a complete, local, in-memory store. No doc, no sync, no Yjs in sight. Later, the same
`StoreValue` can persist, sync to other clients, and undo — without rewriting the lines above.

## Two modes, one surface

A `StoreValue` is a typed handle that operates in one of two modes:

| Mode | What it is | When |
| --- | --- | --- |
| **unbound** | A plain in-memory value with normal store semantics. | Local-only state, and children not yet adopted by a bound parent. |
| **bound** | Backed by a Yjs type inside a `Y.Doc`. Reads materialise from the doc; writes diff-and-patch in one transaction; reactivity comes from Yjs. | Once you persist, sync, or enable undo. |

You do not flip a global switch. Binding is **lazy** and cascades from the root: a root binds the
moment you inject a `doc`, first touch `.doc` / `.getYType()` / a sync method, or enable undo. Nested
children bind when their parent binds — their value is copied into a nested Y type and their handle
repointed, so instance identity is preserved.

The payoff: you compose first and bind later.

```ts
import { StoreValue } from "@super-store/store"

const x = new StoreValue(1)
const y = new StoreValue(2)
const pos = new StoreValue({ x, y }) // x and y are adopted into pos's doc on bind; identity preserved

pos.getSnapshot() // { x: 1, y: 2 }
```

## Yjs is hidden until you want it

The thesis is simple: **the CRDT is an implementation detail until you reach for it.**

Reading and writing are the same in both modes:

```ts
store.set(next)                 // diff-and-patch; true iff data actually changed
store.update({ partial })       // object stores: merge keys, recurse into child handles
store.subscribe(onChange)       // pre-bound; returns unsubscribe
store.getSnapshot()             // cached, reference-stable, fully unwrapped
```

When you do want collaboration or persistence, you have two routes — and only the first touches Yjs:

```ts
import * as Y from "yjs"
import { StoreValue } from "@super-store/store"

// Route 1: own the Y.Doc and attach any Yjs provider.
const doc = new Y.Doc()
const shapes = new StoreValue(initial, { doc, name: "shapes" })
```

```ts
// Route 2: relay the sync-surface bytes over your own transport — no yjs import.
store.onUpdate((update, { local }) => {
  if (local) bus.send({ update })          // push only your own edits
})
bus.on("update", ({ update }) => store.applyUpdate(update)) // merge a remote update
```

`encodeState()` gives you the full state as bytes to persist; `applyUpdate(bytes)` reloads them into a
fresh store. Your application code never imports `Y.*`.

## Before / after

Without super-store, bolting collaboration onto an in-memory store means a second, parallel state
layer:

```ts
// Before: in-memory store now, CRDT rewrite later.
let board = { shapes: {} }
const listeners = new Set<() => void>()
function setBoard(next) {
  board = next
  listeners.forEach((fn) => fn())
}
// ...and when collaboration is needed: rewrite every read/write against the CRDT's
// document model, transactions, and observers.
```

```ts
// After: the same store, collaboration is a constructor option.
import * as Y from "yjs"
import { StoreValue } from "@super-store/store"

const doc = new Y.Doc()
const board = new StoreValue({ shapes: {} }, { doc, name: "board" })

board.update({ shapes: { /* ... */ } })
board.subscribe(render)
// A remote merge re-renders exactly like a local update().
```

The reads and writes do not change. The superpowers slot in around them.

## When to use it

Use super-store when you want:

- **Real-time collaboration** — multiple clients editing shared state, reconciled conflict-free.
- **Offline / local-first persistence** — save bytes with `encodeState()`, reload with `applyUpdate()`.
- **Undo / redo** — opt in per root; only this store's own writes are tracked.
- **Optionality** — start local and in-memory, add any of the above later without a rewrite.

It is a good fit when you would otherwise reach for a plain reactive store but suspect you will need
one of these capabilities — now or eventually.

## When not to use it

- **You need `Date`, class instances, or functions in your state.** These throw at construction (Yjs
  would corrupt them); super-store is for plain, serialisable data.
- **You will never persist, sync, or undo.** A `StoreValue` works perfectly as a pure in-memory store,
  but if you are certain none of the CRDT capabilities will ever apply, a simpler store has less to it.
- **You need presence/awareness or schema migrations as first-class features.** These are out of scope
  in v1 (documented as recipes), not built-in surface.

## Next

Ready to build something. Continue to [Getting Started](/guide/getting-started).
