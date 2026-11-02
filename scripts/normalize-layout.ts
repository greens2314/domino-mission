// One-off: tidy Vita's hand-built layout so the chain actually propagates:
// orient S-path dominoes along the path, fill gaps > 1 cm, point stairs and diamond tiles +x.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseLayout, exportLayout } from '../src/layoutExport';
import { checkPlacement } from '../src/game/board';
import { runAcceptance, findDiamond } from '../src/game/rules';
import type { BoardPiece } from '../src/game/types';

const board = parseLayout(readFileSync('public/demo-layout.json', 'utf8'))!;
const snapDeg = (d: number) => ((Math.round(d / 15) * 15) % 360 + 360) % 360;
const snapHalf = (v: number) => Math.round(v * 2) / 2;

const isDom = (p: BoardPiece) => p.kind === 'domino';
const sPath = board.filter((p) => isDom(p) && p.z === 0 && p.x < 35);
const stairs = board.filter((p) => isDom(p) && p.z >= 1);
const after = board.filter((p) => isDom(p) && p.z === 0 && p.x >= 43);

// greedy nearest-neighbour order from the start domino (11,13)
const start = sPath.find((p) => p.x === 11 && p.y === 13)!;
const order: BoardPiece[] = [start];
const left = new Set(sPath.filter((p) => p !== start));
while (left.size) {
  const cur = order[order.length - 1];
  let best: BoardPiece | null = null, bd = Infinity;
  for (const p of left) { const d = Math.hypot(p.x - cur.x, p.y - cur.y); if (d < bd) { bd = d; best = p; } }
  if (!best || bd > 4) break;
  order.push(best); left.delete(best);
}
console.log('S path order', order.length, 'unreached', left.size);

const others = board.filter((p) => !sPath.includes(p));
const out: BoardPiece[] = [...others.map((p) => (isDom(p) ? { ...p, rotation: 0 } : p))];
let n = 0;
const add = (x: number, y: number, rot: number) => {
  const piece: BoardPiece = { id: `s${n++}`, kind: 'domino', x: snapHalf(x), y: snapHalf(y), z: 0, rotation: rot };
  const r = checkPlacement(out, 'domino', piece.x, piece.y, piece.rotation, undefined, 0); // ground level, even under a beam
  if (r.ok && r.z === 0) out.push(piece); else console.log('skip', piece.x, piece.y, r);
};
for (let i = 0; i < order.length; i++) {
  const cur = order[i];
  const next = order[i + 1] ?? { x: 35, y: 14 }; // the last tile faces stair 1
  const heading = snapDeg((Math.atan2(next.y - cur.y, next.x - cur.x) * 180) / Math.PI);
  add(cur.x, cur.y, heading);
  // fill gaps longer than 1 cm with intermediate tiles
  const d = Math.hypot(next.x - cur.x, next.y - cur.y);
  const steps = Math.floor(d / 1.0);
  for (let k = 1; k < steps; k++) add(cur.x + ((next.x - cur.x) * k) / steps, cur.y + ((next.y - cur.y) * k) / steps, heading);
}

const r = runAcceptance(out);
console.log('result', r.ok, r.reason, 'falls', r.sim.falls.length, '/', out.filter(isDom).length, 'stop', r.sim.carStopX, 'diamond', findDiamond(out)?.size);
const fallen = new Set(r.sim.falls.map((f) => f.id));
console.log('standing', out.filter((p) => isDom(p) && !fallen.has(p.id)).map((p) => `${p.x},${p.y}@${p.rotation}z${p.z}`).join(' '));
writeFileSync('public/demo-layout.json', exportLayout(out));
console.log('written', out.length, 'stairs', stairs.length, 'after', after.length);
