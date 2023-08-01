import { useEffect, useState } from 'react';
import { LoaderArgs, json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import { displayAccount, transactionLink } from '@zkhumans/utils';
import { ApiOutputStorageByKeyWithEvents, trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';
import { Spinner } from '../components';

export const loader = async ({ params }: LoaderArgs) => {
  const identifier = params.identityId;
  const authNFactorKey = params.authnId;
  return json({ identifier, authNFactorKey });
};

export default function TODO() {
  const appContext = useAppContext();
  const { cnsl, zk } = appContext;
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
  }, [authNFactorKey]);

  if (!storage) return <></>;

  function handleDelAF_close() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).modal_3.close();
  }

  function handleDelAF_open() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).modal_3.showModal();
  }

  const handleNothing = () => {
    return false;
  };

  // TODO: placeholders, these should be extracted to useZKApp hook
  const handleSignature = () => {
    return false;
  };
  const handleCompileZkApp = () => {
    return false;
  };
  const handleSendTransaction = () => {
    return false;
  };
  const handleDelAF_prepareProof = () => {
    return false;
  };
  const hasSignature = false;
  const hasZKApp = false;
  const hasTransaction = false;
  const hasNotPendingAF = false;

  // const hasNotPendingAF = storage && !storage.isPending;

  const btnDisabled = 'btn btn-disabled normal-case';
  const btnSuccess = 'btn btn-success normal-case';
  const btnTodo = 'btn btn-primary normal-case';
  const btnWarning = 'btn btn-warning normal-case';

  const modalDelAF = (
    <dialog id="modal_3" className="modal">
      <form method="dialog" className="modal-box w-full max-w-xs">
        <h3 className="text-center text-lg font-bold">
          Remove Authentication Factor
        </h3>
        <div className="my-4 flex flex-col space-y-4">
          {/* Note: <button> within <form> closes modal, so use <div> */}
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
                  : hasZKApp && hasSignature
                  ? btnTodo
                  : btnDisabled
              }
              onClick={handleDelAF_prepareProof}
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
        </div>
        <div className="modal-action">
          <div className="btn normal-case" onClick={handleDelAF_close}>
            Cancel
          </div>
        </div>
      </form>
    </dialog>
  );

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

      {/* Buttons */}
      <div className="flex flex-row justify-center space-x-4">
        <button
          className={hasNotPendingAF ? btnWarning : btnDisabled}
          onClick={handleDelAF_open}
        >
          Remove Authentication Factor
        </button>
      </div>

      {/* Modal to remove AuthNFactor */}
      {modalDelAF}
    </div>
  );
}
