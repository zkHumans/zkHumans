import { Field } from 'snarkyjs';

import { payloadToBase58 } from './util.js';

export { BioAuthOracle };

export type { BioAuthOracleMeta };

/**
 * The returned object from {@link BioAuthOracle.fetchMeta}.
 */
interface BioAuthOracleMeta {
  /** The BioAuth Oracle's Mina publicKey (in base58 format). */
  publicKey: string;
}

/**
 * BioAuthOracle; a client utility for interacting with a BioAuth Oracle server
 * to abstract+establish its API.
 * @class BioAuthOracle
 */
class BioAuthOracle {
  protected url: string;

  /**
   * @param {} url The bio-auth oracle's URL
   */
  constructor(url: string) {
    this.url = url;
  }

  /**
   * From the given payload, returns a signed bio-authorized message and its id
   * from the oracle server.
   *
   * The BioAuth id is always returned so an auth link may be requested for it
   * using {@link getBioAuthLink}.
   *
   * @param {} payload The data to have bio-authorized.
   * @returns {} A BioAuthorizedMessage (as JSON) or null if the payload has
   * not yet been bio-authorized.
   */
  public async fetchBioAuth(payload: Field): Promise<[string, null | string]> {
    const id = payloadToBase58(payload);
    const response = await fetch(`${this.url}/${id}`);

    if (response.status == 404) return [id, null];

    const data = await response.json();
    return [id, JSON.stringify(data)];
  }

  /**
   * Fetch meta information from the BioAuth Oracle.
   *
   * @returns {} The BioAuthoracle's meta info or null upon error.
   */
  public async fetchMeta(): Promise<null | BioAuthOracleMeta> {
    const response = await fetch(`${this.url}/meta`);
    if (response.status !== 200) return null;
    const data = (await response.json()) as BioAuthOracleMeta;
    return data;
  }

  /**
   * Given a BioAuth id, as returned by {@link fetchBioAuth}, returns a URL for
   * a human to follow to conduct the bio-authorization of the data associated
   * with the id.
   *
   * @param {} id a BioAuth id
   * @returns {} URL Link a human can follow to bio-authenticate
   */
  public getBioAuthLink(id: string): string {
    return `${this.url}/auth/${id}`;
  }
}
