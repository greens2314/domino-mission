import { describe, expect, it } from 'vitest';
import { BoardBuilder, buildPassingBoard } from './fixtures';
import { checkPlacement, dominoBox, boxesOverlap } from './board';
import { simulate, propagate } from './simulate';
import {
  detectGates, brickComponents, runAcceptance, validateGates, validatePillars,
  validateStairsShape, validateDiamondShape, validateMaterialUse, findDiamond, countReversals,
} from './rules';
import { PIECES, PIECE_ORDER } from './catalog';
import { priceOf } from './shop';

describe('placement', () => {
  it('lands on the highest brick under the footprint', () => {
    const b = new BoardBuilder();
    b.column(3, 3, 2);
    const r = checkPlacement(b.pieces, 'brick-1x4', 3, 3, 0);
    expect(r).toEqual({ ok: true, z: 2 });
  });
  it('refuses to overlap and to go off-board', () => {
    const b = new BoardBuilder();
    b.add('domino', 5, 5, 0);
    expect(checkPlacement(b.pieces, 'brick-1x1', 5, 5, 0).ok).toBe(false);
    expect(checkPlacement(b.pieces, 'brick-1x8', 75, 0, 0).ok).toBe(false);
  });
  it('does not let anything rest on a domino', () => {
    const b = new BoardBuilder();
    b.add('domino', 5, 5, 0);
    b.add('brick-1x1', 6, 5, 0);
    // 1x2 brick over (5,5)+(6,5): brick top under footprint is 1, but domino column is taller
    expect(checkPlacement(b.pieces, 'brick-1x2', 5, 5, 0).ok).toBe(false);
  });
});

describe('shop prices', () => {
  it('ten-packs are 80% of ten singles', () => {
    for (const k of PIECE_ORDER) expect(PIECES[k].tenPack).toBe(PIECES[k].single * 8);
    expect(priceOf('domino', 'single', 3)).toBe(15);
    expect(priceOf('domino', 'ten-pack', 2)).toBe(80);
  });
});

describe('gates and pillars', () => {
  it('detects the two fixture gates', () => {
    const board = buildPassingBoard();
    const gates = detectGates(brickComponents(board));
    expect(gates.map((g) => g.centerX)).toEqual([2, 12]);
    expect(validateGates(board)).toBeNull();
    expect(validatePillars(board)).toBeNull();
  });
  it('rejects gates closer than 10 cm', () => {
    const b = new BoardBuilder();
    b.gate(2); b.gate(9);
    expect(validateGates(b.pieces)).toMatch(/距離不足/);
  });
  it('rejects a gate whose beam is too low for the car', () => {
    const b = new BoardBuilder();
    b.column(2, 11, 1); b.column(2, 15, 1); b.add('brick-1x6', 2, 10, 1, 90);
    expect(detectGates(brickComponents(b.pieces))).toHaveLength(0);
  });
  it('requires pillars of height >= 7 behind the gates', () => {
    const b = new BoardBuilder();
    b.gate(2); b.gate(12); b.column(14, 2, 6); b.column(14, 24, 7);
    expect(validatePillars(b.pieces)).toMatch(/柱子/);
  });
  it('flags bricks supported by dominoes', () => {
    const b = new BoardBuilder();
    b.add('domino', 4, 4, 0);
    b.pieces.push({ id: 'x', kind: 'brick-1x1', x: 4, y: 4, z: 2, rotation: 0 });
    expect(validateMaterialUse(b.pieces)).toMatch(/骨牌支撐/);
  });
});

describe('shapes', () => {
  it('finds the diamond template in either orientation', () => {
    const b = new BoardBuilder();
    b.diamond(10, 10);
    expect(findDiamond(b.pieces)?.size).toBe(60);
    expect(validateDiamondShape(b.pieces)).toBeNull();
    b.pieces.pop();
    expect(validateDiamondShape(b.pieces)).toMatch(/鑽石陣/);
  });
  it('requires exactly levels 1..8 for the stairs', () => {
    const b = new BoardBuilder();
    for (let k = 1; k <= 7; k++) b.step(k, 2, k, 0);
    expect(validateStairsShape(b.pieces)).toMatch(/缺少第 8 層/);
    b.step(8, 2, 9, 0);
    expect(validateStairsShape(b.pieces)).toMatch(/最高 9 層/);
  });
  it('counts reversals of an S path', () => {
    const b = new BoardBuilder();
    b.line(0, 0, 1, 0, 3, 0); b.line(3, 0, 0, 1, 3, 90); b.line(3, 3, -1, 0, 3, 180); b.line(0, 3, 0, 1, 2, 90); b.line(0, 5, 1, 0, 3, 0);
    expect(countReversals(b.pieces)).toBe(2);
  });
});

describe('simulation', () => {
  it('car stops at a lane brick', () => {
    const b = new BoardBuilder();
    b.add('brick-2x2', 6, 12, 0);
    const s = simulate(b.pieces);
    expect(s.blocked).toBe(true);
    expect(s.carStopX).toBe(6);
    expect(s.falls).toHaveLength(0);
  });
  it('fans out through a filled diamond and climbs/descends by one level', () => {
    const b = new BoardBuilder();
    b.add('domino', 9, 13, 0, 0);
    b.add('domino', 10, 13, 0, 0);
    b.step(11, 13, 1, 0);
    b.step(12, 13, 2, 0);
    b.step(13, 13, 1, 0);
    b.add('domino', 14, 13, 0, 0);
    b.diamond(15, 14);
    const s = simulate(b.pieces);
    expect(s.startDominoId).toBeDefined();
    expect(s.falls).toHaveLength(b.pieces.filter((p) => p.kind === 'domino').length);
  });
  it('is deterministic', () => {
    const board = buildPassingBoard();
    expect(simulate(board)).toEqual(simulate(board));
  });
});

describe('acceptance', () => {
  it('passes the reference layout', () => {
    const r = runAcceptance(buildPassingBoard());
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
  });
  it('fails when the car hits a domino before the second gate', () => {
    const board = buildPassingBoard();
    board.push({ id: 'early', kind: 'domino', x: 7, y: 13, z: 0, rotation: 0 });
    const r = runAcceptance(board);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/通過兩座門之前/);
  });
  it('reports the first failing rule in order (gates before chain)', () => {
    const board = buildPassingBoard().filter((p) => !(p.kind === 'brick-1x6' && p.x === 12));
    const r = runAcceptance(board);
    expect(r.reason).toMatch(/門/);
  });
  it('fails when the chain breaks inside the diamond', () => {
    const board = buildPassingBoard();
    // remove one domino from the diamond's middle row → shape incomplete
    const idx = board.findIndex((p) => p.kind === 'domino' && p.x === 38 && p.y === 8);
    board.splice(idx, 1);
    expect(runAcceptance(board).reason).toMatch(/鑽石陣/);
  });
  it('fails when a stair domino points the wrong way', () => {
    const board = buildPassingBoard();
    const d = board.find((p) => p.kind === 'domino' && p.x === 22 && p.y === 7)!;
    d.rotation = 90;
    const r = runAcceptance(board);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/階梯/);
  });
});

describe('half-cell dominoes', () => {
  it('allows 0.5 spacing along the fall direction but not across it', () => {
    const b = new BoardBuilder();
    b.add('domino', 5, 5, 0, 0);
    expect(checkPlacement(b.pieces, 'domino', 5.5, 5, 0).ok).toBe(true);   // ahead by half a cell
    expect(checkPlacement(b.pieces, 'domino', 5, 5.5, 0).ok).toBe(false);  // beside, tiles overlap
    expect(checkPlacement(b.pieces, 'domino', 5, 6, 0).ok).toBe(true);     // beside on the next cell
    expect(boxesOverlap(dominoBox(5, 5, 0), dominoBox(5.5, 5, 0))).toBe(false);
  });
  it('keeps bricks off cells touched by a half-positioned domino', () => {
    const b = new BoardBuilder();
    b.add('domino', 5.5, 5, 0, 0); // touches cells 5 and 6
    expect(checkPlacement(b.pieces, 'brick-1x1', 6, 5, 0).ok).toBe(false);
    expect(checkPlacement(b.pieces, 'brick-1x1', 7, 5, 0).ok).toBe(true);
  });
  it('requires a level surface under a straddling domino', () => {
    const b = new BoardBuilder();
    b.column(5, 5, 1);
    expect(checkPlacement(b.pieces, 'domino', 5.5, 5, 0).ok).toBe(false);
    b.column(6, 5, 1);
    expect(checkPlacement(b.pieces, 'domino', 5.5, 5, 0)).toEqual({ ok: true, z: 1 });
  });
  it('propagates through a densely packed chain and a half-spaced diamond', () => {
    const b = new BoardBuilder();
    for (let i = 0; i < 8; i++) b.add('domino', 10 + i * 0.5, 13, 0, 0);
    const rows = [2, 4, 6, 8, 10, 10, 8, 6, 4, 2];
    rows.forEach((sz, i) => { for (let y = 14 - sz / 2; y < 14 + sz / 2; y++) b.add('domino', 14.5 + i * 0.5, y, 0, 0); });
    const s = simulate(b.pieces);
    expect(s.falls).toHaveLength(b.pieces.length);
    expect(findDiamond(b.pieces)?.size).toBe(60);
  });
});

describe('drops', () => {
  it('a domino on top of a column topples a ground domino right in front of it', () => {
    const b = new BoardBuilder();
    b.step(5, 5, 8, 0);
    b.add('domino', 6, 5, 0, 0);
    b.add('domino', 7, 5, 0, 0);
    expect(propagate(b.pieces, [b.pieces.find((p) => p.kind === 'domino' && p.z === 8)!.id])).toHaveLength(3);
  });
  it('a domino cannot climb more than one layer', () => {
    const b = new BoardBuilder();
    b.add('domino', 5, 5, 0, 0);
    b.step(6, 5, 2, 0);
    expect(propagate(b.pieces, [b.pieces[0].id])).toHaveLength(1);
  });
});
