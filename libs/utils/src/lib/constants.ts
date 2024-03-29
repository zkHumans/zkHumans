export const graphqlEndpoints = {
  mina: [
    'https://proxy.berkeley.minaexplorer.com/graphql',
    'https://api.minascan.io/node/berkeley/v1/graphql',
  ],
  archive: [
    'https://archive.berkeley.minaexplorer.com/',
    'https://api.minascan.io/archive/berkeley/v1/graphql/',
  ],
};

// for base58 checksum, modeled after snarkyjs
// https://github.com/o1-labs/snarkyjs-bindings/blob/main/crypto/constants.ts
export const versionBytes = {
  identifier: 180,
  bioauthPayload: 144,

  // tokenIdKey: 28,
  // receiptChainHash: 12,
  // ledgerHash: 5,
  // epochSeed: 13,
  // stateHash: 16,
  // publicKey: 203,
  // userCommandMemo: 20,
  // privateKey: 90,
  // signature: 154,
  // transactionHash: 29,
  // signedCommandV1: 19,
};
