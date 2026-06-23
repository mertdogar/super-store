const __DEBUG__ = false;

/**
 * The resolved snapshot view of `T`: every nested `StoreValue<V>` field is
 * unwrapped to its inner `V`. Returned by `getSnapshot()`, which is what
 * React's `useSyncExternalStore` consumes.
 */
export type InferStoreValueSnapshot<T> = {
  [K in keyof T]: T[K] extends StoreValue<infer V> ? V : T[K];
};

/**
 * The shape `update()` accepts: every top-level key is optional, and any
 * nested `StoreValue<V>` value is itself recursively partial-through-stores
 * — matching the runtime's recursive dispatch into nested children.
 *
 * Plain-object leaves are *not* recursively partial. At the leaf the merge
 * is shallow (`{...this._value, ...partial}`), so passing
 * `{ nested: { foo: 1 } }` to an update of a plain-object leaf would
 * overwrite the entire `nested` object — same as `Partial<T>`.
 */
export type StoreUpdate<T> = {
  [K in keyof T]?: T[K] extends StoreValue<infer V> ? StoreUpdate<V> : T[K];
};

const specialTypes = ["Set", "Map", "Array", "StoreValue"] as const;

const supportedTypes = [
  "null",
  "undefined",
  "string",
  "number",
  "boolean",
  "Object",
  ...specialTypes,
] as const;

function getTypeName<T>(value: T): (typeof supportedTypes)[number] {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") {
    const name = (value as object).constructor.name;
    if (specialTypes.includes(name as never)) return name as (typeof specialTypes)[number];

    if (name === "Object") return "Object";
    throw new Error(`Unsupported type: ${name}`);
  }
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  throw new Error(`Unsupported type: ${typeof value}`);
}

function isOneOfSpecialTypes(value: unknown) {
  const type = getTypeName(value);
  return specialTypes.includes(type as never);
}

function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

function cloneSkippingStoreValues<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as object)) {
    result[k] = isOneOfSpecialTypes(v) ? v : structuredClone(v);
  }
  return result as T;
}

export type Shape<K> = {
  readonly nonStoreValueKeys: ReadonlyArray<K>;
  readonly storeValueKeys: ReadonlyArray<K>;
};

export class StoreValue<T> {
  protected _value: T;
  protected listeners: Set<() => void> = new Set();
  protected isEqual: (a: T, b: T) => boolean;
  protected _partialUpdateSupported: boolean;
  protected _name: string;
  protected _debug: boolean;
  protected _shape: Shape<keyof T>;
  private _childUnsubs: Array<() => void> = [];
  private _initialTypeName: string;
  // Cached snapshot — rebuilt in emitChange() so getSnapshot() always returns
  // a stable reference between renders, satisfying useSyncExternalStore.
  private _snapshot!: InferStoreValueSnapshot<T>;
  getSnapshot: () => InferStoreValueSnapshot<T>;
  subscribe: (listener: () => void) => () => void;

  constructor(
    value: T,
    options?: {
      isEqual?: (a: T, b: T) => boolean;
      name?: string;
      debug?: boolean;
    },
  ) {
    this._value = value;

    this._initialTypeName = getTypeName(value);
    this._name = options?.name ?? `${this._initialTypeName} StoreValue`;
    this._debug = options?.debug ?? false;
    this.isEqual = options?.isEqual ?? ((a, b) => a === b);
    this._partialUpdateSupported = this._initialTypeName === "Object";
    this.getSnapshot = this._getSnapshot.bind(this);
    this.subscribe = this._subscribe.bind(this);

    if (__DEBUG__ && this._debug) {
      console.log(`[StoreValue]: ${this._name} created`, {
        value,
        initialTypeName: this._initialTypeName,
        partialUpdateSupported: this._partialUpdateSupported,
      });
    }

    this._watchChildren(value);
    this._snapshot = this._buildSnapshot();

    this._shape = this._buildShape();
  }

  get value() {
    return this._value;
  }

  /**
   * Set the value.
   * @param value - The new value
   * @returns true if the value was changed, false otherwise
   */
  set(value: T): boolean {
    if (this.isEqual(this._value, value)) return false;
    if (isOneOfSpecialTypes(value)) {
      this._value = value;
    } else {
      this._value = cloneSkippingStoreValues(value);
    }
    this._watchChildren(this._value);
    this._shape = this._buildShape();
    this.emitChange();
    return true;
  }

  /**
   * Apply a partial update. Top-level keys are shallow-merged; nested
   * `StoreValue` children receive a recursive `update()` call so partial
   * updates propagate through the tree without losing child identity.
   *
   * Throws when the wrapped value is not a plain object — `set()` is the
   * write path for scalars, Sets, Maps, and Arrays.
   *
   * @returns true if the resulting top-level value differed from the
   * previous one under `isEqual` (default `===`).
   */
  update(value: StoreUpdate<T>): boolean {
    if (!this._partialUpdateSupported) {
      throw new Error(
        `Partial updates are not supported for this value type ${typeof this._value}`,
      );
    }

    const storeValueUpdates = pick(value, this._shape.storeValueKeys);
    for (const [key, updateValue] of Object.entries(storeValueUpdates)) {
      const storeValue = this._value[key as keyof T] as StoreValue<unknown>;
      storeValue.update(updateValue as never);
    }

    const nonStoreValueUpdates = pick(value, this._shape.nonStoreValueKeys);
    const newValue = { ...this._value, ...nonStoreValueUpdates };
    return this.set(newValue as T);
  }

  _subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private _buildShape(): Shape<keyof T> {
    const nonStoreValueKeys: (keyof T)[] = [];
    const storeValueKeys: (keyof T)[] = [];
    for (const [k, v] of Object.entries((this._value || {}) as object)) {
      if (v instanceof StoreValue) {
        storeValueKeys.push(k as keyof T);
      } else {
        nonStoreValueKeys.push(k as keyof T);
      }
    }
    return { nonStoreValueKeys, storeValueKeys } as Shape<keyof T>;
  }

  private _buildSnapshot(): InferStoreValueSnapshot<T> {
    if (this._childUnsubs.length === 0) return this._value as InferStoreValueSnapshot<T>;
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._value as object)) {
      resolved[k] = v instanceof StoreValue ? v.value : v;
    }
    return resolved as InferStoreValueSnapshot<T>;
  }

  _getSnapshot(): InferStoreValueSnapshot<T> {
    if (__DEBUG__ && this._debug) {
      console.log(`[StoreValue]: ${this._name} getting snapshot`, {
        snapshot: this._snapshot,
        childUnsubs: this._childUnsubs.length,
      });
    }
    return this._snapshot;
  }

  emitChange() {
    this._snapshot = this._buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Create a memoised projection of this store. Designed for
   * `useSyncExternalStore` against composed stores: the parent re-emits on
   * every child change, but `getSnapshot()` only returns a new reference
   * when `selector(snapshot)` actually differs under `isEqual`
   * (default: `Object.is`). React then bails out of the re-render.
   *
   * The returned `{ subscribe, getSnapshot }` is intended to be memoised
   * by the consumer (e.g. behind `useMemo`) so React keeps a stable
   * subscription across renders.
   */
  select<R>(
    selector: (snapshot: InferStoreValueSnapshot<T>) => R,
    isEqual: (a: R, b: R) => boolean = Object.is,
  ): {
    subscribe: (listener: () => void) => () => void;
    getSnapshot: () => R;
  } {
    let cached: { value: R } | null = null;
    return {
      subscribe: this.subscribe,
      getSnapshot: () => {
        const next = selector(this._snapshot);
        if (cached !== null && isEqual(cached.value, next)) return cached.value;
        cached = { value: next };
        return next;
      },
    };
  }

  private _watchChildren(value: T): void {
    this._childUnsubs.forEach((u) => u());
    this._childUnsubs = [];
    if (typeof value !== "object" || value === null) {
      if (__DEBUG__ && this._debug) {
        console.log(`[StoreValue]: ${this._name} has no children to watch`);
      }
      return;
    }
    for (const child of Object.values(value as object)) {
      if (child instanceof StoreValue) {
        this._childUnsubs.push(child._subscribe(() => this.emitChange()));
      }
    }
    if (__DEBUG__ && this._debug) {
      console.log(
        `[StoreValue]: ${this._name} is now watching ${this._childUnsubs.length} children`,
      );
    }
  }
}
