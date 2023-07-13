import {
  Mina,
  PublicKey,
  UInt32,
  fetchAccount,
  fetchLastBlock,
} from 'snarkyjs';
import { trpc, trpcWait } from '@zkhumans/trpc-client';
import {
  AuthNFactor,
  AuthNProvider,
  AuthNType,
  IdentityManager,
} from '@zkhumans/contracts';
import {
  EventStore,
  EventStoreCommit,
  EventStorePending,
  eventStoreDefault,
} from '@zkhumans/zkkv';
import { delay } from '@zkhumans/utils';

const INDEXER_CYCLE_TIME = 1000 * +(process.env['INDEXER_CYCLE_TIME'] ?? 30);
const ZKAPP_SECRET_AUTH = process.env['ZKAPP_SECRET_AUTH'];

if (!ZKAPP_SECRET_AUTH) {
  console.log('ERROR: ZKAPP_SECRET_AUTH not defined');
  process.exit(1);
}

console.log('API_URL            :', process.env['API_URL']);
console.log('INDEXER_CYCLE_TIME :', INDEXER_CYCLE_TIME);

////////////////////////////////////
// facilitate graceful stop
////////////////////////////////////
let STOP = false;
const stop = () => (STOP = true);
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());

////////////////////////////////////
// wait for API
////////////////////////////////////
const status = await trpcWait(trpc, 5, 3_000);
if (!status) process.exit(1);

////////////////////////////////////
// get zkapp info from API
////////////////////////////////////
const meta = await trpc.meta.query();
console.log('meta', meta);

////////////////////////////////////
// configure Mina GraphQL endpoints
////////////////////////////////////
const graphqlEndpoints = {
  mina: [
    'https://proxy.berkeley.minaexplorer.com/graphql',
    'https://api.minascan.io/node/berkeley/v1/graphql',
  ],
  archive: [
    'https://archive.berkeley.minaexplorer.com/',
    'https://api.minascan.io/archive/berkeley/v1/graphql/',
  ],
};
Mina.setActiveInstance(Mina.Network(graphqlEndpoints));

////////////////////////////////////
// init zkapp
////////////////////////////////////
const zkappAddress = meta.address.IdentityManager;
const zkappPublicKey = PublicKey.fromBase58(zkappAddress);
const zkapp = new IdentityManager(zkappPublicKey);
console.log('IdentityManager @', meta.address.IdentityManager);

////////////////////////////////////
// fetch zkapp from network
////////////////////////////////////
const { account, error } = await fetchAccount(
  { publicKey: zkappPublicKey },
  graphqlEndpoints.mina[0]
);
if (!account) {
  console.log('Failed to fetch account. Error:', error.statusText);
  process.exit(1);
}

////////////////////////////////////////////////////////////////////////
// process loop; run every cycle
////////////////////////////////////////////////////////////////////////
const loop = async () => {
  // ensure API (service + database) availability
  const r = await trpc.health.check.query();
  if (r !== 1) throw new Error('API unavailable');

  // restart if zkapp address changes (re-deployed), according to API
  const { address } = await trpc.meta.query();
  if (meta.address.IdentityManager !== address.IdentityManager)
    throw new Error('zkapp address changed');

  // fetch zkapp from database, create if not exist
  let dbZkapp = await trpc.zkapp.byAddress.query({ address: zkappAddress });
  if (!dbZkapp)
    dbZkapp = await trpc.zkapp.create.mutate({ address: zkappAddress });

  ////////////////////////////////////
  // start the event fetch:
  // from the last db-recorded block
  // or start from the "beginning"
  ////////////////////////////////////
  let startFetchEvents = dbZkapp.blockLast
    ? UInt32.from(dbZkapp.blockLast).add(1)
    : undefined;

  ////////////////////////////////////
  // fetch events to the network's last block
  ////////////////////////////////////
  const { blockchainLength } = await fetchLastBlock(graphqlEndpoints.mina[0]);
  console.log('last network block:', blockchainLength.toBigint());

  // wait for blocks on the network as needed
  // (consider increasing INDEXER_CYCLE_TIME)
  if (startFetchEvents > blockchainLength) return;

  ////////////////////////////////////
  // fetch and process events
  ////////////////////////////////////
  console.log(`Fetching events ${startFetchEvents} ⇾ ${blockchainLength}`);
  const events = await zkapp.fetchEvents(startFetchEvents, blockchainLength);
  for (const event of events) {
    const globalSlot = event.globalSlot.toBigint();
    const blockHeight = event.blockHeight.toBigint();

    // if zkapp's first block was unknown, use the first event's block
    if (!startFetchEvents) startFetchEvents = UInt32.from(blockHeight);

    // TODO: a better way to access event data?
    const js = JSON.parse(JSON.stringify(event.event.data));
    console.log('Event:', js);

    switch (event.type) {
      // off-chain storage: create store
      case 'store:new':
        {
          const es = EventStore.fromJSON(js);

          // if the store commitment (key) equals first meta data
          if (es.meta[0].equals(es.root1).toBoolean()) {
            // set the remaining meta data as key:value data within the store.
            // This enables a store to be created with an initial key:value data.
            // Hack! Consider a better way.
            // Used when creating an Identity with an initial AuthNFactor Op Key
            // and only then...

            // create the store with default/empty meta data
            const x = await trpc.store.create.mutate({
              identifier: es.id.toString(),
              commitment: es.root1.toString(),
              meta: JSON.stringify(eventStoreDefault.meta),
              zkapp: { address: zkappAddress },
            });
            console.log('[store:new] (with data) created store:', x);

            // create an AF of type Operator Key to get it's meta
            const af = AuthNFactor.init({
              protocol: {
                type: AuthNType.operator,
                provider: AuthNProvider.zkhumans,
                revision: 0,
              },
              data: { salt: '', secret: '' }, // !matters
            });
            const meta = af.toUnitOfStore().getMeta();

            // set store data from the meta data
            const y = await trpc.store.set.mutate({
              store: {
                identifier: es.id.toString(),
              },
              key: es.meta[1].toString(),
              value: es.meta[2].toString(),
              meta: JSON.stringify(meta),
            });
            console.log('[store:new] (with data) set data:', y);
          } else {
            const x = await trpc.store.create.mutate({
              identifier: es.id.toString(),
              commitment: es.root1.toString(),
              meta: JSON.stringify(es.meta),
              zkapp: { address: zkappAddress },
            });
            console.log('[store:new] created store:', x);
          }
        }
        break;

      // off-chain storage: set (create or update) the record
      case 'store:set':
        {
          const es = EventStore.fromJSON(js);
          const x = await trpc.store.set.mutate({
            store: { identifier: es.id.toString() },
            key: es.key.toString(),
            value: es.value.toString(),
            meta: JSON.stringify(es.meta),
            blockHeight,
            globalSlot,
          });
          console.log('[store:set] create or update key:value:', x);
        }
        break;

      // off-chain storage: create pending record
      case 'store:pending':
        {
          const es = EventStorePending.fromJSON(js);
          // ?: const x = await trpc.store.set.mutate({
          // ?:   store: { id: es.id.toString() },
          // ?:   key: es.key.toString(),
          // ?:   value: es.value.toString(),
          // ?:   meta: JSON.stringify(es.meta),
          // ?:   isPending: true,
          // ?:   // commitmentPending:
          // ?: });
          // ?: console.log('[store:set] create or update key:value:', x);
        }
        break;

      // off-chain storage: create pending record
      case 'store:commit':
        {
          const es = EventStoreCommit.fromJSON(js);
          // ?: const x = await trpc.store.set.mutate({
          // ?:   store: { id: es.id.toString() },
          // ?:   key: es.key.toString(),
          // ?:   value: es.value.toString(),
          // ?:   meta: JSON.stringify(es.meta),
          // ?:   isPending: true,
          // ?:   // commitmentPending:
          // ?: });
          // ?: console.log('[store:set] create or update key:value:', x);
        }
        break;
    }
  }

  // after all events (or none for this cycle) are processed
  // db-record the processed block heights
  dbZkapp = await trpc.zkapp.update.mutate({
    address: zkappAddress,
    blockLast: blockchainLength.toBigint(),
    blockInit: dbZkapp.blockInit ? undefined : startFetchEvents.toBigint(),
  });
};

const main = async () => {
  try {
    await loop();
    console.log();

    if (STOP) {
      console.log('Exiting upon request');
      process.exit(0);
    }

    await delay(INDEXER_CYCLE_TIME);
  } catch (e) {
    console.log('Exiting to restart:', e);
    process.exit(1);
  }
  await main();
};

await main();
