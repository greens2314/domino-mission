import type { BoardPiece, PieceKind, Rotation } from './types';

/** Small builder used by tests and the dev "sample layout" helper. */
export class BoardBuilder {
  pieces: BoardPiece[] = [];
  private n = 0;

  add(kind: PieceKind, x: number, y: number, z: number, rotation: Rotation = 0): BoardPiece {
    const p: BoardPiece = { id: `p${this.n++}`, kind, x, y, z, rotation };
    this.pieces.push(p);
    return p;
  }

  /** stack of 1x1 bricks, `h` high */
  column(x: number, y: number, h: number) {
    for (let z = 0; z < h; z++) this.add('brick-1x1', x, y, z);
  }

  /** gate across the lane at column x: pillars at y=11 and y=15 (2 high), 1x6 beam at z=2 covering y 10..15 */
  gate(x: number) {
    this.column(x, 11, 2);
    this.column(x, 15, 2);
    this.add('brick-1x6', x, 10, 2, 90);
  }

  /** a line of dominoes */
  line(x0: number, y0: number, dx: number, dy: number, count: number, rotation: Rotation, z = 0) {
    for (let i = 0; i < count; i++) this.add('domino', x0 + i * dx, y0 + i * dy, z, rotation);
  }

  /** stair step: k bricks under one domino at height k */
  step(x: number, y: number, k: number, rotation: Rotation) {
    this.column(x, y, k);
    this.add('domino', x, y, k, rotation);
  }

  /** filled diamond, rows along +x starting at x0, centred on y=c (rows 2/4/6/8/10/10/8/6/4/2) */
  diamond(x0: number, c: number, rotation: Rotation = 0) {
    const rows = [2, 4, 6, 8, 10, 10, 8, 6, 4, 2];
    rows.forEach((s, i) => {
      for (let y = c - s / 2; y < c + s / 2; y++) this.add('domino', x0 + i, y, 0, rotation);
    });
  }
}

/** A complete, passing layout (also useful for demos). */
export function buildPassingBoard(): BoardPiece[] {
  const b = new BoardBuilder();
  b.gate(2);
  b.gate(12);
  b.column(14, 2, 7);
  b.column(14, 24, 7);
  // S path: → then ↓ then ← then ↓ then →
  b.line(15, 13, 1, 0, 3, 0);      // (15..17,13) →
  b.line(18, 13, 0, -1, 3, 270);   // (18,13..11) ↓
  b.line(18, 10, -1, 0, 3, 180);   // (18..16,10) ←
  b.line(15, 10, 0, -1, 3, 270);   // (15,10..8) ↓
  b.line(15, 7, 1, 0, 3, 0);       // (15..17,7) →
  // stairs up 1..8 then down 7..1 along y=7
  for (let k = 1; k <= 8; k++) b.step(17 + k, 7, k, 0);       // x 18..25
  for (let k = 7; k >= 1; k--) b.step(25 + (8 - k), 7, k, 0); // x 26..32
  b.add('domino', 33, 7, 0, 0);
  b.diamond(34, 8);
  return b.pieces;
}
