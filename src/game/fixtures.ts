import type { BoardPiece, PieceKind, Rotation } from './types';
import { checkPlacement } from './board';

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

  /**
   * Dominoes along a smooth curve: points sampled every `spacing` cm of arc length,
   * each tile pointing along the tangent (rotation snapped to 15°, position to 0.5 cm).
   * Tiles that would overlap a previous one are skipped.
   */
  curve(fn: (t: number) => { x: number; y: number }, t0: number, t1: number, spacing = 0.75) {
    const samples = 400;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= samples; i++) pts.push(fn(t0 + ((t1 - t0) * i) / samples));
    let acc = spacing;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      acc += seg;
      if (acc < spacing) continue;
      const look = pts[Math.min(i + 4, pts.length - 1)], back = pts[Math.max(i - 4, 0)];
      const deg = (Math.atan2(look.y - back.y, look.x - back.x) * 180) / Math.PI;
      const rotation = (((Math.round(deg / 15) * 15) % 360) + 360) % 360;
      const x = Math.round((pts[i].x - 0.5) * 2) / 2, y = Math.round((pts[i].y - 0.5) * 2) / 2;
      if (!checkPlacement(this.pieces, 'domino', x, y, rotation).ok) continue; // too close to the last tile: try the next sample
      this.add('domino', x, y, 0, rotation);
      acc = 0;
    }
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
  // two free-standing pillars (7 high) behind the gates; the S path runs between them
  b.column(23, 7, 7);
  b.column(23, 19, 7);
  // S path: 1.25 sine periods from the lane (x=16, y≈14.5) to the foot of the stairs,
  // ending in a trough at (29, 12) heading +x so the last tile faces stair 1
  b.curve((t) => ({ x: t, y: 14.6 - 2.6 * Math.sin(((t - 16) / 10.4) * 2 * Math.PI) }), 16, 29.2, 0.75);
  // stairs: exactly 8 levels climbing along x at y=12
  for (let k = 1; k <= 8; k++) b.step(29 + k, 12, k, 0); // x 30..37
  // cliff: the top domino drops straight onto the diamond's first row
  b.diamond(38, 13);                // rows x 38..47, first row covers y 12..13
  return b.pieces;
}
