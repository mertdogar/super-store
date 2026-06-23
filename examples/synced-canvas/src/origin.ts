// The patch log needs to tag each change by where it came from. super-store only
// knows local-vs-remote; the peer/server distinction comes from the super-line
// message. We thread it without Yjs: the sync layer wraps each remote
// `applyUpdate` in `withOrigin(...)`, and because super-store fires its listeners
// synchronously inside that call, the logger reads `currentOrigin()` to label the
// resulting diff. Local user edits run outside any wrapper, so they default to
// "local".

export type PatchOrigin = "local" | "peer" | "server" | "sync";

let current: PatchOrigin = "local";

export function withOrigin<T>(origin: PatchOrigin, fn: () => T): T {
  const prev = current;
  current = origin;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

export function currentOrigin(): PatchOrigin {
  return current;
}
