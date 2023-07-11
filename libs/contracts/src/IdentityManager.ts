import {
  CircuitString,
  DeployArgs,
  Field,
  MerkleMapWitness,
  Permissions,
  Poseidon,
  SmartContract,
  State,
  Struct,
  method,
  state,
} from 'snarkyjs';
import {
  EMPTY,
  EventStore,
  EventStoreCommit,
  EventStorePending,
  // 1: RollupTransformationsProof,
  UnitOfStore,
  ZKKV,
} from '@zkhumans/zkkv';

/**
 * Abbreviations:
 * - AuthN : authentication
 * - AuthZ : authorization
 * - (S)MT : (Sparse) Merkle Tree
 * - MM    : Merkle Map
 */

/**
 * The type of a single factor of authentication.
 */
export enum AuthNType {
  operator = 1,
  password,
  facescan,
  fingerprint,
  retina,
  proofOfPerson,
}

/**
 * The provider of an authentication factor.
 */
export enum AuthNProvider {
  self = 1,
  zkhumans,
  humanode,
  webauthn,
}

/**
 * The protocol aspect of an authentication factor.
 */
export type AuthNFactorProtocol = {
  type: AuthNType;
  provider: AuthNProvider;
  revision: number;
};

/**
 * The data aspect of an authentication factor.
 */
export type AuthNFactorData = {
  secret: string;
  salt: string;
};

/**
 * A single factor of authentication.
 *
 * An Authentication Factor exists as an entry within an individual's identity
 * keyring, implemented as a MerkleMap. The MerkleMap key element is the hash
 * of all composit types while the value is simply `Field(1)` to prove
 * inclusion of the key within the MerkleMap.
 *
 * Types are expressed in two parts; Protocol and Data.
 *
 * Protocol: exposed within off-chain storage and SmartContract events
 * - type: the type of the authentication
 * - provider: the provider of the authentication
 * - revision: protocol revision, default to Field(0)
 *
 * Data: kept secret and never revealed
 * - secret: provided by the user or an authentication provider
 * - salt: provided by the identity provider (aka the zkapp)
 */
export class AuthNFactor extends Struct({
  protocol: {
    type: Field,
    provider: Field,
    revision: Field,
  },
  data: {
    salt: CircuitString,
    secret: CircuitString,
  },
}) {
  getKey(): Field {
    return Poseidon.hash([
      this.protocol.type,
      this.protocol.provider,
      this.protocol.revision,
      ...this.data.salt.toFields(),
      ...this.data.secret.toFields(),
    ]);
  }

  getValue(): Field {
    // all that is need as we only prove inclusion with MM
    return Field(1);
  }

  static init({
    protocol,
    data,
  }: {
    protocol: AuthNFactorProtocol;
    data: AuthNFactorData;
  }): AuthNFactor {
    return new AuthNFactor({
      protocol: {
        type: Field(protocol.type),
        provider: Field(protocol.provider),
        revision: Field(protocol.revision),
      },
      data: {
        salt: CircuitString.fromString(data.salt),
        secret: CircuitString.fromString(data.secret),
      },
    });
  }

  toUnitOfStore(): UnitOfStore {
    return UnitOfStore.init({
      key: this.getKey(),
      value: this.getValue(),
      meta: [
        this.protocol.type,
        this.protocol.provider,
        this.protocol.revision,
      ],
    });
  }
}

/**
 * An individual Identity.
 *
 * Stored as the value element of IdentityManager's Manager MT.
 * Contains one or more AuthNFactors.
 * Implemented as a UnitOfStore:
 * - key   = identifier: the UUID of the Identity
 * - value = commitment: root hash of this identity's keyring MT
 */
export class Identity extends Struct({
  identifier: Field,
  commitment: Field,
}) {
  setCommitment(commitment: Field): Identity {
    return new Identity({
      identifier: this.identifier,
      commitment,
    });
  }

  toUnitOfStore(): UnitOfStore {
    return UnitOfStore.init({ key: this.identifier, value: this.commitment });
  }

  static fromUnitOfStore(store: UnitOfStore): Identity {
    return new Identity({ identifier: store.key, commitment: store.value });
  }
}

export class IdentityManager extends SmartContract {
  /**
   * Static identifier of the Identity Manager Merkle Map.
   */
  @state(Field) identifier = State<Field>();

  /**
   * Root hash of the Identity Manager Merkle Map that stores committed Identities.
   */
  @state(Field) commitment = State<Field>();

  /**
   * A hash used to authenticate storage commitment. Set upon deployment.
   * This is a developmental alternative to the recursive proof verfication, a
   * shim to navigate the computational requirements of the recursive proofs.
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
    this.identifier.set(EMPTY);
    this.commitment.set(EMPTY);
    this.authHash.set(EMPTY);
  }

  override deploy(args: DeployArgs) {
    super.deploy(args);
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
    });
  }

  /**
   * Add an Identity; only if it has not already been added.
   */
  @method addIdentity(identity: Identity, witnessManager: MerkleMapWitness) {
    const mgrIdentifier = this.identifier.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();

    const events = ZKKV.addStore({
      store: identity.toUnitOfStore(),
      storeManager: UnitOfStore.init({
        key: mgrIdentifier,
        value: mgrCommitment,
      }),
      witnessManager,
    });

    for (const { type, event } of events) this.emitEvent(type, event);
  }

  /**
   * Add an Authentication Factor to an Identity.
   *
   * @param {AuthNFactor} authNFactor The AuthNFactor with new value to update.
   * @param {Identity} identity The Identity (Store) to add the AuthNFactor (data) to.
   * @param {MerkleMapWitness} witnessKeyring Witness for AuthNFactor (data) within Identity (Store).
   * @param {MerkleMapWitness} witnessManager Witness for Identity (Store) within Manager.
   */
  @method addAuthNFactor(
    authNFactor: AuthNFactor,
    identity: Identity,
    witnessKeyring: MerkleMapWitness,
    witnessManager: MerkleMapWitness
  ) {
    const mgrIdentifier = this.identifier.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();

    const events = ZKKV.setStoreData({
      data0: UnitOfStore.init({
        key: authNFactor.toUnitOfStore().getKey(),
        value: EMPTY, // Add
      }),
      data1: authNFactor.toUnitOfStore(),
      store: identity.toUnitOfStore(),
      storeManager: UnitOfStore.init({
        key: mgrIdentifier,
        value: mgrCommitment,
      }),
      witnessStore: witnessKeyring,
      witnessManager,
    });

    for (const { type, event } of events) this.emitEvent(type, event);
  }

  /**
   * Remove an Authentication Factor from an Identity.
   *
   * @param {AuthNFactor} authNFactor The AuthNFactor with current value to remove.
   * @param {Identity} identity The Identity (Store) to remove the AuthNFactor (data) from.
   * @param {MerkleMapWitness} witnessKeyring Witness for AuthNFactor (data) within Identity (Store).
   * @param {MerkleMapWitness} witnessManager Witness for Identity (Store) within Manager.
   */
  @method delAuthNFactor(
    authNFactor: AuthNFactor,
    identity: Identity,
    witnessKeyring: MerkleMapWitness,
    witnessManager: MerkleMapWitness
  ) {
    const mgrIdentifier = this.identifier.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();

    const events = ZKKV.setStoreData({
      data0: authNFactor.toUnitOfStore(),
      data1: UnitOfStore.init({
        key: authNFactor.toUnitOfStore().getKey(),
        value: EMPTY, // Delete
      }),
      store: identity.toUnitOfStore(),
      storeManager: UnitOfStore.init({
        key: mgrIdentifier,
        value: mgrCommitment,
      }),
      witnessStore: witnessKeyring,
      witnessManager,
    });

    for (const { type, event } of events) this.emitEvent(type, event);
  }

  /**
   * Set an Authentication Factor within an Identity.
   *
   * @param {AuthNFactor} authNFactor0 The current AuthNFactor.
   * @param {AuthNFactor} authNFactor1 The new AuthNFactor.
   * @param {Identity} identity The Identity (Store) to update the AuthNFactor (data) within.
   * @param {MerkleMapWitness} witnessKeyring Witness for AuthNFactor (data) within Identity (Store).
   * @param {MerkleMapWitness} witnessManager Witness for Identity (Store) within Manager.
   */
  @method setAuthNFactor(
    authNFactor0: AuthNFactor,
    authNFactor1: AuthNFactor,
    identity: Identity,
    witnessKeyring: MerkleMapWitness,
    witnessManager: MerkleMapWitness
  ) {
    const mgrIdentifier = this.identifier.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();

    const events = ZKKV.setStoreData({
      data0: authNFactor0.toUnitOfStore(),
      data1: authNFactor1.toUnitOfStore(),
      store: identity.toUnitOfStore(),
      storeManager: UnitOfStore.init({
        key: mgrIdentifier,
        value: mgrCommitment,
      }),
      witnessStore: witnessKeyring,
      witnessManager,
    });

    for (const { type, event } of events) this.emitEvent(type, event);
  }

  /**
   * Commit pending transformations with a recursive proof of state transformation.
   *
   * @param {RollupTransformationsProof} proof A recursive rollup proof of transformations
   */
  /* 1:
  @method commitPendingTransformations(proof: RollupTransformationsProof) {
    const mgrCommitment = this.commitment.getAndAssertEquals();

    // ensure the proof started from the zkApp's current commitment
    proof.publicInput.root0.assertEquals(mgrCommitment);

    proof.verify();

    // updat the zkApp's commitment
    this.commitment.set(proof.publicInput.root1);

    // inform storage to commit pending transformations proven on the initial commitment
    this.emitEvent('store:commit', {
      commitmentPending: proof.publicInput.root0,
      commitmentSettled: proof.publicInput.root1,
    });
  }
  */

  /**
   * Commit pending transformations.
   * Use an authentication token for authorization.
   *
   * @param {Field} authToken Secret authentication token.
   */
  @method commitPendingTransformationsWithAuthToken(
    authToken: Field,
    commitmentPending: Field,
    commitmentSettled: Field
  ) {
    const authHash = this.authHash.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();

    // authorize the request
    authHash.assertNotEquals(EMPTY, 'Auth not configured!');
    authHash.assertEquals(Poseidon.hash([authToken]), 'Auth failed!');

    // verify current commitment
    commitmentPending.assertEquals(mgrCommitment);

    // updat the zkApp's commitment
    this.commitment.set(commitmentSettled);

    // inform storage to commit pending transformations proven on the initial commitment
    this.emitEvent('store:commit', {
      commitmentPending,
      commitmentSettled,
    });
  }
}

/*
 * [1] 2023-07-10 Note: commitPendingTransformations with recursive proof
 * disabled due to undocumented behavior fron snarkyjs.
 * Even when the method is not called... just included within the code,
 * proofsenabled fails on some, but not all, methods:
 * Error: curve point must not be the point at infinity
 */
