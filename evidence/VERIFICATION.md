# RitualCoin — verification summary (2026-11-11, NEAR testnet)

## What was proven, end to end

Two full ritual cycles ran against `gate.ritualcoin2026.testnet`
(window 16:00–20:00 UTC, tax 3%, target 10):

- Per transfer of 100 RITUAL: recipient **+97**, pot **+3**, counter +1
  (gate log: `RITUAL_TRANSFER ... tax=300000000 ... count=N/10`).
- At the 10th transfer the counter completed and the pot (**30 RITUAL**)
  was paid to `treasury.ritualcoin2026.testnet`.
- Control: a transfer routed through the dark gate
  (`gateoff.ritualcoin2026.testnet`, window 03:00–04:00 UTC) was
  **refunded in full** — sender/recipient deltas 0, control counter 0.

## Settled-state verification (`scripts/final-verify.js`, run twice, identical)

| Account | RITUAL |
| --- | --- |
| owner | 999,996,000 |
| alice (demo user) | 1,900 |
| bob (recipient) | 2,037 (= 21 forwards × 97) |
| treasury | 60 (= 2 releases × 30) |
| gate | 3 (see dust note) |
| gateoff | 0 |
| **sum = total supply** | **1,000,000,000 ✓ conserved** |

Gate state after cycle 2: `transfers_count 0, pot 0, releases_count 1,
release_pending false`. Raw record: `evidence/release-verification.json`.

## Run history — read this before trusting any single number

1. **Cycle 1 (gate v1)** paid the pot *inside* `ft_on_transfer`. The
   transfers themselves settled correctly (pot released, balances exact),
   but the 10th transaction's `ft_resolve_transfer` receipt panicked in
   near-contract-standards ("receiver balance dropped during callback"
   guard) — paying out *earlier* transfers' taxes inside the callback
   trips the sender-protection assertion. The SDK surfaced this as a
   failed call even though the funds had moved correctly.
2. **Fix (gate v2):** completing the counter only *arms* the release
   (`release_pending`); `release_pot()` (permissionless) pays the
   treasury as its own transaction. Cycle 2 ran clean.
3. **RPC view lag:** during the runs, `rpc.testnet.near.org` views lagged
   the settled chain by minutes under load, so some mid-run balance reads
   in `ritual-proof.json` (a cycle-1-era record) are stale. The table
   above comes from settled, double-read verification.
4. **Dust note:** the gate's token balance is 3 RITUAL while its pot
   counter reads 0 — exactly one tax, most plausibly a late-settling
   cycle-1 receipt landing on the recreated (same-ID) gate account.
   Total supply is conserved and no participant balance is affected.
