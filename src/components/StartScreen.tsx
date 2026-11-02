import { useState } from 'react';
import { GAME_MINUTES, START_BUDGET } from '../game/catalog';
import { useStore } from '../store';
import { fetchDemoLayout } from '../layoutExport';

export default function StartScreen() {
  const [name, setName] = useState('');
  const startGame = useStore((s) => s.startGame);
  const demo = typeof location !== 'undefined' && /[?&]demo/.test(location.search);
  const start = async () => {
    startGame(name);
    if (demo) { const board = await fetchDemoLayout(); useStore.getState().loadDemoLayout(board ?? undefined); }
  };
  const ok = name.trim().length > 0;
  return (
    <div className="start">
      <div className="start-card">
        <div className="start-kicker">專案管理體驗遊戲</div>
        <h1>骨牌任務</h1>
        <p className="start-lead">
          在固定預算、有限採購次數與 {GAME_MINUTES} 分鐘倒數下，規畫、採買、搭建、向客戶釐清需求、取得測試小車、演練，並送交唯一一次的正式驗收。
        </p>
        <ul className="start-rules">
          <li>起始預算 <b>{START_BUDGET} 點</b>，初始庫存免費骨牌 1 枚。</li>
          <li>前 3 次採購不加費；第 4 次起每張訂單加收 50 點行政費。付款後不可退款。</li>
        </ul>
        <label className="field">
          <span>小組名稱</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：第 3 組"
            maxLength={30}
            onKeyDown={(e) => { if (e.key === 'Enter' && ok) start(); }}
          />
        </label>
        <button className="btn btn-blue btn-xl" disabled={!ok} onClick={start}>
          遊戲開始
        </button>
        <p className="start-note">按下後立即記錄開始時間並啟動倒數；請在教師說明與起始規畫結束後再按。</p>
      </div>
    </div>
  );
}
