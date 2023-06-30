// for base58 checksum, modeled after snarkyjs
// https://github.com/o1-labs/snarkyjs-bindings/blob/main/crypto/constants.ts
export const versionBytes = {
  identifier: 144,

  // Note: Be unique! and don't use these:

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
