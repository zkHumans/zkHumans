import { authenticator } from '~/auth.server';
import { redirect } from '@remix-run/node';
import type { ActionFunction, LoaderFunction } from '@remix-run/node';

export const loader: LoaderFunction = () => redirect('/login');

export const action: ActionFunction = ({ request }) =>
  authenticator.authenticate('humanode', request);
