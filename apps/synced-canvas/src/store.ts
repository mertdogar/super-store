import { StoreValue } from "@super-store/store";

// The synced state: a board of shapes. Each shape is its OWN nested StoreValue
// (→ nested Y.Map), so concurrent edits to different fields of the same shape
// (one user drags, another recolors) merge per-field instead of clobbering the
// whole object. Shapes live in a keyed map `{ id -> shape }`, NOT a positional
// array — z-order is a per-shape `order` field, sorted at read time, so a
// "bring to front" is one last-writer-wins write and concurrent reorders can't
// duplicate/lose a shape.

export interface Shape {
  id: string;
  x: number;
  y: number;
  color: string;
  label: string;
  order: number;
}

export type Board = Record<string, StoreValue<Shape>>;

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

/** A board store. `name` is the doc root key — client and server share it so
 * their docs converge. Undo is opt-in (client enables it; the server doesn't). */
export function createBoard(opts?: { undo?: boolean }): StoreValue<Board> {
  return new StoreValue<Board>({}, { name: "shapes", undo: opts?.undo });
}

export function readShapes(snapshot: Record<string, Shape>): Shape[] {
  return Object.values(snapshot).sort((a, b) => a.order - b.order);
}

function topOrder(board: StoreValue<Board>): number {
  let max = 0;
  for (const s of Object.values(board.getSnapshot())) max = Math.max(max, s.order);
  return max + 1;
}

export function addShape(board: StoreValue<Board>): void {
  const id = `S_${Math.random().toString(36).slice(2, 8)}`;
  const color = COLORS[Math.floor(Math.random() * COLORS.length)] ?? "#888";
  const shape: Shape = {
    id,
    x: Math.round(Math.random() * 340),
    y: Math.round(Math.random() * 320),
    color,
    label: id.slice(2),
    order: topOrder(board),
  };
  // Spread the handle tree (existing children keep their identity — no rewrite)
  // and add the new shape as a fresh nested StoreValue.
  board.set({ ...board.value, [id]: new StoreValue(shape) });
}

export function moveShape(board: StoreValue<Board>, id: string, x: number, y: number): void {
  // Per-field update on the shape's own nested store → merges with a concurrent
  // recolor of the same shape.
  board.value[id]?.update({ x, y });
}

export function bringToFront(board: StoreValue<Board>, id: string): void {
  board.value[id]?.update({ order: topOrder(board) });
}

export function deleteShape(board: StoreValue<Board>, id: string): void {
  const next = { ...board.value };
  delete next[id];
  board.set(next);
}
