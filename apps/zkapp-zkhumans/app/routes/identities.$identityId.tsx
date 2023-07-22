import { Link, Outlet, useLoaderData, useMatches } from '@remix-run/react';
import { json, LoaderArgs } from '@remix-run/node';
import { trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';
import { Alert } from '../components';
import { useEffect, useState } from 'react';
import { displayAccount } from '@zkhumans/utils';

import type { WalletSignedData } from '../hooks';

/**
 * How often to recheck the BioAuthOracle for bio-authorized data
 */
const CYCLE_CHECK_BIOAUTH = 5_000;

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
  const { identifier } = useLoaderData<typeof loader>();
  const appContext = useAppContext();
  const { cnsl, zk } = appContext;

  const [signature, setSignature] = useState(null as null | WalletSignedData);
  const [transaction, setTransaction] = useState(null as null | string);
  const [transactionHash, setTransactionHash] = useState(null as null | string);

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

  // load authentication factors from storage
  useEffect(() => {
    (async () => {
      // dynamically load libs for in-browser only, avoid ERR_REQUIRE_ESM
      const { IDUtils } = await import('@zkhumans/utils-client');

      if (identifier) {
        const afs_ = await IDUtils.getAuthNFactors(identifier);
        const afs = [] as AFS;
        for (const af of Object.keys(afs_))
          afs.push({
            key: af,
            value: IDUtils.humanReadableAuthNFactor(afs_[af]),
          });
        setAuthNFactors(() => afs);
      }
    })();
  }, [identifier]);

  function handleAddAF_changeType(event: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedAFType(event.target.value);
    setSelectedAFProvider(optsAFProviders[0].value);
  }

  function handleAddAF_changeProvider(
    event: React.ChangeEvent<HTMLSelectElement>
  ) {
    setSelectedAFProvider(event.target.value);
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
      const { delay } = await import('@zkhumans/utils');
      if (identifier && bioAuthState.link && !bioAuthState.auth) {
        const { IDUtils } = await import('@zkhumans/utils-client');
        const [id, auth] = await IDUtils.getBioAuth(identifier);
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
    const { IDUtils } = await import('@zkhumans/utils-client');
    const [id, auth] = await IDUtils.getBioAuth(identifier);

    if (auth) {
      cnsl.log('success', 'BioAuthorization received');
      setBioAuthState((s) => ({ ...s, auth, id }));
    } else {
      cnsl.log('info', 'Awaiting BioAuthorization...');
      const link = await IDUtils.getBioAuthLink(id);
      setBioAuthState((s) => ({ ...s, id, link }));
    }
  }

  ////////////////////////////////////////////////////////////////////////

  async function handleCompileZkApp() {
    await zk.compile(); // this takes forever!
  }

  // get wallet signature of identifier
  async function handleSignature() {
    if (!identifier) return;
    const signedData = await zk.getSignedMessage(identifier);
    setSignature(() => signedData);
  }

  async function handlePrepareProofAddAuthNFactorBioAuth() {
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
      if (!bioAuthState.auth) throw new Error('no bioauthorization');

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
      const [root] = witnessOpKey.computeRootAndKey(afOperatorKey.getValue());
      if (!mmIdentity.getRoot().equals(root).toBoolean())
        throw new Error('Identity ownership Merkle Proof failed');
      cnsl.toc('success');

      ////////////////////////////////////////////////////////////////////////
      // add Bioauth as Authentication Factor
      // prove the AuthNFactor IS NOT (yet) in the Identity Keyring MT
      ////////////////////////////////////////////////////////////////////////
      cnsl.tic('> Adding Bioauth as Authentication Factor...');
      const afBioAuth = AuthNFactor.init({
        protocol: {
          type: AuthNType.proofOfPerson,
          provider: AuthNProvider.humanode,
          revision: 0,
        },
        data: {
          salt: IDUtils.IDENTITY_MGR_SALT,
          secret: BioAuthorizedMessage.fromJSON(
            JSON.parse(bioAuthState.auth)
          ).bioAuthId.toString(),
        },
      });
      const witnessKeyring = mmIdentity.getWitness(afBioAuth.getKey());
      cnsl.toc('success');

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
          afBioAuth,
          identity,
          witnessKeyring,
          witnessManager
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

  async function handleSendProofAddAuthNFactorBioAuth() {
    // TODO
  }

  const handleNothing = () => {
    return false;
  };

  ////////////////////////////////////////////////////////////////////////

  if (!identifier) return <Alert type="error">Identity not found.</Alert>;

  const tableAuthNFactors = (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th className="grid justify-items-center">#</th>
            <th className="">Authentication Factor</th>
            <th className="">Provider</th>
            <th className="grid justify-items-center">Revision</th>
          </tr>
        </thead>
        <tbody>
          {authNFactors.map((af, index) => (
            <tr key={af.key} className="hover:bg-base-200">
              <th className="grid justify-items-center">
                <Link to={`./authn/${af.key}/edit`}>{index}</Link>
              </th>
              <td>{af.value.type}</td>
              <td>{af.value.provider}</td>
              <td className="grid justify-items-center">{af.value.revision}</td>
            </tr>
          ))}
          {/*
          {factors.map((af, index) => (
            <tr key={index} className="hover">
              <th className="grid justify-items-center">
                <Link to={`./authn/${index}/edit`}>{index}</Link>
              </th>
              <td>{af.type}</td>
              <td>{af.provider}</td>
              <td className="grid justify-items-center">{af.revision}</td>
            </tr>
          ))}
          */}
        </tbody>
      </table>
    </div>
  );

  const hasOutlet = useMatches().length > 3;
  const hasBioAuth = bioAuthState.auth !== null;
  const hasSignature = signature !== null;
  const hasTransaction = transaction !== null;
  const hasZKApp = zk.state.zkApp !== null;
  const needsBioAuth = bioAuthState.link && !hasBioAuth;
  const hasUserInput = selectedAFType !== '' && selectedAFProvider !== '';

  const btnDisabled = 'btn normal-case btn-disabled';
  const btnSuccess = 'btn normal-case btn-success';
  const btnTodo = 'btn normal-case btn-primary';

  return (
    <div className="divide-y rounded-xl border border-neutral-400">
      {/* Heading */}
      <div className="bg-base-300 flex flex-col items-center rounded-t-xl p-1">
        <div className="my-4 text-xl font-bold">{identifier}</div>
      </div>

      {/* Table of AuthNFactors */}
      <div className="w-full">{tableAuthNFactors}</div>

      {/* Optional Outlet */}
      {hasOutlet && (
        <div className="w-full">
          <Outlet context={appContext} />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-row justify-center space-x-4 p-4">
        <button
          className="btn btn-primary normal-case"
          onClick={handleAddAF_open}
        >
          Add Authentication Factor
        </button>
        <button
          className="btn btn-warning normal-case"
          onClick={handleDestroyIdentity}
        >
          Destroy Identity
        </button>
      </div>

      {/* Modal to add AuthNFactor */}
      {/* Note: <button> within <form> closes modal, so use <div> */}
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
            {hasUserInput && (
              <>
                <div
                  className={hasSignature ? btnSuccess : btnTodo}
                  onClick={hasSignature ? handleNothing : handleSignature}
                >
                  Sign with Operator Key
                </div>
                <div
                  className={hasZKApp ? btnSuccess : btnTodo}
                  onClick={hasZKApp ? handleNothing : handleCompileZkApp}
                >
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
                  onClick={handlePrepareProofAddAuthNFactorBioAuth}
                >
                  Prepare Proof
                </div>
                <div
                  className={hasTransaction ? btnTodo : btnDisabled}
                  onClick={handleSendProofAddAuthNFactorBioAuth}
                >
                  Send Proof
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
    </div>
  );
}
