'use strict';
// Shared NEAR testnet helpers for RitualCoin (same pattern as AgentLeash).
// Keys live in .keys/*.json (chmod 600) and are never printed.
const fs = require('fs');
const path = require('path');
const near = require('near-api-js');

const ROOT = path.join(__dirname, '..');
const KEYS_DIR = path.join(ROOT, '.keys');

const ACCOUNTS = {
  owner: 'ritualcoin2026.testnet',
  ft: 'ft.ritualcoin2026.testnet',
  gate: 'gate.ritualcoin2026.testnet',
  gateoff: 'gateoff.ritualcoin2026.testnet',
  alice: 'alice.ritualcoin2026.testnet',
  bob: 'bob.ritualcoin2026.testnet',
  treasury: 'treasury.ritualcoin2026.testnet',
};

function provider() {
  return new near.JsonRpcProvider({ url: 'https://rpc.testnet.near.org' });
}

function loadKeyPair(keyFile) {
  const raw = JSON.parse(fs.readFileSync(path.join(KEYS_DIR, keyFile), 'utf8'));
  const secret = raw.private_key || raw.secret_key;
  if (!secret) throw new Error(`No private key in ${keyFile}`);
  return { keyPair: near.KeyPair.fromString(secret), accountId: raw.account_id };
}

function accountFromKey(keyFile, accountIdOverride) {
  const { keyPair, accountId } = loadKeyPair(keyFile);
  const signer = new near.KeyPairSigner(keyPair);
  return new near.Account(accountIdOverride || accountId, provider(), signer);
}

function saveKey(keyFile, accountId, keyPair) {
  const p = path.join(KEYS_DIR, keyFile);
  fs.writeFileSync(
    p,
    JSON.stringify(
      { account_id: accountId, public_key: keyPair.getPublicKey().toString(), private_key: keyPair.toString() },
      null,
      2
    ),
    { mode: 0o600 }
  );
  fs.chmodSync(p, 0o600);
}

async function viewCall(contractId, methodName, args = {}, tries = 4) {
  const argsBase64 = Buffer.from(JSON.stringify(args)).toString('base64');
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch('https://rpc.testnet.near.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'q',
          method: 'query',
          params: {
            request_type: 'call_function',
            finality: 'final',
            account_id: contractId,
            method_name: methodName,
            args_base64: argsBase64,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300));
      const text = Buffer.from(j.result.result).toString('utf8');
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

module.exports = { near, ACCOUNTS, KEYS_DIR, ROOT, provider, accountFromKey, loadKeyPair, saveKey, viewCall };
