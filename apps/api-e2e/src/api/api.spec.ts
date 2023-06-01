import axios from 'axios';
import { trpc } from '@zkhumans/trpc-client';

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

  it('/api/health.check', async () => {
    const r = await trpc.health.check.query();
    expect(r).toBe(1);
  });

  it('/api/meta', async () => {
    const meta = await trpc.meta.query();
    console.log('meta', meta);

    expect(meta.env).toEqual(process.env['NODE_ENV']);
    expect(meta.address.BioAuth).toEqual(
      process.env['ZKAPP_ADDRESS_BIOAUTH'] ?? ''
    );
    expect(meta.address.IdentityManager).toEqual(
      process.env['ZKAPP_ADDRESS_IDENTITY_MANAGER'] ?? ''
    );
    expect(meta.url.auth).toEqual(process.env['AUTH_URL'] ?? '');
  });
});
