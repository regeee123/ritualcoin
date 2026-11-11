const { ACCOUNTS, accountFromKey, viewCall, near } = require('../src/near');
(async () => {
  const alice = accountFromKey('alice-full.json');
  console.log('gate state:', JSON.stringify(await viewCall(ACCOUNTS.gate, 'get_state', {})));
  try {
    const out = await alice.callFunctionRaw({
      contractId: ACCOUNTS.ft, methodName: 'ft_transfer_call',
      args: { receiver_id: ACCOUNTS.gate, amount: (100n*10n**8n).toString(), memo: null, msg: JSON.stringify({ receiver: ACCOUNTS.bob, memo: 'probe' }) },
      deposit: 1n, gas: near.teraToGas('80'),
    });
    console.log('TX', out.transaction.hash, 'status', JSON.stringify(out.status));
    for (const r of out.receipts_outcome || []) {
      const st = r.outcome.status;
      if (st && st.Failure) console.log('RECEIPT FAILURE:', JSON.stringify(st.Failure).slice(0, 600));
      for (const log of r.outcome.logs || []) if (log.includes('RITUAL')) console.log('LOG:', log);
    }
  } catch (e) {
    console.log('THREW:', (e.message || String(e)).slice(0, 800));
  }
  console.log('gate state after:', JSON.stringify(await viewCall(ACCOUNTS.gate, 'get_state', {})));
  console.log('bob bal:', await viewCall(ACCOUNTS.ft, 'ft_balance_of', { account_id: ACCOUNTS.bob }));
  console.log('treasury bal:', await viewCall(ACCOUNTS.ft, 'ft_balance_of', { account_id: ACCOUNTS.treasury }));
})();
