# API Reference

Full surface of `@super-store/store` and `@super-store/react`. Reference-style: signatures plus terse notes. Use ONLY what is listed here.

## Packages

```bash
pnpm add @super-store/store          # yjs comes with it
pnpm add @super-store/react react    # for the hooks
```

```ts
import { StoreValue, STORE_ORIGIN } from "@super-store/store"
import type {
  StoreValueOptions,
  InferStoreValueSnapshot,
  StoreUpdate,
  Shape,
} from "@super-store/store"
import { useStore, useStoreSelector } from "@super-store/react"
```

## Barrel exports (`@super-store/store`)

| Export | Kind | Notes |
| --- | --- | --- |
| `StoreValue` | class | The reactive store primitive. |
| `STORE_ORIGIN` | symbol | Tags this library's writes (used for undo scoping / `meta.local`). |
| `StoreValueOptions` | type | Constructor options object. |
| `InferStoreValueSnapshot<T>` | type | Snapshot type: unwraps every nested `StoreValue<V>` field to its `V`. |
| `StoreUpdate<T>` | type | Deep-partial for `update()`; nested `StoreValue` fields are themselves partial. |
| `Shape` | type | Example shape type used by the canvas example. |

## Constructor

```ts
const store = new StoreValue<T>(value, options?)
```

```ts
interface StoreValueOptions<T> {
  isEqual?: (a: T, b: T) => boolean   // default Object.is / ===
  name?: string                       // root key in the doc (also a debug name)
  debug?: boolean
  doc?: Y.Doc                          // inject to persist/sync; omit for a lazy private doc
  undo?: boolean | { captureTimeout?: number }
}
```

| Option | Default | Notes |
| --- | --- | --- |
| `isEqual` | `Object.is` / `===` | Leaf equality for diffing. |
| `name` | — | Root key inside the doc. REQUIRED when injecting a `doc`. |
| `debug` | `false` | Debug name / logging. |
| `doc` | none (lazy private doc) | Inject a `Y.Doc` to persist/sync; binds the root eagerly. |
| `undo` | off | `true` or `{ captureTimeout }` to enable undo on this root. |

Notes:
- `Date`, class instances, and functions THROW at construction.
- `Set`, `Map`, and `undefined` are supported (round-trip via tagged sentinels).
- Injecting a `doc` REQUIRES `name`.

## Methods & getters

```ts
get value(): T
```
The HANDLE tree. Nested children remain `StoreValue` instances. Do NOT mutate in place — go through `set` / `update`.

```ts
set(value: T): boolean
```
Replaces the value via recursive diff-and-patch in one transaction. Returns `true` iff data actually changed. A structurally-identical `set` is a no-op in bound mode (returns `false`, no emit).

```ts
update(value: StoreUpdate<T>): boolean
```
OBJECT stores only. Merges plain keys, recurses into nested `StoreValue` children in place (identity preserved). Returns `true` iff data changed. Throws on non-object stores.

```ts
subscribe(fn: () => void): () => void
```
Pre-bound in the constructor. Returns an unsubscribe. A child change fires the child's AND the parent's listeners.

```ts
getSnapshot(): InferStoreValueSnapshot<T>
```
Pre-bound, cached, reference-stable, FULLY UNWRAPPED (no `StoreValue` handles). Rebuilt only when data actually changes.

```ts
emitChange(): void
```
Force a snapshot rebuild + notify.

```ts
select<R>(
  selector: (s: InferStoreValueSnapshot<T>) => R,
  isEqual?: (a: R, b: R) => boolean,
): { subscribe: (fn: () => void) => () => void; getSnapshot: () => R }
```
Returns a `{ subscribe, getSnapshot }` pair whose `getSnapshot` is memoised under `isEqual`.

### Sync surface (no yjs import)

```ts
encodeState(): Uint8Array
```
Full state as one update — a catch-up snapshot or to persist.

```ts
applyUpdate(update: Uint8Array): void
```
Merge a peer/persisted update; drives reactivity; tagged so undo never reverts it.

```ts
onUpdate(cb: (update: Uint8Array, meta: { local: boolean }) => void): () => void
```
Observe outgoing updates; returns unsubscribe. `meta.local` is `true` for updates THIS store produced (user writes AND undo/redo), `false` for updates injected via `applyUpdate`.

### Escape hatches

```ts
get doc(): Y.Doc                         // lazily binds to a private doc; attach providers here
getYType(): Y.AbstractType<unknown>
```

### Undo / redo (opt-in)

```ts
enableUndo(opts?: { captureTimeout?: number }): void
undo(): void
redo(): void
get canUndo(): boolean
get canRedo(): boolean
get undoManager(): Y.UndoManager | null
```
Off by default. Only this store's own writes are tracked (by `STORE_ORIGIN`); remote merges (`applyUpdate`) are NEVER undone. An undo flows through the normal observer (listeners fire, snapshot refreshes; propagates to peers like any edit).

### Teardown

```ts
dispose(): void
```
Tear down observers; destroy a private doc.

## Binding

A `StoreValue` is a typed handle over a Yjs shared type, in one of two modes:

| Mode | Backing |
| --- | --- |
| unbound | plain in-memory value; identical semantics to a normal in-memory store |
| bound | backed by a Yjs type inside a `Y.Doc` |

Binding is lazy and cascades from the root. A root binds when you inject a `doc`, or first access `.doc` / `.getYType()` / a sync method / enable undo. Nested children bind when their parent binds — their value is copied into a nested Y type and their handle repointed, preserving instance identity.

```ts
const x = new StoreValue(1)
const y = new StoreValue(2)
const pos = new StoreValue({ x, y })   // x, y adopted into pos's doc on bind; identity preserved
pos.getSnapshot()                       // { x: 1, y: 2 }
```

## Type mapping (bound mode)

| `StoreValue<T>` kind | Yjs representation |
| --- | --- |
| scalar (string/number/boolean/null/undefined) | `Y.Map` value-cell `{ v }` |
| plain object | `Y.Map` (one entry per key) |
| array | `Y.Array` (prefix/suffix diff — concurrent edits merge) |
| `Set` | `Y.Map<hash, member>` (conflict-free; type-preserving) |
| `Map` | `Y.Map<hash, [key, value]>` (any key type) |
| nested `StoreValue` | nested `Y.Map` / `Y.Array`, identity preserved |

Notes:
- Plain NESTED objects/arrays are stored OPAQUELY (deep-cloned on write, wholesale-replaced). For per-field CRDT merge on a sub-object, make it a nested `StoreValue`, not a plain object.
- `Set` members / `Map` keys that are objects are compared by CONTENT, not reference.
- `Date`, class instances, and functions THROW at construction.

## Exported types

```ts
type StoreValueOptions<T>            // constructor options (see table above)
type InferStoreValueSnapshot<T>      // unwraps every nested StoreValue<V> field to its V
type StoreUpdate<T>                  // deep-partial; nested StoreValue fields are themselves partial
type Shape                           // example shape type (canvas example)
```

## React hooks (`@super-store/react`)

```ts
function useStore<T>(store: StoreValue<T>): InferStoreValueSnapshot<T>
// = useSyncExternalStore(store.subscribe, store.getSnapshot)

function useStoreSelector<T, R>(
  store: StoreValue<T>,
  selector: (s: InferStoreValueSnapshot<T>) => R,
  isEqual?: (a: R, b: R) => boolean,
): R
// = useSyncExternalStoreWithSelector(...); re-renders only when selector(snapshot) changes under isEqual
```

Pass the store's pre-bound `subscribe` / `getSnapshot` straight through — never wrap them. Both hooks work identically against unbound (local) and bound (collaborative/persisted) stores: a remote merge re-renders just like a local `set()`. `useStoreSelector` tolerates an unstable inline selector.
