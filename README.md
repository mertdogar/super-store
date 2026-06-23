<div align="center">
  <img src="docs/public/mark.svg" width="64" height="64" alt="super-store" />
  <h1>super-store</h1>
  <p><strong>A reactive store, quietly backed by a CRDT.</strong></p>
  <p>Write it like in-memory state. Get real-time collaboration, offline persistence, and undo/redo — opt-in, behind the same API.</p>
  <p>
    <a href="https://mertdogar.github.io/super-store/">Docs</a> ·
    <a href="https://mertdogar.github.io/super-store/guide/getting-started">Getting started</a> ·
    <a href="examples/synced-canvas">Example</a>
  </p>
</div>

---

`StoreValue<T>` is a typed handle that behaves like a normal in-memory store — until you give it a
document. Then the *same* handle is a [Yjs](https://yjs.dev) CRDT: reads stay synchronous, writes stay a
method call, and concurrent edits merge. Yjs stays hidden, even across the network.

```ts
import { StoreValue } from "@super-store/store"

// Fully local — identical to an in-memory store:
const counter = new StoreValue(0)
counter.subscribe(() => console.log(counter.getSnapshot()))
counter.set(1) // logs 1
counter.set(1) // no-op

// Make it collaborative — same API, opt-in. Relay bytes over any transport, no yjs import:
counter.onUpdate((update, { local }) => { if (local) bus.send(update) })
bus.on("message", (update) => counter.applyUpdate(update))
```

## Packages

| Package | What it is |
| --- | --- |
| [`@super-store/store`](packages/store) | The `StoreValue` primitive. One runtime dep (`yjs`). No React. |
| [`@super-store/react`](packages/react) | `useStore` / `useStoreSelector` — tear-free hooks over `useSyncExternalStore`. |

```bash
pnpm add @super-store/store          # yjs comes with it
pnpm add @super-store/react react    # for the hooks
```

## Why

- **One API, two modes.** A `StoreValue` is a plain value until you bind a doc; then it's a CRDT. Binding
  is lazy and cascades from the root.
- **Real merge.** Backed by Yjs — concurrent edits converge per field, per array slot, per set member.
- **Collaboration without importing Yjs.** `encodeState` / `applyUpdate` / `onUpdate` move CRDT bytes over
  any transport you own; a `{ local }` flag breaks echoes. The wire is a CRDT; your code never sees `Y.*`.
- **Undo that respects peers.** Opt-in per root; only your own edits revert; a remote merge is never undone.
- **Tear-free React.** A cached, reference-stable snapshot; a remote merge re-renders like a local `set()`.

See the [docs](https://mertdogar.github.io/super-store/) for guides and the full API reference.

## Example

[`examples/synced-canvas`](examples/synced-canvas) — a collaborative canvas: shapes synced live across
tabs, a server that persists and co-writes, undo/redo, and an origin-tagged debug panel. State is a
`StoreValue`; the wire is [super-line](https://github.com/mertdogar/super-line). **No `yjs` import in the
app.**

```bash
pnpm --filter @super-store/example-synced-canvas dev   # open http://localhost:5173 in two windows
```

## Use with your AI agent

super-store ships an agent skill so your coding agent writes correct code:

```bash
npx degit mertdogar/super-store/skills/super-store .claude/skills/super-store
```

Other agents: see [`skills/super-store/AGENTS.md`](skills/super-store/AGENTS.md) and the
[guide](https://mertdogar.github.io/super-store/guide/ai-agents).

## Development

```bash
pnpm install
pnpm build          # tsup -> dist (esm + cjs + d.ts) for each package
pnpm test           # vitest across packages
pnpm typecheck      # single root tsc --noEmit
pnpm lint           # oxlint
pnpm docs:dev       # local docs site (typedoc + vitepress)
```

Monorepo layout: `packages/*` (the libraries), `examples/*` (runnable demos), `docs` (the VitePress site).

## License

[MIT](LICENSE) © Mert
