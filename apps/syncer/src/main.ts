import { Mina, PublicKey } from 'snarkyjs';
import { createTRPCClient, trpcWait } from '@zkhumans/trpc-client';
import { IdentityManager } from '@zkhumans/contracts';
import { delay } from '@zkhumans/utils';

console.log('API_URL:', process.env['API_URL']);

const SYNCER_CYCLE_TIME = +(process.env['SYNCER_CYCLE_TIME'] ?? 30_000);

// wait for API
const trpc = createTRPCClient(process.env['API_URL']);
const status = await trpcWait(trpc, 5, 3_000);
if (!status) process.exit(1);

// get zkApp info from API
const meta = await trpc.meta.query();
console.log('meta', meta);

// configure Mina GraphQL endpoints
const Network = Mina.Network({
  mina: [
    'https://proxy.berkeley.minaexplorer.com/graphql',
    'https://api.minascan.io/node/berkeley/v1/graphql',
  ],
  archive: [
    'https://archive.berkeley.minaexplorer.com/',
    'https://api.minascan.io/archive/berkeley/v1/graphql/',
  ],
});
Mina.setActiveInstance(Network);

// init zkApp
const zkAppAddress = PublicKey.fromBase58(meta.address.IdentityManager);
const zkApp = new IdentityManager(zkAppAddress);
console.log('IdentityManager @', meta.address.IdentityManager);

const syncEvents = async () => {
  console.log('Syncing events...');
  const events = await zkApp.fetchEvents();
  console.log(
    `events on ${zkApp.address.toBase58()}`,
    events.map((e) => ({ type: e.type, data: JSON.stringify(e.event) }))
  );
};

// todo: what is zkApp.account.zkappUri ?

const loop = async () => {
  try {
    // ensure API (service + database) availability
    const r = await trpc.health.check.query();
    if (r !== 1) throw new Error('API unavailable');

    // restart if zkApp address changes (re-deployed), according to API
    const { address } = await trpc.meta.query();
    if (meta.address.IdentityManager !== address.IdentityManager)
      throw new Error('IdentityManager address changed');

    await syncEvents();

    await delay(SYNCER_CYCLE_TIME);
  } catch (e) {
    console.log('Exiting to restart:', e);
    process.exit(1);
  }
  await loop();
};

await loop();

// ?: const networkState = Mina.getNetworkState();
// ?: console.log('networkState', networkState);

// X: // Enable graceful stop
// X: process.once('SIGINT', () => procMaster.stop());
// X: process.once('SIGTERM', () => procMaster.stop());
