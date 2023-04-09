import { authenticator } from '~/auth.server';
import type { LoaderFunction } from '@remix-run/node';

export const loader: LoaderFunction = async ({ request }) =>
  await authenticator.logout(request, { redirectTo: '/login' });
