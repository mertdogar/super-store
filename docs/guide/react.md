# useStore & useStoreSelector

`@super-store/react` is two hooks over a `StoreValue`. There is nothing to configure: a
`StoreValue` already exposes a pre-bound `subscribe`/`getSnapshot` pair, so the hooks are thin
wrappers over React's `useSyncExternalStore`.

## Install

```bash
pnpm add @super-store/react react
```

`@super-store/store` and `react >=18` are peer dependencies — install them alongside:

```bash
pnpm add @super-store/store @super-store/react react
```

## useStore

`useStore` subscribes a component to the whole store and returns its snapshot. The snapshot is
**fully unwrapped** — nested `StoreValue` fields are read as their plain values, not as handles.

```ts
import { StoreValue } from "@super-store/store"
import { useStore } from "@super-store/react"

const counter = new StoreValue({ count: 0 })

function Counter() {
  const { count } = useStore(counter)
  return (
    <button onClick={() => counter.set({ count: count + 1 })}>
      count: {count}
    </button>
  )
}
```

`useStore` is exactly:

```ts
function useStore<T>(store: StoreValue<T>): InferStoreValueSnapshot<T>
// = useSyncExternalStore(store.subscribe, store.getSnapshot)
```

Any `set`/`update` — or a remote merge via `applyUpdate`, or an `undo()`/`redo()` — re-renders the
component, because they all flow through the same observer.

## useStoreSelector

`useStore` re-renders whenever **any** part of the store changes. When a component only cares about
a slice, use `useStoreSelector` to subscribe to a derived value and re-render only when that value
changes.

```ts
function useStoreSelector<T, R>(
  store: StoreValue<T>,
  selector: (s: InferStoreValueSnapshot<T>) => R,
  isEqual?: (a: R, b: R) => boolean,
): R
```

The selector runs against the unwrapped snapshot. By default the result is compared with
`Object.is`; pass `isEqual` to compare derived objects/arrays by content so a new-but-equal result
doesn't trigger a render.

```ts
import { StoreValue } from "@super-store/store"
import { useStoreSelector } from "@super-store/react"

const board = new StoreValue({
  title: "Sprint",
  shapes: { a: { x: 0 }, b: { x: 10 } },
})

function ShapeCount() {
  // only re-renders when the number of shapes changes
  const count = useStoreSelector(board, (s) => Object.keys(s.shapes).length)
  return <span>{count} shapes</span>
}
```

### Why a selector avoids re-renders

A scalar selector re-renders only when its value changes. The render-count demo below proves it:
bumping `title` re-renders the component that reads the title, but not the one that selects
`shapes` length.

```ts
import { useRef } from "react"
import { StoreValue } from "@super-store/store"
import { useStore, useStoreSelector } from "@super-store/react"

const board = new StoreValue({
  title: "Sprint",
  shapes: { a: { x: 0 }, b: { x: 10 } },
})

function Title() {
  const renders = useRef(0)
  renders.current++
  const { title } = useStore(board)
  return <p>title: {title} · renders: {renders.current}</p>
}

function ShapeCount() {
  const renders = useRef(0)
  renders.current++
  const count = useStoreSelector(board, (s) => Object.keys(s.shapes).length)
  return <p>{count} shapes · renders: {renders.current}</p>
}

// board.set({ ...board.getSnapshot(), title: "Backlog" })
//   -> Title re-renders, ShapeCount does NOT (its selected value is unchanged)
```

### Custom isEqual for derived objects

A selector that returns a fresh object or array changes reference on every render. Pass `isEqual`
to compare by content, so the component re-renders only on a real change:

```ts
import { useStoreSelector } from "@super-store/react"

const ids = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i])

function ShapeIds() {
  const list = useStoreSelector(
    board,
    (s) => Object.keys(s.shapes),
    ids,
  )
  return <ul>{list.map((id) => <li key={id}>{id}</li>)}</ul>
}
```

`useStoreSelector` is `useSyncExternalStoreWithSelector` under the hood: it re-renders only when
`selector(snapshot)` changes under `isEqual`, and it tolerates an unstable inline selector — you do
not need to memoise the selector function.

## The snapshot-stability contract

`getSnapshot()` returns a **cached, reference-stable** snapshot. It is rebuilt only when the data
actually changes, so repeated calls during a render return the same reference and
`useSyncExternalStore` never tears.

This relies on `subscribe` and `getSnapshot` being the store's own pre-bound methods. **Pass them
straight through — never wrap them.** Wrapping (e.g. `() => store.getSnapshot()`) returns a new
function and, if it transforms the result, a new reference every call, which defeats the cache and
can loop the render.

```ts
// Good — the hooks pass the pre-bound methods through for you
const snap = useStore(store)

// Bad — wrapping breaks reference stability
const snap = useSyncExternalStore(
  () => store.subscribe(() => {}),   // new fn each render
  () => ({ ...store.getSnapshot() }), // new object each call -> tearing / loops
)
```

If you ever reach for `useSyncExternalStore` directly, pass `store.subscribe` and
`store.getSnapshot` by reference — that is all `useStore` does.

## Bound or unbound — same hooks

The hooks don't know or care whether the store is backed by a Yjs doc. An unbound, local-only store
and a bound, collaborative/persisted store drive the hooks identically: a remote merge
(`applyUpdate`) re-renders exactly like a local `set()`.

```ts
// Local-only — no doc, no sync. Works with the same hooks.
const local = new StoreValue({ snapToGrid: true })

// Collaborative — bound to a doc. Same hooks, same code.
import * as Y from "yjs"
const shared = new StoreValue({ snapToGrid: true }, { doc: new Y.Doc(), name: "prefs" })
```

```ts
function Toggle({ store }: { store: StoreValue<{ snapToGrid: boolean }> }) {
  const { snapToGrid } = useStore(store)
  return (
    <input
      type="checkbox"
      checked={snapToGrid}
      onChange={(e) => store.set({ snapToGrid: e.target.checked })}
    />
  )
}
```

## Initial render with a provider

When a store is bound to a doc that syncs over a provider, reads start from whatever the doc
currently holds — empty or your defaults — and **fill in reactively** as the provider syncs. The
first render shows defaults; a re-render follows once data arrives. Design components to tolerate
that initial state (for example, render an empty list rather than assuming content is present).

```ts
function Shapes({ store }: { store: StoreValue<{ shapes: Record<string, { x: number }> }> }) {
  const { shapes } = useStore(store)
  const ids = Object.keys(shapes)
  if (ids.length === 0) return <p>Loading…</p> // defaults until the provider syncs
  return <ul>{ids.map((id) => <li key={id}>{id}</li>)}</ul>
}
```
