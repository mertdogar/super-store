# @super-store/react

React hooks over `@super-store/store`. Two functions, ~30 lines.

## Where things live

```
src/
  index.ts                  # useStore + useStoreSelector
  __tests__/hooks.test.tsx  # jsdom + @testing-library/react
```

## Conventions

- **Pass the store's pre-bound `subscribe` / `getSnapshot` straight through** to
  `useSyncExternalStore` — never wrap them in fresh closures (breaks React's stability check).
- **`useStoreSelector` uses `useSyncExternalStoreWithSelector`** (from `use-sync-external-store`),
  which tolerates an unstable inline selector. Don't hand-roll selector memoisation.
- This package depends on the store's reference-stable `getSnapshot()`. If a snapshot-stability
  bug slips into the core, React surfaces it as a "getSnapshot should be cached" warning / an
  infinite render loop — the hook tests are the canary.

## Don't

- Don't add state management here — this is glue. New reactive behaviour belongs in the core.
- Don't make `react` a hard dependency; it's a peer dep.
