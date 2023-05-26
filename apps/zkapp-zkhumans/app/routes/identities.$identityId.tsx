import { useLoaderData } from '@remix-run/react';
import { json, LoaderArgs } from '@remix-run/node';
import { trpc } from '@zkhumans/trpc-client';
import { useAppContext } from '../root';
import { Alert } from '../components';

export const loader = async ({ params }: LoaderArgs) => {
  const id = params.identityId;
  const identity = id ? await trpc.smt.get.query({ id }) : null;
  return json({ identity });
};

export default function Identity() {
  const { identity } = useLoaderData<typeof loader>();
  const appContext = useAppContext();
  const { cnsl, zk } = appContext;

  async function handleDestroyIdentity() {
    cnsl.log('info', 'Destroying Identity...');

    if (!zk.state.account || !identity) {
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
    // for now, just clear it from DB
    ////////////////////////////////////////////////////////////////////////
    const x = await trpc.smt.clear.mutate({ id: identity.id });
    cnsl.log(x ? 'success' : 'error', 'Destroyed Identity:', identity.id);

    appContext.data.refresh();
  }

  return (
    <div className="my-10 flex flex-col items-center space-y-8">
      {!identity && <Alert type="error">Identity not found.</Alert>}

      {identity && (
        <div>
          <div>
            <h1>ID={identity.id}</h1>
          </div>
          <button
            className="btn btn-primary gap-2 normal-case"
            onClick={handleDestroyIdentity}
          >
            Destroy Identity
          </button>
        </div>
      )}
    </div>
  );
}
