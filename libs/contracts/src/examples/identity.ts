import {
  AccountUpdate,
  CircuitString,
  Field,
  MerkleMap,
  Mina,
  Poseidon,
  PrivateKey,
  Signature,
  // 1: Proof,
  // 1: verify,
} from 'snarkyjs';
import {
  AuthNFactor,
  AuthNProvider,
  AuthNType,
  Identity,
  IdentityManager,
} from '../IdentityManager';
import { Identifier, hr, strToBool } from '@zkhumans/utils';
import {
  EventStorageCreate,
  EventStoragePending,
  // 1: RollupState,
  // 1: RollupStep,
  // 1: RollupTransformations,
  eventStoreDefault,
} from '@zkhumans/zkkv';
import { BioAuthorizedMessage } from '@zkhumans/snarky-bioauth';

////////////////////////////////////////////////////////////////////////
// set config from env
////////////////////////////////////////////////////////////////////////

let proofsEnabled = strToBool(process.env['ZK_PROOFS_ENABLED']) ?? true;
const recursionEnabled = strToBool(process.env['RECURSION_ENABLED']) ?? false;

// recursion requires compiled contract
if (recursionEnabled) proofsEnabled = true;

console.log('ZK Proofs Enabled:', proofsEnabled);
console.log('Recursion Enabled:', recursionEnabled);

////////////////////////////////////////////////////////////////////////
// lil utilities
////////////////////////////////////////////////////////////////////////

// performance logging
const t0 = performance.now();
const t = () => Number(((performance.now() - t0) / 1000 / 60).toFixed(2)) + 'm';
const log = (
  ...args: any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */
) => console.log(`@T+${t()} |`, ...args);

// celebrate success!
const tada = () => {
  console.log();
  console.log('🚀🚀🚀 Works! 🚀🚀🚀');
  process.exit(0);
};

class StorageSimulator {
  maps: { [key: string]: MerkleMap };
  pending: Array<EventStoragePending>;

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

  processPending(zkappIdentifierStr: string, pending = this.pending) {
    for (const pe of pending) {
      const i = pe.id.toString();
      if (!this.maps[i]) this.maps[i] = new MerkleMap();
      this.maps[i].set(pe.data1.getKey(), pe.data1.getValue());

      // if level-3 K:V data, update level-2 within level-1
      if (i !== zkappIdentifierStr)
        this.maps[zkappIdentifierStr].set(Field(i), this.maps[i].getRoot());

      // create MerkleMap for new stores
      const j = pe.data1.key.toString();
      if (!this.maps[j]) this.maps[j] = new MerkleMap();
    }
  }
}

////////////////////////////////////////////////////////////////////////
// go!
////////////////////////////////////////////////////////////////////////

// 1: let rollupTransformationVerificationKey: string;
// 1: if (recursionEnabled || proofsEnabled) {
// 1:   // compile before IdentityManager
// 1:   log('compile ZkProgram(s)...');
// 1:   const { verificationKey } = await RollupTransformations.compile();
// 1:   rollupTransformationVerificationKey = verificationKey;
// 1:   log('...compile ZkProgram(s)');
// 1: }

if (proofsEnabled) {
  log('compile SmartContract...');
  await IdentityManager.compile();
  log('...compile SmartContract');
}

const Local = Mina.LocalBlockchain({ proofsEnabled });
Mina.setActiveInstance(Local);

const feePayer = Local.testAccounts[0].publicKey;
const feePayerKey = Local.testAccounts[0].privateKey;

// const zkappKey = PrivateKey.random();
const PK = 'EKFJtXzNFt6cv2AH5TvJKvMAw8RF1nfyT9xE7kedyUUNnXrpZERn';
const zkappKey = PrivateKey.fromBase58(PK);
const zkappAddress = zkappKey.toPublicKey();

// setup storage simulation
const storageRunner = new StorageSimulator(); // for computing proposed state transformations
const storage = new StorageSimulator(); // simulates storage and event-processing indexer

// simulate the zkApp itself as an Identity
// to conform its off-chain storage mechanics
const zkappIdentifier = Identifier.fromPublicKey(zkappAddress, 1).toField();
storageRunner.maps[zkappIdentifier.toString()] = new MerkleMap();
const zkappIdentity = Identity.init({
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

// setup bioauth oracle simulation
const oraclePrivateKey = PrivateKey.random();
const oraclePublicKey = oraclePrivateKey.toPublicKey();
const bioAuthSimulator = (x: string): BioAuthorizedMessage => {
  const payload = Field(1);
  const timestamp = Field(Date.now());
  const bioAuthId = Poseidon.hash(CircuitString.fromString(x).toFields());
  const signature = Signature.create(oraclePrivateKey, [
    payload,
    timestamp,
    bioAuthId,
  ]);
  return new BioAuthorizedMessage({
    payload,
    timestamp,
    bioAuthId,
    signature,
  });
};

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
  zkapp.oraclePublicKey.set(oraclePublicKey);

  // notify off-chain storage
  zkapp.emitEvent('storage:create', {
    ...eventStoreDefault,
    key: initStoreIdentifier,
    value: initStoreCommitment,
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
const salt = zkappIdentifier.toString();

hr();
log('addIdentity Alice...');
const Alice = Identity.init({
  identifier: Identifier.fromPublicKey(
    Local.testAccounts[0].publicKey,
    1
  ).toField(),
  commitment: new MerkleMap().getRoot(),
});
const opKeyAlice = AuthNFactor.init({
  protocol: {
    type: AuthNType.operator,
    provider: AuthNProvider.zkhumans,
    revision: 0,
  },
  data: { salt, secret: 'secretCode' },
});
await addIdentity(
  opKeyAlice,
  Alice,
  storageRunner.maps[zkappIdentifier.toString()]
);
log('...addIdentity Alice');
numEvents = await processEvents(numEvents);

hr();
log('addIdentity Bob...');
const Bob = Identity.init({
  identifier: Identifier.fromPublicKey(
    Local.testAccounts[1].publicKey,
    1
  ).toField(),
  commitment: new MerkleMap().getRoot(),
});
const opKeyBob = AuthNFactor.init({
  protocol: {
    type: AuthNType.operator,
    provider: AuthNProvider.zkhumans,
    revision: 0,
  },
  data: { salt, secret: 'XXXXXXXXXX' },
});
await addIdentity(
  opKeyBob,
  Bob,
  storageRunner.maps[zkappIdentifier.toString()]
);
log('...addIdentity Bob');
numEvents = await processEvents(numEvents);

////////////////////////////////////////////////////////////////////////
// commit pending storage events
////////////////////////////////////////////////////////////////////////

hr();
await commitPendingTransformations();
numEvents = await processEvents(numEvents);
logRoots();

////////////////////////////////////////////////////////////////////////
// add additional auth factors to committed storage
////////////////////////////////////////////////////////////////////////

hr();
log('Bob: addAuthNFactor password...');
await addAuthNFactor(
  AuthNFactor.init({
    protocol: {
      type: AuthNType.password,
      provider: AuthNProvider.self,
      revision: 0,
    },
    data: { salt, secret: 'password' },
  }),
  opKeyBob,
  Bob,
  storageRunner.maps[Bob.identifier.toString()],
  storageRunner.maps[zkappIdentifier.toString()]
);
log('...Bob: addAuthNFactor password');
numEvents = await processEvents(numEvents);

hr();
log('Bob: addAuthNFactor bioauth...');
const bioAuthMsg = bioAuthSimulator('simulatedPayload');
await addAuthNFactor(
  AuthNFactor.init({
    protocol: {
      type: AuthNType.proofOfPerson,
      provider: AuthNProvider.humanode,
      revision: 0,
    },
    data: { salt, secret: bioAuthMsg.bioAuthId.toString() },
  }),
  opKeyBob,
  Bob,
  storageRunner.maps[Bob.identifier.toString()],
  storageRunner.maps[zkappIdentifier.toString()],
  bioAuthMsg
);
log('...Bob: addAuthNFactor bioauth');
numEvents = await processEvents(numEvents);

////////////////////////////////////////////////////////////////////////
// commit pending storage events
////////////////////////////////////////////////////////////////////////

hr();
await commitPendingTransformations();
numEvents = await processEvents(numEvents);
logRoots();

////////////////////////////////////////////////////////////////////////
// add a new Identity
////////////////////////////////////////////////////////////////////////

hr();
log('addIdentity Charlie...');
const Charlie = Identity.init({
  identifier: Identifier.fromPublicKey(
    Local.testAccounts[2].publicKey,
    1
  ).toField(),
  commitment: new MerkleMap().getRoot(),
});
const opKeyCharlie = AuthNFactor.init({
  protocol: {
    type: AuthNType.operator,
    provider: AuthNProvider.zkhumans,
    revision: 0,
  },
  data: { salt, secret: 'XXXXXXXXXX' },
});
await addIdentity(
  opKeyCharlie,
  Charlie,
  storageRunner.maps[zkappIdentifier.toString()]
);
log('...addIdentity Charlie');
numEvents = await processEvents(numEvents);

////////////////////////////////////////////////////////////////////////
// commit pending transformations and confirm storage sync
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
      case 'storage:create':
        {
          // off-chain storage should create the record
          const ev = EventStorageCreate.fromJSON(js);
          storage.maps[ev.key.toString()] = new MerkleMap();
        }
        break;

      case 'storage:pending':
        {
          // off-chain storage should create the record as pending
          // Note: events appear here in reverse of contract method emission
          // In practice, first fetch events, order them, then process
          storage.pending.unshift(EventStoragePending.fromJSON(js));
        }
        break;

      case 'storage:commit':
        {
          // off-chain storage should update pending records
          storage.processPending(zkappIdentifier.toString());
          storage.pending = [];
        }
        break;
    }
  }

  log('...Process Events');

  return counter;
}

async function addIdentity(
  opKey: AuthNFactor,
  identity: Identity,
  idManagerMM: MerkleMap
) {
  // prove the identifier IS NOT in the Identity Manager MT
  const witnessManager = idManagerMM.getWitness(identity.identifier);

  log('  tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.NEW_addIdentity(opKey, identity, witnessManager);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log('  ...tx: prove() sign() send()');
}

async function addAuthNFactor(
  af: AuthNFactor,
  afOperatorKey: AuthNFactor,
  identity: Identity,
  idKeyringMM: MerkleMap,
  idManagerMM: MerkleMap,
  oracleMsg = BioAuthorizedMessage.dummy()
) {
  // ensure identity matches storage
  identity = identity.setCommitment(idKeyringMM.getRoot());

  // prove the Operator Key is in the Identity Keyring
  const witnessOpKey = idKeyringMM.getWitness(afOperatorKey.getKey());

  // prove the AuthNFactor IS NOT in the Identity Keyring MT
  const witnessKeyring = idKeyringMM.getWitness(af.getKey());

  // prove the identifier IS in the Identity Manager MT
  const witnessManager = idManagerMM.getWitness(identity.identifier);

  log('  tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.addAuthNFactor(
      af,
      afOperatorKey,
      identity,
      witnessOpKey,
      witnessKeyring,
      witnessManager,
      oracleMsg
    );
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log('  ...tx: prove() sign() send()');
}

async function commitPendingTransformations() {
  // 1: return recursionEnabled
  // 1:   ? await commitPendingTransformationsWithProof()
  // 1:   : await commitPendingTransformationsWithAuthToken();
  await commitPendingTransformationsWithAuthToken();
}

async function commitPendingTransformationsWithAuthToken() {
  log('commit pending with Auth');
  log('commit pending store events...');
  logRoots();
  {
    // update storage runner from pending storage, to get the next commitment
    storageRunner.processPending(zkappIdentifier.toString(), storage.pending);

    const commitmentPending = zkapp.commitment.get();
    const commitmentSettled =
      storageRunner.maps[zkappIdentifier.toString()].getRoot();
    console.log('  commitmentPending:', commitmentPending.toString());
    console.log('  commitmentSettled:', commitmentSettled.toString());
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

/* 1:
async function commitPendingTransformationsWithProof() {
  hr();
  log('commit pending with Proof');
  log('computing transitions...');
  const rollupStepInfo: RollupStep[] = [];

  for (const { id, data0, data1 } of storage.pending) {
    const managerMM = storageRunner.maps[zkappIdentifier.toString()];

    // NOTE: data(0|1).store.identifier --> id

    ////////////////////////////////////////////////////////////////////////
    // transformation of store in the manager
    ////////////////////////////////////////////////////////////////////////
    if (id.equals(zkappIdentifier).toBoolean()) {
      console.log('⭐ pending event is addition of a store to the manager');

      const key = data0.key; // == data1.key
      const value0 = data0.value;
      const value1 = data1.value;

      // create a MerkleMap for the store, if not exist
      const i = key.toString();
      if (!storageRunner.maps[i]) storageRunner.maps[i] = new MerkleMap();
      const storeMM = storageRunner.maps[i];

      // get witness for store within the manager
      const witnessManager = managerMM.getWitness(key);

      const root0 = managerMM.getRoot();
      managerMM.set(key, storeMM.getRoot());
      // ?: managerMM.set(key, value1); // no difference
      const root1 = managerMM.getRoot();

      console.log('  root0  =', root0.toString());
      console.log('  root1  =', root1.toString());
      console.log('  key    =', key.toString());
      console.log('  value0 =', value0.toString());
      console.log('  value1 =', value1.toString());
      console.log();

      rollupStepInfo.push({
        root0,
        root1,
        key,
        value0,
        value1,
        witnessManager,
      });
    }

    ////////////////////////////////////////////////////////////////////////
    // transformation of data in a store
    ////////////////////////////////////////////////////////////////////////
    else {
      console.log('⭐ pending event is addition of data to a store');
      // ??? do this, do it here ???
      // create MerkleMaps for new stores, as needed
      const i = id.toString();
      if (!storageRunner.maps[i]) storageRunner.maps[i] = new MerkleMap();
      const j = data1.key.toString();
      if (!storageRunner.maps[j]) storageRunner.maps[j] = new MerkleMap();

      // DO NOT get witness for data within the store
      // This was already verified when a transformation was submitted to the zkApp
      // now only need to prove the manager's merkle tree transformation
      // X: const witnessStore = storesMM.getWitness(data1.getKey());

      const storeMM = storageRunner.maps[i];

      // get witness for store within the manager
      const witnessManager = managerMM.getWitness(id);

      const root0 = managerMM.getRoot();
      const value0 = storeMM.getRoot();

      storeMM.set(data1.getKey(), data1.getValue());
      managerMM.set(id, storeMM.getRoot());

      const root1 = managerMM.getRoot();
      const value1 = storeMM.getRoot();
      const key = id;

      console.log('  root0  =', root0.toString());
      console.log('  root1  =', root1.toString());
      console.log('  key    =', key.toString());
      console.log('  value0 =', value0.toString());
      console.log('  value1 =', value1.toString());
      console.log();

      rollupStepInfo.push({
        root0,
        root1,
        key,
        value0,
        value1,
        witnessManager,
      });
    }
  }
  log('...computing transitions');

  hr();
  log('making first set of proofs...');
  const rollupProofs: Proof<RollupState, void>[] = [];
  for (const {
    root0,
    root1,
    key,
    value0,
    value1,
    witnessManager,
  } of rollupStepInfo) {
    const rollup = RollupState.createOneStep(
      root0,
      root1,
      key,
      value0,
      value1,
      witnessManager
    );
    const proof = await RollupTransformations.oneStep(
      rollup,
      root0,
      root1,
      key,
      value0,
      value1,
      witnessManager
    );
    rollupProofs.push(proof);
  }
  log('...making first set of proofs');

  hr();
  log('merging proofs...');
  let proof: Proof<RollupState, void> = rollupProofs[0];
  for (let i = 1; i < rollupProofs.length; i++) {
    const rollup = RollupState.createMerged(
      proof.publicInput,
      rollupProofs[i].publicInput
    );
    const mergedProof = await RollupTransformations.merge(
      rollup,
      proof,
      rollupProofs[i]
    );
    proof = mergedProof;
  }
  log('...merging proofs');

  hr();
  log('verifying rollup...');
  console.log('  proof root0:', proof.publicInput.root0.toString());
  console.log('  proof root1:', proof.publicInput.root1.toString());
  const ok = await verify(proof.toJSON(), rollupTransformationVerificationKey);
  console.log('ok', ok);
  log('...verifying rollup');

  hr();
  log('  tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.commitPendingTransformations(proof);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log('  ...tx: prove() sign() send()');
}
*/

// [1]: recursive proofs disabled until upstream bug resolved
