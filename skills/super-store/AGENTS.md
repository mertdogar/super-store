# super-store — agent guide

A reactive store primitive, `StoreValue<T>`, backed by a Yjs CRDT. It behaves like a normal
in-memory store, but underneath it can be persisted, synced for real-time collaboration, and
undone/redone — all opt-in, all behind the same surface. You write store code; you never import
Yjs. Full docs: https://mertdogar.github.io/super-store/ (append `.md` to any page; `llms.txt`
and `llms-full.txt` live at the docs root).

Packages:

```bash
pnpm add @super-store/store          # the primitive; yjs comes with it
pnpm add @super-store/react react    # the hooks (react >=18)
```

## Mental model: two backing modes

A `StoreValue` is a typed handle over a value with two modes:

- **unbound** — a plain in-memory value. Identical semantics to a normal store. This is the
  default and what local-only state uses.
- **bound** — backed by a Yjs type inside a `Y.Doc`. Reads materialise from the doc; writes are a
  diff-and-patch in one transaction; reactivity is driven by the doc.

Binding is **lazy** and cascades from the root. A root binds when you inject a `doc`, or first touch
`.doc` / `.getYType()` / a sync method, or enable undo. Children bind when their parent binds — their
value is copied into a nested Y type and their handle repointed, **preserving instance identity**.
So you can compose first and bind later:

```ts
import { StoreValue } from "@super-store/store"

const x = new StoreValue(1)
const y = new StoreValue(2)
const pos = new StoreValue({ x, y }) // x, y adopted into pos's doc on bind; identity preserved
pos.getSnapshot()                    // { x: 1, y: 2 }
```

## Quick reference: need → do

| Need | Do |
| --- | --- |
| Read the live handle tree (nested children stay `StoreValue`) | `store.value` |
| Read a fully-unwrapped, cached, reference-stable snapshot | `store.getSnapshot()` |
| Replace the value | `store.set(next)` → `boolean` (true iff data changed) |
| Merge into an object store (recurses into child handles) | `store.update(partial)` |
| React to changes | `const off = store.subscribe(fn)` |
| Derived/memoised read | `store.select(s => s.foo, isEqual?)` → `{ subscribe, getSnapshot }` |
| Persist to bytes / reload | `store.encodeState()` / `new StoreValue(...).applyUpdate(bytes)` |
| Sync over your own transport | `onUpdate` + `applyUpdate` (see below) |
| Attach a Yjs provider | inject `{ doc, name }` |
| Undo/redo | `{ undo: true }` or `enableUndo()`, then `undo()` / `redo()` |
| Force a snapshot rebuild + notify | `store.emitChange()` |
| Tear down | `store.dispose()` |

## Writes: `set` vs `update`

- `set(value)` replaces the value via a recursive diff-and-patch inside one transaction: it
  leaf-compares before writing, deletes absent keys, and recurses changed subtrees. A no-op diff
  makes zero mutations → no emit → returns `false`. In bound mode the invariant is **return value ⇔
  emit ⇔ an actual change**, so a structurally-identical `set` is a silent no-op (unlike an
  in-memory store that emits on any reference-different set).
- `update(partial)` is **object stores only**: it merges plain keys and recurses into nested
  `StoreValue` children in place, preserving identity. It throws on non-object stores.

```ts
const profile = new StoreValue({ name: "Ada", age: 36 })
profile.update({ age: 37 }) // merges; name untouched
profile.set({ name: "Ada", age: 37 }) // false — structurally identical, no emit
```

## Reactivity

`subscribe` and `getSnapshot` are pre-bound in the constructor — pass them straight by reference
(e.g. into `useSyncExternalStore`). Never wrap them. `getSnapshot()` returns a cached snapshot
rebuilt only when the data actually changes, so it is reference-stable and React won't tear. A child
change fires the child's listeners **and** the parent's.

```ts
const sel = store.select(s => s.items.length)
sel.subscribe(render)
sel.getSnapshot() // memoised under isEqual
```

## Type mapping & what to avoid

Scalars → a value-cell; plain objects → `Y.Map`; arrays → `Y.Array`; `Set`/`Map`/`undefined`
round-trip through tagged sentinels; nested `StoreValue` → nested Y type with identity preserved.

- Plain nested objects/arrays are stored **opaquely** (deep-cloned, wholesale-replaced). To get
  per-field CRDT merge on a sub-object, make it a **nested `StoreValue`**, not a plain object.
- `Date`, class instances, and functions **throw at construction**.
- `Set` members / `Map` keys that are objects are compared by **content**, not reference.

## Pitfalls

- Never mutate in place (`store.value.foo = x`) — it yields a stale snapshot and, when bound,
  silently fails to converge. Always go through `set` / `update`.
- One nested `StoreValue` cannot live under two parents.
- With a provider, state starts at defaults and **fills in as the doc syncs** — tolerate the
  initial render. **Document wins on join**: binding to a doc that already holds data ignores the
  constructor value and adopts existing state.
- Doc-init race: if two peers construct on an empty doc concurrently, both seed it — use a
  server-authoritative seed for true concurrent first-write. Sequential join is fine.

## Sync surface (no Yjs import)

Relay update bytes over any transport. `meta.local` is `true` for updates this store produced (user
writes **and** undo/redo) and `false` for updates injected via `applyUpdate` — so push only local
updates and never echo a remote merge.

```ts
const off = store.onUpdate((update, { local }) => {
  if (local) bus.send({ update }) // push only your own edits
})
bus.on("update", ({ update }) => store.applyUpdate(update))     // merge remote
bus.on("join",   ({ snapshot }) => store.applyUpdate(snapshot)) // catch up; snapshot = encodeState()
```

Or own the `Y.Doc` and attach providers yourself (injecting a `doc` **requires** `name`):

```ts
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"

const doc = new Y.Doc()
new WebsocketProvider(WS_URL, "room-1", doc)
const shapes = new StoreValue(initial, { doc, name: "shapes" })
```

## Undo / redo

Opt-in per root; off by default. Only this store's own writes are tracked (tagged by
`STORE_ORIGIN`); remote merges via `applyUpdate` are never undone. An undo flows through the normal
observer, so listeners fire and the snapshot refreshes; in a synced app it propagates to peers like
any edit.

```ts
const board = new StoreValue(initial, { undo: true })
board.set(next)
if (board.canUndo) board.undo()
if (board.canRedo) board.redo()
```

## React

```ts
import { useStore, useStoreSelector } from "@super-store/react"

function ItemCount({ store }: { store: StoreValue<{ items: string[] }> }) {
  const count = useStoreSelector(store, s => s.items.length) // re-renders only when the count changes
  return <span>{count}</span>
}

function Board({ store }: { store: StoreValue<Board> }) {
  const board = useStore(store) // = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return <Canvas board={board} />
}
```

Both work identically against an unbound (local) and a bound (collaborative/persisted) store: a
remote merge re-renders just like a local `set()`. `useStoreSelector` tolerates an unstable inline
selector.
