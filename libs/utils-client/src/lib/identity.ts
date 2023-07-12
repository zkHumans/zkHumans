import { trpc } from '@zkhumans/trpc-client';
import {
  AuthNFactor,
  AuthNProvider,
  AuthNType,
  Identity,
} from '@zkhumans/contracts';
import { BioAuthOracle, BioAuthorizedMessage } from '@zkhumans/snarky-bioauth';
import { CircuitString, Field, MerkleMap, Poseidon, PublicKey } from 'snarkyjs';
import { Identifier, generateIdentifiers } from '@zkhumans/utils';

import type { ApiStoreByIdOutput } from '@zkhumans/trpc-client';
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
  static IDENTITY_MGR_NAME = '_IdentityManager_';
  static IDENTITY_MGR_SALT = 'TODO:somethingUniqueTotheZkapp';

  static async getIdentities(account: string) {
    const publicKey = PublicKey.fromBase58(account);

    const identifiers = generateIdentifiers(
      publicKey,
      this.IDENTITY_MGR_MAX_IDS_PER_ACCT
    );

    const dbIdentities = [] as NonNullable<ApiStoreByIdOutput>[];
    for (const identifier of identifiers) {
      const identity = new Identity({
        identifier: identifier.toField(),
        commitment: Field(0),
      });
      const id = identity.identifier.toString();
      const x = await trpc.store.byId.query({ identifier: id });
      if (x) dbIdentities.push(x);
    }

    return dbIdentities;
  }

  // Restore MerkleMap data from database, if it exists
  // otherwise return new MerkleMap()
  //
  // Note: db store is only created by the indexer service
  static async getStoredMerkleMap(identifier: string) {
    const mm = new MerkleMap();

    const store = await trpc.store.byId.query({ identifier });
    if (!store) return mm;

    // restore MerkleMap from db store
    for (const data of store.data) {
      try {
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
    const identity = new Identity({
      identifier: Identifier.fromBase58(identifier).toField(),
      commitment: Field(0),
    });
    const id = identity.identifier.toString();
    return this.getStoredMerkleMap(id);
  }
  */

  /**
   * Get MerkleMap for an Identity Manager.
   * Create in database if doesn't exist, restore from database if it does.
   */
  /*
  static async getManagerMM(idMgr: string = IDENTITY_MGR_SMT_NAME) {
    return this.getStoredMerkleMap(idMgr);
  }
  */

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
      const identity = new Identity({
        identifier: identifier.toField(),
        commitment: Field(0),
      });
      const id = identity.identifier.toString();
      const x = await trpc.store.byId.query({ identifier: id });
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

  static async getAuthNFactorsFromKeyring(identifier: string) {
    const authNFactors = {} as { [key: string]: AuthNFactorProtocol };

    // X: const dbSmtKeyring = await trpc.smt.get.query({ id: identifier });
    // X: if (!dbSmtKeyring) return authnFactors;
    // X: for (const txn of dbSmtKeyring.txns) {
    // X:   if (txn.value) {
    // X:     const af: AuthNFactor = smtStringToValue(txn.value, AuthNFactor);
    // X:     authnFactors[txn.key] = {
    // X:       type: Number(af.type.toString()),
    // X:       provider: Number(af.provider.toString()),
    // X:       revision: Number(af.revision.toString()),
    // X:     };
    // X:   }
    // X: }

    return authNFactors;
  }

  /*
  static async prepareAddNewIdentity(
    identifier: string,
    mmIDKeyring: MerkleMap
  ) {
    const mmIDManager = await IdentityClientUtils.getManagerMM();

    const identity = new Identity({
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
    const x = { type: '', provider: '', revision: Number(afp.revision) };

    switch (afp.type) {
      case AuthNType.operator:
        x.type = 'Operator Key';
        break;
      case AuthNType.password:
        x.type = 'Password';
        break;
      case AuthNType.facescan:
        x.type = 'Facescan';
        break;
      case AuthNType.fingerprint:
        x.type = 'Fingerprint';
        break;
      case AuthNType.retina:
        x.type = 'Retina';
        break;
      case AuthNType.proofOfPerson:
        x.type = 'Proof of Unique Living Human';
        break;
    }

    switch (afp.provider) {
      case AuthNProvider.self:
        x.provider = 'Self';
        break;
      case AuthNProvider.zkhumans:
        x.provider = 'zkHumans';
        break;
      case AuthNProvider.humanode:
        x.provider = 'Humanode';
        break;
      case AuthNProvider.webauthn:
        x.type = 'WebAuthn';
        break;
    }

    return x;
  }
}
