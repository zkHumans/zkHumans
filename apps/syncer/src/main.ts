import { Mina, PublicKey, fetchEvents } from 'snarkyjs';
import { createTRPCClient, trpcWait } from '@zkhumans/trpc-client';
import { IdentityManager } from '@zkhumans/contracts';

console.log('API_URL:', process.env['API_URL']);

// wait for API
const trpc = createTRPCClient(process.env['API_URL']);
const status = await trpcWait(trpc, 5, 3_000);
if (!status) process.exit(1);

// get zkApp info from API
const meta = await trpc.meta.query();
console.log('meta', meta);

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

const events = await fetchEvents({ publicKey: meta.address.IdentityManager });
console.log('events', events);

const zkAppAddress = PublicKey.fromBase58(meta.address.IdentityManager);
const zkApp = new IdentityManager(zkAppAddress);
console.log('IdentityManager @', meta.address.IdentityManager);

// ?: const networkState = Mina.getNetworkState();
// ?: console.log('networkState', networkState);

// X: // Enable graceful stop
// X: process.once('SIGINT', () => procMaster.stop());
// X: process.once('SIGTERM', () => procMaster.stop());
