import {
  Link,
  Outlet,
  useNavigate,
  useRouteLoaderData,
} from '@remix-run/react';
import { Alert, IconPending, IconNotPending } from '../components';
import { useAppContext } from '../root';
import { displayAccount } from '@zkhumans/utils';

export default function Identities() {
  const navigate = useNavigate();
  const appContext = useAppContext();
  const {
    data: { identities },
    zk,
  } = appContext;

  const routeData = useRouteLoaderData('routes/identities.$identityId');
  const identifier = routeData?.identifier;

  const nav = (s: string) => () => navigate(s);

  const tableIdentities = (
    <div className="w-full overflow-x-auto ">
      <table className="table">
        <thead>
          <tr>
            <th>
              <div className="grid justify-items-center">Status</div>
            </th>
            <th className="">Identifier</th>
          </tr>
        </thead>
        <tbody>
          {identities.map((id, index) => (
            <tr
              key={index}
              className={`hover:bg-base-200 cursor-pointer ${
                id.base58 == identifier ? 'bg-base-100' : ''
              }`}
              onClick={nav(`./${id.base58}`)}
            >
              <td>
                <div className="grid justify-items-center">
                  {id.isPending ? <IconPending /> : <IconNotPending />}
                </div>
              </td>
              <td>{displayAccount(id.base58)}</td>
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
