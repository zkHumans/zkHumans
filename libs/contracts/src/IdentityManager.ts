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
  UnitOfStore,
  ZKKV,
  eventStoreDefault,
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
    return UnitOfStore.init({ key: this.getKey(), value: this.getValue() });
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
  // Identity Manager Merkle Map; static identifier
  @state(Field) identifier = State<Field>();

  // Identity Manager Merkle Map; root hash
  @state(Field) commitment = State<Field>();

  override events = {
    // for updating off-chain data
    'store:new': EventStore,
    'store:set': EventStore,
  };

  override init() {
    super.init();
    this.identifier.set(EMPTY);
    this.commitment.set(EMPTY);
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

    const events = ZKKV.addStore(
      identity.toUnitOfStore(),
      UnitOfStore.init({
        key: mgrIdentifier,
        value: mgrCommitment,
      }),
      witnessManager
    );

    for (const { type, event } of events) this.emitEvent(type, event);

    // TODO: not this! do pending
    // set the new Merkle Map root based on the new data
    const [root1] = witnessManager.computeRootAndKey(
      identity.toUnitOfStore().getValue()
    );
    this.commitment.set(root1);
  }

  /**
   * Add an Authentication Factor to an Identity.
   */
  @method addAuthNFactor(
    authNFactor: AuthNFactor,
    id0: Identity,
    id1: Identity,
    witnessManager: MerkleMapWitness,
    witnessKeyring: MerkleMapWitness
  ) {
    const mgrIdentifier = this.identifier.getAndAssertEquals();
    const mgrCommitment = this.commitment.getAndAssertEquals();

    // prove the Identity has been added to the current Manager MM
    const [rootManager0] = witnessManager.computeRootAndKey(id0.commitment);
    rootManager0.assertEquals(mgrCommitment, 'Identity not found!');

    // prove the AuthNFactor IS NOT in the current Keyring MM
    const [rootKeyring0] = witnessKeyring.computeRootAndKey(EMPTY);
    rootKeyring0.assertEquals(id0.commitment, 'AuthNFactor already added!');

    const key = authNFactor.getKey();
    const value = authNFactor.getValue();

    // prove the AuthNFactor IS in the new Keyring MM
    const [rootKeyring1] = witnessKeyring.computeRootAndKey(value);
    rootKeyring1.assertEquals(id1.commitment, 'AuthNFactor not in new ID');

    // set the new Manager MM based on the new data
    const [rootManager1] = witnessManager.computeRootAndKey(id1.commitment);
    this.commitment.set(rootManager1);

    // set the AuthNFactor in the Keyring
    this.emitEvent('store:set', {
      id: id1.toUnitOfStore().getKey(),
      root0: rootKeyring0,
      root1: rootKeyring1,
      key,
      value,
      meta: [
        authNFactor.protocol.type,
        authNFactor.protocol.provider,
        authNFactor.protocol.revision,
        EMPTY,
      ],
    });

    // set the Identity in the Manager
    this.emitEvent('store:set', {
      ...eventStoreDefault,
      id: mgrIdentifier,
      root0: rootManager0,
      root1: rootManager1,
      key: id1.toUnitOfStore().getKey(),
      value: id1.toUnitOfStore().getValue(),
    });
  }
}
