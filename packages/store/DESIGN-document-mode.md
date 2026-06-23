# Design — document mode + composition via named roots

Supersedes the approach in `/HANDOFF-omma-collab.md`. The handoff asked for an opt-in
"deep mode" flag bolted onto the existing shallow key-value store. We reframed it: this is a
pre-1.0 refactor, so we stop preserving the shallow default and design the store the consumer
(OMMA / `@omma/canvas-renderer`) actually needs — a recursive CRDT document — with a clean
separation between *data depth* and *ownership seams*.

## The one idea that makes everything fit

Two concerns were tangled together. Untangle them and they want different mechanisms:

| Concern | Mechanism | Granularity |
| --- | --- | --- |
| **Depth of the data** ("sync deep JSON properly") | **document mode** — recursion *inside* one store | fine (thousands of nodes) |
| **Seams of ownership** ("compose the schema without defining it all up front") | **named-root sub-stores sharing a `doc`** | coarse (a handful of concerns) |

Rule: **use store-nesting only for ownership seams; use document mode for data depth.** A
3000-node scene is *one* document-mode store, never 3000 nested stores. This is what kills the
per-node-handle scaling problem.

## 1. Document mode (the data-depth engine)

A store constructed `new StoreValue(data, { mode: "document" })` is a recursive CRDT document.

- **Write:** plain nested object → `Y.Map`, plain nested array → `Y.Array`, recurse. Scalars,
  `Map`, `Set` → opaque leaf (via the existing codec). Recurse **only** into plain `Object`/`Array`.
- **Read:** recursive materialize back to **plain JSON**. No `Y.*` and no `StoreValue` handle ever
  leaks. `getSnapshot()` is the read path.
- **Engine:** **bare recursion** (port/generalize the prior-art `updateYjsTypeDeep` from
  `tomorrow-kits/packages/synched-store/src/store-value.ts`). Inside a document store there are no
  sub-stores, so there are **no per-node `StoreValue` handles and no per-node observers** — one
  observer at the store root, materialize plain. This is the deliberate departure from today's
  handle-per-nested-node engine.

### 1e. Read granularity — full re-materialize per write, no changed-path signal (known)
Document mode has **one root observer**. Every write (local or remote) re-runs `materializeDeep`
over the **whole tree** and fires listeners with a fresh full snapshot — there is **no "which paths
changed" signal**, only "something changed". This is O(tree) on the read side per write. For OMMA's
hot path (frame-rate `update({elements:{[id]:{x}}})` drags, AI bulk edits) this is fine at 10–100
elements (the renderer already reconciles by id), but may bite on large scenes. **Deferred fix if
benchmarks demand it** (decide together): consumer-side snapshot-diffing, or a `changed-paths` event
emitted from the Yjs `observeDeep` event (it already carries the changed paths — we currently discard
them). The *write* is cheap; this is purely the read/projection cost. Flagged by the consumer; not a
v1 blocker.

### 1a. Arrays are element-opaque in v1
Nested arrays become a `Y.Array` of **opaque (`encodeLeaf`'d) elements** — positional
insert/delete merges across peers, whole-element replace is LWW. Do **not** recurse into array
elements: it breaks the `deepEqual`-based `_patchArray` diff and reintroduces the positional
identity hazard. Recursive/keyed arrays are a separate, later, identity-aware effort. (OMMA
reshapes `elements` from a positional array into an id-keyed `Record`, so it never relies on
array merge for identity.)

### 1b. Per-path `opaque` ships in v1 — it is correctness, not perf
`new StoreValue(data, { mode: "document", opaque: ["elements.*.value", "state", ...] })`.

Field-merging a **discriminated-union** subtree is *not* harmless: if two peers switch the union
to different variants and we merge per-field, the result is a Frankenstein object mixing fields
from both variants — silent corruption. So union blobs (`value`), `state`, etc. must be markable
atomic. Resolution is per-node: thread a `path: string[]` through the write recursion and match it
against the `opaque` globs (`*` matches any record key / array index). An opaque path → `encodeLeaf`
(single cell) instead of recursing.

`opaque` is forward-compatible to add/extend later (a `Y.Map` always materializes to a plain
object, so old docs read fine) — but it must be **consistent across all peers** (see §4).

OMMA's confirmed opaque list (lives in `@omma/schema/scene`, imported by every peer):
`["elements.*.value", "elements.*.elementAnimations", "elements.*.state", "elements.*.actions"]`
(keyframe arrays are already atomic-enough via §1a, but `elementAnimations` is listed opaque to keep
the whole animation subtree a single cell).

### 1c. Don't auto-wrap `Map`/`Set`
`_adopt` can't distinguish a `Map`-encoded `Y.Map` from an object `Y.Map`, so an auto-wrapped
nested `Map` re-materializes as an object on a peer. Keep `Map`/`Set` opaque/explicit-only.
Consumers model keyed collections as plain `Record`s (OMMA already does).

### 1d. CORRECTNESS TRAP — bubble `_dirty` through the recurse-diff
The real work of document mode is the **write/`set` path**, not fresh keys. A whole-tree
`set(snapshot)` (the consumer's `loadScene`, scene re-export, undo/restore) must **recurse-diff**
into an existing subtree, never detach-and-replace it (replacing clobbers concurrent structure on
an untouched sibling). `update()` already routes correctly; `set`/`_patch` is what needs it.

`_patch`/`set` propagate "did anything change" through the per-handle `_dirty` *instance flag*, not
a return value. A deep recurse-diff that only changes a grandchild must bubble dirtiness up, or
`set()` returns `false` despite a real change — and `SyncReplica.set` (`store-sync/src/index.ts:130`)
then **drops the delta** (`take()` returns null on `changed === false`), so peers never receive the
edit. Every recurse-diff site must do `if (childChanged) this._dirty = true`.

## 2. Composition (the ownership-seam mechanism)

Each concern owns a **named-root store sharing one `doc`** — the doc is owned by a `Store`
container (§2b), so users never import yjs:

```ts
const store    = createStore()
// defined in scene-land:
const scene    = store.root("scene",    sceneSeed,    { mode: "document", opaque: [...] })
// defined in settings-land — top level never sees this schema:
const settings = store.root("settings", settingsSeed, { mode: "document" })
```

- **Why named roots, not embedded `StoreValue`-in-`StoreValue`:** Yjs **root** types are
  name-deterministic (`doc.getMap("settings")` is the same logical root on every peer), so
  independently-constructed sub-stores merge correctly. A nested `Y.Map` set as a *value* gets a
  client-clock id — two peers creating it concurrently produce **competing containers** and one
  subtree (plus anything written into it) is silently orphaned on merge. Named roots avoid this
  entirely. super-store already binds to a named root via `_bindRoot` → `doc.getMap(name)`; this is
  mostly existing infra.
- **Separation of concerns** is the driver and is served better than a combined store: each
  component constructs its own store where it lives; nothing is defined up front.
- **Scoped reactivity falls out for free:** a component subscribes to its slice's store and
  re-renders only on that slice's changes — not on every change to the whole document.

### 2a. No parent/umbrella class
Per-slice access is the hot path; the composed whole is rare (export/save). So composition is
**named-root stores + thin helpers**, not a class that has to know the full schema:

- **Sync the whole** — free. One shared `doc` syncs all roots together via the doc update stream;
  nothing is ever assembled into JSON to sync.
- **Export the whole** — a thin `export()` that gathers the registered roots into one JSON by
  `name`. (Uses the `Store`'s own root registry rather than walking `doc.share`, so non-object root
  kinds — scalar/Set/Map — export through each root's `getSnapshot()` and stay correct.)
- **Load the whole** — a thin `load()` that routes each top-level key to its store's `set`/`update`.
  Rare path; no need to optimize.

### 2b. The `Store` container — no yjs import for users
Users must never be obliged to `new Y.Doc()` or import yjs. A single standalone store already
doesn't need it (`new StoreValue(x, { mode })` lazily owns a private `Y.Doc`). The only gap is
composition — sharing one doc across named roots. Close it with a doc-owning container:

```ts
import { createStore } from "@super-store/store"   // no yjs import, anywhere

const store    = createStore()                                  // owns a private Y.Doc
const scene    = store.root("scene", sceneSeed, { mode: "document", opaque: [...] })
const settings = store.root("settings", settingsSeed)

store.export()        // gather all roots -> one JSON (walks doc.share)
store.load(json)      // route top-level keys to each root's set/update
store.onUpdate(...)   // doc-level sync surface for @super-line/store-sync
store.doc             // escape hatch — see below
```

- `createStore()` returns a `Store` that owns a private `Y.Doc`. `store.root(name, seed, opts)` is
  sugar for "construct a `StoreValue` bound to *this* doc under that `name`" — it reuses the
  existing `{ doc, name }` binding, no new binding path. The `Store` is the home for
  `export()`/`load()`/the doc-level sync surface (§2a).
- **Keep the bare `new StoreValue(x, { mode })`** for a standalone single store — simplest possible
  thing, already yjs-free.
- **Escape hatch:** `{ doc }` was injectable so users could attach providers themselves
  (`y-indexeddb`, `y-websocket`) — see `packages/store/CLAUDE.md`. Hiding the doc must not remove
  that, so the `Store` exposes `store.doc` (the existing `get doc()`). store-sync users never touch
  it; raw-provider users reach for it explicitly. Owning a `Y.Doc` is **not** instantiating a
  provider, so "don't instantiate providers in this package" still holds.
- **Naming:** `Store` = the doc-owning container; `StoreValue` = a named root inside it ("a Store
  contains StoreValues"). `createWorkspace` is an alternative; avoid `createDocument` (collides with
  "document mode").

## 3. `@super-line/store-sync` change

**Implemented in `super-line/packages/store-sync/src/index.ts` and verified end-to-end** (5/5
integration tests against a local `@super-store/store@0.3.0`, incl. same-nested-object field-merge
over the loopback wire).

> **Two composition models — don't conflate them.** §2b's `Store` (named roots sharing **one** doc,
> grouped locally) and §3's per-resource model are different. **Over store-sync, the §3 model
> applies: one super-line resource = one document-mode `StoreValue` = its own doc.** So under
> store-sync the scene does **not** share a doc with settings — each is its own resource with its own
> `accessRules` and sync stream. §2b's shared-doc `Store` is for *local* grouping / non-store-sync
> usage, not the wire unit.

The core `Store` contract maps a **resource 1:1 to a `StoreValue`** (`ResourceReplica` mirrors the
`StoreValue` surface; the server holds one per resource). So rather than make a resource hold the
multi-root `Store` container, the cleaner fit is: **each resource is one document-mode `StoreValue`,
and composition across concerns = multiple resources.** That's idiomatic super-line *and* a feature —
each concern (scene, settings) gets its own `accessRules` and sync stream.

Change made: `syncStoreServer`/`syncStoreClient` accept `resolveOptions: (id) => { mode, opaque }`,
forwarded into the server's `create` seed and the replica's `StoreValue`. Both halves import the
**same resolver from one shared module** — which *is* the §4 drift mitigation: peers can't disagree
on mode/opaque if they derive them from one source. (An explicit fingerprint *handshake* would need a
new field in the core relay protocol — deferred; the shared resolver covers v1.)

**Release coupling (needs a decision):** super-line depends on the *published* `@super-store/store@^0.2.0`,
whose `StoreValueOptions` has no `mode`/`opaque` — so the store-sync change does not typecheck until
super-store ships document mode. Options: (a) release super-store `0.3.0` and bump super-line's dep;
(b) local dev link (pnpm override / `file:`) to iterate before publishing.

## 4. Encoding intent is shared *code*, not wire data

`mode`, `opaque` paths, and which root is mounted where are **local construction-time decisions**
that do **not** travel on the wire. The wire carries only Yjs update bytes. If two peers disagree on
whether a path is `opaque`, they write incompatible representations at the same path and the doc
**diverges silently** (no throw). This is the one new failure mode per-path control introduces.

Mitigation, in two parts:

1. **v1 — hand-shared config module, co-located with the concern.** The `mode`/`opaque` for
   `settings` lives in settings-land and is imported by *both* the live construction and wherever a
   peer/replica rebuilds that root. Never re-centralize it at the top level — that fights separation
   (§2). One definition per concern; the concern owns it.
2. **Make the drift loud — in store-sync's handshake, NOT in the doc.** *(Revised — the original
   plan put a config fingerprint in a reserved doc root; that's abandoned.)* Storing config in the
   synced `Y.Doc` breaks pure incremental relay: a bind-time meta write produces an item at client
   clock 0 that isn't relayed (the `onUpdate` handler attaches after bind), so the next write lands
   at clock 1 and applying it to a peer leaves a **clock gap** → Yjs buffers it as pending and never
   integrates it. Verified: it silently broke `sync.test.ts`'s two-empty-peers relay convergence.
   *Any* config data super-store writes into the CRDT before the first relayed write has this
   problem. So drift detection moves to **`@super-line/store-sync`'s out-of-band handshake**
   (`create`/`read`/`open` already carry resource metadata): the server records each root's
   `mode`/`opaque` fingerprint alongside the resource, and rejects an `open`/`create` whose
   fingerprint disagrees — no clock-gap, no CRDT pollution, and a clean error at connect time. This
   is part of the §3 store-sync slice. (Raw super-store peers relaying `onUpdate` directly without
   store-sync get no drift check — acceptable; store-sync is the supported sync path.)

   > **PRIORITIZE the fingerprint handshake before production multi-user — it is not merely
   > belt-and-suspenders.** The shared `resolveOptions` module only prevents drift when all peers run
   > **the same code**. Real peers won't: a browser on cached/old JS and a server agent on a newer
   > deploy is classic **rolling-deploy version skew**. If the browser holds an old `@omma/schema`
   > opaque list and the server a new one, they write incompatible structure at the same path and the
   > doc **diverges silently** — the shared resolver cannot catch this; only the out-of-band
   > reject-on-mismatch handshake does. Fine to defer for single-dev v1; required before multi-user
   > production. (Flagged by the consumer.)
3. **North star (deferred, §7).** Derive `mode`/`opaque` from OMMA's Zod `.meta`: one schema → one
   config makes drift structurally impossible and subsumes hand-sharing.

## 5. What changes / what's deleted

- **Delete** the shallow-default key-value behavior as the implicit mode; `mode` is now an explicit
  per-store choice (`"document"` for the recursive case).
- **Delete** the handle-per-nested-node engine *inside* document stores (no `_attachChild`/`_adopt`/
  per-node observers for plain data) — replaced by bare recursion + plain materialize.
- **Add** a `createStore()` / `Store` container (§2b) that owns the `Y.Doc` and mints named roots,
  so users never import yjs. Keep `store.doc` exposed as the provider escape hatch.
- **Keep** root binding by `name`, the codec, the sync surface, root-scoped undo.
- **Update** docs: `docs/guide/{type-mapping,collaboration,writes}.md`.

## 6. Definition of done

```ts
const a = new StoreValue({ el: { x: 1, color: "red" } }, { mode: "document" })
const b = new StoreValue({}, { mode: "document" })
b.applyUpdate(a.encodeState())
a.update({ el: { x: 2 } })
b.update({ el: { color: "blue" } })
// exchange a.onUpdate <-> b.applyUpdate both ways:
// EXPECT both: { el: { x: 2, color: "blue" } }
```

Plus, as explicit regression tests:
1. **Whole-tree `set()` preserves concurrent sibling edits.** `set()` a whole new tree over an
   already-bound doc; assert a concurrent edit on an *untouched* sibling subtree survives. (Catches
   the §1d `_dirty`-bubbling / recurse-diff-vs-detach bug — the consumer's full-scene-set path.)
2. **`opaque` subtree is atomic.** A path in `opaque` does whole-value LWW, not field-merge.
3. **Named-root composition merges wire-safely.** Two peers each construct the same named-root
   stores on a shared doc; concurrent writes to different roots both survive (no competing-container
   loss).
4. `getSnapshot()` returns plain JSON on both sides (no `StoreValue`/`Y.*` leak).
5. `export()` over `doc.share` reassembles all roots into one JSON.
```

## Implementation status

- **Done — document-mode core.** `{ mode: "document", opaque }` on `StoreValue`. Pure recursion in
  `codec.ts` (`patchDeep`/`setDeepKey`/`patchArrayLeaf`/`materializeDeep`/`compileOpaque`); gated
  into `_populateTree`/`_patch`/`_updateBound`/`_materialize` and the activate/observe paths in
  `store-value.ts` (shallow mode untouched). `_dirty` bubbles through the recurse-diff (§1d).
  Covered by `src/__tests__/document-mode.test.ts`: DoD field-merge, whole-tree-`set()`-preserves-
  sibling, deep `set()` change-reporting, plain-JSON reads, opaque-subtree atomicity. Full suite
  156/156, typecheck + oxlint clean.
- **Done — `Store` container (§2b).** `createStore()` / `store.root(name, seed, opts)` (idempotent
  per name), `export()` / `load()`, doc-level `encodeState`/`applyUpdate`/`onUpdate` mirroring
  `StoreValue`'s `local` semantics (shared `APPLY_ORIGIN`), `store.doc` escape hatch. In `store.ts`,
  exported from the barrel. Covered by `src/__tests__/store.test.ts`: independent named roots,
  idempotent `root()`, scoped reactivity, two-peer convergence with concurrent writes to different
  roots, export/load round-trip, local-vs-applied echo-break. Suite 162/162, typecheck + oxlint
  clean.
- **Done — `DeepPartial` typed `update()`.** `StoreValue<T, M extends StoreMode = "shallow">`;
  `update()` takes `UpdateArg<T, M>` = `DeepPartial<T>` in document mode, `StoreUpdate<T>` in shallow.
  No casts at call sites (the consumer's repo forbids `as`). `store.root(name, typedSeed, {mode})`
  infers both `T` and `M`; explicit `new StoreValue<T>(…)` must pass both args (`<T, "document">`),
  else `M` defaults shallow and a wrong `mode:` errors loudly. `StoreMode`/`DeepPartial`/`UpdateArg`
  exported from the barrel.
- **Done — store-sync (§3), verified end-to-end.** `syncStoreServer`/`syncStoreClient` take
  `resolveOptions(id) => { mode, opaque }`, forwarded into the server seed and the replica. Verified
  against a local `@super-store/store@0.3.0` build: `store-sync.integration.test.ts` 5/5, including
  concurrent writes to the SAME nested object field-merging over the real super-line loopback wire.
  super-store bumped to `0.3.0`.
- **Abandoned — in-doc config fingerprint.** Tried, reverted: storing config in the CRDT breaks
  pure incremental relay (clock-gap, see §4.2). Drift detection relocated to the store-sync handshake.
- **Prioritized (before production multi-user) — store-sync reject-on-mismatch handshake.** The shared
  `resolveOptions` module covers single-dev v1, but does NOT catch client/server **deploy version
  skew** (browser on old `@omma/schema`, server on new). Only the out-of-band fingerprint handshake
  does. Needs a core relay-protocol field. Not a v1 blocker; required before multi-user prod.
- **Open — read granularity (§1e).** Full re-materialize per write, no changed-path signal.
  Consumer will benchmark large scenes; fix (snapshot-diff or changed-paths event) only if numbers
  demand it.

## 7. Deferred (unchanged from handoff)

- `Y.Text` character-level co-editing (`text()` field). v1 lives with whole-string LWW.
- Recursive/keyed *arrays* (identity-aware reorder, fractional indexing).
- Schema-derived mapping from Zod `.meta` (the north star that subsumes §4's shared definition).
