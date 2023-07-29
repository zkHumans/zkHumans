import { Encoding, Field, Poseidon, PrivateKey, Signature } from 'snarkyjs';
import invariant from 'tiny-invariant';
import { sha256 } from 'js-sha256';

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

////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////
// TODO: import { payloadFromBase58 } from '@zkhumans/snarky-bioauth';
//
// ...Temporary duplication to workaround ERR_REQUIRE_ESM...
////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

const alphabet =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.split('');
const inverseAlphabet: Record<string, number> = {};
alphabet.forEach((c, i) => {
  inverseAlphabet[c] = i;
});

function fromBase(digits: bigint[], base: bigint) {
  if (base <= 0n) throw Error('fromBase: base must be positive');
  // compute powers base, base^2, base^4, ..., base^(2^k)
  // with largest k s.t. n = 2^k < digits.length
  const basePowers = [];
  for (let power = base, n = 1; n < digits.length; power **= 2n, n *= 2) {
    basePowers.push(power);
  }
  const k = basePowers.length;
  // pad digits array with zeros s.t. digits.length === 2^k
  digits = digits.concat(Array(2 ** k - digits.length).fill(0n));
  // accumulate [x0, x1, x2, x3, ...] -> [x0 + base*x1, x2 + base*x3, ...] -> [x0 + base*x1 + base^2*(x2 + base*x3), ...] -> ...
  // until we end up with a single element
  for (let i = 0; i < k; i++) {
    const newDigits = Array(digits.length >> 1);
    const basePower = basePowers[i];
    for (let j = 0; j < newDigits.length; j++) {
      newDigits[j] = digits[2 * j] + basePower * digits[2 * j + 1];
    }
    digits = newDigits;
  }
  console.assert(digits.length === 1);
  const [digit] = digits;
  return digit;
}

function fromBase58(base58: string) {
  const base58Digits = [...base58].map((c) => {
    const digit = inverseAlphabet[c];
    if (digit === undefined) throw Error('fromBase58: invalid character');
    return BigInt(digit);
  });
  let z = 0;
  while (base58Digits[z] === 0n) z++;
  let digits = changeBase(base58Digits.reverse(), 58n, 256n).reverse();
  digits = Array(z).fill(0n).concat(digits);
  return digits.map(Number);
}

function arrayEqual(a: unknown[], b: unknown[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function toBase(x: bigint, base: bigint) {
  if (base <= 0n) throw Error('toBase: base must be positive');
  // compute powers base, base^2, base^4, ..., base^(2^k)
  // with largest k s.t. base^(2^k) < x
  const basePowers = [];
  for (let power = base; power < x; power **= 2n) {
    basePowers.push(power);
  }
  let digits = [x]; // single digit w.r.t base^(2^(k+1))
  // successively split digits w.r.t. base^(2^j) into digits w.r.t. base^(2^(j-1))
  // until we arrive at digits w.r.t. base
  const k = basePowers.length;
  for (let i = 0; i < k; i++) {
    const newDigits = Array(2 * digits.length);
    const basePower = basePowers[k - 1 - i];
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j];
      const high = x / basePower;
      newDigits[2 * j + 1] = high;
      newDigits[2 * j] = x - high * basePower;
    }
    digits = newDigits;
  }
  // pop "leading" zero digits
  while (digits[digits.length - 1] === 0n) {
    digits.pop();
  }
  return digits;
}

function changeBase(digits: bigint[], base: bigint, newBase: bigint) {
  // 1. accumulate digits into one gigantic bigint `x`
  const x = fromBase(digits, base);
  // 2. compute new digits from `x`
  const newDigits = toBase(x, newBase);
  return newDigits;
}

function computeChecksum(input: number[] | Uint8Array) {
  const hash1 = sha256.create();
  hash1.update(input);
  const hash2 = sha256.create();
  hash2.update(hash1.array());
  return hash2.array().slice(0, 4);
}

function fromBase58Check(base58: string, versionByte: number) {
  // throws on invalid character
  const bytes = fromBase58(base58);
  // check checksum
  const checksum = bytes.slice(-4);
  const originalBytes = bytes.slice(0, -4);
  const actualChecksum = computeChecksum(originalBytes);
  if (!arrayEqual(checksum, actualChecksum))
    throw Error('fromBase58Check: invalid checksum');
  // check version byte
  if (originalBytes[0] !== versionByte)
    throw Error(
      `fromBase58Check: input version byte ${versionByte} does not match encoded version byte ${originalBytes[0]}`
    );
  // return result
  return originalBytes.slice(1);
}

function bigintFromUint8Array(x: Uint8Array | number[]) {
  const decoder = new TextDecoder('utf-8');
  const decoded = decoder.decode(Uint8Array.from(x));
  return BigInt(decoded);
}

// for base58 checksum, modeled after snarkyjs
// https://github.com/o1-labs/snarkyjs-bindings/blob/main/crypto/constants.ts
export const versionBytes = {
  identifier: 180,
  bioauthPayload: 144,
};

function payloadFromBase58(id: string): Field {
  const u8 = fromBase58Check(id, versionBytes.bioauthPayload);
  const bi = bigintFromUint8Array(u8);
  return Field(bi);
}

////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////
