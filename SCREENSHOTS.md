# Demo post assets — RitualCoin

Per HACKATHON.md Q-012, a local/CLI demo needs a **video** in the X post.
Record a short terminal video (60–90 s) covering, in order:

1. `get_state` on `gate.ritualcoin2026.testnet` showing
   `ritual_active_now: true`, tax 300 bps, target 10 (run during
   16:00–20:00 UTC).
2. `node scripts/prove-ritual.js` — ritual transfer #1: recipient +97,
   pot = 3, counter = 1.
3. The counter completing at #10: `release_pending=true`, pot = 30 RITUAL.
4. `release_pot()` paying the treasury (+30 RITUAL) — show the treasury's
   `ft_balance_of` before/after.
5. The control transfer through the dark gate (`gateoff…`) being refunded
   in full: balances unchanged.

Screenshots (backup / thread follow-ups):
- [ ] `ft_metadata` of `ft.ritualcoin2026.testnet` (RitualCoin / RITUAL / 8 decimals)
- [ ] prove-ritual output: transfer #1 line (bob +97, pot 3, count 1)
- [ ] prove-ritual output: release line (treasury +30, pot 0, releases 1)
- [ ] prove-ritual output: control line (alice delta 0, gateoff count 0)
- [ ] Explorer: the FT deploy tx and one ritual `ft_transfer_call` tx
