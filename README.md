# RitualCoin — a memecoin where the meme does something

Most memecoins are just a ticker and a chart. **RITUAL** has a mechanic:
a daily **ritual window** (16:00–20:00 UTC) during which transfers routed
through the RitualGate contract perform a small on-chain ceremony:

- every routed transfer **skims a 3% tax into a community pot** and
  forwards the remaining 97% to the real recipient;
- every routed transfer increments a **collective counter**;
- when the counter reaches **10**, the release is *armed* — and anyone can
  call `release_pot()` to send the whole pot to the community treasury,
  on-chain, in public.

Outside the window the gate accepts nothing: the full amount is refunded
to the sender by the standard NEP-141 resolver. The token itself is a
plain, standard NEP-141 — the mechanic lives entirely in the gate
contract, so RITUAL stays compatible with every wallet and tool that
speaks the standard.

Built at **NEAR HACKATHON** (track: Memecoins With Mechanics). Testnet
only; no real funds anywhere in this repository.

> Sibling entry (same builder, independent project, disclosed per the
> hackathon rules): **AgentLeash** — a policy-guarded wallet for AI
> agents (NEAR HACKATHON, AI Security & Defense track).

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

## Try it — do X, see Y

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

## How it works

```
ft_transfer_call(gate, amount, msg={receiver})
        │
        ▼
RitualGate.ft_on_transfer
  ├─ window closed → return full amount (NEP-141 refund to sender)
  └─ window open → tax 3% to pot, forward 97% to receiver, counter += 1
        counter reaches 10 → release armed
release_pot() (anyone) → whole pot to treasury
```

One hard-won implementation note: the pot is **not** paid out inside
`ft_on_transfer`. The standard resolver (`ft_resolve_transfer` in
near-contract-standards) protects senders by asserting the receiver's
token balance does not drop during the callback — paying out *previous*
transfers' taxes in the same callback trips that guard (we hit it:
`assertion failed ... yields possible loss of tokens`). Arming the
release in the callback and paying it in a separate, permissionless call
is the correct pattern.

## Built with

- **Token:** the official fungible-token example from `near/near-sdk-rs`,
  built on the audited `near-contract-standards` implementation. Only the
  metadata (name/symbol/decimals) was changed — no token math is
  hand-rolled. Source: `contract-ft/`.
- **Gate:** original Rust (near-sdk 5), `contract-gate/`. Scripts in
  near-api-js 7; accounts via near-cli-rs faucet. Window per the rules:
  code written for this hackathon (post-2026-10-19 announcement counts).

## License

MIT — see LICENSE.
