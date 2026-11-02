import { useEffect, useState } from 'react';
import { MAX_DISTANCE, MIN_DISTANCE, onDistanceChange, pan, resetView, rotate, setDistance, tilt, zoomBy } from '../camera';
import { PIECES } from '../game/catalog';
import { useStore } from '../store';

/**
 * Toolbar under the 3D stage: interaction mode (select / place / ruler) on the left,
 * camera controls (zoom slider, pan, rotate, tilt, reset) on the right.
 * It sits outside the canvas so it never covers the board.
 */
export default function StageToolbar() {
  const tool = useStore((s) => s.tool);
  const material = useStore((s) => s.material);
  const movingId = useStore((s) => s.movingId);
  const { setTool, pickMaterial, cancelMove, flash } = useStore.getState();

  const [distance, setDist] = useState(60);
  useEffect(() => onDistanceChange(setDist), []);
  const sliderValue = Math.round(((MAX_DISTANCE - distance) / (MAX_DISTANCE - MIN_DISTANCE)) * 100);
  const onSlider = (v: number) => setDistance(MAX_DISTANCE - (v / 100) * (MAX_DISTANCE - MIN_DISTANCE));
  const zoomPct = Math.round((60 / distance) * 100);

  const selectMode = tool === 'select' && !movingId;
  const placeMode = tool === 'place' && !!material;
  const rulerMode = tool === 'ruler';

  return (
    <div className="toolbar" aria-label="操作與鏡頭">
      <div className="mode">
        <button
          type="button"
          className={`mode-btn ${selectMode ? 'active' : ''}`}
          onClick={() => { if (movingId) cancelMove(); pickMaterial(null); setTool('select'); }}
          title="選取模式：點選板上物件來移動、旋轉或收回"
        >
          ➤ 選取
        </button>
        <button
          type="button"
          className={`mode-btn ${placeMode ? 'active' : ''}`}
          onClick={() => {
            if (material) { setTool('place'); return; }
            flash('請先到「庫存」點選要放置的材料。');
          }}
          title="放置模式：點工地位置放下目前材料"
        >
          ▦ 放置{material ? `：${PIECES[material].label}` : ''}
        </button>
        <button
          type="button"
          className={`mode-btn ${rulerMode ? 'active' : ''}`}
          onClick={() => setTool(rulerMode ? 'select' : 'ruler')}
          title="尺規：點兩個位置量距離與高度"
        >
          📏 尺規
        </button>
      </div>

      <div className="cam">
        <div className="cam-zoom">
          <button type="button" className="cam-btn" onClick={() => zoomBy(1.2)} aria-label="縮小" title="縮小">－</button>
          <input type="range" min={0} max={100} value={sliderValue} onChange={(e) => onSlider(Number(e.target.value))} aria-label="縮放比例" title={`縮放 ${zoomPct}%`} />
          <button type="button" className="cam-btn" onClick={() => zoomBy(1 / 1.2)} aria-label="放大" title="放大">＋</button>
          <span className="cam-pct">{zoomPct}%</span>
        </div>
        <div className="cam-group">
          <button type="button" className="cam-btn" onClick={() => pan(-1, 0)} aria-label="往左移" title="往左移">◀</button>
          <button type="button" className="cam-btn" onClick={() => pan(0, 1)} aria-label="往上移" title="往上移">▲</button>
          <button type="button" className="cam-btn" onClick={() => pan(0, -1)} aria-label="往下移" title="往下移">▼</button>
          <button type="button" className="cam-btn" onClick={() => pan(1, 0)} aria-label="往右移" title="往右移">▶</button>
        </div>
        <div className="cam-group">
          <button type="button" className="cam-btn" onClick={() => rotate(-15)} aria-label="向左旋轉" title="向左旋轉">↺</button>
          <button type="button" className="cam-btn" onClick={() => rotate(15)} aria-label="向右旋轉" title="向右旋轉">↻</button>
          <button type="button" className="cam-btn" onClick={() => tilt(-10)} aria-label="俯視角度加大" title="俯視角度加大">⤒</button>
          <button type="button" className="cam-btn" onClick={() => tilt(10)} aria-label="俯視角度減小" title="俯視角度減小">⤓</button>
        </div>
        <button type="button" className="cam-btn cam-reset" onClick={resetView} aria-label="重設視角" title="重設視角">⌂<span> 重設</span></button>
      </div>
    </div>
  );
}
