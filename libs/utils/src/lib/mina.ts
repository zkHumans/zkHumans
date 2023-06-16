// 2023-06-15 adapted from:
// https://github.com/o1-labs/docs2/blob/main/examples/zkapps/interacting-with-zkApps-server-side/src/utils.ts

import { PublicKey, fetchAccount, PrivateKey, Mina } from 'snarkyjs';

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

const deployTransactionFee = 100_000_000;

export async function deploy(
  deployerPrivateKey: PrivateKey,
  zkAppPrivateKey: PrivateKey,
  // zkapp: SmartContract,
  // verificationKey: { data: string; hash: string | Field },
  network: string,
  f: () => void
) {
  const sender = deployerPrivateKey.toPublicKey();
  const zkAppPublicKey = zkAppPrivateKey.toPublicKey();
  console.log('using deployer private key with public key', sender.toBase58());
  console.log(
    'using zkApp private key with public key',
    zkAppPublicKey.toBase58()
  );

  const { account } = await fetchAccount(
    { publicKey: zkAppPublicKey },
    network
  );
  let isDeployed = account?.zkapp?.verificationKey !== undefined;

  if (isDeployed) {
    console.log(
      'zkApp for public key',
      zkAppPublicKey.toBase58(),
      'found deployed'
    );
  } else {
    console.log('Deploying zkapp for public key', zkAppPublicKey.toBase58());
    Mina.setActiveInstance(Mina.Network(network));
    const transaction = await Mina.transaction(
      { sender, fee: deployTransactionFee },
      f
      // () => {
      //   AccountUpdate.fundNewAccount(sender);
      //   // NOTE: this calls `init()` if this is the first deploy
      //   zkapp.deploy({ verificationKey });
      // }
    );
    await transaction.prove();
    transaction.sign([deployerPrivateKey, zkAppPrivateKey]);

    console.log('Sending the deploy transaction...');
    const res = await transaction.send();
    const hash = res.hash();
    if (hash === undefined) {
      console.log('error sending transaction (see above)');
    } else {
      console.log(
        'See deploy transaction at',
        'https://berkeley.minaexplorer.com/transaction/' + hash
      );
      console.log('waiting for zkApp account to be deployed...');
      await res.wait();
      isDeployed = true;
    }
  }
  return isDeployed;
}
