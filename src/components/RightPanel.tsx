import { useState } from 'react';
import { PIECES, dirLabel } from '../game/catalog';
import { columnHeight } from '../game/board';
import { useStore } from '../store';

export default function RightPanel() {
  const game = useStore((s) => s.game)!;
  const selectedId = useStore((s) => s.selectedId);
  const movingId = useStore((s) => s.movingId);
  const tool = useStore((s) => s.tool);
  const material = useStore((s) => s.material);
  const rotation = useStore((s) => s.rotation);
  const playback = useStore((s) => s.playback);
  const { openModal, beginMove, rotateSelected, restandSelected, cancelMove, rotateGhost, pickMaterial, requestRemove } = useStore.getState();
  const selected = selectedId ? game.board.find((b) => b.id === selectedId) : undefined;

  return (
    <aside className="panel panel-right">
      <div className="panel-body">

        {movingId && (
          <section className="card">
            <h4>移動中</h4>
            <p>點選工地上的新位置放下。<kbd>R</kbd> 旋轉，<kbd>Esc</kbd> 取消。</p>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => rotateGhost(15)}>↺ 15°</button>
              <button className="btn btn-ghost" onClick={() => rotateGhost(-15)}>↻ 15°</button>
              <button className="btn btn-ghost" onClick={() => rotateGhost(90)}>旋轉 90°</button>
              <button className="btn btn-ghost" onClick={cancelMove}>取消移動</button>
            </div>
          </section>
        )}

        {!movingId && tool === 'place' && material && (
          <section className="card">
            <h4>放置中：{PIECES[material].label}</h4>
            <p>點選工地位置放置。放在積木上方即為堆疊。</p>
            <div className="btn-row">
              {material === 'domino' && <button className="btn btn-ghost" onClick={() => rotateGhost(15)}>↺ 15°</button>}
              {material === 'domino' && <button className="btn btn-ghost" onClick={() => rotateGhost(-15)}>↻ 15°</button>}
              <button className="btn btn-ghost" onClick={() => rotateGhost(90)}>旋轉 90°</button>
              <button className="btn btn-ghost" onClick={() => pickMaterial(null)}>結束放置</button>
            </div>
            {material === 'domino' && <p className="muted small">目前角度 {rotation}°；鍵盤 <kbd>Q</kbd>／<kbd>E</kbd> 微調 15°，<kbd>R</kbd> 轉 90°。</p>}
          </section>
        )}

        {selected && !movingId && (
          <section className="card">
            <h4>已選取：{PIECES[selected.kind].label}</h4>
            <p className="muted">
              底部高度 {selected.z} cm；此處堆疊總高 {columnHeight(game.board, selected.x, selected.y)} cm
              {selected.kind === 'domino' && <>；倒下方向 {dirLabel(selected.rotation)}</>}
              {selected.fallen && <>；<b className="danger">已倒下</b></>}
            </p>
            <div className="btn-col">
              {selected.fallen && <button className="btn btn-yellow" onClick={restandSelected}>扶正這枚骨牌</button>}
              <button className="btn btn-ghost" onClick={() => beginMove(selected.id)}>移動</button>
              {selected.kind === 'domino' && (
                <div className="btn-row">
                  <button className="btn btn-ghost" onClick={() => rotateSelected(15)}>↺ 15°</button>
                  <button className="btn btn-ghost" onClick={() => rotateSelected(-15)}>↻ 15°</button>
                </div>
              )}
              <button className="btn btn-ghost" onClick={() => rotateSelected(90)}>旋轉 90°</button>
              <button className="btn btn-ghost danger-ghost" onClick={() => requestRemove(selected.id)}>收回到庫存</button>
            </div>
          </section>
        )}

        <ClientSection />

        {game.carUnlocked && (
          <section className="card">
            <h4>測試與驗收</h4>
            <button className="btn btn-red btn-block" disabled={!!playback} onClick={() => openModal({ kind: 'rehearse' })}>
              全程演練
              <small>骨牌會倒下，需自行扶正</small>
            </button>
            <button className="btn btn-blue btn-block" disabled={!!playback} onClick={() => openModal({ kind: 'accept' })}>
              正式驗收
              <small>僅 1 次，送驗後鎖定</small>
            </button>
            <p className="muted small">已演練 {game.rehearsals} 次。</p>
          </section>
        )}
      </div>
    </aside>
  );
}

function ClientSection() {
  const game = useStore((s) => s.game)!;
  const unlockCar = useStore((s) => s.unlockCar);
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);
  if (game.carUnlocked) return null;
  return (
    <section className="card">
      {!open ? (
        <button className="btn btn-yellow btn-block" onClick={() => setOpen(true)}>輸入客戶授權碼…</button>
      ) : (
        <div className="auth">
          <label className="field">
            <span>客戶授權碼（由客戶輸入）</span>
            <input
              type="password"
              value={code}
              autoFocus
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && unlockCar(code)) { setCode(''); setOpen(false); } }}
            />
          </label>
          <div className="btn-row">
            <button className="btn btn-yellow" onClick={() => { if (unlockCar(code)) { setCode(''); setOpen(false); } }}>送出</button>
            <button className="btn btn-ghost" onClick={() => { setOpen(false); setCode(''); }}>取消</button>
          </div>
        </div>
      )}
    </section>
  );
}
