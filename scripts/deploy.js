'use strict';
// Deploys RITUAL (FT) and both RitualGate instances; initializes everything.
// Gate:     window 16:00-20:00 UTC daily, tax 3% (300 bps), target 10 transfers.
// GateOff:  window 03:00-04:00 UTC daily (control — proves out-of-window refunds).
const fs = require('fs');
const path = require('path');
const { ACCOUNTS, accountFromKey, viewCall, near, ROOT } = require('../src/near');

const TOTAL_SUPPLY = '100000000000000000'; // 1,000,000,000 RITUAL @ 8 decimals

async function codeHash(accountId) {
  const res = await fetch('https://rpc.testnet.near.org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'q',
      method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: accountId },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json();
  return j.result && j.result.code_hash;
}
const NO_CODE = '11111111111111111111111111111111';

async function deployIfNeeded(accountKeyFile, accountId, wasmPath) {
  const existing = await codeHash(accountId);
  if (existing && existing !== NO_CODE) {
    console.log(`SKIP deploy ${accountId} (code_hash=${existing})`);
    return;
  }
  const acct = accountFromKey(accountKeyFile);
  const wasm = fs.readFileSync(wasmPath);
  const out = await acct.deployContract(new Uint8Array(wasm));
  console.log(`DEPLOYED ${accountId} tx=${out.transaction.hash} status=${JSON.stringify(out.status)}`);
}

(async () => {
  const owner = accountFromKey('owner.json');
  const ftWasm = path.join(ROOT, 'contract-ft', 'target', 'wasm32-unknown-unknown', 'release', 'ritualcoin_ft.wasm');
  const gateWasm = path.join(ROOT, 'contract-gate', 'target', 'wasm32-unknown-unknown', 'release', 'ritual_gate.wasm');

  await deployIfNeeded('ft-full.json', ACCOUNTS.ft, ftWasm);
  try {
    const out = await owner.callFunction({
      contractId: ACCOUNTS.ft,
      methodName: 'new_default_meta',
      args: { owner_id: ACCOUNTS.owner, total_supply: TOTAL_SUPPLY },
      gas: near.teraToGas('30'),
    });
    console.log('FT INIT ok:', JSON.stringify(out));
  } catch (e) {
    console.log('FT INIT skipped (already initialized?):', (e.message || '').slice(0, 120));
  }
  const meta = await viewCall(ACCOUNTS.ft, 'ft_metadata', {});
  console.log('ft_metadata:', JSON.stringify(meta));

  const gates = [
    { name: 'gate', keyFile: 'gate-full.json', id: ACCOUNTS.gate, start: 16 * 60, len: 240 },
    { name: 'gateoff', keyFile: 'gateoff-full.json', id: ACCOUNTS.gateoff, start: 3 * 60, len: 60 },
  ];
  for (const g of gates) {
    await deployIfNeeded(g.keyFile, g.id, gateWasm);
    try {
      const out = await owner.callFunction({
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
      console.log(`GATE ${g.name} INIT ok:`, JSON.stringify(out));
    } catch (e) {
      console.log(`GATE ${g.name} INIT skipped (already initialized?):`, (e.message || '').slice(0, 120));
    }
    const state = await viewCall(g.id, 'get_state', {});
    console.log(`GATE ${g.name} state:`, JSON.stringify(state));
  }
})().catch((e) => {
  console.error('ERR', (e.message || String(e)).slice(0, 400));
  process.exit(1);
});
