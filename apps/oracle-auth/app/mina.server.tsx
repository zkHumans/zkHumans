import {
  Encoding,
  Field,
  Poseidon,
  PrivateKey,
  PublicKey,
  Signature,
  isReady,
} from 'snarkyjs';
import invariant from 'tiny-invariant';

import { cache } from './cache.server';

const TTL = Number(process.env.AUTH_BIOAUTH_TTL) ?? 1000 * 60 * 10;

export async function cacheBioAuth(id: string, data: any) {
  cache.set(id, JSON.stringify(data), TTL);
}

export async function getCachedBioAuth(id: string): Promise<any | undefined> {
  return cache.has(id) ? JSON.parse(cache.get(id) as string) : undefined;
}

// from snarky-bioauth library
function payloadFromBase58(id: string): Field {
  const publicKey = PublicKey.fromBase58(id);
  return publicKey.x;
}

export async function getSignedBioAuth(_id: string, _bioAuthId: string) {
  invariant(
    process.env.AUTH_MINA_PRIVATE_KEY,
    'AUTH_MINA_PRIVATE_KEY must be set'
  );

  // wait for SnarkyJS to finish loading
  await isReady;

  // The private key of our account.
  const privateKey = PrivateKey.fromBase58(process.env.AUTH_MINA_PRIVATE_KEY);

  // Compute the public key associated with our private key
  const publicKey = privateKey.toPublicKey();

  // Define a Field with the value of the id
  const payload = Field(payloadFromBase58(_id));

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
