import type { BoardPiece, PieceKind, Rotation } from './types';

/** Small builder used by tests and the teacher's demo layout (?demo). */
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

/**
 * A complete, passing layout that mirrors the course diagram:
 * car → gate → gate → S path between two pillars → 8-step stairs → cliff → diamond.
 */
export function buildPassingBoard(): BoardPiece[] {
  const b = new BoardBuilder();
  // two gates across the lane, 11 cm apart
  b.gate(3);
  b.gate(14);
  // two free-standing pillars (7 high) behind the gates, either side of the S path
  b.column(22, 5, 7);
  b.column(22, 21, 7);
  // S path: forward along x with three bends in y (+y, −y, +y)
  b.line(16, 13, 1, 0, 4, 0);      // (16..19,13) →   start domino is (16,13) in the lane
  b.line(20, 13, 0, 1, 3, 90);     // (20,13..15) ↓ (+y, toward the viewer)
  b.line(20, 16, 1, 0, 4, 0);      // (20..23,16) →
  b.line(24, 16, 0, -1, 7, 270);   // (24,16..10) ↑ (−y)
  b.line(24, 9, 1, 0, 3, 0);       // (24..26,9) →
  b.line(27, 9, 0, 1, 3, 90);      // (27,9..11) ↓ (+y)
  b.line(27, 12, 1, 0, 3, 0);      // (27..29,12) →
  // stairs: exactly 8 levels climbing along x at y=12
  for (let k = 1; k <= 8; k++) b.step(29 + k, 12, k, 0); // x 30..37
  // cliff: the top domino drops straight onto the diamond's first row
  b.diamond(38, 13);                // rows x 38..47, first row covers y 12..13
  return b.pieces;
}
