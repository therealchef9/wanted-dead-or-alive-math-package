# wanted-dead-or-alive-math-package

Generic, inspired-by 5x5 line-slot math backend package designed for Stake Engine style publication flows.

## Product scope
- Deterministic headless math engine
- 5x5 grid, fixed 15 paylines
- Base game + 3 features: Train, Duel, Dead Man's Hand style modes
- Buy modes (cost multipliers):
  - TRAIN: 80x
  - DUEL: 200x
  - DEAD: 400x
- Target RTP: 96.5%
- Max win cap: 12,500x
- High volatility target

## Symbol mapping
- Low: L1..L5 (L5 most common)
- Premium: P1..P5 (P1 rarest)
- Specials: WILD, VS, SC_TRAIN, SC_DUEL, SC_DEAD, DMH_MULT

Display aliases:
- L1=10, L2=J, L3=Q, L4=K, L5=A
- P1=bull horn, P2=cowboy hat, P3=money bag, P4=bottle, P5=revolver magazine

## Current implementation
- `src/config/paylines.json` fixed 15-line map
- `src/config/paytable.json` line symbol payouts + wild + VS table
- `src/config/feature-params.json` feature defaults + buy costs
- `src/index.ts` deterministic resolver + mode state machines:
  - Base mode with line evaluation + VS reel expansion and duel multipliers
  - Train mode (10 spins, sticky wild carryover)
  - Duel mode (10 spins, elevated VS density)
  - Dead mode (collect phase -> showdown phase)
- `docs/stake-upload-contract.md` static upload artifact contract

## API
`resolveSpin({ mode, totalBet, seed, nonce, state? })`

Returns:
- `payoutMultiplier`
- `totalWin`
- `grid`
- `lineWins`
- `events`
- `nextState`

## Notes
- This is intentionally genericized/white-label.
- No copyrighted naming/assets included.
- Retriggers disabled in v1.
- Current math is framework-first and deterministic; RTP/volatility tuning pass is still required to lock 96.5% exactly.
