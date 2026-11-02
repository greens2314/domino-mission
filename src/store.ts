import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CAR_AUTH_CODE, CAR_LENGTH, GAME_MINUTES, LANE_Y0, START_BUDGET, emptyInventory, nextRotation, PIECES,
} from './game/catalog';
import { checkPlacement, inBoard, newId, piecesAbove } from './game/board';
import { runAcceptance } from './game/rules';
import { simulate } from './game/simulate';
import { buildOrder, piecesFromOrder, type CartItem } from './game/shop';
import { buildPassingBoard } from './game/fixtures';
import type { BoardPiece, GameState, PieceKind, Rotation, SimulationResult } from './game/types';

export type Tool = 'select' | 'place' | 'ruler';
export type Material = PieceKind;

export type Playback = {
  mode: 'rehearsal' | 'acceptance';
  sim: SimulationResult;
  startedAt: number; // performance.now()
};

export type ModalKind =
  | { kind: 'rehearse' }
  | { kind: 'accept' }
  | { kind: 'remove'; pieceId: string }
  | { kind: 'restart' }
  | { kind: 'camera-hint' };

type Point = { x: number; y: number };

export type Store = {
  game: GameState | null;

  // ---- transient UI state ----
  tool: Tool;
  material: Material | null;
  rotation: Rotation;
  selectedId: string | null;
  movingId: string | null;
  hover: (Point & { h?: number }) | null;
  rulerPoints: Point[];
  message: { text: string; at: number } | null;
  modal: ModalKind | null;
  playback: Playback | null;
  nowMs: number;
  /** the 收回材料 confirmation is shown once per page load */
  removeHintShown: boolean;
  requestRemove: (pieceId: string) => void;

  // ---- lifecycle ----
  startGame: (teamName: string) => void;
  tick: () => void;
  expire: (snapshot?: string) => void;
  resetAll: () => void;
  /** Teacher-only demo: loads a complete passing layout (URL ?demo). */
  loadDemoLayout: () => void;

  // ---- shop ----
  purchase: (cart: CartItem[]) => boolean;

  // ---- board ----
  setTool: (t: Tool) => void;
  pickMaterial: (m: Material | null) => void;
  rotateGhost: (step?: number) => void;
  rotateSelected: (step?: number) => void;
  setHover: (p: (Point & { h?: number }) | null) => void;
  placeAt: (x: number, y: number, preferZ?: number) => void;
  selectPiece: (id: string | null) => void;
  beginMove: (id: string) => void;
  cancelMove: () => void;
  removeSelected: () => void;
  restandSelected: () => void;
  placeCarAtStart: () => void;
  removeCar: () => void;
  addRulerPoint: (p: Point) => void;
  clearRuler: () => void;

  // ---- client interaction ----
  unlockCar: (code: string) => boolean;

  // ---- rehearsal / acceptance ----
  openModal: (m: ModalKind | null) => void;
  rehearse: () => void;
  submitAcceptance: (snapshot: string) => void;
  finishPlayback: () => void;

  flash: (text: string) => void;
  log: (text: string) => void;
};

const nowIso = () => new Date().toISOString();

export function remainingMs(game: GameState, nowMs = Date.now()): number {
  const end = new Date(game.startedAt).getTime() + GAME_MINUTES * 60_000;
  return Math.max(0, end - nowMs);
}

export function totalSpent(game: GameState): number {
  return game.orders.reduce((s, o) => s + o.total, 0);
}

export function emergencyFees(game: GameState): number {
  return game.orders.reduce((s, o) => s + o.emergencyFee, 0);
}

export function isRunning(game: GameState | null): game is GameState {
  return !!game && game.acceptance === 'not-submitted';
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      game: null,
      tool: 'select',
      material: null,
      rotation: 0,
      selectedId: null,
      movingId: null,
      hover: null,
      rulerPoints: [],
      message: null,
      modal: null,
      playback: null,
      nowMs: Date.now(),
      removeHintShown: false,

      requestRemove: (pieceId) => {
        if (get().removeHintShown) { set({ selectedId: pieceId }); get().removeSelected(); return; }
        set({ modal: { kind: 'remove', pieceId } });
      },

      flash: (text) => set({ message: { text, at: Date.now() } }),
      log: (text) => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, log: [...g.log, { at: nowIso(), text }].slice(-200) } });
      },

      startGame: (teamName) => {
        const inv = emptyInventory();
        inv.domino = 1;
        const game: GameState = {
          teamName: teamName.trim(),
          startedAt: nowIso(),
          budget: START_BUDGET,
          orders: [],
          inventory: inv,
          board: [],
          carUnlocked: false,
          carOnBoard: null,
          rehearsals: 0,
          acceptance: 'not-submitted',
          log: [{ at: nowIso(), text: `專案開始。小組：${teamName.trim()}。起始預算 ${START_BUDGET} 點，免費骨牌 1 枚。` }],
        };
        set({ game, modal: { kind: 'camera-hint' } });
      },

      tick: () => set({ nowMs: Date.now() }),

      expire: (snapshot) => {
        const g = get().game;
        if (!isRunning(g)) return;
        set({
          game: {
            ...g,
            endedAt: new Date(new Date(g.startedAt).getTime() + GAME_MINUTES * 60_000).toISOString(),
            acceptance: 'expired',
            failureReason: '專案失敗：未在期限內送交正式驗收。',
            finalSnapshot: snapshot ?? g.finalSnapshot,
            log: [...g.log, { at: nowIso(), text: '時間到期，施工板已鎖定。' }],
          },
          modal: null,
          playback: null,
          movingId: null,
          material: null,
        });
      },

      resetAll: () => set({ game: null, tool: 'select', material: null, rotation: 0, selectedId: null, movingId: null, hover: null, rulerPoints: [], playback: null, modal: null, message: null }),

      loadDemoLayout: () => {
        const g = get().game;
        if (!isRunning(g)) return;
        const board = buildPassingBoard();
        const inv = { ...g.inventory };
        for (const p of board) inv[p.kind] = (inv[p.kind] ?? 0) + 0;
        set({ game: { ...g, board, inventory: inv, carUnlocked: true, log: [...g.log, { at: nowIso(), text: '（示範）已載入示範配置。' }] } });
      },

      purchase: (cart) => {
        const g = get().game;
        if (!isRunning(g)) return false;
        const order = buildOrder(cart, g.orders.length + 1, nowIso());
        if (!order.lines.length) { get().flash('訂單是空的。'); return false; }
        if (order.total > g.budget) { get().flash(`預算不足：此訂單需要 ${order.total} 點，剩餘 ${g.budget} 點。`); return false; }
        const inv = { ...g.inventory };
        for (const [k, n] of Object.entries(piecesFromOrder(order))) inv[k as PieceKind] += n ?? 0;
        set({
          game: {
            ...g,
            budget: g.budget - order.total,
            orders: [...g.orders, order],
            inventory: inv,
            log: [...g.log, { at: nowIso(), text: `已完成第 ${order.orderNo} 次採購，花費 ${order.total} 點${order.emergencyFee ? `（含行政費 ${order.emergencyFee} 點）` : ''}。` }],
          },
        });
        return true;
      },

      setTool: (t) => set({ tool: t, material: t === 'place' ? get().material : null, movingId: null, rulerPoints: [] }),
      pickMaterial: (m) => set({ material: m, tool: m ? 'place' : 'select', selectedId: null, movingId: null, rulerPoints: [] }),
      rotateGhost: (step = 90) => {
        const s = get();
        const kind = s.movingId ? s.game?.board.find((b) => b.id === s.movingId)?.kind : s.material;
        const st = kind === 'domino' ? step : 90 * Math.sign(step || 90);
        set({ rotation: nextRotation(s.rotation, st) });
      },
      setHover: (p) => set({ hover: p }),

      placeAt: (x, y, preferZ) => {
        const s = get();
        const g = s.game;
        if (!isRunning(g) || s.playback) return;
        if (!inBoard(x, y)) return;

        // moving an existing piece
        if (s.movingId) {
          const p = g.board.find((b) => b.id === s.movingId);
          if (!p) { set({ movingId: null }); return; }
          const r = checkPlacement(g.board, p.kind, x, y, s.rotation, p.id, preferZ);
          if (!r.ok) { s.flash(r.reason); return; }
          const board = g.board.map((b) => (b.id === p.id ? { ...b, x, y, z: r.z, rotation: s.rotation, fallen: false } : b));
          set({ game: { ...g, board }, movingId: null, selectedId: p.id, tool: 'select' });
          return;
        }

        if (s.tool !== 'place' || !s.material) return;

        const kind = s.material;
        if ((g.inventory[kind] ?? 0) <= 0) { s.flash(`庫存沒有${PIECES[kind].label}，請先採購。`); return; }
        const r = checkPlacement(g.board, kind, x, y, s.rotation, undefined, preferZ);
        if (!r.ok) { s.flash(r.reason); return; }
        const piece: BoardPiece = { id: newId(), kind, x, y, z: r.z, rotation: s.rotation };
        const inv = { ...g.inventory, [kind]: g.inventory[kind] - 1 };
        const remaining = inv[kind];
        set({
          game: { ...g, board: [...g.board, piece], inventory: inv },
          material: remaining > 0 ? kind : null,
          tool: remaining > 0 ? 'place' : 'select',
        });
        if (remaining === 0) s.flash(`${PIECES[kind].label}庫存已用完。`);
      },

      selectPiece: (id) => set({ selectedId: id, movingId: null, material: id ? null : get().material, tool: id ? 'select' : get().tool }),

      beginMove: (id) => {
        const g = get().game;
        if (!isRunning(g)) return;
        const above = piecesAbove(g.board, id);
        if (above.length) { get().flash('上方還有物件，請先移除上方物件。'); return; }
        const p = g.board.find((b) => b.id === id);
        if (!p) return;
        set({ movingId: id, rotation: p.rotation, selectedId: id, tool: 'place', material: null });
      },
      cancelMove: () => set({ movingId: null, tool: 'select' }),

      rotateSelected: (step = 90) => {
        const s = get(); const g = s.game;
        if (!isRunning(g) || !s.selectedId) return;
        const p = g.board.find((b) => b.id === s.selectedId);
        if (!p) return;
        const rot = nextRotation(p.rotation, p.kind === 'domino' ? step : 90 * Math.sign(step || 90));
        if (p.kind === 'domino') {
          const r = checkPlacement(g.board, 'domino', p.x, p.y, rot, p.id);
          if (!r.ok) { s.flash('轉到這個角度會碰到旁邊的骨牌。'); return; }
          set({ game: { ...g, board: g.board.map((b) => (b.id === p.id ? { ...b, rotation: rot } : b)) } });
          return;
        }
        if (PIECES[p.kind].w === PIECES[p.kind].d) {
          set({ game: { ...g, board: g.board.map((b) => (b.id === p.id ? { ...b, rotation: rot } : b)) } });
          return;
        }
        if (piecesAbove(g.board, p.id).length) { s.flash('上方還有物件，無法原地旋轉。'); return; }
        const r = checkPlacement(g.board, p.kind, p.x, p.y, rot, p.id);
        if (!r.ok || r.z !== p.z) { s.flash('旋轉後會與其他物件重疊，請先移動。'); return; }
        set({ game: { ...g, board: g.board.map((b) => (b.id === p.id ? { ...b, rotation: rot } : b)) } });
      },

      removeSelected: () => {
        const s = get(); const g = s.game;
        if (!isRunning(g) || !s.selectedId) return;
        const p = g.board.find((b) => b.id === s.selectedId);
        if (!p) return;
        if (piecesAbove(g.board, p.id).length) { s.flash('上方還有物件，請先移除上方物件。'); return; }
        set({
          game: {
            ...g,
            board: g.board.filter((b) => b.id !== p.id),
            inventory: { ...g.inventory, [p.kind]: g.inventory[p.kind] + 1 },
          },
          selectedId: null,
          modal: null,
          removeHintShown: true,
        });
      },

      restandSelected: () => {
        const s = get(); const g = s.game;
        if (!isRunning(g) || !s.selectedId) return;
        set({ game: { ...g, board: g.board.map((b) => (b.id === s.selectedId ? { ...b, fallen: false } : b)) } });
      },

      placeCarAtStart: () => {
        const g = get().game;
        if (!isRunning(g) || !g.carUnlocked) return;
        set({ game: { ...g, carOnBoard: { x: -CAR_LENGTH, y: LANE_Y0 } }, material: null, tool: 'select' });
      },

      removeCar: () => {
        const g = get().game;
        if (!isRunning(g)) return;
        set({ game: { ...g, carOnBoard: null } });
      },

      addRulerPoint: (p) => {
        const pts = get().rulerPoints;
        set({ rulerPoints: pts.length >= 2 ? [p] : [...pts, p] });
      },
      clearRuler: () => set({ rulerPoints: [] }),

      unlockCar: (code) => {
        const g = get().game;
        if (!isRunning(g)) return false;
        if (code.trim() !== CAR_AUTH_CODE) { get().flash('授權碼不正確。'); return false; }
        if (g.carUnlocked) { get().flash('測試小車已經解鎖。'); return true; }
        set({ game: { ...g, carUnlocked: true, log: [...g.log, { at: nowIso(), text: '客戶已授權：取得 1 台測試小車。' }] } });
        return true;
      },

      openModal: (m) => set({ modal: m }),

      rehearse: () => {
        const g = get().game;
        if (!isRunning(g) || !g.carUnlocked) return;
        const sim = simulate(g.board);
        const fallen = new Set(sim.falls.map((f) => f.id));
        const board = g.board.map((b) => (fallen.has(b.id) ? { ...b, fallen: true } : b));
        set({
          game: { ...g, board, carOnBoard: null, rehearsals: g.rehearsals + 1, log: [...g.log, { at: nowIso(), text: `第 ${g.rehearsals + 1} 次全程演練。` }] },
          modal: null,
          selectedId: null,
          movingId: null,
          material: null,
          tool: 'select',
          playback: { mode: 'rehearsal', sim, startedAt: performance.now() },
        });
        setTimeout(() => get().finishPlayback(), playbackDuration(sim) * 1000 + 100);
      },

      submitAcceptance: (snapshot) => {
        const g = get().game;
        if (!isRunning(g) || !g.carUnlocked) return;
        const result = runAcceptance(g.board);
        const fallen = new Set(result.sim.falls.map((f) => f.id));
        const board = g.board.map((b) => (fallen.has(b.id) ? { ...b, fallen: true } : b));
        set({
          game: {
            ...g,
            board,
            carOnBoard: null,
            endedAt: nowIso(),
            acceptance: result.ok ? 'success' : 'failed',
            failureReason: result.reason,
            finalSnapshot: snapshot,
            log: [...g.log, { at: nowIso(), text: '已送交正式驗收，施工板鎖定。' }],
          },
          modal: null,
          selectedId: null,
          movingId: null,
          material: null,
          tool: 'select',
          playback: { mode: 'acceptance', sim: result.sim, startedAt: performance.now() },
        });
        setTimeout(() => get().finishPlayback(), playbackDuration(result.sim) * 1000 + 100);
      },

      finishPlayback: () => set({ playback: null }),
    }),
    {
      name: 'domino-mission-v1',
      partialize: (s) => ({ game: s.game }),
    },
  ),
);

const CAR_SPEED = 7; // cells per second
const STEP = 0.13;   // seconds per chain step

/** Total seconds the playback animation takes. */
export function playbackDuration(sim: SimulationResult): number {
  const travel = sim.carStopX + CAR_LENGTH;
  const maxT = sim.falls.reduce((m, f) => Math.max(m, f.t), -1);
  return travel / CAR_SPEED + (maxT + 1) * STEP + 1.2;
}

/** Used by the 3D scene to tell whether a piece has visually fallen yet during playback. */
export function playbackState(pb: Playback | null, nowPerf: number) {
  if (!pb) return null;
  const elapsed = (nowPerf - pb.startedAt) / 1000;
  const startX = -CAR_LENGTH;
  const carDuration = (pb.sim.carStopX - startX) / CAR_SPEED;
  const carFront = Math.min(pb.sim.carStopX, startX + CAR_LENGTH + elapsed * CAR_SPEED);
  const fallenNow = new Set<string>();
  for (const f of pb.sim.falls) if (elapsed >= carDuration + f.t * STEP) fallenNow.add(f.id);
  const done = elapsed >= playbackDuration(pb.sim);
  return { carFront, fallenNow, done };
}

if (import.meta.env.DEV) (window as unknown as { __domino: typeof useStore }).__domino = useStore;
