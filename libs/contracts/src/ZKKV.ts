import {
  Experimental,
  Field,
  MerkleMapWitness,
  Poseidon,
  SelfProof,
  SmartContract,
  State,
  Struct,
  method,
  state,
} from 'snarkyjs';

/**
 * Naming Conventions
 * - x0 : state change from; current/previous/initial
 * - x1 : state change to; new/pending/latest
 */

/**
 * A Store.
 */
export class Store extends Struct({
  identifier: Field,
  commitment: Field,
}) {
  getKey(): Field {
    return this.identifier;
  }
  getValue(): Field {
    return this.commitment;
  }
  setCommitment(commitment: Field): Store {
    return new Store({
      identifier: this.identifier,
      commitment,
    });
  }
}

/**
 * An individual unit of key:value data.
 */
export class StoreData extends Struct({
  store: Store,
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
    return Poseidon.hash([
      this.store.getKey(),
      this.getKey(),
      this.getValue(),
      ...this.getMeta(),
    ]);
  }

  static init(
    store: Store,
    key: Field,
    value = eventStoreDefault.value,
    meta = eventStoreDefault.meta
  ): StoreData {
    return new StoreData({
      store,
      key,
      value,
      meta0: meta[0],
      meta1: meta[1],
      meta2: meta[2],
    });
  }
}

/**
 * State transformation of StoreData.
 */
export class StoreDataTransformation extends Struct({
  /**
   * Commited StoreData, its current state.
   */
  data0: StoreData,

  /**
   * New StoreData.
   */
  data1: StoreData,

  /**
   * Merkle proof of the data within the Store.
   */
  witnessStore: MerkleMapWitness,

  /**
   * Merkle Proof of the Store within the manager (zkApp).
   */
  witnessManager: MerkleMapWitness,
}) {}

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
   * Commited StoreData, its current state.
   */
  data0: StoreData,

  /**
   * New StoreData.
   */
  data1: StoreData,
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

export class ZKKV extends SmartContract {
  /**
   * Static identifier of the Store; the zkApp's Store of Stores.
   */
  @state(Field) storeIdentifier = State<Field>();

  /**
   * Root of the Merkle Map that stores all committed Stores.
   */
  @state(Field) storeCommitment = State<Field>();

  /**
   * A hash used to authenticate storage methods.
   */
  @state(Field) authHash = State<Field>();

  override events = {
    // for updating off-chain data
    'store:new': EventStore,
    'store:set': EventStore,
    'store:pending': EventStorePending,

    // triggers pending events to be committed
    'store:commit': EventStoreCommit,
  };

  override init() {
    super.init();
  }

  // add a store; only if it has not already been added
  // a store is Data to the Store of the Contract
  @method addStore(data1: StoreData, witnessManager: MerkleMapWitness) {
    const mgrStoreCommitment = this.storeCommitment.getAndAssertEquals();
    const mgrStoreIdentifier = this.storeIdentifier.getAndAssertEquals();

    const key = data1.getKey();
    const value = data1.getValue();
    const meta = data1.getMeta();

    // prove the store has not been added
    // by asserting the "current" value for this key is empty
    const [root0] = witnessManager.computeRootAndKey(EMPTY);
    root0.assertEquals(mgrStoreCommitment, 'Store already added!');

    // set the new Merkle Map root based on the new store
    const [root1] = witnessManager.computeRootAndKey(value);
    this.storeCommitment.set(root1);

    this.emitEvent('store:set', {
      id: mgrStoreIdentifier,
      root0,
      root1,
      key,
      value,
      meta,
    });

    this.emitEvent('store:new', {
      ...eventStoreDefault,
      id: key,
      root1: value,
    });
  }

  /**
   * setStore; update a store that has been added to the Manager.
   *
   * @param {StoreData} data0 The store with previosly recorded value.
   * @param {StoreData} data1 The store with new value to update.
   */
  @method setStore(
    data0: StoreData,
    data1: StoreData,
    witnessManager: MerkleMapWitness
  ) {
    const mgrStoreCommitment = this.storeCommitment.getAndAssertEquals();
    const mgrStoreIdentifier = this.storeIdentifier.getAndAssertEquals();

    // assert keys (store identifiers) are the same
    data0.getKey().assertEquals(data1.getKey(), 'Store keys do not match!');

    // prove the store has been added to the manager
    // by asserting the current value is known
    const [root0] = witnessManager.computeRootAndKey(data0.getValue());
    root0.assertEquals(mgrStoreCommitment, 'Store not added!');

    // set the new Merkle Map root based on the new store data
    const [root1] = witnessManager.computeRootAndKey(data1.getValue());
    this.storeCommitment.set(root1);

    this.emitEvent('store:set', {
      id: mgrStoreIdentifier,
      root0,
      root1,
      key: data1.getKey(),
      value: data1.getValue(),
      meta: data1.getMeta(),
    });
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
   * @param {Field} authToken Secret authentication token.
   * @param {StoreData} data0 The store with previosly recorded value.
   * @param {StoreData} data1 The store with new value to update.
   * @param {MerkleMapWitness} witnessStore Witness for Store within Manager.
   * @param {MerkleMapWitness} witnessManager Witness for Data within Store.
   */
  @method setStoreData(
    authToken: Field,
    data0: StoreData,
    data1: StoreData,
    witnessStore: MerkleMapWitness,
    witnessManager: MerkleMapWitness
  ) {
    const authHash = this.authHash.getAndAssertEquals();
    const mgrStoreCommitment = this.storeCommitment.getAndAssertEquals();

    // authorize the request
    authHash.assertEquals(Poseidon.hash([authToken]), 'Auth failed!');

    // assert keys (store identifiers) are the same
    data0.getKey().assertEquals(data1.getKey(), 'StoreData keys do not match!');
    data0.store
      .getKey()
      .assertEquals(data1.store.getKey(), 'Store keys do not match!');

    // assert the transformation against the current zkApp storeCommitment
    // data in the store in the manager
    const [storeRoot0] = witnessStore.computeRootAndKey(data0.getValue());
    const [mgrRoot0] = witnessManager.computeRootAndKey(storeRoot0);
    mgrRoot0.assertEquals(
      mgrStoreCommitment,
      'current StoreData assertion failed!'
    );

    this.emitEvent('store:pending', {
      commitmentPending: mgrStoreCommitment,
      settlementChecksum: data1.getChecksum(),
      data0,
      data1,
    });
  }

  /**
   * Commit pending transformations.
   *
   * @param {Field} authToken Secret authentication token.
   * @param {RollupTransformationsProof} proof A recursive rollup proof of transformations
   */
  @method commitPendingTransformations(
    authToken: Field,
    proof: RollupTransformationsProof
  ) {
    const authHash = this.authHash.getAndAssertEquals();
    const mgrStoreCommitment = this.storeCommitment.getAndAssertEquals();

    // authorize the request
    authHash.assertEquals(Poseidon.hash([authToken]), 'Auth failed!');

    // ensure the proof started from the zkApp's current commitment
    proof.publicInput.root0.assertEquals(
      mgrStoreCommitment,
      'intialRoot assertEquals fails'
    );

    proof.verify();

    // updat the zkApp's commitment
    this.storeCommitment.set(proof.publicInput.root1);

    // inform storage to commit pending transformations proven on the initial commitment
    this.emitEvent('store:commit', {
      commitmentPending: proof.publicInput.root0,
      commitmentSettled: proof.publicInput.root1,
    });
  }
}
