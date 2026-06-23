import * as Y from "yjs";
import {
  APPLY_ORIGIN,
  STORE_ORIGIN,
  StoreValue,
  type StoreMode,
  type StoreValueOptions,
} from "./store-value";

/** Per-root options — everything `StoreValue` takes except `doc`/`name`, which
 * the `Store` supplies (the shared doc, and the root name). */
export type StoreRootOptions<T, M extends StoreMode = "shallow"> = Omit<
  StoreValueOptions<T, M>,
  "doc" | "name"
>;

/**
 * A `Store` owns one `Y.Doc` and mints **named-root** `StoreValue`s on it, so
 * users compose a document from independently-defined sub-stores without ever
 * importing yjs or hand-building a `Y.Doc`. Named roots are deterministic across
 * peers (`doc.getMap(name)`), so concurrently-constructed roots merge instead of
 * orphaning each other (unlike nested-`Y.Map` embedding). See DESIGN §2.
 *
 * - `root(name, seed, opts)` — define a slice where it belongs (settings-land
 *   constructs the settings root); the top level never sees its schema.
 * - `export()` / `load()` — the rare whole-document read/write (save/restore).
 * - `encodeState` / `applyUpdate` / `onUpdate` — the doc-level sync surface for
 *   `@super-line/store-sync`; one stream carries every root.
 * - `doc` — escape hatch for attaching providers (`y-indexeddb`, `y-websocket`).
 */
export class Store {
  private readonly _doc: Y.Doc;
  private readonly _ownsDoc: boolean;
  private readonly _roots = new Map<string, StoreValue<unknown, StoreMode>>();

  constructor(doc?: Y.Doc) {
    this._doc = doc ?? new Y.Doc();
    this._ownsDoc = doc === undefined;
  }

  /** The backing document. Attach persistence/sync providers here if you need
   * raw Yjs providers instead of the `@super-line/store-sync` surface. */
  get doc(): Y.Doc {
    return this._doc;
  }

  /** Define (or return the existing handle for) a named root on this doc.
   * Idempotent per name — calling twice returns the same handle, so the same
   * concern can be set up from one place without double-binding. */
  root<T, M extends StoreMode = "shallow">(
    name: string,
    seed: T,
    options?: StoreRootOptions<T, M>,
  ): StoreValue<T, M> {
    const existing = this._roots.get(name);
    if (existing) return existing as StoreValue<T, M>;
    const sv = new StoreValue<T, M>(seed, {
      ...(options as StoreValueOptions<T, M>),
      doc: this._doc,
      name,
    });
    this._roots.set(name, sv as StoreValue<unknown, StoreMode>);
    return sv;
  }

  /** Gather every registered root into one plain-JSON object keyed by root name.
   * The rare whole-document read (export/save). */
  export(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [name, sv] of this._roots) out[name] = sv.getSnapshot();
    return out;
  }

  /** Route each top-level key to its registered root's `set()`. Whole-document
   * restore (loadScene); unknown keys are ignored. One transaction → one update. */
  load(data: Record<string, unknown>): void {
    this._doc.transact(() => {
      for (const [name, value] of Object.entries(data)) {
        this._roots.get(name)?.set(value as never);
      }
    }, STORE_ORIGIN);
  }

  /** Full doc state as one update, for catch-up or persistence. */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this._doc);
  }

  /** Merge a remote update. Tagged so `onUpdate` reports it as not-local. */
  applyUpdate(update: Uint8Array): void {
    Y.applyUpdate(this._doc, update, APPLY_ORIGIN);
  }

  /** Observe outgoing updates for the whole doc. `meta.local` is `false` only
   * for updates injected via `applyUpdate` — so a sync layer pushes local
   * updates and never echoes remote merges. Returns an unsubscribe. */
  onUpdate(listener: (update: Uint8Array, meta: { local: boolean }) => void): () => void {
    const handler = (update: Uint8Array, origin: unknown) => {
      listener(update, { local: origin !== APPLY_ORIGIN });
    };
    this._doc.on("update", handler);
    return () => this._doc.off("update", handler);
  }

  /** Dispose every root and, if this `Store` created the doc, destroy it. */
  dispose(): void {
    for (const sv of this._roots.values()) sv.dispose();
    this._roots.clear();
    if (this._ownsDoc) this._doc.destroy();
  }
}

/** Create a `Store` that owns a private `Y.Doc` (no yjs import needed). Pass an
 * existing doc only if you must share it with code that already holds one. */
export function createStore(doc?: Y.Doc): Store {
  return new Store(doc);
}
