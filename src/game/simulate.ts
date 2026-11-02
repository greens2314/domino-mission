import { CAR_HEIGHT, CAR_LENGTH, BOARD_W, LANE_YS, dominoDir, isBrick } from './catalog';
import { buildOccupancy, dominoCenter, key } from './board';
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

/** How far ahead (cells) a falling domino can reach; its height is 2. */
export const REACH = 2.5;
/** Everything this close ahead is hit together (fan-out through packed arrays). */
const NEAR = 1.5;
/** Lateral half-width of the sweep near the tile (neighbouring rows wobble over) ... */
const SWEEP_NEAR = 1.3;
/** ... and further ahead only what is nearly straight in front. */
const SWEEP_FAR = 1.2;

/**
 * Topple the given dominoes at t = 0 and propagate the chain by geometry:
 * a falling domino sweeps the sector ahead of it; it topples the nearest standing
 * domino within REACH, plus every standing domino within NEAR. A domino may climb
 * at most one layer per step but may drop any height (falling off an edge).
 */
export function propagate(board: BoardPiece[], startIds: string[]): SimulationResult['falls'] {
  const byId = new Map(board.map((p) => [p.id, p] as const));
  // bucket standing dominoes by the integer cell of their centre
  const buckets = new Map<string, BoardPiece[]>();
  const bkey = (cx: number, cy: number) => `${Math.floor(cx)},${Math.floor(cy)}`;
  for (const p of board) {
    if (p.kind !== 'domino' || p.fallen) continue;
    const c = dominoCenter(p.x, p.y);
    const k = bkey(c.x, c.y);
    const list = buckets.get(k) ?? [];
    list.push(p);
    buckets.set(k, list);
  }

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
      const ca = dominoCenter(a.x, a.y);
      const candidates: { b: BoardPiece; f: number }[] = [];
      for (let ox = -3; ox <= 3; ox++) {
        for (let oy = -3; oy <= 3; oy++) {
          for (const b of buckets.get(bkey(ca.x + ox, ca.y + oy)) ?? []) {
            if (b.id === a.id || fallen.has(b.id)) continue;
            if (b.z - a.z > 1) continue;
            const cb = dominoCenter(b.x, b.y);
            const vx = cb.x - ca.x, vy = cb.y - ca.y;
            const f = vx * dx + vy * dy;          // forward distance
            const s = Math.abs(-vx * dy + vy * dx); // lateral offset
            if (f <= 0.05 || f > REACH) continue;
            if (s > (f <= NEAR ? SWEEP_NEAR : SWEEP_FAR)) continue;
            candidates.push({ b, f });
          }
        }
      }
      candidates.sort((p, q) => p.f - q.f || p.b.id.localeCompare(q.b.id));
      const hit = candidates.filter((c, i) => i === 0 || c.f <= NEAR);
      for (const { b } of hit) {
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
