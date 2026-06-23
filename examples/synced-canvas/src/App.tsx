import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createSuperLineClient } from "@super-line/client";
import { webSocketClientTransport } from "@super-line/transport-websocket";
import { useStore, useStoreSelector } from "@super-store/react";
import { StoreValue } from "@super-store/store";
import { canvas } from "./contract";
import { Provider, useRequest } from "./hooks";
import { useBoardSync } from "./sync";
import { usePatchLog } from "./patch-log";
import { DebugPanel } from "./DebugPanel";
import {
  addShape,
  bringToFront,
  createBoard,
  deleteShape,
  moveShape,
  readShapes,
  type Board,
  type Shape,
} from "./store";

const WS_URL = "ws://localhost:8788";
const DOC_ID = "board";
const GRID = 24;

export function App() {
  const [name] = useState(() => `user-${Math.random().toString(36).slice(2, 6)}`);
  const [client] = useState(() =>
    createSuperLineClient(canvas, {
      transport: webSocketClientTransport({ url: WS_URL }),
      role: "user",
      params: { name },
    }),
  );
  // Undo is opt-in per root — only this client's own edits are tracked; remote
  // merges are never undone.
  const [board] = useState(() => createBoard({ undo: true }));
  useEffect(() => () => client.close(), [client]);

  return (
    <Provider client={client}>
      <BoardView board={board} me={name} />
    </Provider>
  );
}

// `useStoreSelector` re-renders this ONLY when the projection (the shape count)
// changes, not on every drag. Wrapped in `memo` with a stable `board` prop, so a
// parent re-render (which happens on every pointermove) doesn't reach it — the
// "selector renders" counter visibly stays put while you drag.
const ShapeCount = memo(function ShapeCount({ board }: { board: StoreValue<Board> }) {
  const count = useStoreSelector(board, (s) => Object.keys(s).length);
  const renders = useRef(0);
  renders.current += 1;
  return (
    <span className="muted">
      {count} shapes · selector renders: {renders.current}
    </span>
  );
});

function BoardView({ board, me }: { board: StoreValue<Board>; me: string }) {
  useBoardSync(board);
  const snapshot = useStore(board);
  const patches = usePatchLog(board);
  const shapes = readShapes(snapshot);
  const { call: serverNudge } = useRequest("serverNudge");

  // Local-only, per-client UI state: an UNBOUND StoreValue that is never synced.
  // Toggling snap-to-grid does not touch the collaborative doc.
  const [ui] = useState(() => new StoreValue({ snap: false }));
  const { snap } = useStore(ui);

  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>, s: Shape): void => {
    bringToFront(board, s.id);
    const rect = boardRef.current?.getBoundingClientRect();
    drag.current = {
      id: s.id,
      dx: e.clientX - (rect?.left ?? 0) - s.x,
      dy: e.clientY - (rect?.top ?? 0) - s.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    const rect = boardRef.current?.getBoundingClientRect();
    let x = Math.max(0, Math.round(e.clientX - (rect?.left ?? 0) - d.dx));
    let y = Math.max(0, Math.round(e.clientY - (rect?.top ?? 0) - d.dy));
    if (snap) {
      x = Math.round(x / GRID) * GRID;
      y = Math.round(y / GRID) * GRID;
    }
    moveShape(board, d.id, x, y);
  };

  const onPointerUp = (): void => {
    drag.current = null;
  };

  return (
    <div className="wrap">
      <header>
        <strong>synced canvas · super-store</strong>
        <span>
          you are <b>{me}</b> ·{" "}
        </span>
        <ShapeCount board={board} />
        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={snap} onChange={() => ui.set({ snap: !snap })} />
            snap to grid
          </label>
          <button onClick={() => board.undo()} disabled={!board.canUndo}>
            Undo
          </button>
          <button onClick={() => board.redo()} disabled={!board.canRedo}>
            Redo
          </button>
          <button onClick={() => addShape(board)}>Add shape</button>
          <button onClick={() => void serverNudge({ docId: DOC_ID }).catch(() => {})}>
            Server nudge
          </button>
        </div>
      </header>
      <div className="main">
        <div className="board" ref={boardRef}>
          {shapes.map((s) => (
            <div
              key={s.id}
              className="shape"
              style={{ left: s.x, top: s.y, background: s.color, zIndex: s.order }}
              onPointerDown={(e) => onPointerDown(e, s)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onDoubleClick={() => deleteShape(board, s.id)}
              title="drag to move · double-click to delete"
            >
              {s.label}
            </div>
          ))}
        </div>
        <DebugPanel state={snapshot} patches={patches} />
      </div>
      <footer>
        Open this page in two windows. Drag shapes, “Add shape”, hit “Server nudge”, then “Undo”.
        State persists on the server across reloads.
      </footer>
    </div>
  );
}
