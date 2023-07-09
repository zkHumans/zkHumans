import { Field } from 'snarkyjs';
import { jest } from '@jest/globals';
import { Identity } from './IdentityManager';

describe('IdentityManager', () => {
  jest.setTimeout(1000 * 100);

  // convert Identity to String and back again
  it('toJSON <--> fromJSON | Identity', () => {
    const identity = Identity.init({
      key: Field(1111),
      value: Field(1111),
    });

    const toJSON = Identity.toJSON(identity);
    const fromJSON = Identity.fromJSON(toJSON);

    expect(identity.key.equals(fromJSON.key).toBoolean()).toBeTruthy();

    expect(identity.value.equals(fromJSON.value).toBoolean()).toBeTruthy();
  });
});
