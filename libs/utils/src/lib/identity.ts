import { Field, Poseidon, PublicKey } from 'snarkyjs';

/**
 * Given an array of Fields, which can be from PublicKey.toFields(), derive and
 * return a number of identity identifiers from it, in Base58 string format.
 *
 * This provides a deterministic method for associating an account with
 * multiple identifiers. By starting with the `offset` as an incrementing
 * counter, a hash is produced from the fields and the counter.
 */
export function generateIdentifiers(
  fields: Field[],
  count = 1,
  offset = 0
): string[] {
  const identifiers: string[] = [];
  for (let i = offset; i < offset + count; i++) {
    const hash = Poseidon.hash([...fields, Field(i)]);
    identifiers.push(identifierToBase58(hash));
  }
  return identifiers;
}

export function generateIdentifierKeys(
  publicKey: PublicKey,
  count = 1,
  offset = 0
): PublicKey[] {
  const identifiers: PublicKey[] = [];
  const fields = publicKey.toFields();
  for (let i = offset; i < offset + count; i++) {
    publicKey.x = Poseidon.hash([...fields, Field(i)]);
    const f = publicKey.toFields();
    const p = PublicKey.fromFields(f);
    identifiers.push(p);
  }
  return identifiers;
}

// NOTE: 2023-05-26 Some snarkyjs base58 functions were not exported that could
// be useful, so use PublicKey.x as intermediary to convert a Field to/from
// a Base58 string.

/**
 * Convert Field to Base58 string.
 *
 * @param {} field
 * @returns {} string
 */
export function identifierToBase58(field: Field): string {
  const publicKey = PublicKey.fromBase58(
    'B62qopBsmjrjY6wbJPDHFXB7QbCjvo3G3hqm3KkvaUhdkp3z6fVppK8'
  );
  publicKey.x = field;
  return publicKey.toBase58().replace(/^B62q/, 'zkHM');
}

/**
 * Convert Base58 string to Field.
 *
 * @param {} identifier
 * @returns {} Field
 */
export function identifierFromBase58(identifier: string): Field {
  const pk = identifier.replace(/^zkHM/, 'B62q');
  const publicKey = PublicKey.fromBase58(pk);
  return publicKey.x;
}
