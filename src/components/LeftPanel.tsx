import { useMemo, useState } from 'react';
import { EMERGENCY_FEE, FREE_ORDERS, PIECES, PIECE_ORDER, MAX_CLARIFICATIONS } from '../game/catalog';
import { buildOrder, type CartItem } from '../game/shop';
import type { PackageKind, PieceKind } from '../game/types';
import { useStore } from '../store';
import { fmtClock } from './TopBar';

type Tab = 'brief' | 'shop' | 'inventory' | 'tools' | 'orders';

export default function LeftPanel() {
  const [tab, setTab] = useState<Tab>('brief');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'brief', label: '任務書' },
    { id: 'shop', label: '商店' },
    { id: 'inventory', label: '庫存' },
    { id: 'tools', label: '工具' },
    { id: 'orders', label: '採購紀錄' },
  ];
  return (
    <aside className="panel panel-left">
      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      <div className="panel-body">
        {tab === 'brief' && <Brief />}
        {tab === 'shop' && <Shop />}
        {tab === 'inventory' && <Inventory />}
        {tab === 'tools' && <Tools />}
        {tab === 'orders' && <Orders />}
      </div>
    </aside>
  );
}

function Brief() {
  return (
    <div className="brief">
      <h3>專案任務書</h3>
      <p>施工板一開始是空白的。請用採購後的材料完成以下成果，並在 60 分鐘內送交正式驗收。</p>
      <table className="tbl">
        <tbody>
          <tr><th>門</th><td>建造 2 個門；兩門之間距離須至少 10 cm。</td></tr>
          <tr><th>柱子</th><td>建造 2 根柱子；每根高度須大於 6 cm。</td></tr>
          <tr><th>S 型路徑</th><td>排出可連鎖倒下的 S 型骨牌路徑。</td></tr>
          <tr><th>骨牌階梯</th><td>建造精確 8 層的骨牌階梯；可中空，不要求實心。</td></tr>
          <tr><th>鑽石陣</th><td>排出完整、填滿的 10 × 10 菱形骨牌陣。</td></tr>
          <tr><th>最終效果</th><td>小車通過兩門、碰倒指定起始骨牌；連鎖反應需依序完成 S 路徑、8 層階梯與整個鑽石陣。</td></tr>
        </tbody>
      </table>
      <h4>材料使用限制</h4>
      <ul>
        <li>門與柱子：只能使用積木，不可用骨牌支撐或混搭。</li>
        <li>骨牌：只能用於連鎖反應，不可拿來建門或柱子。</li>
        <li>積木尺寸可以混用於同一座門或同一根柱子。</li>
        <li>鑽石陣為「填滿」要求；不得以空心輪廓替代。</li>
      </ul>
      <h4>客戶互動</h4>
      <ul>
        <li>整場最多 <b>{MAX_CLARIFICATIONS} 次</b>正式需求釐清，由小組自行形成問題，直接向客戶（教師）口頭詢問。</li>
        <li>測試小車須主動向客戶取得授權；授權碼由客戶輸入在右側面板。</li>
      </ul>
      <h4>演練與驗收</h4>
      <ul>
        <li>全程演練次數不限，但被觸發的骨牌會倒下，須由小組逐一扶正。</li>
        <li>正式驗收僅 1 次，送驗後立即鎖定施工板。</li>
      </ul>
    </div>
  );
}

function Shop() {
  const game = useStore((s) => s.game)!;
  const purchase = useStore((s) => s.purchase);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState(false);

  const cart: CartItem[] = useMemo(() => {
    const out: CartItem[] = [];
    for (const k of PIECE_ORDER) {
      for (const pkg of ['single', 'ten-pack'] as PackageKind[]) {
        const q = qty[`${k}:${pkg}`] ?? 0;
        if (q > 0) out.push({ kind: k, package: pkg, quantity: q });
      }
    }
    return out;
  }, [qty]);
  const nextOrderNo = game.orders.length + 1;
  const order = buildOrder(cart, nextOrderNo, new Date().toISOString());
  const over = order.total > game.budget;

  const set = (k: PieceKind, pkg: PackageKind, v: number) => {
    setConfirming(false);
    setQty((q) => ({ ...q, [`${k}:${pkg}`]: Math.max(0, Math.min(99, Math.floor(v || 0))) }));
  };

  return (
    <div className="shop">
      <h3>商店</h3>
      <p className="muted">第 {nextOrderNo} 張訂單{nextOrderNo > FREE_ORDERS ? `：將加收 ${EMERGENCY_FEE} 點緊急採購／行政費` : `（前 ${FREE_ORDERS} 次不加費）`}。付款後不可退款。</p>
      <table className="tbl shop-tbl">
        <thead>
          <tr><th>材料</th><th>單買</th><th>數量</th><th>10 入</th><th>數量</th></tr>
        </thead>
        <tbody>
          {PIECE_ORDER.map((k) => (
            <tr key={k}>
              <td><span className="swatch" style={{ background: PIECES[k].color }} />{PIECES[k].label}</td>
              <td className="num">{PIECES[k].single}</td>
              <td><QtyInput value={qty[`${k}:single`] ?? 0} onChange={(v) => set(k, 'single', v)} /></td>
              <td className="num">{PIECES[k].tenPack}</td>
              <td><QtyInput value={qty[`${k}:ten-pack`] ?? 0} onChange={(v) => set(k, 'ten-pack', v)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cart">
        <div className="row"><span>材料小計</span><b>{order.total - order.emergencyFee} 點</b></div>
        <div className="row"><span>行政費</span><b>{order.emergencyFee} 點</b></div>
        <div className="row total"><span>訂單總額</span><b className={over ? 'danger' : ''}>{order.total} 點</b></div>
        <div className="row"><span>下單後剩餘預算</span><b className={over ? 'danger' : ''}>{game.budget - order.total} 點</b></div>
        {over && <p className="danger">預算不足，無法下單。</p>}
        {!confirming ? (
          <button className="btn btn-yellow" disabled={!cart.length || over} onClick={() => setConfirming(true)}>送出訂單…</button>
        ) : (
          <div className="confirm-inline">
            <p>確認付款 <b>{order.total} 點</b>？付款後不可退款，未使用的材料成本仍計入紀錄。</p>
            <div className="btn-row">
              <button className="btn btn-yellow" onClick={() => { if (purchase(cart)) { setQty({}); } setConfirming(false); }}>確認付款</button>
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QtyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="qty">
      <button type="button" onClick={() => onChange(value - 1)} aria-label="減少">−</button>
      <input type="number" min={0} max={99} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="數量" />
      <button type="button" onClick={() => onChange(value + 1)} aria-label="增加">+</button>
    </div>
  );
}

function Inventory() {
  const game = useStore((s) => s.game)!;
  const material = useStore((s) => s.material);
  const tool = useStore((s) => s.tool);
  const pickMaterial = useStore((s) => s.pickMaterial);
  const onBoard = useMemo(() => {
    const m = {} as Record<PieceKind, number>;
    for (const k of PIECE_ORDER) m[k] = 0;
    for (const p of game.board) m[p.kind]++;
    return m;
  }, [game.board]);
  return (
    <div className="inventory">
      <h3>現有庫存</h3>
      <p className="muted">點選材料後，在工地上點選位置放置（或直接放在積木上方堆疊）。按 <kbd>R</kbd> 旋轉，<kbd>Esc</kbd> 取消。</p>
      <div className="inv-grid">
        {PIECE_ORDER.map((k) => {
          const n = game.inventory[k];
          const active = tool === 'place' && material === k;
          return (
            <button
              key={k}
              className={`inv-item ${active ? 'active' : ''} ${n === 0 ? 'empty' : ''}`}
              disabled={n === 0}
              onClick={() => pickMaterial(active ? null : k)}
              title={`${PIECES[k].label}：庫存 ${n}，板上 ${onBoard[k]}`}
            >
              <span className="swatch lg" style={{ background: PIECES[k].color }} />
              <span className="inv-label">{PIECES[k].label}</span>
              <span className="inv-count">{n}</span>
              <span className="inv-sub">板上 {onBoard[k]}</span>
            </button>
          );
        })}
      </div>
      {game.carUnlocked && (
        <div className="car-box">
          <h4>測試小車（已授權）</h4>
          {game.carOnBoard ? (
            <button className="btn btn-ghost" onClick={() => useStore.getState().removeCar()}>移開小車</button>
          ) : (
            <button className={`btn btn-ghost ${tool === 'place' && material === 'car' ? 'active' : ''}`} onClick={() => pickMaterial(material === 'car' ? null : 'car')}>
              放置小車到工地（目測尺寸）
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Tools() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const clearRuler = useStore((s) => s.clearRuler);
  const pts = useStore((s) => s.rulerPoints);
  return (
    <div className="tools">
      <h3>尺規與高度量尺</h3>
      <p className="muted">任務書的長度以 cm 表述。用尺規在工地上點兩個位置，顯示兩點距離與該處高度。</p>
      <div className="btn-row">
        <button className={`btn btn-yellow ${tool === 'ruler' ? 'active' : ''}`} onClick={() => setTool(tool === 'ruler' ? 'select' : 'ruler')}>
          {tool === 'ruler' ? '結束量測' : '使用尺規'}
        </button>
        <button className="btn btn-ghost" disabled={!pts.length} onClick={clearRuler}>清除量測</button>
      </div>
      <h4>鏡頭操作</h4>
      <ul>
        <li>滑鼠左鍵拖曳：旋轉視角</li>
        <li>滾輪：縮放</li>
        <li>右鍵拖曳：平移</li>
        <li>鏡頭操作不會改變施工資料。</li>
      </ul>
      <h4>材料操作</h4>
      <ul>
        <li>點選庫存材料 → 在工地上點選位置放置；放在積木上即為堆疊。</li>
        <li>點選板上物件可選取；拖曳可移動。</li>
        <li><kbd>R</kbd> 旋轉 90°、<kbd>Delete</kbd> 收回材料、<kbd>Esc</kbd> 取消。</li>
        <li>骨牌的橘色箭頭表示倒下方向。</li>
      </ul>
    </div>
  );
}

function Orders() {
  const game = useStore((s) => s.game)!;
  if (!game.orders.length) return <div><h3>採購紀錄</h3><p className="muted">尚無採購。</p></div>;
  return (
    <div className="orders">
      <h3>採購紀錄</h3>
      {game.orders.map((o) => (
        <div key={o.orderNo} className="order">
          <div className="order-head">
            <b>第 {o.orderNo} 次採購</b>
            <span>{fmtClock(o.at)}</span>
            <span className="order-total">{o.total} 點</span>
          </div>
          <table className="tbl small">
            <tbody>
              {o.lines.map((l, i) => (
                <tr key={i}>
                  <td>{PIECES[l.kind].label}</td>
                  <td>{l.package === 'single' ? '單買' : '10 入'} × {l.quantity}</td>
                  <td className="num">{l.subtotal}</td>
                </tr>
              ))}
              {o.emergencyFee > 0 && <tr><td colSpan={2}>緊急採購／行政費</td><td className="num">{o.emergencyFee}</td></tr>}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
