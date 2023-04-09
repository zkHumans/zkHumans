import type { LoaderArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { json } from '@remix-run/node';

import type { AuthenticatedUser } from '~/auth.server';
import { authenticator } from '~/auth.server';
import { sessionStorage } from '~/session.server';
import { FormBioAuth } from '~/ui/FormBioAuth';

type LoaderData = {
  auth: AuthenticatedUser;
  error?: { message: string };
};

export async function loader({ request }: LoaderArgs) {
  const auth = await authenticator.isAuthenticated(request);

  // check for an error in the session "flash" message
  const session = await sessionStorage.getSession(
    request.headers.get('Cookie')
  );
  let error = session.get(authenticator.sessionErrorKey) as unknown;

  // check for the error in the URL, as returned by humanode Oauth2, for example:
  // {
  //   error: "login request denied",
  //   error_description: "You canceled the authentication process",
  //   state: "22222222-eeee-4444-bbbb-888888888888",
  // }
  if (!error) {
    const url = new URL(request.url);
    const uError = [
      url.searchParams.get('error'),
      url.searchParams.get('error_description'),
    ];
    if (uError[0]) error = { message: uError.join(': ') };
  }

  return json(
    { auth, error },
    {
      headers: {
        // necessary to clear the authentication "flash" message
        'Set-Cookie': await sessionStorage.commitSession(session),
      },
    }
  );
}

export default function Login() {
  const data = useLoaderData() as LoaderData;

  return (
    <div className="flex h-screen flex-col items-center justify-center space-y-6">
      {data.error && (
        <div className="font-bold text-red-500">{data.error?.message}</div>
      )}
      <FormBioAuth />
    </div>
  );
}
