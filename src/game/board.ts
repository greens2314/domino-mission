import { BOARD_D, BOARD_W, BRICK_HEIGHT, DOMINO_HEIGHT, dominoDir, footprint, isBrick } from './catalog';
import type { BoardPiece, Cell, PieceKind, Rotation } from './types';

export const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
export const key2 = (x: number, y: number) => `${x},${y}`;
/** key in half-cell units (dominoes sit on 0.5 positions) */
export const hkey = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;

/* ---------- domino geometry ----------
 * A domino is a thin tile: DOMINO_THICK along its fall direction, DOMINO_WIDE across it,
 * centred at (x + 0.5, y + 0.5) and rotated by `rotation` degrees (0 = +x, 90 = +y).
 * Positions snap to 0.5 cm and rotation to 15°, so chains can curve and interleave;
 * overlap is judged by the rotated tile outlines, not by grid cells.
 */
export const DOMINO_THICK = 0.36;
export const DOMINO_WIDE = 0.82;

export type Pt = { x: number; y: number };

export function dominoCenter(x: number, y: number): Pt {
  return { x: x + 0.5, y: y + 0.5 };
}

/** The four corners of a domino's footprint (rotated rectangle). */
export function dominoCorners(x: number, y: number, rotation: Rotation): Pt[] {
  const { dx, dy } = dominoDir(rotation);
  const c = dominoCenter(x, y);
  const ax = dx * (DOMINO_THICK / 2), ay = dy * (DOMINO_THICK / 2);       // half-extent along the direction
  const bx = -dy * (DOMINO_WIDE / 2), by = dx * (DOMINO_WIDE / 2);        // half-extent across
  return [
    { x: c.x + ax + bx, y: c.y + ay + by },
    { x: c.x + ax - bx, y: c.y + ay - by },
    { x: c.x - ax - bx, y: c.y - ay - by },
    { x: c.x - ax + bx, y: c.y - ay + by },
  ];
}

/** Separating-axis test for two convex quads. */
export function polygonsOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      const nx = -(p2.y - p1.y), ny = p2.x - p1.x;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of a) { const d = p.x * nx + p.y * ny; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const p of b) { const d = p.x * nx + p.y * ny; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (maxA <= minB + 1e-9 || maxB <= minA + 1e-9) return false;
    }
  }
  return true;
}

export function dominoesOverlap(a: BoardPiece, b: BoardPiece): boolean {
  return polygonsOverlap(dominoCorners(a.x, a.y, a.rotation), dominoCorners(b.x, b.y, b.rotation));
}

/** Whole cells touched by a set of points' bounding box. */
function cellsOfPoints(pts: Pt[]): { x: number; y: number }[] {
  const eps = 1e-6;
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  const out: { x: number; y: number }[] = [];
  for (let x = Math.floor(minX + eps); x <= Math.floor(maxX - eps); x++) {
    for (let y = Math.floor(minY + eps); y <= Math.floor(maxY - eps); y++) out.push({ x, y });
  }
  return out;
}

/** Cells (at the piece's own z layer) covered by a piece footprint. */
export function footprintCells(kind: PieceKind, x: number, y: number, rotation: Rotation): { x: number; y: number }[] {
  if (kind === 'domino') return cellsOfPoints(dominoCorners(x, y, rotation));
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
  /** 2D column -> every brick surface height in that column (top of each brick cell) */
  surfaces: Map<string, Set<number>>;
  byId: Map<string, BoardPiece>;
};

export function buildOccupancy(board: BoardPiece[]): Occupancy {
  const cells = new Map<string, string>();
  const dominoesAt = new Map<string, string[]>();
  const top = new Map<string, number>();
  const brickTop = new Map<string, number>();
  const surfaces = new Map<string, Set<number>>();
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
      if (isBrick(p.kind)) {
        brickTop.set(k2, Math.max(brickTop.get(k2) ?? 0, c.z + 1));
        const set = surfaces.get(k2) ?? new Set<number>();
        set.add(c.z + 1);
        surfaces.set(k2, set);
      }
    }
  }
  return { cells, dominoesAt, top, brickTop, surfaces, byId };
}

export function inBoard(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < BOARD_W && y < BOARD_D;
}

export type PlacementCheck =
  | { ok: true; z: number }
  | { ok: false; reason: string };

/**
 * Where would a piece land if placed at (x, y, rotation)?
 *  - whole footprint inside the board
 *  - candidate levels are the ground and every brick surface under the footprint,
 *    so a piece can also go underneath an overhang (e.g. a domino under a gate beam)
 *  - a level is usable when the piece is supported there (domino: every covered cell has a
 *    surface at that level; brick: at least one cell) and the space it needs is free of bricks
 *  - `preferZ` (the pointer's hit height) picks the usable level closest below the pointer;
 *    without it the highest usable level wins
 *  - dominoes may share cells with other dominoes but their rotated outlines may not overlap
 */
export function checkPlacement(
  board: BoardPiece[],
  kind: PieceKind,
  x: number,
  y: number,
  rotation: Rotation,
  ignoreId?: string,
  preferZ?: number,
): PlacementCheck {
  const cells = footprintCells(kind, x, y, rotation);
  for (const c of cells) if (!inBoard(c.x, c.y)) return { ok: false, reason: '超出施工板範圍' };

  const filtered = ignoreId ? board.filter((p) => p.id !== ignoreId) : board;
  const occ = buildOccupancy(filtered);
  const h = pieceHeight(kind);
  const isDomino = kind === 'domino';

  const surf = (c: { x: number; y: number }) => occ.surfaces.get(key2(c.x, c.y)) ?? new Set<number>();
  const levels = new Set<number>([0]);
  for (const c of cells) for (const z of surf(c)) levels.add(z);

  const usable = [...levels].sort((a, b) => b - a).filter((z) => {
    const supported = isDomino
      ? cells.every((c) => z === 0 || surf(c).has(z))
      : cells.some((c) => z === 0 || surf(c).has(z));
    if (!supported) return false;
    for (const c of cells) {
      for (let k = 0; k < h; k++) {
        const id = occ.cells.get(key(c.x, c.y, z + k));
        if (!id) continue;
        if (isDomino && occ.byId.get(id)!.kind === 'domino') continue; // outlines are checked below
        return false;
      }
    }
    return true;
  });
  if (!usable.length) return { ok: false, reason: isDomino ? '該位置已有積木，無法放置' : '該位置已有物件，無法重疊放置' };

  const z = preferZ === undefined ? usable[0] : (usable.find((lv) => lv <= preferZ + 0.6) ?? usable[usable.length - 1]);

  if (isDomino) {
    const me: BoardPiece = { id: '', kind, x, y, z, rotation };
    for (const p of filtered) {
      if (p.kind !== 'domino' || p.z !== z) continue;
      if (dominoesOverlap(me, p)) return { ok: false, reason: '與另一枚骨牌重疊，請再靠近或遠離一點' };
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
