# Plan: `@super-store/store` (Yjs-backed) + `@super-store/react`

A Yjs-backed reactive store that replaces the in-memory `StoreValue<T>` primitive
(`packages/old-store`) with **minor tweaks** to the public API. Yjs is the single
source of truth; `StoreValue` becomes a reactive handle over a Yjs shared type.

> **Status: implemented (M1–M6 complete).** See `README.md` for the shipped API and
> the behavioral deltas. This file is retained as the design/decision record.

## Decisions locked (from the design interview)

| #   | Decision        | Choice                                                                                                                     |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Why Yjs         | Collaboration **+** offline persistence **+** undo/redo **+** CRDT foundation (all four)                                   |
| Q2  | Compat bar      | **Source-compatible, Yjs hidden.** Same class/signatures; `value`/`getSnapshot` stay sync; new capability is additive-only |
| Q3  | Doc unit        | **One `Y.Doc` per root** by default; app may inject a shared doc                                                           |
| Q4  | Binding         | **Lazy binding**, cascading from root; children carry an in-memory value until adopted                                     |
| Q5  | Arrays          | **Diff-and-patch** (merge-friendly), wholesale-replace only when totally different                                         |
| Q6  | Undo            | **Opt-in per root**, exposed on the store, tracks local-origin edits                                                       |
| Q7  | Providers       | **Pure inject** — core never touches providers; app wires raw Yjs                                                          |
| Q8  | React           | **Separate `packages/react`** library                                                                                      |
| —   | Source of truth | **Yjs is authoritative**; `StoreValue` is a reactive handle (no in-memory mirror)                                          |

## Architecture

```
packages/store   @super-store/store   StoreValue<T> over Yjs. dep: yjs only. React-free.
packages/react   @super-store/react   useStore / useStoreSelector. peerDep: react, @super-store/store
packages/old-store                     untouched reference / conformance spec
```

## Core: the `StoreValue<T>` design

### Public surface (old methods unchanged; new ones additive)

```ts
class StoreValue<T> {
  constructor(
    value: T,
    options?: {
      isEqual?: (a: T, b: T) => boolean;
      name?: string; // root key in the doc; required when `doc` is injected, auto otherwise
      debug?: boolean;
      doc?: Y.Doc; // inject to persist/sync; omit -> private in-memory Y.Doc
      undo?: boolean | { captureTimeout?: number };
    },
  );
  get value(): T; // handle tree (nested children stay StoreValue instances)
  set(value: T): boolean; // diff-and-patch in one transaction
  update(value: StoreUpdate<T>): boolean; // object-only; recurse into child handles in place
  subscribe: (l: () => void) => () => void; // pre-bound
  getSnapshot: () => InferStoreValueSnapshot<T>; // pre-bound, cached, reference-stable, fully unwrapped
  emitChange(): void;
  select<R>(selector, isEqual?): { subscribe; getSnapshot };
  // additive (Yjs powers, still "hidden"):
  enableUndo(opts?): void;
  undo(): void;
  redo(): void;
  get canUndo(): boolean;
  get canRedo(): boolean;
  readonly undoManager?: Y.UndoManager;
  get doc(): Y.Doc; // escape hatch (attach providers here)
  getYType(): Y.AbstractType<unknown>; // escape hatch
  dispose(): void;
}
```

### Binding lifecycle

Construct **unbound** (holds the plain value; reads work synchronously). Bind when:

- **(a) a root needs a doc** — lazily creates a private `Y.Doc`, or uses the injected
  one under `doc.getMap(name)`; or
- **(b) a parent binds and cascades** into its child `StoreValue`s, copying each
  child's in-memory value into a nested `Y.Map`/`Y.Array` and repointing the child's
  handle to that nested instance.

One-way transition (unbound -> bound); no lasting dual source of truth.

### Type mapping (each node = one named Yjs type; scalars can't be doc roots)

| Kind                  | Yjs representation                      | Notes                                                                    |
| --------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| scalar                | `Y.Map` value-cell `{ v }`              | `undefined` stored as a present value, never conflated with delete       |
| plain object          | `Y.Map`                                 | diff-and-patch keys                                                      |
| array                 | `Y.Array`                               | diff-and-patch (Q5)                                                      |
| Map (string keys)     | `Y.Map` -> rebuilt as `Map` in snapshot |                                                                          |
| Map (non-string keys) | `Y.Array` of `[k,v]` pairs              | per-key merge lost (documented)                                          |
| Set                   | `Y.Map<member,true>`                    | concurrent adds converge; rebuilt as `Set` in snapshot                   |
| nested `StoreValue`   | nested `Y.Map`/`Y.Array`                | identity = the nested Y instance; in-place on `update`, rebuild on `set` |

### Reads

`getSnapshot()` returns a **cached** snapshot rebuilt only inside the `observeDeep`
handler (react-yjs pattern: `toJSON()` -> `equalityDeep` -> return previous reference
if unchanged). `Set`/`Map` are rebuilt to real instances in the snapshot layer.
v2 optimization (only if profiled): `WeakMap`-keyed structural sharing invalidated by
`event.path`. `value` returns the handle tree (children stay instances), preserving
`parent.value.child instanceof StoreValue`.

### Writes

`set()`/`update()` run a recursive **diff-and-patch inside a single
`doc.transact(fn, STORE_ORIGIN)`**: leaf-compare with `isEqual` before writing, delete
absent keys, recurse changed subtrees, **never clear-and-rewrite** (that tombstones
every key, bloats the doc, and destroys merge). A no-op diff makes zero mutations ->
no transaction -> no emit -> returns `false` (the `isEqual` suppression falls out for
free). Local writes are tagged with `STORE_ORIGIN`.

### Reactivity

Each handle has an `observeDeep`; a child change fires the child's observer (child
listeners) **and** the parent's (parent listeners) — preserving "own + child listeners
fire independently." Observers fire once per transaction -> one emit per `set`/`update`.
Remote merges rebuild the snapshot and emit; emit is skipped when the rebuilt snapshot
is `isEqual` to the cached one. `emitChange()` collapses to "do the Y op, let the
observer fire" (kept as a forced-rebuild escape hatch).

### Undo

`{ undo: true }` (or `enableUndo()`) attaches a `Y.UndoManager` scoped to the root type
with `trackedOrigins: {STORE_ORIGIN}`; we listen to stack-item events to force the
snapshot rebuild (works around Yjs not reliably firing `observeDeep` on undo/redo).
Off by default because `UndoManager` pins deleted content and disables GC.

## `@super-store/react`

```ts
function useStore<T>(sv: StoreValue<T>): InferStoreValueSnapshot<T>;
// = useSyncExternalStore(sv.subscribe, sv.getSnapshot)

function useStoreSelector<T, R>(
  sv: StoreValue<T>,
  selector: (s: InferStoreValueSnapshot<T>) => R,
  isEqual?: (a: R, b: R) => boolean,
): R;
// = useSyncExternalStoreWithSelector(...)
```

## Behavioral deltas a consumer will notice (the "minor tweaks")

1. With a provider attached, state **starts empty/default and fills in** — must tolerate
   the initial render. (Local-only stores are unaffected.)
2. **Sharing one nested `StoreValue` under two parents is gone** (Yjs: a node has one parent).
3. **In-place mutation now desyncs peers** (`store.value.foo = x`) — was just a stale snapshot.
4. Non-string-keyed `Map` / `Set` lose some per-element merge fidelity (only observable under concurrency).
5. New runtime dep `yjs`; new options `{ doc, name, undo }`; injecting a `doc` **requires** `name`.

## Testing

- **Port the entire `old-store` suite verbatim** — it is the conformance spec and must pass
  against the in-memory default (private-doc) path.
- Add: type-mapping round-trips; diff-and-patch (no clobber + no doc-bloat via
  `encodeStateAsUpdate` byte size); two-doc convergence (collaboration); undo/redo;
  Set/Map encodings; snapshot reference-stability under `observeDeep`; lazy-binding
  cascade; `dispose()` teardown.

## Scaffolding (mirror `old-store`)

- `packages/store`: `@super-store/store`, ESM, `tsc --noCheck` d.ts build, vitest,
  oxlint/oxfmt; deps `{ yjs }`; dev `{ typescript, vitest, @types/node }`.
- `packages/react`: `@super-store/react`; peerDeps `{ react, @super-store/store }`;
  dev react + vitest + @testing-library/react.

## Phased roadmap

1. **M1 — In-memory parity:** scalar/object value-cell + `Y.Map`, lazy binding, cached
   snapshot, `set`/`update` diff-and-patch (objects/scalars), `subscribe`/`getSnapshot`/
   `select`/`value`. Port old tests -> green on private-doc path.
2. **M2 — Full type mapping:** arrays (diff-and-patch), Set/Map encodings,
   nested-StoreValue cascade + identity.
3. **M3 — Collab/persistence:** inject-doc path, origin tagging, remote-merge emit +
   `isEqual` suppression, two-doc convergence tests.
4. **M4 — Undo:** opt-in `UndoManager` + stack-event snapshot rebuild.
5. **M5 — `@super-store/react`:** hooks + tests.
6. **M6 — Docs:** README/CLAUDE.md, migration notes, compaction + `schemaVersion` recipes.

## Risks / out-of-scope (v1)

- **Migrations & doc compaction:** documented, not built (`schemaVersion` convention;
  `encodeStateAsUpdate` -> fresh-doc recipe; UndoManager-disables-GC caveat).
- **Awareness/presence:** out of scope (separate concern over an injected `Awareness`).
- **Structural-sharing `WeakMap` cache:** deferred until profiling demands it.

## Key references

- Yjs shared types: https://docs.yjs.dev/getting-started/working-with-shared-types
- Y.Map: https://docs.yjs.dev/api/shared-types/y.map
- Transactions: https://docs.yjs.dev/api/transactions
- UndoManager: https://docs.yjs.dev/api/undo-manager
- Offline support: https://docs.yjs.dev/getting-started/allowing-offline-editing
- react-yjs `useY`: https://github.com/nikgraf/react-yjs
- immer-yjs (diff-and-patch reference): https://github.com/sep2/immer-yjs
- valtio-yjs: https://github.com/valtiojs/valtio-yjs
- SyncedStore: https://syncedstore.org/docs/advanced/yjs/
- useSyncExternalStore: https://react.dev/reference/react/useSyncExternalStore
