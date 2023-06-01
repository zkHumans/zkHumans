import { trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';
import { useEffect, useState } from 'react';
import { Modal } from '../components';
import { Link } from '@remix-run/react';
import { delay } from '@zkhumans/utils';

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
        cnsl.log('error', 'MAX identities per account reached');
        return;
      }

      cnsl.log('success', 'Identifier:', identifier);

      setIdentifier(() => idr);
    })();
  }, [zk.state.account]);

  // continually check a pending BioAuth when there is a link for it
  useEffect(() => {
    (async () => {
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

  async function handleCreateIdentity() {
    cnsl.log('info', 'Creating Identity...');

    const snarkyjs = zk.state.snarkyjs;
    if (!snarkyjs || !zk.state.account) {
      cnsl.log('error', 'ERROR: snarkyjs and/or account not ready!');
      return;
    }

    if (!identifier) {
      cnsl.log('error', 'ERROR: no available identifier');
      return;
    }

    if (!bioAuthState.auth) {
      cnsl.log('error', 'ERROR: no bioauth');
      return;
    }

    if (!signature) {
      cnsl.log('error', 'ERROR: no operator key signature');
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

    // dynamically load libs for in-browser only, avoid ERR_REQUIRE_ESM
    const { IdentityClientUtils: IDUtils } = await import(
      '@zkhumans/utils-client'
    );

    // create Identity Keyring SMT
    const smtIDKeyring = await IDUtils.getKeyringSMT(identifier);

    // add Operator Key as AuthnFactor to Identity Keyring
    const statusOpKey = await IDUtils.addAuthnFactorOperatorKey(
      smtIDKeyring,
      identifier,
      signature
    );
    cnsl.log(
      statusOpKey ? 'success' : 'error',
      'Add Operator Key as AuthnFactor'
    );
    if (!statusOpKey) return;

    // add BioAuth as AuthnFactor to Identity Keyring
    const statusBioAuth = await IDUtils.addAuthnFactorBioAuth(
      smtIDKeyring,
      identifier,
      bioAuthState.auth
    );
    cnsl.log(statusBioAuth ? 'success' : 'error', 'Add BioAuth as AuthnFactor');
    if (!statusBioAuth) return;

    // get proof that new Identity can be added to Identity Manager
    cnsl.log('info', 'Preparing to add Identity...');
    const { identity, merkleProof } = await IDUtils.prepareAddNewIdentity(
      identifier,
      smtIDKeyring
    );
    cnsl.log('success', 'merkle proof:', merkleProof.root);

    // TODO: submit proof txn
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

  const needsBioAuth = bioAuthState.link && !bioAuthState.auth;
  const hasBioAuth = bioAuthState.auth;
  const hasSignature = signature;

  const btnClassNameDisabled = 'btn normal-case btn-disabled';
  const btnClassNameSuccess = 'btn normal-case btn-success';
  const btnClassNameTodo = 'btn normal-case btn-primary';

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
          className={hasBioAuth ? btnClassNameSuccess : btnClassNameTodo}
          onClick={hasBioAuth ? handleNothing : handleBioAuth}
        >
          BioAuthorize
        </button>
        <button
          className={hasSignature ? btnClassNameSuccess : btnClassNameTodo}
          onClick={hasSignature ? handleNothing : handleSignature}
        >
          Sign with Operator Key
        </button>
        <button
          className={
            hasBioAuth && hasSignature ? btnClassNameTodo : btnClassNameDisabled
          }
          onClick={handleCreateIdentity}
        >
          Create Identity
        </button>
      </div>

      {/* Modals */}
      {needsBioAuth && <ModalNeedBioAuth />}
    </div>
  );
}
