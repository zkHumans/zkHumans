import { Link, Outlet, useLoaderData, useMatches } from '@remix-run/react';
import { json, LoaderArgs } from '@remix-run/node';
import { trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';
import { Alert } from '../components';
import { useEffect, useState } from 'react';

export const loader = async ({ params }: LoaderArgs) => {
  const identifier = params.identityId;
  // X: const identity = id ? await trpc.smt.get.query({ id }) : null;
  // X: return json({ identity });
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

export default function Identity() {
  const { identifier } = useLoaderData<typeof loader>();
  const appContext = useAppContext();
  const { cnsl, zk } = appContext;

  const [authNFactors, setAuthNFactors] = useState([] as AFS);

  useEffect(() => {
    (async () => {
      // dynamically load libs for in-browser only, avoid ERR_REQUIRE_ESM
      const { IdentityClientUtils } = await import('@zkhumans/utils-client');
      const IDUtils = IdentityClientUtils;

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
        <Link to={'./authn/new'}>
          <button className="btn btn-primary normal-case">
            Add AuthN Factor
          </button>
        </Link>
        <button
          className="btn btn-warning normal-case"
          onClick={handleDestroyIdentity}
        >
          Destroy Identity
        </button>
      </div>
    </div>
  );
}
