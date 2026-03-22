# Stake-style static upload contract (scaffold notes)

Expected publish artifacts per mode:
- index.json
- lookup table CSV (simulation id, probability, payout multiplier)
- events .jsonl.zst

Required event record keys:
- id
- events
- payoutMultiplier

Index shape:
{
  "modes": [
    {
      "name": "base",
      "cost": 1.0,
      "events": "books_base.jsonl.zst",
      "weights": "lookUpTable_base_0.csv"
    }
  ]
}

Notes:
- Keep payoutMultiplier values consistent between CSV and logic file.
- Keep files stateless and replay-compatible.
- No continuation/jackpot/gamble behavior.
