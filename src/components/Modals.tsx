import { PIECES } from '../game/catalog';
import { useStore } from '../store';
import { captureSnapshot } from '../snapshot';

export default function Modals() {
  const modal = useStore((s) => s.modal);
  const game = useStore((s) => s.game);
  const { openModal, rehearse, submitAcceptance, removeSelected, selectPiece } = useStore.getState();
  if (!modal || !game) return null;
  const close = () => openModal(null);

  if (modal.kind === 'camera-hint') {
    return (
      <Dialog title="操作提示" onClose={close}>
        <ul>
          <li>左鍵拖曳旋轉視角、滾輪縮放、右鍵拖曳平移。</li>
          <li>從左側「庫存」點選材料，再點工地位置放置；放在積木上即為堆疊。</li>
          <li>點選板上物件可移動、旋轉或收回；<kbd>R</kbd> 旋轉、<kbd>Esc</kbd> 取消。</li>
          <li>倒數已經開始。</li>
        </ul>
        <div className="btn-row end"><button className="btn btn-blue" onClick={close}>開始施工</button></div>
      </Dialog>
    );
  }

  if (modal.kind === 'rehearse') {
    return (
      <Dialog title="全程演練" onClose={close}>
        <p>全程演練會使被觸發的骨牌倒下。演練後須由小組自行逐一重新排列與扶正；系統不會自動復原。是否已完成小組確認？</p>
        <div className="btn-row end">
          <button className="btn btn-ghost" onClick={close}>取消</button>
          <button className="btn btn-red" onClick={rehearse}>小組已確認，開始演練</button>
        </div>
      </Dialog>
    );
  }

  if (modal.kind === 'accept') {
    return (
      <Dialog title="正式驗收（僅 1 次）" onClose={close}>
        <p>送交正式驗收後，施工板立即鎖定、計時停止，且不可撤回。驗收一次成功才算專案成功。</p>
        <p className="muted">驗收後可從結果頁恢復配置繼續修正，但正式驗收只有這一次。</p>
        <p className="muted">送驗前請確認所有骨牌都已扶正、小車已移開。</p>
        <div className="btn-row end">
          <button className="btn btn-ghost" onClick={close}>取消</button>
          <button
            className="btn btn-blue"
            onClick={() => {
              submitAcceptance(captureSnapshot());
            }}
          >
            確認送交正式驗收
          </button>
        </div>
      </Dialog>
    );
  }

  if (modal.kind === 'restart') {
    return (
      <Dialog title="重頭開始" onClose={close}>
        <p>這會清除這台電腦上本次專案的所有紀錄（施工板、採購、時間），回到輸入小組名稱的畫面，且無法復原。</p>
        <div className="btn-row end">
          <button className="btn btn-ghost" onClick={close}>取消</button>
          <button className="btn btn-red" onClick={() => useStore.getState().resetAll()}>確認清除並重頭開始</button>
        </div>
      </Dialog>
    );
  }

  if (modal.kind === 'rehearsal-result') {
    const r = game.lastRehearsal;
    if (!r) { close(); return null; }
    const passed = r.items.filter((i) => i.ok).length;
    return (
      <Dialog title={`演練結果（第 ${game.rehearsals} 次）：${passed} / ${r.items.length} 項符合`} onClose={close}>
        <ul className="checklist">
          {r.items.map((i) => (
            <li key={i.label} className={i.ok ? 'ok' : 'bad'}>
              <span className="check-mark">{i.ok ? '✓' : '✗'}</span>
              <b>{i.label}</b>
              <span className="check-detail">{i.detail}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">倒下的骨牌請逐一扶正後再調整。正式驗收以同樣規則判定。</p>
        <div className="btn-row end"><button className="btn btn-blue" onClick={close}>知道了</button></div>
      </Dialog>
    );
  }

  if (modal.kind === 'remove') {
    const p = game.board.find((b) => b.id === modal.pieceId);
    if (!p) { close(); return null; }
    return (
      <Dialog title="收回材料" onClose={close}>
        <p>將這個{PIECES[p.kind].label}收回庫存？材料會回到庫存可再使用，但已付的成本不會退還。</p>
        <p className="muted small">之後收回材料不會再詢問。</p>
        <div className="btn-row end">
          <button className="btn btn-ghost" onClick={close}>取消</button>
          <button className="btn btn-red" onClick={() => { selectPiece(p.id); removeSelected(); }}>收回</button>
        </div>
      </Dialog>
    );
  }
  return null;
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
