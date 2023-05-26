import { Field } from 'snarkyjs';
import type { Provable } from 'snarkyjs';

/**
 * Convert a string to Field array.
 *
 * @param {string} str
 * @return {*} {Field[]}
 */
export function stringToFieldArray(str: string): Field[] {
  const sarr = str.split(',');
  const fs: Field[] = [];

  for (let i = 0, len = sarr.length; i < len; i++) {
    const v = sarr[i];
    fs.push(new Field(v));
  }

  return fs;
}

/**
 * Convert value string to a value of FieldElements type.
 *
 * @param {string} valueStr
 * @param {AsFieldElements<V>} eltTyp
 * @return {*} {V}
 */
export function stringToValue<V>(valueStr: string, eltTyp: Provable<V>): V {
  const fs = stringToFieldArray(valueStr);
  return eltTyp.fromFields(fs, eltTyp.toAuxiliary());
}

/**
 * Serialize the value of the FieldElements type into a string
 *
 * @param {V} value
 * @return {*} {string}
 */
export function valueToString<V>(value: V, eltTyp: Provable<V>): string {
  const valueStr = eltTyp.toFields(value).toString();
  return valueStr;
}
