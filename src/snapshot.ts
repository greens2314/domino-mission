import type * as THREE from 'three';

/** Handles registered by the 3D canvas so the result page can capture a snapshot. */
export type ThreeHandles = { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera };

const handles: { current: ThreeHandles | null } = { current: null };

export function registerThree(h: ThreeHandles) {
  handles.current = h;
}

function downscale(src: HTMLCanvasElement): string {
  const w = 960, h = Math.max(1, Math.round((src.height / Math.max(1, src.width)) * 960));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(src, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.85);
}

/** Captures the current 3D view as a JPEG data URL (empty string when nothing can be captured). */
export function captureSnapshot(): string {
  try {
    const t = handles.current;
    if (t) {
      t.gl.render(t.scene, t.camera);
      return downscale(t.gl.domElement);
    }
    const el = document.querySelector<HTMLCanvasElement>('.stage canvas');
    return el ? downscale(el) : '';
  } catch {
    return '';
  }
}
