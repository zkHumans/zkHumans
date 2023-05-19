import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useCatch, useLoaderData } from '@remix-run/react';
import invariant from 'tiny-invariant';

import { isAuthenticated, requireAuthenticatedUser } from '~/auth.server';
import { getSignedBioAuth, cacheBioAuth } from '~/mina.server';
import { sessionStorage } from '~/session.server';
import { ButtonLink } from '~/ui/ButtonLink';
import { FormBioAuth } from '~/ui/FormBioAuth';

export async function loader({ request, params }: LoaderArgs) {
  invariant(params.id, 'id required');
  let bioAuth = null;
  const isAuthed = await isAuthenticated(request);
  const session = await sessionStorage.getSession(
    request.headers.get('Cookie')
  );
  const thisRoute = `/mina/auth/${params.id}`;

  if (isAuthed) {
    // if authenticated, get the signed bioAuth and cache it
    const auth = await requireAuthenticatedUser(request);
    bioAuth = await getSignedBioAuth(params.id, auth.id);
    if (bioAuth) await cacheBioAuth(params.id, bioAuth);

    session.unset('returnTo');
  } else {
    // if not authenticated, stash the requested bioAuthId to return after auth
    session.set('returnTo', thisRoute);
  }

  return json(
    { bioAuth, isAuthed, thisRoute },
    {
      headers: {
        'Set-Cookie': await sessionStorage.commitSession(session),
      },
    }
  );
}

export default function MinaHumanodeAuth() {
  const { bioAuth, isAuthed, thisRoute } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col items-center space-y-8 ">
      <div className="flex flex-col items-center">
        <h1 className="text-2xl font-bold">Mina x Humanode</h1>
        <h1 className="text-1xl font-bold">Zero-Knowledge Oracle</h1>
      </div>
      {isAuthed || <FormBioAuth />}
      {bioAuth && (
        <>
          <div className="flex text-center">
            Your crypto-biometric authorization of the data has been signed.
            <br />
            You may close this window and return to the requesting zkApp.
          </div>
          <div className="rounded border border-gray-700 bg-gray-200 px-2 py-2 text-xs text-black">
            <pre>{JSON.stringify(bioAuth, null, 2)}</pre>
          </div>
        </>
      )}
      {isAuthed && (
        <div className="flex flex-row space-x-8">
          {bioAuth && <ButtonLink to={thisRoute}>Re-Sign</ButtonLink>}
          <ButtonLink to="/logout">Logout</ButtonLink>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  console.error(error);

  return <div>An unexpected error occurred: {error.message}</div>;
}

export function CatchBoundary() {
  const caught = useCatch();

  // if (caught.status === 404) {
  //   return <div>BioAuth not found</div>;
  // }

  throw new Error(`Unexpected caught response with status: ${caught.status}`);
}
