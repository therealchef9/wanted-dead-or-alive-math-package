export type Mode = 'base' | 'train' | 'duel' | 'dead';

export interface SpinInput {
  mode: Mode;
  totalBet: number;
  seed: string;
  nonce: number;
  state?: Record<string, unknown>;
}

export interface SpinResult {
  mode: Mode;
  payoutMultiplier: number;
  totalWin: number;
  cappedByMaxWin: boolean;
  events: Array<Record<string, unknown>>;
  nextState?: Record<string, unknown>;
}

export function resolveSpin(_input: SpinInput): SpinResult {
  throw new Error('Scaffold only: resolveSpin not implemented yet.');
}
