import { trpc } from '@zkhumans/trpc-client';
import { Identity } from '@zkhumans/contracts';
import { BioAuthOracle, BioAuthorizedMessage } from '@zkhumans/snarky-bioauth';
import { CircuitString, Field, MerkleMap, Poseidon, PublicKey } from 'snarkyjs';
import { Identifier, generateIdentifiers } from '@zkhumans/utils';

import type { ApiOutputStorageByKey } from '@zkhumans/trpc-client';
import type { AuthNFactorProtocol } from '@zkhumans/contracts';
import type { SignedData } from '@aurowallet/mina-provider/dist/TSTypes';
type WalletSignedData = SignedData;

/**
 * Collection of client utility functions for Identities.
 *
 * They use trpc-client to access database through API and may be run by users
 * in-browser.
 */
export class IdentityClientUtils {
  static IDENTITY_MGR_MAX_IDS_PER_ACCT = 10;
  static IDENTITY_MGR_SALT = 'TODO:somethingUniqueTotheZkapp';

  static async getIdentities(account: string) {
    const publicKey = PublicKey.fromBase58(account);

    const identifiers = generateIdentifiers(
      publicKey,
      this.IDENTITY_MGR_MAX_IDS_PER_ACCT
    );

    const dbIdentities = [] as NonNullable<ApiOutputStorageByKey>[];
    for (const identifier of identifiers) {
      const identity = Identity.init({
        identifier: identifier.toField(),
        commitment: Field(0),
      });
      const key = identity.identifier.toString();
      const x = await trpc.storage.byKey.query({ key });
      if (x) dbIdentities.push(x);
    }

    return dbIdentities;
  }

  /**
   * Restore MerkleMap data from database, if it exists
   * otherwise return new MerkleMap().
   *
   * Only committed (non-pending) data is used to restore the MerkleMap as only
   * it may be used to produce an acceptable witness.
   */
  static async getStoredMerkleMap(identifier: string) {
    const mm = new MerkleMap();

    const storage = await trpc.storage.byKeyWithData.query({ key: identifier });
    if (!storage) return mm;

    // restore MerkleMap from db store
    for (const data of storage.data) {
      try {
        if (data.isPending) continue;
        mm.set(Field(data.key), Field(data.value ?? 0));
      } catch (e: any) {
        console.log('Error', e.message);
      }
    }

    return mm;
  }

  /**
   * Get the MerkleMap for an Identity Keyring by the given identifier.
   * Restore from database if it exists.
   */
  /*
  static async getKeyringMM(identifier: string) {
    const identity = Identity.init({
      identifier: Identifier.fromBase58(identifier).toField(),
      commitment: Field(0),
    });
    const id = identity.identifier.toString();
    return this.getStoredMerkleMap(id);
  }
  */

  /**
   * Get Identity Manager MerkleMap from the zkApp's PublicKey.
   */
  static async getManagerMM(zkappAddress: PublicKey) {
    const idMgr = this.getManagerIdentfier(zkappAddress);
    return await this.getStoredMerkleMap(idMgr);
  }

  /**
   * Get Identity Manager's Identifier.
   */
  static getManagerIdentfier(zkappAddress: PublicKey) {
    return Identifier.fromPublicKey(zkappAddress, 1).toField().toString();
  }

  /**
   * Return next unused (available) identifier for the given account,
   * or null if reached max.
   *
   * @param {string} account - PublicKey in base58
   */
  static async getNextUnusedIdentifier(account: string) {
    const publicKey = PublicKey.fromBase58(account);
    for (let i = 0; i < this.IDENTITY_MGR_MAX_IDS_PER_ACCT; i++) {
      const identifier = Identifier.fromPublicKey(publicKey, i);
      const identity = Identity.init({
        identifier: identifier.toField(),
        commitment: Field(0),
      });
      const key = identity.identifier.toString();
      const x = await trpc.storage.byKey.query({ key });
      if (!x) return identifier.toBase58();
    }
    return null;
  }

  // TODO: make AuthNFactorOperatorKey
  static getOperatorKeySecret(
    identifier: string,
    data: WalletSignedData | null
  ) {
    if (!data) return null;
    try {
      const hash = Poseidon.hash([
        Identifier.fromBase58(identifier).toField(),
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
    const fIdentifier = Identifier.fromBase58(identifier).toField();
    return await bioAuthOracle.fetchBioAuth(fIdentifier);
  }

  static async getBioAuthLink(bioAuthId: string) {
    const meta = await trpc.meta.query();
    const bioAuthOracle = new BioAuthOracle(meta.url.auth);
    return bioAuthOracle.getBioAuthLink(bioAuthId);
  }

  /*
  static async addAuthNFactorOperatorKey(
    mmKeyring: MerkleMap,
    identifier: string,
    signature: WalletSignedData
  ) {
    // get operator key secret from identifier signed by operator key (wallet)
    const secret = IdentityClientUtils.getOperatorKeySecret(
      identifier,
      signature
    );
    if (!secret || secret === '') return false;

    const afProtocol = {
      type: AuthNType.operator,
      provider: AuthNProvider.zkhumans,
      revision: 0,
    };

    await IdentityClientUtils.addAuthNFactorToKeyring(
      mmKeyring,
      identifier,
      afProtocol,
      secret
    );
    return true;
  }
  */

  /*
  static async addAuthNFactorBioAuth(
    mmKeyring: MerkleMap,
    identifier: string,
    bioAuth: string
  ) {
    const afProtocol = {
      type: AuthNType.proofOfPerson,
      provider: AuthNProvider.humanode,
      revision: 0,
    };

    try {
      const data = JSON.parse(bioAuth);
      const bioAuthMsg = BioAuthorizedMessage.fromJSON(data);
      const secret = bioAuthMsg.bioAuthId.toString();
      await IdentityClientUtils.addAuthNFactorToKeyring(
        mmKeyring,
        identifier,
        afProtocol,
        secret
      );
      return true;
    } catch (
      err: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
      console.log('addAuthNFactorBioAuth ERROR', err);
      return false;
    }
  }
  */

  /*
  static async addAuthNFactorToKeyring(
    mmKeyring: MerkleMap,
    identifier: string, // TODO: remove
    protocol: AuthNFactorProtocol,
    secret: string
  ) {
    const af = AuthNFactor.init({
      protocol,
      data: { salt: IDENTITY_MGR_SALT, secret },
    });

    mmKeyring.set(af.getKey(), af.getValue());

    // X: await trpc.smt.txn.mutate({
    // X:   id: identifier,
    // X:   txn: 'update',
    // X:   key: smtValueToString(afHash, Field),
    // X:   value: smtValueToString(af, AuthNFactor),
    // X: });
  }
  */

  static async getAuthNFactors(identifier: string) {
    const factors = {} as {
      [key: string]: AuthNFactorProtocol & { isPending: boolean };
    };

    const storage = await trpc.storage.byKeyWithData.query({
      key: Identifier.fromBase58(identifier).toField().toString(),
    });
    if (!storage) return factors;

    for (const data of storage.data) {
      const meta: any = JSON.parse(data.meta?.toString() ?? '');
      factors[data.key] = {
        type: Number(meta[0]),
        provider: Number(meta[1]),
        revision: Number(meta[2]),
        isPending: data.isPending,
      };
    }

    return factors;
  }

  /*
  static async prepareAddNewIdentity(
    identifier: string,
    mmIDKeyring: MerkleMap
  ) {
    const mmIDManager = await IdentityClientUtils.getManagerMM();

    const identity = Identity.init({
      identifier: Identifier.fromBase58(identifier).toField(),
      commitment: mmIDKeyring.getRoot(),
    });

    // prove the identity IS NOT in the Identity Manager MM
    const witness = mmIDManager.getWitness(identity.identifier);
    console.log('merkle witness siblings', witness.siblings);

    return { identity, witness };
  }
  */

  /*
  static async addNewIdentity(identifier: string, identity: Identity) {
    const mmIDManager = await IdentityClientUtils.getManagerMM();
    mmIDManager.set(identity.identifier, identity.commitment);

    // X: await trpc.smt.txn.mutate({
    // X:   id: IDENTITY_MGR_SMT_NAME,
    // X:   txn: 'update',
    // X:   key: smtValueToString(identifierCircuitString, CircuitString),
    // X:   value: smtValueToString(identity, Identity),
    // X: });

    return mmIDManager;
  }
  */

  static humanReadableAuthNFactor(afp: AuthNFactorProtocol) {
    return {
      type: this.humanReadableAuthNTypes[afp.type],
      provider: this.humanReadableAuthNProviders[afp.provider],
      revision: Number(afp.revision),
    };
  }

  static humanReadableAuthNProviders = {
    '1': 'Self',
    '2': 'zkHumans',
    '3': 'Humanode',
    '4': 'WebAuthn',
  };

  static humanReadableAuthNTypes = {
    '1': 'Operator Key',
    '2': 'Password',
    '3': 'Facescan',
    '4': 'Fingerprint',
    '5': 'Retina',
    '6': 'Proof of Person',
  };
}
