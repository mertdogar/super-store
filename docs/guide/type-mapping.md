# Type mapping

In bound mode a `StoreValue<T>` is a typed handle over a Yjs shared type. Reads materialise the
plain value out of the doc; writes diff-and-patch it back in. The kind of `T` decides which Yjs
type backs it — and that choice determines how concurrent edits merge.

You don't import or touch `Y.*` to use any of this. The table is here so you know what you get.

## The table

| `StoreValue<T>` kind | Yjs representation |
| --- | --- |
| scalar (`string` / `number` / `boolean` / `null` / `undefined`) | `Y.Map` value-cell `{ v }` |
| plain object | `Y.Map` (one entry per key) |
| array | `Y.Array` (prefix/suffix diff — concurrent edits merge) |
| `Set` | `Y.Map<hash, member>` (conflict-free; type-preserving) |
| `Map` | `Y.Map<hash, [key, value]>` (any key type) |
| nested `StoreValue` | nested `Y.Map` / `Y.Array`, identity preserved |

## Opaque plain objects vs nested `StoreValue`

This is the one mapping decision that changes runtime behaviour, so internalise it.

A **plain nested object or array** is stored **opaquely**: it's deep-cloned on write and replaced
wholesale. The doc sees one value cell, not a tree. There is no per-field merge — the last writer's
whole object wins.

A **nested `StoreValue`** is stored as its own nested Yjs type. Each field is a real cell in the
doc, so two users editing different fields of the same sub-object **both** land.

```ts
import { StoreValue } from "@super-store/store"

// Opaque: pos is one plain object inside the root Y.Map.
const opaque = new StoreValue({ pos: { x: 0, y: 0 } })

// Mergeable: pos is its own nested type; x and y are independent cells.
const x = new StoreValue(0)
const y = new StoreValue(0)
const mergeable = new StoreValue({ pos: new StoreValue({ x, y }) })
```

### Concrete two-user example

Two users share the same doc. Each edits a different coordinate of `pos` concurrently, then their
updates reconcile.

With a **plain object**, the writes collide on a single cell:

```ts
// Both start from { pos: { x: 0, y: 0 } }.
userA.set({ pos: { x: 10, y: 0 } })   // A moves x
userB.set({ pos: { x: 0, y: 20 } })   // B moves y

// After their updates exchange, one whole object wins — the other edit is lost:
//   { pos: { x: 10, y: 0 } }   OR   { pos: { x: 0, y: 20 } }
```

With a **nested `StoreValue`**, the writes land on different cells and merge:

```ts
// pos is a nested StoreValue<{ x, y }> in both replicas.
userA.value.pos.update({ x: 10 })     // A moves x
userB.value.pos.update({ y: 20 })     // B moves y

// After their updates exchange, both edits survive:
userA.getSnapshot()  // { pos: { x: 10, y: 20 } }
userB.getSnapshot()  // { pos: { x: 10, y: 20 } }
```

**Rule:** if a sub-object needs per-field CRDT merge under concurrent editing, make it a nested
`StoreValue`. If you only ever replace it wholesale, a plain object is fine (and cheaper).

## Arrays

Arrays map to `Y.Array` with a prefix/suffix diff: a `set` compares the new array against the old
from both ends, so insertions and removals turn into the minimal splice. Concurrent edits to
different regions of the list merge instead of clobbering.

```ts
const items = new StoreValue(["a", "b", "c"])
items.set(["a", "x", "b", "c"]) // inserts "x" — does not rewrite "a"/"b"/"c"
```

## `Set` and `Map`

`Set` and `Map` are first-class — they round-trip through tagged sentinels, so you get the real
type back out, not a plain object or array.

```ts
const tags = new StoreValue(new Set(["red", "blue"]))
tags.set(new Set(["red", "green"]))
tags.getSnapshot() // Set { "red", "green" }

const byId = new StoreValue(new Map<number, string>([[1, "a"]]))
byId.set(new Map([[1, "a"], [2, "b"]]))
byId.getSnapshot() // Map { 1 => "a", 2 => "b" }
```

- A `Set` is backed by `Y.Map<hash, member>` — conflict-free, so concurrent adds of different
  members both stick.
- A `Map` is backed by `Y.Map<hash, [key, value]>`, which is why keys can be any type, not just
  strings.

### Identity: content, not reference

Set members and Map keys are hashed by **content**, not by reference. Two structurally-equal
objects are the same member / the same key.

```ts
const a = { id: 1 }
const b = { id: 1 } // different reference, same content

const s = new StoreValue(new Set([a]))
s.set(new Set([a, b]))
s.getSnapshot().size // 1 — a and b are the same member
```

## `undefined`

`undefined` round-trips through a tagged sentinel, so an explicit `undefined` is preserved as a
value (distinct from an absent key).

```ts
const v = new StoreValue<{ note: string | undefined }>({ note: undefined })
v.getSnapshot() // { note: undefined }
```

## What throws at construction

`Date`, class instances, and functions are **rejected at construction** — they throw, exactly as
they do in the in-memory store. Yjs would corrupt them, so super-store refuses them up front rather
than silently storing garbage.

```ts
new StoreValue({ at: new Date() })        // throws
new StoreValue({ fn: () => {} })          // throws
new StoreValue({ inst: new MyClass() })   // throws
```

Store the serialisable form instead — an epoch number or ISO string for a date, plain data for a
class instance:

```ts
const event = new StoreValue({ at: Date.now() }) // number, not Date
new Date(event.getSnapshot().at)                 // reconstruct on read
```
