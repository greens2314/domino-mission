import { useEffect } from 'react';
import Scene, { snapshotRef } from './components/Scene';
import StartScreen from './components/StartScreen';
import TopBar from './components/TopBar';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import ActivityLog from './components/ActivityLog';
import Modals from './components/Modals';
import ResultScreen from './components/ResultScreen';
import { isRunning, remainingMs, useStore } from './store';

export default function App() {
  const game = useStore((s) => s.game);
  const playback = useStore((s) => s.playback);
  const tick = useStore((s) => s.tick);
  const expire = useStore((s) => s.expire);

  useEffect(() => {
    const id = setInterval(() => {
      tick();
      const g = useStore.getState().game;
      if (isRunning(g) && remainingMs(g) <= 0 && !useStore.getState().playback) {
        let snap: string | undefined;
        try { snap = snapshotRef.capture?.() ?? undefined; } catch { snap = undefined; }
        expire(snap);
      }
    }, 500);
    return () => clearInterval(id);
  }, [tick, expire]);

  // The 3D canvas stays mounted for the whole session; start/result screens overlay it.
  const finished = !!game && game.acceptance !== 'not-submitted' && !playback;
  return (
    <>
      <div className="app" aria-hidden={!game || finished}>
        {game && <TopBar />}
        {game && <LeftPanel />}
        <main className="stage">
          <Scene />
          {playback && (
            <div className="stage-banner">{playback.mode === 'acceptance' ? '正式驗收進行中…' : '全程演練進行中…'}</div>
          )}
        </main>
        {game && <RightPanel />}
        {game && <ActivityLog />}
        {game && <Modals />}
      </div>
      {!game && <StartScreen />}
      {finished && <ResultScreen />}
    </>
  );
}
