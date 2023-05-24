import { useAppContext } from '../root';
import { trpc } from '../trpc';

export default function NewIdentity() {
  const { cnsl, zk } = useAppContext();

  async function handleCreateIdentity() {
    cnsl.log('info', 'TODO: Create ID!');

    const snarkyjs = zk.state.snarkyjs;
    if (!snarkyjs || !zk.state.account) {
      cnsl.log('error', 'ERROR: snarkyjs and/or account not ready!');
      return;
    }

    ////////////////////////////////////////////////////////////////////////
    // dynamically load libs for in-browser only
    ////////////////////////////////////////////////////////////////////////

    const { Field, Poseidon, PublicKey, CircuitString } = snarkyjs;
    const { AuthnFactor, Identity, AuthnType, AuthnProvider } = await import(
      '@zkhumans/contracts'
    );
    const { MemoryStore, SparseMerkleTree } = await import('snarky-smt');
    const r = await trpc.health.check.query();
    console.log('trpc health.check', r);

    const s = await trpc.smt.update.query();
    console.log('trpc smt.update', s);

    ////////////////////////////////////////////////////////////////////////
    // Init or Create Identity Manager MT
    ////////////////////////////////////////////////////////////////////////

    // TODO: check if Identity Manager MT exists

    // Create an Identity Manager MT
    const store = new MemoryStore<typeof Identity>();
    const smtIDManager = await SparseMerkleTree.build(
      store,
      CircuitString,
      Identity as any // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    ////////////////////////////////////////////////////////////////////////
    // Create personal Identity Keyring
    ////////////////////////////////////////////////////////////////////////

    // Create an Identity Keyring MT
    const storeKeyring = new MemoryStore<typeof AuthnFactor>();
    const smtIDKeyring = await SparseMerkleTree.build(
      storeKeyring,
      Field,
      AuthnFactor as any // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    let identity = new Identity({
      publicKey: PublicKey.fromBase58(zk.state.account),
      commitment: smtIDKeyring.getRoot(),
    });

    // use MINA publicKey as identity identifier
    const identifier = CircuitString.fromString(identity.publicKey.toBase58());
    console.log('identifier', identifier.toString());

    ////////////////////////////////////////////////////////////////////////
    // add Operator Key as AuthnFactor to Identity Keyring
    ////////////////////////////////////////////////////////////////////////
    const salt = 'TODO:somethingUniqueTotheZkapp';

    // use hash of signature of publicKey as identity operator key
    const getUserSignature = async () => {
      try {
        const data = await zk.state.wallet?.signMessage({
          message: identifier.toString(),
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
    console.log('smt.update', afHashOpKey, afOpKey);
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
    console.log('smt.update', afHashBioAuth, afBioAuth);
    identity = identity.setCommitment(smtIDKeyring.getRoot());

    ////////////////////////////////////////////////////////////////////////
    // add new Identity
    ////////////////////////////////////////////////////////////////////////

    // prove the identifier IS NOT in the Identity Manager MT
    const merkleProof = await smtIDManager.prove(identifier);
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
    // await smtIDManager.update(identifier, identity);
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
