# @super-store/store

A reactive primitive — `StoreValue<T>` — backed by [Yjs](https://yjs.dev). It mirrors the
API of a plain in-memory store so existing code compiles largely unchanged, but underneath
it is a CRDT: state can be **persisted**, **synced for real-time
collaboration**, and **undone/redone** — all opt-in, all hidden behind the same surface.

One runtime dependency: `yjs`. No React (see `@super-store/react` for hooks).

```ts
import { StoreValue } from "@super-store/store";

// Works exactly like the in-memory store — zero config, fully local:
const counter = new StoreValue(0);
const unsub = counter.subscribe(() => console.log(counter.value));
counter.set(1); // logs 1
counter.set(1); // no-op
unsub();
```

## Two backing modes

A `StoreValue` is a typed **handle** over a Yjs shared type, with two modes:

- **Unbound** — a plain in-memory value, identical semantics to the original store. This is
  the state for local-only stores and for children not yet adopted by a bound parent.
- **Bound** — backed by a Yjs type inside a `Y.Doc`. Reads materialise from the doc, writes
  are a diff-and-patch inside one transaction, reactivity is driven by `observeDeep`.

**Binding is lazy and cascades from the root.** A root binds when you inject a `doc` or first
access `.doc` / `.getYType()`; nested children bind when their parent binds — their value is
copied into a nested Y type and their handle repointed, preserving instance identity.

```ts
// Compose first, bind later — identity is preserved:
const x = new StoreValue(1);
const y = new StoreValue(2);
const pos = new StoreValue({ x, y }); // x, y are adopted into pos's doc on bind
pos.getSnapshot(); // { x: 1, y: 2 }
```

## Persistence & collaboration

You own the `Y.Doc` and its providers — wire `y-indexeddb`, `y-websocket`, etc. yourself and
inject the doc. The store never touches providers.

```ts
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";

const doc = new Y.Doc();
new IndexeddbPersistence("my-app", doc); // offline
new WebsocketProvider(WS_URL, "room-1", doc); // real-time sync

// Bind a root into the doc under a key. Provider data fills in as it syncs.
const shapes = new StoreValue(initialShapes, { doc, name: "shapes" });

// Local-only state (e.g. viewport) just omits the doc — never synced:
const viewport = new StoreValue({ zoom: 1, pan: { x: 0, y: 0 } });
```

Reads are synchronous and start from whatever the doc currently holds (empty/defaults until a
provider syncs), then update reactively. If you want a loading gate, gate on your provider's
`whenSynced`. When binding to a doc that **already** holds data (persistence reload, or joining
a session), the **document wins** — the initial value is ignored and the existing state is
adopted.

### Syncing over your own transport (no Yjs import)

Instead of attaching a Yjs provider, you can relay updates over any transport — a
WebSocket bus, a server you control — using three methods that never expose `Y.*`:

```ts
encodeState(): Uint8Array                 // full state, for a catch-up snapshot or to persist
applyUpdate(update: Uint8Array): void     // merge an update from a peer; drives reactivity
onUpdate(cb): () => void                  // observe outgoing updates; cb(update, { local })
```

`onUpdate`'s `meta.local` is `true` for updates this store produced (user writes **and**
undo/redo) and `false` for ones injected via `applyUpdate` — so a sync layer pushes only
`local` updates and never echoes a remote merge back:

```ts
// push local edits up, apply fanned-out merges down — no `import * as Y`
store.onUpdate((update, { local }) => {
  if (local) bus.send({ update });
});
bus.on("update", ({ update }) => store.applyUpdate(update));
bus.on("join", ({ snapshot }) => store.applyUpdate(snapshot)); // catch up
```

The bytes on the wire are still Yjs's update encoding (that _is_ the CRDT), but the caller
never sees it. See `examples/synced-canvas` for a full collaborative example. `applyUpdate` is
tagged so an opt-in `UndoManager` never undoes a remote merge.

## Undo / redo

Opt-in per root. Off by default (the Yjs `UndoManager` disables GC for tracked types).

```ts
const doc = new StoreValue(initial, { doc: ydoc, name: "doc", undo: true });
// or: store.enableUndo({ captureTimeout: 0 })

doc.set(next);
doc.canUndo; // true
doc.undo(); // reverts; listeners fire, snapshot refreshes
doc.redo();
doc.undoManager; // raw Y.UndoManager for advanced use
```

Only this store's own writes are tracked — **remote merges are never undone**.

## API

```ts
class StoreValue<T> {
  constructor(
    value: T,
    options?: {
      isEqual?: (a: T, b: T) => boolean;
      name?: string; // root key in the doc (also debug name)
      debug?: boolean;
      doc?: Y.Doc; // inject to persist/sync; omit for a lazy private doc
      undo?: boolean | { captureTimeout?: number };
    },
  );

  get value(): T; // handle tree (nested children stay StoreValue)
  set(value: T): boolean; // diff-and-patch; true iff data actually changed
  update(value: StoreUpdate<T>): boolean; // object stores only; recurses into child handles
  subscribe(fn: () => void): () => void; // pre-bound
  getSnapshot(): InferStoreValueSnapshot<T>; // pre-bound, cached, reference-stable, fully unwrapped
  emitChange(): void;
  select<R>(selector, isEqual?): { subscribe; getSnapshot };

  // additive (Yjs powers; the core still presents the same shape):
  encodeState(): Uint8Array; // full state for a snapshot / persistence
  applyUpdate(update: Uint8Array): void; // merge a remote update; drives reactivity
  onUpdate(cb: (update: Uint8Array, meta: { local: boolean }) => void): () => void;
  get doc(): Y.Doc; // lazily binds; attach providers here
  getYType(): Y.AbstractType<unknown>;
  enableUndo(opts?): void;
  undo(): void;
  redo(): void;
  get canUndo(): boolean;
  get canRedo(): boolean;
  get undoManager(): Y.UndoManager | null;
  dispose(): void;
}
```

### Type mapping (bound mode)

| `StoreValue<T>` kind                                    | Yjs representation                                      |
| ------------------------------------------------------- | ------------------------------------------------------- |
| scalar (`string`/`number`/`boolean`/`null`/`undefined`) | `Y.Map` value-cell `{ v }`                              |
| plain object                                            | `Y.Map` (one entry per key)                             |
| array                                                   | `Y.Array` (prefix/suffix diff — concurrent edits merge) |
| `Set`                                                   | `Y.Map<hash, member>` (conflict-free; type-preserving)  |
| `Map`                                                   | `Y.Map<hash, [key, value]>` (any key type)              |
| nested `StoreValue`                                     | nested `Y.Map`/`Y.Array`, identity preserved            |

Plain nested objects/arrays are stored opaquely (deep-cloned on write). `Set`/`Map`/`undefined`
round-trip through tagged sentinels.

## Differences from the in-memory store (the "minor tweaks")

1. **State fills in over time.** With a provider, `value`/`getSnapshot()` start at defaults and
   populate as the doc syncs — you must tolerate the initial render. (Local-only stores are
   unaffected.)
2. **`set()` of a structurally-identical value is a no-op in bound mode** — returns `false`,
   no emit. The in-memory store emits on any reference-different `set()` under default `===`.
   (Bound mode keeps `return ⟺ emit ⟺ actual change`.)
3. **In-place mutation now desyncs peers.** `store.value.foo = x` was always a "don't" (stale
   snapshot); in bound mode it also silently fails to converge. Always go through `set`/`update`.
4. **One nested `StoreValue` cannot live under two parents** — a Yjs node has one parent.
5. **Joining a populated doc ignores the initial value** (document wins; see Persistence).
6. **Object `Set` members / `Map` keys are compared by content**, not reference — distinct
   objects with equal content collapse, and carry no stable cross-peer identity.

## Gotchas & limitations

- **`Date`, class instances, and functions throw at construction** (same as the in-memory
  store, now doubly important: Yjs would silently corrupt them).
- **Doc-init race:** if two peers both construct on an empty doc concurrently, both seed it. Use
  a server-authoritative seed or an init flag for true concurrent first-write. (Sequential
  join — the normal provider flow — is fine.)
- **Schema migrations and doc compaction are out of scope (v1).** Recipes:
  - _Migrations:_ keep a `schemaVersion` field in a root object and apply additive-only changes.
  - _Compaction_ (a hot-path store can grow): `const fresh = new Y.Doc(); Y.applyUpdate(fresh,
Y.encodeStateAsUpdate(doc))`. Note `UndoManager` disables GC, defeating compaction.
- **Awareness/presence** is a separate concern — own a Yjs `Awareness` directly.

## Commands

```bash
pnpm build   # tsc --noCheck → dist/*.d.ts
pnpm test    # vitest run
```
