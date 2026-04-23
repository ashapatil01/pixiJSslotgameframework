/**
 * Shared types for the slot framework.
 */

export type SymbolId = string;

export interface SymbolDef {
  readonly id: SymbolId;
  readonly label: string;
  /** Hex color string. */
  readonly color: string;
  /** Payout per symbol when part of a winning line. */
  readonly payout: number;
  readonly isScatter: boolean;
}

export interface ReelsConfig {
  readonly count: number;
  readonly rows: number;
  readonly symbolSize: number;
  readonly gap: number;
  readonly spinDurationMs: number;
  readonly stopStaggerMs: number;
  readonly decelerationMs: number;
  /** Length of the virtual strip per reel (recycled, not recreated). */
  readonly stripLength: number;
}

export interface StageConfig {
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string;
}

export interface BetConfig {
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly betArray: number[];
}

export interface BalanceConfig {
  readonly initial: number;
}

export interface FreeSpinsConfig {
  readonly scatterTriggerCount: number;
  readonly awardedSpins: number;
  readonly multiplier: number;
}

/** A payline is an array of row indices, one per reel. */
export type PayLine = readonly number[];

export interface GameConfig {
  readonly stage: StageConfig;
  readonly reels: ReelsConfig;
  readonly symbols: readonly SymbolDef[];
  readonly payLines: readonly PayLine[];
  readonly bet: BetConfig;
  readonly balance: BalanceConfig;
  readonly freeSpins: FreeSpinsConfig;
}


/**
 * A finalized reel stop: the symbol ids visible in each row, top to bottom.
 * Length must equal `reels.rows`.
 */
export type ReelStop = readonly SymbolId[];

export interface WinLine {
  readonly lineIndex: number;
  readonly symbolId: SymbolId;
  /** How many matching symbols from the left. */
  readonly matchCount: number;
  readonly payout: number;
  /** (reelIndex, rowIndex) pairs of winning symbols. */
  readonly positions: ReadonlyArray<readonly [number, number]>;
}

export interface SpinResult {
  /** Per-reel visible symbols; outer length = reels.count, inner = reels.rows. */
  readonly stops: readonly ReelStop[];
  readonly wins: readonly WinLine[];
  readonly totalWin: number;
  readonly scatterCount: number;
  readonly awardedFreeSpins: number;
}


// State machine                                                  

export const GameState = {
  Idle: 'IDLE',
  Spinning: 'SPINNING',
  Result: 'RESULT',
  WinPresentation: 'WIN_PRESENTATION',
} as const;

export type GameStateValue = typeof GameState[keyof typeof GameState];


// Event bus contract 

export interface GameEventMap {
  /** User (or free-spin controller) requested a spin. */
  'spin:request': { bet: number };
  /** Reels have physically started moving. */
  'spin:started': { bet: number };
  /** Server result received. */
  'spin:result': { result: SpinResult };
  /** All reels have finished snapping to their stops. */
  'reels:stopped': { result: SpinResult };
  /** Win presentation finished (always fires, even for zero-win). */
  'win:done': { totalWin: number };
  /** Free spins awarded (scatter trigger). */
  'freespins:awarded': { count: number; multiplier: number };
  /** A single free spin was consumed. */
  'freespins:consumed': { remaining: number };
  /** Free spins session ended. */
  'freespins:ended': Record<string, never>;
  /** HUD refresh hint (balance/bet/win changed). */
  'hud:update': { balance: number; bet: number; lastWin: number; freeSpinsLeft: number };
  /** State machine entered a new state. */
  'state:changed': { from: GameStateValue; to: GameStateValue };
}

export type GameEventName = keyof GameEventMap;
