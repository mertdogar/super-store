# Use with your AI agent

super-store ships an **agent skill** so coding agents write correct StoreValue code without guessing. The skill lives at `skills/super-store/` in the repo and the docs themselves are LLM-friendly. Pick the section for your agent below.

## Claude Code

The skill is a Claude Code skill: `SKILL.md` (loaded on demand) plus `REFERENCE.md` (the full API) and `RECIPES.md` (collaboration, persistence, undo, React patterns). Install it into your project:

```bash
npx degit mertdogar/super-store/skills/super-store .claude/skills/super-store
```

Commit `.claude/skills/super-store/` so the whole team shares it. Claude Code discovers the skill from its YAML frontmatter and loads `REFERENCE.md` / `RECIPES.md` only when a task needs them.

## Cursor

Cursor reads rules from `.cursor/rules/*.mdc`. Drop the condensed `AGENTS.md` there:

```bash
mkdir -p .cursor/rules
curl -fsSL https://raw.githubusercontent.com/mertdogar/super-store/main/skills/super-store/AGENTS.md \
  -o .cursor/rules/super-store.mdc
```

## GitHub Copilot

Copilot reads `.github/instructions/*.instructions.md`. Use the same condensed `AGENTS.md`:

```bash
mkdir -p .github/instructions
curl -fsSL https://raw.githubusercontent.com/mertdogar/super-store/main/skills/super-store/AGENTS.md \
  -o .github/instructions/super-store.instructions.md
```

## Any other agent

`AGENTS.md` is a single self-contained file most agents can read from the repo root. Place it where your agent looks for instructions:

```bash
curl -fsSL https://raw.githubusercontent.com/mertdogar/super-store/main/skills/super-store/AGENTS.md \
  -o AGENTS.md
```

## Point an agent at these docs

Every docs page is published as plain Markdown — append `.md` to any page URL:

```
https://mertdogar.github.io/super-store/guide/ai-agents.md
```

For whole-site context, two manifests are published at the docs root:

| File | URL | Use |
| --- | --- | --- |
| `llms.txt` | `https://mertdogar.github.io/super-store/llms.txt` | A short index of pages with links — point an agent here to navigate. |
| `llms-full.txt` | `https://mertdogar.github.io/super-store/llms-full.txt` | The entire docs concatenated — paste into context for a one-shot answer. |

Fetch the full corpus for an agent that takes a URL or a pasted blob:

```bash
curl -fsSL https://mertdogar.github.io/super-store/llms-full.txt
```

## What the agent should know

The skill encodes the rules that keep StoreValue code correct. The essentials, in agent-ready form:

- Import from the right package — the primitive and the symbol from `@super-store/store`, the hooks from `@super-store/react`:

  ```ts
  import { StoreValue, STORE_ORIGIN } from "@super-store/store"
  import { useStore, useStoreSelector } from "@super-store/react"
  ```

- Write through `set` / `update`, never by mutating `store.value`. In-place mutation yields a stale snapshot and, in bound mode, silently fails to converge.

  ```ts
  const pos = new StoreValue({ x: 0, y: 0 })
  pos.set({ x: 10, y: 0 })        // diff-and-patch in one transaction
  pos.update({ x: 20 })           // object stores only: merge plain keys
  ```

- `set` returns `true` only when data actually changed; a structurally-identical `set` is a no-op (returns `false`, no emit).

- Pass the store's pre-bound `subscribe` / `getSnapshot` straight through — never wrap them:

  ```ts
  function Coords({ pos }: { pos: StoreValue<{ x: number; y: number }> }) {
    const { x, y } = useStore(pos)
    return <span>{x}, {y}</span>
  }
  ```

- For per-field CRDT merge on a sub-object, make it a nested `StoreValue`, not a plain object — plain nested objects are stored opaquely and replaced wholesale.

- Collaboration and persistence move Yjs update bytes through the sync surface — no `yjs` import in app code:

  ```ts
  store.onUpdate((update, { local }) => { if (local) bus.send({ update }) })
  bus.on("update", ({ update }) => store.applyUpdate(update))
  ```
