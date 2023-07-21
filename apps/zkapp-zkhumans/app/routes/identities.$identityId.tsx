import { Link, Outlet, useLoaderData, useMatches } from '@remix-run/react';
import { json, LoaderArgs } from '@remix-run/node';
import { trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';
import { Alert } from '../components';
import { useEffect, useState } from 'react';

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

  function handleAddAF_add() {
    console.log(
      'TODO: add AuthNFactor!',
      `type=${selectedAFType}, provider=${selectedAFProvider}`
    );
    handleAddAF_close();
  }

  function handleAddAF_close() {
    setSelectedAFType(optsAFTypes[0].value);
    setSelectedAFProvider(optsAFProviders[0].value);
    (window as any).modal_1.close();
  }

  ////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////
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
          onClick={() => (window as any).modal_1.showModal()}
        >
          Add Authentication Factor
        </button>
        {/*
        <Link to={'./authn/new'}>
          <button className="btn btn-primary normal-case">
            Add AuthN Factor
          </button>
        </Link>
        */}
        <button
          className="btn btn-warning normal-case"
          onClick={handleDestroyIdentity}
        >
          Destroy Identity
        </button>
      </div>

      {/* Modal to add AuthNFactor */}
      <dialog id="modal_1" className="modal">
        <form method="dialog" className="modal-box">
          <h3 className="text-lg font-bold">
            Prepare to Add Authentication Factor
          </h3>
          <div className="my-4 flex flex-col space-y-4">
            <select
              onChange={handleAddAF_changeType}
              className="select select-bordered w-full max-w-xs"
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
                  className="input input-bordered w-full max-w-xs"
                />
                <select
                  onChange={handleAddAF_changeProvider}
                  className="select select-bordered w-full max-w-xs"
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

            {/* Proof of Human */}
            {selectedAFType == '6' && (
              <>
                <select
                  onChange={handleAddAF_changeProvider}
                  className="select select-bordered w-full max-w-xs"
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
              </>
            )}
          </div>
          <div className="modal-action">
            <div className="btn normal-case" onClick={handleAddAF_close}>
              Cancel
            </div>
            <div
              className="btn btn-primary normal-case"
              onClick={handleAddAF_add}
            >
              Add
            </div>
          </div>
        </form>
      </dialog>
    </div>
  );
}
