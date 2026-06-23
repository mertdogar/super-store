---
name: super-store
description: >-
  Use when building with super-store — the reactive StoreValue primitive imported from
  @super-store/store (and the useStore / useStoreSelector hooks from @super-store/react). Triggers
  whenever code constructs a StoreValue handle, reads .value or getSnapshot(), writes via set() or
  update() (recursive diff-and-patch in one transaction), subscribes / selects for reactivity, or
  reaches for the sync surface (encodeState / applyUpdate / onUpdate) to add real-time collaboration
  or persistence WITHOUT importing yjs. Also use for the two backing modes (unbound in-memory vs bound
  Yjs CRDT, lazy binding from the root), nested StoreValue for per-field CRDT merge, opt-in undo/redo,
  the StoreValue→Yjs type mapping, and wiring stores into React with useSyncExternalStore. Applies even
  when the user never says "super-store" but is clearly using a StoreValue, getSnapshot/subscribe, or
  the encodeState/applyUpdate/onUpdate trio.
---

# super-store

A reactive `StoreValue<T>` backed by a Yjs CRDT. Same surface as an in-memory store; persistence,
real-time sync and undo/redo are opt-in behind it.

```ts
import { StoreValue, STORE_ORIGIN } from "@super-store/store"
import { useStore, useStoreSelector } from "@super-store/react"
```

Full signatures live in `REFERENCE.md`. Copy-paste patterns live in `RECIPES.md`. Docs:
https://mertdogar.github.io/super-store/ (append `.md` to any page; `llms.txt` / `llms-full.txt` at
the docs root).

## Mental model — read this first

A `StoreValue` is a typed HANDLE over a Yjs shared type. It has two modes:

- **unbound** — a plain in-memory value. Identical semantics to a normal in-memory store. This is the
  state of local-only stores and of children not yet adopted by a bound parent.
- **bound** — backed by a Y type inside a `Y.Doc`. Reads materialise from the doc; a write is a
  diff-and-patch inside one transaction; reactivity comes from Yjs `observeDeep`.

Binding is **lazy** and **cascades from the root**. A root binds the moment you inject a `doc` or
first touch `.doc` / `getYType()` / a sync method / enable undo. Nested children bind when their
parent binds — their value is copied into a nested Y type and their handle repointed, **preserving
instance identity**. So you can compose first and bind later:

```ts
const x = new StoreValue(1)
const y = new StoreValue(2)
const pos = new StoreValue({ x, y })   // x, y adopted into pos's doc on bind; identity preserved
pos.getSnapshot()                      // { x: 1, y: 2 }
```

Yjs is hidden. You never import `Y.*` to collaborate or persist — you exchange opaque update bytes
through the sync surface. The escape hatches (`.doc`, `getYType()`) exist only when you must wire a
provider.

## Quick reference (need → do)

| Need | Do |
| --- | --- |
| Local reactive value | `new StoreValue(initial)` |
| Read the current value (unwrapped) | `store.getSnapshot()` |
| Read the handle tree (nested stay StoreValue) | `store.value` |
| Replace state | `store.set(next)` |
| Patch some object keys | `store.update({ a: 1 })` (object stores only) |
| React to changes | `store.subscribe(fn)` → returns unsubscribe |
| Derive a slice | `store.select(s => s.x, isEqual?)` → `{ subscribe, getSnapshot }` |
| Per-field CRDT merge on a sub-object | make it a **nested `StoreValue`**, not a plain object |
| Persist / sync without yjs | `encodeState()`, `applyUpdate(bytes)`, `onUpdate(cb)` |
| Catch a peer up | send `encodeState()`; they call `applyUpdate(it)` |
| Push only local edits | `onUpdate((u, { local }) => { if (local) send(u) })` |
| Attach a provider (own the doc) | inject `{ doc, name }`, wire providers on that `Y.Doc` |
| Undo/redo | `{ undo: true }` or `enableUndo()`, then `undo()` / `redo()` |
| Read in React | `useStore(store)` |
| Read a slice in React | `useStoreSelector(store, sel, isEqual?)` |
| Tear down | `store.dispose()` |

## Rules

**ALWAYS**

- Go through `set()` / `update()` for every write. Mutating `store.value.foo = x` gives a stale
  snapshot, and in bound mode silently fails to converge.
- Make a sub-object its own nested `StoreValue` when it needs per-field CRDT merge. A plain nested
  object is stored opaquely (deep-cloned, wholesale-replaced) — concurrent edits to different fields
  clobber each other.
- Pass `store.subscribe` / `store.getSnapshot` by reference — they are pre-bound. Hand them straight
  to `useSyncExternalStore` (this is exactly what `useStore` does). Never wrap them.
- Use the `{ local }` flag to drive sync: push only `local` updates; never echo a remote merge.
- Provide `name` when you inject a `doc` — it's the required root key in that doc.
- Treat the result of `set` / `update` as truth in bound mode: return value ⇔ emit ⇔ an actual
  change. A structurally-identical `set` returns `false` and does not emit.

**NEVER**

- Clear-and-rewrite to "replace" state. `set()` already diffs and patches; a manual wipe tombstones
  every key, bloats the doc, and destroys merge. (`set` never clears-and-rewrites internally either.)
- Put `Date`, class instances, or functions in a store — they throw at construction.
- Parent one nested `StoreValue` under two stores — a Yjs node has exactly one parent.
- Expect a remote merge to be undoable. `applyUpdate` is tagged so undo never reverts it; only this
  store's own writes (tracked by `STORE_ORIGIN`) are undone.
- Call `update()` on a non-object store — it throws.

**PREFER**

- `select` / `useStoreSelector` over selecting in render — they re-run only when the slice changes
  under `isEqual`.
- A nested `StoreValue` keyed map (`Record<string, StoreValue<T>>`) for collaboratively-edited
  collections: the root Y.Map keys give per-item merge, each nested store gives per-field merge.
- Composing unbound and binding once at the root over binding eagerly everywhere.

## Pitfalls

- **Defaults first, then fill in.** With a provider, a bound store starts at the doc's current
  contents (empty/defaults) and updates reactively as sync arrives. Tolerate the initial render.
- **Document wins on join.** Binding to a doc that already holds data ignores your constructor's
  initial value and adopts the existing state.
- **No-op `set` is silent.** In bound mode a structurally-identical `set` returns `false` and emits
  nothing — unlike a naive in-memory store that emits on any reference-different set.
- **Object-keyed Set members / Map keys compare by content, not reference.**
- **Doc-init race.** Two peers constructing on an empty doc concurrently both seed it. For true
  concurrent first-write, seed server-authoritatively; sequential provider join is fine.
- **Out of scope (v1), see RECIPES.md:** schema migrations (additive-only, keep a `schemaVersion`
  field), doc compaction, and awareness/presence.

## ❌ → ✅

Mutating `.value` instead of writing through the store:

```ts
// ❌ stale snapshot; in bound mode never converges
store.value.count = store.value.count + 1

// ✅ one diff-and-patch transaction; emits iff data changed
store.update({ count: store.getSnapshot().count + 1 })
```

Plain nested object → no per-field merge:

```ts
// ❌ `style` is opaque: two peers editing fill vs stroke clobber each other
const shape = new StoreValue({ id, style: { fill: "red", stroke: "black" } })

// ✅ nested StoreValue → per-field CRDT merge, identity preserved across binds
const shape = new StoreValue({
  id,
  style: new StoreValue({ fill: "red", stroke: "black" }),
})
shape.getSnapshot() // { id, style: { fill: "red", stroke: "black" } }  (fully unwrapped)
```

Clear-and-rewrite to replace state:

```ts
// ❌ tombstones every key, bloats the doc, destroys merge
store.set({})
store.set(next)

// ✅ one call — set() diffs leaves, deletes absent keys, recurses changed subtrees
store.set(next)
```

Echoing remote merges back onto the wire:

```ts
// ❌ re-broadcasts updates you just received → echo storms
store.onUpdate((update) => bus.send({ update }))

// ✅ push only your own edits; meta.local is false for applyUpdate merges
store.onUpdate((update, { local }) => { if (local) bus.send({ update }) })
bus.on("update", ({ update }) => store.applyUpdate(update))
bus.on("join",   ({ snapshot }) => store.applyUpdate(snapshot)) // snapshot = encodeState()
```

Selecting in render instead of with a selector:

```ts
// ❌ component re-renders on every store change
const { x } = useStore(store)

// ✅ re-renders only when x changes under isEqual
const x = useStoreSelector(store, (s) => s.x)
```

Reaching for yjs to persist:

```ts
// ✅ no yjs import — save bytes, reload into a fresh store
localStorage.setItem("doc", btoa(String.fromCharCode(...store.encodeState())))
const fresh = new StoreValue(initial)
fresh.applyUpdate(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)))
```

Read `REFERENCE.md` for full signatures and the StoreValue→Yjs type mapping; `RECIPES.md` for
collaboration, persistence, undo, and React patterns.
