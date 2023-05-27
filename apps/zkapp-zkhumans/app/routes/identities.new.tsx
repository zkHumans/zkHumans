import { trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';

export default function NewIdentity() {
  const appContext = useAppContext();
  const { cnsl, zk } = appContext;

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

    const { IdentityClientUtils: IDUtils } = await import(
      '@zkhumans/utils-client'
    );

    ////////////////////////////////////////////////////////////////////////
    // use MINA account to get next available identifier
    ////////////////////////////////////////////////////////////////////////

    const identifier = await IDUtils.getNextUnusedIdentifier(zk.state.account);

    if (!identifier) {
      cnsl.log('error', 'MAX identities per account reached');
      return;
    }

    cnsl.log('success', 'Identifier:', identifier);

    ////////////////////////////////////////////////////////////////////////
    // Create personal Identity Keyring
    ////////////////////////////////////////////////////////////////////////

    // - get signed identifier from user wallet
    const signedData = await zk.getSignedMessage(identifier);
    const secret = IDUtils.getOperatorKeySecret(identifier, signedData);
    if (!secret || secret === '') return;

    // - create Identity Keyring SMT
    const smtIDKeyring = await IDUtils.getKeyringSMT(identifier);

    // - add Operator Key as AuthnFactor to Identity Keyring
    await IDUtils.addAuthnFactorToKeyring(smtIDKeyring, identifier, secret);

    // - get proof that new Identity can be added to Identity Manager
    cnsl.log('info', 'Preparing to add Identity...');
    const { identity, merkleProof } = await IDUtils.prepareAddNewIdentity(
      identifier,
      smtIDKeyring
    );
    cnsl.log('success', 'merkle proof:', merkleProof.root);

    // - TODO: submit proof txn
    // const tx = await Mina.transaction(feePayer, () => {
    //   zkapp.addNewIdentity(identifier, identity, merkleProof);
    // });
    // await tx.prove();
    // await tx.sign([feePayerKey]).send();
    cnsl.log('info', 'TODO: send txn');

    const smtIDManager = await IDUtils.addNewIdentity(identifier, identity);
    // zkapp.commitment.get().assertEquals(smtIDManager.getRoot());
    cnsl.log('info', 'Identity Manager new root:', smtIDManager.getRoot());

    appContext.data.refresh();
  }

  /*
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
  */

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
