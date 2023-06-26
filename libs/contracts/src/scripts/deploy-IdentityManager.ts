import { basename } from 'path';
import { promises as fs } from 'fs';
import { AccountUpdate, CircuitString, PrivateKey } from 'snarkyjs';
import { MemoryStore, SparseMerkleTree } from 'snarky-smt';
import { Identity, IdentityManager } from '../IdentityManager';
import { deploy, loopUntilAccountExists } from '@zkhumans/utils';

Error.stackTraceLimit = 1000;

const EXE = basename(process.argv[1], '.js');

// check script args
const deployAlias = process.argv[2];
const zkAppKeyFilename = process.argv[3];
if (!zkAppKeyFilename) {
  console.error(`USAGE: ${EXE} <deployAlias (feepayer)> <zkAppKey>`);
  console.error(`Example: ${EXE} berkeley-feepayer berkeley-identity`);
  process.exit(1);
}

console.log('deployAlias =', deployAlias);

type ZKConfig = {
  version: number;
  deployAliases: Record<
    string,
    {
      url: string;
      keyPath: string;
      fee: string;
      smartContract: string;
    }
  >;
};

try {
  // parse config file
  const configJson: ZKConfig = JSON.parse(
    await fs.readFile('config.json', 'utf8')
  );
  const config = configJson.deployAliases[deployAlias];
  if (!config) {
    console.error(`${EXE}: ERROR: deployAlias not found: ${deployAlias}`);
    process.exit(1);
  }

  // parse deployer (feepayer) private key from file
  const deployerKey: { privateKey: string } = JSON.parse(
    await fs.readFile(config.keyPath, 'utf8')
  );
  const deployerPrivateKey = PrivateKey.fromBase58(deployerKey.privateKey);
  const deployerPublicKey = deployerPrivateKey.toPublicKey();

  // parse zkapp private key from file
  const zkAppKey: { privateKey: string } = JSON.parse(
    await fs.readFile(`keys/${zkAppKeyFilename}.json`, 'utf8')
  );
  const zkAppPrivateKey = PrivateKey.fromBase58(zkAppKey.privateKey);
  const zkAppPublicKey = zkAppPrivateKey.toPublicKey();

  // check (and wait for) account to exist
  const account = await loopUntilAccountExists({
    account: deployerPublicKey,
    eachTimeNotExist: () => {
      console.log(
        'Deployer account does not exist. Request funds at faucet ' +
          `https://faucet.minaprotocol.com/?address=${deployerPublicKey.toBase58()}`
      );
    },
    isZkAppAccount: false,
    network: config.url,
  });
  if (!account) {
    console.error(`${EXE}: ERROR: deployer account not funded.`);
    process.exit(1);
  }
  console.log(
    `Using fee payer account with nonce ${account.nonce}, balance ${account.balance}`
  );

  // compile the contract and get verificationkey
  console.log('compile the contract...');
  const { verificationKey } = await IdentityManager.compile();

  // create the zkApp
  const zkApp = new IdentityManager(zkAppPublicKey);

  // create empty SMT, get root
  const smtIDManager = await SparseMerkleTree.build<CircuitString, Identity>(
    new MemoryStore<Identity>(),
    CircuitString,
    Identity as any // eslint-disable-line @typescript-eslint/no-explicit-any
  );

  await deploy(deployerPrivateKey, zkAppPrivateKey, config.url, () => {
    const sender = deployerPrivateKey.toPublicKey();
    AccountUpdate.fundNewAccount(sender);

    // NOTE: this calls `init()` if this is the first deploy
    zkApp.deploy({ verificationKey });

    // set the initial root hash
    zkApp.idsRoot.set(smtIDManager.getRoot());
  });

  const zkAppAccount = await loopUntilAccountExists({
    account: zkAppPublicKey,
    eachTimeNotExist: () =>
      console.log('waiting for zkApp account to exist...'),
    isZkAppAccount: true,
    network: config.url,
  });
  if (!zkAppAccount) {
    console.error(`${EXE}: ERROR: zkAppAccount account not deployed(?).`);
    process.exit(1);
  }
  console.log('zkAppAccount account deployed.');

  process.exit(0);
} catch (e) {
  console.log(`${EXE}: ERROR:`, e);
  process.exit(1);
}
