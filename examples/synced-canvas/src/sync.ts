import { useEffect } from "react";
import type { StoreValue } from "@super-store/store";
import { useEvent, useRequest } from "./hooks";
import { fromB64, toB64 } from "./b64";
import { withOrigin } from "./origin";
import type { Board } from "./store";

const DOC_ID = "board";

// The ONLY place CRDT bytes move — and it never imports yjs. Push local edits
// up; apply fanned-out merges (and the catch-up snapshot) down. `board.onUpdate`'s
// `local` flag breaks the echo: applied remote merges report `local:false` and
// are not pushed back.
export function useBoardSync(board: StoreValue<Board>): void {
  const { call: joinDoc } = useRequest("joinDoc");
  const { call: pushUpdate } = useRequest("pushUpdate");

  useEffect(() => {
    const off = board.onUpdate((bytes, { local }) => {
      if (local) void pushUpdate({ docId: DOC_ID, update: toB64(bytes) }).catch(() => {});
    });
    // Catch up to the server's current state; tagged 'sync' so it stays out of
    // the patch log.
    void joinDoc({ docId: DOC_ID })
      .then(({ snapshot }) => withOrigin("sync", () => board.applyUpdate(fromB64(snapshot))))
      .catch(() => {});
    return off;
  }, [board, joinDoc, pushUpdate]);

  // Updates the server fans out, tagged by origin (other clients = 'peer',
  // server co-writer = 'server').
  useEvent("update", (msg) => {
    if (msg.docId !== DOC_ID) return;
    withOrigin(msg.origin, () => board.applyUpdate(fromB64(msg.update)));
  });
}
