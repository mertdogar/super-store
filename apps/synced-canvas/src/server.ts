import http from "node:http";
import { createSuperLineServer } from "@super-line/server";
import { webSocketServerTransport } from "@super-line/transport-websocket";
import type { StoreValue } from "@super-store/store";
import { canvas } from "./contract";
import { fromB64, toB64 } from "./b64";
import { createBoard, moveShape, type Board } from "./store";

const PORT = Number(process.env.PORT ?? 8788);
const server = http.createServer();

// In-memory persistence: docId -> encoded state. This is the only "store" in the
// demo; swap it for a file / DB / Redis to survive a restart. The document of
// record lives HERE, not on any client.
const store = new Map<string, Uint8Array>();
const boards = new Map<string, StoreValue<Board>>();

const srv = createSuperLineServer(canvas, {
  transports: [webSocketServerTransport({ server })],
  authenticate: (h) => {
    const name = h.query.name?.trim();
    if (!name) throw new Error("name is required");
    return { role: "user" as const, ctx: { name } };
  },
});

// Materialise the canonical board for a room and hydrate it from the store. The
// SAME super-store primitive runs here as in the browser. Its update stream is
// the single fan-out + persist point — it fires for both client-pushed merges
// and the server's own (co-writer) edits, so there's exactly one path out.
// `local` distinguishes them: a server-side write is the co-writer ('server'),
// an applied client update is a relay ('peer').
function getBoard(docId: string): StoreValue<Board> {
  const existing = boards.get(docId);
  if (existing) return existing;
  const board = createBoard();
  const saved = store.get(docId);
  if (saved) board.applyUpdate(saved);
  board.onUpdate((bytes, { local }) => {
    store.set(docId, board.encodeState());
    const origin = local ? "server" : "peer";
    srv.room(`doc:${docId}`).broadcast("update", { docId, update: toB64(bytes), origin });
  });
  boards.set(docId, board);
  return board;
}

srv.implement({
  user: {
    joinDoc: async ({ docId }, _ctx, conn) => {
      const board = getBoard(docId);
      srv.room(`doc:${docId}`).add(conn);
      return { snapshot: toB64(board.encodeState()) };
    },
    pushUpdate: async ({ docId, update }) => {
      // Applying an update the doc already has is an idempotent no-op (CRDT), so
      // echoing a client's own update back is harmless — no special-casing.
      getBoard(docId).applyUpdate(fromB64(update));
      return { ok: true };
    },
    serverNudge: async ({ docId }) => {
      // The server is a co-writer: it mutates the canonical board directly via
      // the same helpers the client uses, and the update stream broadcasts it to
      // every client exactly like another user's edit.
      const board = getBoard(docId);
      const ids = Object.keys(board.getSnapshot());
      const id = ids[Math.floor(Math.random() * ids.length)];
      if (id) {
        moveShape(board, id, Math.round(Math.random() * 340), Math.round(Math.random() * 320));
      }
      return { ok: true };
    },
  },
});

server.listen(PORT, () => {
  console.log(`synced-canvas (super-store) server on ws://localhost:${PORT}`);
});
