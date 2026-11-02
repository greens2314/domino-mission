import { useState } from 'react';
import { PIECES } from '../game/catalog';
import { emergencyFees, remainingMs, totalSpent, useStore } from '../store';
import { fmtClock, fmtDuration } from './TopBar';
import { generatePdf } from '../pdf';
import { copyLayoutToClipboard } from '../layoutExport';

export default function ResultScreen() {
  const game = useStore((s) => s.game)!;
  const resetAll = useStore((s) => s.resetAll);
  const restoreAfterAcceptance = useStore((s) => s.restoreAfterAcceptance);
  const nowMs = useStore((s) => s.nowMs);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const success = game.acceptance === 'success';
  const ended = game.endedAt ?? new Date().toISOString();
  const used = new Date(ended).getTime() - new Date(game.startedAt).getTime();
  const spent = totalSpent(game);

  const conclusion = success ? '正式驗收成功：專案成功' : game.acceptance === 'expired' ? '專案失敗：未在期限內送交正式驗收。' : '正式驗收失敗：專案失敗';

  return (
    <div className={`result ${success ? 'result-ok' : 'result-fail'}`}>
      <div className="result-card">
        <div className="result-head">
          <div>
            <div className="start-kicker">骨牌任務 · 結果</div>
            <h1>{conclusion}</h1>
            {!success && game.acceptance === 'failed' && (
              <p className="reason"><b>第一個失敗原因：</b>{game.failureReason}</p>
            )}
            {game.acceptance === 'expired' && <p className="reason">時間到期時尚未送交正式驗收。</p>}
          </div>
          <div className="btn-col">
            <button className="btn btn-blue btn-xl" disabled={busy} onClick={async () => { setBusy(true); try { await generatePdf(game); } finally { setBusy(false); } }}>
              {busy ? '產生中…' : '下載驗收 PDF'}
            </button>
            {game.preAcceptanceBoard && game.acceptance !== 'expired' && (
              <button className="btn btn-yellow" disabled={remainingMs(game, nowMs) <= 0} onClick={restoreAfterAcceptance} title="回到施工畫面，骨牌全部站回驗收時的樣子">
                恢復驗收時的配置，繼續修正
                {remainingMs(game, nowMs) <= 0 && <small>時間已到期</small>}
              </button>
            )}
            <button className="btn btn-ghost" onClick={async () => { await copyLayoutToClipboard(game.board); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>
              {copied ? '已複製配置' : '複製配置'}
            </button>
            {!confirmReset ? (
              <button className="btn btn-ghost" onClick={() => setConfirmReset(true)}>重新開始</button>
            ) : (
              <div className="confirm-inline">
                <p>重新開始會清空施工板與這台電腦的紀錄。請先確認已下載 PDF。</p>
                <div className="btn-row">
                  <button className="btn btn-red" onClick={resetAll}>確認重新開始</button>
                  <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>取消</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="result-grid">
          <section>
            <h3>基本資料</h3>
            <table className="tbl kv">
              <tbody>
                <tr><th>小組名稱</th><td>{game.teamName}</td></tr>
                <tr><th>遊戲開始</th><td>{fmtClock(game.startedAt)}</td></tr>
                <tr><th>{game.acceptance === 'expired' ? '到期時間' : '結束時間'}</th><td>{fmtClock(ended)}</td></tr>
                <tr><th>總使用時間</th><td>{fmtDuration(used)}</td></tr>
              </tbody>
            </table>
            <h3>資源摘要（僅作回顧，不計分）</h3>
            <table className="tbl kv">
              <tbody>
                <tr><th>總花費</th><td>{spent} 點</td></tr>
                <tr><th>剩餘預算</th><td>{game.budget} 點</td></tr>
                <tr><th>採購訂單數</th><td>{game.orders.length} 張</td></tr>
                <tr><th>緊急採購／行政費</th><td>{emergencyFees(game)} 點</td></tr>
                <tr><th>演練次數</th><td>{game.rehearsals} 次</td></tr>
              </tbody>
            </table>
          </section>
          <section>
            <h3>{game.acceptance === 'expired' ? '時間到期時的施工圖' : '驗收前施工圖'}</h3>
            {game.finalSnapshot ? <img className="snapshot" src={game.finalSnapshot} alt="施工圖快照" /> : <p className="muted">（沒有快照）</p>}
          </section>
        </div>

        <section>
          <h3>採購紀錄</h3>
          {game.orders.length === 0 ? <p className="muted">沒有採購。</p> : (
            <table className="tbl">
              <thead><tr><th>訂單</th><th>時間</th><th>材料</th><th>包裝</th><th>數量</th><th>材料成本</th><th>行政費</th><th>累計成本</th></tr></thead>
              <tbody>
                {(() => {
                  let cum = 0;
                  return game.orders.flatMap((o) => {
                    cum += o.total;
                    return o.lines.map((l, i) => (
                      <tr key={`${o.orderNo}-${i}`}>
                        <td>{i === 0 ? `#${o.orderNo}` : ''}</td>
                        <td>{i === 0 ? fmtClock(o.at) : ''}</td>
                        <td>{PIECES[l.kind].label}</td>
                        <td>{l.package === 'single' ? '單買' : '10 入'}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{l.subtotal}</td>
                        <td className="num">{i === 0 ? o.emergencyFee : ''}</td>
                        <td className="num">{i === o.lines.length - 1 ? cum : ''}</td>
                      </tr>
                    ));
                  });
                })()}
              </tbody>
            </table>
          )}
        </section>

      </div>
    </div>
  );
}
