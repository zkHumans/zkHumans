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
  // TODO: ? accept store identifier (key), add to checksum
  getChecksum() {
    return Poseidon.hash([this.getKey(), this.getValue(), ...this.getMeta()]);
  }

  // obscure the identifier from the storage key
  // ?: getIdentifier(): Field {
  // ?:   return Poseidon.hash(this.key.toFields());
  // ?: }

  // ?: getCommitment(): Field {
  // ?:   return this.value;
  // ?: }

  // ?: setCommitment(commitment: Field): UnitOfStore {
  // ?:   return this.setValue(commitment);
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
