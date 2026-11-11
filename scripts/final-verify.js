const { ACCOUNTS, accountFromKey, viewCall, near } = require('../src/near');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bal = async (id) => BigInt(await viewCall(ACCOUNTS.ft, 'ft_balance_of', { account_id: id }));
const U = (b) => (b / 10n ** 8n).toString() + ' RITUAL';
(async () => {
  // Conservation check across every account that ever touched RITUAL.
  const ids = { owner: ACCOUNTS.owner, alice: ACCOUNTS.alice, bob: ACCOUNTS.bob, treasury: ACCOUNTS.treasury, gate: ACCOUNTS.gate, gateoff: ACCOUNTS.gateoff };
  let sum = 0n;
  for (const [name, id] of Object.entries(ids)) { const b = await bal(id); sum += b; console.log(name.padEnd(9), U(b)); }
  const supply = BigInt(await viewCall(ACCOUNTS.ft, 'ft_total_supply', {}));
  console.log('sum of known accounts:', U(sum), '| total supply:', U(supply), '| conserved:', sum === supply);

  // If a release happens to be armed, execute it and verify the payout.
  let releaseTx = null;
  let tDelta = 0n;
  const gsBefore = await viewCall(ACCOUNTS.gate, 'get_state', {});
  if (gsBefore.release_pending) {
    const t0 = await bal(ACCOUNTS.treasury);
    const alice = accountFromKey('alice-full.json');
    const out = await alice.callFunctionRaw({ contractId: ACCOUNTS.gate, methodName: 'release_pot', args: {}, gas: near.teraToGas('50') });
    releaseTx = out.transaction.hash;
    await sleep(9000);
    tDelta = (await bal(ACCOUNTS.treasury)) - t0;
    console.log('release_pot tx:', releaseTx, '| treasury delta:', U(tDelta));
  } else {
    console.log('no release armed right now (already released); verifying settled state only');
  }
  const gs = await viewCall(ACCOUNTS.gate, 'get_state', {});
  const gBal = await bal(ACCOUNTS.gate);
  console.log('gate state:', JSON.stringify(gs), '| gate FT balance:', U(gBal));
  require('fs').writeFileSync('evidence/release-verification.json', JSON.stringify({
    checkedAt: new Date().toISOString(),
    conservation: { sum: sum.toString(), totalSupply: supply.toString(), conserved: sum === supply },
    balances: { alice: (await bal(ACCOUNTS.alice)).toString(), bob: (await bal(ACCOUNTS.bob)).toString(), treasury: (await bal(ACCOUNTS.treasury)).toString() },
    releasePotTx: releaseTx,
    treasuryDeltaBaseUnits: tDelta.toString(),
    gateStateAfter: gs,
    gateFtBalanceAfter: gBal.toString(),
  }, null, 2));
  console.log('saved evidence/release-verification.json');
})();
