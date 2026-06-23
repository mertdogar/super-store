import type { PatchEntry } from "./patch-log";

// Read-only debug side panel: a live JSON mirror of the synced state (straight
// from `useStore`) + a capped log of recent decoded patches, each tagged by
// origin (local / peer / server) so you can watch the server's nudge land as a
// "server" patch and a peer's edit land as "peer".
export function DebugPanel({ state, patches }: { state: unknown; patches: PatchEntry[] }) {
  return (
    <aside className="panel">
      <section className="panel-state">
        <h2>state</h2>
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </section>
      <section className="panel-patches">
        <h2>
          patches <span className="muted">· {patches.length}</span>
        </h2>
        <ul>
          {patches.map((p, i) => (
            <li key={p.id} className={i === 0 ? "latest" : undefined}>
              <span className={`origin origin-${p.origin}`}>{p.origin}</span>
              <code>{p.changes.join("\n")}</code>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
