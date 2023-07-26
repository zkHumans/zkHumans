import { basename } from 'path';
import {
  AccountUpdate,
  CircuitString,
  MerkleMap,
  Mina,
  Poseidon,
  fetchAccount,
  PrivateKey,
} from 'snarkyjs';
import {
  Identifier,
  graphqlEndpoints,
  loopUntilAccountExists,
  parseConfig,
} from '@zkhumans/utils';
import { eventStoreDefault } from '@zkhumans/zkkv';
import { Identity, IdentityManager } from '../IdentityManager';

Error.stackTraceLimit = 1000;

const EXE = basename(process.argv[1], '.js');

process.chdir(process.cwd() + '/libs/contracts');

// check env for auth
const ZKAPP_SECRET_AUTH = process.env['ZKAPP_SECRET_AUTH'];
if (!ZKAPP_SECRET_AUTH) {
  console.error(`ERROR: env ZKAPP_SECRET_AUTH undefined`);
  process.exit(1);
}

// check env for bioauth oracle signature key
const AUTH_MINA_PRIVATE_KEY = process.env['AUTH_MINA_PRIVATE_KEY'];
if (!AUTH_MINA_PRIVATE_KEY) {
  console.error(`ERROR: env AUTH_MINA_PRIVATE_KEY undefined`);
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

try {
  const { feepayerPrivateKey, zkAppPrivateKey, config } = await parseConfig(
    deployAlias
  );

  const feepayerPublicKey = feepayerPrivateKey.toPublicKey();
  const zkAppPublicKey = zkAppPrivateKey.toPublicKey();
  const oraclePublicKey = PrivateKey.fromBase58(
    AUTH_MINA_PRIVATE_KEY
  ).toPublicKey();

  Mina.setActiveInstance(Mina.Network(graphqlEndpoints));

  console.log(`
  Using the following addresses:
    feePayer: ${feepayerPublicKey.toBase58()}
    IdentityManager: ${zkAppPublicKey.toBase58()}
    BioAuthOracle: ${oraclePublicKey.toBase58()}
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
  const { verificationKey } = await IdentityManager.compile();

  // create the zkApp
  const zkApp = new IdentityManager(zkAppPublicKey);

  // create empty MM, get root
  const mmIDManager = new MerkleMap();

  // TODO: restore MM from db to upgrade zkApp with existing off-line storage

  // simulate the zkApp itself as an Identity
  // to conform its off-chain storage mechanics
  const zkAppIdentity = Identity.init({
    identifier: Identifier.fromPublicKey(zkAppPublicKey, 1).toField(),
    commitment: mmIDManager.getRoot(),
  });
  const initIdentifier = zkAppIdentity.identifier;
  const initCommitment = zkAppIdentity.commitment;
  console.log('init identifier :', initIdentifier.toString());
  console.log('init commitment :', initCommitment.toString());

  // setup auth
  const authToken = Poseidon.hash(
    CircuitString.fromString(ZKAPP_SECRET_AUTH).toFields()
  );
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

      // set initial state
      zkApp.identifier.set(initIdentifier);
      zkApp.commitment.set(initCommitment);
      zkApp.authHash.set(authHash);
      zkApp.oraclePublicKey.set(oraclePublicKey);

      // notify off-chain storage
      zkApp.emitEvent('storage:create', {
        ...eventStoreDefault,
        key: initIdentifier,
        value: initCommitment,
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
    network: config.url,
  });
  if (!zkAppAccount) throw new Error('zkAppAccount: account not deployed(?)');

  console.log('⚡ zkApp deployed @', zkAppPublicKey.toBase58());

  process.exit(0);
} catch (e) {
  console.log(`${EXE}: ERROR:`, e);
  process.exit(1);
}
