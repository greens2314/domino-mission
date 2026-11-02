import { BOARD_D, BOARD_W, BRICK_HEIGHT, DOMINO_HEIGHT, footprint, isBrick } from './catalog';
import type { BoardPiece, Cell, PieceKind, Rotation } from './types';

export const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
export const key2 = (x: number, y: number) => `${x},${y}`;

/** Cells (at the piece's own z layer) covered by a piece footprint. */
export function footprintCells(kind: PieceKind, x: number, y: number, rotation: Rotation): { x: number; y: number }[] {
  const { w, d } = footprint(kind, rotation);
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) cells.push({ x: x + i, y: y + j });
  return cells;
}

export function pieceHeight(kind: PieceKind): number {
  return isBrick(kind) ? BRICK_HEIGHT : DOMINO_HEIGHT;
}

/** All 3D cells a piece occupies (bricks: 1 layer; dominoes: 2 layers). */
export function occupiedCells(p: BoardPiece): Cell[] {
  const h = pieceHeight(p.kind);
  const out: Cell[] = [];
  for (const c of footprintCells(p.kind, p.x, p.y, p.rotation)) {
    for (let k = 0; k < h; k++) out.push({ x: c.x, y: c.y, z: p.z + k });
  }
  return out;
}

export type Occupancy = {
  /** 3D cell -> piece id */
  cells: Map<string, string>;
  /** 2D column -> top surface height (0 = ground), counting bricks and dominoes */
  top: Map<string, number>;
  /** 2D column -> top surface made of bricks only (stackable surface) */
  brickTop: Map<string, number>;
  byId: Map<string, BoardPiece>;
};

export function buildOccupancy(board: BoardPiece[]): Occupancy {
  const cells = new Map<string, string>();
  const top = new Map<string, number>();
  const brickTop = new Map<string, number>();
  const byId = new Map<string, BoardPiece>();
  for (const p of board) {
    byId.set(p.id, p);
    for (const c of occupiedCells(p)) {
      cells.set(key(c.x, c.y, c.z), p.id);
      const k2 = key2(c.x, c.y);
      top.set(k2, Math.max(top.get(k2) ?? 0, c.z + 1));
      if (isBrick(p.kind)) brickTop.set(k2, Math.max(brickTop.get(k2) ?? 0, c.z + 1));
    }
  }
  return { cells, top, brickTop, byId };
}

export function inBoard(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < BOARD_W && y < BOARD_D;
}

export type PlacementCheck =
  | { ok: true; z: number }
  | { ok: false; reason: string };

/**
 * Where would a piece land if placed at (x, y, rotation)?
 * Rules:
 *  - whole footprint inside the board
 *  - z = highest brick surface under the footprint (dominoes are not a surface)
 *  - no column under the footprint may contain anything taller than that z (no intersecting)
 *  - a domino cannot stand on another domino; a brick cannot rest on a domino
 */
export function checkPlacement(
  board: BoardPiece[],
  kind: PieceKind,
  x: number,
  y: number,
  rotation: Rotation,
  ignoreId?: string,
): PlacementCheck {
  const cells = footprintCells(kind, x, y, rotation);
  for (const c of cells) if (!inBoard(c.x, c.y)) return { ok: false, reason: '超出施工板範圍' };

  const filtered = ignoreId ? board.filter((p) => p.id !== ignoreId) : board;
  const occ = buildOccupancy(filtered);

  let z = 0;
  for (const c of cells) z = Math.max(z, occ.brickTop.get(key2(c.x, c.y)) ?? 0);

  const h = pieceHeight(kind);
  for (const c of cells) {
    const columnTop = occ.top.get(key2(c.x, c.y)) ?? 0;
    if (columnTop > z) {
      return { ok: false, reason: '該位置已有物件，無法重疊放置' };
    }
    for (let k = 0; k < h; k++) {
      if (occ.cells.has(key(c.x, c.y, z + k))) return { ok: false, reason: '該位置已有物件，無法重疊放置' };
    }
  }
  return { ok: true, z };
}

/** Ids of pieces that rest (directly) on top of the given piece. */
export function piecesAbove(board: BoardPiece[], id: string): string[] {
  const occ = buildOccupancy(board);
  const p = occ.byId.get(id);
  if (!p) return [];
  const h = pieceHeight(p.kind);
  const above = new Set<string>();
  for (const c of footprintCells(p.kind, p.x, p.y, p.rotation)) {
    const other = occ.cells.get(key(c.x, c.y, p.z + h));
    if (other && other !== id) above.add(other);
  }
  return [...above];
}

/** Height (in layers) of the tallest stack at a column. */
export function columnHeight(board: BoardPiece[], x: number, y: number): number {
  const occ = buildOccupancy(board);
  return occ.top.get(key2(x, y)) ?? 0;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
