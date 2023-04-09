// TODO: move to app/routes/auth/humanode/callback
import type { LoaderFunction } from '@remix-run/node';
import { redirect } from '@remix-run/node';

import { authenticator } from '~/auth.server';
import { sessionStorage } from '~/session.server';

export const loader: LoaderFunction = async ({ request }) => {
  // if errors in the callback url, forward them to be shown on the login page
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  if (error) return redirect(`/login${url.search}`);

  // check for a return route to redirect to upon successful auth
  const session = await sessionStorage.getSession(
    request.headers.get('Cookie')
  );
  const successRedirect = session.has('returnTo')
    ? session.get('returnTo')
    : '/dashboard';

  return authenticator.authenticate('humanode', request, {
    successRedirect,
    failureRedirect: '/login',
  });
};
