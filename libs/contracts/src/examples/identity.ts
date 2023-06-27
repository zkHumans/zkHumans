import {
  AccountUpdate,
  CircuitString,
  Field,
  MerkleMap,
  Mina,
  PrivateKey,
} from 'snarkyjs';
import {
  AuthNFactor,
  AuthNProvider,
  AuthNType,
  EventStore,
  Identity,
  IdentityManager,
} from '../IdentityManager';
import { strToBool } from '@zkhumans/utils';

import type { AuthNFactorData, AuthNFactorProtocol } from '../IdentityManager';

const proofsEnabled = strToBool(process.env['ZK_PROOFS_ENABLED']) ?? true;
console.log('ZK_PROOFS_ENABLED:', proofsEnabled);

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

const Local = Mina.LocalBlockchain({ proofsEnabled });
Mina.setActiveInstance(Local);

const feePayer = Local.testAccounts[0].publicKey;
const feePayerKey = Local.testAccounts[0].privateKey;

const zkappKey = PrivateKey.random();
const zkappAddress = zkappKey.toPublicKey();

// Create 4 Identity Keyring Merkle Maps
const idKeyringMerkleMaps: Array<MerkleMap> = [];
for (let i = 0; i < 4; i++) idKeyringMerkleMaps[i] = new MerkleMap();

// Create 4 identities
const aliceID = new Identity({
  identifier: Local.testAccounts[0].publicKey,
  commitment: idKeyringMerkleMaps[0].getRoot(),
});
const bobID = new Identity({
  identifier: Local.testAccounts[1].publicKey,
  commitment: idKeyringMerkleMaps[1].getRoot(),
});
const charlieID = new Identity({
  identifier: Local.testAccounts[2].publicKey,
  commitment: idKeyringMerkleMaps[2].getRoot(),
});
const darcyID = new Identity({
  identifier: Local.testAccounts[3].publicKey,
  commitment: idKeyringMerkleMaps[3].getRoot(),
});

const Alice = aliceID.toKey();
const Bob = bobID.toKey();
// const Charlie = charlieID.toKey();
const Darcy = darcyID.toKey();

// Create an Identity Manager Merkle Map
// And add 2 identities initially
const idManagerMerkleMap = new MerkleMap();
idManagerMerkleMap.set(Alice, aliceID.toValue());
idManagerMerkleMap.set(Bob, bobID.toValue());
const initialCommitment = idManagerMerkleMap.getRoot();

// set initial MM to confirm restoration from contract events later
const initialIdManagerMM = new MerkleMap();
initialIdManagerMM.set(Alice, aliceID.toValue());
initialIdManagerMM.set(Bob, bobID.toValue());

// deploy
log('Deploying IdentityManager...');
const zkapp = new IdentityManager(zkappAddress);
const tx = await Mina.transaction(feePayer, () => {
  AccountUpdate.fundNewAccount(feePayer);
  zkapp.deploy({ zkappKey });
  zkapp.idsRoot.set(initialCommitment);
});
await tx.prove();
await tx.sign([feePayerKey]).send();
log('...Deploying IdentityManager');

// add new identity
console.log();
log('addIdentity Charlie...');
await addIdentity(idManagerMerkleMap, charlieID);
log('...addIdentity Charlie');

// add another identity
console.log();
log('addIdentity Darcy...');
await addIdentity(idManagerMerkleMap, darcyID);
log('...addIdentity Darcy');

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
    case 'store:set':
      {
        // TODO: a better way to access event data?
        const js = JSON.parse(JSON.stringify(event.event.data));
        const ev = EventStore.fromJSON(js);

        // add to the MM
        if (ev.root0.equals(initialIdManagerMM.getRoot()).toBoolean()) {
          initialIdManagerMM.set(ev.key, ev.value);
          const s = ev.root1.equals(initialIdManagerMM.getRoot()).toBoolean();
          console.log(s ? '✅' : '❌', 'MerkleMap set from event');
        }
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

async function addIdentity(idManagerMM: MerkleMap, identity: Identity) {
  // prove the identifier IS NOT in the Identity Manager MT
  const witness = idManagerMM.getWitness(identity.toKey());

  log('  tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.addIdentity(identity, witness);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log('  ...tx: prove() sign() send()');

  // if tx was successful, we can update our off-chain storage
  idManagerMM.set(identity.toKey(), identity.toValue());
  log('  idManagerMM.getRoot() :', idManagerMM.getRoot().toString());
  log('  zkapp.idsRoot.get()   :', zkapp.idsRoot.get().toString());
  zkapp.idsRoot.get().assertEquals(idManagerMM.getRoot());
}

async function addAuthNFactor(
  idManagerMM: MerkleMap,
  idKeyringMM: MerkleMap,
  identity: Identity,
  afProtocol: AuthNFactorProtocol,
  afData: AuthNFactorData
) {
  // prove the identifier IS in the Identity Manager MT
  const witnessManager = idManagerMM.getWitness(identity.toKey());

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

  const authNFactor_key = authNFactor.toKey();

  // prove the AuthNFactor IS NOT in the Identity Keyring MT
  const witnessKeyring = idKeyringMM.getWitness(authNFactor_key);
  log('  ...idKeyringMM.getWitness()');

  const id0 = identity;

  idKeyringMM.set(authNFactor_key, authNFactor.toValue());
  const id1 = id0.setCommitment(idKeyringMM.getRoot());

  log('  tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.addAuthNFactor(authNFactor, id0, id1, witnessManager, witnessKeyring);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log('  ...tx: prove() sign() send()');

  // if tx was successful, we can update our off-chain storage
  idManagerMM.set(id1.toKey(), id1.toValue());
  log('  idManagerMM.getRoot() :', idManagerMM.getRoot().toString());
  log('  zkapp.idsRoot.get()   :', zkapp.idsRoot.get().toString());
  zkapp.idsRoot.get().assertEquals(idManagerMM.getRoot());
}

console.log();
console.log('🚀🚀🚀 Works! 🚀🚀🚀');
