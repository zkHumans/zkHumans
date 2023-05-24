import { Link } from '@remix-run/react';
import { useAppContext } from '../root';

export default function Index() {
  const { zk } = useAppContext();
  return (
    <div className="my-10 flex flex-col items-center space-y-8">
      <div className="flex flex-col items-center">
        <h1 className="text-2xl font-bold">zkHumans</h1>
        <h1 className="text-1xl font-bold">Anon CryptoBiometric Memberships</h1>
      </div>
      {zk.state.zkApp && zk.state.hasAccount && (
        <Link to={'./identity/new'}>
          <button className="btn btn-primary normal-case">Create New ID</button>
        </Link>
      )}
    </div>
  );
}
