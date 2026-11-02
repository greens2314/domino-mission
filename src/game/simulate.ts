import { CAR_HEIGHT, CAR_LENGTH, BOARD_W, LANE_YS, dominoDir, isBrick } from './catalog';
import { buildOccupancy, hkey, key } from './board';
import type { BoardPiece, SimulationResult } from './types';

/**
 * Deterministic physics stand-in.
 * The car drives along the fixed lane from x = -CAR_LENGTH toward +x.
 * It stops when a brick (at z < CAR_HEIGHT) blocks the lane, or when it reaches
 * the first standing domino in the lane; every standing domino touching that
 * lane column is toppled and the chain propagates.
 */
export function simulate(board: BoardPiece[]): SimulationResult {
  const occ = buildOccupancy(board);

  let carStopX = BOARD_W + CAR_LENGTH; // drives off the far edge if nothing happens
  let blocked = false;
  const startIds: string[] = [];

  outer: for (let front = 0; front < BOARD_W; front++) {
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
    for (const y of [13, 12, 14]) {
      for (let z = 0; z < CAR_HEIGHT; z++) {
        for (const id of occ.dominoesAt.get(key(front, y, z)) ?? []) {
          const d = occ.byId.get(id)!;
          if (!d.fallen && d.z < CAR_HEIGHT && !startIds.includes(id)) startIds.push(id);
        }
      }
    }
    if (startIds.length) {
      carStopX = front;
      break;
    }
  }

  const falls = propagate(board, startIds);
  return { carStopX, blocked, startDominoId: startIds[0], falls };
}

/**
 * Topple the given dominoes at t = 0 and propagate the chain.
 * A falling domino (height 2) reaches:
 *  - straight ahead: the nearest standing domino within 2.0 cells
 *  - diagonally (one row to either side): dominoes within 1.0 cell ahead
 * A domino may climb at most one layer per step, but may drop any height (falling off the edge).
 */
export function propagate(board: BoardPiece[], startIds: string[]): SimulationResult['falls'] {
  const byId = new Map(board.map((p) => [p.id, p] as const));
  const standing = new Map<string, BoardPiece[]>(); // half-cell key -> dominoes
  for (const p of board) {
    if (p.kind !== 'domino' || p.fallen) continue;
    const k = hkey(p.x, p.y);
    const list = standing.get(k) ?? [];
    list.push(p);
    standing.set(k, list);
  }

  const fallen = new Map<string, number>();
  let frontier: string[] = [];
  for (const id of startIds) {
    if (!fallen.has(id)) { fallen.set(id, 0); frontier.push(id); }
  }
  const falls = frontier.map((id) => ({ id, t: 0 }));

  const STEPS = [0.5, 1, 1.5, 2];
  const PERP = [0, 0.5, -0.5, 1, -1];

  let t = 0;
  while (frontier.length) {
    t++;
    const next: string[] = [];
    for (const id of frontier) {
      const a = byId.get(id)!;
      const { dx, dy } = dominoDir(a.rotation);
      const px = -dy, py = dx;
      const targets: BoardPiece[] = [];
      let straightHit = false;
      for (const f of STEPS) {
        for (const p of PERP) {
          if (p !== 0 && f > 1) continue; // diagonal reach is 1 cell
          if (p === 0 && straightHit) continue; // straight: only the nearest
          const list = standing.get(hkey(a.x + dx * f + px * p, a.y + dy * f + py * p));
          if (!list) continue;
          for (const b of list) {
            if (b.z - a.z > 1) continue;
            targets.push(b);
            if (p === 0) straightHit = true;
          }
        }
      }
      for (const b of targets) {
        if (fallen.has(b.id)) continue;
        fallen.set(b.id, t);
        falls.push({ id: b.id, t });
        next.push(b.id);
      }
    }
    frontier = next;
  }
  return falls;
}
