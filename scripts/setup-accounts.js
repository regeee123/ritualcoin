'use strict';
// Creates + funds the RitualCoin subaccounts (idempotent).
const { ACCOUNTS, accountFromKey, saveKey, near } = require('../src/near');

const PLAN = {
  ft: { keyFile: 'ft-full.json', near: '3' },
  gate: { keyFile: 'gate-full.json', near: '1.2' },
  gateoff: { keyFile: 'gateoff-full.json', near: '1.2' },
  alice: { keyFile: 'alice-full.json', near: '0.05' },
  bob: { keyFile: 'bob-full.json', near: '0.05' },
  treasury: { keyFile: 'treasury-full.json', near: '0.05' },
};

async function exists(id) {
  try {
    const res = await fetch('https://rpc.testnet.near.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'q',
        method: 'query',
        params: { request_type: 'view_account', finality: 'final', account_id: id },
      }),
      signal: AbortSignal.timeout(30000),
    });
    const j = await res.json();
    return !!j.result;
  } catch {
    return false;
  }
}

(async () => {
  const owner = accountFromKey('owner.json');
  for (const [name, plan] of Object.entries(PLAN)) {
    const id = ACCOUNTS[name];
    if (await exists(id)) {
      console.log(`SKIP ${id} (exists)`);
      continue;
    }
    const kp = near.KeyPair.fromRandom('ed25519');
    const out = await owner.createSubAccount({
      accountOrPrefix: id,
      publicKey: kp.getPublicKey(),
      nearToTransfer: near.nearToYocto(plan.near),
    });
    saveKey(plan.keyFile, id, kp);
    console.log(`CREATED ${id} funded=${plan.near} NEAR tx=${out.transaction.hash}`);
  }
  console.log('done');
})().catch((e) => {
  console.error('ERR', (e.message || String(e)).slice(0, 400));
  process.exit(1);
});
