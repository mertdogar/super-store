# @omma/store

Reactive primitive `StoreValue<T>`. No React dep. Used heavily by `@omma/canvas-renderer`.

## Where things live

```
src/
  index.ts            # barrel
  store-value.ts      # the entire implementation
  __tests__/
```

## When you edit X, also edit Y

- **Adding a supported value type** to `Shape`: update the type discriminant in `store-value.ts`, the `Shape` exported type, and the runtime check in the constructor. The `update()` semantics need to be re-evaluated for the new shape too.
- **Changing the snapshot resolution** (how nested `StoreValue` children unwrap): tests in `__tests__/` enforce the contract; update both the runtime and the `InferStoreValueSnapshot<T>` type.

## Conventions specific to this package

- **`subscribe` and `getSnapshot` are pre-bound** in the constructor. Consumers pass them by reference to `useSyncExternalStore`; rebinding inside JSX defeats React's stability check.
- **No third-party deps at runtime.** Stay zero-dep — the whole point is a tiny, self-contained primitive.
- **Tests live alongside source.** `pnpm test` runs vitest from this package.

## Gotchas

- **`update()` is object-only.** Throws on scalar / Set / Map / Array stores.
- **Custom classes throw on construction.** Supported types are: `null`, `undefined`, primitives, plain `Object`, `Set`, `Map`, `Array`, other `StoreValue` instances. Dates and functions go through `set` only via a wrapper.
- **`emitChange()` is the escape hatch** for structural mutations that bypass `set` (`Set.add`, `Map.set`, `Array.push`). Use sparingly — prefer replace-the-instance semantics.

## Don't

- Don't mutate `store.value.foo = "bar"`. No listeners fire; snapshot goes stale.
- Don't replace a nested `StoreValue` child with a plain value via `parent.value.child = X` — it breaks the shape contract. Use `parent.set({...})` or `parent.update({ child: … })`.
- Don't inline `useSyncExternalStore(() => store.subscribe(cb), () => store.getSnapshot())`. Pass the bound methods.
- Don't add React, Zustand, or any other state-lib as a dep. This package's job is to be the primitive others build on.
