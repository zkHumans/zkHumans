import { Link, Outlet } from '@remix-run/react';
import { Alert } from '../components';
import { useAppContext } from '../root';
import { displayAccount } from '@zkhumans/utils';

export default function Identities() {
  const appContext = useAppContext();
  const {
    data: { identities },
    zk,
  } = appContext;

  const tableIdentities = (
    <div className="w-full overflow-x-auto ">
      <table className="table w-full">
        <thead>
          <tr>
            <th>#</th>
            <th className="">Identifier</th>
          </tr>
        </thead>
        <tbody>
          {identities.map((id, index) => (
            <tr key={index} className="hover">
              <th>{index}</th>
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
