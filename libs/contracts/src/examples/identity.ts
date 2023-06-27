import {
  AccountUpdate,
  CircuitString,
  Field,
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
import { ExtendedMerkleMap, strToBool } from '@zkhumans/utils';

import type { AuthNFactorPrivate, AuthNFactorPublic } from '../IdentityManager';

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

// Create an Identity Manager Merkle Map
const idManagerMerkleMap = new ExtendedMerkleMap<Identity>();

// Create 4 Identity Keyring Merkle Maps
const idKeyringMerkleMaps: Array<ExtendedMerkleMap<AuthNFactor>> = [];
for (let i = 0; i < 4; i++) {
  idKeyringMerkleMaps[i] = new ExtendedMerkleMap<AuthNFactor>();
}

// Create 4 identities

const aliceID = new Identity({
  publicKey: Local.testAccounts[0].publicKey,
  commitment: idKeyringMerkleMaps[0].getRoot(),
});
const bobID = new Identity({
  publicKey: Local.testAccounts[1].publicKey,
  commitment: idKeyringMerkleMaps[1].getRoot(),
});
const charlieID = new Identity({
  publicKey: Local.testAccounts[2].publicKey,
  commitment: idKeyringMerkleMaps[2].getRoot(),
});
const darcyID = new Identity({
  publicKey: Local.testAccounts[3].publicKey,
  commitment: idKeyringMerkleMaps[3].getRoot(),
});

// use their MINA publicKey as identity identifier
const Alice = Poseidon.hash(aliceID.publicKey.toFields());
const Bob = Poseidon.hash(bobID.publicKey.toFields());
const Charlie = Poseidon.hash(charlieID.publicKey.toFields());
const Darcy = Poseidon.hash(darcyID.publicKey.toFields());

// add 2 identities initially
idManagerMerkleMap.set(Alice, aliceID);
idManagerMerkleMap.set(Bob, bobID);

const initialCommitment = idManagerMerkleMap.getRoot();

const zkapp = new IdentityManager(zkappAddress);

// deploy
log('Deploying IdentityManager...');
const tx = await Mina.transaction(feePayer, () => {
  AccountUpdate.fundNewAccount(feePayer);
  zkapp.deploy({ zkappKey });
  zkapp.idsRoot.set(initialCommitment);
});
log('deploy tx.prove()...');
await tx.prove();
log('...deploy tx.prove()');

log('deploy tx.sign().send()...');
await tx.sign([feePayerKey]).send();
log('...deploy tx.sign().send()');

const cB = idManagerMerkleMap.get(Bob)?.commitment;
log(`initial id commitment of Bob = ${cB}`);

// add new identity
log('addIdentity Charlie...');
await addIdentity(idManagerMerkleMap, Charlie, charlieID);
log('...addIdentity Charlie');

const cC = idManagerMerkleMap.get(Charlie)?.commitment;
log(`initial id commitment of Charlie = ${cC}`);

// add another identity
log('addIdentity Darcy...');
await addIdentity(idManagerMerkleMap, Darcy, darcyID);
log('...addIdentity Darcy');

////////////////////////////////////////////////////////////////////////
// Personal Identity Keyring Management
////////////////////////////////////////////////////////////////////////

const salt = 'uniqueTotheZkapp';

log('addAuthNFactor Alice...');
await addAuthNFactor(
  idManagerMerkleMap,
  Alice,
  aliceID,
  idKeyringMerkleMaps[0],
  { type: AuthNType.operator, provider: AuthNProvider.self, revision: 0 },
  { salt, secret: 'secretCode' }
);
log('...addAuthNFactor Alice');

log('addAuthNFactor Darcy...');
await addAuthNFactor(
  idManagerMerkleMap,
  Darcy,
  darcyID,
  idKeyringMerkleMaps[3],
  { type: AuthNType.operator, provider: AuthNProvider.self, revision: 0 },
  { salt, secret: 'XXXXXXXXXX' }
);
log('...addAuthNFactor Darcy');

////////////////////////////////////////////////////////////////////////
// Smart Contract Events
////////////////////////////////////////////////////////////////////////

const events = await zkapp.fetchEvents();
console.log(
  `Events on ${zkapp.address.toBase58()}`,
  events.map((e) => ({ type: e.type, data: JSON.stringify(e.event, null, 2) }))
);
console.log('Events', events);

////////////////////////////////////////////////////////////////////////
// helper functions
////////////////////////////////////////////////////////////////////////

async function addIdentity(
  idManagerMM: ExtendedMerkleMap<Identity>,
  identifier: Field,
  identity: Identity
) {
  // prove the identifier IS NOT in the Identity Manager MT
  log(' - idManagerMM.getWitness()...');
  const witness = idManagerMM.getWitness(identifier);
  log(' - ...idManagerMM.getWitness()');

  log(' - tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.addIdentity(identity, witness);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log(' - ...tx: prove() sign() send()');

  // if tx was successful, we can update our off-chain storage
  idManagerMM.set(identifier, identity);
  log(' - idManagerMM.getRoot() :', idManagerMM.getRoot().toString());
  log(' - zkapp.idsRoot.get()   :', zkapp.idsRoot.get().toString());
  zkapp.idsRoot.get().assertEquals(idManagerMM.getRoot());
}

async function addAuthNFactor(
  idManagerMM: ExtendedMerkleMap<Identity>,
  identifier: Field,
  identity: Identity,
  idKeyringMM: ExtendedMerkleMap<AuthNFactor>,
  afPublic: AuthNFactorPublic,
  afPrivate: AuthNFactorPrivate
) {
  // prove the identifier IS in the Identity Manager MT
  log(' - idManagerMM.getWitness()...');
  const witnessManager = idManagerMM.getWitness(identifier);
  log(' - ...idManagerMM.getWitness()');

  const authNFactor = new AuthNFactor({
    publicData: {
      type: Field(afPublic.type),
      provider: Field(afPublic.provider),
      revision: Field(afPublic.revision),
    },
    privateData: {
      salt: CircuitString.fromString(afPrivate.salt),
      secret: CircuitString.fromString(afPrivate.secret),
    },
  });

  log(' - authNFactor.hash()...');
  const authNFactorHash = authNFactor.hash();
  log(' - ...authNFactor.hash()');

  // prove the AuthNFactor IS NOT in the Identity Keyring MT
  log(' - idKeyringMM.getWitness()...');
  const witnessKeyring = idKeyringMM.getWitness(authNFactorHash);
  log(' - ...idKeyringMM.getWitness()');

  const id0 = identity;

  idKeyringMM.set(authNFactorHash, authNFactor);
  const id1 = id0.setCommitment(idKeyringMM.getRoot());

  log(' - tx: prove() sign() send()...');
  const tx = await Mina.transaction(feePayer, () => {
    zkapp.addAuthNFactor(authNFactor, id0, id1, witnessManager, witnessKeyring);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  log(' - ...tx: prove() sign() send()');

  // if tx was successful, we can update our off-chain storage
  idManagerMM.set(identifier, id1);
  log(' - idManagerMM.getRoot() :', idManagerMM.getRoot().toString());
  log(' - zkapp.idsRoot.get()   :', zkapp.idsRoot.get().toString());
  zkapp.idsRoot.get().assertEquals(idManagerMM.getRoot());
}

console.log('🚀 works!');
