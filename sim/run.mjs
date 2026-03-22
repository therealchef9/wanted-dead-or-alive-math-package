import { resolveSpin } from '../dist/index.js';

const BUY_COST = {
  base: 1,
  train: 80,
  duel: 200,
  dead: 400,
};

function runBaseRound(seed, nonce) {
  const first = resolveSpin({ mode: 'base', totalBet: 1, seed, nonce });
  let total = first.payoutMultiplier;
  let guard = 0;
  let mode = first.nextState?.mode;
  let state = first.nextState;
  while (mode && guard < 250) {
    guard += 1;
    const r = resolveSpin({ mode, totalBet: 1, seed, nonce, state });
    total += r.payoutMultiplier;
    state = r.nextState;
    mode = state?.mode;
    if (r.events.some((e) => e.type === 'FEATURE_COMPLETE')) break;
  }
  return total;
}

function runFeatureRound(mode, seed, nonce) {
  let state = undefined;
  let total = 0;
  let guard = 0;
  while (guard < 200) {
    guard += 1;
    const r = resolveSpin({ mode, totalBet: 1, seed, nonce, state });
    total += r.payoutMultiplier;
    state = r.nextState;
    const complete = r.events.some((e) => e.type === 'FEATURE_COMPLETE');
    if (complete) break;
  }
  return total;
}

function summarize(values, cost) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let varAcc = 0;
  let hits = 0;
  for (const v of values) {
    if (v > 0) hits += 1;
    const d = v - mean;
    varAcc += d * d;
  }
  const variance = varAcc / n;
  const std = Math.sqrt(variance);
  const rtp = (mean / cost) * 100;
  return { n, mean, std, hitRate: (hits / n) * 100, rtp };
}

function runMode(mode, spins) {
  const vals = [];
  for (let i = 0; i < spins; i++) {
    const seed = `sim-${mode}-${i}`;
    if (mode === 'base') vals.push(runBaseRound(seed, i));
    else vals.push(runFeatureRound(mode, seed, i));
  }
  return summarize(vals, BUY_COST[mode]);
}

const spins = Number(process.argv[2] || 100000);
for (const mode of ['base', 'train', 'duel', 'dead']) {
  const s = runMode(mode, spins);
  console.log(
    JSON.stringify({ mode, ...s })
  );
}
