const { ACCOUNTS, accountFromKey, near } = require('../src/near');
(async () => {
  const owner = accountFromKey('owner.json');
  const out = await owner.signAndSendTransaction({ receiverId: ACCOUNTS.alice, actions: [near.actions.transfer(near.nearToYocto('0.95'))] });
  console.log(`TOPUP alice +0.95 NEAR tx=${out.transaction.hash}`);
})().catch(e => { console.error('ERR', (e.message||'').slice(0,200)); process.exit(1); });
