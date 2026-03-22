export type Mode = 'base' | 'train' | 'duel' | 'dead';
export type SymbolCode =
  | 'L1'
  | 'L2'
  | 'L3'
  | 'L4'
  | 'L5'
  | 'P1'
  | 'P2'
  | 'P3'
  | 'P4'
  | 'P5'
  | 'WILD'
  | 'VS'
  | 'SC_TRAIN'
  | 'SC_DUEL'
  | 'SC_DEAD'
  | 'DMH_MULT'
  | 'BLANK';

export interface SpinInput {
  mode: Mode;
  totalBet: number;
  seed: string;
  nonce: number;
  state?: Record<string, unknown>;
}

export interface LineWin {
  line: number;
  symbol: Exclude<SymbolCode, 'VS' | 'SC_TRAIN' | 'SC_DUEL' | 'SC_DEAD' | 'DMH_MULT' | 'BLANK'>;
  count: number;
  basePayoutX: number;
  vsMultiplierApplied: number;
  payoutX: number;
}

export interface SpinResult {
  mode: Mode;
  payoutMultiplier: number;
  totalWin: number;
  cappedByMaxWin: boolean;
  grid: SymbolCode[][];
  lineWins: LineWin[];
  events: Array<Record<string, unknown>>;
  nextState?: Record<string, unknown>;
}

type Position = { reel: number; row: number };

const MAX_WIN_X = 12_500;
const MODE_PAYOUT_SCALE: Record<Mode, number> = {
  base: 0.1185,
  train: 0.62,
  duel: 1.0,
  dead: 0.0063,
};
const VS_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 25, 50, 100] as const;
const VS_MULTIPLIER_WEIGHTS: Array<[number, number]> = [
  [2, 30],
  [3, 20],
  [4, 14],
  [5, 10],
  [6, 7],
  [7, 5],
  [8, 4],
  [9, 3],
  [10, 2],
  [20, 2],
  [25, 1],
  [50, 1],
  [100, 1],
];

const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4],
  [5, 5, 5, 5, 5],
  [1, 2, 3, 4, 5],
  [5, 4, 3, 2, 1],
  [1, 2, 1, 2, 1],
  [2, 1, 2, 1, 2],
  [2, 3, 2, 3, 2],
  [3, 2, 3, 2, 3],
  [3, 4, 3, 4, 3],
  [4, 3, 4, 3, 4],
  [5, 4, 5, 4, 5],
  [4, 5, 4, 5, 4],
];

const LINE_PAYTABLE: Record<string, Record<number, number>> = {
  P1: { 3: 1, 4: 5, 5: 10 },
  P2: { 3: 1, 4: 5, 5: 10 },
  P3: { 3: 2, 4: 10, 5: 20 },
  P4: { 3: 2, 4: 10, 5: 20 },
  P5: { 3: 4, 4: 20, 5: 40 },
  L1: { 3: 0.2, 4: 1, 5: 2 },
  L2: { 3: 0.2, 4: 1, 5: 2 },
  L3: { 3: 0.2, 4: 1, 5: 2 },
  L4: { 3: 0.2, 4: 1, 5: 2 },
  L5: { 3: 0.2, 4: 1, 5: 2 },
  WILD: { 5: 40 },
};

const PAYING_SYMBOLS = ['P1', 'P2', 'P3', 'P4', 'P5', 'L1', 'L2', 'L3', 'L4', 'L5', 'WILD'] as const;

const BASE_WEIGHTS: Array<[SymbolCode, number]> = [
  ['BLANK', 380],
  ['L5', 120],
  ['L4', 110],
  ['L3', 100],
  ['L2', 90],
  ['L1', 80],
  ['P5', 40],
  ['P4', 30],
  ['P3', 24],
  ['P2', 16],
  ['P1', 12],
  ['WILD', 20],
  ['VS', 3],
  ['SC_TRAIN', 8],
  ['SC_DUEL', 8],
  ['SC_DEAD', 8],
];

const TRAIN_WEIGHTS: Array<[SymbolCode, number]> = [
  ['BLANK', 360],
  ['L5', 135],
  ['L4', 123],
  ['L3', 112],
  ['L2', 100],
  ['L1', 90],
  ['P5', 50],
  ['P4', 40],
  ['P3', 30],
  ['P2', 22],
  ['P1', 14],
  ['WILD', 70],
];

const DUEL_WEIGHTS: Array<[SymbolCode, number]> = [
  ['BLANK', 280],
  ['L5', 130],
  ['L4', 120],
  ['L3', 110],
  ['L2', 100],
  ['L1', 90],
  ['P5', 45],
  ['P4', 35],
  ['P3', 28],
  ['P2', 20],
  ['P1', 14],
  ['WILD', 18],
  ['VS', 35],
];

interface TrainState {
  mode: 'train';
  spinsRemaining: number;
  stickyPositions: Position[];
  accumulatedPayoutX: number;
  cursor: number;
}

interface DuelState {
  mode: 'duel';
  spinsRemaining: number;
  accumulatedPayoutX: number;
  cursor: number;
}

interface DeadState {
  mode: 'dead';
  phase: 'collect' | 'showdown' | 'complete';
  collectSpinsRemaining: number;
  consecutiveDeadSpins: number;
  collectedWildCount: number;
  collectedMultiplier: number;
  showdownSpinsRemaining: number;
  accumulatedPayoutX: number;
  cursor: number;
}

function toNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function toString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function normalizeTrainState(state: Record<string, unknown> | undefined): TrainState {
  const s = state ?? {};
  const stickyRaw = Array.isArray(s.stickyPositions) ? s.stickyPositions : [];
  const stickyPositions = stickyRaw
    .filter((p): p is Position => typeof p === 'object' && p !== null)
    .map((p) => p as Position)
    .filter((p) => Number.isInteger(p.reel) && Number.isInteger(p.row) && p.reel >= 0 && p.reel < 5 && p.row >= 0 && p.row < 5);
  return {
    mode: 'train',
    spinsRemaining: Math.max(0, Math.floor(toNumber(s.spinsRemaining, 10))),
    stickyPositions,
    accumulatedPayoutX: Math.max(0, toNumber(s.accumulatedPayoutX, 0)),
    cursor: Math.max(0, Math.floor(toNumber(s.cursor, 0))),
  };
}

function normalizeDuelState(state: Record<string, unknown> | undefined): DuelState {
  const s = state ?? {};
  return {
    mode: 'duel',
    spinsRemaining: Math.max(0, Math.floor(toNumber(s.spinsRemaining, 10))),
    accumulatedPayoutX: Math.max(0, toNumber(s.accumulatedPayoutX, 0)),
    cursor: Math.max(0, Math.floor(toNumber(s.cursor, 0))),
  };
}

function normalizeDeadState(state: Record<string, unknown> | undefined): DeadState {
  const s = state ?? {};
  return {
    mode: 'dead',
    phase: toString(s.phase, 'collect') as DeadState['phase'],
    collectSpinsRemaining: Math.max(0, Math.floor(toNumber(s.collectSpinsRemaining, 3))),
    consecutiveDeadSpins: Math.max(0, Math.floor(toNumber(s.consecutiveDeadSpins, 0))),
    collectedWildCount: Math.max(0, Math.floor(toNumber(s.collectedWildCount, 0))),
    collectedMultiplier: Math.max(1, Math.floor(toNumber(s.collectedMultiplier, 1))),
    showdownSpinsRemaining: Math.max(0, Math.floor(toNumber(s.showdownSpinsRemaining, 3))),
    accumulatedPayoutX: Math.max(0, toNumber(s.accumulatedPayoutX, 0)),
    cursor: Math.max(0, Math.floor(toNumber(s.cursor, 0))),
  };
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed: string, nonce: number, cursor: number): () => number {
  const seedFn = xmur3(`${seed}:${nonce}:${cursor}`);
  return mulberry32(seedFn());
}

function weightedPick<T>(rng: () => number, entries: Array<[T, number]>): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function makeGrid(rng: () => number, weights: Array<[SymbolCode, number]>): SymbolCode[][] {
  const grid: SymbolCode[][] = [];
  for (let row = 0; row < 5; row++) {
    const rowVals: SymbolCode[] = [];
    for (let reel = 0; reel < 5; reel++) {
      rowVals.push(weightedPick(rng, weights));
    }
    grid.push(rowVals);
  }
  return grid;
}

function cloneGrid(grid: SymbolCode[][]): SymbolCode[][] {
  return grid.map((row) => [...row]);
}

function countSymbol(grid: SymbolCode[][], symbol: SymbolCode): number {
  let count = 0;
  for (const row of grid) for (const s of row) if (s === symbol) count++;
  return count;
}

function applyStickyWilds(grid: SymbolCode[][], positions: Position[]): SymbolCode[][] {
  const out = cloneGrid(grid);
  for (const pos of positions) out[pos.row][pos.reel] = 'WILD';
  return out;
}

function findVsReels(grid: SymbolCode[][]): number[] {
  const reels = new Set<number>();
  for (let row = 0; row < 5; row++) {
    for (let reel = 0; reel < 5; reel++) {
      if (grid[row][reel] === 'VS') reels.add(reel);
    }
  }
  return [...reels.values()].sort((a, b) => a - b);
}

function expandVsReels(
  grid: SymbolCode[][],
  rng: () => number,
): { grid: SymbolCode[][]; expanded: Record<number, number> } {
  const original = cloneGrid(grid);
  const vsReels = findVsReels(original);
  const expanded: Record<number, number> = {};
  let working = cloneGrid(original);

  for (const reel of vsReels) {
    const candidate = cloneGrid(working);
    for (let row = 0; row < 5; row++) candidate[row][reel] = 'WILD';
    const test = evaluateLines(candidate, {});
    if (test.totalPayoutX > 0) {
      working = candidate;
      expanded[reel] = weightedPick(rng, VS_MULTIPLIER_WEIGHTS);
    }
  }

  return { grid: working, expanded };
}

function lineSymbols(grid: SymbolCode[][], lineStops: number[]): SymbolCode[] {
  const symbols: SymbolCode[] = [];
  for (let reel = 0; reel < 5; reel++) {
    const row = lineStops[reel] - 1;
    symbols.push(grid[row][reel]);
  }
  return symbols;
}

function isSubstitutable(symbol: SymbolCode): boolean {
  return ['P1', 'P2', 'P3', 'P4', 'P5', 'L1', 'L2', 'L3', 'L4', 'L5'].includes(symbol);
}

function countMatch(symbols: SymbolCode[], target: SymbolCode): number {
  let count = 0;
  for (let i = 0; i < symbols.length; i++) {
    const s = symbols[i];
    const matches =
      s === target ||
      (s === 'WILD' && target !== 'WILD' && isSubstitutable(target));
    if (!matches) break;
    count++;
  }
  return count;
}

function evaluateLines(
  grid: SymbolCode[][],
  vsExpandedReels: Record<number, number>,
): { lineWins: LineWin[]; totalPayoutX: number } {
  const wins: LineWin[] = [];

  for (let i = 0; i < PAYLINES.length; i++) {
    const symbols = lineSymbols(grid, PAYLINES[i]);
    let best: LineWin | null = null;

    for (const target of PAYING_SYMBOLS) {
      const count = countMatch(symbols, target);
      const payoutTable = LINE_PAYTABLE[target];
      const basePayoutX = payoutTable?.[count] ?? 0;
      if (basePayoutX <= 0) continue;

      const contributingReels: number[] = [];
      for (let reel = 0; reel < count; reel++) {
        if (vsExpandedReels[reel]) contributingReels.push(reel);
      }
      const vsMultiplierApplied =
        contributingReels.length > 0
          ? contributingReels.reduce((sum, reel) => sum + vsExpandedReels[reel], 0)
          : 1;

      const payoutX = basePayoutX * vsMultiplierApplied;
      const win: LineWin = {
        line: i + 1,
        symbol: target,
        count,
        basePayoutX,
        vsMultiplierApplied,
        payoutX,
      };

      if (!best || win.payoutX > best.payoutX) best = win;
    }

    if (best) wins.push(best);
  }

  return {
    lineWins: wins,
    totalPayoutX: wins.reduce((sum, w) => sum + w.payoutX, 0),
  };
}

function capWin(totalPayoutX: number): { payoutMultiplier: number; cappedByMaxWin: boolean } {
  if (totalPayoutX > MAX_WIN_X) {
    return { payoutMultiplier: MAX_WIN_X, cappedByMaxWin: true };
  }
  return { payoutMultiplier: totalPayoutX, cappedByMaxWin: false };
}

function capSpinInRound(rawPayoutX: number, accumulatedPayoutX: number): {
  payoutMultiplier: number;
  newAccumulatedPayoutX: number;
  cappedByMaxWin: boolean;
} {
  const remaining = Math.max(0, MAX_WIN_X - accumulatedPayoutX);
  const payoutMultiplier = Math.min(rawPayoutX, remaining);
  const newAccumulatedPayoutX = accumulatedPayoutX + payoutMultiplier;
  return {
    payoutMultiplier,
    newAccumulatedPayoutX,
    cappedByMaxWin: rawPayoutX > payoutMultiplier || remaining <= 0,
  };
}

function startFeatureFromBase(grid: SymbolCode[][]): { mode?: Mode; state?: Record<string, unknown>; trigger?: string } {
  const train = countSymbol(grid, 'SC_TRAIN') >= 3;
  const duel = countSymbol(grid, 'SC_DUEL') >= 3;
  const dead = countSymbol(grid, 'SC_DEAD') >= 3;

  if (dead) {
    return {
      mode: 'dead',
      trigger: 'SC_DEAD',
      state: {
        mode: 'dead',
        phase: 'collect',
        collectSpinsRemaining: 3,
        consecutiveDeadSpins: 0,
        collectedWildCount: 0,
        collectedMultiplier: 1,
        showdownSpinsRemaining: 3,
        accumulatedPayoutX: 0,
        cursor: 0,
      },
    };
  }

  if (duel) {
    return {
      mode: 'duel',
      trigger: 'SC_DUEL',
      state: { mode: 'duel', spinsRemaining: 10, accumulatedPayoutX: 0, cursor: 0 },
    };
  }

  if (train) {
    return {
      mode: 'train',
      trigger: 'SC_TRAIN',
      state: { mode: 'train', spinsRemaining: 10, stickyPositions: [], accumulatedPayoutX: 0, cursor: 0 },
    };
  }

  return {};
}

function collectWildPositions(grid: SymbolCode[][]): Position[] {
  const out: Position[] = [];
  for (let row = 0; row < 5; row++) {
    for (let reel = 0; reel < 5; reel++) {
      if (grid[row][reel] === 'WILD') out.push({ row, reel });
    }
  }
  return out;
}

function uniquePositions(positions: Position[]): Position[] {
  const keySet = new Set<string>();
  const out: Position[] = [];
  for (const p of positions) {
    const k = `${p.reel}:${p.row}`;
    if (!keySet.has(k)) {
      keySet.add(k);
      out.push(p);
    }
  }
  return out;
}

function placeRandomWilds(grid: SymbolCode[][], rng: () => number, count: number): SymbolCode[][] {
  const out = cloneGrid(grid);
  const all: Position[] = [];
  for (let row = 0; row < 5; row++) for (let reel = 0; reel < 5; reel++) all.push({ row, reel });

  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = all[i];
    all[i] = all[j];
    all[j] = tmp;
  }

  const picks = all.slice(0, Math.min(25, Math.max(0, count)));
  for (const p of picks) out[p.row][p.reel] = 'WILD';
  return out;
}

function baseSpin(input: SpinInput): SpinResult {
  const rng = makeRng(input.seed, input.nonce, 0);
  let grid = makeGrid(rng, BASE_WEIGHTS);

  const vs = expandVsReels(grid, rng);
  grid = vs.grid;

  const evalResult = evaluateLines(grid, vs.expanded);
  const feature = startFeatureFromBase(grid);
  const scaled = evalResult.totalPayoutX * MODE_PAYOUT_SCALE.base;
  const capped = capWin(scaled);

  const nextState = feature.state
    ? ({ ...feature.state, accumulatedPayoutX: capped.payoutMultiplier } as Record<string, unknown>)
    : undefined;

  return {
    mode: 'base',
    payoutMultiplier: capped.payoutMultiplier,
    totalWin: input.totalBet * capped.payoutMultiplier,
    cappedByMaxWin: capped.cappedByMaxWin,
    grid,
    lineWins: evalResult.lineWins,
    events: [
      { type: 'BASE_SPIN_RESOLVED', payoutMultiplier: capped.payoutMultiplier },
      ...(feature.mode
        ? [{ type: 'FEATURE_TRIGGERED', feature: feature.mode, trigger: feature.trigger }]
        : []),
    ],
    nextState,
  };
}

function trainSpin(input: SpinInput): SpinResult {
  const state = normalizeTrainState(input.state);
  if (state.spinsRemaining <= 0) {
    return {
      mode: 'train',
      payoutMultiplier: 0,
      totalWin: 0,
      cappedByMaxWin: false,
      grid: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'BLANK' as SymbolCode)),
      lineWins: [],
      events: [{ type: 'FEATURE_COMPLETE', feature: 'train' }],
      nextState: { ...state, mode: 'train' },
    };
  }

  const rng = makeRng(input.seed, input.nonce, state.cursor);
  const rawGrid = makeGrid(rng, TRAIN_WEIGHTS);
  let grid = applyStickyWilds(rawGrid, state.stickyPositions);

  const newlyLandedWilds = collectWildPositions(grid);
  const stickyPositions = uniquePositions([...state.stickyPositions, ...newlyLandedWilds]);

  const evalResult = evaluateLines(grid, {});
  const scaled = evalResult.totalPayoutX * MODE_PAYOUT_SCALE.train;
  const capped = capSpinInRound(scaled, state.accumulatedPayoutX);
  const hitRoundCap = capped.newAccumulatedPayoutX >= MAX_WIN_X;
  const spinsRemaining = hitRoundCap ? 0 : Math.max(0, state.spinsRemaining - 1);

  return {
    mode: 'train',
    payoutMultiplier: capped.payoutMultiplier,
    totalWin: input.totalBet * capped.payoutMultiplier,
    cappedByMaxWin: capped.cappedByMaxWin,
    grid,
    lineWins: evalResult.lineWins,
    events: [
      { type: 'TRAIN_SPIN_RESOLVED', stickyCount: stickyPositions.length, spinsRemaining },
      ...(spinsRemaining === 0 ? [{ type: 'FEATURE_COMPLETE', feature: 'train' }] : []),
    ],
    nextState: {
      mode: 'train',
      spinsRemaining,
      stickyPositions,
      accumulatedPayoutX: capped.newAccumulatedPayoutX,
      cursor: state.cursor + 1,
    },
  };
}

function duelSpin(input: SpinInput): SpinResult {
  const state = normalizeDuelState(input.state);
  if (state.spinsRemaining <= 0) {
    return {
      mode: 'duel',
      payoutMultiplier: 0,
      totalWin: 0,
      cappedByMaxWin: false,
      grid: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'BLANK' as SymbolCode)),
      lineWins: [],
      events: [{ type: 'FEATURE_COMPLETE', feature: 'duel' }],
      nextState: { ...state, mode: 'duel' },
    };
  }

  const rng = makeRng(input.seed, input.nonce, state.cursor);
  let grid = makeGrid(rng, DUEL_WEIGHTS);
  const vs = expandVsReels(grid, rng);
  grid = vs.grid;

  const evalResult = evaluateLines(grid, vs.expanded);
  const scaled = evalResult.totalPayoutX * MODE_PAYOUT_SCALE.duel;
  const capped = capSpinInRound(scaled, state.accumulatedPayoutX);
  const hitRoundCap = capped.newAccumulatedPayoutX >= MAX_WIN_X;
  const spinsRemaining = hitRoundCap ? 0 : Math.max(0, state.spinsRemaining - 1);

  return {
    mode: 'duel',
    payoutMultiplier: capped.payoutMultiplier,
    totalWin: input.totalBet * capped.payoutMultiplier,
    cappedByMaxWin: capped.cappedByMaxWin,
    grid,
    lineWins: evalResult.lineWins,
    events: [
      {
        type: 'DUEL_SPIN_RESOLVED',
        expandedVsReels: Object.keys(vs.expanded).length,
        spinsRemaining,
      },
      ...(spinsRemaining === 0 ? [{ type: 'FEATURE_COMPLETE', feature: 'duel' }] : []),
    ],
    nextState: {
      mode: 'duel',
      spinsRemaining,
      accumulatedPayoutX: capped.newAccumulatedPayoutX,
      cursor: state.cursor + 1,
    },
  };
}

function deadSpin(input: SpinInput): SpinResult {
  const state = normalizeDeadState(input.state);
  const rng = makeRng(input.seed, input.nonce, state.cursor);

  if (state.phase === 'complete') {
    return {
      mode: 'dead',
      payoutMultiplier: 0,
      totalWin: 0,
      cappedByMaxWin: false,
      grid: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'BLANK' as SymbolCode)),
      lineWins: [],
      events: [{ type: 'FEATURE_COMPLETE', feature: 'dead' }],
      nextState: { ...state },
    };
  }

  if (state.phase === 'collect') {
    const collectWeights: Array<[SymbolCode, number]> = [
      ['WILD', 3],
      ['DMH_MULT', 4],
      ['BLANK', 93],
    ];
    const grid = makeGrid(rng, collectWeights);

    const wildsCollected = countSymbol(grid, 'WILD');
    const multTokens = countSymbol(grid, 'DMH_MULT');

    let collectedMultiplier = state.collectedMultiplier;
    for (let i = 0; i < multTokens; i++) {
      const mult = weightedPick(rng, [
        [2, 50],
        [3, 30],
        [5, 15],
        [10, 5],
      ] as Array<[number, number]>);
      collectedMultiplier += mult;
    }

    const collectedWildCount = state.collectedWildCount + wildsCollected;
    const anyCollect = wildsCollected + multTokens > 0;
    const consecutiveDeadSpins = anyCollect ? 0 : state.consecutiveDeadSpins + 1;
    const collectSpinsRemaining = anyCollect ? 3 : Math.max(0, state.collectSpinsRemaining - 1);

    const toShowdown = consecutiveDeadSpins >= 3 || collectSpinsRemaining === 0 || state.cursor >= 25;
    const nextState: DeadState = {
      ...state,
      phase: toShowdown ? 'showdown' : 'collect',
      collectSpinsRemaining,
      consecutiveDeadSpins,
      collectedWildCount,
      collectedMultiplier,
      showdownSpinsRemaining: state.showdownSpinsRemaining,
      cursor: state.cursor + 1,
    };

    return {
      mode: 'dead',
      payoutMultiplier: 0,
      totalWin: 0,
      cappedByMaxWin: false,
      grid,
      lineWins: [],
      events: [
        {
          type: 'DEAD_COLLECT_SPIN',
          wildsCollected,
          multTokensCollected: multTokens,
          collectedWildCount,
          collectedMultiplier,
          collectSpinsRemaining,
          consecutiveDeadSpins,
        },
        ...(toShowdown ? [{ type: 'DEAD_ENTER_SHOWDOWN', spins: 3 }] : []),
      ],
      nextState: nextState as unknown as Record<string, unknown>,
    };
  }

  // Showdown phase
  if (state.showdownSpinsRemaining <= 0) {
    const nextState: DeadState = { ...state, phase: 'complete', cursor: state.cursor + 1 };
    return {
      mode: 'dead',
      payoutMultiplier: 0,
      totalWin: 0,
      cappedByMaxWin: false,
      grid: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'BLANK' as SymbolCode)),
      lineWins: [],
      events: [{ type: 'FEATURE_COMPLETE', feature: 'dead' }],
      nextState: nextState as unknown as Record<string, unknown>,
    };
  }

  const showdownBaseWeights: Array<[SymbolCode, number]> = [
    ['BLANK', 500],
    ['P1', 10],
    ['P2', 15],
    ['P3', 22],
    ['P4', 30],
    ['P5', 38],
    ['L1', 54],
    ['L2', 60],
    ['L3', 66],
    ['L4', 72],
    ['L5', 78],
    ['WILD', 20],
  ];

  let grid = makeGrid(rng, showdownBaseWeights);
  grid = placeRandomWilds(grid, rng, state.collectedWildCount);

  const evalResult = evaluateLines(grid, {});
  const multiplied = evalResult.totalPayoutX * state.collectedMultiplier;
  const scaled = multiplied * MODE_PAYOUT_SCALE.dead;
  const capped = capSpinInRound(scaled, state.accumulatedPayoutX);
  const hitRoundCap = capped.newAccumulatedPayoutX >= MAX_WIN_X;

  const showdownSpinsRemaining = hitRoundCap ? 0 : Math.max(0, state.showdownSpinsRemaining - 1);
  const nextState: DeadState = {
    ...state,
    phase: showdownSpinsRemaining === 0 ? 'complete' : 'showdown',
    showdownSpinsRemaining,
    accumulatedPayoutX: capped.newAccumulatedPayoutX,
    cursor: state.cursor + 1,
  };

  return {
    mode: 'dead',
    payoutMultiplier: capped.payoutMultiplier,
    totalWin: input.totalBet * capped.payoutMultiplier,
    cappedByMaxWin: capped.cappedByMaxWin,
    grid,
    lineWins: evalResult.lineWins,
    events: [
      {
        type: 'DEAD_SHOWDOWN_SPIN',
        collectedWildCount: state.collectedWildCount,
        collectedMultiplier: state.collectedMultiplier,
        showdownSpinsRemaining,
      },
      ...(showdownSpinsRemaining === 0 ? [{ type: 'FEATURE_COMPLETE', feature: 'dead' }] : []),
    ],
    nextState: nextState as unknown as Record<string, unknown>,
  };
}

export function resolveSpin(input: SpinInput): SpinResult {
  if (!Number.isFinite(input.totalBet) || input.totalBet < 0) {
    throw new Error('totalBet must be a non-negative number.');
  }
  if (!Number.isInteger(input.nonce) || input.nonce < 0) {
    throw new Error('nonce must be a non-negative integer.');
  }

  if (input.mode === 'base') return baseSpin(input);
  if (input.mode === 'train') return trainSpin(input);
  if (input.mode === 'duel') return duelSpin(input);
  return deadSpin(input);
}
