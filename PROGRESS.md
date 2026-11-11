# RitualCoin — PROGRESS

Track: Memecoins With Mechanics (`memecoins`). Testnet only.
Parent: `ritualcoin2026.testnet` (faucet-funded 10 test NEAR, tx 4J72gjMd9axhG5E1gzMWmUtaC6JiiijYuuTvEER5d5D1).

Accounts (subaccounts):
- ft.ritualcoin2026.testnet — RITUAL token (official near-sdk-rs FT template, metadata-only changes)
- gate.ritualcoin2026.testnet — RitualGate mechanics (daily window 16:00–20:00 UTC, tax 3%, target 10 transfers)
- gateoff.ritualcoin2026.testnet — control gate (window 03:00–04:00 UTC) to prove out-of-window refunds
- alice / bob .ritualcoin2026.testnet — demo users; treasury.ritualcoin2026.testnet — pot recipient

## Checklist
- [x] Parent account + keys secured (.keys/, chmod 600)
- [x] FT built (372 KB, official template) + gate built (105 KB after v2 fix)
- [x] Subaccounts created + funded (ft needed +1.5 top-up for storage; gates +0.5)
- [x] FT deployed (tx G17aqwX8X8FkEdeWVHZ6ac7jVmBpRSPGKnLeS5oHPYmB) + initialized;
      metadata live: RitualCoin / RITUAL / 8 decimals, supply 1e9
- [x] Gates v1 deployed, then RESET for v2 (state layout + deferred release)
- [x] Mechanic proof v2: 10 transfers (97 fwd / 3 tax each) → release armed →
      release_pot() → treasury +30; control transfer fully refunded;
      settled-state verification: supply conserved (evidence/VERIFICATION.md)
- [x] README.md, SCREENSHOTS.md, LICENSE written

## KEY FINDING (v1 → v2)
- Paying the pot INSIDE ft_on_transfer trips the near-contract-standards
  resolver guard (receiver balance must not drop during the callback —
  earlier taxes leaving = "possible loss of tokens" panic in
  ft_resolve_transfer on the 10th transfer; the transfers themselves had
  settled correctly). Fix: the counter only ARMS the release in the
  callback; `release_pot()` (permissionless) pays the treasury separately.
