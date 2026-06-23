import { useSyncExternalStore } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import type { InferStoreValueSnapshot, StoreValue } from "@super-store/store";

/**
 * Subscribe a component to a `StoreValue`. Returns the resolved snapshot
 * (nested `StoreValue` children unwrapped to their values) and re-renders on
 * change. The store's `subscribe`/`getSnapshot` are pre-bound, so this is a
 * thin, tear-free wrapper over `useSyncExternalStore`.
 */
export function useStore<T>(store: StoreValue<T>): InferStoreValueSnapshot<T> {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/**
 * Subscribe to a projection of a `StoreValue`. The component only re-renders
 * when `selector(snapshot)` changes under `isEqual` (default `Object.is`),
 * even though the store emits on every change. Pass a stable `selector` (or
 * accept that an inline selector recomputes each render — the equality check
 * still prevents the re-render).
 */
export function useStoreSelector<T, R>(
  store: StoreValue<T>,
  selector: (snapshot: InferStoreValueSnapshot<T>) => R,
  isEqual?: (a: R, b: R) => boolean,
): R {
  return useSyncExternalStoreWithSelector(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
    selector,
    isEqual,
  );
}
