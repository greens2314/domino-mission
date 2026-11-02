import { START_BUDGET, GAME_MINUTES, FREE_ORDERS } from '../game/catalog';
import { remainingMs, totalSpent, useStore } from '../store';

export function fmtClock(iso: string | number) {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function TopBar() {
  const game = useStore((s) => s.game)!;
  const nowMs = useStore((s) => s.nowMs);
  const remain = remainingMs(game, nowMs);
  const spent = totalSpent(game);
  const pctBudget = Math.round((game.budget / START_BUDGET) * 100);
  const pctTime = Math.round((remain / (GAME_MINUTES * 60_000)) * 100);
  const urgent = remain < 5 * 60_000;
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-title">骨牌任務</span>
        <span className="brand-team">{game.teamName}</span>
      </div>
      <div className="stat">
        <span className="stat-label">開始時間</span>
        <span className="stat-value">{fmtClock(game.startedAt)}</span>
      </div>
      <div className={`stat stat-wide ${urgent ? 'urgent' : ''}`}>
        <span className="stat-label">剩餘時間</span>
        <span className="stat-value stat-big">{fmtDuration(remain)}</span>
        <div className="bar"><div className="bar-fill bar-time" style={{ width: `${pctTime}%` }} /></div>
      </div>
      <div className="stat">
        <span className="stat-label">已花費</span>
        <span className="stat-value">{spent} 點</span>
      </div>
      <div className="stat stat-wide">
        <span className="stat-label">剩餘預算</span>
        <span className="stat-value stat-big">{game.budget} 點</span>
        <div className="bar"><div className="bar-fill bar-budget" style={{ width: `${pctBudget}%` }} /></div>
      </div>
      <div className="stat">
        <span className="stat-label">剩餘採購機會</span>
        <span className="stat-value">{Math.max(0, FREE_ORDERS - game.orders.length)} 次</span>
      </div>
      <button className="btn btn-ghost restart-btn" onClick={() => useStore.getState().openModal({ kind: 'restart' })} title="清除所有紀錄並重頭開始">重頭開始</button>
    </header>
  );
}
