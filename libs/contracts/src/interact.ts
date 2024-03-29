/**
 * This script can be used to interact with the BioAuth contract, after deploying it.
 *
 * We call the update() method on the contract, create a proof and send it to the chain.
 * The endpoint that we interact with is read from your config.json.
 *
 * This simulates a user interacting with the zkApp from a browser, except that here, sending the transaction happens
 * from the script and we're using your pre-funded zkApp account to pay the transaction fee. In a real web app, the user's wallet
 * would send the transaction and pay the fee.
 *
 * To run locally:
 * Build the project: `$ npm run build`
 * Run with node:     `$ node build/src/interact.js <network>`.
 */
import { Mina, PrivateKey, shutdown } from 'snarkyjs';
import { promises as fs } from 'fs';
import { BioAuth } from './BioAuth.js';

// check command line arg
const network = process.argv[2];
if (!network)
  throw Error(`Missing <network> argument.

Usage:
node build/src/interact.js <network>

Example:
node build/src/interact.js berkeley
`);
Error.stackTraceLimit = 1000;

// parse config and private key from file
type Config = { networks: Record<string, { url: string; keyPath: string }> };
const configJson: Config = JSON.parse(await fs.readFile('config.json', 'utf8'));
const config = configJson.networks[network];
const key: { privateKey: string } = JSON.parse(
  await fs.readFile(config.keyPath, 'utf8')
);
const zkAppKey = PrivateKey.fromBase58(key.privateKey);

// set up Mina instance and contract we interact with
const Network = Mina.Network(config.url);
Mina.setActiveInstance(Network);
const zkAppAddress = zkAppKey.toPublicKey();
const zkApp = new BioAuth(zkAppAddress);

// compile the contract to create prover keys
console.log('compile the contract...');
await BioAuth.compile();

// call update() and send transaction
console.log('build transaction and create proof...');
const tx = await Mina.transaction({ sender: zkAppAddress, fee: 0.1e9 }, () => {
  // zkApp.update();
});
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
shutdown();
