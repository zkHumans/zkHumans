import {
  Experimental,
  Field,
  MerkleMapWitness,
  Poseidon,
  SelfProof,
  Struct,
} from 'snarkyjs';

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

  getChecksum() {
    return Poseidon.hash([this.getKey(), this.getValue(), ...this.getMeta()]);
  }

  // obscure the identifier from the storage key
  // ?: getIdentifier(): Field {
  // ?:   return Poseidon.hash(this.key.toFields());
  // ?: }

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
 * Emitted by event `storage:create`
 */
export class EventStorageCreate extends Struct({
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
 * Emitted by event `storage:pending`
 */
export class EventStoragePending extends Struct({
  /**
   * zkApp's store commitment at the time of the event.
   */
  commitmentPending: Field,

  /**
   * A hash of the new store data for data integrity validation.
   */
  settlementChecksum: Field,

  /**
   * Store identifier; which store is a key:value being set within.
   */
  id: Field,

  /**
   * Commited Store (data), its current state.
   */
  data0: UnitOfStore,

  /**
   * New Store (data).
   */
  data1: UnitOfStore,
}) {}

/**
 * Emitted by event `storage:commit`
 */
export class EventStorageCommit extends Struct({
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

export type RollupStep = {
  root0: Field;
  root1: Field;
  key: Field;
  value0: Field;
  value1: Field;
  // X: witnessStore: MerkleMapWitness,
  witnessManager: MerkleMapWitness;
};

export class RollupState extends Struct({
  root0: Field, // initial root
  root1: Field, // latest root
}) {
  static createOneStep(
    root0: Field,
    root1: Field,
    key: Field,
    value0: Field,
    value1: Field,
    // X: witnessStore: MerkleMapWitness,
    witnessManager: MerkleMapWitness
  ) {
    // X: // assert current value in the store in the manager
    // X: const [storeRoot0, storeKey0] = witnessStore.computeRootAndKey(value0);
    // X: const [mgrRoot0] = witnessManager.computeRootAndKey(storeRoot0);
    // X: mgrRoot0.assertEquals(root0, 'current StoreData assertion failed!');
    // X: storeKey0.assertEquals(key);
    const [mgrRoot0, mgrKey0] = witnessManager.computeRootAndKey(value0);
    root0.assertEquals(mgrRoot0);
    mgrKey0.assertEquals(key);

    // X: // assert latest root based on the new data in the store in the manager
    // X: const [storeRoot1] = witnessStore.computeRootAndKey(value1);
    // X: const [mgrRoot1] = witnessManager.computeRootAndKey(storeRoot1);
    // X: root1.assertEquals(mgrRoot1);
    const [mgrRoot1] = witnessManager.computeRootAndKey(value1);
    root1.assertEquals(mgrRoot1);

    return new RollupState({
      root0,
      root1,
    });
  }

  static createMerged(state1: RollupState, state2: RollupState) {
    return new RollupState({
      root0: state1.root0,
      root1: state2.root1,
    });
  }

  static assertEquals(state1: RollupState, state2: RollupState) {
    state1.root0.assertEquals(state2.root0);
    state1.root1.assertEquals(state2.root1);
  }
}

export const RollupTransformations = Experimental.ZkProgram({
  publicInput: RollupState,

  methods: {
    oneStep: {
      privateInputs: [
        Field,
        Field,
        Field,
        Field,
        Field,
        // X: MerkleMapWitness,
        MerkleMapWitness,
      ],
      method(
        state: RollupState,
        root0: Field,
        root1: Field,
        key: Field,
        value0: Field,
        value1: Field,
        // X: witnessStore: MerkleMapWitness,
        witnessManager: MerkleMapWitness
      ) {
        const computedState = RollupState.createOneStep(
          root0,
          root1,
          key,
          value0,
          value1,
          // X: witnessStore,
          witnessManager
        );
        RollupState.assertEquals(computedState, state);
      },
    },

    merge: {
      privateInputs: [SelfProof, SelfProof],

      method(
        newState: RollupState,
        rollup1proof: SelfProof<RollupState, void>,
        rollup2proof: SelfProof<RollupState, void>
      ) {
        rollup1proof.verify(); // A -> B
        rollup2proof.verify(); // B -> C

        rollup1proof.publicInput.root0.assertEquals(newState.root0);

        rollup1proof.publicInput.root1.assertEquals(
          rollup2proof.publicInput.root0
        );

        rollup2proof.publicInput.root1.assertEquals(newState.root1);
      },
    },
  },
});

export const RollupTransformationsProof_ = Experimental.ZkProgram.Proof(
  RollupTransformations
);
export class RollupTransformationsProof extends RollupTransformationsProof_ {}

export type ZKKVEventEmission = {
  type: 'storage:pending';
  event: EventStoragePending;
}[];

export class ZKKV {
  /**
   * Add a store; only if it has not already been added.
   * A Store is StoreData to the zkApp's Store.
   *
   * This method supports txn concurrency and emits an pending storage event.
   *
   * @param {Object} params
   * @param {UnitOfStore} params.store The store to add to the manager.
   * @param {UnitOfStore} params.storeManager The store manager as a UnitOfStore
   * @param {MerkleMapWitness} params.witnessManager Witness for store within manager.
   */
  static addStore({
    store,
    storeManager,
    witnessManager,
  }: {
    store: UnitOfStore;
    storeManager: UnitOfStore;
    witnessManager: MerkleMapWitness;
  }): ZKKVEventEmission {
    // prove the store has not been added by asserting its current value is empty
    const [root0] = witnessManager.computeRootAndKey(EMPTY);
    root0.assertEquals(storeManager.getValue(), 'Store already added!');

    return [
      {
        type: 'storage:pending',
        event: new EventStoragePending({
          commitmentPending: storeManager.getValue(),
          settlementChecksum: store.getChecksum(),
          id: storeManager.getKey(),
          data0: UnitOfStore.init({
            key: store.getKey(),
            value: EMPTY, // Add
          }),
          data1: store,
        }),
      },
    ];
  }

  /**
   * Set data in a Store that has been added to the Manager.
   *
   * Support concurrent transactions:
   * The Data transformation is emitted as pending until committed.
   *
   * To add store data, use data0 value = EMPTY
   * To del store data, use data1 value = EMPTY
   *
   * @param {Object} params
   * @param {UnitOfStore} params.data0 The store with previosly recorded value.
   * @param {UnitOfStore} params.data1 The store with new value to update.
   * @param {UnitOfStore} params.store The store to add data to.
   * @param {UnitOfStore} params.storeManager The store manager as a UnitOfStore
   * @param {MerkleMapWitness} params.witnessStore Witness for data within store.
   * @param {MerkleMapWitness} params.witnessManager Witness for store within manager.
   */
  static setStoreData({
    data0,
    data1,
    store,
    storeManager,
    witnessStore,
    witnessManager,
  }: {
    data0: UnitOfStore;
    data1: UnitOfStore;
    store: UnitOfStore;
    storeManager: UnitOfStore;
    witnessStore: MerkleMapWitness;
    witnessManager: MerkleMapWitness;
  }): ZKKVEventEmission {
    // assert the transformation against the current zkApp storeCommitment
    // data in the store in the manager
    const [storeRoot0] = witnessStore.computeRootAndKey(data0.getValue());
    const [mgrRoot0] = witnessManager.computeRootAndKey(storeRoot0);
    mgrRoot0.assertEquals(
      storeManager.getValue(),
      'current StoreData assertion failed!'
    );

    return [
      {
        type: 'storage:pending',
        event: new EventStoragePending({
          commitmentPending: storeManager.getValue(),
          settlementChecksum: data1.getChecksum(),
          id: store.getKey(),
          data0,
          data1,
        }),
      },
    ];
  }
}
