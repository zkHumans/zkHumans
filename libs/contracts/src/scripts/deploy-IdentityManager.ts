import { basename } from 'path';
import { promises as fs } from 'fs';
import {
  AccountUpdate,
  CircuitString,
  MerkleMap,
  Poseidon,
  PrivateKey,
} from 'snarkyjs';
import { Identifier, deploy, loopUntilAccountExists } from '@zkhumans/utils';
import { eventStoreDefault } from '@zkhumans/zkkv';
import { Identity, IdentityManager } from '../IdentityManager';

Error.stackTraceLimit = 1000;

const EXE = basename(process.argv[1], '.js');

process.chdir(process.cwd() + '/libs/contracts');

// check env for auth
const authStr = process.env['ZKAPP_SECRET_AUTH'];
if (!authStr) {
  console.error(`ERROR: env ZKAPP_SECRET_AUTH undefined`);
  process.exit(1);
}

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

  // create empty MM, get root
  const mmIDManager = new MerkleMap();

  // TODO: restore MM from db to upgrade zkApp with existing off-line storage

  // simulate the zkApp itself as an Identity
  // to conform its off-chain storage mechanics
  const zkAppIdentity = new Identity({
    identifier: Identifier.fromPublicKey(zkAppPublicKey, 1).toField(),
    commitment: mmIDManager.getRoot(),
  });
  const initIdentifier = zkAppIdentity.identifier;
  const initCommitment = zkAppIdentity.commitment;
  console.log('init identifier :', initIdentifier.toString());
  console.log('init commitment :', initCommitment.toString());

  // setup auth
  const authToken = Poseidon.hash(CircuitString.fromString(authStr).toFields());
  const authHash = Poseidon.hash([authToken]);

  await deploy(deployerPrivateKey, zkAppPrivateKey, config.url, () => {
    const sender = deployerPrivateKey.toPublicKey();
    AccountUpdate.fundNewAccount(sender);

    // NOTE: this calls `init()` if this is the first deploy
    zkApp.deploy({ verificationKey });

    // set initial storage identifier and root hash
    zkApp.identifier.set(initIdentifier);
    zkApp.commitment.set(initCommitment);
    zkApp.authHash.set(authHash);

    // notify off-chain storage
    zkApp.emitEvent('store:new', {
      ...eventStoreDefault,
      id: initIdentifier,
      root1: initCommitment,
    });
  });

  const zkAppAccount = await loopUntilAccountExists({
    account: zkAppPublicKey,
    eachTimeNotExist: () =>
      console.log('waiting for zkApp account to exist...'),
    isZkAppAccount: true,
    network: config.url,
  });
  if (!zkAppAccount) {
    console.error(`${EXE}: ERROR: zkAppAccount: account not deployed(?).`);
    process.exit(1);
  }
  console.log('⚡ zkApp deployed @', zkAppPublicKey.toBase58());

  process.exit(0);
} catch (e) {
  console.log(`${EXE}: ERROR:`, e);
  process.exit(1);
}
