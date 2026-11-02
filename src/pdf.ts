import { jsPDF } from 'jspdf';
import { PIECES } from './game/catalog';
import type { GameState } from './game/types';
import { emergencyFees, totalSpent } from './store';
import { fmtClock, fmtDuration } from './components/TopBar';

/**
 * The PDF is rendered through a 2D canvas (system CJK fonts) and embedded as images,
 * so Traditional Chinese renders without shipping a font file.
 */
const W = 1240, H = 1754; // A4 @ 150 dpi
const M = 80;
const FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';

class Page {
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  y = M;
  constructor() {
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, W, H);
  }
}

export async function generatePdf(game: GameState, download = true): Promise<number> {
  const pages: Page[] = [];
  let page = new Page();
  pages.push(page);

  const ensure = (need: number) => {
    if (page.y + need > H - M) { page = new Page(); pages.push(page); }
  };
  const text = (s: string, size = 26, bold = false, color = '#1f2a44') => {
    ensure(size * 1.5);
    const ctx = page.ctx;
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    // naive wrap
    const maxW = W - 2 * M;
    let line = '';
    for (const ch of s) {
      if (ctx.measureText(line + ch).width > maxW) {
        ctx.fillText(line, M, page.y); page.y += size * 1.45; ensure(size * 1.5); line = ch;
      } else line += ch;
    }
    ctx.fillText(line, M, page.y);
    page.y += size * 1.5;
  };
  const gap = (n: number) => { page.y += n; };
  const rule = () => { ensure(20); page.ctx.fillStyle = '#c9b17c'; page.ctx.fillRect(M, page.y, W - 2 * M, 3); page.y += 24; };
  const kv = (rows: [string, string][]) => {
    for (const [k, v] of rows) {
      ensure(40);
      const ctx = page.ctx;
      ctx.font = `bold 24px ${FONT}`; ctx.fillStyle = '#5a6a86'; ctx.textBaseline = 'top';
      ctx.fillText(k, M, page.y);
      ctx.font = `24px ${FONT}`; ctx.fillStyle = '#1f2a44';
      ctx.fillText(v, M + 300, page.y);
      page.y += 40;
    }
  };
  const table = (head: string[], rows: string[][], widths: number[]) => {
    const drawRow = (cells: string[], bold: boolean, bg?: string) => {
      ensure(44);
      const ctx = page.ctx;
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(M, page.y - 4, W - 2 * M, 42); }
      ctx.font = `${bold ? 'bold ' : ''}21px ${FONT}`; ctx.fillStyle = '#1f2a44'; ctx.textBaseline = 'top';
      let x = M + 8;
      cells.forEach((c, i) => { ctx.fillText(c, x, page.y + 6); x += widths[i]; });
      page.y += 44;
      ctx.fillStyle = '#e4dccb'; ctx.fillRect(M, page.y - 4, W - 2 * M, 1);
    };
    drawRow(head, true, '#efe4c8');
    rows.forEach((r) => drawRow(r, false));
  };

  const success = game.acceptance === 'success';
  const ended = game.endedAt ?? new Date().toISOString();
  const used = new Date(ended).getTime() - new Date(game.startedAt).getTime();

  // header band
  page.ctx.fillStyle = '#172a46'; page.ctx.fillRect(0, 0, W, 150);
  page.ctx.font = `bold 44px ${FONT}`; page.ctx.fillStyle = '#f4ecd8'; page.ctx.textBaseline = 'top';
  page.ctx.fillText('骨牌任務 · 驗收報告', M, 40);
  page.ctx.font = `24px ${FONT}`; page.ctx.fillStyle = '#c9b17c';
  page.ctx.fillText(`小組：${game.teamName}`, M, 96);
  page.y = 190;

  text('基本資料', 30, true); gap(6);
  kv([
    ['小組名稱', game.teamName],
    ['遊戲開始時間', new Date(game.startedAt).toLocaleString('zh-TW', { hour12: false })],
    [game.acceptance === 'expired' ? '到期時間' : '結束時間', new Date(ended).toLocaleString('zh-TW', { hour12: false })],
    ['總使用時間', fmtDuration(used)],
  ]);
  gap(16); rule();

  text('專案結論', 30, true); gap(6);
  if (success) text('正式驗收成功：專案成功。', 28, true, '#1b7f4b');
  else if (game.acceptance === 'expired') text('專案失敗：未在期限內送交正式驗收（期限到期）。', 28, true, '#b3261e');
  else { text('正式驗收失敗：專案失敗。', 28, true, '#b3261e'); text(`第一個失敗原因：${game.failureReason ?? ''}`, 24); }
  gap(16); rule();

  text(game.acceptance === 'expired' ? '最終施工圖（時間到期時）' : '最終施工圖（送驗前）', 30, true); gap(10);
  if (game.finalSnapshot) {
    const img = await loadImage(game.finalSnapshot);
    const maxW = W - 2 * M;
    const scale = Math.min(maxW / img.width, 760 / img.height);
    const w = img.width * scale, h = img.height * scale;
    ensure(h + 20);
    page.ctx.drawImage(img, M, page.y, w, h);
    page.y += h + 20;
  } else text('（沒有快照）', 24, false, '#5a6a86');
  rule();

  text('採購紀錄', 30, true); gap(10);
  if (!game.orders.length) text('沒有採購。', 24, false, '#5a6a86');
  else {
    let cum = 0;
    const rows: string[][] = [];
    for (const o of game.orders) {
      cum += o.total;
      o.lines.forEach((l, i) => rows.push([
        i === 0 ? `#${o.orderNo}` : '', i === 0 ? fmtClock(o.at) : '', PIECES[l.kind].label,
        l.package === 'single' ? '單買' : '10 入', String(l.quantity), String(l.subtotal),
        i === 0 ? String(o.emergencyFee) : '', i === o.lines.length - 1 ? String(cum) : '',
      ]));
    }
    table(['訂單', '時間', '材料', '包裝', '數量', '材料成本', '行政費', '累計成本'], rows, [90, 130, 190, 110, 100, 150, 130, 150]);
  }
  gap(16); rule();

  text('資源摘要（僅作回顧，不作計分）', 30, true); gap(6);
  kv([
    ['總成本', `${totalSpent(game)} 點`],
    ['剩餘預算', `${game.budget} 點`],
    ['採購訂單數', `${game.orders.length} 張`],
    ['緊急採購／行政費', `${emergencyFees(game)} 點`],
    ['演練次數', `${game.rehearsals} 次`],
  ]);

  // footer on every page
  pages.forEach((p, i) => {
    p.ctx.font = `20px ${FONT}`; p.ctx.fillStyle = '#8a94a8'; p.ctx.textBaseline = 'top';
    p.ctx.fillText(`骨牌任務 驗收報告 · ${game.teamName} · 第 ${i + 1} / ${pages.length} 頁`, M, H - 50);
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  pages.forEach((p, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(p.canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
  });
  const stamp = new Date(game.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  if (download) pdf.save(`骨牌任務_驗收_${game.teamName}_${stamp}.pdf`);
  return pdf.output('arraybuffer').byteLength;
}

if (import.meta.env.DEV) (window as unknown as { __pdf: typeof generatePdf }).__pdf = generatePdf;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; });
}
