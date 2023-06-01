import { trpc } from '@zkhumans/trpc-client';
import {
  AuthnFactor,
  AuthnFactorParams,
  AuthnProvider,
  AuthnType,
  Identity,
} from '@zkhumans/contracts';
import { BioAuthOracle, BioAuthorizedMessage } from '@zkhumans/snarky-bioauth';
import { CircuitString, Field, Poseidon, PublicKey } from 'snarkyjs';
import { MemoryStore, SparseMerkleTree } from 'snarky-smt';
import {
  generateIdentifiers,
  identifierFromBase58,
  smtApplyTransactions,
  smtValueToString,
  smtStringToValue,
} from '@zkhumans/utils';

import type { ApiSmtGetOutput } from '@zkhumans/trpc-client';
import type {
  AuthnFactorPublic,
  SMTIdentityKeyring,
} from '@zkhumans/contracts';
import type { SignedData } from '@aurowallet/mina-provider/dist/TSTypes';
type WalletSignedData = SignedData;

const IDENTITY_MGR_MAX_IDS_PER_ACCT = 10;
const IDENTITY_MGR_SMT_NAME = '_IdentityManager_';
const IDENTITY_MGR_SALT = 'TODO:somethingUniqueTotheZkapp';

/**
 * Collection of client utility functions for Identities.
 *
 * They use trpc-client to access database through API and may be run by users
 * in-browser.
 */
export class IdentityClientUtils {
  static async getIdentities(account: string) {
    const publicKey = PublicKey.fromBase58(account);

    const identifiers = generateIdentifiers(
      publicKey.toFields(),
      IDENTITY_MGR_MAX_IDS_PER_ACCT
    );

    const identities = [] as NonNullable<ApiSmtGetOutput>[];
    for (const id of identifiers) {
      const x = await trpc.smt.get.query({ id });
      if (x) identities.push(x);
    }

    return identities;
  }

  /**
   * Get SparseMerkleTree for an Identity Keyring by the given identifier.
   * Create in database if doesn't exist, restore from database if it does.
   */
  static async getKeyringSMT(identifier: string) {
    // Create an Identity Keyring MT
    const store = new MemoryStore<AuthnFactor>();
    const smt = await SparseMerkleTree.build(store, Field, AuthnFactor);

    // get Identity Keyring MT data from database, create if not exists
    const dbSmtKeyring =
      (await trpc.smt.get.query({ id: identifier })) ??
      (await trpc.smt.create.mutate({ id: identifier, root: '' }));

    // apply db-stored SMT modification history to restore in-memory
    await smtApplyTransactions(smt, Field, AuthnFactor, dbSmtKeyring);

    return smt;
  }

  /**
   * Get SparseMerkleTree for an Identity Manager.
   * Create in database if doesn't exist, restore from database if it does.
   */
  static async getManagerSMT(idMgr: string = IDENTITY_MGR_SMT_NAME) {
    // Create an Identity Manager MT
    const store = new MemoryStore<Identity>();
    const smt = await SparseMerkleTree.build(store, CircuitString, Identity);

    // get Identity Manager MT data from database, create if not exists
    const dbSmt =
      (await trpc.smt.get.query({ id: idMgr })) ??
      (await trpc.smt.create.mutate({ id: idMgr, root: '' }));

    // apply db-stored SMT modification history to restore in-memory
    await smtApplyTransactions(smt, CircuitString, Identity, dbSmt);

    return smt;
  }

  /**
   * Return next unused (available) identifier for the given account,
   * or null if reached max.
   *
   * @param {string} account - PublicKey in base58
   */
  static async getNextUnusedIdentifier(account: string) {
    const publicKey = PublicKey.fromBase58(account);
    for (let i = 0; i < IDENTITY_MGR_MAX_IDS_PER_ACCT; i++) {
      const [id] = generateIdentifiers(publicKey.toFields(), 1, i);
      const x = await trpc.smt.get.query({ id });
      if (!x) return id;
    }
    return null;
  }

  static getOperatorKeySecret(
    identifier: string,
    data: WalletSignedData | null
  ) {
    if (!data) return null;
    try {
      const hash = Poseidon.hash([
        identifierFromBase58(identifier),
        ...CircuitString.fromString(data.signature.field).toFields(),
        ...CircuitString.fromString(data.signature.scalar).toFields(),
      ]);
      return hash.toString();
    } catch (
      err: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
      return null;
    }
  }

  static async getBioAuth(identifier: string) {
    const meta = await trpc.meta.query();
    const bioAuthOracle = new BioAuthOracle(meta.url.auth);
    const fIdentifier = identifierFromBase58(identifier);
    return await bioAuthOracle.fetchBioAuth(fIdentifier);
  }

  static async getBioAuthLink(bioAuthId: string) {
    const meta = await trpc.meta.query();
    const bioAuthOracle = new BioAuthOracle(meta.url.auth);
    return bioAuthOracle.getBioAuthLink(bioAuthId);
  }

  static async addAuthnFactorOperatorKey(
    smtIDKeyring: SMTIdentityKeyring,
    identifier: string,
    signature: WalletSignedData
  ) {
    // get operator key secret from identifier signed by operator key (wallet)
    const secret = IdentityClientUtils.getOperatorKeySecret(
      identifier,
      signature
    );
    if (!secret || secret === '') return false;

    const afPublic = {
      type: AuthnType.operator,
      provider: AuthnProvider.zkhumans,
      revision: 0,
    };

    await IdentityClientUtils.addAuthnFactorToKeyring(
      smtIDKeyring,
      identifier,
      afPublic,
      secret
    );
    return true;
  }

  static async addAuthnFactorBioAuth(
    smtIDKeyring: SMTIdentityKeyring,
    identifier: string,
    bioAuth: string
  ) {
    const afPublic = {
      type: AuthnType.proofOfPerson,
      provider: AuthnProvider.humanode,
      revision: 0,
    };

    try {
      const data = JSON.parse(bioAuth);
      const bioAuthMsg = BioAuthorizedMessage.fromJSON(data);
      const secret = bioAuthMsg.bioAuthId.toString();
      await IdentityClientUtils.addAuthnFactorToKeyring(
        smtIDKeyring,
        identifier,
        afPublic,
        secret
      );
      return true;
    } catch (
      err: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
      console.log('addAuthnFactorBioAuth ERROR', err);
      return false;
    }
  }

  static async addAuthnFactorToKeyring(
    smtIDKeyring: SMTIdentityKeyring,
    identifier: string,
    afPublic: AuthnFactorPublic,
    secret: string
  ) {
    const af = AuthnFactor.init(afPublic);
    const afPrivate = { salt: IDENTITY_MGR_SALT, secret };
    const afHash = af.hash(afPrivate);

    await smtIDKeyring.update(afHash, af);
    await trpc.smt.txn.mutate({
      id: identifier,
      txn: 'update',
      key: smtValueToString(afHash, Field),
      value: smtValueToString(af, AuthnFactor),
    });
  }

  static async getAuthnFactorsFromKeyring(identifier: string) {
    const authnFactors = {} as { [key: string]: AuthnFactorPublic };
    const dbSmtKeyring = await trpc.smt.get.query({ id: identifier });
    if (!dbSmtKeyring) return authnFactors;
    for (const txn of dbSmtKeyring.txns) {
      if (txn.value) {
        const af: AuthnFactorParams = smtStringToValue(txn.value, AuthnFactor);
        authnFactors[txn.key] = {
          type: Number(af.type.toString()),
          provider: Number(af.provider.toString()),
          revision: Number(af.revision.toString()),
        };
      }
    }
    return authnFactors;
  }

  static async prepareAddNewIdentity(
    identifier: string,
    smtIDKeyring: SMTIdentityKeyring
  ) {
    const smtIDManager = await IdentityClientUtils.getManagerSMT();

    const pk = identifier.replace(/^zkHM/, 'B62q'); // HACK!!!!
    const identity = new Identity({
      publicKey: PublicKey.fromBase58(pk),
      commitment: smtIDKeyring.getRoot(),
    });

    // prove the identifier IS NOT in the Identity Manager MT
    const identifierCircuitString = CircuitString.fromString(identifier);
    const merkleProof = await smtIDManager.prove(identifierCircuitString);
    console.log('merkleProof sidenodes', merkleProof.sideNodes);

    return { identity, merkleProof };
  }

  static async addNewIdentity(identifier: string, identity: Identity) {
    const smtIDManager = await IdentityClientUtils.getManagerSMT();
    const identifierCircuitString = CircuitString.fromString(identifier);

    await smtIDManager.update(identifierCircuitString, identity);
    await trpc.smt.txn.mutate({
      id: IDENTITY_MGR_SMT_NAME,
      txn: 'update',
      key: smtValueToString(identifierCircuitString, CircuitString),
      value: smtValueToString(identity, Identity),
    });

    return smtIDManager;
  }

  static humanReadableAuthnFactor(afp: AuthnFactorPublic) {
    const x = { type: '', provider: '', revision: Number(afp.revision) };

    switch (afp.type) {
      case AuthnType.operator:
        x.type = 'Operator Key';
        break;
      case AuthnType.password:
        x.type = 'Password';
        break;
      case AuthnType.facescan:
        x.type = 'Facescan';
        break;
      case AuthnType.fingerprint:
        x.type = 'Fingerprint';
        break;
      case AuthnType.retina:
        x.type = 'Retina';
        break;
      case AuthnType.proofOfPerson:
        x.type = 'Proof of Unique Living Human';
        break;
    }

    switch (afp.provider) {
      case AuthnProvider.self:
        x.provider = 'Self';
        break;
      case AuthnProvider.zkhumans:
        x.provider = 'zkHumans';
        break;
      case AuthnProvider.humanode:
        x.provider = 'Humanode';
        break;
      case AuthnProvider.webauthn:
        x.type = 'WebAuthn';
        break;
    }

    return x;
  }
}
