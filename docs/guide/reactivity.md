# Reactivity

A `StoreValue` is an external store: you subscribe to it, you read a snapshot, and you get notified
when the data changes. The reactivity surface is small and works identically whether the store is
unbound (local, in-memory) or bound (persisted/collaborative).

## subscribe and getSnapshot

```ts
import { StoreValue } from "@super-store/store"

const counter = new StoreValue({ count: 0 })

const unsubscribe = counter.subscribe(() => {
  console.log("changed:", counter.getSnapshot())
})

counter.set({ count: 1 }) // logs: changed: { count: 1 }
counter.set({ count: 1 }) // structurally identical -> no emit, nothing logged

unsubscribe()
```

- `subscribe(fn)` registers a listener and returns its unsubscribe function.
- `getSnapshot()` returns the current value, **fully unwrapped** — every nested `StoreValue` field
  is replaced by its plain value. Use `getSnapshot()` to read; use `.value` only when you need the
  live handle tree.

Both methods are **pre-bound in the constructor**. Pass them by reference — never wrap them:

```ts
// correct: pass the bound methods straight through
useSyncExternalStore(counter.subscribe, counter.getSnapshot)
```

## Why pre-bound and cached matters (tearing)

`getSnapshot()` is **cached and reference-stable**: it returns the same object reference until the
data actually changes, and only rebuilds the snapshot when it does. This is what lets React's
`useSyncExternalStore` avoid *tearing* — two reads during one render must return the same reference,
or React bails out and re-renders in a loop. Because the methods are pre-bound and the snapshot is
memoised, you can hand them directly to `useSyncExternalStore` (or the `useStore` hook) without
wrapping them in a `useCallback` or `useMemo`.

In bound mode the guarantee is exact: **return value ⟺ emit ⟺ an actual change**. A `set()` that
produces no structural diff is a no-op — it returns `false`, fires no listeners, and rebuilds no
snapshot.

## Own and child listeners

A change to a nested `StoreValue` fires that child's listeners **and** every ancestor's listeners,
so subscribing to a parent observes the whole subtree:

```ts
import { StoreValue } from "@super-store/store"

const x = new StoreValue(1)
const y = new StoreValue(2)
const pos = new StoreValue({ x, y })

pos.subscribe(() => console.log("pos:", pos.getSnapshot()))
x.subscribe(() => console.log("x:", x.getSnapshot()))

x.set(10)
// logs: x: 10
// logs: pos: { x: 10, y: 2 }
```

Subscribe at the level you care about: the root to track everything, a child to track just that
branch.

## emitChange

`emitChange()` forces a snapshot rebuild and notifies listeners without going through `set`/`update`.
You rarely need it — `set` and `update` already emit when (and only when) the data changes. Reach for
it only when something outside the normal write path requires listeners to re-read.

```ts
store.emitChange() // rebuild snapshot, notify subscribers
```

## select: derived, memoised reads

`select(selector, isEqual?)` returns a `{ subscribe, getSnapshot }` pair — the same shape as a store —
whose `getSnapshot` is memoised under `isEqual`. Listeners attached to the selection fire only when
the **selected** value changes, not on every store change.

```ts
import { StoreValue } from "@super-store/store"

const board = new StoreValue({
  shapes: { a: 1, b: 2, c: 3 },
  zoom: 1,
})

const count = board.select((s) => Object.keys(s.shapes).length)

const stop = count.subscribe(() => {
  console.log("shape count:", count.getSnapshot())
})

board.set({ shapes: { a: 1, b: 2, c: 3 }, zoom: 2 })
// zoom changed, but the selected count did not -> no log

board.set({ shapes: { a: 1, b: 2 }, zoom: 2 })
// logs: shape count: 2

stop()
```

The selector receives the **unwrapped snapshot** (the same value `getSnapshot()` returns). Pass a
custom `isEqual` when the selector returns a non-primitive that should be compared by content:

```ts
const ids = board.select(
  (s) => Object.keys(s.shapes),
  (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
)
```

Because the returned pair has the same `{ subscribe, getSnapshot }` shape, it drops straight into
`useSyncExternalStore` — though in React you'll normally use the `useStoreSelector` hook instead. See
[React](./react.md) for the hook equivalents.
