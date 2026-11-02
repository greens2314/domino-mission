export type BrickKind =
  | 'brick-1x1' | 'brick-1x2' | 'brick-2x2'
  | 'brick-1x3' | 'brick-2x3' | 'brick-1x4'
  | 'brick-2x4' | 'brick-1x6' | 'brick-1x8';

export type PieceKind = 'domino' | BrickKind;

/** degrees, counter-clockwise from +x; bricks use multiples of 90, dominoes multiples of 15 */
export type Rotation = number;

export type BoardPiece = {
  id: string;
  kind: PieceKind;
  x: number;
  y: number;
  z: number;
  rotation: Rotation;
  fallen?: boolean;
};

export type PackageKind = 'single' | 'ten-pack';

export type PurchaseLine = {
  kind: PieceKind;
  package: PackageKind;
  quantity: number;
  unitCost: number;
  subtotal: number;
};

export type PurchaseOrder = {
  orderNo: number;
  at: string;
  lines: PurchaseLine[];
  emergencyFee: number;
  total: number;
};

export type AcceptanceStatus = 'not-submitted' | 'success' | 'failed' | 'expired';

export type CarPlacement = { x: number; y: number } | null;

export type LogEntry = { at: string; text: string };

export type GameState = {
  teamName: string;
  startedAt: string;
  endedAt?: string;
  budget: number;
  orders: PurchaseOrder[];
  inventory: Record<PieceKind, number>;
  board: BoardPiece[];
  carUnlocked: boolean;
  carOnBoard: CarPlacement;
  rehearsals: number;
  acceptance: AcceptanceStatus;
  failureReason?: string;
  finalSnapshot?: string;
  /** the one formal acceptance has been used (students may restore the layout and keep working, but not re-submit) */
  acceptanceUsed?: boolean;
  /** outcome of the formal acceptance, kept so the result page can be reopened after restoring */
  acceptanceOutcome?: { ok: boolean; reason?: string; endedAt: string; snapshot?: string };
  /** standing layout at the moment of acceptance */
  preAcceptanceBoard?: BoardPiece[];
  /** checklist from the most recent rehearsal */
  lastRehearsal?: { at: string; items: { label: string; ok: boolean; detail: string }[] };
  acceptanceRuns?: number;
  log: LogEntry[];
};

/** A cell occupied in 3D grid space. */
export type Cell = { x: number; y: number; z: number };

export type FallEvent = { id: string; t: number };

export type SimulationResult = {
  /** x position (in cells, may be fractional) where the car stops. */
  carStopX: number;
  /** true when a brick in the lane stopped the car before hitting any domino */
  blocked: boolean;
  /** id of the first domino hit by the car, if any */
  startDominoId?: string;
  /** dominoes toppled, in order with discrete time steps */
  falls: FallEvent[];
};
