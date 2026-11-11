const { ACCOUNTS, accountFromKey, near } = require('../src/near');
(async () => {
  const owner = accountFromKey('owner.json');
  for (const [id, amt] of [[ACCOUNTS.ft, '1.5'], [ACCOUNTS.gate, '0.5'], [ACCOUNTS.gateoff, '0.5']]) {
    const out = await owner.signAndSendTransaction({ receiverId: id, actions: [near.actions.transfer(near.nearToYocto(amt))] });
    console.log(`TOPUP ${id} +${amt} NEAR tx=${out.transaction.hash}`);
  }
})().catch(e => { console.error('ERR', (e.message||'').slice(0,200)); process.exit(1); });
