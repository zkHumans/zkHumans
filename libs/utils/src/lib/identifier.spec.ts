import { PrivateKey } from 'snarkyjs';
import { Identifier, generateIdentifiers } from './identifier';

const privateKey = PrivateKey.random();
const publicKey = privateKey.toPublicKey();

describe('utils/identifier', () => {
  it('generateIdentifiers', () => {
    const identifiers = generateIdentifiers(publicKey, 5);
    console.log(identifiers);
    expect(identifiers.length).toEqual(5);
  });

  it('Identifier.toBase58 -> Identifier.fromBase58', () => {
    const i = Identifier.fromPublicKey(publicKey, 1);
    const to = i.toBase58();
    const from = Identifier.fromBase58(to).toBase58();
    expect(to).toEqual(from);
  });
});
