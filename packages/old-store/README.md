# @omma/store

A tiny reactive primitive — `StoreValue<T>` — that wraps a value, notifies listeners on change, exposes a stable snapshot for React's `useSyncExternalStore`, and recursively dispatches `update()` through nested `StoreValue` children. **No React dependency.** Used heavily by `@omma/canvas-renderer` (e.g. `ViewportController`).

## Install / Use

```ts
"@omma/store": "workspace:*"
```

```ts
import { StoreValue } from "@omma/store"

const counter = new StoreValue(0)
const unsub = counter.subscribe(v => console.log(v))
counter.set(1)        // logs 1
counter.set(1)        // no-op (default === check)
unsub()

// In React:
const value = useSyncExternalStore(counter.subscribe, counter.getSnapshot)
```

## Commands

```bash
pnpm build              # tsc --noCheck → dist/*.d.ts
pnpm build:watch        # watch
pnpm test               # vitest run
pnpm test:watch         # vitest
```

`pnpm install` runs `prepare` (= `pnpm build`).

## Public API

Single export path (`@omma/store` → `src/index.ts`):

- **`StoreValue<T>`** — the reactive class.
- **`InferStoreValueSnapshot<T>`** — resolved view of `T`; every nested `StoreValue<V>` unwraps to `V`.
- **`StoreUpdate<T>`** — recursive-partial shape that `update()` accepts.
- **`Shape`** — value-type discriminant: `scalar | object | set | map | array | store`.

Method surface:

| Method | Behaviour |
|---|---|
| `value` | Synchronous read |
| `set(v)` | Replace; returns `true` iff `isEqual(prev, next)` is `false` |
| `update(partial)` | **Object stores only.** Shallow-merges plain keys; recursively dispatches into nested `StoreValue` children. Throws on scalar / Set / Map / Array stores |
| `subscribe(fn)` | Returns an unsubscribe function. **Pre-bound** |
| `getSnapshot()` | Cached resolved snapshot. **Pre-bound.** Stable reference when nothing changed |
| `emitChange()` | Manual re-emit. Use when a structural mutation (e.g. `Set.add`) bypasses `set` |

Constructor options: `{ isEqual?: (a, b) => boolean; name?: string; debug?: boolean }`. Default `isEqual` is `===`.

Supported value types: `null`, `undefined`, `string`, `number`, `boolean`, plain `Object`, `Set`, `Map`, `Array`, other `StoreValue` instances. **Custom classes throw on construction.**

## Source layout

```
src/
  index.ts            # barrel
  store-value.ts      # the entire implementation
  __tests__/
```

## Dependencies

None at runtime. `vitest` + `typescript` are dev deps.

## Gotchas

- **Don't mutate in place.** `store.value.foo = "bar"` bypasses `set` / `update`, no listeners fire, snapshot goes stale. Replace the whole instance.
- **Don't inline `useSyncExternalStore` closures.** Re-creating subscribe / getSnapshot every render breaks React's stability check. Pass the bound methods directly.
- **`update()` is object-only.** Throws on scalar / Set / Map / Array stores.
- **Override `isEqual` when `===` is the wrong contract.** See `ViewportController` in `@omma/canvas-renderer` for a field-by-field equality example.
