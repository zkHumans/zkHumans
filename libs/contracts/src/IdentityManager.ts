import {
  CircuitString,
  DeployArgs,
  Field,
  method,
  Permissions,
  Poseidon,
  provablePure,
  PublicKey,
  SmartContract,
  State,
  state,
  Struct,
} from 'snarkyjs';
import {
  ProvableSMTUtils,
  SparseMerkleProof,
  SparseMerkleTree,
} from 'snarky-smt';

/**
 * Abbreviations:
 * - authn: authentication
 * - authz: authorization
 * - (S)MT: (Sparse) Merkle Tree
 */

/**
 * The type of a single factor of authentication.
 */
export enum AuthnType {
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
export enum AuthnProvider {
  self = 1,
  zkhumans,
  humanode,
  webauthn,
}

/**
 * The public aspect of an authentication factor.
 */
export type AuthnFactorPublic = {
  type: AuthnType;
  provider: AuthnProvider;
  revision: number;
};

/**
 * The private aspect of an authentication factor.
 * These are never revealed.
 */
export type AuthnFactorPrivate = {
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
export class AuthnFactor extends Struct({
  type: Field,
  provider: Field,
  revision: Field,
  // TODO: createdAt: Field,
  // TODO: updatedAt: Field,
}) {}

/**
 * Note: This utility class provides methods separate from AuthnFactor for
 * simpler typing with SparseMerkleTree
 */
export class AuthnFactorUtils {
  static init(publicInput: AuthnFactorPublic): AuthnFactor {
    const { type: _type, provider, revision } = publicInput;
    return new AuthnFactor({
      type: Field(_type),
      provider: Field(provider),
      revision: Field(revision),
    });
  }

  static hash(af: AuthnFactor, privateInput: AuthnFactorPrivate): Field {
    const { salt, secret } = privateInput;
    return Poseidon.hash([
      af.type,
      af.provider,
      af.revision,
      ...CircuitString.fromString(salt).toFields(),
      ...CircuitString.fromString(secret).toFields(),
    ]);
  }
}

export type SMTIdentityKeyring = SparseMerkleTree<Field, AuthnFactor>;

/**
 * An individual identity. This is stored as the value element of
 * IdentityManager's Identity Manager MT.
 * - publicKey; the UUID of the Identity
 * - commitment; root hash of this identity's keyring MT
 */
export class Identity extends Struct({
  publicKey: PublicKey,
  commitment: Field,
}) {}

export class IdentityUtils {
  static setCommitment(identity: Identity, commitment: Field): Identity {
    return new Identity({
      publicKey: identity.publicKey,
      commitment,
    });
  }
}

export type SMTIdentityManager = SparseMerkleTree<CircuitString, Identity>;

export class IdentityManager extends SmartContract {
  // root hash of the Identity Manager Merkle Map
  @state(Field) idsRoot = State<Field>();

  override events = {
    createIdentity: provablePure({
      identity: Identity,
      commitment: Field,
    }),
    updateIdentity: provablePure({
      identity: Identity,
      commitment: Field,
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

  // add a new Identity iff the identifier does not already exist
  // (using non-existence merkle proof)
  @method
  addNewIdentity(
    identifier: CircuitString,
    identity: Identity,
    merkleProof: SparseMerkleProof
  ) {
    const commitment = this.idsRoot.getAndAssertEquals();

    // prove the identifier IS NOT in the Identity Manager MT
    ProvableSMTUtils.checkNonMembership(
      merkleProof,
      commitment,
      identifier,
      CircuitString
    ).assertTrue();

    // add new identifier
    const newCommitment = ProvableSMTUtils.computeRoot(
      merkleProof.sideNodes,
      identifier,
      CircuitString,
      identity,
      Identity
    );

    this.idsRoot.set(newCommitment);

    this.emitEvent('createIdentity', { identity, commitment: newCommitment });
  }

  @method addAuthnFactorToIdentityKeyring(
    identifier: CircuitString,
    identity: Identity,
    merkleProofManager: SparseMerkleProof,
    authnFactorHash: Field,
    authnFactor: AuthnFactor,
    merkleProofKeyring: SparseMerkleProof
  ) {
    const commitment = this.idsRoot.getAndAssertEquals();

    // prove the identifier:identity IS in the Identity Manager MT
    ProvableSMTUtils.checkMembership(
      merkleProofManager,
      commitment,
      identifier,
      CircuitString,
      identity,
      Identity
    ).assertTrue();

    // prove the authnFactor IS NOT in the Identity Keyring MT
    ProvableSMTUtils.checkNonMembership(
      merkleProofKeyring,
      identity.commitment,
      authnFactorHash,
      Field
    ).assertTrue();

    // add the new authnFactor to the Identity Keyring MT
    const newAuthnFactorCommitment = ProvableSMTUtils.computeRoot(
      merkleProofKeyring.sideNodes,
      authnFactorHash,
      Field,
      authnFactor,
      AuthnFactor
    );

    // update the Identity Keyring commitment
    // const newIdentity = identity.setCommitment(newAuthnFactorCommitment);
    const newIdentity = IdentityUtils.setCommitment(
      identity,
      newAuthnFactorCommitment
    );

    const newCommitment = ProvableSMTUtils.computeRoot(
      merkleProofManager.sideNodes,
      identifier,
      CircuitString,
      newIdentity,
      Identity
    );

    this.idsRoot.set(newCommitment);

    this.emitEvent('updateIdentity', {
      identity: newIdentity,
      commitment: newCommitment,
    });
  }
}
