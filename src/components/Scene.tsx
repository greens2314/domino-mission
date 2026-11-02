import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Grid, Edges } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  BOARD_D, BOARD_W, CAR_HEIGHT, CAR_LENGTH, CAR_WIDTH, DOMINO_HEIGHT, LANE_Y0, LANE_Y1, PIECES, dominoDir, footprint, isBrick,
} from '../game/catalog';
import { checkPlacement, footprintCells, buildOccupancy, key2 } from '../game/board';
import type { BoardPiece, Rotation } from '../game/types';
import { playbackState, useStore, type Material } from '../store';
import { registerThree } from '../snapshot';

/* ------------------------------------------------------------------ */
/* Snapshot bridge: registers renderer handles for src/snapshot.ts.     */
/* ------------------------------------------------------------------ */
function SnapshotBridge() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => { registerThree({ gl, scene, camera }); }, [gl, scene, camera]);
  return null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Grid origin for a footprint so the hovered cell sits near its centre. */
export function originFor(material: Material, rotation: Rotation, hx: number, hy: number) {
  if (material === 'car') return { x: hx - Math.floor(CAR_LENGTH / 2), y: hy - Math.floor(CAR_WIDTH / 2) };
  const { w, d } = footprint(material, rotation);
  return { x: hx - Math.floor((w - 1) / 2), y: hy - Math.floor((d - 1) / 2) };
}

function cellFromPoint(p: THREE.Vector3) {
  return { x: Math.floor(p.x), y: Math.floor(p.z) };
}

/** Text rendered to a canvas texture on a sprite (avoids DOM overlays inside the canvas). */
function TextSprite({ text, position, bg = 'rgba(23,42,70,0.9)', fg = '#f4ecd8', scale = 1 }: { text: string; position: [number, number, number]; bg?: string; fg?: string; scale?: number }) {
  const { texture, aspect } = useMemo(() => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const font = 'bold 40px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 48, h = 72;
    c.width = w; c.height = h;
    ctx.font = font; ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, 16); ctx.fill();
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, 24, h / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { texture: t, aspect: w / h };
  }, [text, bg, fg]);
  return (
    <sprite position={position} scale={[1.6 * aspect * scale, 1.6 * scale, 1]} raycast={() => null}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

const EMPTY_BOARD: BoardPiece[] = [];
const WOOD = '#8b5a2b';
const BOARD = '#efe4c8';
const LANE = '#e4d2a6';

/* ------------------------------------------------------------------ */
/* Static scenery                                                       */
/* ------------------------------------------------------------------ */

function Table() {
  return (
    <group>
      <mesh position={[BOARD_W / 2, -0.6, BOARD_D / 2]} receiveShadow>
        <boxGeometry args={[BOARD_W + 16, 1, BOARD_D + 12]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {/* construction board */}
      <mesh position={[BOARD_W / 2, -0.05, BOARD_D / 2]} receiveShadow>
        <boxGeometry args={[BOARD_W, 0.1, BOARD_D]} />
        <meshStandardMaterial color={BOARD} roughness={0.95} />
      </mesh>
      {/* lane */}
      <mesh position={[BOARD_W / 2, 0.005, (LANE_Y0 + LANE_Y1 + 1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOARD_W, LANE_Y1 - LANE_Y0 + 1]} />
        <meshStandardMaterial color={LANE} roughness={1} />
      </mesh>
      {/* start pad */}
      <mesh position={[-CAR_LENGTH / 2 - 0.5, -0.02, (LANE_Y0 + LANE_Y1 + 1) / 2]}>
        <boxGeometry args={[CAR_LENGTH + 1, 0.12, CAR_WIDTH + 1]} />
        <meshStandardMaterial color="#3a4f6b" roughness={0.9} />
      </mesh>
      <TextSprite text="起點" position={[-CAR_LENGTH / 2 - 0.5, 1.4, (LANE_Y0 + LANE_Y1 + 1) / 2]} />
      {/* direction arrows along the lane */}
      {[8, 20, 32, 44].map((x) => (
        <mesh key={x} position={[x, 0.012, (LANE_Y0 + LANE_Y1 + 1) / 2]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.45, 1.2, 3]} />
          <meshBasicMaterial color="#c9b17c" transparent opacity={0.8} />
        </mesh>
      ))}
      <Grid
        position={[BOARD_W / 2, 0.012, BOARD_D / 2]}
        args={[BOARD_W, BOARD_D]}
        cellSize={1}
        cellThickness={1}
        cellColor="#b9a775"
        sectionSize={4}
        sectionThickness={1.2}
        sectionColor="#a89360"
        fadeDistance={400}
        infiniteGrid={false}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                               */
/* ------------------------------------------------------------------ */

type PieceProps = {
  piece: BoardPiece;
  selected: boolean;
  visuallyFallen: boolean;
  dimmed: boolean;
  onDown: (e: ThreeEvent<PointerEvent>, id: string) => void;
  onMove: (e: ThreeEvent<PointerEvent>) => void;
};

function Brick({ piece, selected, dimmed, onDown, onMove }: PieceProps) {
  const spec = PIECES[piece.kind];
  const { w, d } = footprint(piece.kind, piece.rotation);
  const color = spec.color;
  const studs = useMemo(() => footprintCells(piece.kind, 0, 0, piece.rotation), [piece.kind, piece.rotation]);
  return (
    <group position={[piece.x + w / 2, piece.z + 0.5, piece.y + d / 2]}>
      <RoundedBox
        args={[w - 0.06, 0.96, d - 0.06]}
        radius={0.08}
        smoothness={2}
        castShadow
        receiveShadow
        onPointerDown={(e) => onDown(e, piece.id)}
        onPointerMove={onMove}
      >
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} transparent={dimmed} opacity={dimmed ? 0.55 : 1} />
        {selected && <Edges color="#ffffff" scale={1.02} />}
      </RoundedBox>
      {studs.map((c, i) => (
        <mesh key={i} position={[c.x - w / 2 + 0.5, 0.56, c.y - d / 2 + 0.5]} raycast={() => null}>
          <cylinderGeometry args={[0.24, 0.24, 0.16, 12]} />
          <meshStandardMaterial color={color} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

function Domino({ piece, selected, visuallyFallen, dimmed, onDown, onMove }: PieceProps) {
  const { dx, dy } = dominoDir(piece.rotation);
  const thickness = 0.36, width = 0.82;
  const yaw = piece.rotation === 0 || piece.rotation === 180 ? 0 : Math.PI / 2;
  // the group's pivot is the bottom-front edge; falling rotates around it.
  const sign = dx !== 0 ? dx : dy;
  const fallAngle = visuallyFallen ? sign * (Math.PI / 2 - 0.06) : 0;
  const color = piece.fallen && !visuallyFallen ? '#f2f0e6' : '#f7f3e8';
  return (
    <group position={[piece.x + 0.5, piece.z, piece.y + 0.5]}>
      <group rotation={[dy !== 0 ? fallAngle : 0, 0, dx !== 0 ? -fallAngle : 0]}>
        <group rotation={[0, yaw, 0]}>
          <mesh
            position={[0, DOMINO_HEIGHT / 2, 0]}
            castShadow
            onPointerDown={(e) => onDown(e, piece.id)}
            onPointerMove={onMove}
          >
            <boxGeometry args={[thickness, DOMINO_HEIGHT, width]} />
            <meshStandardMaterial color={color} roughness={0.4} transparent={dimmed} opacity={dimmed ? 0.55 : 1} />
            {selected && <Edges color="#ff8c42" scale={1.04} />}
          </mesh>
          {/* pips */}
          {[0.5, 1.5].map((h, i) => (
            <mesh key={i} position={[thickness / 2 + 0.005, h, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
              <circleGeometry args={[0.14, 10]} />
              <meshBasicMaterial color="#1f2a44" />
            </mesh>
          ))}
          <mesh position={[thickness / 2 + 0.005, DOMINO_HEIGHT / 2, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
            <planeGeometry args={[width * 0.8, 0.04]} />
            <meshBasicMaterial color="#1f2a44" />
          </mesh>
        </group>
      </group>
      {selected && !visuallyFallen && (
        <mesh position={[dx * 0.9, 0.25, dy * 0.9]} rotation={[0, -Math.atan2(dy, dx), 0]} raycast={() => null}>
          <coneGeometry args={[0.3, 0.9, 4]} />
          <meshBasicMaterial color="#ff5a1f" />
        </mesh>
      )}
    </group>
  );
}

function Car({ x, y, ghost = false }: { x: number; y: number; ghost?: boolean }) {
  const mat = ghost ? { transparent: true, opacity: 0.45 } : {};
  return (
    <group position={[x + CAR_LENGTH / 2, 0, y + CAR_WIDTH / 2]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[CAR_LENGTH - 0.3, 1.0, CAR_WIDTH - 0.4]} />
        <meshStandardMaterial color="#1d6fd6" roughness={0.4} {...mat} />
      </mesh>
      <mesh position={[-0.3, 1.65, 0]} castShadow>
        <boxGeometry args={[CAR_LENGTH * 0.45, 0.7, CAR_WIDTH - 0.9]} />
        <meshStandardMaterial color="#f4b400" roughness={0.4} {...mat} />
      </mesh>
      {[[-1.2, -1.1], [1.2, -1.1], [-1.2, 1.1], [1.2, 1.1]].map(([ox, oz], i) => (
        <mesh key={i} position={[ox, 0.42, oz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.4, 14]} />
          <meshStandardMaterial color="#222" roughness={0.9} {...mat} />
        </mesh>
      ))}
      <mesh position={[CAR_LENGTH / 2 - 0.1, 0.9, 0]} raycast={() => null}>
        <boxGeometry args={[0.1, 0.4, 1.4]} />
        <meshBasicMaterial color="#fff6c0" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Ghost preview                                                        */
/* ------------------------------------------------------------------ */

function Ghost() {
  const { game, tool, material, rotation, hover, movingId } = useStore();
  if (!game || !hover) return null;
  if (movingId) {
    const p = game.board.find((b) => b.id === movingId);
    if (!p) return null;
    const o = originFor(p.kind, rotation, hover.x, hover.y);
    const r = checkPlacement(game.board, p.kind, o.x, o.y, rotation, p.id);
    return <FootprintBox kind={p.kind} rotation={rotation} x={o.x} y={o.y} z={r.ok ? r.z : 0} ok={r.ok} />;
  }
  if (tool !== 'place' || !material) return null;
  const o = originFor(material, rotation, hover.x, hover.y);
  if (material === 'car') return <Car x={o.x} y={o.y} ghost />;
  const r = checkPlacement(game.board, material, o.x, o.y, rotation);
  return <FootprintBox kind={material} rotation={rotation} x={o.x} y={o.y} z={r.ok ? r.z : 0} ok={r.ok} />;
}

function FootprintBox({ kind, rotation, x, y, z, ok }: { kind: BoardPiece['kind']; rotation: Rotation; x: number; y: number; z: number; ok: boolean }) {
  const { w, d } = footprint(kind, rotation);
  const h = isBrick(kind) ? 1 : DOMINO_HEIGHT;
  const { dx, dy } = dominoDir(rotation);
  return (
    <group position={[x + w / 2, z + h / 2, y + d / 2]}>
      <mesh raycast={() => null}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={ok ? '#2ecc71' : '#e63946'} transparent opacity={0.45} />
      </mesh>
      {kind === 'domino' && (
        <mesh position={[dx * 0.9, -h / 2 + 0.2, dy * 0.9]} rotation={[0, -Math.atan2(dy, dx), 0]} raycast={() => null}>
          <coneGeometry args={[0.3, 0.9, 4]} />
          <meshBasicMaterial color="#ff5a1f" />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Ruler                                                                */
/* ------------------------------------------------------------------ */

function Ruler() {
  const pts = useStore((s) => s.rulerPoints);
  const board = useStore((s) => s.game?.board) ?? EMPTY_BOARD;
  const occ = useMemo(() => buildOccupancy(board), [board]);
  if (!pts.length) return null;
  const [a, b] = pts;
  const ha = occ.top.get(key2(a.x, a.y)) ?? 0;
  const pa = new THREE.Vector3(a.x + 0.5, ha + 0.1, a.y + 0.5);
  let line: THREE.Vector3[] = [pa];
  let label = `高度 ${ha} cm`;
  if (b) {
    const hb = occ.top.get(key2(b.x, b.y)) ?? 0;
    const pb = new THREE.Vector3(b.x + 0.5, hb + 0.1, b.y + 0.5);
    line = [pa, pb];
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    const dist = Math.hypot(dx, dy);
    label = `距離 ${dist % 1 === 0 ? dist : dist.toFixed(1)} cm（橫 ${dx}，縱 ${dy}）；高度 ${ha} → ${hb} cm`;
  }
  const mid = line.length === 2 ? line[0].clone().add(line[1]).multiplyScalar(0.5) : pa;
  return (
    <group>
      {line.map((p, i) => (
        <mesh key={i} position={p.toArray()} raycast={() => null}>
          <sphereGeometry args={[0.28, 12, 12]} />
          <meshBasicMaterial color="#ff5a1f" />
        </mesh>
      ))}
      {line.length === 2 && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[new Float32Array([...line[0].toArray(), ...line[1].toArray()]), 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#ff5a1f" linewidth={2} />
        </line>
      )}
      <TextSprite text={label} position={[mid.x, mid.y + 2.2, mid.z]} bg="#ff5a1f" fg="#ffffff" scale={0.9} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Playback driver (car + falls)                                        */
/* ------------------------------------------------------------------ */

function PlaybackDriver({ onFrame }: { onFrame: (carFront: number | null, fallen: Set<string> | null) => void }) {
  const playback = useStore((s) => s.playback);
  const finish = useStore((s) => s.finishPlayback);
  const lastCount = useRef(-1);
  const lastFront = useRef<number | null>(null);
  const finishing = useRef(false);
  useFrame(() => {
    if (!playback) {
      if (lastFront.current !== null) { lastFront.current = null; lastCount.current = -1; onFrame(null, null); }
      return;
    }
    const st = playbackState(playback, performance.now())!;
    const frontRounded = Math.round(st.carFront * 20) / 20;
    if (frontRounded !== lastFront.current || st.fallenNow.size !== lastCount.current) {
      lastFront.current = frontRounded;
      lastCount.current = st.fallenNow.size;
      onFrame(st.carFront, st.fallenNow);
    }
    if (st.done && !finishing.current) { finishing.current = true; setTimeout(() => { finish(); finishing.current = false; }, 0); }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* World                                                                */
/* ------------------------------------------------------------------ */

function World() {
  const game = useStore((s) => s.game);
  const tool = useStore((s) => s.tool);
  const material = useStore((s) => s.material);
  const movingId = useStore((s) => s.movingId);
  const selectedId = useStore((s) => s.selectedId);
  const playback = useStore((s) => s.playback);
  const { setHover, placeAt, selectPiece, beginMove, cancelMove, addRulerPoint, rotateGhost } = useStore.getState();
  const [carFront, setCarFront] = useState<number | null>(null);
  const [fallenNow, setFallenNow] = useState<Set<string> | null>(null);
  const dragging = useRef<{ id: string; startCell: string; moved: boolean } | null>(null);
  const controls = useRef<any>(null);

  const locked = !game || game.acceptance !== 'not-submitted' || !!playback;

  const onPlaneMove = (e: ThreeEvent<PointerEvent>) => {
    const c = cellFromPoint(e.point);
    setHover(c);
    if (dragging.current && !dragging.current.moved && key2(c.x, c.y) !== dragging.current.startCell) {
      dragging.current.moved = true;
      beginMove(dragging.current.id);
    }
  };

  const onPlaneClick = (e: ThreeEvent<MouseEvent>) => {
    if (locked) return;
    if (e.delta > 4) return; // it was a camera drag
    const c = cellFromPoint(e.point);
    if (tool === 'ruler') { addRulerPoint(c); return; }
    if (movingId) { const o = originFor(useStore.getState().game!.board.find((b) => b.id === movingId)!.kind, useStore.getState().rotation, c.x, c.y); placeAt(o.x, o.y); return; }
    if (tool === 'place' && material) { const o = originFor(material, useStore.getState().rotation, c.x, c.y); placeAt(o.x, o.y); return; }
    selectPiece(null);
  };

  const onPieceDown = (e: ThreeEvent<PointerEvent>, id: string) => {
    if (locked || e.button !== 0) return;
    e.stopPropagation();
    if (tool === 'ruler') { addRulerPoint(cellFromPoint(e.point)); return; }
    if (tool === 'place' && material) {
      // placing on top of an existing piece: treat like a plane click at that cell
      const c = cellFromPoint(e.point);
      const o = originFor(material, useStore.getState().rotation, c.x, c.y);
      placeAt(o.x, o.y);
      return;
    }
    if (movingId) {
      const c = cellFromPoint(e.point);
      const p = useStore.getState().game!.board.find((b) => b.id === movingId)!;
      const o = originFor(p.kind, useStore.getState().rotation, c.x, c.y);
      placeAt(o.x, o.y);
      return;
    }
    selectPiece(id);
    const c = cellFromPoint(e.point);
    dragging.current = { id, startCell: key2(c.x, c.y), moved: false };
    if (controls.current) controls.current.enabled = false;
  };

  const onPieceMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onPlaneMove(e);
  };

  useEffect(() => {
    const up = () => {
      const d = dragging.current;
      dragging.current = null;
      if (controls.current) controls.current.enabled = true;
      if (!d) return;
      const s = useStore.getState();
      if (d.moved && s.movingId === d.id) {
        const h = s.hover;
        const p = s.game?.board.find((b) => b.id === d.id);
        if (h && p) {
          const o = originFor(p.kind, s.rotation, h.x, h.y);
          placeAt(o.x, o.y);
          if (useStore.getState().movingId === d.id) cancelMove();
        } else cancelMove();
      }
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [placeAt, cancelMove]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const s = useStore.getState();
      if (e.key === 'r' || e.key === 'R') {
        if (s.movingId || (s.tool === 'place' && s.material)) rotateGhost();
        else if (s.selectedId) s.rotateSelected();
      }
      if (e.key === 'Escape') { if (s.movingId) cancelMove(); else { s.pickMaterial(null); s.selectPiece(null); s.clearRuler(); } }
      if (e.key === 'Delete' && s.selectedId && !s.movingId) s.openModal({ kind: 'remove', pieceId: s.selectedId });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rotateGhost, cancelMove]);

  const board = game?.board ?? [];
  const carPos = game?.carOnBoard ?? null;

  return (
    <>
      <PlaybackDriver onFrame={(f, s) => { setCarFront(f); setFallenNow(s); }} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[30, 50, 20]} intensity={1.4} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-40, 40, 40, -40, 1, 150]} />
      </directionalLight>
      <hemisphereLight args={['#dfe9ff', '#5a3d1e', 0.5]} />

      <Table />

      {/* interaction plane */}
      <mesh
        position={[BOARD_W / 2, 0, BOARD_D / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={onPlaneMove}
        onClick={onPlaneClick}
        onPointerLeave={() => setHover(null)}
        visible={false}
      >
        <planeGeometry args={[BOARD_W + 40, BOARD_D + 40]} />
      </mesh>

      {board.map((p) => {
        const visuallyFallen = !!p.fallen && (!playback || !fallenNow || fallenNow.has(p.id));
        const props = {
          piece: p,
          selected: p.id === selectedId,
          visuallyFallen,
          dimmed: p.id === movingId,
          onDown: onPieceDown,
          onMove: onPieceMove,
        };
        return isBrick(p.kind) ? <Brick key={p.id} {...props} /> : <Domino key={p.id} {...props} />;
      })}

      {playback && carFront !== null && game?.carUnlocked && (
        <Car x={carFront - CAR_LENGTH} y={LANE_Y0} />
      )}
      {!playback && carPos && <Car x={carPos.x} y={carPos.y} />}

      {!locked && <Ghost />}
      <Ruler />

      <OrbitControls
        ref={controls}
        target={[BOARD_W / 2, 0, BOARD_D / 2]}
        maxPolarAngle={Math.PI / 2 - 0.08}
        minDistance={12}
        maxDistance={110}
        enablePan
        panSpeed={0.8}
        makeDefault
      />
      <SnapshotBridge />
    </>
  );
}

export default function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ position: [BOARD_W / 2, 30, BOARD_D / 2 + 36], fov: 40, near: 0.5, far: 400 }}
      onCreated={(state) => registerThree({ gl: state.gl, scene: state.scene, camera: state.camera })}
      onPointerMissed={() => { /* handled by plane */ }}
    >
      <color attach="background" args={['#172a46']} />
      <World />
    </Canvas>
  );
}

export { CAR_HEIGHT };
