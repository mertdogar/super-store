# Undo / redo

Undo is **opt-in per root**. By default a store carries no undo history.

```ts
import { StoreValue } from "@super-store/store"

const doc = new StoreValue({ text: "" }, { undo: true })
doc.set({ text: "hello" })
doc.undo()           // back to { text: "" }
doc.redo()           // forward to { text: "hello" }
```

## Why opt-in

Yjs's `UndoManager` pins deleted content (so it can be restored) and disables garbage collection for the types it tracks. That keeps tombstoned data around for the lifetime of the manager — a real cost you should only pay where you actually need history. So super-store never enables it for you.

## Enabling it

Turn it on at construction, or later via `enableUndo()`:

```ts
const a = new StoreValue({ n: 0 }, { undo: true })

const b = new StoreValue({ n: 0 })
b.enableUndo()
```

Enabling undo binds the root to its doc (like any sync method or `.doc` access). It applies to the whole root, including nested `StoreValue` children.

## The API

| Member | Type | Description |
| --- | --- | --- |
| `undo()` | `void` | Revert the last tracked change. |
| `redo()` | `void` | Re-apply the last undone change. |
| `canUndo` | `boolean` | Whether there is anything to undo. |
| `canRedo` | `boolean` | Whether there is anything to redo. |
| `undoManager` | `Y.UndoManager \| null` | The raw Yjs manager; `null` until undo is enabled. |

```ts
const store = new StoreValue({ count: 0 }, { undo: true })

store.set({ count: 1 })
store.set({ count: 2 })

store.canUndo   // true
store.canRedo   // false

store.undo()    // { count: 1 }
store.redo()    // { count: 2 }
```

Guard your UI on `canUndo` / `canRedo` rather than tracking history yourself:

```ts
if (store.canUndo) store.undo()
```

## Only local edits are tracked

The manager tracks **only this store's own writes** — those tagged with `STORE_ORIGIN`. Edits merged in through `applyUpdate` (a peer's change, or persisted bytes loaded back) are **never** undone:

```ts
import { StoreValue, STORE_ORIGIN } from "@super-store/store"

const local = new StoreValue({ text: "" }, { undo: true })

local.set({ text: "mine" })           // tracked — undoable
local.applyUpdate(remoteUpdateBytes)  // a peer's edit — NOT in local's undo stack

local.undo()                          // reverts only "mine", leaves the remote edit intact
```

## Undo propagates to peers

An undo is just another write. It flows through the normal observer, so:

- the store's listeners fire and `getSnapshot()` refreshes,
- in a synced app the resulting update goes out over `onUpdate` with `meta.local === true`, exactly like a user edit.

So pressing undo on one client undoes the change for everyone, the same way the original edit reached them.

```ts
store.onUpdate((update, { local }) => {
  // local === true for user writes AND for undo()/redo()
  if (local) bus.send({ update })
})
```

## captureTimeout

Successive edits inside a short window are merged into one undo step. Tune the window with `captureTimeout` (milliseconds):

```ts
// one undo step per burst of edits within 300ms
const store = new StoreValue({ text: "" }, { undo: { captureTimeout: 300 } })

// same option via enableUndo:
const other = new StoreValue({ text: "" })
other.enableUndo({ captureTimeout: 300 })
```

A larger timeout groups more keystrokes into a single undo; a smaller one (down to `0`) makes each `set` its own step.

## A small example

```ts
import { StoreValue } from "@super-store/store"

type Doc = { title: string; body: string }

const doc = new StoreValue<Doc>(
  { title: "Untitled", body: "" },
  { undo: { captureTimeout: 500 } },
)

doc.set({ title: "Draft", body: "" })
doc.set({ title: "Draft", body: "First line." })

doc.canUndo          // true
doc.undo()           // body back to ""
doc.undo()           // title back to "Untitled"
doc.canUndo          // false
doc.canRedo          // true
doc.redo()           // title -> "Draft" again
```

Pair it with React by reading `canUndo` / `canRedo` from a snapshot-driven render and calling `undo()` / `redo()` from your toolbar handlers.
