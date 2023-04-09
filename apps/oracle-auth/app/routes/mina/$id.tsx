import type { LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import invariant from 'tiny-invariant';

import { getCachedBioAuth } from '~/mina.server';

// CORS
const headers = {
  'Access-Control-Allow-Origin': '*',
};

export async function loader({ params }: LoaderArgs) {
  invariant(params.id, 'id required');
  const bioAuth = await getCachedBioAuth(params.id);
  if (!bioAuth)
    throw new Response('Not Found', {
      status: 404,
      headers,
    });
  return json(bioAuth, { headers });
}
