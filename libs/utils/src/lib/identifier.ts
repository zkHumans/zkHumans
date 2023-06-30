import { Field, Poseidon, PublicKey } from 'snarkyjs';
import { versionBytes } from './constants';
import {
  bigintFromUint8Array,
  bigintToUint8Array,
  fromBase58Check,
  toBase58Check,
} from './base58';

export class Identifier {
  private asField: Field;
  private asBase58: string;

  private constructor(asField: Field, asBase58: string) {
    this.asField = asField;
    this.asBase58 = asBase58;
  }

  /**
   * Create an Identifier using a PublicKey as a determinstic seed and an index
   * of variation.
   */
  static fromPublicKey(publicKey: PublicKey, index: number) {
    // create a hash from pubkey and an offset
    const hash = Poseidon.hash([...publicKey.toFields(), Field(index)]);

    // it's a long number... shorten it to match publicKey base58 length
    // a BigInt of 40 digits produces base58 string of aprox length 55 (in our implementation)
    const s1 = hash.toBigInt().toString();
    const s2 = s1.substring(0, 40);

    // convert the number to base58 with a checksum
    const base58 = toBase58Check(
      bigintToUint8Array(BigInt(s2)),
      versionBytes.identifier
    );

    // convert it back to bigint to validate the checksum
    const b = bigintFromUint8Array(
      fromBase58Check(base58, versionBytes.identifier)
    );

    // create the Identifier with both formats of the number
    return new Identifier(Field(b), base58);
  }

  static fromBase58(base58: string) {
    const b = bigintFromUint8Array(
      fromBase58Check(base58, versionBytes.identifier)
    );
    return new Identifier(Field(b), base58);
  }

  static fromField(f: Field) {
    const base58 = toBase58Check(
      bigintToUint8Array(f.toBigInt()),
      versionBytes.identifier
    );
    return new Identifier(f, base58);
  }

  toBase58() {
    return this.asBase58;
  }

  toField() {
    return this.asField;
  }
}
