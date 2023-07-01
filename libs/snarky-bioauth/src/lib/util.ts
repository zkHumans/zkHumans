import { Field } from 'snarkyjs';
import {
  bigintFromUint8Array,
  bigintToUint8Array,
  fromBase58Check,
  toBase58Check,
  versionBytes,
} from '@zkhumans/utils';

/**
 * Convert bio-auth payload (Field) to Base58 string.
 *
 * @param {} payload
 * @returns {} string
 */
export function payloadToBase58(payload: Field): string {
  const bi = payload.toBigInt();
  const u8 = bigintToUint8Array(bi);
  return toBase58Check(u8, versionBytes.bioauthPayload);
}

/**
 * Convert Base58 string to bio-auth payload (Field).
 *
 * @param {} id
 * @returns {} Field
 */
export function payloadFromBase58(id: string): Field {
  const u8 = fromBase58Check(id, versionBytes.bioauthPayload);
  const bi = bigintFromUint8Array(u8);
  return Field(bi);
}
