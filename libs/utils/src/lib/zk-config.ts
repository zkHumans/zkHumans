import { promises as fs } from 'fs';
import { PrivateKey } from 'snarkyjs';

export type ZKConfig = {
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

export async function parseConfig(deployAlias: string) {
  // parse config file
  const configJson: ZKConfig = JSON.parse(
    await fs.readFile('config.json', 'utf8')
  );
  const config = configJson.deployAliases[deployAlias];
  if (!config) throw new Error(`deployAlias not found: ${deployAlias}`);

  // parse feepayer key path from config file
  const feepayerKeyPath = configJson.deployAliases[deployAlias].feepayerKeyPath;
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
    config,
    feepayerPrivateKey: PrivateKey.fromBase58(feepayerKey.privateKey),
    zkAppPrivateKey: PrivateKey.fromBase58(zkAppKey.privateKey),
  };
}
