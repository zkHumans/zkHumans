import {
  Field,
  MerkleMap,
  Mina,
  PrivateKey,
  PublicKey,
  fetchAccount,
  fetchLastBlock,
  Poseidon,
  CircuitString,
} from 'snarkyjs';
import { trpc, trpcWait } from '@zkhumans/trpc-client';
import { IdentityManager } from '@zkhumans/contracts';
import { IDUtils } from '@zkhumans/utils-client';
import { delay, graphqlEndpoints, hr } from '@zkhumans/utils';

////////////////////////////////////
// configure from env
////////////////////////////////////
const PROVER_CYCLE_TIME = 1000 * +(process.env['PROVER_CYCLE_TIME'] ?? 30);
const FEEPAYER_PRIVATEKEY = process.env['FEEPAYER_PRIVATEKEY'];
const ZKAPP_SECRET_AUTH = process.env['ZKAPP_SECRET_AUTH'];

if (!FEEPAYER_PRIVATEKEY) {
  console.log('ERROR: FEEPAYER_PRIVATEKEY not defined');
  process.exit(1);
}

if (!ZKAPP_SECRET_AUTH) {
  console.log('ERROR: ZKAPP_SECRET_AUTH not defined');
  process.exit(1);
}

console.log('API_URL           :', process.env['API_URL']);
console.log('PROVER_CYCLE_TIME :', PROVER_CYCLE_TIME);

////////////////////////////////////
// facilitate graceful stop
////////////////////////////////////
let STOP = false;
const stop = () => (STOP = true);
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());

////////////////////////////////////
// setup time logger
////////////////////////////////////
const t0 = performance.now();
const t = () => Number(((performance.now() - t0) / 1000 / 60).toFixed(2)) + 'm';
const log = (
  ...args: any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */
) => console.log(`@T+${t()} |`, ...args);

////////////////////////////////////
// wait for API
////////////////////////////////////
const status = await trpcWait(trpc, 5, 3_000);
if (!status) process.exit(1);

////////////////////////////////////
// get zkapp address from API
////////////////////////////////////
const meta = await trpc.meta.query();
console.log('API meta:', meta);

////////////////////////////////////
// configure Mina GraphQL endpoints
////////////////////////////////////
Mina.setActiveInstance(Mina.Network(graphqlEndpoints));

////////////////////////////////////
// init zkapp
////////////////////////////////////
const zkappAddress = meta.address.IdentityManager;
const zkappPublicKey = PublicKey.fromBase58(zkappAddress);
const zkapp = new IdentityManager(zkappPublicKey);
const zkappIdentifier = IDUtils.getManagerIdentfier(zkappPublicKey);
console.log('IdentityManager @', meta.address.IdentityManager);

////////////////////////////////////
// compile contract
////////////////////////////////////
log('compile SmartContract...');
const { verificationKey } = await IdentityManager.compile();
log('...compile SmartContract');

////////////////////////////////////
// init authToken
////////////////////////////////////
const authToken = Poseidon.hash(
  CircuitString.fromString(ZKAPP_SECRET_AUTH).toFields()
);

////////////////////////////////////
// ensure accounts exist on network
////////////////////////////////////
async function ensureAccountExists(publicKey: PublicKey, label: string) {
  const { account, error } = await fetchAccount(
    { publicKey },
    graphqlEndpoints.mina[0]
  );
  if (!account) {
    console.log(`Failed to fetch ${label} account. Error:`, error.statusText);
    process.exit(1);
  }
}

const feepayerPrivateKey = PrivateKey.fromBase58(FEEPAYER_PRIVATEKEY);
const feepayerPublicKey = feepayerPrivateKey.toPublicKey();
await ensureAccountExists(feepayerPublicKey, 'feepayer');
await ensureAccountExists(zkappPublicKey, 'zkapp');

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

  // wait for state transformations in progress
  const z = await trpc.zkapp.byAddress.query({ address: zkappAddress });
  if (z && z.isTransforming) {
    log('Transformation in progress, waiting...');
    return false;
  }

  // fetch the network's last block
  const { blockchainLength } = await fetchLastBlock(graphqlEndpoints.mina[0]);
  log('last network block:', blockchainLength.toBigint());

  ////////////////////////////////////////////////////////////////////////
  // process pending (uncommitted) storage
  ////////////////////////////////////////////////////////////////////////
  const pendingStorage = await trpc.storage.pending.query();
  if (!pendingStorage.length) return false;

  console.log();
  const maps: { [key: string]: MerkleMap } = {};

  let commitmentPending = zkapp.commitment.get();
  for (const ps of pendingStorage) {
    log('Pending storage:', ps);

    // Note: 2027-07: For unknown reason, zkapp.commitment.get() is not
    // returning current state when it changes, even with new, so get it
    // from pending storage which should all have the same value.
    // TODO: further investigation for such behavior
    if (ps.commitmentPending) commitmentPending = Field(ps.commitmentPending);
  }

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

  // get the old and new commitments (roots)
  const commitmentSettled = mmMgr.getRoot();
  console.log('zkapp.commitPendingTransformations');
  console.log('  commitmentPending:', commitmentPending.toBigInt());
  console.log('  commitmentSettled:', commitmentSettled.toBigInt());

  // send transaction to zkapp to commit pending transformations
  log('Sending txn...');
  const tx = await Mina.transaction(
    { sender: feepayerPublicKey, fee: 100_000_000 },
    () => {
      zkapp.commitPendingXforms(
        authToken,
        commitmentPending,
        commitmentSettled
      );
    }
  );
  await tx.prove();
  tx.sign([feepayerPrivateKey]);

  const res = await tx.send();
  const hash = res.hash();
  if (!hash) throw new Error('Transaction send failed:' + tx.toPretty());
  log('...txn sent:', 'https://berkeley.minaexplorer.com/transaction/' + hash);

  // mark zkapp as transforming
  await trpc.zkapp.update.mutate({
    address: zkappAddress,
    isTransforming: true,
  });

  log('waiting for txn...');
  try {
    await res.wait();
  } catch (err: any) {
    console.log(err.message);
  }
  log('...waiting for txn');

  return true;
};

const main = async () => {
  try {
    const r = await loop();
    hr();

    if (STOP) {
      console.log('Exiting upon request');
      process.exit(0);
    }

    // only wait if did not wait for a txn
    if (!r) await delay(PROVER_CYCLE_TIME);
  } catch (e) {
    console.log('Exiting to restart:', e);
    process.exit(1);
  }
  await main();
};

await main();
