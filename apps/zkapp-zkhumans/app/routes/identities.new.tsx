import { trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';

import type { AuthnFactor, Identity } from '@zkhumans/contracts';

export default function NewIdentity() {
  const { cnsl, zk } = useAppContext();

  async function handleCreateIdentity() {
    cnsl.log('info', 'Creating Identity...');

    const snarkyjs = zk.state.snarkyjs;
    if (!snarkyjs || !zk.state.account) {
      cnsl.log('error', 'ERROR: snarkyjs and/or account not ready!');
      return;
    }

    try {
      const r = await trpc.health.check.query();
      if (r !== 1) throw new Error('API not available');
    } catch (
      err: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
      cnsl.log('error', 'ERROR: API not available');
      console.log('ERROR', err.message, err.code);
      return;
    }

    ////////////////////////////////////////////////////////////////////////
    // dynamically load libs for in-browser only, avoid ERR_REQUIRE_ESM
    ////////////////////////////////////////////////////////////////////////

    const { AuthnFactor, AuthnProvider, AuthnType, Identity } = await import(
      '@zkhumans/contracts'
    );
    const { smtApplyTransactions, smtValueToString } = await import(
      '@zkhumans/utils'
    );
    const { MemoryStore, SparseMerkleTree } = await import('snarky-smt');
    const { CircuitString, Field, Poseidon, PublicKey } = snarkyjs;

    ////////////////////////////////////////////////////////////////////////
    // Init or Create Identity Manager MT
    ////////////////////////////////////////////////////////////////////////

    // Create an Identity Manager MT
    const store = new MemoryStore<Identity>();
    const smtIDManager = await SparseMerkleTree.build(
      store,
      CircuitString,
      Identity
    );

    // get Identity Manager MT data from database, create if not exists
    const idMgr = '_IdentityManager';
    const dbSmt =
      (await trpc.smt.get.query({ id: idMgr })) ??
      (await trpc.smt.create.mutate({ id: idMgr, root: '' }));
    console.log('dbSmt', JSON.stringify(dbSmt, null, 2));

    try {
      // apply db-stored SMT modification history to restore in-memory
      await smtApplyTransactions(smtIDManager, CircuitString, Identity, dbSmt);
    } catch (
      err: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
      cnsl.log('error', 'ERROR: SMT import');
      console.log('ERROR', err);
      return;
    }

    ////////////////////////////////////////////////////////////////////////
    // Create personal Identity Keyring
    ////////////////////////////////////////////////////////////////////////

    // use MINA publicKey as identity identifier
    const identifier: string = zk.state.account;

    // Create an Identity Keyring MT
    const storeKeyring = new MemoryStore<AuthnFactor>();
    const smtIDKeyring = await SparseMerkleTree.build(
      storeKeyring,
      Field,
      AuthnFactor
      // AuthnFactor as any // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    // get Identity Keyring MT data from database, create if not exists
    const dbSmtKeyring =
      (await trpc.smt.get.query({ id: identifier })) ??
      (await trpc.smt.create.mutate({ id: identifier, root: '' }));
    console.log('dbSmtKeyring', JSON.stringify(dbSmtKeyring, null, 2));

    // apply db-stored SMT modification history to restore in-memory
    await smtApplyTransactions(smtIDKeyring, Field, AuthnFactor, dbSmtKeyring);

    let identity = new Identity({
      publicKey: PublicKey.fromBase58(identifier),
      commitment: smtIDKeyring.getRoot(),
    });

    ////////////////////////////////////////////////////////////////////////
    // add Operator Key as AuthnFactor to Identity Keyring
    ////////////////////////////////////////////////////////////////////////
    const salt = 'TODO:somethingUniqueTotheZkapp';

    // use hash of signature of publicKey as identity operator key
    const getUserSignature = async () => {
      try {
        const data = await zk.state.wallet?.signMessage({
          message: identifier,
        });
        if (!data) throw new Error('signature empty');
        const hash = Poseidon.hash([
          ...CircuitString.fromString(data.signature.field).toFields(),
          ...CircuitString.fromString(data.signature.scalar).toFields(),
        ]);
        return hash.toString();
      } catch (
        err: any // eslint-disable-line @typescript-eslint/no-explicit-any
      ) {
        cnsl.log('error', 'ERROR: signature failed');
        console.log('ERROR', err.message, err.code);
        return null;
      }
    };

    cnsl.log('info', 'Awaiting signature...');
    const secret = await getUserSignature();
    if (!secret || secret === '') return;
    cnsl.log('success', 'Received signature');

    const afPublicOpKey = {
      type: AuthnType.operator,
      provider: AuthnProvider.self,
      revision: 0,
    };
    const afPrivateOpKey = { salt, secret };
    const afOpKey = AuthnFactor.init(afPublicOpKey);
    const afHashOpKey = afOpKey.hash(afPrivateOpKey);

    await smtIDKeyring.update(afHashOpKey, afOpKey);
    await trpc.smt.txn.mutate({
      id: identifier,
      txn: 'update',
      key: smtValueToString(afHashOpKey, Field),
      value: smtValueToString(afOpKey, AuthnFactor),
    });
    console.log(
      'smt.update',
      smtValueToString(afHashOpKey, Field),
      smtValueToString(afOpKey, AuthnFactor)
    );
    identity = identity.setCommitment(smtIDKeyring.getRoot());

    ////////////////////////////////////////////////////////////////////////
    // add BioAuth as AuthnFactor to Identity Keyring
    ////////////////////////////////////////////////////////////////////////

    const bioAuthSecret = 'TODO:uniqueBioAuth';

    const afPublicBioAuth = {
      type: AuthnType.facescan,
      provider: AuthnProvider.humanode,
      revision: 0,
    };
    const afPrivateBioAuth = { salt, secret: bioAuthSecret };
    const afBioAuth = AuthnFactor.init(afPublicBioAuth);
    const afHashBioAuth = afBioAuth.hash(afPrivateBioAuth);

    await smtIDKeyring.update(afHashBioAuth, afBioAuth);
    await trpc.smt.txn.mutate({
      id: identifier,
      txn: 'update',
      key: smtValueToString(afHashBioAuth, Field),
      value: smtValueToString(afBioAuth, AuthnFactor),
    });
    console.log(
      'smt.update',
      smtValueToString(afHashBioAuth, Field),
      smtValueToString(afBioAuth, AuthnFactor)
    );
    identity = identity.setCommitment(smtIDKeyring.getRoot());

    ////////////////////////////////////////////////////////////////////////
    // add new Identity
    ////////////////////////////////////////////////////////////////////////

    // prove the identifier IS NOT in the Identity Manager MT
    const identifierCircuitString = CircuitString.fromString(identifier);
    const merkleProof = await smtIDManager.prove(identifierCircuitString);
    console.log('merkleProof sidenodes', merkleProof.sideNodes);
    cnsl.log('success', 'made proofs, TODO: txn');

    ////////////////////////////////////
    // TODO: submit proof txn
    ////////////////////////////////////

    // const tx = await Mina.transaction(feePayer, () => {
    //   zkapp.addNewIdentity(identifier, identity, merkleProof);
    // });
    // await tx.prove();
    // await tx.sign([feePayerKey]).send();
    await smtIDManager.update(identifierCircuitString, identity);
    await trpc.smt.txn.mutate({
      id: idMgr,
      txn: 'update',
      key: smtValueToString(identifierCircuitString, CircuitString),
      value: smtValueToString(identity, Identity),
    });
    console.log(
      'smt.update',
      smtValueToString(identifierCircuitString, CircuitString),
      smtValueToString(identity, Identity)
    );
    // zkapp.commitment.get().assertEquals(smtIDManager.getRoot());
  }

  return (
    <div>
      <h1>New zkHumans Identity</h1>
      <br />
      <br />
      {zk.state.zkApp && (
        <>
          Create new zkHumans Identity using the following MINA account as
          operator key: <b>{zk.state.account}</b>
          <br />
          <button
            className="btn btn-primary gap-2 normal-case"
            onClick={handleCreateIdentity}
          >
            Create Identity
          </button>
        </>
      )}
    </div>
  );
}
