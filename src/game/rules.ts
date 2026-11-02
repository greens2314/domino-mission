import { CAR_HEIGHT, LANE_Y0, LANE_Y1, LANE_YS, dominoDir, isBrick } from './catalog';
import { buildOccupancy, hkey, key, key2, occupiedCells } from './board';
import { simulate } from './simulate';
import type { BoardPiece, Cell, SimulationResult } from './types';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

export type Component = {
  pieceIds: Set<string>;
  cells: Cell[];
  minX: number; maxX: number; minY: number; maxY: number; maxZ: number;
};

/** Connected components of brick cells (face adjacency, incl. vertical). */
export function brickComponents(board: BoardPiece[]): Component[] {
  const bricks = board.filter((p) => isBrick(p.kind));
  const cellOwner = new Map<string, string>();
  for (const p of bricks) for (const c of occupiedCells(p)) cellOwner.set(key(c.x, c.y, c.z), p.id);

  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let cur = a;
    while (parent.get(cur) !== r) { const n = parent.get(cur)!; parent.set(cur, r); cur = n; }
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const p of bricks) parent.set(p.id, p.id);

  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const p of bricks) {
    for (const c of occupiedCells(p)) {
      for (const [dx, dy, dz] of dirs) {
        const o = cellOwner.get(key(c.x + dx, c.y + dy, c.z + dz));
        if (o && o !== p.id) union(p.id, o);
      }
    }
  }

  const groups = new Map<string, Component>();
  for (const p of bricks) {
    const r = find(p.id);
    let g = groups.get(r);
    if (!g) {
      g = { pieceIds: new Set(), cells: [], minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, maxZ: -1 };
      groups.set(r, g);
    }
    g.pieceIds.add(p.id);
    for (const c of occupiedCells(p)) {
      g.cells.push(c);
      g.minX = Math.min(g.minX, c.x); g.maxX = Math.max(g.maxX, c.x);
      g.minY = Math.min(g.minY, c.y); g.maxY = Math.max(g.maxY, c.y);
      g.maxZ = Math.max(g.maxZ, c.z);
    }
  }
  return [...groups.values()];
}

export type Gate = { component: Component; centerX: number; minX: number; maxX: number };

/**
 * A gate is a brick component that spans the whole lane with a beam at z >= CAR_HEIGHT,
 * leaves the lane free below the beam, and stands on the ground on both sides of the lane.
 */
export function detectGates(components: Component[]): Gate[] {
  const gates: Gate[] = [];
  for (const comp of components) {
    const laneCells = comp.cells.filter((c) => c.y >= LANE_Y0 && c.y <= LANE_Y1);
    if (!laneCells.length) continue;
    if (laneCells.some((c) => c.z < CAR_HEIGHT)) continue; // intrudes into the car opening
    const xs = [...new Set(laneCells.map((c) => c.x))];
    const cellSet = new Set(laneCells.map((c) => key2(c.x, c.y)));
    const spansLane = xs.every((x) => LANE_YS.every((y) => cellSet.has(key2(x, y))));
    if (!spansLane) continue;
    const groundLeft = comp.cells.some((c) => c.z === 0 && c.y < LANE_Y0);
    const groundRight = comp.cells.some((c) => c.z === 0 && c.y > LANE_Y1);
    if (!groundLeft || !groundRight) continue;
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    gates.push({ component: comp, centerX: (minX + maxX) / 2, minX, maxX });
  }
  return gates.sort((a, b) => a.centerX - b.centerX);
}

/* ------------------------------------------------------------------ */
/* Individual rules. Each returns null when satisfied, else a reason.   */
/* ------------------------------------------------------------------ */

export function validateGates(board: BoardPiece[]): string | null {
  const gates = detectGates(brickComponents(board));
  if (gates.length < 2) return `未找到 2 座符合規範的門（目前符合：${gates.length} 座）。門須為獨立的積木結構，橫梁跨越整條車道，且小車能從下方通過。`;
  const spread = gates[gates.length - 1].centerX - gates[0].centerX;
  if (spread < 10) return `兩門距離不足 10 cm（目前約 ${spread} cm）。`;
  return null;
}

export function detectPillars(board: BoardPiece[]): Component[] {
  const comps = brickComponents(board);
  const gates = detectGates(comps);
  const gateComps = new Set(gates.map((g) => g.component));
  const lastGateX = gates.length ? Math.max(...gates.map((g) => g.maxX)) : -1;
  return comps.filter((c) => !gateComps.has(c) && c.minX > lastGateX && c.maxZ + 1 >= 7);
}

export function validatePillars(board: BoardPiece[]): string | null {
  const comps = brickComponents(board);
  const gates = detectGates(comps);
  const gateComps = new Set(gates.map((g) => g.component));
  const lastGateX = gates.length ? Math.max(...gates.map((g) => g.maxX)) : -1;
  const others = comps.filter((c) => !gateComps.has(c));
  const tallEnough = others.filter((c) => c.maxZ + 1 >= 7);
  const behind = tallEnough.filter((c) => c.minX > lastGateX);
  if (behind.length < 2) {
    if (tallEnough.length >= 2) return '柱子未位於兩門之後。';
    return `門後沒有 2 根高度大於 6 cm 的獨立積木柱子（目前符合：${behind.length} 根）。`;
  }
  return null;
}

export function validateMaterialUse(board: BoardPiece[]): string | null {
  const occ = buildOccupancy(board);
  for (const p of board) {
    if (!isBrick(p.kind) || p.z === 0) continue;
    for (const c of occupiedCells(p)) {
      const belowId = occ.cells.get(key(c.x, c.y, c.z - 1));
      if (belowId) {
        const below = occ.byId.get(belowId)!;
        if (below.kind === 'domino') return '有積木靠骨牌支撐：門與柱子只能使用積木，骨牌只能用於連鎖反應。';
      }
    }
  }
  return null;
}

export const DIAMOND_ROWS = [2, 4, 6, 8, 10, 10, 8, 6, 4, 2];

/**
 * Finds a filled 10 x 10 diamond of dominoes (standing or fallen) on the ground.
 * Rows run along x or y; row spacing may be 1.0 or 0.5 cm (dominoes may be packed
 * at half cells along their fall direction); within a row dominoes sit on whole cells.
 */
export function findDiamond(board: BoardPiece[]): Set<string> | null {
  const ground = board.filter((p) => p.kind === 'domino' && p.z === 0);
  if (ground.length < 60) return null;
  const idx = new Map<string, BoardPiece>();
  for (const p of ground) idx.set(hkey(p.x, p.y), p);

  for (const orient of ['x', 'y'] as const) {
    const rowOf = (p: BoardPiece) => (orient === 'x' ? p.x : p.y);
    const spanOf = (p: BoardPiece) => (orient === 'x' ? p.y : p.x);
    const rowStarts = [...new Set(ground.map(rowOf))].sort((a, b) => a - b);
    const spanValues = [...new Set(ground.map(spanOf).filter(Number.isInteger))];
    const centers = new Set<number>();
    for (const q of spanValues) for (let s = 1; s <= 5; s++) { centers.add(q + s); centers.add(q - s + 1); }

    for (const spacing of [1, 0.5]) {
      for (const r0 of rowStarts) {
        for (const c of centers) {
          const ids = new Set<string>();
          let ok = true;
          for (let i = 0; i < 10 && ok; i++) {
            const size = DIAMOND_ROWS[i];
            const r = r0 + i * spacing;
            for (let q = c - size / 2; q < c + size / 2; q++) {
              const d = idx.get(orient === 'x' ? hkey(r, q) : hkey(q, r));
              if (!d) { ok = false; break; }
              ids.add(d.id);
            }
          }
          if (ok && ids.size === 60) return ids;
        }
      }
    }
  }
  return null;
}

export function validateDiamondShape(board: BoardPiece[]): string | null {
  return findDiamond(board) ? null : '鑽石陣不完整：找不到完整填滿的 10 × 10 菱形骨牌陣。';
}

export function stairLevels(board: BoardPiece[]): Set<number> {
  const levels = new Set<number>();
  for (const p of board) if (p.kind === 'domino' && p.z >= 1) levels.add(p.z);
  return levels;
}

export function validateStairsShape(board: BoardPiece[]): string | null {
  const levels = stairLevels(board);
  if (!levels.size) return '沒有骨牌階梯：找不到架高的骨牌。';
  const max = Math.max(...levels);
  if (max > 8) return `骨牌階梯不是精確 8 層（目前最高 ${max} 層）。`;
  for (let k = 1; k <= 8; k++) if (!levels.has(k)) return `骨牌階梯不是精確 8 層：缺少第 ${k} 層骨牌。`;
  return null;
}

export type RouteCheck = { sim: SimulationResult; reason: string | null };

export function validateCarRoute(board: BoardPiece[]): RouteCheck {
  const sim = simulate(board);
  if (sim.blocked) return { sim, reason: '小車被車道上的積木阻擋，無法前進。' };
  if (!sim.startDominoId) return { sim, reason: '小車未碰到任何骨牌，連鎖反應沒有開始。' };
  const gates = detectGates(brickComponents(board));
  const passed = gates.filter((g) => g.maxX < sim.carStopX).length;
  if (passed < 2) return { sim, reason: '小車在通過兩座門之前就碰到了骨牌。' };
  return { sim, reason: null };
}

/**
 * Bends of the chain: consecutive headings are compared and same-signed turns are
 * accumulated into runs; a run of at least 60° counts as one bend. Returns the number
 * of bends and whether both turning directions occur (an S needs one of each).
 */
export function chainBends(dominoesInOrder: BoardPiece[]): { bends: number; left: boolean; right: boolean } {
  const headings = dominoesInOrder.map((d) => { const { dx, dy } = dominoDir(d.rotation); return Math.atan2(dy, dx); });
  let runSign = 0, runTotal = 0, bends = 0, left = false, right = false;
  const close = () => {
    if (Math.abs(runTotal) >= Math.PI / 3) { bends++; if (runTotal > 0) left = true; else right = true; }
    runSign = 0; runTotal = 0;
  };
  for (let i = 1; i < headings.length; i++) {
    let turn = headings[i] - headings[i - 1];
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    if (Math.abs(turn) < 0.05) continue;
    const sign = Math.sign(turn);
    if (runSign !== 0 && sign !== runSign) close();
    runSign = sign;
    runTotal += turn;
  }
  close();
  return { bends, left, right };
}

/** Number of ≥60° bends along the chain (kept for tests / diagnostics). */
export function countReversals(dominoesInOrder: BoardPiece[]): number {
  return chainBends(dominoesInOrder).bends;
}

export type ChainCheck = { reason: string | null };

/** Dynamic checks that need the simulation: S path, stairs chain, diamond chain, order. */
export function validateChain(board: BoardPiece[], sim: SimulationResult): string | null {
  const byId = new Map(board.map((p) => [p.id, p] as const));
  const fallTime = new Map(sim.falls.map((f) => [f.id, f.t] as const));
  const diamond = findDiamond(board);
  if (!diamond) return '鑽石陣不完整：找不到完整填滿的 10 × 10 菱形骨牌陣。';

  const stairs = board.filter((p) => p.kind === 'domino' && p.z >= 1);
  const stairTimes = stairs.map((p) => fallTime.get(p.id)).filter((t): t is number => t !== undefined);
  if (stairTimes.length === 0) return '連鎖反應沒有到達骨牌階梯。';
  const firstStair = Math.min(...stairTimes);
  const lastStair = Math.max(...stairTimes);

  // S path = ground dominoes toppled before the stairs begin, excluding the diamond
  const sPath = sim.falls
    .filter((f) => f.t < firstStair)
    .map((f) => byId.get(f.id)!)
    .filter((p) => p.z === 0 && !diamond.has(p.id));
  if (sPath.length < 3) return '起始骨牌之後沒有形成 S 型路徑。';
  const bends = chainBends(sPath);
  if (bends.bends < 2 || !bends.left || !bends.right) return 'S 型路徑不成立：骨牌傳遞缺少至少兩次反向彎折。';

  if (stairs.some((p) => !fallTime.has(p.id))) return '骨牌階梯未全部倒下：連鎖在階梯中斷。';

  const diamondTimes = [...diamond].map((id) => fallTime.get(id));
  if (diamondTimes.some((t) => t === undefined)) return '鑽石陣骨牌未全部倒下：連鎖在鑽石陣中斷或未到達。';
  const firstDiamond = Math.min(...(diamondTimes as number[]));
  if (firstDiamond <= lastStair) return '連鎖順序不符：鑽石陣在骨牌階梯完成前就被觸發。';
  return null;
}

/* ------------------------------------------------------------------ */
/* Acceptance                                                           */
/* ------------------------------------------------------------------ */

export type AcceptanceResult = {
  ok: boolean;
  reason?: string;
  sim: SimulationResult;
};

/** Runs every rule in fixed order; the first failure is the reported reason. */
export function runAcceptance(board: BoardPiece[]): AcceptanceResult {
  const staticChecks: (() => string | null)[] = [
    () => validateGates(board),
    () => validatePillars(board),
    () => validateMaterialUse(board),
    () => validateStairsShape(board),
    () => validateDiamondShape(board),
  ];
  const route = validateCarRoute(board);
  for (const check of staticChecks) {
    const r = check();
    if (r) return { ok: false, reason: r, sim: route.sim };
  }
  if (route.reason) return { ok: false, reason: route.reason, sim: route.sim };
  const chain = validateChain(board, route.sim);
  if (chain) return { ok: false, reason: chain, sim: route.sim };
  return { ok: true, sim: route.sim };
}
