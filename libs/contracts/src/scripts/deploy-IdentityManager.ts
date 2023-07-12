import { basename } from 'path';
import { promises as fs } from 'fs';
import {
  AccountUpdate,
  CircuitString,
  MerkleMap,
  Mina,
  Poseidon,
  PrivateKey,
  fetchAccount,
} from 'snarkyjs';
import { Identifier, loopUntilAccountExists } from '@zkhumans/utils';
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
if (!deployAlias) {
  console.error(`USAGE: ${EXE} <deployAlias>`);
  console.error(`Example: ${EXE} berkeley-identity`);
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
      feepayerKeyPath: string;
      feepayerAlias: string;
    }
  >;
};

async function parseConfig(deployAlias: string) {
  try {
    // parse config file
    const configJson: ZKConfig = JSON.parse(
      await fs.readFile('config.json', 'utf8')
    );
    const config = configJson.deployAliases[deployAlias];
    if (!config) throw new Error(`deployAlias not found: ${deployAlias}`);

    // parse feepayer key path from config file
    const feepayerKeyPath =
      configJson.deployAliases[deployAlias].feepayerKeyPath;
    console.log('feepayerKeyPath =', feepayerKeyPath);

    // parse feepayer private key from file
    const feepayerKey: { privateKey: string } = JSON.parse(
      await fs.readFile(config.feepayerKeyPath, 'utf8')
    );

    // parse zkapp private key from file
    const zkAppKey: { privateKey: string } = JSON.parse(
      await fs.readFile(config.keyPath, 'utf8')
    );

    return {
      feepayerPrivateKey: PrivateKey.fromBase58(feepayerKey.privateKey),
      zkAppPrivateKey: PrivateKey.fromBase58(zkAppKey.privateKey),
      configUrl: config.url,
    };
  } catch (e) {
    console.log(`${EXE}: ERROR:`, e);
    process.exit(1);
  }
}

try {
  const { feepayerPrivateKey, zkAppPrivateKey, configUrl } = await parseConfig(
    deployAlias
  );

  const feepayerPublicKey = feepayerPrivateKey.toPublicKey();
  const zkAppPublicKey = zkAppPrivateKey.toPublicKey();

  const graphqlEndpoints = {
    mina: [
      'https://proxy.berkeley.minaexplorer.com/graphql',
      'https://api.minascan.io/node/berkeley/v1/graphql',
    ],
    archive: [
      'https://archive.berkeley.minaexplorer.com/',
      'https://api.minascan.io/archive/berkeley/v1/graphql/',
    ],
  };
  Mina.setActiveInstance(Mina.Network(graphqlEndpoints));

  console.log(`
  Using the following addresses:
    feePayer: ${feepayerPublicKey.toBase58()}
    IdentityManager: ${zkAppPublicKey.toBase58()}
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
    network: configUrl,
  });
  if (!account) throw new Error(`${EXE}: ERROR: feepayer account not funded.`);
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

  // deploy!
  console.log('deploying contract');
  const tx = await Mina.transaction(
    {
      sender: feepayerPublicKey,
      fee: 100_000_000,
    },
    () => {
      AccountUpdate.fundNewAccount(feepayerPublicKey);

      // NOTE: this calls `init()` if this is the first deploy
      zkApp.deploy({ verificationKey });
      // zkApp.deploy({ zkappKey: zkAppPrivateKey, verificationKey });

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
    }
  );
  await tx.prove();
  tx.sign([zkAppPrivateKey, feepayerPrivateKey]);
  // console.log('tx', tx.toPretty());

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
    network: configUrl,
  });
  if (!zkAppAccount) throw new Error('zkAppAccount: account not deployed(?)');

  console.log('⚡ zkApp deployed @', zkAppPublicKey.toBase58());

  process.exit(0);
} catch (e) {
  console.log(`${EXE}: ERROR:`, e);
  process.exit(1);
}
