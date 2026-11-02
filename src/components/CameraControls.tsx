import { useEffect, useState } from 'react';
import { MAX_DISTANCE, MIN_DISTANCE, onDistanceChange, pan, resetView, rotate, setDistance, tilt, zoomBy } from '../camera';

/** On-screen camera controls overlaid on the 3D stage: zoom slider, pan, rotate, tilt, reset. */
export default function CameraControls() {
  const [distance, setDist] = useState(60);
  useEffect(() => onDistanceChange(setDist), []);
  // slider: left = far (small), right = near (large) → invert distance
  const sliderValue = Math.round(((MAX_DISTANCE - distance) / (MAX_DISTANCE - MIN_DISTANCE)) * 100);
  const onSlider = (v: number) => setDistance(MAX_DISTANCE - (v / 100) * (MAX_DISTANCE - MIN_DISTANCE));
  const zoomPct = Math.round(60 / distance * 100);

  return (
    <div className="cam" aria-label="鏡頭控制">
      <div className="cam-zoom">
        <button type="button" className="cam-btn" onClick={() => zoomBy(1 / 1.2)} aria-label="放大" title="放大">＋</button>
        <input
          type="range"
          min={0}
          max={100}
          value={sliderValue}
          onChange={(e) => onSlider(Number(e.target.value))}
          aria-label="縮放比例"
          title={`縮放 ${zoomPct}%`}
        />
        <button type="button" className="cam-btn" onClick={() => zoomBy(1.2)} aria-label="縮小" title="縮小">－</button>
        <span className="cam-pct">{zoomPct}%</span>
      </div>
      <div className="cam-pad">
        <button type="button" className="cam-btn" style={{ gridArea: 'up' }} onClick={() => pan(0, 1)} aria-label="往上移" title="往上移">▲</button>
        <button type="button" className="cam-btn" style={{ gridArea: 'left' }} onClick={() => pan(-1, 0)} aria-label="往左移" title="往左移">◀</button>
        <button type="button" className="cam-btn cam-reset" style={{ gridArea: 'mid' }} onClick={resetView} aria-label="重設視角" title="重設視角">⌂</button>
        <button type="button" className="cam-btn" style={{ gridArea: 'right' }} onClick={() => pan(1, 0)} aria-label="往右移" title="往右移">▶</button>
        <button type="button" className="cam-btn" style={{ gridArea: 'down' }} onClick={() => pan(0, -1)} aria-label="往下移" title="往下移">▼</button>
      </div>
      <div className="cam-rot">
        <button type="button" className="cam-btn" onClick={() => rotate(-15)} aria-label="向左旋轉" title="向左旋轉">↺</button>
        <button type="button" className="cam-btn" onClick={() => rotate(15)} aria-label="向右旋轉" title="向右旋轉">↻</button>
        <button type="button" className="cam-btn" onClick={() => tilt(-10)} aria-label="俯視角度加大" title="俯視角度加大">⤒</button>
        <button type="button" className="cam-btn" onClick={() => tilt(10)} aria-label="俯視角度減小" title="俯視角度減小">⤓</button>
      </div>
    </div>
  );
}
