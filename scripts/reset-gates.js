'use strict';
// Resets both gate accounts for the v2 gate contract (state layout changed:
// added release_pending). Delete -> recreate -> deploy -> init, same params.
const fs = require('fs');
const path = require('path');
const { ACCOUNTS, accountFromKey, saveKey, viewCall, near, ROOT } = require('../src/near');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function accountExists(id) {
  const res = await fetch('https://rpc.testnet.near.org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'q', method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: id },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json();
  return !!j.result;
}

(async () => {
  const owner = accountFromKey('owner.json');
  const wasm = fs.readFileSync(
    path.join(ROOT, 'contract-gate', 'target', 'wasm32-unknown-unknown', 'release', 'ritual_gate.wasm')
  );
  const gates = [
    { keyFile: 'gate-full.json', id: ACCOUNTS.gate, start: 960, len: 240, fund: '1.7' },
    { keyFile: 'gateoff-full.json', id: ACCOUNTS.gateoff, start: 180, len: 60, fund: '1.7' },
  ];
  for (const g of gates) {
    if (await accountExists(g.id)) {
      const old = accountFromKey(g.keyFile);
      const del = await old.deleteAccount(ACCOUNTS.owner);
      console.log(`DELETED ${g.id} tx=${del.transaction.hash}`);
      for (let i = 0; i < 10 && (await accountExists(g.id)); i++) await sleep(3000);
    }
    const kp = near.KeyPair.fromRandom('ed25519');
    const create = await owner.createSubAccount({
      accountOrPrefix: g.id,
      publicKey: kp.getPublicKey(),
      nearToTransfer: near.nearToYocto(g.fund),
    });
    saveKey(g.keyFile, g.id, kp);
    console.log(`RECREATED ${g.id} tx=${create.transaction.hash}`);
    const acct = accountFromKey(g.keyFile);
    const dep = await acct.deployContract(new Uint8Array(wasm));
    console.log(`DEPLOYED ${g.id} tx=${dep.transaction.hash}`);
    await owner.callFunction({
      contractId: g.id,
      methodName: 'init',
      args: {
        ft_contract: ACCOUNTS.ft,
        treasury: ACCOUNTS.treasury,
        tax_bps: 300,
        target_count: 10,
        window_start_minute_utc: g.start,
        window_len_minutes: g.len,
      },
      gas: near.teraToGas('30'),
    });
    console.log(`INIT ${g.id} state:`, JSON.stringify(await viewCall(g.id, 'get_state', {})));
  }
})().catch((e) => {
  console.error('ERR', (e.message || String(e)).slice(0, 400));
  process.exit(1);
});
