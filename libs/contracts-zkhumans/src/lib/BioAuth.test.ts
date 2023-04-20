import { BioAuth } from './BioAuth';
import {
  isReady,
  shutdown,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Signature,
  Poseidon,
} from 'snarkyjs';
import { jest } from '@jest/globals';
import {
  BioAuthorizedMessage,
  payloadToBase58,
} from '@zkhumans/snarky-bioauth';

// The public key of our trusted data provider
const ORACLE_PUBLIC_KEY =
  'B62qmP2nC16TvK2LPeHuWq1Ec8C8J4b8qZe5mLoNWW25F1HRqtFTvP3';

const ORACLE_URL = 'http://localhost:3000';

const proofsEnabled = false;

describe('BioAuth', () => {
  jest.setTimeout(1000 * 100);
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    senderAccount: PublicKey,
    senderKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: BioAuth;

  beforeAll(async () => {
    await isReady;
    if (proofsEnabled) BioAuth.compile();
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    // TODO#3: Local.setTimestamp(UInt64.from(Date.now()));
    Mina.setActiveInstance(Local);
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    ({ privateKey: senderKey, publicKey: senderAccount } =
      Local.testAccounts[1]);

    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new BioAuth(zkAppAddress);
  });

  afterAll(() => {
    // `shutdown()` internally calls `process.exit()` which will exit the running Jest process early.
    // Specifying a timeout of 0 is a workaround to defer `shutdown()` until Jest is done running all tests.
    // This should be fixed with https://github.com/MinaProtocol/mina/issues/10943
    setTimeout(shutdown, 0);
  });

  async function localDeploy() {
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  it('generates and deploys the `BioAuth` smart contract', async () => {
    await localDeploy();
    const oraclePublicKey = zkApp.oraclePublicKey.get();
    expect(oraclePublicKey).toEqual(PublicKey.fromBase58(ORACLE_PUBLIC_KEY));
  });

  describe('actual API requests', () => {
    it('emits an event if the account bioauthorization is valid', async () => {
      await localDeploy();

      // sign the public key to create the payload to bioauthenticate
      const userPublicKey = senderKey.toPublicKey();
      const userSig = Signature.create(senderKey, userPublicKey.toFields());
      const hash = Poseidon.hash(userSig.toFields());
      const id = payloadToBase58(hash);

      const response = await fetch(`${ORACLE_URL}/${id}`);
      const data = await response.json();
      const message = BioAuthorizedMessage.fromJSON(data);

      // !! set the local blockchain time to be current
      // TODO#3: Local.setTimestamp(UInt64.from(Date.now()));

      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.bioAuthorizeAccount(message, userPublicKey);
      });
      await txn.prove();
      await txn.sign([senderKey]).send();

      const events = await zkApp.fetchEvents();

      expect('bioAuthedAccount').toEqual(events[0].type);
      const eventValue = events[0].event.data;
      expect(eventValue).toEqual(userPublicKey);
    });
  });
});
