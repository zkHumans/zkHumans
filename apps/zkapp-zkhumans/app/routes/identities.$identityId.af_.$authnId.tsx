import { useEffect, useState } from 'react';
import { LoaderArgs, json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import { displayAccount, transactionLink } from '@zkhumans/utils';
import { ApiOutputStorageByKeyWithEvents, trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';

export const loader = async ({ params }: LoaderArgs) => {
  const identifier = params.identityId;
  const authNFactorKey = params.authnId;
  return json({ identifier, authNFactorKey });
};

export default function TODO() {
  const appContext = useAppContext();
  const { identifier, authNFactorKey } = useLoaderData<typeof loader>();
  const [storage, setStorage] = useState(
    undefined as undefined | ApiOutputStorageByKeyWithEvents
  );

  useEffect(() => {
    (async () => {
      if (!authNFactorKey) return;
      const storage = await trpc.storage.byKeyWithEvents.query({
        key: authNFactorKey,
      });
      setStorage(() => storage);
    })();
  }, []);

  if (!storage) return <></>;

  const tableEvents = (
    <table className="table">
      <thead>
        <tr>
          <th>type</th>
          <th>block</th>
          <th>transaction</th>
        </tr>
      </thead>
      <tbody>
        {storage.events.map((ev) => (
          <tr key={ev.id}>
            <td>{ev.type}</td>
            <td>{ev.blockHeight.toString()}</td>
            <td>
              <Link
                to={transactionLink(ev.transactionHash)}
                target="_blank"
                className="link"
                rel="noreferrer"
              >
                {displayAccount(ev.transactionHash, 8, 8)}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="overflow-x-auto p-2">
      <table className="table">
        <tbody>
          <tr>
            <th>Storage Key</th>
            <td>{displayAccount(authNFactorKey + '', 20, 20)}</td>
          </tr>
          <tr>
            <th>Pending ?</th>
            <td>{storage.isPending ? 'Y' : 'N'}</td>
          </tr>
          <tr>
            <th>Checksum</th>
            <td>{displayAccount(storage.settlementChecksum + '', 20, 20)}</td>
          </tr>
          <tr>
            <th>Created At</th>
            <td>{storage.createdAt.toISOString()}</td>
          </tr>
          <tr>
            <th>Updated At</th>
            <td>{storage.updatedAt.toISOString()}</td>
          </tr>
          <tr>
            <th>Events</th>
            <td>{tableEvents}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
