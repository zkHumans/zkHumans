import axios from 'axios';
import { trpc } from '@zkhumans/trpc';

describe('GET /', () => {
  it('should return a message', async () => {
    const res = await axios.get(`/`);

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: 'Hello API' });
  });

  it('has process.env.API_URL', async () => {
    console.log('API_URL', process.env.API_URL);
    expect(process.env.API_URL).toBeDefined();
  });

  it('health.check should return a value', async () => {
    const r = await trpc.health.check.query();
    expect(r).toBe(1);
  });

  // TODO: API return env, check it here
});
