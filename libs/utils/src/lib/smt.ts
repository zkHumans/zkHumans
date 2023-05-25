import { SparseMerkleTree } from 'snarky-smt';
import { Field } from 'snarkyjs';

import type { Provable } from 'snarkyjs';

export type SmtDbData = {
  id: string;
  root: string;
  txns: {
    value: string | null;
    key: string;
    txn: string;
  }[];
};

/**
 * replay db-stored SMT transactions to restore in-memory SMT
 */
export async function smtApplyTransactions<K, V>(
  smt: SparseMerkleTree<K, V>,
  KeyType: Provable<K>,
  ValueType: Provable<V>,
  data: SmtDbData
) {
  for (const txn of data.txns) {
    switch (txn.txn) {
      case 'update':
        if (txn.value)
          await smt.update(
            smtStringToValue(txn.key, KeyType),
            smtStringToValue(txn.value, ValueType)
          );
        break;
      case 'delete':
        await smt.delete(smtStringToValue(txn.key, KeyType));
        break;
    }
  }
}

////////////////////////////////////////////////////////////////////////
// smt key:value ⇄ string conversion utils, from snarky-smt store(s)
////////////////////////////////////////////////////////////////////////

/**
 * Convert a string to Field array.
 *
 * @param {string} str
 * @return {*} {Field[]}
 */
export function smtStringToFieldArray(str: string): Field[] {
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
export function smtStringToValue<V>(valueStr: string, eltTyp: Provable<V>): V {
  const fs = smtStringToFieldArray(valueStr);
  return eltTyp.fromFields(fs, eltTyp.toAuxiliary());
}

/**
 * Serialize the value of the FieldElements type into a string
 *
 * @param {V} value
 * @return {*} {string}
 */
export function smtValueToString<V>(value: V, eltTyp: Provable<V>): string {
  const valueStr = eltTyp.toFields(value).toString();
  return valueStr;
}
