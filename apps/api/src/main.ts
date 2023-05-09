import express from 'express';
import { expressHandleTRPCRequest } from '@zkhumans/trpc';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = express();

app.get('/', (_req, res) => {
  res.send({ message: 'Hello API' });
});

app.use('/api', expressHandleTRPCRequest());

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
