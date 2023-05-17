import express from 'express';
import { payloadFromBase58 } from '@zkhumans/snarky-bioauth';
import {
  Encoding,
  Field,
  Poseidon,
  PrivateKey,
  Signature,
  isReady,
} from 'snarkyjs';

const host = process.env.AUTH_TEST_HOST ?? 'localhost';
const port = process.env.AUTH_TEST_PORT
  ? Number(process.env.AUTH_TEST_PORT)
  : 3002;

const app = express();

app.get('/', (_req, res) => {
  res.send({ message: 'Hello API' });
});

// The private key of our account. When running locally the hardcoded key will
// be used. In production the key will be loaded from environment variable.
const privateKeyBase58 =
  process.env.AUTH_TEST_MINA_PRIVATE_KEY ??
  'EKEVnkBTQRD7uYWwA6EedQbLAmCFgGfnSja1Z9Q5YvGVw4C2cu7s';

// simulate authenticated biometric identifiers
const bioAuthIds = [
  'bF1Hk36PrzBIY2AxSQT0',
  '5F1jP3ASmlBpX2Sf3Qy0',
  'HF1Fy3sz51BY62rlXQ50',
  '3F1KA3AphJBuJ2o3fQJ0',
  'pF14A3T7TRBDq2wkGQG0',
  'KF1wl35NGyBAY2U0jQd0',
  '8F1p13m01ABpr2ZAAQs0',
  '3F1p73MkvoB2v2QNKQP0',
  'cF1NQ33gMZBZ22TrrQS0',
  'iF1yT3hooSB5e2dRFQU0',
  'JF1DF3h1EmBpz2jtuQ40',
  'XF1yG3e7PZBD52dsqQS0',
  'SF1sb3dpv0BDl2j89QY0',
  'WF1a1362WBBbT2FHsQ90',
];
const getBioAuthId = (x: Field) =>
  bioAuthIds[+x.toString() % bioAuthIds.length];

async function getSignedBioAuthId(id: string) {
  // We need to wait for SnarkyJS to finish loading before we can do anything
  await isReady;

  const _payload = payloadFromBase58(id);

  const privateKey = PrivateKey.fromBase58(privateKeyBase58);

  // Compute the public key associated with our private key
  const publicKey = privateKey.toPublicKey();

  // Define a Field with the value of the payload
  const payload = Field(_payload);

  // Define a Field with the current timestamp
  const timestamp = Field(Date.now());

  // Define a Field with the users bioAuthId
  const bioAuthId = Poseidon.hash(
    Encoding.stringToFields(getBioAuthId(_payload))
  );

  // Use our private key to sign an array of Fields containing the data
  const signature = Signature.create(privateKey, [
    payload,
    timestamp,
    bioAuthId,
  ]);

  return {
    data: { payload, timestamp, bioAuthId },
    signature,
    publicKey,
  };
}

// for non-interactive tests
app.get('/mina/test/:id', async (req, res) => {
  const id = req.params.id;
  const body = await getSignedBioAuthId(id);
  res.json(body);
  console.log(`/${id} --> ${body.data.bioAuthId}`);
});

////////////////////////////////////////////////////////////////////////
// for simulating interactive requests
// more closely resembles deployed non-test oracle
////////////////////////////////////////////////////////////////////////

// an in-memory store of bioauthenticated payloads
const signedBioAuths = {};

app.get('/mina/meta', async (_req, res) => {
  try {
    await isReady;
    const privateKey = PrivateKey.fromBase58(privateKeyBase58);
    const publicKey = privateKey.toPublicKey();
    const meta = {
      publicKey,
    };
    res.json(meta);
    console.log('[200] /mina/meta');
  } catch (e) {
    console.log('ERROR', JSON.stringify(e));
  }
});

app.get('/mina/:id', async (req, res) => {
  const id = req.params.id;
  if (signedBioAuths[id]) {
    const body = signedBioAuths[id];
    res.json(body);
    console.log(`[200] /mina/${id} --> ${body.data.bioAuthId}`);
  } else {
    res.statusCode = 404;
    const body = { error: '404' };
    res.json(body);
    console.log(`[404] /mina/${id}`);
  }
});

app.get('/mina/auth/:id', async (req, res) => {
  const id = req.params.id;
  const signed = await getSignedBioAuthId(id);
  signedBioAuths[id] = signed;
  const body = signedBioAuths[id];
  res.send(body);
  console.log(`[200] /mina/auth/${id} --> ${signed.data.bioAuthId}`);
});

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
