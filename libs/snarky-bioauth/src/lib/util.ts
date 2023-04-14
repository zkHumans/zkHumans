import { Field, PublicKey } from 'snarkyjs';

// utilities to convert bioauth payloads (Poseidon hashes) to Base58 strings
// using snarkyjs' implementation

// TODO/NOTE: HACK !! 2022-12-13 Some snarkyjs base58 functions were not
// exported that could be useful, so use PublicKey.x as intermediary

/**
 * Convert bio-auth payload (Field) to Base58 string.
 *
 * @param {} payload
 * @returns {} string
 */
export function payloadToBase58(payload: Field): string {
  const publicKey = PublicKey.fromBase58(
    'B62qkZwEYr2j1d2BdB4CqbRJa7F1GTXPM4MmSzi9THjKK9RMYHH1qKJ'
  );
  publicKey.x = payload;
  return publicKey.toBase58();
}

/**
 * Convert Base58 string to bio-auth payload (Field).
 *
 * @param {} id
 * @returns {} Field
 */
export function payloadFromBase58(id: string): Field {
  const publicKey = PublicKey.fromBase58(id);
  return publicKey.x;
}
