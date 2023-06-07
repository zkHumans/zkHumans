import { Field, PrivateKey } from 'snarkyjs';
import { jest } from '@jest/globals';
import { Identity } from './IdentityManager';
import { smtStringToValue, smtValueToString } from '@zkhumans/utils';

const verbose = false;

const acct = PrivateKey.random();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const log = (...args: any[]) => {
  if (verbose) console.log(args);
};

describe('Identity', () => {
  jest.setTimeout(1000 * 100);

  // convert Identity to String and back again
  it('valueToString <--> stringToValue | Identity', () => {
    const identity = new Identity({
      publicKey: acct.toPublicKey(),
      commitment: Field(0),
    });
    log('Identity as Value (original)', JSON.stringify(identity));

    const toStr = smtValueToString(identity, Identity);
    log('Identity as String', toStr);

    const toVal = smtStringToValue(toStr, Identity);
    log('Identity as Value', JSON.stringify(toVal));

    expect(identity.commitment).toEqual(toVal.commitment);
    expect(identity.publicKey).toEqual(toVal.publicKey);
  });
});
