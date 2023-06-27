import {
  CircuitString,
  DeployArgs,
  Field,
  MerkleMapWitness,
  Permissions,
  Poseidon,
  PublicKey,
  SmartContract,
  State,
  Struct,
  method,
  state,
} from 'snarkyjs';

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
  toKey(): Field {
    return Poseidon.hash([
      this.protocol.type,
      this.protocol.provider,
      this.protocol.revision,
      ...this.data.salt.toFields(),
      ...this.data.secret.toFields(),
    ]);
  }

  toValue(): Field {
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
}

/**
 * Note: This utility class provides methods separate from AuthnFactor for
 * simpler typing with SparseMerkleTree
 */

/**
 * An individual identity. This is stored as the value element of
 * IdentityManager's Identity Manager MT.
 * - identifier; the UUID of the Identity (a pseudo PublicKey)
 * - commitment; root hash of this identity's keyring MT
 */
export class Identity extends Struct({
  identifier: PublicKey,
  commitment: Field,
}) {
  toKey(): Field {
    return Poseidon.hash(this.identifier.toFields());
  }

  toValue(): Field {
    return this.commitment;
  }

  setCommitment(commitment: Field): Identity {
    return new Identity({
      identifier: this.identifier,
      commitment,
    });
  }
}

export class EventStore extends Struct({
  root0: Field, // before
  root1: Field, // after
  key: Field,
  value: Field,
  meta: [Field, Field, Field, Field],
}) {}

// "empty" or default value for a key not within a MerkleMap
const EMPTY = Field(0);

const meta = [EMPTY, EMPTY, EMPTY, EMPTY]; // default EventStore meta

export class IdentityManager extends SmartContract {
  // root hash of the Identity Manager Merkle Map
  @state(Field) idsRoot = State<Field>();

  override events = {
    // for updating off-chain data
    'store:set': EventStore,
  };

  override init() {
    super.init();
    this.idsRoot.set(Field(0));
  }

  override deploy(args: DeployArgs) {
    super.deploy(args);
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
    });
  }

  // add identity; only if it has not already been added
  @method addIdentity(identity: Identity, witnessManager: MerkleMapWitness) {
    const idsRoot = this.idsRoot.getAndAssertEquals();

    const key = identity.toKey();
    const value = identity.toValue();

    // prove the identity has not been added
    // by asserting the "current" value for this key is empty
    const [root0] = witnessManager.computeRootAndKey(EMPTY);
    root0.assertEquals(idsRoot, 'Identity already added!');

    // set the new Merkle Map root based on the new data
    const [root1] = witnessManager.computeRootAndKey(value);
    this.idsRoot.set(root1);

    this.emitEvent('store:set', {
      root0,
      root1,
      key,
      value,
      meta,
    });
  }

  // add a new Identity iff the identifier does not already exist
  // (using non-existence merkle proof)

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
    const idsRoot = this.idsRoot.getAndAssertEquals();

    // prove the Identity has been added to the current Manager MM
    const [rootManager0] = witnessManager.computeRootAndKey(id0.toValue());
    rootManager0.assertEquals(idsRoot, 'Identity not found!');

    // prove the AuthNFactor IS NOT in the current Keyring MM
    const [rootKeyring0] = witnessKeyring.computeRootAndKey(EMPTY);
    rootKeyring0.assertEquals(id0.commitment, 'AuthNFactor already added!');

    const key = authNFactor.toKey();
    const value = authNFactor.toValue();

    // prove the AuthNFactor IS in the new Keyring MM
    const [rootKeyring1] = witnessKeyring.computeRootAndKey(value);
    rootKeyring1.assertEquals(id1.commitment, 'AuthNFactor not in new ID');

    // set the new Manager MM based on the new data
    const [rootManager1] = witnessManager.computeRootAndKey(id1.toValue());
    this.idsRoot.set(rootManager1);

    // set the AuthNFactor in the Keyring
    this.emitEvent('store:set', {
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
      root0: rootManager0,
      root1: rootManager1,
      key: id1.toKey(),
      value: id1.toValue(),
      meta,
    });
  }
}
