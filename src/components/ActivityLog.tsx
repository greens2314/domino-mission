import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { fmtClock } from './TopBar';

export default function ActivityLog() {
  const log = useStore((s) => s.game?.log ?? []);
  const message = useStore((s) => s.message);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(id);
  }, [message]);
  const recent = log.slice(-3).reverse();
  return (
    <footer className="activity">
      <div className="activity-log">
        {recent.map((e, i) => (
          <span key={e.at + i} className={i === 0 ? 'latest' : ''}>
            <time>{fmtClock(e.at)}</time> {e.text}
          </span>
        ))}
      </div>
      {message && visible && <div className="toast" role="status">{message.text}</div>}
    </footer>
  );
}
