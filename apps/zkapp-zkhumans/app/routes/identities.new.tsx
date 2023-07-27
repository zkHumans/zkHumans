import { Link, useNavigate } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { delay, displayAccount, transactionLink } from '@zkhumans/utils';
import { trpc } from '@zkhumans/trpc-client';
import { Alert, Spinner } from '../components';
import { useAppContext } from '../root';

import type { WalletSignedData } from '../hooks';

/**
 * How often to recheck the storage for an event from a sent txn.
 */
const CYCLE_CHECK_TXN_CONFIRM = 5_000;

export default function NewIdentity() {
  const appContext = useAppContext();
  const { cnsl, zk } = appContext;

  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState(null as null | string);
  const [signature, setSignature] = useState(null as null | WalletSignedData);
  const [transaction, setTransaction] = useState(null as null | string);
  const [transactionHash, setTransactionHash] = useState(
    undefined as undefined | null | string
  );
  const [txnWatchCounter, setTxnWatchCounter] = useState(0);

  // get next available identifier
  useEffect(() => {
    (async () => {
      const { IDUtils } = await import('@zkhumans/utils-client');

      if (!zk.state.account) {
        cnsl.log('error', 'ERROR: account not ready');
        return;
      }

      // use MINA account to get next available identifier
      const idr = await IDUtils.getNextUnusedIdentifier(zk.state.account);

      if (!idr) {
        cnsl.log('error', 'MAX IDs per account reached');
        return;
      }

      setIdentifier(() => idr);
    })();
  }, [zk.state.account]);

  // wait for transaction confirmation
  useEffect(() => {
    (async () => {
      if (!transactionHash) return; // only for txn success
      if (!txnWatchCounter) cnsl.tic('Awaiting transaction confirmation...');
      const event = await trpc.event.select.query({ transactionHash });

      // if an event from the transaction was recorded by storage
      if (event.length) {
        cnsl.toc('success');
        appContext.data.refresh();
        setTransactionHash(() => undefined);
        // redirect UI to the its page
        navigate(`/identities/${identifier}`);
      } else {
        await delay(CYCLE_CHECK_TXN_CONFIRM);
        setTxnWatchCounter((x) => x + 1);
      }
    })();
  }, [transactionHash, txnWatchCounter]);

  async function handleCompileZkApp() {
    await zk.compile(); // this takes forever!
  }

  // get wallet signature of identifier
  async function handleSignature() {
    if (!identifier) return;
    const signedData = await zk.getSignedMessage(identifier);
    setSignature(() => signedData);
  }

  async function handleCreateIdentity_prepareProof() {
    try {
      cnsl.tic('Preparing Create Identity Proof...');

      const zkstate = zk.getReadyState();
      if (!zkstate) throw new Error('zkApp not ready for transaction');

      const { zkApp, snarkyjs } = zkstate;

      if (!identifier) throw new Error('ERROR: no available identifier');

      if (!signature) throw new Error('no operator key signature');

      const r = await trpc.health.check.query();
      if (r !== 1) throw new Error('API not available');

      ////////////////////////////////////////////////////////////////////////
      // dynamically load libs for in-browser only, avoid ERR_REQUIRE_ESM
      ////////////////////////////////////////////////////////////////////////
      const { AuthNFactor, AuthNType, AuthNProvider, Identity } = await import(
        '@zkhumans/contracts'
      );
      const { Identifier } = await import('@zkhumans/utils');
      const { IDUtils } = await import('@zkhumans/utils-client');

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
      // prove the new Identity can be added to Identity Manager
      // by proving the identity IS NOT in the Identity Manager MM
      ////////////////////////////////////////////////////////////////////////
      cnsl.tic('> Create New Identity Merkle proof...');
      const mmMgr = await IDUtils.getManagerMM(zkApp.identityManager.address);
      const witness = mmMgr.getWitness(identity.identifier);
      cnsl.toc('success');

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

  async function handleSendTransaction() {
    if (!transaction) return;
    const hash = await zk.sendTransaction(transaction);
    setTransactionHash(() => hash);
    appContext.data.refresh();
    handleCreateIdentity_close();
  }

  function handleCreateIdentity_close() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).modal_0.close();
  }

  function handleCreateIdentity_open() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).modal_0.showModal();
  }

  // // for testing UI:
  // useState(() => {
  //   // setTransactionHash(() => undefined); // not sent
  //   setTransactionHash(() => 'XXXXXXXXXXXXXXXXXXX'); // success
  //   // setTransactionHash(() => null); // error
  // });

  const hasSignature = signature !== null;
  const hasTransaction = transaction !== null;
  const hasZKApp = zk.state.zkApp !== null;
  const hasSentTxn = transactionHash !== undefined;
  const hasTxnSuccess = hasSentTxn && transactionHash !== null;

  const btnDisabled = 'btn btn-disabled normal-case';
  const btnSuccess = 'btn btn-success normal-case';
  const btnTodo = 'btn btn-primary normal-case';
  const btnWarning = 'btn btn-warning normal-case';

  const handleNothing = () => {
    return false;
  };

  return (
    <div className="divide-y rounded-xl border border-neutral-400">
      {/* Heading */}
      <div className="bg-base-300 flex flex-col items-center rounded-t-xl p-1">
        <div className="my-4 text-xl font-bold">New Identity</div>
      </div>

      {/* Content */}
      <div className="p-2">
        {identifier && (
          <p>
            Identifier:
            <br />
            <b>{identifier}</b>
          </p>
        )}
        <br />
        <p>
          Operator Key:
          <br />
          <b>{zk.state.account}</b>
        </p>
      </div>

      {/* Alerts & Actions */}
      <div className="flex flex-col items-center space-y-4 p-4">
        {/* Alerts */}
        {hasSentTxn &&
          (hasTxnSuccess ? (
            <Alert type="success">
              Transaction Sent. Explore it:{' '}
              <Link
                to={transactionLink(transactionHash)}
                target="_blank"
                className="link link-primary"
                rel="noreferrer"
              >
                {displayAccount(transactionHash, 6, 6)}
              </Link>
              . Awaiting confirmation. <Spinner />
            </Alert>
          ) : (
            <Alert type="error">Error sending transaction.</Alert>
          ))}

        {/* Show Create button if txn error or txn not yet sent */}
        {hasTxnSuccess || (
          <button
            className="btn btn-primary normal-case"
            onClick={handleCreateIdentity_open}
          >
            Create Identity
          </button>
        )}
      </div>

      {/* Modal to create identity */}
      {/* Note: <button> within <form> closes modal, so use <div> */}
      <dialog id="modal_0" className="modal">
        <form method="dialog" className="modal-box w-full max-w-xs">
          <h3 className="text-center text-lg font-bold">Create Identity</h3>
          <div className="my-4 flex flex-col space-y-4">
            <div
              className={hasZKApp ? btnSuccess : btnTodo}
              onClick={hasZKApp ? handleNothing : handleCompileZkApp}
            >
              {zk.is.compiling && <Spinner />}
              Compile zkApp
            </div>
            <div
              className={hasSignature ? btnSuccess : btnTodo}
              onClick={hasSignature ? handleNothing : handleSignature}
            >
              {zk.is.signing && <Spinner />}
              Sign with Operator Key
            </div>
            <div
              className={
                hasTransaction
                  ? btnSuccess
                  : hasZKApp && hasSignature
                  ? btnTodo
                  : btnDisabled
              }
              onClick={handleCreateIdentity_prepareProof}
            >
              {zk.is.proving && <Spinner />}
              Prepare Proof
            </div>
            <div
              className={hasTransaction ? btnTodo : btnDisabled}
              onClick={handleSendTransaction}
            >
              {zk.is.sending && <Spinner />}
              Send Transaction
            </div>
          </div>
          <div className="modal-action">
            <div
              className="btn normal-case"
              onClick={handleCreateIdentity_close}
            >
              Cancel
            </div>
          </div>
        </form>
      </dialog>
    </div>
  );
}
