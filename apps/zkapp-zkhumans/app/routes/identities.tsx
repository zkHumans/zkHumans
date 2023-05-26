import { trpc } from '@zkhumans/trpc-client';
import { Alert } from '../components';
import { useAppContext } from '../root';
import { useEffect, useState } from 'react';

import type { ApiSmtGetOutput } from '@zkhumans/trpc-client';
import { Link, Outlet } from '@remix-run/react';
import { displayAccount } from '@zkhumans/utils';

export default function Identities() {
  const appContext = useAppContext();
  const { cnsl, zk } = appContext;

  const [identities, setIdentities] = useState(
    [] as NonNullable<ApiSmtGetOutput>[]
  );

  useEffect(() => {
    (async () => {
      if (zk.state.account) {
        const id = await trpc.smt.get.query({ id: zk.state.account });
        if (id) setIdentities(() => [id]);
        else cnsl.log('info', 'No identities, create one!');
      }
    })();
  }, [zk.state.account]);

  const tableIdentities = (
    <div className="w-full overflow-x-auto ">
      <table className="table w-full">
        {/* head */}
        <thead>
          <tr>
            <th>ID</th>
            <th className="">Identifier</th>
          </tr>
        </thead>
        <tbody>
          {identities.map((id, index) => (
            <tr key={index} className="hover">
              <th>0</th>
              <td>
                <Link to={`./${id.id}`}>{displayAccount(id.id)}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const hasIdentities = identities.length > 0;

  return (
    <div className="flex flex-row gap-4 p-2">
      {/* Sidebar */}
      <div className="card card-compact bg-base-300 w-1/4 border border-neutral-400">
        <div className="card-body items-center space-y-2 text-center">
          <h2 className="card-title">Identities</h2>
          <div className="card-actions justify-end">
            <Link to={'./new'}>
              <button className="btn btn-primary normal-case">New</button>
            </Link>
          </div>
          {hasIdentities && tableIdentities}
        </div>
      </div>

      {/* Content */}
      <div className="w-3/4">
        {zk.state.hasAccount && <Outlet context={appContext} />}

        {!zk.state.hasAccount && (
          <div className="w-full p-8">
            <Alert type="error">Connect Wallet To Create Identities</Alert>
          </div>
        )}
      </div>
    </div>
  );
}
