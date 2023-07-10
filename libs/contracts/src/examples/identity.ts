import {
  AccountUpdate,
  CircuitString,
  Field,
  MerkleMap,
  Mina,
  Poseidon,
  PrivateKey,
} from 'snarkyjs';
import {
  AuthNFactor,
  AuthNProvider,
  AuthNType,
  Identity,
  IdentityManager,
} from '../IdentityManager';
import { Identifier, strToBool } from '@zkhumans/utils';
import {
  EventStore,
  EventStorePending,
  eventStoreDefault,
} from '@zkhumans/zkkv';

import type { AuthNFactorData, AuthNFactorProtocol } from '../IdentityManager';

////////////////////////////////////////////////////////////////////////
// set config from env
////////////////////////////////////////////////////////////////////////

const proofsEnabled = strToBool(process.env['ZK_PROOFS_ENABLED']) ?? true;
console.log('ZK_PROOFS_ENABLED:', proofsEnabled);

////////////////////////////////////////////////////////////////////////
// lil utilities
////////////////////////////////////////////////////////////////////////

// performance logging
const t0 = performance.now();
const t = () => Number(((performance.now() - t0) / 1000 / 60).toFixed(2)) + 'm';
const log = (
  ...args: any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */
) => console.log(`@T+${t()} |`, ...args);

if (proofsEnabled) {
  log('compile SmartContract...');
  await IdentityManager.compile();
  log('...compile SmartContract');
}

// log a spacer on the console between transactions
const hr = () =>
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );

// celebrate success!
const tada = () => {
  console.log();
  console.log('🚀🚀🚀 Works! 🚀🚀🚀');
  process.exit(0);
};

class StorageSimulator {
  maps: { [key: string]: MerkleMap };
  pending: Array<EventStorePending>;
  constructor() {
    this.maps = {};
    this.pending = [];
  }
  getRoot(identifier: Field): string {
    return this.maps[identifier.toString()].getRoot().toString();
  }
}

////////////////////////////////////////////////////////////////////////
// go!
////////////////////////////////////////////////////////////////////////

const Local = Mina.LocalBlockchain({ proofsEnabled });
Mina.setActiveInstance(Local);

const feePayer = Local.testAccounts[0].publicKey;
const feePayerKey = Local.testAccounts[0].privateKey;

const pk = 'EKDwdC7UV4D6Nxx9PM3PiTQJmEYZWiqxR4fgbH7zHHhKnTAjKWDt';
// const zkappKey = PrivateKey.random();
const zkappKey = PrivateKey.fromBase58(pk);
const zkappAddress = zkappKey.toPublicKey();

// Create 4 Identity Keyring Merkle Maps
const idKeyringMerkleMaps: Array<MerkleMap> = [];
for (let i = 0; i < 4; i++) idKeyringMerkleMaps[i] = new MerkleMap();

Identifier.fromPublicKey(Local.testAccounts[0].publicKey, 1).toField();

// Create 4 identities
const aliceID = new Identity({
  identifier: Identifier.fromPublicKey(
    Local.testAccounts[0].publicKey,
    1
  ).toField(),
  commitment: idKeyringMerkleMaps[0].getRoot(),
});
const bobID = new Identity({
  identifier: Identifier.fromPublicKey(
    Local.testAccounts[1].publicKey,
    1
  ).toField(),
  commitment: idKeyringMerkleMaps[1].getRoot(),
});
const charlieID = new Identity({
  identifier: Identifier.fromPublicKey(
    Local.testAccounts[2].publicKey,
    1
  ).toField(),
  commitment: idKeyringMerkleMaps[2].getRoot(),
});
const darcyID = new Identity({
  identifier: Identifier.fromPublicKey(
    Local.testAccounts[3].publicKey,
    1
  ).toField(),
  commitment: idKeyringMerkleMaps[3].getRoot(),
});

const Alice = aliceID.identifier;
const Bob = bobID.identifier;
// const Charlie = charlieID.identity;
const Darcy = darcyID.identifier;

// Create an Identity Manager Merkle Map
// And add 2 identities initially
const idManagerMerkleMap = new MerkleMap();
idManagerMerkleMap.set(Alice, aliceID.commitment);
idManagerMerkleMap.set(Bob, bobID.commitment);

// set initial MM to confirm restoration from contract events later
const initialIdManagerMM = new MerkleMap();
initialIdManagerMM.set(Alice, aliceID.commitment);
initialIdManagerMM.set(Bob, bobID.commitment);

// setup storage simulation
const storageRunner = new StorageSimulator(); // for computing proposed state transformations
const storage = new StorageSimulator(); // simulates storage and event-processing indexer

// simulate the zkApp itself as an Identity
// to conform its off-chain storage mechanics
const zkappIdentifier = Identifier.fromPublicKey(zkappAddress, 1).toField();
storageRunner.maps[zkappIdentifier.toString()] = new MerkleMap();
const zkappIdentity = new Identity({
  identifier: zkappIdentifier,
  commitment: storageRunner.maps[zkappIdentifier.toString()].getRoot(),
});
const initStoreIdentifier = zkappIdentity.identifier;
const initStoreCommitment = zkappIdentity.commitment;
console.log('init storage identifier :', initStoreIdentifier.toString());
console.log('init storage commitment :', initStoreCommitment.toString());

// setup auth
const authStr = 'S0meth1ngS3cr3t';
const authToken = Poseidon.hash(CircuitString.fromString(authStr).toFields());
const authHash = Poseidon.hash([authToken]);

////////////////////////////////////////////////////////////////////////
// deploy
////////////////////////////////////////////////////////////////////////
hr();
log('Deploying IdentityManager...');
const zkapp = new IdentityManager(zkappAddress);
const tx = await Mina.transaction(feePayer, () => {
  AccountUpdate.fundNewAccount(feePayer);
  zkapp.deploy({ zkappKey });

  // set initial storage identifier, root, and authHash
  zkapp.identifier.set(initStoreIdentifier);
  zkapp.commitment.set(initStoreCommitment);
  zkapp.authHash.set(authHash);

  // notify off-chain storage
  zkapp.emitEvent('store:new', {
    ...eventStoreDefault,
    id: initStoreIdentifier,
    root1: initStoreCommitment,
  });
});
await tx.prove();
await tx.sign([feePayerKey]).send();
log('...Deploying IdentityManager');

// count events processed to show them sequentually
let numEvents = 0;
numEvents = await processEvents(numEvents);

////////////////////////////////////////////////////////////////////////
// more helpers
////////////////////////////////////////////////////////////////////////
const logRoots = () => {
  log('  storageRunner :', storageRunner.getRoot(zkappIdentifier));
  log('  storage       :', storage.getRoot(zkappIdentifier));
  log('  zkapp         :', zkapp.commitment.get().toString());
};

////////////////////////////////////////////////////////////////////////
// Add Identities as Pending
////////////////////////////////////////////////////////////////////////

hr();
log('addIdentity Alice...');
await addIdentity(storageRunner.maps[zkappIdentifier.toString()], aliceID);
log('...addIdentity Alice');
numEvents = await processEvents(numEvents);

hr();
log('addIdentity Bob...');
await addIdentity(storageRunner.maps[zkappIdentifier.toString()], bobID);
log('...addIdentity Bob');
numEvents = await processEvents(numEvents);

////////////////////////////////////////////////////////////////////////
// commit pending storage events
////////////////////////////////////////////////////////////////////////
hr();
log('commit pending store events...');
logRoots();
{
  // update storage runner, to get the next commitment
  for (const pe of storage.pending) {
    const i = pe.id.toString();
    if (!storageRunner.maps[i]) storageRunner.maps[i] = new MerkleMap();
    storageRunner.maps[i].set(pe.data1.getKey(), pe.data1.getValue());
  }

  const commitmentPending = zkapp.commitment.get();
  const commitmentSettled =
    storageRunner.maps[zkappIdentifier.toString()].getRoot();
  log('  tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.commitPendingTransformationsWithAuthToken(
      authToken,
      commitmentPending,
      commitmentSettled
    );
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log('  ...tx: prove() sign() send()');
}
logRoots();
log('...commit pending store events');

numEvents = await processEvents(numEvents);
logRoots();

/*
hr();
log('addIdentity Charlie...');
await addIdentity(storageRunner.maps[zkappIdentifier.toString()], charlieID);
log('...addIdentity Charlie');
numEvents = await processEvents(numEvents);

hr();
log('addIdentity Darcy...');
await addIdentity(storageRunner.maps[zkappIdentifier.toString()], darcyID);
log('...addIdentity Darcy');
numEvents = await processEvents(numEvents);
*/

////////////////////////////////////////////////////////////////////////
// WIP
////////////////////////////////////////////////////////////////////////
tada();

////////////////////////////////////////////////////////////////////////
// Personal Identity Keyring Management
////////////////////////////////////////////////////////////////////////

const salt = 'uniqueTotheZkapp';

console.log();
log('addAuthNFactor Alice...');
await addAuthNFactor(
  idManagerMerkleMap,
  idKeyringMerkleMaps[0],
  aliceID,
  { type: AuthNType.operator, provider: AuthNProvider.self, revision: 0 },
  { salt, secret: 'secretCode' }
);
log('...addAuthNFactor Alice');

console.log();
log('addAuthNFactor Darcy...');
await addAuthNFactor(
  idManagerMerkleMap,
  idKeyringMerkleMaps[3],
  darcyID,
  { type: AuthNType.operator, provider: AuthNProvider.self, revision: 0 },
  { salt, secret: 'XXXXXXXXXX' }
);
log('...addAuthNFactor Darcy');

////////////////////////////////////////////////////////////////////////
// Smart Contract Events
////////////////////////////////////////////////////////////////////////

const events = await zkapp.fetchEvents();

console.log();
log('Process Events...');
console.log('MM 1:', idManagerMerkleMap.getRoot().toString());
console.log('MM 2:', initialIdManagerMM.getRoot().toString());

for (const event of events) {
  switch (event.type) {
    case 'store:new':
      {
        // TODO: a better way to access event data?
        const js = JSON.parse(JSON.stringify(event.event.data));
        console.log('Event: store:new', js);

        // off-chain storage should create the record
      }
      break;

    case 'store:set':
      {
        const js = JSON.parse(JSON.stringify(event.event.data));
        console.log('Event: store:set', js);
        const ev = EventStore.fromJSON(js);

        // add to the MM
        if (ev.root0.equals(initialIdManagerMM.getRoot()).toBoolean()) {
          initialIdManagerMM.set(ev.key, ev.value);
          const s = ev.root1.equals(initialIdManagerMM.getRoot()).toBoolean();
          console.log(s ? '✅' : '❌', 'MerkleMap set from event');
        }

        // off-chain storage should set the record
      }
      break;
  }
}

console.log('MM 1:', idManagerMerkleMap.getRoot().toString());
console.log('MM 2:', initialIdManagerMM.getRoot().toString());

// check to confirm sync of MMs
const witness1 = idManagerMerkleMap.getWitness(Darcy);
const witness2 = initialIdManagerMM.getWitness(Darcy);
witness1.assertEquals(witness2);
log('...Process Events');

////////////////////////////////////////////////////////////////////////
// helper functions
////////////////////////////////////////////////////////////////////////

/**
 * Process events emitted by the zkApp SmartContract.
 *
 * Use offset param and returned counter output
 * to processEvents sequentually after each txn.
 */
async function processEvents(offset = 0, checkStorage = true) {
  let counter = 0;

  const events = await zkapp.fetchEvents();

  log('Process Events...');
  // ?: console.log('MM 1:', storeManagerMerkleMap.getRoot().toString());
  // ?: console.log('MM 2:', initialManagerMM.getRoot().toString());

  for (const event of events) {
    // skip already processed events
    if (counter++ < offset) continue;

    // TODO: a better way to access event data?
    const js = JSON.parse(JSON.stringify(event.event.data));
    console.log(`Event: ${event.type}`, js);

    switch (event.type) {
      case 'store:new':
        {
          // off-chain storage should create the record
          const ev = EventStore.fromJSON(js);
          storage.maps[ev.id.toString()] = new MerkleMap();
        }
        break;

      case 'store:set':
        {
          // off-chain storage should set the record

          const ev = EventStore.fromJSON(js);

          // ?: // add to the MM
          // ?: if (ev.root0.equals(initialManagerMM.getRoot()).toBoolean()) {
          // ?:   initialManagerMM.set(ev.key, ev.value);
          // ?:   const s = ev.root1.equals(initialManagerMM.getRoot()).toBoolean();
          // ?:   console.log(s ? '✅' : '❌', 'MerkleMap set from event');
          // ?: }
        }
        break;

      case 'store:pending':
        {
          // off-chain storage should create the record as pending
          storage.pending.push(EventStorePending.fromJSON(js));
        }
        break;

      case 'store:commit':
        {
          // off-chain storage should update pending records
          for (const pe of storage.pending) {
            const i = pe.id.toString();
            if (!storage.maps[i]) storage.maps[i] = new MerkleMap();
            storage.maps[i].set(pe.data1.getKey(), pe.data1.getValue());
          }
        }
        break;
    }
  }

  // ?: console.log('MM 1:', storeManagerMerkleMap.getRoot().toString());
  // ?: console.log('MM 2:', initialManagerMM.getRoot().toString());

  // check to confirm sync of MMs
  // ?: if (checkStorage) {
  // ?:   const witness1 = storeManagerMerkleMap.getWitness(stores[3].getKey());
  // ?:   const witness2 = initialManagerMM.getWitness(stores[3].getKey());
  // ?:   witness1.assertEquals(witness2);
  // ?: }

  log('...Process Events');

  return counter;
}

async function addIdentity(idManagerMM: MerkleMap, identity: Identity) {
  // prove the identifier IS NOT in the Identity Manager MT
  const witness = idManagerMM.getWitness(identity.identifier);

  log('  tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.addIdentity(identity, witness);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log('  ...tx: prove() sign() send()');

  // don't do this, cuz added as pending
  // X: // if tx was successful, we can update our off-chain storage
  // X: idManagerMM.set(identity.identifier, identity.commitment);
  // X: log('  idManagerMM root :', idManagerMM.getRoot().toString());
  // X: log('  zkapp root       :', zkapp.commitment.get().toString());
  // X: zkapp.commitment.get().assertEquals(idManagerMM.getRoot());
}

async function addAuthNFactor(
  idManagerMM: MerkleMap,
  idKeyringMM: MerkleMap,
  identity: Identity,
  afProtocol: AuthNFactorProtocol,
  afData: AuthNFactorData
) {
  // prove the identifier IS in the Identity Manager MT
  const witnessManager = idManagerMM.getWitness(identity.identifier);

  const authNFactor = new AuthNFactor({
    protocol: {
      type: Field(afProtocol.type),
      provider: Field(afProtocol.provider),
      revision: Field(afProtocol.revision),
    },
    data: {
      salt: CircuitString.fromString(afData.salt),
      secret: CircuitString.fromString(afData.secret),
    },
  });

  const authNFactor_key = authNFactor.getKey();

  // prove the AuthNFactor IS NOT in the Identity Keyring MT
  const witnessKeyring = idKeyringMM.getWitness(authNFactor_key);
  log('  ...idKeyringMM.getWitness()');

  const id0 = identity;

  idKeyringMM.set(authNFactor_key, authNFactor.getValue());
  const id1 = id0.setCommitment(idKeyringMM.getRoot());

  log('  tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.addAuthNFactor(authNFactor, id0, id1, witnessManager, witnessKeyring);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log('  ...tx: prove() sign() send()');

  // if tx was successful, we can update our off-chain storage
  idManagerMM.set(id1.toUnitOfStore().key, id1.toUnitOfStore().value);
  log('  idManagerMM root :', idManagerMM.getRoot().toString());
  log('  zkapp root       :', zkapp.commitment.get().toString());
  zkapp.commitment.get().assertEquals(idManagerMM.getRoot());
}

tada();
