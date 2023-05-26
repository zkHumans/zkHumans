import { Field } from 'snarkyjs';
import { SparseMerkleTree } from 'snarky-smt';
import type { Provable } from 'snarkyjs';
import {
  stringToFieldArray,
  stringToValue,
  valueToString,
} from './3rdparty/snarky-smt';

export type SmtDbData = {
  id: string;
  root: string;
  txns: {
    value: string | null;
    key: string;
    txn: string;
  }[];
};

////////////////////////////////////////////////////////////////////////
// smt key:value ⇄ string conversion utils, from snarky-smt store(s)
// rename to give "namespace"
////////////////////////////////////////////////////////////////////////

export function smtStringToFieldArray(str: string): Field[] {
  return stringToFieldArray(str);
}
export function smtStringToValue<V>(valueStr: string, eltTyp: Provable<V>): V {
  return stringToValue(valueStr, eltTyp);
}
export function smtValueToString<V>(value: V, eltTyp: Provable<V>): string {
  return valueToString(value, eltTyp);
}

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
