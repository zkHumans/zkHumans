import { basename } from 'path';
import { AccountUpdate, Mina, fetchAccount, PublicKey } from 'snarkyjs';
import {
  graphqlEndpoints,
  loopUntilAccountExists,
  parseConfig,
} from '@zkhumans/utils';
import { ExampleIdentityConsumer } from '../ExampleIdentityConsumer';

Error.stackTraceLimit = 1000;

const EXE = basename(process.argv[1], '.js');

process.chdir(process.cwd() + '/libs/contracts');

// address of deployed zkHumans IdentityManager SmartContract
// you can find this at https://api.dev.zkhumans.io/api/meta
const IDManagerAddress =
  'B62qqzgWSp85uhTbKaBbQgJTED2q5D3fDDek2cQnRJqbDS8GmdzTw1J';

const IDManagerPublicKey = PublicKey.fromBase58(IDManagerAddress);

// check script args
const deployAlias = process.argv[2];
if (!deployAlias) {
  console.error(`USAGE: ${EXE} <deployAlias>`);
  process.exit(1);
}

console.log('deployAlias =', deployAlias);

try {
  const { feepayerPrivateKey, zkAppPrivateKey, config } = await parseConfig(
    deployAlias
  );

  const feepayerPublicKey = feepayerPrivateKey.toPublicKey();
  const zkAppPublicKey = zkAppPrivateKey.toPublicKey();

  Mina.setActiveInstance(Mina.Network(graphqlEndpoints));

  console.log(`
  Using the following addresses:
    feePayer: ${feepayerPublicKey.toBase58()}
    Example: ${zkAppPublicKey.toBase58()}
    IdentityManager: ${IDManagerAddress}
  `);

  // check (and wait for) account to exist
  const account = await loopUntilAccountExists({
    account: feepayerPublicKey,
    eachTimeNotExist: () => {
      console.log(
        'Feepayer account does not exist. Request funds at faucet ' +
          `https://faucet.minaprotocol.com/?address=${feepayerPublicKey.toBase58()}`
      );
    },
    isZkAppAccount: false,
    network: config.url,
  });
  if (!account) throw new Error(`${EXE}: ERROR: feepayer account not funded.`);
  console.log(
    `Using fee payer account with nonce ${account.nonce}, balance ${account.balance}`
  );

  // compile the contract and get verificationkey
  console.log('compile the contract...');
  const { verificationKey } = await ExampleIdentityConsumer.compile();

  // create the zkApp
  const zkApp = new ExampleIdentityConsumer(zkAppPublicKey);

  // deploy!
  console.log('deploying contract');
  const tx = await Mina.transaction(
    {
      sender: feepayerPublicKey,
      fee: 100_000_000,
    },
    () => {
      AccountUpdate.fundNewAccount(feepayerPublicKey);

      zkApp.deploy({ verificationKey });

      // set IDManager in initial state
      zkApp.IDManagerPublicKey.set(IDManagerPublicKey);
    }
  );
  await tx.prove();
  tx.sign([zkAppPrivateKey, feepayerPrivateKey]);

  const res = await tx.send();
  const hash = res.hash();
  if (!hash) throw new Error('transaction send failed');
  console.log(
    'See deploy transaction at',
    'https://berkeley.minaexplorer.com/transaction/' + hash
  );

  console.log('waiting for zkApp account to be deployed...');
  await res.wait();

  console.log('successfully deployed contracts');

  await Promise.all(
    [feepayerPublicKey, zkAppPublicKey].map((publicKey) =>
      fetchAccount({ publicKey })
    )
  );

  const zkAppAccount = await loopUntilAccountExists({
    account: zkAppPublicKey,
    eachTimeNotExist: () =>
      console.log('waiting for zkApp account to exist...'),
    isZkAppAccount: true,
    network: config.url,
  });
  if (!zkAppAccount) throw new Error('zkAppAccount: account not deployed(?)');

  console.log('⚡ zkApp deployed @', zkAppPublicKey.toBase58());

  process.exit(0);
} catch (e) {
  console.log(`${EXE}: ERROR:`, e);
  process.exit(1);
}
