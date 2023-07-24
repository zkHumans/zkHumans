import { json } from '@remix-run/node';
import invariant from 'tiny-invariant';
import { PrivateKey } from 'snarkyjs';

// CORS
const headers = {
  'Access-Control-Allow-Origin': '*',
};

export async function loader() {
  invariant(
    process.env.AUTH_MINA_PRIVATE_KEY,
    'AUTH_MINA_PRIVATE_KEY must be set'
  );
  const privateKey = PrivateKey.fromBase58(process.env.AUTH_MINA_PRIVATE_KEY);
  const publicKey = privateKey.toPublicKey();
  const meta = {
    publicKey,
  };
  return json(meta, { headers });
}
