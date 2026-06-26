# Changelog

## 0.3.1

### Fixed

- Unbound (in-memory) `StoreValue` no longer throws `Unsupported type` when a nested child is a
  `StoreValue` **subclass** or when the package is consumed from the **bundled `dist`** (where the
  class is emitted as `_StoreValue`). The child clone-skip detection (`isOneOfSpecialTypes`) is now
  identity-based (`instanceof StoreValue`) instead of relying on the fragile `constructor.name`
  string, matching the `instanceof` checks already used everywhere else in the class.
- As a side effect, a nested inert child that isn't a plain object (`Date`, `RegExp`, typed array)
  is now `structuredClone`d instead of throwing. `Set` / `Map` / `Array` children are still kept by
  reference, unchanged.
