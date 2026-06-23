# StoreValue & the two modes

`StoreValue<T>` is the one primitive super-store exposes. It is a typed **handle** over a Yjs shared
type, and it operates in one of two modes:

- **unbound** — a plain in-memory value. Identical semantics to a normal in-memory store. This is the
  state for local-only stores and for children not yet adopted by a bound parent.
- **bound** — backed by a Yjs type inside a `Y.Doc`. Reads materialise from the doc, writes are a
  diff-and-patch inside one transaction, and reactivity is driven by Yjs `observeDeep`.

The surface is the same in both modes. You write code against `StoreValue`, and persistence, sync, and
undo/redo are opt-in behind that same surface.

```ts
import { StoreValue } from "@super-store/store"

const count = new StoreValue(0)   // unbound — a private, in-memory store
count.set(1)
count.getSnapshot()               // 1
```

## Unbound mode

An unbound `StoreValue` behaves exactly like an in-memory store: `set`/`update` mutate, `subscribe`
notifies, `getSnapshot` returns the current value. There is no doc, no transaction, no sync.

```ts
const profile = new StoreValue({ name: "Ada", admin: false })

const unsub = profile.subscribe(() => {
  console.log(profile.getSnapshot())
})

profile.update({ admin: true })   // logs { name: "Ada", admin: true }
unsub()
```

Use unbound stores for local-only UI state you never need to persist or share. They cost nothing extra:
no `Y.Doc` is created until the store binds.

## Bound mode

A `StoreValue` binds when it is backed by a `Y.Doc`. Reads then materialise from the doc and writes
become a diff-and-patch inside a single `doc.transact`. The same `set`/`update`/`subscribe`/`getSnapshot`
calls now drive a CRDT — so the store can be persisted, synced, and undone.

One bound-mode invariant matters in practice: **return value ⇔ emit ⇔ an actual change.** A
structurally-identical `set` is a no-op — it makes zero mutations, runs no transaction, fires no
listeners, and returns `false`. This differs from a naive in-memory store, which emits on any
reference-different `set`.

```ts
const shapes = new StoreValue({ a: 1 }, { name: "shapes", doc })

shapes.set({ a: 1 })   // false — structurally identical, no emit
shapes.set({ a: 2 })   // true  — changed, one transaction, listeners fire
```

## The lazy binding lifecycle

Binding is **lazy** and **cascades from the root**. You never bind a child directly — you bind a root,
and it pulls its descendants in.

### What triggers a root to bind

A root `StoreValue` binds the first time you do any of:

- inject a `doc` in the constructor (binds immediately on construction);
- access `.doc`;
- call `.getYType()`;
- call a sync method (`encodeState`, `applyUpdate`, `onUpdate`);
- enable undo (`{ undo: true }` or `enableUndo()`).

Until one of those happens, the root stays unbound and keeps a plain in-memory value. There is no
private `Y.Doc` allocated for an unbound store.

```ts
const board = new StoreValue({ count: 0 })   // unbound, no doc yet
board.set({ count: 1 })                       // still unbound

board.enableUndo()                            // <- binds now (lazy private doc)
board.doc                                     // already bound; returns that doc
```

### Cascade from the root

When a root binds, its nested `StoreValue` children bind too: each child's value is copied into a nested
Y type and its handle is **repointed** at that type. Instance identity is preserved — the same child
object you held before the bind is the same object after, now backed by the doc.

```ts
const x = new StoreValue(1)
const y = new StoreValue(2)
const pos = new StoreValue({ x, y })

pos.doc          // binds pos; x and y cascade-bind into pos's doc
pos.value.x      // still the same `x` instance — identity preserved
pos.value.x === x // true
```

### Compose first, bind later

Because binding cascades, you can build a tree of unbound `StoreValue`s and bind the whole thing later
by binding the root. Children are adopted into the root's doc on bind, identity intact.

```ts
const x = new StoreValue(1)
const y = new StoreValue(2)
const pos = new StoreValue({ x, y })   // x, y adopted into pos's doc on bind

pos.getSnapshot()   // { x: 1, y: 2 }
```

A consequence of "one Yjs node has one parent": a single nested `StoreValue` cannot live under two
parents. Adopt it into one tree.

## `value` vs `getSnapshot()`

These return two different shapes. Know which you want.

| | Returns | Nested `StoreValue` fields |
| --- | --- | --- |
| `get value` | the **handle tree** | stay `StoreValue` instances |
| `getSnapshot()` | the **unwrapped snapshot** | replaced by their plain values |

- `value` is the live handle tree. Nested children remain `StoreValue` instances, so you can read or
  write them individually (`pos.value.x.set(5)`).
- `getSnapshot()` is **fully unwrapped** — every nested `StoreValue<V>` is collapsed to its `V`. Its
  type is `InferStoreValueSnapshot<T>`. The result is cached and reference-stable: it is rebuilt only
  when the data actually changes, which is what lets React's `useSyncExternalStore` avoid tearing.

```ts
const x = new StoreValue(1)
const y = new StoreValue(2)
const pos = new StoreValue({ x, y })

pos.value.x          // StoreValue<number> — a handle
pos.value.x.set(5)   // write through the child handle

pos.getSnapshot()    // { x: 5, y: 2 } — plain values, no handles
```

Do not mutate the handle tree in place (`store.value.foo = x`). That was always a "don't" — the snapshot
goes stale — and in bound mode it also silently fails to converge. Always go through `set`/`update` (or a
child's `set`/`update`).

## Constructor options

```ts
new StoreValue(value, options?)
```

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `isEqual` | `(a: T, b: T) => boolean` | `Object.is` / `===` | Leaf equality used by the diff to decide whether a value changed. |
| `name` | `string` | — | Root key in the doc (and a debug name). **Required when you inject a `doc`.** |
| `debug` | `boolean` | `false` | Enable debug logging. |
| `doc` | `Y.Doc` | — | Inject to persist/sync. Omit for a lazy private doc. Binds the store immediately. |
| `undo` | `boolean \| { captureTimeout?: number }` | `false` | Enable undo/redo on this root. Binds the store. |

### Injecting a `doc` requires `name`

When you bring your own `Y.Doc` — to attach providers or share it across stores — you **must** pass
`name`. It is the key under which this store lives in that doc.

```ts
import * as Y from "yjs"

const doc = new Y.Doc()
const shapes = new StoreValue(initial, { doc, name: "shapes" })   // name required
```

For a private, lazily-created doc you do not need `name`:

```ts
const local = new StoreValue(initial)   // private doc allocated only if/when it binds
```

## `dispose()`

`dispose()` tears down the store's observers and, if the doc was a private one created by the store,
destroys it. Call it when a bound store goes out of scope to release resources.

```ts
const store = new StoreValue({ count: 0 }, { undo: true })
// ...use it...
store.dispose()   // tear down observers; destroy the private doc
```

If you injected your own `doc`, you own its lifecycle — `dispose()` releases the store's observers but
leaves your doc for you to destroy.
