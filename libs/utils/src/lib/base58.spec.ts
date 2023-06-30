import { Poseidon, PrivateKey } from 'snarkyjs';
import {
  bigintFromBase58,
  bigintFromUint8Array,
  bigintToUint8Array,
  bigintToBase58,
  fromBase58Check,
  toBase58Check,
} from './base58';

const privateKey = PrivateKey.random();
const publicKey = privateKey.toPublicKey();

describe('utils/base58', () => {
  it('bigint -> base58 -> bigint', () => {
    const og = Poseidon.hash(publicKey.toFields()).toBigInt();
    const tob58 = bigintToBase58(og);
    const fromb58 = bigintFromBase58(tob58);
    expect(fromb58).toEqual(og);
  });

  it('base58 -> bigint -> base58', () => {
    const og =
      'MyubLaiAUdidqEiaVBrwH5wZq8F7G7sBXo9k76LwcbtNE66k7N613pcHtkjehChUbPPGnCdSVAuxX8ng5tpAAnP1wFb9U6ChwiVneq7No';
    const fromb58 = bigintFromBase58(og);
    const tob58 = bigintToBase58(fromb58);
    expect(tob58).toEqual(og);
  });

  it('{to -> from}Base58Check', () => {
    const versionBytes = 200;

    const og = Poseidon.hash(publicKey.toFields()).toBigInt();
    const tob58 = toBase58Check(bigintToUint8Array(og), versionBytes);
    const fromb58 = fromBase58Check(tob58, versionBytes);
    const conv = bigintFromUint8Array(fromb58);

    expect(conv).toEqual(og);
  });
});
