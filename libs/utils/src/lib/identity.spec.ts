import { CircuitString, Poseidon, PrivateKey } from 'snarkyjs';
import {
  generateIdentifiers,
  identifierFromBase58,
  identifierToBase58,
} from './identity';

describe('utils/identity', () => {
  const acct = PrivateKey.random().toPublicKey();

  it('generateIdentifiers', () => {
    const identifiers = generateIdentifiers(acct.toFields(), 5);
    console.log(identifiers);
    expect(identifiers.length).toEqual(5);
  });

  it('identifierToBase58 --> identifierFromBase58', () => {
    const og = Poseidon.hash(acct.toFields());
    const to = identifierToBase58(og);
    const from = identifierFromBase58(to);

    expect(from.toString()).toEqual(og.toString());
  });

  it('identifierFromBase58 --> identifierToBase58', () => {
    const og = 'zkHMnuVm4NUcadLosfrvBDZXURPrHp5jyLNZazwbBjL96cn5HpBnKnh';
    const from = identifierFromBase58(og);
    const to = identifierToBase58(from);

    expect(to).toEqual(og);
  });
});
