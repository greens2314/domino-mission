import type { BrickKind, PieceKind, Rotation } from './types';

/* ---------- Board & world constants (internal only) ---------- */

export const BOARD_W = 48;
export const BOARD_D = 28;

/** Car lane: fixed rows the car drives along, from x = -CAR_LENGTH toward +x. */
export const LANE_Y0 = 12;
export const LANE_Y1 = 14;
export const LANE_YS = [12, 13, 14] as const;

export const CAR_WIDTH = 3;   // along y
export const CAR_LENGTH = 4;  // along x
export const CAR_HEIGHT = 2;  // in brick layers

export const DOMINO_HEIGHT = 2;      // visual/physical height in layers
export const BRICK_HEIGHT = 1;

export const START_BUDGET = 2000;
export const FREE_ORDERS = 3;
export const EMERGENCY_FEE = 50;
export const GAME_MINUTES = 60;
export const CAR_AUTH_CODE = 'car666';

export const MAX_CLARIFICATIONS = 3;

/* ---------- Pieces ---------- */

export type PieceSpec = {
  kind: PieceKind;
  label: string;
  /** footprint at rotation 0: w along x, d along y */
  w: number;
  d: number;
  single: number;
  tenPack: number;
  color: string;
};

export const PIECES: Record<PieceKind, PieceSpec> = {
  'domino':    { kind: 'domino',    label: '骨牌',       w: 1, d: 1, single: 5,  tenPack: 40,  color: '#f2f0e6' },
  'brick-1x1': { kind: 'brick-1x1', label: '1 × 1 積木', w: 1, d: 1, single: 15, tenPack: 120, color: '#e63946' },
  'brick-1x2': { kind: 'brick-1x2', label: '1 × 2 積木', w: 2, d: 1, single: 20, tenPack: 160, color: '#f4b400' },
  'brick-2x2': { kind: 'brick-2x2', label: '2 × 2 積木', w: 2, d: 2, single: 35, tenPack: 280, color: '#2a9d8f' },
  'brick-1x3': { kind: 'brick-1x3', label: '1 × 3 積木', w: 3, d: 1, single: 25, tenPack: 200, color: '#1d6fd6' },
  'brick-2x3': { kind: 'brick-2x3', label: '2 × 3 積木', w: 3, d: 2, single: 50, tenPack: 400, color: '#8e44ad' },
  'brick-1x4': { kind: 'brick-1x4', label: '1 × 4 積木', w: 4, d: 1, single: 30, tenPack: 240, color: '#ff7f11' },
  'brick-2x4': { kind: 'brick-2x4', label: '2 × 4 積木', w: 4, d: 2, single: 60, tenPack: 480, color: '#2ecc71' },
  'brick-1x6': { kind: 'brick-1x6', label: '1 × 6 積木', w: 6, d: 1, single: 45, tenPack: 360, color: '#e91e8c' },
  'brick-1x8': { kind: 'brick-1x8', label: '1 × 8 積木', w: 8, d: 1, single: 55, tenPack: 440, color: '#00acc1' },
};

export const PIECE_ORDER: PieceKind[] = [
  'domino', 'brick-1x1', 'brick-1x2', 'brick-2x2', 'brick-1x3',
  'brick-2x3', 'brick-1x4', 'brick-2x4', 'brick-1x6', 'brick-1x8',
];

export const BRICK_KINDS: BrickKind[] = PIECE_ORDER.filter((k) => k !== 'domino') as BrickKind[];

export function isBrick(kind: PieceKind): kind is BrickKind {
  return kind !== 'domino';
}

export function emptyInventory(): Record<PieceKind, number> {
  const inv = {} as Record<PieceKind, number>;
  for (const k of PIECE_ORDER) inv[k] = 0;
  return inv;
}

/** Footprint size after rotation. */
export function footprint(kind: PieceKind, rotation: Rotation): { w: number; d: number } {
  const spec = PIECES[kind];
  return rotation === 90 || rotation === 270 ? { w: spec.d, d: spec.w } : { w: spec.w, d: spec.d };
}

/** Direction a domino falls toward, by rotation. */
export function dominoDir(rotation: Rotation): { dx: number; dy: number } {
  switch (rotation) {
    case 0: return { dx: 1, dy: 0 };
    case 90: return { dx: 0, dy: 1 };
    case 180: return { dx: -1, dy: 0 };
    case 270: return { dx: 0, dy: -1 };
  }
}

export function dirLabel(rotation: Rotation): string {
  switch (rotation) {
    case 0: return '→ 向右';
    case 90: return '↓ 向前（靠近自己）';
    case 180: return '← 向左';
    case 270: return '↑ 向後（遠離自己）';
  }
}

export function nextRotation(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}
