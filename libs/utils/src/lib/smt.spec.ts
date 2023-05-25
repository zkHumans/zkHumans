import { CircuitString, PrivateKey } from 'snarkyjs';
import { smtStringToValue, smtValueToString } from './smt';

const acct = PrivateKey.random();

describe('utils/smt', () => {
  // convert CircuitString to String and back again
  it('valueToString <--> stringToValue | CircuitString', () => {
    const cs = CircuitString.fromString(acct.toPublicKey().toBase58());
    console.log('CircuitString as Value (original)', JSON.stringify(cs));

    const toStr = smtValueToString(cs, CircuitString);
    console.log('CircuitString as String', toStr);

    const toVal = smtStringToValue(toStr, CircuitString);
    console.log('CircuitString as Value', JSON.stringify(toVal));

    expect(cs.toString()).toEqual(toVal.toString());
  });
});
