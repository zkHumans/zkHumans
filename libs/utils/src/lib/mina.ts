// 2023-06-15 adapted from:
// https://github.com/o1-labs/docs2/blob/main/examples/zkapps/interacting-with-zkApps-server-side/src/utils.ts

import { PublicKey, fetchAccount } from 'snarkyjs';

export async function loopUntilAccountExists({
  account,
  eachTimeNotExist,
  isZkAppAccount,
  network,
}: {
  account: PublicKey;
  eachTimeNotExist: () => void;
  isZkAppAccount: boolean;
  network: string;
}) {
  for (;;) {
    const response = await fetchAccount({ publicKey: account }, network);
    let accountExists = response.account !== undefined;
    if (isZkAppAccount) {
      accountExists = response.account?.zkapp?.appState !== undefined;
    }
    if (!accountExists) {
      eachTimeNotExist();
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else {
      // TODO add optional check that verification key is correct once this is available in SnarkyJS
      return response.account;
    }
  }
}
