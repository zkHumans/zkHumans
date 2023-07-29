import { Encoding, Field, Poseidon, PrivateKey, Signature } from 'snarkyjs';
import invariant from 'tiny-invariant';
import { payloadFromBase58 } from '@zkhumans/snarky-bioauth';

import { cache } from './cache.server';

const TTL = Number(process.env.AUTH_BIOAUTH_TTL) ?? 1000 * 60 * 10;

invariant(
  process.env.AUTH_MINA_PRIVATE_KEY,
  'AUTH_MINA_PRIVATE_KEY must be set'
);
const AUTH_MINA_PRIVATE_KEY = process.env.AUTH_MINA_PRIVATE_KEY;

export async function cacheBioAuth(id: string, data: any) {
  cache.set(id, JSON.stringify(data), TTL);
}

export async function getCachedBioAuth(id: string): Promise<any | undefined> {
  return cache.has(id) ? JSON.parse(cache.get(id) as string) : undefined;
}

export async function getSignedBioAuth(_id: string, _bioAuthId: string) {
  // The private key of our account.
  const privateKey = PrivateKey.fromBase58(AUTH_MINA_PRIVATE_KEY);

  // Compute the public key associated with our private key
  const publicKey = privateKey.toPublicKey();

  // Define a Field with the value of the id
  const payload = payloadFromBase58(_id);

  // Define a Field with the current timestamp
  const timestamp = Field(Date.now());

  // Define a Field with the bioAuthId
  const bioAuthId = Poseidon.hash(Encoding.stringToFields(_bioAuthId));

  // Use our private key to sign an array of Fields containing the data
  const signature = Signature.create(privateKey, [
    payload,
    timestamp,
    bioAuthId,
  ]);

  return {
    data: { payload, timestamp, bioAuthId },
    signature: signature,
    publicKey: publicKey,
  };
}
