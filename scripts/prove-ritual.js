'use strict';
// RitualCoin mechanic proof → evidence/ritual-proof.json
//  1. Register storage for gate/gateoff/alice/bob/treasury on the FT contract.
//  2. Fund alice with 2,000 RITUAL from the owner.
//  3. ONE ritual transfer (100 RITUAL, alice -> gate -> bob): bob +97, pot 3, count 1.
//  4. NINE more: on the 10th, the pot (30 RITUAL) auto-releases to treasury.
//  5. Control: same transfer through the OFF-window gate -> full refund, nothing moves.
// All balances verified with ft_balance_of views.
const fs = require('fs');
const path = require('path');
const { ACCOUNTS, accountFromKey, viewCall, near, ROOT } = require('../src/near');

const R = (tokens) => (BigInt(tokens) * 10n ** 8n).toString(); // RITUAL @ 8 decimals
const GAS = near.teraToGas('80');
const ONE_YOCTO = 1n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bal(id) {
  return BigInt(await viewCall(ACCOUNTS.ft, 'ft_balance_of', { account_id: id }));
}
async function gateState(id) {
  return viewCall(id, 'get_state', {});
}
function fmt(baseUnits) {
  return `${(BigInt(baseUnits) / 10n ** 8n).toString()} RITUAL`;
}

(async () => {
  const ev = { generatedAt: new Date().toISOString(), network: 'testnet', steps: [] };
  const owner = accountFromKey('owner.json');
  const alice = accountFromKey('alice-full.json');

  // 1. Storage registration (owner pays the 0.00125 NEAR minimum for each).
  for (const id of [ACCOUNTS.gate, ACCOUNTS.gateoff, ACCOUNTS.alice, ACCOUNTS.bob, ACCOUNTS.treasury]) {
    const sb = await viewCall(ACCOUNTS.ft, 'storage_balance_of', { account_id: id });
    if (sb && sb.total) {
      ev.steps.push({ step: 'storage', account: id, result: 'already registered' });
      continue;
    }
    const out = await owner.callFunctionRaw({
      contractId: ACCOUNTS.ft,
      methodName: 'storage_deposit',
      args: { account_id: id, registration_only: true },
      deposit: near.nearToYocto('0.00125'),
      gas: near.teraToGas('30'),
    });
    ev.steps.push({ step: 'storage', account: id, tx: out.transaction.hash });
    console.log(`storage registered: ${id}`);
  }

  // 2. Fund alice.
  const aliceBefore = await bal(ACCOUNTS.alice);
  if (aliceBefore < BigInt(R(1500))) {
    const out = await owner.callFunctionRaw({
      contractId: ACCOUNTS.ft,
      methodName: 'ft_transfer',
      args: { receiver_id: ACCOUNTS.alice, amount: R(2000), memo: 'demo funding' },
      deposit: ONE_YOCTO,
      gas: near.teraToGas('30'),
    });
    ev.steps.push({ step: 'fund_alice', amount: '2000 RITUAL', tx: out.transaction.hash });
    console.log('funded alice with 2000 RITUAL, tx', out.transaction.hash);
  }

  const gs0 = await gateState(ACCOUNTS.gate);
  console.log('gate state before:', JSON.stringify(gs0));
  if (!gs0.ritual_active_now) {
    throw new Error('Main gate ritual window is NOT active right now — rerun during 16:00-20:00 UTC');
  }
  const gsOff = await gateState(ACCOUNTS.gateoff);
  if (gsOff.ritual_active_now) {
    throw new Error('Control gate unexpectedly active — pick another control window');
  }

  async function ritualTransfer(gateId, amountTokens, memo) {
    const out = await alice.callFunctionRaw({
      contractId: ACCOUNTS.ft,
      methodName: 'ft_transfer_call',
      args: {
        receiver_id: gateId,
        amount: R(amountTokens),
        memo: memo || null,
        msg: JSON.stringify({ receiver: ACCOUNTS.bob, memo: 'ritual demo' }),
      },
      deposit: ONE_YOCTO,
      gas: GAS,
    });
    // Cross-contract promises settle asynchronously; give them a moment.
    await sleep(4000);
    return out.transaction.hash;
  }

  // 3. First ritual transfer.
  const bob0 = await bal(ACCOUNTS.bob);
  const tx1 = await ritualTransfer(ACCOUNTS.gate, 100, 'ritual #1');
  const bob1 = await bal(ACCOUNTS.bob);
  const gs1 = await gateState(ACCOUNTS.gate);
  const step3 = {
    step: 'ritual_transfer_1',
    tx: tx1,
    bobDelta: (bob1 - bob0).toString(),
    pot: gs1.pot_yocto,
    count: gs1.transfers_count,
  };
  ev.steps.push(step3);
  console.log(`ritual #1: bob +${fmt(step3.bobDelta)}, pot=${fmt(gs1.pot_yocto)}, count=${gs1.transfers_count}`);

  // 4. Nine more → the 10th completes the counter and ARMS the release;
  //    anyone can then call release_pot() to pay the treasury.
  const treasury0 = await bal(ACCOUNTS.treasury);
  let lastTx = null;
  for (let i = 2; i <= 10; i++) {
    lastTx = await ritualTransfer(ACCOUNTS.gate, 100, `ritual #${i}`);
  }
  const gsArmed = await gateState(ACCOUNTS.gate);
  console.log(
    `after 10 rituals: release_pending=${gsArmed.release_pending}, pot=${fmt(gsArmed.pot_yocto)}, count=${gsArmed.transfers_count}`
  );
  const relOut = await alice.callFunctionRaw({
    contractId: ACCOUNTS.gate,
    methodName: 'release_pot',
    args: {},
    gas: near.teraToGas('50'),
  });
  await sleep(4000);
  const gs2 = await gateState(ACCOUNTS.gate);
  const treasury1 = await bal(ACCOUNTS.treasury);
  const bob2 = await bal(ACCOUNTS.bob);
  const step4 = {
    step: 'ritual_transfers_2_to_10_and_release',
    lastTx,
    releaseTx: relOut.transaction.hash,
    armedState: { pot: gsArmed.pot_yocto, pending: gsArmed.release_pending, count: gsArmed.transfers_count },
    treasuryDelta: (treasury1 - treasury0).toString(),
    bobTotal: bob2.toString(),
    gateAfter: { pot: gs2.pot_yocto, count: gs2.transfers_count, releases: gs2.releases_count, pending: gs2.release_pending },
  };
  ev.steps.push(step4);
  console.log(
    `release: treasury +${fmt(step4.treasuryDelta)}, bob total ${fmt(bob2)}, pot=${fmt(gs2.pot_yocto)}, releases=${gs2.releases_count}`
  );

  // 5. Control: off-window gate refunds in full.
  const alicePre = await bal(ACCOUNTS.alice);
  const bobPre = await bal(ACCOUNTS.bob);
  const txCtl = await ritualTransfer(ACCOUNTS.gateoff, 100, 'control off-window');
  const alicePost = await bal(ACCOUNTS.alice);
  const bobPost = await bal(ACCOUNTS.bob);
  const gsCtl = await gateState(ACCOUNTS.gateoff);
  const step5 = {
    step: 'control_off_window',
    tx: txCtl,
    aliceDelta: (alicePost - alicePre).toString(),
    bobDelta: (bobPost - bobPre).toString(),
    gateoffCount: gsCtl.transfers_count,
    gateoffPot: gsCtl.pot_yocto,
  };
  ev.steps.push(step5);
  console.log(
    `control: alice delta ${fmt(step5.aliceDelta)}, bob delta ${fmt(step5.bobDelta)}, gateoff count=${gsCtl.transfers_count} pot=${fmt(gsCtl.pot_yocto)}`
  );

  const outPath = path.join(ROOT, 'evidence', 'ritual-proof.json');
  fs.writeFileSync(outPath, JSON.stringify(ev, null, 2));
  console.log('evidence written:', outPath);
})().catch((e) => {
  console.error('ERR', (e.message || String(e)).slice(0, 400));
  process.exit(1);
});
