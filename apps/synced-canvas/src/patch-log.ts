import { useEffect, useState } from "react";
import type { StoreValue } from "@super-store/store";
import { currentOrigin, type PatchOrigin } from "./origin";
import type { Board, Shape } from "./store";

// A live, capped log of decoded changes — derived purely from super-store
// snapshots (no Yjs `observeDeep`). On each change we diff the new board
// snapshot against the previous one and tag it by origin: local edits default to
// "local", remote merges carry the super-line message's origin (set via
// `withOrigin` in sync.ts). The one-time catch-up is tagged "sync" and skipped.

export interface PatchEntry {
  id: number;
  origin: PatchOrigin;
  at: number;
  changes: string[];
}

function fmt(v: unknown): string {
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

function diffShapes(a: Record<string, Shape>, b: Record<string, Shape>): string[] {
  const out: string[] = [];
  for (const id of Object.keys(b)) {
    const next = b[id]!;
    const prev = a[id];
    if (!prev) {
      out.push(`add ${id}`);
      continue;
    }
    for (const k of Object.keys(next) as (keyof Shape)[]) {
      if (prev[k] !== next[k]) out.push(`${id}/${k}: ${fmt(prev[k])} → ${fmt(next[k])}`);
    }
  }
  for (const id of Object.keys(a)) if (!(id in b)) out.push(`delete ${id}`);
  return out;
}

export function usePatchLog(board: StoreValue<Board>): PatchEntry[] {
  const [log, setLog] = useState<PatchEntry[]>([]);
  useEffect(() => {
    let n = 0;
    let prev = board.getSnapshot();
    return board.subscribe(() => {
      const next = board.getSnapshot();
      const origin = currentOrigin();
      const changes = diffShapes(prev, next);
      prev = next;
      if (origin === "sync" || changes.length === 0) return;
      n += 1;
      const entry: PatchEntry = { id: n, origin, at: Date.now(), changes };
      setLog((p) => [entry, ...p].slice(0, 50));
    });
  }, [board]);
  return log;
}
