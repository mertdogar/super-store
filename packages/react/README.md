# @super-store/react

React bindings for [`@super-store/store`](../store). Thin, tear-free wrappers over
`useSyncExternalStore`.

```bash
"@super-store/react": "workspace:*"
```

`react` is a peer dependency; `@super-store/store` provides the `StoreValue` you pass in.

## `useStore`

Subscribe a component to a store. Returns the resolved snapshot (nested `StoreValue` children
unwrapped) and re-renders on change.

```tsx
import { useStore } from "@super-store/react";

function Counter({ store }: { store: StoreValue<number> }) {
  const n = useStore(store);
  return <button onClick={() => store.set(n + 1)}>{n}</button>;
}
```

Works identically against an unbound (local) store and a Yjs-bound (persisted/collaborative)
store — a remote merge re-renders the component just like a local `set()`.

## `useStoreSelector`

Subscribe to a projection. The component re-renders only when `selector(snapshot)` changes under
`isEqual` (default `Object.is`), even though the store emits on every change.

```tsx
import { useStoreSelector } from "@super-store/react";

function ZoomLabel({ store }: { store: StoreValue<{ zoom: number; pan: Point }> }) {
  // Re-renders only when `zoom` changes, not on pan.
  const zoom = useStoreSelector(store, (s) => s.zoom);
  return <span>{Math.round(zoom * 100)}%</span>;
}

// Custom comparator for object/array projections:
const items = useStoreSelector(store, (s) => s.items, shallowArrayEqual);
```

Built on `useSyncExternalStoreWithSelector`, so it correctly handles unstable inline selectors.

## Commands

```bash
pnpm test    # vitest (jsdom + @testing-library/react)
```
