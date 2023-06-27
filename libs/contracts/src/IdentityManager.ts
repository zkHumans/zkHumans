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
  provablePure,
  state,
} from 'snarkyjs';

/**
 * Abbreviations:
 * - authn: authentication
 * - authz: authorization
 * - (S)MT: (Sparse) Merkle Tree
 * - MM   : Merkle Map
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
 * The public aspect of an authentication factor.
 */
export type AuthNFactorPublic = {
  type: AuthNType;
  provider: AuthNProvider;
  revision: number;
};

/**
 * The private aspect of an authentication factor.
 * These are never revealed.
 */
export type AuthNFactorPrivate = {
  secret: string;
  salt: string;
};

/**
 * A single factor of authentication.
 *
 * A "authentication factor" exists as an entry within an individual's identity
 * keyring whereby the key:value entry uses the public Struct types as the
 * value and a hash of the public and private inputs as the key.
 *
 * Struct types are used as public input:
 * - type; the type of the authentication
 * - provider; the provider of the authentication
 * - revision; protocol revision, default to Field(0)
 *
 * A hash is generated from public types with two additional private inputs:
 * - secret; provided by the user or an authentication provider
 * - salt; provided by the identity provider (aka the zkapp)
 */
export class AuthNFactor extends Struct({
  publicData: {
    type: Field,
    provider: Field,
    revision: Field,
    // TODO: createdAt: UInt32,
    // TODO: updatedAt: UInt32,
  },
  privateData: {
    salt: CircuitString,
    secret: CircuitString,
  },
}) {
  hash(): Field {
    return Poseidon.hash([
      this.publicData.type,
      this.publicData.provider,
      this.publicData.revision,
      ...this.privateData.salt.toFields(),
      ...this.privateData.secret.toFields(),
    ]);
  }

  toJSON() {
    return {
      publicData: {
        type: this.publicData.type.toString(),
        provider: this.publicData.provider.toString(),
        revision: this.publicData.revision.toString(),
      },
      privateData: {
        salt: this.privateData.salt.toString(),
        secret: this.privateData.secret.toString(),
      },
    };
  }
}

/**
 * Note: This utility class provides methods separate from AuthnFactor for
 * simpler typing with SparseMerkleTree
 */

/**
 * An individual identity. This is stored as the value element of
 * IdentityManager's Identity Manager MT.
 * - publicKey; the UUID of the Identity
 * - commitment; root hash of this identity's keyring MT
 */
export class Identity extends Struct({
  publicKey: PublicKey,
  commitment: Field,
}) {
  hash(): Field {
    return Poseidon.hash(this.publicKey.toFields().concat(this.commitment));
  }

  toJSON() {
    return {
      publicKey: this.publicKey.toBase58(),
      commitment: this.commitment.toString(),
    };
  }

  setCommitment(commitment: Field): Identity {
    return new Identity({
      publicKey: this.publicKey,
      commitment,
    });
  }
}

const EMPTY = Field(0);

export class IdentityManager extends SmartContract {
  // root hash of the Identity Manager Merkle Map
  @state(Field) idsRoot = State<Field>();

  override events = {
    addIdentity: provablePure({
      identity: Identity,
      commitment: Field,
    }),
    addAuthNFactor: provablePure({
      identity: Identity,
      commitment: Field,
      authNFactorHash: Field,
    }),
    updateIdentity: provablePure({
      identity: Identity,
      commitment: Field,
    }),
    // for updating off-chain data
    storeSet: provablePure({
      root0: Field, // before
      root1: Field, // after
      key: Field,
      value: Field,
    }),
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

    // prove the identity has not been added
    // by asserting the "current" value for this key is empty
    const [root0] = witnessManager.computeRootAndKey(EMPTY);
    root0.assertEquals(idsRoot, 'Identity already added!');

    // set the new Merkle Map root based on the new data
    const [root1] = witnessManager.computeRootAndKey(identity.hash());
    this.idsRoot.set(root1);

    this.emitEvent('addIdentity', { identity, commitment: root1 });

    this.emitEvent('storeSet', {
      root0,
      root1,
      key: Poseidon.hash(identity.publicKey.toFields()),
      value: identity.hash(), // TODO hash once?
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
    const [rootManager0] = witnessManager.computeRootAndKey(id0.hash());
    rootManager0.assertEquals(idsRoot, 'Identity not found!');

    // prove the AuthNFactor IS NOT in the current Keyring MM
    const [rootKeyring0] = witnessKeyring.computeRootAndKey(EMPTY);
    rootKeyring0.assertEquals(id0.commitment, 'AuthNFactor already added!');

    // prove the AuthNFactor IS in the new Keyring MM
    const authNFactorHash = authNFactor.hash();
    const [rootKeyring1] = witnessKeyring.computeRootAndKey(authNFactorHash);
    rootKeyring1.assertEquals(id1.commitment, 'AutnNFactor not in new ID');

    // set the new Manager MM based on the new data
    const [rootManager1] = witnessManager.computeRootAndKey(id1.hash());
    this.idsRoot.set(rootManager1);

    this.emitEvent('addAuthNFactor', {
      identity: id1,
      commitment: rootKeyring1,
      authNFactorHash,
    });

    this.emitEvent('updateIdentity', {
      identity: id1,
      commitment: rootManager1,
    });

    // set the AuthNFactor in the Keyring
    this.emitEvent('storeSet', {
      root0: rootKeyring0,
      root1: rootKeyring1,
      key: authNFactorHash,
      value: Field(1), // only need to prove it's in there
    });

    // set the identity in the Manager
    this.emitEvent('storeSet', {
      root0: rootManager0,
      root1: rootManager1,
      key: Poseidon.hash(id1.publicKey.toFields()),
      value: id1.commitment,
    });
  }
}
