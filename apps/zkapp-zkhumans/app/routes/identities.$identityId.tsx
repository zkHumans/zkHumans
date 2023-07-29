import {
  Link,
  Outlet,
  useLoaderData,
  useMatches,
  useNavigate,
  useRouteLoaderData,
} from '@remix-run/react';
import { json, LoaderArgs } from '@remix-run/node';
import { trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';
import { Alert, IconPending, IconNotPending, Spinner } from '../components';
import { useEffect, useState } from 'react';
import { delay, displayAccount, transactionLink } from '@zkhumans/utils';

import type { WalletSignedData } from '../hooks';

/**
 * How often to recheck the BioAuthOracle for bio-authorized data
 */
const CYCLE_CHECK_BIOAUTH = 5_000;

/**
 * How often to recheck the storage for an event from a sent txn.
 */
const CYCLE_CHECK_TXN_CONFIRM = 5_000;

/**
 * How often to recheck storage for AF status
 */
const CYCLE_CHECK_AF_STATUS = 5_000;

export const loader = async ({ params }: LoaderArgs) => {
  const identifier = params.identityId;
  return json({ identifier });
};

type AFS = {
  key: string;
  value: {
    type: string;
    provider: string;
    revision: number;
  };
  isPending: boolean;
}[];

const optsAFTypes = [
  // TODO: { value: AuthNType.operator, text: 'Operator Key', disabled: true },
  { value: '', text: '- Select a Type -', disabled: true },
  { value: '1', text: 'Operator Key', disabled: true },
  { value: '2', text: 'Password', disabled: false },
  { value: '3', text: 'Biometric', disabled: true },
  { value: '4', text: 'Crypto Wallet', disabled: true },
  { value: '6', text: 'Proof of Human', disabled: false },
];

const optsAFProviders = [
  { value: '', text: '- Select a Provider -', disabled: true },
  { value: '1', text: 'Self', disabled: false },
  { value: '2', text: 'zkHumans', disabled: false },
  { value: '3', text: 'Humanode', disabled: false },
  { value: '4', text: 'WebAuthn', disabled: false },
];

export default function Identity() {
  const navigate = useNavigate();
  const { identifier } = useLoaderData<typeof loader>();
  const appContext = useAppContext();
  const { cnsl, zk } = appContext;

  const [signature, setSignature] = useState(null as null | WalletSignedData);
  const [transaction, setTransaction] = useState(null as null | string);
  const [transactionHash, setTransactionHash] = useState(
    undefined as undefined | null | string
  );
  const [txnWatchCounter, setTxnWatchCounter] = useState(0);
  const [afWatchCounter, setAFWatchCounter] = useState(0);
  const [newAFKey, setNewAFKey] = useState(undefined as undefined | string);

  const route = 'routes/identities.$identityId.af_.$authnId';
  const routeData = useRouteLoaderData(route);
  const authNFactorKey = routeData?.authNFactorKey;

  const nav = (s: string) => () => navigate(s);

  ////////////////////////////////////////////////////////////////////////
  // Identity Management
  ////////////////////////////////////////////////////////////////////////

  async function handleDestroyIdentity() {
    cnsl.log('info', 'Destroying Identity...');

    if (!zk.state.account || !identifier) {
      cnsl.log('error', 'ERROR: identity and/or account not available');
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
    // TODO: security!!!
    // use signature and/or on-chain proof to destroy identity
    // ~~for now, just clear it from DB~~ --> indexer deletes from events
    ////////////////////////////////////////////////////////////////////////
    // X: const x = await trpc.smt.clear.mutate({ id: identity.id });
    // X: cnsl.log(x ? 'success' : 'error', 'Destroyed Identity:', identity.id);
    cnsl.log('error', 'TOOD: Destroyed Identity:', identifier);

    appContext.data.refresh();
  }

  ////////////////////////////////////////////////////////////////////////
  // AuthNFactor Management
  ////////////////////////////////////////////////////////////////////////

  const [authNFactors, setAuthNFactors] = useState([] as AFS);
  const [selectedAFType, setSelectedAFType] = useState(optsAFTypes[0].value);
  const [selectedAFProvider, setSelectedAFProvider] = useState(
    optsAFProviders[0].value
  );
  const [inputPassword, setInputPassword] = useState('');

  // load authentication factors from storage
  useEffect(() => {
    (async () => {
      // dynamically load libs for in-browser only, avoid ERR_REQUIRE_ESM
      const { IDUtils } = await import('@zkhumans/utils-client');

      if (identifier) {
        const afs_ = await IDUtils.getAuthNFactors(identifier);
        const afs = [] as AFS;
        let hasPending = false;
        for (const af of Object.keys(afs_)) {
          afs.push({
            key: af,
            value: IDUtils.humanReadableAuthNFactor(afs_[af]),
            isPending: afs_[af].isPending,
          });
          if (afs_[af].isPending) hasPending = true;
        }
        setAuthNFactors(() => afs);

        // continually reload if any AFs are pending
        if (hasPending) {
          await delay(CYCLE_CHECK_AF_STATUS);
          setAFWatchCounter((x) => x + 1);
        }
      }
    })();
  }, [identifier, transactionHash, afWatchCounter]);

  function handleAddAF_changeType(event: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedAFType(event.target.value);
    setSelectedAFProvider(optsAFProviders[0].value);
  }

  function handleAddAF_changeProvider(
    event: React.ChangeEvent<HTMLSelectElement>
  ) {
    setSelectedAFProvider(event.target.value);
  }

  function handleAddAF_inputPassword(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    setInputPassword(event.target.value);
  }

  function handleAddAF_close() {
    setSelectedAFType(optsAFTypes[0].value);
    setSelectedAFProvider(optsAFProviders[0].value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).modal_1.close();
  }

  function handleAddAF_open() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).modal_1.showModal();
  }

  ////////////////////////////////////////////////////////////////////////
  // Bioauth
  ////////////////////////////////////////////////////////////////////////

  const [bioAuthState, setBioAuthState] = useState({
    auth: null as null | string,
    link: null as null | string,
    id: null as null | string,
    recheckCounter: 0,
  });

  // continually check a pending BioAuth when there is a link for it
  useEffect(() => {
    (async () => {
      if (identifier && bioAuthState.link && !bioAuthState.auth) {
        const { IDUtils } = await import('@zkhumans/utils-client');
        const [id, auth] = await IDUtils.getBioAuth(identifier);
        if (auth) {
          cnsl.log('success', 'BioAuthorization received');
          setBioAuthState((s) => ({ ...s, auth, id }));
          zk.setIs((s) => ({ ...s, authing: false }));
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
    zk.setIs((s) => ({ ...s, authing: true }));
    const { IDUtils } = await import('@zkhumans/utils-client');
    const [id] = await IDUtils.getBioAuth(identifier);
    const link = await IDUtils.getBioAuthLink(id);
    setBioAuthState((s) => ({
      ...s,
      id,
      link,
      recheckCounter: bioAuthState.recheckCounter + 1,
    }));
  }

  ////////////////////////////////////////////////////////////////////////

  // wait for transaction confirmation
  useEffect(() => {
    (async () => {
      if (!transactionHash) return; // only for txn success
      if (!txnWatchCounter) cnsl.tic('Awaiting transaction confirmation...');
      const event = await trpc.event.select.query({ transactionHash });

      // if an event from the transaction was recorded by storage
      if (event.length) {
        cnsl.toc('success');

        // refresh data and reset state
        appContext.data.refresh();
        resetState();

        // redirect UI to the its page
        navigate(`./af/${newAFKey}`);
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

  async function handleAddAF_prepareProof() {
    zk.setIs((s) => ({ ...s, proving: true }));
    try {
      cnsl.tic('Preparing add AuthNFactor Proof...');

      // confirm requirements availability
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
      const { BioAuthorizedMessage } = await import('@zkhumans/snarky-bioauth');
      const { Identifier } = await import('@zkhumans/utils');
      const { IDUtils } = await import('@zkhumans/utils-client');

      ////////////////////////////////////////////////////////////////////////
      // init Identity from storage
      ////////////////////////////////////////////////////////////////////////
      const idf = Identifier.fromBase58(identifier).toField();
      const mmIdentity = await IDUtils.getStoredMerkleMap(idf.toString());
      const identity = Identity.init({
        identifier: idf,
        commitment: mmIdentity.getRoot(),
      });

      ////////////////////////////////////////////////////////////////////////
      // prove Identity ownership by proving inclusion of operator key (secret)
      // within Identity Merkle Tree
      ////////////////////////////////////////////////////////////////////////
      cnsl.tic('> Creating Identity ownership Merkle Proof...');
      const secret = IDUtils.getOperatorKeySecret(identifier, signature);
      if (!secret || secret === '') throw new Error('op key secret failed');

      const afOperatorKey = AuthNFactor.init({
        protocol: {
          type: AuthNType.operator,
          provider: AuthNProvider.zkhumans,
          revision: 0,
        },
        data: { salt: IDUtils.IDENTITY_MGR_SALT, secret },
      });

      const witnessOpKey = mmIdentity.getWitness(afOperatorKey.getKey());
      cnsl.toc('success');

      // default to AFType password (for cheap types)
      let oracleMsg = BioAuthorizedMessage.dummy();
      let af = AuthNFactor.init({
        protocol: {
          type: AuthNType.password,
          provider: AuthNProvider.self,
          revision: 0,
        },
        data: {
          salt: IDUtils.IDENTITY_MGR_SALT,
          secret: inputPassword,
        },
      });
      switch (selectedAFType) {
        // password
        case '2':
          cnsl.tic('> Adding password as Authentication Factor...');
          if (inputPassword === '') throw new Error('no password');
          cnsl.toc('success');
          break;

        // proof-of-person
        case '6':
          ////////////////////////////////////////////////////////////////////////
          // add Bioauth as Authentication Factor
          ////////////////////////////////////////////////////////////////////////
          cnsl.tic('> Adding Bioauth as Authentication Factor...');
          if (!bioAuthState.auth) throw new Error('no bioauthorization');
          oracleMsg = BioAuthorizedMessage.fromJSON(
            JSON.parse(bioAuthState.auth)
          );
          af = AuthNFactor.init({
            protocol: {
              type: AuthNType.proofOfPerson,
              provider: AuthNProvider.humanode,
              revision: 0,
            },
            data: {
              salt: IDUtils.IDENTITY_MGR_SALT,
              secret: oracleMsg.bioAuthId.toString(),
            },
          });
          cnsl.toc('success');
          break;

        default:
          throw new Error(`unhandled AuthNFactor type: ${selectedAFType}`);
      }

      // prove the AuthNFactor IS NOT (yet) in the Identity Keyring MT
      const witnessKeyring = mmIdentity.getWitness(af.getKey());

      ////////////////////////////////////////////////////////////////////////
      // prove identifier IS in the Identity Manager MT, thus can be updated
      ////////////////////////////////////////////////////////////////////////
      cnsl.tic('> Creating Identity update Merkle Proof...');
      const mmMgr = await IDUtils.getManagerMM(zkApp.identityManager.address);
      const witnessManager = mmMgr.getWitness(identity.identifier);
      cnsl.toc('success');

      ////////////////////////////////////////////////////////////////////////
      // prepare transaction
      ////////////////////////////////////////////////////////////////////////
      cnsl.tic('> Preparing transaction...');
      const tx = await snarkyjs.Mina.transaction(() => {
        zkApp.identityManager.addAuthNFactor(
          af,
          afOperatorKey,
          identity,
          witnessOpKey,
          witnessKeyring,
          witnessManager,
          oracleMsg
        );
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
      setNewAFKey(() => af.getKey().toString());
    } catch (
      err: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
      cnsl.toc('error', `ERROR: ${err.message}`);
      cnsl.toc('error');
      console.log('ERROR', err);
    }

    appContext.data.refresh();
    zk.setIs((s) => ({ ...s, proving: false }));
  }

  async function handleSendTransaction() {
    if (!transaction) return;
    const hash = await zk.sendTransaction(transaction);
    setTransactionHash(() => hash);
    appContext.data.refresh();
    handleAddAF_close();
  }

  const handleNothing = () => {
    return false;
  };

  const resetState = () => {
    setAFWatchCounter(() => 0);
    setSignature(() => null);
    setTransaction(() => null);
    setTransactionHash(() => undefined);
    setTxnWatchCounter(() => 0);
    setNewAFKey(() => undefined);
    setInputPassword(() => '');
    setBioAuthState(() => ({
      auth: null,
      link: null,
      id: null,
      recheckCounter: 0,
    }));
  };

  ////////////////////////////////////////////////////////////////////////

  if (!identifier) return <Alert type="error">Identity not found.</Alert>;

  // // for testing UI:
  // useState(() => {
  //   // setTransactionHash(() => undefined); // not sent
  //   // setTransactionHash(() => null); // error
  //   setTransactionHash(() => 'XXXXXXXXXXXXXXXXXXX'); // success
  // });

  const hasSignature = signature !== null;
  const hasTransaction = transaction !== null;
  const hasZKApp = zk.state.zkApp !== null;
  const hasSentTxn = transactionHash !== undefined;
  const hasTxnSuccess = hasSentTxn && transactionHash !== null;
  const hasOutlet = useMatches().length > 3;
  const hasBioAuth = bioAuthState.auth !== null;
  const needsBioAuth = bioAuthState.link && !hasBioAuth;
  const hasUserInput = selectedAFType !== '' && selectedAFProvider !== '';

  const btnDisabled = 'btn btn-disabled normal-case';
  const btnSuccess = 'btn btn-success normal-case';
  const btnTodo = 'btn btn-primary normal-case';
  const btnWarning = 'btn btn-warning normal-case';

  const tableAuthNFactors = (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th className="">Authentication Factor</th>
            <th className="">Provider</th>
            <th>
              <div className="grid justify-items-center">Revision</div>
            </th>
            <th>
              <div className="grid justify-items-center">Status</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {authNFactors.map((af, index) => (
            <tr
              key={index}
              className={`hover:bg-base-200 cursor-pointer ${
                af.key == authNFactorKey ? 'bg-base-300' : ''
              }`}
              onClick={nav(`./af/${af.key}`)}
            >
              <td>{af.value.type}</td>
              <td>{af.value.provider}</td>
              <td>
                <div className="grid justify-items-center">
                  {af.value.revision}
                </div>
              </td>
              <td>
                <div className="grid justify-items-center">
                  {af.isPending ? <IconPending /> : <IconNotPending />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const modalAddAuthNFactor = (
    <dialog id="modal_1" className="modal">
      <form method="dialog" className="modal-box w-full max-w-xs">
        <h3 className="text-center text-lg font-bold">
          Add Authentication Factor
        </h3>
        <div className="my-4 flex flex-col space-y-4">
          <select
            onChange={handleAddAF_changeType}
            className="select select-bordered input-primary w-full max-w-xs"
            value={selectedAFType}
          >
            {optsAFTypes.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.text}
              </option>
            ))}
          </select>

          {/* Password */}
          {selectedAFType == '2' && (
            <>
              <input
                id="input_password"
                type="password"
                placeholder="Enter a password"
                className="input input-bordered input-primary w-full max-w-xs"
                value={inputPassword}
                onChange={handleAddAF_inputPassword}
              />
              <select
                onChange={handleAddAF_changeProvider}
                className="select select-bordered input-primary w-full max-w-xs"
                value={selectedAFProvider}
              >
                {optsAFProviders.map(
                  (o) =>
                    ['', '1'].includes(o.value) && (
                      <option
                        key={o.value}
                        value={o.value}
                        disabled={o.disabled}
                      >
                        {o.text}
                      </option>
                    )
                )}
              </select>
            </>
          )}

          {/* Proof of Human (BioAuth) */}
          {selectedAFType == '6' && (
            <>
              <select
                onChange={handleAddAF_changeProvider}
                className="select select-bordered input-primary w-full max-w-xs"
                value={selectedAFProvider}
              >
                {optsAFProviders.map(
                  (o) =>
                    ['', '3'].includes(o.value) && (
                      <option
                        key={o.value}
                        value={o.value}
                        disabled={o.disabled}
                      >
                        {o.text}
                      </option>
                    )
                )}
              </select>

              {selectedAFProvider !== '' && (
                <>
                  <div
                    className={hasBioAuth ? btnSuccess : btnTodo}
                    onClick={hasBioAuth ? handleNothing : handleBioAuth}
                  >
                    {zk.is.authing && <Spinner />}
                    BioAuthorize
                  </div>

                  {needsBioAuth && (
                    <p>
                      Use the following link to bioauthorize this identifier
                      with the <b>BioAuth Oracle</b> then return here to
                      continue:{' '}
                      <Link
                        to={bioAuthState.link ?? ''}
                        target="_blank"
                        className="link link-accent"
                        rel="noreferrer"
                      >
                        BioAuth={displayAccount(bioAuthState.id ?? '', 8, 8)}
                      </Link>
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {/* actions common to all AuthNFactors */}
          {/* Note: <button> within <form> closes modal, so use <div> */}
          {hasUserInput && (
            <>
              <div
                className={hasSignature ? btnSuccess : btnTodo}
                onClick={hasSignature ? handleNothing : handleSignature}
              >
                {zk.is.signing && <Spinner />}
                Sign with Operator Key
              </div>
              <div
                className={hasZKApp ? btnSuccess : btnTodo}
                onClick={hasZKApp ? handleNothing : handleCompileZkApp}
              >
                {zk.is.compiling && <Spinner />}
                Compile zkApp
              </div>
              <div
                className={
                  hasTransaction
                    ? btnSuccess
                    : hasZKApp &&
                      hasSignature &&
                      (needsBioAuth ? hasBioAuth : true)
                    ? btnTodo
                    : btnDisabled
                }
                onClick={handleAddAF_prepareProof}
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
            </>
          )}
        </div>
        <div className="modal-action">
          <div className="btn normal-case" onClick={handleAddAF_close}>
            Cancel
          </div>
        </div>
      </form>
    </dialog>
  );

  return (
    <div className="divide-y rounded-xl border border-neutral-400">
      {/* Heading */}
      <div className="bg-base-300 flex flex-col items-center rounded-t-xl p-1">
        <div className="my-4 text-lg font-bold">
          <Link to={`/identities/${identifier}`}>{identifier}</Link>
        </div>
      </div>

      {/* Table of AuthNFactors */}
      <div className="w-full">{tableAuthNFactors}</div>

      {/* Optional Outlet */}
      {hasOutlet && (
        <div className="w-full">
          <Outlet context={appContext} />
        </div>
      )}

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
                {displayAccount(transactionHash, 8, 8)}
              </Link>
              . Awaiting confirmation. <Spinner />
            </Alert>
          ) : (
            <Alert type="error">Error sending transaction.</Alert>
          ))}

        {/* Buttons */}
        <div className="flex flex-row justify-center space-x-4">
          <button
            className="btn btn-primary normal-case"
            onClick={handleAddAF_open}
          >
            Add Authentication Factor
          </button>
          <button
            className={hasSentTxn ? btnDisabled : btnWarning}
            onClick={handleDestroyIdentity}
          >
            Destroy Identity
          </button>
        </div>
      </div>

      {/* Modal to add AuthNFactor */}
      {modalAddAuthNFactor}
    </div>
  );
}
