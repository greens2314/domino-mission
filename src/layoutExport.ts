import type { BoardPiece } from './game/types';

export type LayoutFile = { version: 1; board: BoardPiece[] };

/** Board → portable JSON (fallen flags dropped, ids regenerated on load). */
export function exportLayout(board: BoardPiece[]): string {
  const clean = board.map(({ kind, x, y, z, rotation }, i) => ({ id: `d${i}`, kind, x, y, z, rotation }));
  const file: LayoutFile = { version: 1, board: clean };
  return JSON.stringify(file);
}

export function parseLayout(text: string): BoardPiece[] | null {
  try {
    const data = JSON.parse(text) as Partial<LayoutFile>;
    if (!data || data.version !== 1 || !Array.isArray(data.board)) return null;
    return data.board.map((p, i) => ({
      id: `d${i}`,
      kind: p.kind,
      x: Number(p.x),
      y: Number(p.y),
      z: Number(p.z),
      rotation: Number(p.rotation ?? 0),
    }));
  } catch {
    return null;
  }
}

export async function copyLayoutToClipboard(board: BoardPiece[]): Promise<boolean> {
  const text = exportLayout(board);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback: prompt so the text can still be copied by hand
    window.prompt('複製下面這段配置：', text);
    return false;
  }
}

/** The teacher's demo layout: public/demo-layout.json (falls back to the built-in fixture). */
export async function fetchDemoLayout(): Promise<BoardPiece[] | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}demo-layout.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseLayout(await res.text());
  } catch {
    return null;
  }
}
