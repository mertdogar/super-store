# Writes: set & update

A `StoreValue` has exactly two write methods: `set` replaces the whole value, `update` merges into
an object store. Both run as a single transaction and both return a boolean that tells you whether
anything actually changed.

```ts
import { StoreValue } from "@super-store/store"

const count = new StoreValue(0)
count.set(1)        // true  — value changed
count.set(1)        // false — identical, no change
```

## `set(value)`

`set` replaces the store's value. It does **not** clear-and-rewrite — it runs a recursive
diff-and-patch inside one `doc.transact`:

- leaf-compare before writing (using the store's `isEqual`),
- delete keys that are absent in the new value,
- recurse into changed subtrees only.

```ts
const profile = new StoreValue({ name: "Ada", role: "admin", age: 36 })

profile.set({ name: "Ada", role: "admin", age: 37 })
// only `age` is patched — `name` and `role` are untouched
```

Why never clear-and-rewrite? In bound mode, deleting and re-inserting every key tombstones each one,
bloats the doc (~40x), and destroys merge — concurrent edits would conflict where they should have
reconciled cleanly. Diffing keeps the underlying CRDT minimal and mergeable.

## `update(partial)` — object stores only

`update` is a shallow-ish merge for **object** stores. It merges plain keys and recurses into nested
`StoreValue` children **in place**, preserving their instance identity. It throws on non-object
stores.

```ts
const x = new StoreValue(1)
const y = new StoreValue(2)
const pos = new StoreValue({ x, y, label: "p0" })

pos.update({ label: "origin", x: 0 })
// `label` replaced; `x` (a child handle) updated in place — still the same StoreValue instance
pos.getSnapshot() // { x: 0, y: 2, label: "origin" }
```

The difference from `set`: `update` only touches the keys you pass and leaves the rest alone, while
`set` reconciles the entire value (and removes keys you omit).

```ts
const store = new StoreValue({ a: 1, b: 2 })

store.update({ a: 9 })           // { a: 9, b: 2 } — b untouched
store.set({ a: 9 } as any)       // set takes a full value; b is omitted → { a: 9 }
```

Calling `update` on a non-object store throws:

```ts
const n = new StoreValue(0)
n.update(1) // ❌ throws — update is object-only
```

## The return ⟺ emit ⟺ change invariant

In bound mode the rule is exact:

> **a truthy return ⟺ a change emit ⟺ the data actually changed.**

A `set` (or `update`) whose diff is empty makes zero mutations — so there is no transaction, no
`subscribe` notification, and the call returns `false`.

```ts
const store = new StoreValue({ x: 1, y: 2 })

const changed = store.set({ x: 1, y: 2 })
// changed === false — structurally identical, no emit, no snapshot rebuild
```

This is the one deliberate difference from a naive in-memory store, which emits on any
reference-different `set` even when the contents are equal. With `StoreValue`, a structurally
identical write is a guaranteed no-op:

```ts
let renders = 0
store.subscribe(() => renders++)

store.set({ x: 1, y: 2 }) // no-op → renders stays 0
store.set({ x: 1, y: 3 }) // real change → renders becomes 1
```

Lean on this: you can re-`set` the same value freely without triggering spurious re-renders or
syncing redundant bytes to peers.

## Always go through `set` / `update` — never mutate `.value`

`.value` is the handle tree, not a mutable draft. Assigning into it was always a footgun in the
in-memory store (you get a stale snapshot), and in bound mode it *also* silently fails to
converge — the mutation never reaches the underlying CRDT, so it won't persist, sync, or undo.

```ts
const store = new StoreValue({ x: 1, y: 2 })

// ❌ in-place mutation — stale snapshot, no emit, never converges
store.value.x = 5
store.getSnapshot() // still { x: 1, y: 2 }
```

```ts
// ✅ go through set/update — diffs, emits, persists, syncs
store.set({ ...store.getSnapshot(), x: 5 })
// or, for an object store:
store.update({ x: 5 })
store.getSnapshot() // { x: 5, y: 2 }
```

The rule is unconditional: **every write goes through `set` or `update`.** Reach for `update` when
you're patching a few keys of an object store and want to preserve child-handle identity; reach for
`set` when you're replacing the whole value (including removing keys).
