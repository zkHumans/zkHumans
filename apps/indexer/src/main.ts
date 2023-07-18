import {
  Field,
  MerkleMap,
  Mina,
  PublicKey,
  UInt32,
  fetchAccount,
  fetchLastBlock,
} from 'snarkyjs';
import { ApiInputStorageSet, trpc, trpcWait } from '@zkhumans/trpc-client';
import {
  AuthNFactor,
  AuthNProvider,
  AuthNType,
  IdentityManager,
} from '@zkhumans/contracts';
import {
  EventStorageCommit,
  EventStorageCreate,
  EventStoragePending,
  eventStoreDefault,
} from '@zkhumans/zkkv';
import { IdentityClientUtils as IDUtils } from '@zkhumans/utils-client';
import { delay, hr } from '@zkhumans/utils';
import SuperJSON from 'superjson';
import crypto from 'crypto';

// simple hash for unique event identifier
// https://medium.com/@chris_72272/what-is-the-fastest-node-js-hashing-algorithm-c15c1a0e164e
const hash = (data: crypto.BinaryLike) =>
  crypto.createHash('sha1').update(data).digest('base64');

////////////////////////////////////
// configure from env
////////////////////////////////////
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
    ? UInt32.from(dbZkapp.blockLast)
    : undefined;

  ////////////////////////////////////
  // fetch the network's last block
  ////////////////////////////////////
  const { blockchainLength } = await fetchLastBlock(graphqlEndpoints.mina[0]);
  console.log('last network block:', blockchainLength.toBigint());

  // wait for blocks on the network
  if (startFetchEvents && startFetchEvents > blockchainLength) return;

  ////////////////////////////////////
  // fetch new events from the network
  ////////////////////////////////////
  const startFetch = startFetchEvents?.sub(1);
  console.log(`Fetching events ${startFetch} ⇾ ${blockchainLength}`);
  const events = await zkapp.fetchEvents(startFetch, blockchainLength);

  ////////////////////////////////////////////////////////////////////////
  // Record events in the database then retrieve to ensure order
  // Use a unique identifier for each event to ensure no-duplicate
  ////////////////////////////////////////////////////////////////////////
  for (const event of events) {
    // get a unique identifier for the event
    let id = '';
    if (event.type == 'storage:pending') {
      const js: any = SuperJSON.parse(SuperJSON.stringify(event.event.data));
      const es = EventStoragePending.fromJSON(js);
      id = hash(
        es.settlementChecksum.toString() +
          event.event.transactionInfo.transactionHash
      );
    } else {
      id = hash(event.event.transactionInfo.transactionHash);
    }

    const e = await trpc.event.byId.query({ id });
    if (!e) {
      await trpc.event.create.mutate({
        id,
        type: event.type,
        data: SuperJSON.stringify(event.event.data),
        transactionInfo: SuperJSON.stringify(event.event.transactionInfo),
        blockHeight: event.blockHeight.toBigint(),
        globalSlot: event.globalSlot.toBigint(),
      });

      // if zkapp's first block was unknown, use the first event's block
      if (!startFetchEvents) startFetchEvents = UInt32.from(event.blockHeight);
    }
  }

  ////////////////////////////////////////////////////////////////////////
  // process unprocessed events from the database
  ////////////////////////////////////////////////////////////////////////
  const eventsToProcess = await trpc.event.getUnprocessed.query();
  for (const event of eventsToProcess) {
    // TODO: a better way to access event data?
    const js: any = SuperJSON.parse(event.data?.toString() ?? '');
    console.log();
    console.log('Event:', js);

    switch (event.type) {
      case 'storage:create':
        {
          const es = EventStorageCreate.fromJSON(js);
          const x = await trpc.storage.create.mutate({
            key: es.key.toString(),
            value: es.value.toString(),
            meta: JSON.stringify(es.meta),
            isPending: false,
            commitmentSettled: es.value.toString(),
            event: { id: event.id },
            zkapp: { address: zkappAddress },
          });
          console.log('[storage:create] created store:', x);
        }
        break;

      case 'storage:pending':
        {
          const es = EventStoragePending.fromJSON(js);

          const storage: ApiInputStorageSet = {
            key: es.data1.getKey().toString(),
            value: es.data1.getValue().toString(),
            meta: JSON.stringify(es.data1.getMeta()),
            isPending: true,
            settlementChecksum: es.settlementChecksum.toString(),
            commitmentPending: es.commitmentPending.toString(),
            event: { id: event.id },
            storage: { key: es.id.toString() },
            zkapp: { address: zkappAddress },
          };

          // if the store commitment (value) equals first meta data
          if (es.data1.meta0.equals(es.data1.value).toBoolean()) {
            // set the remaining meta data as key:value data within the store.
            // This enables a store to be created with an initial key:value data.
            // Hack! Consider a better way.
            // Used when creating an Identity with an initial AuthNFactor Op Key
            // and only then...

            // create the store with default/empty meta data
            const x = await trpc.storage.set.mutate({
              ...storage,
              meta: JSON.stringify(eventStoreDefault.meta),
            });
            console.log('[storage:pending] (with data) created store:', x);

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
            const y = await trpc.storage.set.mutate({
              ...storage,
              key: es.data1.meta1.toString(),
              value: es.data1.meta2.toString(),
              meta: JSON.stringify(meta),
              storage: { key: storage.key },
            });
            console.log('[storage:pending] (with data) set data:', y);
          } else {
            const x = await trpc.storage.set.mutate(storage);
            console.log('[storage:pending] created store:', x);
          }
        }
        break;

      case 'storage:commit':
        {
          const es = EventStorageCommit.fromJSON(js);
          // ?: console.log('[storage:commit]');
        }
        break;
    }

    await trpc.event.markProcessed.mutate({ id: event.id });
  }

  ////////////////////////////////////////////////////////////////////////
  // after all events (or none for this cycle) are processed,
  // db-record the processed block heights
  ////////////////////////////////////////////////////////////////////////
  dbZkapp = await trpc.zkapp.update.mutate({
    address: zkappAddress,
    blockLast: blockchainLength.toBigint(),
    blockInit: dbZkapp.blockInit ? undefined : startFetchEvents?.toBigint(),
  });

  ////////////////////////////////////////////////////////////////////////
  // process pending (uncommitted) storage
  ////////////////////////////////////////////////////////////////////////
  const pendingStorage = await trpc.storage.pending.query();
  if (!pendingStorage.length) return;

  console.log();
  const zkappIdentifier = IDUtils.getManagerIdentfier(zkappPublicKey);
  const maps: { [key: string]: MerkleMap } = {};

  for (const ps of pendingStorage) console.log('Pending storage:', ps);

  // storage levels:
  // 1: primary storage, zkapp @state
  // 2: key:value (identifier:commitment) within level-1
  // 3: key:value within level-2

  // first process level-3 storage to update level-2
  for (const { key, value, storageKey: s } of pendingStorage) {
    // if storage (data) is not level-1 and not directly within it
    if (s && s !== zkappIdentifier) {
      // restore the level-2 MerkleMap from database (or create new if not exist)
      if (!maps[s]) maps[s] = await IDUtils.getStoredMerkleMap(s);
      // add level-3 K:V data to the level-2 MerkleMap
      maps[s].set(Field(key), Field(value));
    }
  }

  // then process level-2 storage updates to update level-1
  const mmMgr = await IDUtils.getManagerMM(zkappPublicKey);
  Object.keys(maps).forEach((k) => mmMgr.set(Field(k), maps[k].getRoot()));

  const commitmentPending = zkapp.commitment.get();
  const commitmentSettled = mmMgr.getRoot();
  console.log('zkapp.commitPendingTransformations');
  console.log('  commitmentPending:', commitmentPending.toBigInt());
  console.log('  commitmentSettled:', commitmentSettled.toBigInt());
};

const main = async () => {
  try {
    await loop();
    hr();

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
