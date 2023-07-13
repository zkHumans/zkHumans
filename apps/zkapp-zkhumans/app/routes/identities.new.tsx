import { trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';
import { useEffect, useState } from 'react';
import { Modal } from '../components';
import { Link } from '@remix-run/react';

import type { WalletSignedData } from '../hooks';

/**
 * How often to recheck the BioAuthOracle for bio-authorized data
 */
const CYCLE_CHECK_BIOAUTH = 5_000;

export default function NewIdentity() {
  const appContext = useAppContext();
  const { cnsl, zk } = appContext;

  const [identifier, setIdentifier] = useState(null as null | string);
  const [signature, setSignature] = useState(null as null | WalletSignedData);
  const [transaction, setTransaction] = useState(null as null | string);

  const [bioAuthState, setBioAuthState] = useState({
    auth: null as null | string,
    link: null as null | string,
    id: null as null | string,
    recheckCounter: 0,
  });

  // get next available identifier
  useEffect(() => {
    (async () => {
      const { IdentityClientUtils } = await import('@zkhumans/utils-client');

      if (!zk.state.account) {
        cnsl.log('error', 'ERROR: account not ready');
        return;
      }

      // use MINA account to get next available identifier
      const idr = await IdentityClientUtils.getNextUnusedIdentifier(
        zk.state.account
      );

      if (!idr) {
        cnsl.log('error', 'MAX IDs per account reached');
        return;
      }

      setIdentifier(() => idr);
    })();
  }, [zk.state.account]);

  // continually check a pending BioAuth when there is a link for it
  useEffect(() => {
    (async () => {
      const { delay } = await import('@zkhumans/utils');
      if (identifier && bioAuthState.link && !bioAuthState.auth) {
        const { IdentityClientUtils } = await import('@zkhumans/utils-client');
        const [id, auth] = await IdentityClientUtils.getBioAuth(identifier);
        if (auth) {
          cnsl.log('success', 'BioAuthorization received');
          setBioAuthState((s) => ({ ...s, auth, id }));
        } else {
          await delay(CYCLE_CHECK_BIOAUTH);
          setBioAuthState((s) => ({
            ...s,
            recheckCounter: bioAuthState.recheckCounter + 1,
          }));
        }
      }
    })();
  }, [
    identifier,
    bioAuthState.auth,
    bioAuthState.link,
    bioAuthState.recheckCounter,
  ]);

  async function handleCompileZkApp() {
    await zk.compile(); // this takes forever!
  }

  // get bioauth'd signature of identifier
  async function handleBioAuth() {
    if (!identifier) return;
    const { IdentityClientUtils } = await import('@zkhumans/utils-client');
    const [id, auth] = await IdentityClientUtils.getBioAuth(identifier);

    if (auth) {
      cnsl.log('success', 'BioAuthorization received');
      setBioAuthState((s) => ({ ...s, auth, id }));
    } else {
      cnsl.log('info', 'Awaiting BioAuthorization...');
      const link = await IdentityClientUtils.getBioAuthLink(id);
      setBioAuthState((s) => ({ ...s, id, link }));
    }
  }

  // get wallet signature of identifier
  async function handleSignature() {
    if (!identifier) return;
    const signedData = await zk.getSignedMessage(identifier);
    setSignature(() => signedData);
  }

  async function handlePrepareCreateIdentityProof() {
    try {
      cnsl.tic('Preparing Create Identity Proof...');

      const zkstate = zk.getReadyState();
      if (!zkstate) throw new Error('zkApp not ready for transaction');

      const { zkApp, snarkyjs } = zkstate;

      if (!identifier) throw new Error('ERROR: no available identifier');

      if (!signature) throw new Error('no operator key signature');

      const r = await trpc.health.check.query();
      if (r !== 1) throw new Error('API not available');

      // WIP: add identity first, then add bioauth authNFactor later
      // X: if (!bioAuthState.auth) {
      // X:   cnsl.toc('error', 'ERROR: no bioauth');
      // X:   return;
      // X: }

      ////////////////////////////////////////////////////////////////////////
      // dynamically load libs for in-browser only, avoid ERR_REQUIRE_ESM
      ////////////////////////////////////////////////////////////////////////
      const { AuthNFactor, AuthNType, AuthNProvider, Identity } = await import(
        '@zkhumans/contracts'
      );
      const { Identifier } = await import('@zkhumans/utils');
      const { IdentityClientUtils } = await import('@zkhumans/utils-client');
      const IDUtils = IdentityClientUtils;

      ////////////////////////////////////////////////////////////////////////
      // create new Identity
      ////////////////////////////////////////////////////////////////////////
      const mmIdentity = new snarkyjs.MerkleMap();
      let identity = Identity.init({
        identifier: Identifier.fromBase58(identifier).toField(),
        commitment: mmIdentity.getRoot(),
      });

      ////////////////////////////////////////////////////////////////////////
      // add Operator Key as AuthNFactor to Identity Keyring
      ////////////////////////////////////////////////////////////////////////
      cnsl.tic('> Add Operator Key as Authentication Factor...');
      // get operator key secret from identifier signed by operator key (wallet)
      const secret = IDUtils.getOperatorKeySecret(identifier, signature);
      if (!secret || secret === '')
        throw new Error('secret from op key failed');

      // init auth factor
      const af = AuthNFactor.init({
        protocol: {
          type: AuthNType.operator,
          provider: AuthNProvider.zkhumans,
          revision: 0,
        },
        data: { salt: IDUtils.IDENTITY_MGR_SALT, secret },
      });

      // add auth factor to MerkleMap
      mmIdentity.set(af.getKey(), af.getValue());
      identity = identity.setCommitment(mmIdentity.getRoot());
      cnsl.toc('success');

      // Add OP Key AF as Identity meta for init by indexer
      // Note: This approach piggy-back-rides on UnitOfStore's metadata that
      // every stored element, including Identity, has. Consider a better way.
      // This is then read by the indexer, so that an AF maybe created at same
      // time as an Identity, within the common pattern. The commitment (key)
      // as first meta data is what triggers this behavior within the indexer.
      identity = identity.setMeta([
        identity.commitment,
        af.getKey(),
        af.getValue(),
      ]);

      ////////////////////////////////////////////////////////////////////////
      // add BioAuth as AuthNFactor to Identity Keyring
      // Note: not adding BioAuth as AF, but rather make optional
      ////////////////////////////////////////////////////////////////////////
      // X: // add BioAuth as AuthNFactor to Identity Keyring
      // X: cnsl.tic('> Adding BioAuth as Authentication Factor...');
      // X: const statusBioAuth = await IDUtils.addAuthNFactorBioAuth(
      // X:   mmIDKeyring,
      // X:   identifier,
      // X:   bioAuthState.auth
      // X: );
      // X: cnsl.toc(statusBioAuth ? 'success' : 'error');
      // X: if (!statusBioAuth) return;

      ////////////////////////////////////////////////////////////////////////
      // get proof that new Identity can be added to Identity Manager
      ////////////////////////////////////////////////////////////////////////
      cnsl.tic('> Create New Identity Merkle proof...');
      // this is strange... TODO fix this!
      const idMgr = Identifier.fromPublicKey(zkApp.identityManager.address, 1)
        .toField()
        .toString();
      const mmMgr = await IDUtils.getStoredMerkleMap(idMgr);
      // prove the identity IS NOT in the Identity Manager MM
      const witness = mmMgr.getWitness(identity.identifier);
      cnsl.toc('success', `witness=${JSON.stringify(witness.toJSON())}`);

      ////////////////////////////////////////////////////////////////////////
      // prepare transaction
      ////////////////////////////////////////////////////////////////////////
      cnsl.tic('> Preparing transaction...');
      const tx = await snarkyjs.Mina.transaction(() => {
        zkApp.identityManager.addIdentity(identity, witness);
      });
      cnsl.toc('success');

      ////////////////////////////////////////////////////////////////////////
      // generate transaction proof
      ////////////////////////////////////////////////////////////////////////
      cnsl.tic('> Generating transaction proof...');
      await tx.prove();
      cnsl.toc('success');

      console.log('Transaction:', tx.toPretty());

      setTransaction(() => tx.toJSON());
    } catch (
      err: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
      cnsl.toc('error', `ERROR: ${err.message}`);
      cnsl.toc('error');
      console.log('ERROR', err.message, err.code);
      return;
    }

    appContext.data.refresh();
  }

  async function handleSendCreateIdentityProof() {
    try {
      cnsl.tic('Sending transaction...');
      const zks = zk.getReadyState();
      if (!zks) throw new Error('zkApp not ready for transaction');
      const { wallet } = zks;

      const { hash } = await wallet.sendTransaction({
        transaction,
        feePayer: {
          fee: 0.1,
          memo: '',
        },
      });
      cnsl.toc('success', `sent with hash=${hash}`);

      cnsl.log(
        'info',
        `See transaction at https://berkeley.minaexplorer.com/transaction/${hash}`
      );

      /*
      // const commitment = await zkApp.identityManager.commitment.fetch();
      // TODO: update tx in db with pending state, then confirmed state
      cnsl.tic('Updating off-chain data...');
      const { IdentityClientUtils } = await import('@zkhumans/utils-client');
      const smtIDManager = await IdentityClientUtils.addNewIdentity(
        identifier,
        identity
      );
      // zkapp.commitment.get().assertEquals(smtIDManager.getRoot());
      cnsl.toc(
        'success',
        `Identity Manager new root: ${smtIDManager.getRoot()}`
      );
      */
    } catch (
      err: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
      cnsl.toc('error', `ERROR: ${err.message}`);
      return;
    }

    appContext.data.refresh();
  }

  const ModalNeedBioAuth = () => (
    <Modal title="BioAuthorization Required">
      Please visit{' '}
      <Link
        to={bioAuthState.link ?? ''}
        target="_blank"
        className="link link-primary"
        rel="noreferrer"
      >
        the BioAuth Oracle
      </Link>{' '}
      to authorize the identifier
      <br />
      then return here to continue.
    </Modal>
  );

  const hasBioAuth = bioAuthState.auth !== null;
  const hasSignature = signature !== null;
  const hasTransaction = transaction !== null;
  const hasZKApp = zk.state.zkApp !== null;
  const needsBioAuth = bioAuthState.link && !hasBioAuth;

  const btnDisabled = 'btn normal-case btn-disabled';
  const btnSuccess = 'btn normal-case btn-success';
  const btnTodo = 'btn normal-case btn-primary';

  const handleNothing = () => {
    return false;
  };

  return (
    <div className="divide-y rounded-xl border border-neutral-400">
      {/* Heading */}
      <div className="bg-base-300 flex flex-col items-center rounded-t-xl p-1">
        <div className="my-4 text-xl font-bold">Create New Identity</div>
      </div>

      {/* Content */}
      <div className="p-2">
        {identifier && (
          <p>
            Identifier: <b>{identifier}</b>
          </p>
        )}
        <p>
          Operator Key: <b>{zk.state.account}</b>
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-row justify-center space-x-4 p-4">
        <button
          className={hasZKApp ? btnSuccess : btnTodo}
          onClick={hasZKApp ? handleNothing : handleCompileZkApp}
        >
          Compile zkApp
        </button>
        <button
          className={hasBioAuth ? btnSuccess : btnTodo}
          onClick={hasBioAuth ? handleNothing : handleBioAuth}
        >
          BioAuthorize
        </button>
        <button
          className={hasSignature ? btnSuccess : btnTodo}
          onClick={hasSignature ? handleNothing : handleSignature}
        >
          Sign with Operator Key
        </button>
        <button
          className={
            hasTransaction
              ? btnSuccess
              : hasZKApp && hasBioAuth && hasSignature
              ? btnTodo
              : btnDisabled
          }
          onClick={handlePrepareCreateIdentityProof}
        >
          Prepare Proof
        </button>
        <button
          className={hasTransaction ? btnTodo : btnDisabled}
          onClick={handleSendCreateIdentityProof}
        >
          Send Proof
        </button>
      </div>

      {/* Modals */}
      {needsBioAuth && <ModalNeedBioAuth />}
    </div>
  );
}
