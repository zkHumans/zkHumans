import { basename } from 'path';
import { promises as fs } from 'fs';
import { CircuitString, Mina, PrivateKey } from 'snarkyjs';
import { MemoryStore, SparseMerkleTree } from 'snarky-smt';
import { Identity, IdentityManager } from '../IdentityManager';

Error.stackTraceLimit = 1000;

const EXE = basename(process.argv[1], '.js');

// check script args
const deployAlias = process.argv[2];
if (!deployAlias) {
  console.error(`USAGE: ${EXE} <deploy alias>`);
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
  // parse config from file
  const configJson: ZKConfig = JSON.parse(
    await fs.readFile('config.json', 'utf8')
  );
  const config = configJson.deployAliases[deployAlias];
  if (!config) {
    console.error(`${EXE}: ERROR: deployAlias not found: ${deployAlias}`);
    process.exit(1);
  }

  // parse private key from file
  const key: { privateKey: string } = JSON.parse(
    await fs.readFile(config.keyPath, 'utf8')
  );
  const zkAppKey = PrivateKey.fromBase58(key.privateKey);

  // set up Mina instance and contract we interact with
  const Network = Mina.Network(config.url);
  Mina.setActiveInstance(Network);
  const zkAppAddress = zkAppKey.toPublicKey();
  console.log('zkAppKeyAddress =', zkAppAddress.toBase58());
  const zkApp = new IdentityManager(zkAppAddress);

  // compile the contract to create prover keys
  console.log('compile the contract...');
  await IdentityManager.compile();

  // create empty SMT
  const smtIDManager = await SparseMerkleTree.build<CircuitString, Identity>(
    new MemoryStore<Identity>(),
    CircuitString,
    Identity as any // eslint-disable-line @typescript-eslint/no-explicit-any
  );
  const commitment = smtIDManager.getRoot();
  console.log('commitment (MT root) = ', commitment);

  /*
  // send transaction to deploy contract
  console.log('build transaction and create proof...');
  const tx = await Mina.transaction(
    { sender: zkAppAddress, fee: 0.1e9 },
    () => {
      // zkApp.update();
      zkApp.deploy({ zkappKey: zkAppKey });
      zkApp.commitment.set(commitment);
    }
  );
  await tx.prove();
  console.log('send transaction...');
  const sentTx = await tx.sign([zkAppKey]).send();

  if (sentTx.hash() !== undefined) {
    console.log(`
Success! Update transaction sent.

Your smart contract state will be updated
as soon as the transaction is included in a block:
https://berkeley.minaexplorer.com/transaction/${sentTx.hash()}
`);
  }
  */

  process.exit(0);
} catch (e) {
  console.log(`${EXE}: ERROR:`, e);
  process.exit(1);
}
