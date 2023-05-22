import {
  AccountUpdate,
  CircuitString,
  Field,
  Mina,
  PrivateKey,
} from 'snarkyjs';
import { MemoryStore, SparseMerkleTree } from 'snarky-smt';
import { strToBool } from '@zkhumans/utils';
import {
  AuthnFactor,
  AuthnProvider,
  AuthnType,
  Identity,
  IdentityManager,
} from '../Identity';

import type {
  AuthnFactorPrivate,
  AuthnFactorPublic,
  SMTIdentityKeyring,
  SMTIdentityManager,
} from '../Identity';

const proofsEnabled = strToBool(process.env['ZK_PROOFS_ENABLED']) ?? true;
console.log('ZK_PROOFS_ENABLED:', proofsEnabled);

const Local = Mina.LocalBlockchain({ proofsEnabled });
Mina.setActiveInstance(Local);

const feePayer = Local.testAccounts[0].publicKey;
const feePayerKey = Local.testAccounts[0].privateKey;

const zkappKey = PrivateKey.random();
const zkappAddress = zkappKey.toPublicKey();

////////////////////////////////////////////////////////////////////////
// Create an Identity Manager MT
////////////////////////////////////////////////////////////////////////

const store = new MemoryStore<Identity>();
const smtIDManager = await SparseMerkleTree.build<CircuitString, Identity>(
  store,
  CircuitString,
  Identity as any // eslint-disable-line @typescript-eslint/no-explicit-any
);

////////////////////////////////////////////////////////////////////////
// Create 4 Identity Keyring MTs
////////////////////////////////////////////////////////////////////////

const smtIDKeyrings: Array<SMTIdentityKeyring> = [];
for (let i = 0; i < 4; i++) {
  smtIDKeyrings[i] = await SparseMerkleTree.build(
    new MemoryStore<AuthnFactor>(),
    Field,
    AuthnFactor
  );
}

////////////////////////////////////////////////////////////////////////
// Create 4 identities
////////////////////////////////////////////////////////////////////////

const aliceID = new Identity({
  publicKey: Local.testAccounts[0].publicKey,
  commitment: smtIDKeyrings[0].getRoot(),
});
const bobID = new Identity({
  publicKey: Local.testAccounts[1].publicKey,
  commitment: smtIDKeyrings[1].getRoot(),
});
const charlieID = new Identity({
  publicKey: Local.testAccounts[2].publicKey,
  commitment: smtIDKeyrings[2].getRoot(),
});
const darcyID = new Identity({
  publicKey: Local.testAccounts[3].publicKey,
  commitment: smtIDKeyrings[3].getRoot(),
});

// use their MINA publicKey as identity identifier
const Alice = CircuitString.fromString(aliceID.publicKey.toBase58());
const Bob = CircuitString.fromString(bobID.publicKey.toBase58());
const Charlie = CircuitString.fromString(charlieID.publicKey.toBase58());
const Darcy = CircuitString.fromString(darcyID.publicKey.toBase58());

// add 2 identities initially
await smtIDManager.update(Alice, aliceID);
await smtIDManager.update(Bob, bobID);

const initialCommitment = smtIDManager.getRoot();

const zkapp = new IdentityManager(zkappAddress);
console.log('@T+0 | Deploying IdentityManager...');
const t0 = performance.now();
const t = () => Number(((performance.now() - t0) / 1000 / 60).toFixed(2)) + 'm';

if (proofsEnabled) {
  await IdentityManager.compile();
  console.log(`@T+${t()} | compiled SmartContract`);
}

const tx = await Mina.transaction(feePayer, () => {
  AccountUpdate.fundNewAccount(feePayer);
  zkapp.deploy({ zkappKey });
  zkapp.commitment.set(initialCommitment);
});
await tx.prove();
console.log(`@T+${t()} | deploy tx.prove()`);
await tx.sign([feePayerKey]).send();
console.log(`@T+${t()} | deploy tx.sign().send()`);

const cB = (await smtIDManager.get(Bob))?.commitment;
console.log(`@T+${t()} | initial id commitment of Bob = ${cB}`);

// add new identity
await addNewIdentity(smtIDManager, Charlie, charlieID);
console.log(`@T+${t()} | addNewIdentity(smtIDManager, Charlie, charlieID)`);

const cC = (await smtIDManager.get(Charlie))?.commitment;
console.log(`@T+${t()} | initial id commitment of Charlie = ${cC}`);

// add another identity
await addNewIdentity(smtIDManager, Darcy, darcyID);
console.log(`@T+${t()} | addNewIdentity(smtIDManager, Darcy, darcyID)`);

////////////////////////////////////////////////////////////////////////
// Personal Identity Keyring Management
////////////////////////////////////////////////////////////////////////

const salt = 'uniqueTotheZkapp';

// create a SMT for the individual's authn keyring

await addAuthnFactorToIdentityKeyring(
  smtIDManager,
  Alice,
  aliceID,
  smtIDKeyrings[0],
  { type: AuthnType.operator, provider: AuthnProvider.self, revision: 0 },
  { salt, secret: 'secretCode' }
);

////////////////////////////////////////////////////////////////////////

async function addNewIdentity(
  smtIDManager_: SMTIdentityManager,
  identifier: CircuitString,
  identity: Identity
) {
  console.log(`@T+${t()} | addNewIdentity...`);

  // prove the identifier IS NOT in the Identity Manager MT
  const merkleProof = await smtIDManager_.prove(identifier);
  console.log(`@T+${t()} | - smtIDManager.prove()`);

  const tx = await Mina.transaction(feePayer, () => {
    zkapp.addNewIdentity(identifier, identity, merkleProof);
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  console.log(`@T+${t()} | - tx.prove()  sign()  send()`);

  await smtIDManager_.update(identifier, identity);
  zkapp.commitment.get().assertEquals(smtIDManager_.getRoot());
}

async function addAuthnFactorToIdentityKeyring(
  smtIDManager_: SMTIdentityManager,
  identifier: CircuitString,
  identity: Identity,
  smtKeyring_: SMTIdentityKeyring,
  authnFactorPublic: AuthnFactorPublic,
  authnFactorPrivate: AuthnFactorPrivate
) {
  console.log(`@T+${t()} | addAuthnFactorToIdentity...`);

  // prove the identifier IS in the Identity Manager MT
  const merkleProofManager = await smtIDManager_.prove(identifier);
  console.log(`@T+${t()} | - smtIDManager.prove()`);

  // create new authn factor
  const authnFactor = AuthnFactor.init(authnFactorPublic);
  const authnFactorHash = authnFactor.hash(authnFactorPrivate);
  console.log(`@T+${t()} | - authnFactor.hash()`);

  // prove the authn factor IS NOT in the Identity Keyring MT
  const merkleProofKeyring = await smtKeyring_.prove(authnFactorHash);
  console.log(`@T+${t()} | - smtKeyring.prove()`);

  const tx = await Mina.transaction(feePayer, () => {
    zkapp.addAuthnFactorToIdentityKeyring(
      identifier,
      identity,
      merkleProofManager,
      authnFactorHash,
      authnFactor,
      merkleProofKeyring
    );
  });
  await tx.prove();
  await tx.sign([feePayerKey]).send();
  console.log(`@T+${t()} | - tx.prove()  sign()  send()`);

  // if tx was successful, we can update our off-chain storage
  await smtKeyring_.update(authnFactorHash, authnFactor);
  const newIdentity = identity.setCommitment(smtKeyring_.getRoot());
  await smtIDManager_.update(identifier, newIdentity);
  zkapp.commitment.get().assertEquals(smtIDManager_.getRoot());
}

console.log('🚀 works!');
