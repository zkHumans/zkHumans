import { Field, MerkleMapWitness, Poseidon, Struct } from 'snarkyjs';

export function zkkv(): string {
  return 'zkkv';
}

/**
 * Naming Conventions
 * - x0 : state change from current/previous/initial
 * - x1 : state change to new/pending/latest
 */

/**
 * An individual unit of key:value store.
 *
 * It can be a Store and/or data within a Store.
 *
 * Recursive in nature as it is an element within another which is itself a
 * unit of store whereby:
 * - key   = unique identifier as a key within another Store
 * - value = commitment (root hash) representing contents
 */
export class UnitOfStore extends Struct({
  key: Field,
  value: Field,
  meta0: Field,
  meta1: Field,
  meta2: Field,
}) {
  getKey(): Field {
    return this.key;
  }
  getValue(): Field {
    return this.value;
  }
  getMeta() {
    return [this.meta0, this.meta1, this.meta2];
  }
  // TODO: ? accept store identifier (key), add to checksum
  getChecksum() {
    return Poseidon.hash([this.getKey(), this.getValue(), ...this.getMeta()]);
  }

  setValue(value: Field): UnitOfStore {
    return UnitOfStore.init({ key: this.key, value, meta: this.getMeta() });
  }

  static init(params: {
    key: Field;
    value?: Field;
    meta?: Field[];
  }): UnitOfStore {
    const defaults = {
      key: EMPTY,
      value: EMPTY,
      meta: [EMPTY, EMPTY, EMPTY],
    };
    const p = { ...defaults, ...params };
    return new UnitOfStore({
      key: p.key,
      value: p.value,
      meta0: p.meta[0],
      meta1: p.meta[1],
      meta2: p.meta[2],
    });
  }
}

/**
 * Emitted by events: 'store:set' 'store:new'
 */
export class EventStore extends Struct({
  id: Field, // store identifier
  root0: Field, // before state change
  root1: Field, // after state change
  key: Field,
  value: Field,

  /**
   * Meta or protocol data. It is passed as-is (not hashed/encrypted).
   *
   * Increase or decrease the number of fields as needed then update
   * eventStoreDefault.meta and StoreData.meta* to match.
   */
  meta: [Field, Field, Field],
}) {}

/**
 * Emitted by event 'store:pending'
 */
export class EventStorePending extends Struct({
  /**
   * zkApp's store commitment at the time of the event.
   */
  commitmentPending: Field,

  /**
   * A hash of the new store data for data integrity validation.
   */
  settlementChecksum: Field,

  /**
   * Commited store, its current state.
   */
  store0: UnitOfStore,

  /**
   * New store.
   */
  store1: UnitOfStore,
}) {}

/**
 * Emitted by event 'store:commit'
 */
export class EventStoreCommit extends Struct({
  /**
   * zkApp's store commitment that was pending and is being settled.
   *
   * This is the commitment that all pending transformations proved
   * against when they were created. The initial root of the recursive
   * rollup state transformation proof.
   */
  commitmentPending: Field,

  /**
   * zkApp's store commitment now that pending transformations are settled.
   *
   * The latest root of the recursive rollup state transformation proof.
   */
  commitmentSettled: Field, // latest root
}) {}

// "empty" or default value for a key not within a MerkleMap
export const EMPTY = Field(0);

export const eventStoreDefault = {
  id: EMPTY,
  root0: EMPTY,
  root1: EMPTY,
  key: EMPTY,
  value: EMPTY,
  meta: [EMPTY, EMPTY, EMPTY],
};

export class ZKKV {
  /**
   * Add a store; only if it has not already been added.
   * A Store is StoreData to the zkApp's Store.
   */
  static addStore(
    store: UnitOfStore,
    storeManager: UnitOfStore,
    witnessManager: MerkleMapWitness
  ) {
    const key = store.getKey();
    const value = store.getValue();
    const meta = store.getMeta();

    // prove the store has not been added
    // by asserting the current value for this key is empty
    const [root0] = witnessManager.computeRootAndKey(EMPTY);
    root0.assertEquals(storeManager.getValue(), 'Store already added!');

    const [root1] = witnessManager.computeRootAndKey(value);

    const events: { type: 'store:set' | 'store:new'; event: EventStore }[] = [
      {
        type: 'store:set',
        event: new EventStore({
          ...eventStoreDefault,
          id: storeManager.getKey(),
          root0,
          root1,
          key,
          value,
          meta,
        }),
      },
      {
        type: 'store:new',
        event: new EventStore({
          ...eventStoreDefault,
          id: key,
          root1: value,
        }),
      },
    ];
    return events;
  }
}
