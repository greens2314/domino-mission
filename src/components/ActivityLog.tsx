import { useEffect, useState } from 'react';
import { useStore } from '../store';

/** Floating notice for operation feedback (invalid placement, budget, etc.). No activity log is shown. */
export default function ActivityLog() {
  const message = useStore((s) => s.message);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(id);
  }, [message]);
  if (!message || !visible) return null;
  return <div className="toast toast-float" role="status">{message.text}</div>;
}
