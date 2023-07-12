import { Field } from 'snarkyjs';
import { jest } from '@jest/globals';
import { Identity } from './IdentityManager';

describe('IdentityManager', () => {
  jest.setTimeout(1000 * 100);

  // convert Identity to String and back again
  it('toJSON <--> fromJSON | Identity', () => {
    const identity = Identity.init({
      identifier: Field(1111),
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
