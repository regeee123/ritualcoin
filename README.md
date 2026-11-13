# 🕯️ RitualCoin — **RITUAL**

### A memecoin where the meme *does* something. Like, literally. On-chain. Every day.

> Most memecoins are a ticker, a chart, and a prayer. RITUAL has a
> ceremony: every day, for four hours, transfers routed through the
> RitualGate skim **3% into a community pot** — and when the ritual
> counter completes, **anyone** can release the whole pot to the
> community treasury, on-chain, in public. No priesthood required.
> Just a counter and a candle. 🕯️

`NEAR testnet` · `NEP-141` · `NEAR HACKATHON — Memecoins With Mechanics track` · `MIT`

| | |
| --- | --- |
| **Token** | `ft.ritualcoin2026.testnet` |
| **Gate** | `gate.ritualcoin2026.testnet` |
| **Ritual window** | Daily, **16:00–20:00 UTC** |
| **Tax** | 300 bps (3%) → pot · 97% forwarded |
| **Release** | Counter of 10 → `release_pot()` (permissionless) → treasury |
| **Supply** | 1,000,000,000 RITUAL · minted once · no mint function |

Testnet only — no real funds anywhere in this repository. The only
thing at stake is the candle wax.

---

## How the ritual works (the sacred rites)

```
        ┌─────────────────────────────────────────────────┐
        │   THE WINDOW OPENS — daily, 16:00–20:00 UTC     │
        └─────────────────────────────────────────────────┘
                              │
   1 · SEND      ft_transfer_call the gate, naming your real
                 recipient in the msg: {"receiver": "<them>"}
                              │
   2 · SKIM      the gate takes 3% into the pot and forwards
                 97% to your recipient — counter ticks +1
                              │
   3 · COUNT     at the 10th transfer the release is ARMED
                 (release_pending = true)
                              │
   4 · RELEASE   anyone calls release_pot() → the whole pot
                 lands in treasury.ritualcoin2026.testnet
```

**Outside the window, there is no ritual.** The gate isn't being
rude, it's being punctual: it accepts nothing, and the full amount
is refunded to the sender by the standard NEP-141 resolver. No
partial fills, no trapped funds — the ceremony happens on schedule
or not at all. The candle keeps office hours.

The token itself is a plain, standard NEP-141 — boring on purpose
(that's a compliment in token design). All the drama lives in the
gate contract, so RITUAL stays compatible with every wallet and
tool that speaks the standard.

---

## Proven, not promised

This mechanic is not a whitepaper idea — it ran, twice, end to end on
NEAR testnet on 2026-11-11. Receipts, not vibes (full record:
[`evidence/`](evidence/)):

- **Two full ritual cycles** completed against
  `gate.ritualcoin2026.testnet`. Per 100 RITUAL transferred: recipient
  **+97**, pot **+3**, counter **+1**. At the 10th transfer the pot
  (**30 RITUAL**) was paid to the treasury — twice, so the treasury's
  settled balance is **60 RITUAL**.
- **Control check:** a transfer routed through a second gate whose
  window was shut (`gateoff.ritualcoin2026.testnet`, 03:00–04:00 UTC)
  was **refunded in full** — sender and recipient deltas 0. Even the
  darkness around here has been tested.
- **Supply conserved, exactly.** Settled-state verification
  (`node scripts/final-verify.js`, run twice, identical results):

  | Account | RITUAL |
  | --- | ---: |
  | owner | 999,996,000 |
  | alice (demo user) | 1,900 |
  | bob (recipient) | 2,037 (= 21 forwards × 97) |
  | treasury | 60 (= 2 releases × 30) |
  | gate | 3 (dust — see `evidence/VERIFICATION.md`) |
  | gateoff | 0 |
  | **sum = total supply** | **1,000,000,000 ✓** |

The verification notes also document the honest mess (most memecoins
hide their bugs; ours are documented, with names): the v1 gate paid
the pot inside the transfer callback and tripped a sender-protection
assertion in `near-contract-standards`. The fix — arm the release in
the callback, pay it in a separate permissionless call — is the
pattern this code now uses, and cycle 2 ran clean on it.

---

## Live deployment (NEAR testnet)

| Thing | Account |
| --- | --- |
| Token (RITUAL) | `ft.ritualcoin2026.testnet` |
| RitualGate (window 16:00–20:00 UTC) | `gate.ritualcoin2026.testnet` |
| Control gate (window 03:00–04:00 UTC) | `gateoff.ritualcoin2026.testnet` |
| Demo user / recipient | `alice.ritualcoin2026.testnet` / `bob.ritualcoin2026.testnet` |
| Treasury | `treasury.ritualcoin2026.testnet` |

Token facts: name **RitualCoin**, symbol **RITUAL**, 8 decimals, total
supply 1,000,000,000 RITUAL (minted once at init to the owner account —
there is no mint function). Gate parameters: tax 300 bps (3%), counter
target 10 transfers, pot → treasury.

A static overview page — the temple tour, no ticket required — lives
at [`docs/index.html`](docs/index.html).

---

## Try it — do X, see Y (no initiation required)

Prerequisites: Node.js 20+, `npm install` in this directory. The demo keys
in `.keys/` are testnet throwaways (gitignored; a fresh clone must run the
setup steps or provide its own testnet accounts).

1. **Read the gate state.**
   `node -e "require('./src/near').viewCall('gate.ritualcoin2026.testnet','get_state',{}).then(s=>console.log(s))"`
   → See the tax, target, pot, counter — and `ritual_active_now` with
   `minutes_until_window_opens`.
2. **Run the full mechanic proof.**
   `node scripts/prove-ritual.js` (during 16:00–20:00 UTC for the in-window
   part) → registers storage, funds the demo user, then:
   - ritual transfer #1 of 100 RITUAL: recipient +97, pot = 3, counter = 1;
   - transfers #2–#10: counter completes → `release_pending: true`, pot = 30;
   - `release_pot()` → treasury +30 RITUAL, pot = 0, releases = 1;
   - control transfer through the dark gate → **full refund**: sender and
     recipient balances unchanged, control counter stays 0.
   All steps with tx hashes land in `evidence/ritual-proof.json`.
3. **Do a ritual transfer by hand.** Register on the token
   (`storage_deposit`), hold some RITUAL, then call `ft_transfer_call` on
   `ft.ritualcoin2026.testnet` with `receiver_id` = the gate and
   `msg` = `{"receiver": "<final recipient>"}` — during the window your
   transfer joins the ritual; outside it, you are refunded in full.

---

## Built with

- **Token:** the official fungible-token example from `near/near-sdk-rs`,
  built on the audited `near-contract-standards` implementation. Only the
  metadata (name/symbol/decimals) was changed — no token math is
  hand-rolled. Source: `contract-ft/`.
- **Gate:** original Rust (near-sdk 5), `contract-gate/`. Scripts in
  near-api-js 7; accounts via near-cli-rs faucet. Window per the rules:
  code written for this hackathon (post-2026-10-19 announcement counts).

> Sibling entry (same builder, independent project, disclosed per the
> hackathon rules): **AgentLeash** — a policy-guarded wallet for AI
> agents (NEAR HACKATHON, AI Security & Defense track).

## License

MIT — see LICENSE.
