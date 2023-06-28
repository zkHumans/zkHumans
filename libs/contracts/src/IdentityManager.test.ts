import { Field, PrivateKey } from 'snarkyjs';
import { jest } from '@jest/globals';
import { Identity } from './IdentityManager';

const acct = PrivateKey.random();

describe('IdentityManager', () => {
  jest.setTimeout(1000 * 100);

  // convert Identity to String and back again
  it('toJSON <--> fromJSON | Identity', () => {
    const identity = new Identity({
      identifier: acct.toPublicKey(),
      commitment: Field(1111),
    });

    const toJSON = Identity.toJSON(identity);
    const fromJSON = Identity.fromJSON(toJSON);

    expect(
      identity.identifier.equals(fromJSON.identifier).toBoolean()
    ).toBeTruthy();

    expect(
      identity.commitment.equals(fromJSON.commitment).toBoolean()
    ).toBeTruthy();
  });
});
