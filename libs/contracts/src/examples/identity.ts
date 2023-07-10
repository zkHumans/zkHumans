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
  logMapKeys(label = '') {
    console.log(label, 'storage maps identifiers:');
    Object.keys(this.maps).forEach((k) => console.log(` ${k}`));
  }
}

////////////////////////////////////////////////////////////////////////
// go!
////////////////////////////////////////////////////////////////////////

const Local = Mina.LocalBlockchain({ proofsEnabled });
Mina.setActiveInstance(Local);

const feePayer = Local.testAccounts[0].publicKey;
const feePayerKey = Local.testAccounts[0].privateKey;

const zkappKey = PrivateKey.random();
const zkappAddress = zkappKey.toPublicKey();

const emptyMMRoot = new MerkleMap().getRoot();

// create identities
const Alice = new Identity({
  identifier: Identifier.fromPublicKey(
    Local.testAccounts[0].publicKey,
    1
  ).toField(),
  commitment: emptyMMRoot,
});
const Bob = new Identity({
  identifier: Identifier.fromPublicKey(
    Local.testAccounts[1].publicKey,
    1
  ).toField(),
  commitment: emptyMMRoot,
});
// const Charlie = new Identity({
//   identifier: Identifier.fromPublicKey(
//     Local.testAccounts[2].publicKey,
//     1
//   ).toField(),
//   commitment: emptyMMRoot,
// });
// const Darcy = new Identity({
//   identifier: Identifier.fromPublicKey(
//     Local.testAccounts[3].publicKey,
//     1
//   ).toField(),
//   commitment: emptyMMRoot,
// });

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
await addIdentity(storageRunner.maps[zkappIdentifier.toString()], Alice);
log('...addIdentity Alice');
numEvents = await processEvents(numEvents);

hr();
log('addIdentity Bob...');
await addIdentity(storageRunner.maps[zkappIdentifier.toString()], Bob);
log('...addIdentity Bob');
numEvents = await processEvents(numEvents);

////////////////////////////////////////////////////////////////////////
// commit pending storage events
////////////////////////////////////////////////////////////////////////

hr();
await commitPendingTransformations();
numEvents = await processEvents(numEvents);
logRoots();

/*
hr();
log('addIdentity Charlie...');
await addIdentity(storageRunner.maps[zkappIdentifier.toString()], Charlie);
log('...addIdentity Charlie');
numEvents = await processEvents(numEvents);

hr();
log('addIdentity Darcy...');
await addIdentity(storageRunner.maps[zkappIdentifier.toString()], Darcy);
log('...addIdentity Darcy');
numEvents = await processEvents(numEvents);
*/

////////////////////////////////////////////////////////////////////////
// Personal Identity Keyring Management
////////////////////////////////////////////////////////////////////////

const salt = 'uniqueTotheZkapp';

storageRunner.logMapKeys();
hr();
log('addAuthNFactor Alice...');
await addAuthNFactor(
  storageRunner.maps[zkappIdentifier.toString()],
  storageRunner.maps[Alice.identifier.toString()],
  Alice,
  { type: AuthNType.operator, provider: AuthNProvider.self, revision: 0 },
  { salt, secret: 'secretCode' }
);
log('...addAuthNFactor Alice');
numEvents = await processEvents(numEvents);

hr();
log('addAuthNFactor Bob...');
await addAuthNFactor(
  storageRunner.maps[zkappIdentifier.toString()],
  storageRunner.maps[Bob.identifier.toString()],
  Bob,
  { type: AuthNType.operator, provider: AuthNProvider.self, revision: 0 },
  { salt, secret: 'XXXXXXXXXX' }
);
log('...addAuthNFactor Bob');
numEvents = await processEvents(numEvents);

////////////////////////////////////////////////////////////////////////
// commit pending storage events
////////////////////////////////////////////////////////////////////////

hr();
await commitPendingTransformations();
numEvents = await processEvents(numEvents);
logRoots();

hr();
storageRunner.logMapKeys('storageRunner');
storage.logMapKeys('storage');

// confirm sync of MMs
const witness1 = storageRunner.maps[Alice.identifier.toString()].getWitness(
  Alice.identifier
);
const witness2 = storage.maps[Alice.identifier.toString()].getWitness(
  Alice.identifier
);
witness1.assertEquals(witness2);

// confirm sync of commitments
const sRoot = storage.maps[zkappIdentifier.toString()].getRoot();
zkapp.commitment.get().assertEquals(sRoot);

tada();

////////////////////////////////////////////////////////////////////////
// helper functions
////////////////////////////////////////////////////////////////////////

/**
 * Process events emitted by the zkApp SmartContract.
 *
 * Use offset param and returned counter output
 * to processEvents sequentually after each txn.
 */
async function processEvents(offset = 0) {
  let counter = 0;

  const events = await zkapp.fetchEvents();

  log('Process Events...');

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
          // const ev = EventStore.fromJSON(js);
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

            const j = pe.data1.key.toString();
            if (!storage.maps[j]) storage.maps[j] = new MerkleMap();
          }
        }
        break;
    }
  }

  log('...Process Events');

  return counter;
}

async function commitPendingTransformations() {
  log('commit pending store events...');
  logRoots();
  {
    // update storage runner, to get the next commitment
    for (const pe of storage.pending) {
      const i = pe.id.toString();
      if (!storageRunner.maps[i]) storageRunner.maps[i] = new MerkleMap();
      storageRunner.maps[i].set(pe.data1.getKey(), pe.data1.getValue());

      const j = pe.data1.key.toString();
      if (!storageRunner.maps[j]) storageRunner.maps[j] = new MerkleMap();
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
}

async function addAuthNFactor(
  idManagerMM: MerkleMap,
  idKeyringMM: MerkleMap,
  identity: Identity,
  afProtocol: AuthNFactorProtocol,
  afData: AuthNFactorData
) {
  const af = new AuthNFactor({
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

  // prove the identifier IS in the Identity Manager MT
  const witnessManager = idManagerMM.getWitness(identity.identifier);

  // prove the AuthNFactor IS NOT in the Identity Keyring MT
  const witnessKeyring = idKeyringMM.getWitness(af.getKey());

  log('  tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.addAuthNFactor(af, identity, witnessKeyring, witnessManager);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log('  ...tx: prove() sign() send()');
}
