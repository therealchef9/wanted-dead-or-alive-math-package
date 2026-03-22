# Engine notes (v0.2 scaffold)

Implemented defaults:
- Highest win only per payline
- Wild substitution for regular paying symbols only
- VS expansion checks whether reel expansion creates at least one line win
- Expanded VS reels become wild and assign one duel multiplier per reel
- If multiple VS reels contribute to a line, reel multipliers are added then applied
- No retriggers in feature modes
- Trigger collision priority fallback: DEAD > DUEL > TRAIN

Dead mode defaults:
- Collect phase starts at 3 lives
- Any collect event resets lives to 3
- Collect ends on 3 dead spins
- Showdown spins: 3
- Collected multipliers are additive with baseline 1x
- Mult token value weights: 2x(50), 3x(30), 5x(15), 10x(5)

Important:
- RTP/volatility are not calibrated yet to 96.5 exact.
- Reel weights are provisional and meant for calibration iteration.
