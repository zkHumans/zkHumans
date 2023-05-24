import { Field, Provable } from 'snarkyjs';
import { Store } from 'snarky-smt';

export { TrpcStore };

const enum SetType {
  nodes = 0,
  values = 1,
}

const enum OperationType {
  put = 0,
  del = 1,
}

/**
 * Store based on memory
 *
 * @class TrpcStore
 * @implements {Store<V>}
 * @template V
 */
class TrpcStore<V> implements Store<V> {
  protected nodesMap: Map<string, Field[]>;
  protected valuesMap: Map<string, V>;
  protected eltTyp: Provable<V>;
  protected smtName: string;
  protected trpc: any;

  protected operationCache: {
    opType: OperationType;
    setType: SetType;
    k: string;
    v: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }[];

  /**
   * Creates an instance of TrpcStore.
   * @param {Provable<V>} eltTyp
   * @param {string} smtName
   * @memberof TrpcStore
   */
  constructor(trpc: any, eltTyp: Provable<V>, smtName: string) {
    this.nodesMap = new Map<string, Field[]>();
    this.valuesMap = new Map<string, V>();
    this.operationCache = [];
    this.eltTyp = eltTyp;
    this.smtName = smtName;
    this.trpc = trpc;
  }

  /**
   * Clear all prepare operation cache.
   *
   * @memberof TrpcStore
   */
  public clearPrepareOperationCache(): void {
    this.operationCache = [];
  }

  /**
   * Get the tree root. Error is thrown when the root does not exist.
   *
   * @return {*}  {Promise<Field>}
   * @memberof TrpcStore
   */
  public async getRoot(): Promise<Field> {
    const fs = this.nodesMap.get('root');
    if (fs && fs.length == 1) {
      return fs[0];
    } else {
      throw new Error('Root does not exist');
    }
  }

  /**
   * Prepare update the root. Use the commit() method to actually submit changes.
   *
   * @param {Field} root
   * @memberof TrpcStore
   */
  public prepareUpdateRoot(root: Field): void {
    this.operationCache.push({
      opType: OperationType.put,
      setType: SetType.nodes,
      k: 'root',
      v: [root],
    });
  }

  /**
   * Get nodes for a key. Error is thrown when a key that does not exist is being accessed.
   *
   * @param {Field} key
   * @return {*}  {Promise<Field[]>}
   * @memberof TrpcStore
   */
  public async getNodes(key: Field): Promise<Field[]> {
    const keyStr = key.toString();
    const nodes = this.nodesMap.get(keyStr);
    if (nodes) {
      return nodes;
    } else {
      throw new Error('invalid key: ' + keyStr);
    }
  }

  /**
   * Prepare put nodes for a key. Use the commit() method to actually submit changes.
   *
   * @param {Field} key
   * @param {Field[]} value
   * @memberof TrpcStore
   */
  public preparePutNodes(key: Field, value: Field[]): void {
    this.operationCache.push({
      opType: OperationType.put,
      setType: SetType.nodes,
      k: key.toString(),
      v: value,
    });
  }

  /**
   * Prepare delete nodes for a key. Use the commit() method to actually submit changes.
   *
   * @param {Field} key
   * @memberof TrpcStore
   */
  public prepareDelNodes(key: Field): void {
    this.operationCache.push({
      opType: OperationType.del,
      setType: SetType.nodes,
      k: key.toString(),
      v: undefined,
    });
  }

  /**
   * Get the value for a key. Error is thrown when a key that does not exist is being accessed.
   *
   * @param {Field} path
   * @return {*}  {Promise<V>}
   * @memberof TrpcStore
   */
  public async getValue(path: Field): Promise<V> {
    const pathStr = path.toString();
    const v = this.valuesMap.get(pathStr);

    if (v) {
      return v;
    } else {
      throw new Error('invalid key: ' + pathStr);
    }
  }

  /**
   * Prepare put the value for a key. Use the commit() method to actually submit changes.
   *
   * @param {Field} path
   * @param {V} value
   * @memberof TrpcStore
   */
  public preparePutValue(path: Field, value: V): void {
    this.operationCache.push({
      opType: OperationType.put,
      setType: SetType.values,
      k: path.toString(),
      v: value,
    });
  }

  /**
   * Prepare delete the value for a key. Use the commit() method to actually submit changes.
   *
   * @param {Field} path
   * @memberof TrpcStore
   */
  public prepareDelValue(path: Field): void {
    this.operationCache.push({
      opType: OperationType.del,
      setType: SetType.values,
      k: path.toString(),
      v: undefined,
    });
  }

  /**
   * Use the commit() method to actually submit all prepare changes.
   *
   * @return {*}  {Promise<void>}
   * @memberof TrpcStore
   */
  public async commit(): Promise<void> {
    for (let i = 0, len = this.operationCache.length; i < len; i++) {
      const v = this.operationCache[i];
      if (v.opType === OperationType.put) {
        if (v.setType === SetType.nodes) {
          this.nodesMap.set(v.k, v.v);
        } else {
          this.valuesMap.set(v.k, v.v);
        }
      } else {
        if (v.setType === SetType.nodes) {
          this.nodesMap.delete(v.k);
        } else {
          this.valuesMap.delete(v.k);
        }
      }
    }

    // console.log(
    //   '[commit] current nodes size: ',
    //   this.nodesMap.size,
    //   ', current values size: ',
    //   this.valuesMap.size
    // );

    this.clearPrepareOperationCache();
  }

  /**
   * Clear the store.
   *
   * @return {*}  {Promise<void>}
   * @memberof TrpcStore
   */
  public async clear(): Promise<void> {
    this.nodesMap.clear();
    this.valuesMap.clear();
  }

  /**
   * Get values map, key is Field.toString().
   *
   * @return {*}  {Promise<Map<string, V>>}
   * @memberof TrpcStore
   */
  public async getValuesMap(): Promise<Map<string, V>> {
    return this.valuesMap;
  }
}
