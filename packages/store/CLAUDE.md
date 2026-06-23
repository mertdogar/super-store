# @super-store/store

Yjs-backed reactive primitive `StoreValue<T>`. Drop-in-ish replacement for
`@super-store/old-store` (the in-memory original, kept as the conformance spec). One runtime
dep: `yjs`. No React.

## Where things live

```
src/
  index.ts          # barrel
  store-value.ts     # the StoreValue class — both backing modes, binding, undo
  codec.ts           # leaf encode/decode, hashKey, deepEqual (pure, no StoreValue dep)
  __tests__/
    store-value.test.ts  # the in-memory (unbound) conformance suite, ported verbatim
    bound.test.ts        # bound-mode type mapping, diff-no-bloat, lazy adoption
    review-fixes.test.ts # regressions from the adversarial review
    collab.test.ts       # two-doc convergence, hydration, origin tagging
    undo.test.ts         # opt-in undo/redo
PLAN.md              # the design doc / decision record
```

## The two modes (read this before touching store-value.ts)

A `StoreValue` is **unbound** (plain in-memory `_value`, old-store semantics) or **bound**
(backed by `_ytype` in a `_doc`). `_value` is the read source in BOTH modes — unbound owns it;
bound derives it from Yjs in `_onYChange` while keeping child handles. Binding is one-way and
cascades from the root (`_bindRoot` → `_populateTree` in a transaction → `_activateTree` attaches
observers). `_activateTree` is idempotent (`_activated`) and runs `_reconcileChildren`, so the
populate and hydrate paths share it.

## When you edit X, also edit Y

- **Adding a supported value type / changing the type mapping:** update `yKindOf`, the
  `switch (this._yKind)` in `_populateTree` / `_materialize` / `_patch`, and the codec. Add bound
  AND unbound conformance tests.
- **Changing write semantics:** the `_dirty` flag must be set at every real Yjs mutation site so
  `set`/`update` return (and emit) `true` only on actual change. Don't break `return ⟺ emit`.
- **Changing snapshot resolution:** `_buildSnapshot` recurses via `child.getSnapshot()` (deep
  unwrap). Keep it cached (rebuilt only in `emitChange`/`_onYChange`) for `useSyncExternalStore`.

## Conventions

- **`subscribe` / `getSnapshot` are pre-bound** in the constructor — pass them by reference.
- **All writes go through `doc.transact(fn, STORE_ORIGIN)`** so they batch to one emit and undo
  can track them by origin.
- **Never gate the observer (`_onYChange`) on `isEqual`** — it stales the snapshot. No-op
  suppression belongs at `set()`/`update()` entry only.
- **`codec.ts` stays free of any `StoreValue` import** — pure functions.

## Gotchas

- **Preliminary Yjs types are not readable** before integration — that's why unbound mode uses a
  plain value, not a prelim Y type.
- **`ymap.set(k, undefined)` drops the key**; `undefined` round-trips via a sentinel in the codec.
- **A nested Y type with no child handle materialises to nothing** (skipped) — remote/foreign
  subtrees are adopted by `_reconcileChildren`, not leaked as `undefined`.
- **An exception thrown inside an observer wedges the doc.** Keep `_onYChange` defensive.
- **`UndoManager` disables GC** for tracked types — undo is opt-in for that reason.

## Don't

- Don't mutate `store.value.foo = x` — no emit, and in bound mode it silently desyncs peers.
- Don't instantiate providers (`y-indexeddb`, `y-websocket`, …) in this package — inject the doc.
- Don't add React or any state lib. This is the primitive others build on.
- Don't clear-and-rewrite a Y type to "set" it — always diff-and-patch (clear+rewrite tombstones
  every key and bloats the doc ~40×).
