import { CAR_HEIGHT, LANE_Y0, LANE_Y1, LANE_YS, dominoDir, isBrick } from './catalog';
import { buildOccupancy, key, key2, occupiedCells } from './board';
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

/** Pillars must be at least this tall (cm). */
export const PILLAR_MIN_HEIGHT = 6;

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

/** Brick structures that carry dominoes (stairs, platforms) are not pillars. */
export function carriesDominoes(board: BoardPiece[], comp: Component): boolean {
  const occ = buildOccupancy(board);
  return comp.cells.some((c) => (occ.dominoesAt.get(key(c.x, c.y, c.z + 1)) ?? []).length > 0);
}

export function detectPillars(board: BoardPiece[]): Component[] {
  const comps = brickComponents(board);
  const gates = detectGates(comps);
  const gateComps = new Set(gates.map((g) => g.component));
  const lastGateX = gates.length ? Math.max(...gates.map((g) => g.maxX)) : -1;
  return comps.filter((c) => !gateComps.has(c) && c.minX > lastGateX && c.maxZ + 1 >= PILLAR_MIN_HEIGHT && !carriesDominoes(board, c));
}

export function validatePillars(board: BoardPiece[]): string | null {
  const comps = brickComponents(board);
  const gates = detectGates(comps);
  const gateComps = new Set(gates.map((g) => g.component));
  const lastGateX = gates.length ? Math.max(...gates.map((g) => g.maxX)) : -1;
  const others = comps.filter((c) => !gateComps.has(c) && !carriesDominoes(board, c));
  const qualifies = (c: Component) => c.maxZ + 1 >= PILLAR_MIN_HEIGHT && c.minX > lastGateX;
  const ok = others.filter(qualifies);
  if (ok.length >= 2) return null;

  // explain what each other structure is missing, tallest first
  const notes = others
    .filter((c) => !qualifies(c))
    .sort((p, q) => q.maxZ - p.maxZ)
    .slice(0, 4)
    .map((c) => {
      const h = c.maxZ + 1;
      const problems: string[] = [];
      if (h < PILLAR_MIN_HEIGHT) problems.push(`高 ${h} cm，未達 ${PILLAR_MIN_HEIGHT} cm`);
      if (c.minX <= lastGateX) problems.push('不在兩門之後');
      return `高 ${h} cm 的積木結構：${problems.join('、')}`;
    });
  const gateNote = others.length < 2 && comps.length - others.length > 2 ? '；有積木結構與門相連，被視為門的一部分' : '';
  return `門後沒有 2 根高度至少 ${PILLAR_MIN_HEIGHT} cm 的獨立積木柱子（目前符合：${ok.length} 根）。${notes.length ? notes.join('；') + '。' : ''}${gateNote}`;
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

type XY = { x: number; y: number };

function insideQuad(p: XY, quad: XY[], tol: number): boolean {
  // quad is given counter-clockwise; a point is inside when it is left of (or within tol of) every edge
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i], b = quad[(i + 1) % quad.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1;
    const cross = (ex * (p.y - a.y) - ey * (p.x - a.x)) / len;
    if (cross < -tol) return false;
  }
  return true;
}

/**
 * Finds a filled rhombus ("diamond") of at least 60 ground dominoes.
 * Dominoes are clustered by proximity; the largest clusters are tested geometrically:
 * the rhombus inscribed in the cluster's bounding box must hold ≥ 90 % of the tiles
 * (a square or round blob fails), both diagonals must be ≥ 7 cm,
 * and ≥ 80 % of the 1 cm cells inside it must contain a tile (filled, not an outline).
 */
export function findDiamond(board: BoardPiece[]): Set<string> | null {
  const ground = board.filter((p) => p.kind === 'domino' && p.z === 0);
  if (ground.length < 60) return null;
  const pts = ground.map((p) => ({ id: p.id, x: p.x + 0.5, y: p.y + 0.5 }));

  // union-find clustering: tiles closer than 1.6 cm belong together
  const parent = pts.map((_, k) => k);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  for (let a = 0; a < pts.length; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      if (Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) <= 1.6) parent[find(a)] = find(b);
    }
  }
  const clusters = new Map<number, typeof pts>();
  pts.forEach((p, k) => { const r = find(k); clusters.set(r, [...(clusters.get(r) ?? []), p]); });

  for (const cluster of [...clusters.values()].sort((a, b) => b.length - a.length)) {
    if (cluster.length < 60) break;
    // the rhombus inscribed in the cluster's bounding box (vertices at the box's edge midpoints)
    const minX = Math.min(...cluster.map((p) => p.x)), maxX = Math.max(...cluster.map((p) => p.x));
    const minY = Math.min(...cluster.map((p) => p.y)), maxY = Math.max(...cluster.map((p) => p.y));
    if (maxX - minX < 7 || maxY - minY < 7) continue;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const left = { x: minX, y: cy }, right = { x: maxX, y: cy }, top = { x: cx, y: maxY }, bottom = { x: cx, y: minY };
    const quad = [left, bottom, right, top]; // counter-clockwise (x right, y up)
    const inside = cluster.filter((p) => insideQuad(p, quad, 0.6)).length / cluster.length;
    if (inside < 0.9) continue;
    let cells = 0, covered = 0;
    for (let cx = Math.floor(left.x); cx <= Math.ceil(right.x); cx++) {
      for (let cy = Math.floor(bottom.y); cy <= Math.ceil(top.y); cy++) {
        const c = { x: cx + 0.5, y: cy + 0.5 };
        if (!insideQuad(c, quad, -0.3)) continue;
        cells++;
        if (cluster.some((p) => Math.hypot(p.x - c.x, p.y - c.y) <= 0.8)) covered++;
      }
    }
    if (cells === 0 || covered / cells < 0.8) continue;
    return new Set(cluster.map((p) => p.id));
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
  const passed = gates.filter((g) => g.maxX <= sim.carStopX).length; // the start domino may stand right under the second gate
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

function segmentsCross(a: XY, b: XY, c: XY, d: XY): boolean {
  const orient = (p: XY, q: XY, r: XY) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
}

/** The S path (in fall order) must cross the line between the two pillars. */
export function pathPassesBetweenPillars(board: BoardPiece[], sPath: BoardPiece[]): boolean {
  const pillars = detectPillars(board).sort((p, q) => q.maxZ - p.maxZ).slice(0, 2);
  if (pillars.length < 2) return false;
  const centre = (c: Component): XY => ({ x: (c.minX + c.maxX + 1) / 2, y: (c.minY + c.maxY + 1) / 2 });
  const p1 = centre(pillars[0]), p2 = centre(pillars[1]);
  for (let i = 1; i < sPath.length; i++) {
    const a = { x: sPath[i - 1].x + 0.5, y: sPath[i - 1].y + 0.5 };
    const b = { x: sPath[i].x + 0.5, y: sPath[i].y + 0.5 };
    if (segmentsCross(a, b, p1, p2)) return true;
  }
  return false;
}

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
  if (!pathPassesBetweenPillars(board, sPath)) return 'S 型路徑未經過兩根柱子之間。';

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
