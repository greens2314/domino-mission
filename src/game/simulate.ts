import { CAR_HEIGHT, CAR_LENGTH, BOARD_W, LANE_YS, dominoDir, isBrick } from './catalog';
import { buildOccupancy, key, key2 } from './board';
import type { BoardPiece, SimulationResult } from './types';

/**
 * Deterministic physics stand-in.
 * The car drives along the fixed lane from x = -CAR_LENGTH toward +x.
 * It stops when a brick (at z < CAR_HEIGHT) blocks the lane, or when it hits
 * the first standing domino in the lane; that domino (and any other standing
 * domino in the same lane column) is toppled and the chain propagates.
 */
export function simulate(board: BoardPiece[]): SimulationResult {
  const occ = buildOccupancy(board);
  const dominoAt = new Map<string, BoardPiece>();
  for (const p of board) if (p.kind === 'domino') dominoAt.set(key2(p.x, p.y), p);

  let carStopX = BOARD_W + CAR_LENGTH; // drives off the far edge if nothing happens
  let blocked = false;
  const startIds: string[] = [];

  outer: for (let front = 0; front < BOARD_W; front++) {
    // bricks in the lane at car height block the car
    for (const y of LANE_YS) {
      for (let z = 0; z < CAR_HEIGHT; z++) {
        const id = occ.cells.get(key(front, y, z));
        if (!id) continue;
        const p = occ.byId.get(id)!;
        if (isBrick(p.kind)) {
          blocked = true;
          carStopX = front;
          break outer;
        }
      }
    }
    // standing dominoes in the lane column are hit (center row first)
    for (const y of [13, 12, 14]) {
      const d = dominoAt.get(key2(front, y));
      if (d && !d.fallen && d.z < CAR_HEIGHT) startIds.push(d.id);
    }
    if (startIds.length) {
      carStopX = front;
      break;
    }
  }

  const falls = propagate(board, startIds);
  return { carStopX, blocked, startDominoId: startIds[0], falls };
}

/** Topple the given dominoes at t = 0 and propagate the chain. */
export function propagate(board: BoardPiece[], startIds: string[]): SimulationResult['falls'] {
  const byId = new Map(board.map((p) => [p.id, p] as const));
  const dominoAt = new Map<string, BoardPiece>();
  for (const p of board) if (p.kind === 'domino' && !p.fallen) dominoAt.set(key2(p.x, p.y), p);

  const fallen = new Map<string, number>();
  let frontier: string[] = [];
  for (const id of startIds) {
    if (!fallen.has(id)) { fallen.set(id, 0); frontier.push(id); }
  }
  const falls = frontier.map((id) => ({ id, t: 0 }));

  let t = 0;
  while (frontier.length) {
    t++;
    const next: string[] = [];
    for (const id of frontier) {
      const a = byId.get(id)!;
      const { dx, dy } = dominoDir(a.rotation);
      const px = -dy, py = dx;
      const ahead1 = dominoAt.get(key2(a.x + dx, a.y + dy));
      const candidates: (BoardPiece | undefined)[] = [
        ahead1,
        dominoAt.get(key2(a.x + dx + px, a.y + dy + py)),
        dominoAt.get(key2(a.x + dx - px, a.y + dy - py)),
      ];
      // a gap of one empty cell can still be bridged straight ahead (same level or one step down)
      if (!ahead1) {
        const ahead2 = dominoAt.get(key2(a.x + 2 * dx, a.y + 2 * dy));
        if (ahead2 && ahead2.z <= a.z && ahead2.z >= a.z - 1) candidates.push(ahead2);
      }
      for (const b of candidates) {
        if (!b || fallen.has(b.id)) continue;
        if (Math.abs(b.z - a.z) > 1) continue;
        fallen.set(b.id, t);
        falls.push({ id: b.id, t });
        next.push(b.id);
      }
    }
    frontier = next;
  }
  return falls;
}
