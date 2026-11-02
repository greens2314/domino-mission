import { BOARD_D, BOARD_W, BRICK_HEIGHT, DOMINO_HEIGHT, dominoDir, footprint, isBrick } from './catalog';
import type { BoardPiece, Cell, PieceKind, Rotation } from './types';

export const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
export const key2 = (x: number, y: number) => `${x},${y}`;
/** key in half-cell units (dominoes may sit on 0.5 positions) */
export const hkey = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;

/* ---------- domino geometry ----------
 * A domino is a thin tile: DOMINO_THICK along its fall direction, DOMINO_WIDE across it,
 * centred at (x + 0.5, y + 0.5). x / y may be multiples of 0.5 along the fall axis,
 * so chains can be packed at 0.5 cm spacing; across the fall axis the tile is ~0.8 cm wide,
 * so side-by-side dominoes stay on whole cells.
 */
export const DOMINO_THICK = 0.36;
export const DOMINO_WIDE = 0.82;

export type Box = { minX: number; maxX: number; minY: number; maxY: number };

export function dominoBox(x: number, y: number, rotation: Rotation): Box {
  const { dx } = dominoDir(rotation);
  const alongX = dx !== 0;
  const hx = alongX ? DOMINO_THICK / 2 : DOMINO_WIDE / 2;
  const hy = alongX ? DOMINO_WIDE / 2 : DOMINO_THICK / 2;
  const cx = x + 0.5, cy = y + 0.5;
  return { minX: cx - hx, maxX: cx + hx, minY: cy - hy, maxY: cy + hy };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

/** Whole cells touched by a box. */
function cellsOfBox(b: Box): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const eps = 1e-6;
  for (let x = Math.floor(b.minX + eps); x <= Math.floor(b.maxX - eps); x++) {
    for (let y = Math.floor(b.minY + eps); y <= Math.floor(b.maxY - eps); y++) out.push({ x, y });
  }
  return out;
}

/** Cells (at the piece's own z layer) covered by a piece footprint. */
export function footprintCells(kind: PieceKind, x: number, y: number, rotation: Rotation): { x: number; y: number }[] {
  if (kind === 'domino') return cellsOfBox(dominoBox(x, y, rotation));
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
  /** 3D cell -> piece id (for dominoes: the last one registered; use `dominoesAt` for all) */
  cells: Map<string, string>;
  /** 3D cell -> ids of dominoes touching that cell */
  dominoesAt: Map<string, string[]>;
  /** 2D column -> top surface height (0 = ground), counting bricks and dominoes */
  top: Map<string, number>;
  /** 2D column -> top surface made of bricks only (stackable surface) */
  brickTop: Map<string, number>;
  byId: Map<string, BoardPiece>;
};

export function buildOccupancy(board: BoardPiece[]): Occupancy {
  const cells = new Map<string, string>();
  const dominoesAt = new Map<string, string[]>();
  const top = new Map<string, number>();
  const brickTop = new Map<string, number>();
  const byId = new Map<string, BoardPiece>();
  for (const p of board) {
    byId.set(p.id, p);
    for (const c of occupiedCells(p)) {
      const k = key(c.x, c.y, c.z);
      cells.set(k, p.id);
      if (p.kind === 'domino') {
        const list = dominoesAt.get(k) ?? [];
        list.push(p.id);
        dominoesAt.set(k, list);
      }
      const k2 = key2(c.x, c.y);
      top.set(k2, Math.max(top.get(k2) ?? 0, c.z + 1));
      if (isBrick(p.kind)) brickTop.set(k2, Math.max(brickTop.get(k2) ?? 0, c.z + 1));
    }
  }
  return { cells, dominoesAt, top, brickTop, byId };
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
 *  - bricks: no column under the footprint may contain anything taller than that z
 *  - dominoes: must stand on one level surface, may not overlap bricks or other dominoes
 *    (tile boxes), but may share a cell with another domino at a different half position
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

  if (kind === 'domino') {
    const tops = cells.map((c) => occ.brickTop.get(key2(c.x, c.y)) ?? 0);
    const z = tops[0];
    if (tops.some((t) => t !== z)) return { ok: false, reason: '骨牌必須完整站在同一高度的面上' };
    // bricks in the way (anything that is a brick at z or z+1 within our cells)
    for (const c of cells) {
      for (let k = 0; k < DOMINO_HEIGHT; k++) {
        const id = occ.cells.get(key(c.x, c.y, z + k));
        if (id && isBrick(occ.byId.get(id)!.kind)) return { ok: false, reason: '該位置已有積木，無法放置' };
      }
    }
    // other dominoes: tile boxes must not overlap
    const box = dominoBox(x, y, rotation);
    for (const p of filtered) {
      if (p.kind !== 'domino' || p.z !== z) continue;
      if (boxesOverlap(box, dominoBox(p.x, p.y, p.rotation))) return { ok: false, reason: '與另一枚骨牌重疊，請再靠近或遠離一點' };
    }
    return { ok: true, z };
  }

  let z = 0;
  for (const c of cells) z = Math.max(z, occ.brickTop.get(key2(c.x, c.y)) ?? 0);
  const h = pieceHeight(kind);
  for (const c of cells) {
    const columnTop = occ.top.get(key2(c.x, c.y)) ?? 0;
    if (columnTop > z) return { ok: false, reason: '該位置已有物件，無法重疊放置' };
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
    for (const d of occ.dominoesAt.get(key(c.x, c.y, p.z + h)) ?? []) if (d !== id) above.add(d);
  }
  return [...above];
}

/** Height (in layers) of the tallest stack at a column. */
export function columnHeight(board: BoardPiece[], x: number, y: number): number {
  const occ = buildOccupancy(board);
  return occ.top.get(key2(Math.floor(x), Math.floor(y))) ?? 0;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
