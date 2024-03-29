import {
  Bool,
  CircuitString,
  DeployArgs,
  Field,
  MerkleMapWitness,
  Permissions,
  Poseidon,
  Provable,
  PublicKey,
  SmartContract,
  State,
  Struct,
  method,
  state,
} from 'snarkyjs';
import {
  EMPTY,
  EventStorageCommit,
  EventStorageCreate,
  EventStoragePending,
  // 1: RollupTransformationsProof,
  UnitOfStore,
  ZKKV,
} from '@zkhumans/zkkv';
import { BioAuthorizedMessage } from '@zkhumans/snarky-bioauth';

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

  protocolEquals(protocol: AuthNFactorProtocol) {
    const { type, provider, revision } = this.protocol;
    const t = type.equals(Field(protocol.type));
    const p = provider.equals(Field(protocol.provider));
    const r = revision.greaterThanOrEqual(Field(protocol.revision));
    return t.and(p).and(r);
  }

  isOperatorKey() {
    return this.protocolEquals({
      type: AuthNType.operator,
      provider: AuthNProvider.zkhumans,
      revision: 0, // >= 0
    });
  }

  isBioAuth(): Bool {
    return this.protocolEquals({
      type: AuthNType.proofOfPerson,
      provider: AuthNProvider.humanode,
      revision: 0, // >= 0
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
  meta0: Field,
  meta1: Field,
  meta2: Field,
}) {
  setCommitment(commitment: Field): Identity {
    return new Identity({
      identifier: this.identifier,
      commitment,
      meta0: this.meta0,
      meta1: this.meta1,
      meta2: this.meta2,
    });
  }

  setMeta(meta: [Field, Field, Field]): Identity {
    return Identity.init({
      identifier: this.identifier,
      commitment: this.commitment,
      meta,
    });
  }

  toUnitOfStore(): UnitOfStore {
    // ?: // obscure the identifier from the storage key
    // ?: const key = Poseidon.hash(this.identifier.toFields());
    return UnitOfStore.init({
      key: this.identifier,
      value: this.commitment,
      meta: [this.meta0, this.meta1, this.meta2],
    });
  }

  static fromUnitOfStore(store: UnitOfStore): Identity {
    return new Identity({
      identifier: store.key,
      commitment: store.value,
      meta0: store.meta0,
      meta1: store.meta1,
      meta2: store.meta2,
    });
  }

  static init(params: {
    identifier: Field;
    commitment: Field;
    meta?: [Field, Field, Field];
  }): Identity {
    const defaults = {
      meta: [EMPTY, EMPTY, EMPTY],
    };
    const p = { ...defaults, ...params };
    return new Identity({
      identifier: p.identifier,
      commitment: p.commitment,
      meta0: p.meta[0],
      meta1: p.meta[1],
      meta2: p.meta[2],
    });
  }
}

/**
 * Components to prove ownership of an Identity.
 * A convienence for managing the components as a unit.
 * Additionally, an AuthNFactor is used to prove ownership.
 */
export class IdentityAssertion extends Struct({
  /**
   * The Identity to prove ownership of.
   */
  identity: Identity,

  /**
   * Merkle Witness for proving an AuthNFactor within Identity.
   */
  witnessIdentity: MerkleMapWitness,

  /**
   * Merkle Witness for proving Identity within Manager.
   */
  witnessManager: MerkleMapWitness,

  // authNF: AuthNFactor, // 2023-07 including this fails :
  // Error: Stack_overflow at caml_fatal_uncaught_exception
  // (.../snarkyjs/src/bindings/ocaml/overrides.js:60:32)
}) {
  /**
   * @param {AuthNFactor} authNF The Authentication Factor used to create this assertion
   * @param {Field} commitmentManager The Identity Manager's commitment (root)
   */
  auth(authNF: AuthNFactor, commitmentManager: Field): Bool {
    // compute roots for Authentication Factor within Identity within Manager
    const [root0] = this.witnessIdentity.computeRootAndKey(authNF.getValue());
    const [root1] = this.witnessManager.computeRootAndKey(root0);

    // check if roots match Identity and Manager commitments
    const matchID = root0.equals(this.identity.commitment);
    const matchMgr = root1.equals(commitmentManager);
    return matchID.and(matchMgr);
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

  /**
   * BioAuth Oracle PublicKey for verification of CryptoBiometric AuthNFactors.
   * Set this during deploy.
   *
   * 2023-07: This is a "hardcoded" interim solution until generalized.
   * TODO: https://github.com/zkHumans/zkHumans/issues/10
   */
  @state(PublicKey) oraclePublicKey = State<PublicKey>();

  override events = {
    'storage:create': EventStorageCreate,
    'storage:pending': EventStoragePending,
    'storage:commit': EventStorageCommit,
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
   * Check proof of ownership of an Identity
   *
   * @param {IdentityAssertion} assertion Assertion for proving Identity ownership.
   * @param {AuthNFactor} authNF An Authentication Factor for proving Identity ownership.
   */
  @method isIdentityOwner(
    assertion: IdentityAssertion,
    authNF: AuthNFactor
  ): Bool {
    const mgrCommitment = this.commitment.getAndAssertEquals();
    return assertion.auth(authNF, mgrCommitment);
  }

  /**
   * Add an Identity; only if it has not already been added.
   */
  @method NEW_addIdentity(
    opKey: AuthNFactor,
    identity: Identity,
    witnessManager: MerkleMapWitness
  ) {
    const mgrIdentifier = this.identifier.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();

    // assert Operator Key is valid
    opKey.isOperatorKey().assertTrue();

    // emit identity as a new pending store
    const store = identity.toUnitOfStore();
    const storeManager = UnitOfStore.init({
      key: mgrIdentifier,
      value: mgrCommitment,
    });
    const events = ZKKV.addStore({
      store,
      storeManager,
      witnessManager,
    });
    for (const { type, event } of events) this.emitEvent(type, event);

    // emit operator key as new pending data within identity
    const opKeyStore = opKey.toUnitOfStore();
    this.emitEvent(
      'storage:pending',
      new EventStoragePending({
        commitmentPending: storeManager.getValue(),
        settlementChecksum: opKeyStore.getChecksum(),
        id: store.getKey(),
        data0: UnitOfStore.init({
          key: opKeyStore.getKey(),
          value: EMPTY, // Add
        }),
        data1: opKeyStore,
      })
    );
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

  /*
  @method delIdentity(idAssertion: IdentityAssertion, opKey: AuthNFactor) {
    const { identity, witnessManager } = idAssertion;
    const mgrIdentifier = this.identifier.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();

    // assert Operator Key is valid and within the identity
    opKey.isOperatorKey().assertTrue();
    const [r] = idAssertion.witnessIdentity.computeRootAndKey(opKey.getValue());
    r.assertEquals(idAssertion.identity.commitment);

    const events = ZKKV.delStore({
      store: identity.toUnitOfStore(),
      storeManager: UnitOfStore.init({
        key: mgrIdentifier,
        value: mgrCommitment,
      }),
      witnessManager,
    });

    for (const { type, event } of events) this.emitEvent(type, event);
  }
  */

  /**
   * Add an Authentication Factor to an Identity.
   *
   * @param {IdentityAssertion} idAssertion Assertion to prove Identity ownership with the Operator Key.
   * @param {AuthNFactor} opKey The Operator Key attesting ownership of the Identity.
   * @param {AuthNFactor} authNF The new Authentication Factor to add to the Identity.
   * @param {MerkleMapWitness} witnessAuthNF Witness for new AuthNFactor within Identity.
   * @param {BioAuthorizedMessage} oracleMsg signed message from zkOracle providing AuthN Factor secret.
   */
  @method addAuthNFactor(
    idAssertion: IdentityAssertion,
    opKey: AuthNFactor,
    authNF: AuthNFactor,
    witnessAuthNF: MerkleMapWitness,
    oracleMsg: BioAuthorizedMessage
  ) {
    const mgrIdentifier = this.identifier.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();
    const oraclePublicKey = this.oraclePublicKey.getAndAssertEquals();

    // This fails in strange ways with "RangeError: offset is out of bounds"
    // X: this.isIdentityOwner(assertion, opKey).assertTrue();

    // This works but is slower... (there's a duplicate merkle proof)
    // X: idAssertion.auth(opKey, mgrCommitment).assertTrue();
    // X: opKey.isOperatorKey().assertTrue();

    // assert Operator Key is valid and within the identity
    opKey.isOperatorKey().assertTrue();
    const [r] = idAssertion.witnessIdentity.computeRootAndKey(opKey.getValue());
    r.assertEquals(idAssertion.identity.commitment);

    // 2: // if adding BioAuth authentication factor
    // 2: Provable.if(
    // 2:   authNF.isBioAuth(),
    // 2:   // check validity of bioauthenticated message
    // 2:   oracleMsg.signature
    // 2:     .verify(oraclePublicKey, [
    // 2:       oracleMsg.payload,
    // 2:       oracleMsg.timestamp,
    // 2:       oracleMsg.bioAuthId,
    // 2:     ])
    // 2:     .and(
    // 2:       // and ensure bioauthorization and authentication factor match
    // 2:       // TODO: oracleMsg.bioAuthId.equals(authNFactor.data.secret)
    // 2:       Bool(true)
    // 2:     ),
    // 2:   Bool(true)
    // 2: ).assertTrue();

    // Note: ZKKV asserts identity within manager
    const events = ZKKV.setStoreData({
      data0: UnitOfStore.init({
        key: authNF.toUnitOfStore().getKey(),
        value: EMPTY, // Add
      }),
      data1: authNF.toUnitOfStore(),
      store: idAssertion.identity.toUnitOfStore(),
      storeManager: UnitOfStore.init({
        key: mgrIdentifier,
        value: mgrCommitment,
      }),
      witnessStore: witnessAuthNF,
      witnessManager: idAssertion.witnessManager,
    });

    for (const { type, event } of events) this.emitEvent(type, event);
  }

  /**
   * Remove an Authentication Factor from an Identity.
   *
   * @param {IdentityAssertion} idAssertion Assertion to prove Identity ownership with the Operator Key.
   * @param {AuthNFactor} opKey The Operator Key attesting ownership of the Identity.
   * @param {AuthNFactor} authNF The AuthNFactor to remove from the Identity.
   * @param {MerkleMapWitness} witnessAuthNF Witness for current AuthNFactor within Identity.
   */
  @method delAuthNFactor(
    idAssertion: IdentityAssertion,
    opKey: AuthNFactor,
    authNF: AuthNFactor,
    witnessAuthNF: MerkleMapWitness
  ) {
    const mgrIdentifier = this.identifier.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();

    // assert Operator Key is valid and within the identity
    opKey.isOperatorKey().assertTrue();
    const [r] = idAssertion.witnessIdentity.computeRootAndKey(opKey.getValue());
    r.assertEquals(idAssertion.identity.commitment);

    const events = ZKKV.setStoreData({
      data0: authNF.toUnitOfStore(),
      data1: UnitOfStore.init({
        key: authNF.toUnitOfStore().getKey(),
        value: EMPTY, // Delete
      }),
      store: idAssertion.identity.toUnitOfStore(),
      storeManager: UnitOfStore.init({
        key: mgrIdentifier,
        value: mgrCommitment,
      }),
      witnessStore: witnessAuthNF,
      witnessManager: idAssertion.witnessManager,
    });

    for (const { type, event } of events) this.emitEvent(type, event);
  }

  /**
   * Set an Authentication Factor within an Identity.
   *
   * @param {IdentityAssertion} idAssertion Assertion to prove Identity ownership with the Operator Key.
   * @param {AuthNFactor} opKey The Operator Key attesting ownership of the Identity.
   * @param {AuthNFactor} authNFactor0 The current AuthNFactor.
   * @param {AuthNFactor} authNFactor1 The new AuthNFactor.
   * @param {MerkleMapWitness} witnessAuthNF Witness for current AuthNFactor within Identity.
   */
  /*
  @method setAuthNFactor(
    idAssertion: IdentityAssertion,
    opKey: AuthNFactor,
    authNFactor0: AuthNFactor,
    authNFactor1: AuthNFactor,
    witnessAuthNF: MerkleMapWitness
  ) {
    const mgrIdentifier = this.identifier.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();

    // assert Operator Key is valid and within the identity
    opKey.isOperatorKey().assertTrue();
    const [r] = idAssertion.witnessIdentity.computeRootAndKey(opKey.getValue());
    r.assertEquals(idAssertion.identity.commitment);

    const events = ZKKV.setStoreData({
      data0: authNFactor0.toUnitOfStore(),
      data1: authNFactor1.toUnitOfStore(),
      store: idAssertion.identity.toUnitOfStore(),
      storeManager: UnitOfStore.init({
        key: mgrIdentifier,
        value: mgrCommitment,
      }),
      witnessStore: witnessAuthNF,
      witnessManager: idAssertion.witnessManager,
    });

    for (const { type, event } of events) this.emitEvent(type, event);
  }
  */

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
    this.emitEvent('storage:commit', {
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
  @method commitPendingXforms(
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
    this.emitEvent('storage:commit', {
      commitmentPending,
      commitmentSettled,
    });
  }
}

/*
 * [1] 2023-07-10 Note: commitPendingTransformations with recursive proof
 * disabled due to performance navigtations and undocumented snarkyjs behavior.
 * Even when the method is not called... just included within the code,
 * proofsenabled fails on some, but not all, methods:
 * Error: curve point must not be the point at infinity
 *
 * [2] 2023-07-25: Error: "Field.Inv: zero" on signature.verify
 * Only occurs on Berkeley deployment when generaring proof in ui.
 * Used to work fine...
 * https://github.com/o1-labs/snarky/blob/master/src/base/backend_extended.ml#L118
 */
