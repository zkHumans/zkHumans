import SuperJSON from 'superjson';
import { createTRPCProxyClient, httpBatchLink, loggerLink } from '@trpc/client';

import type { AppRouter } from '@zkhumans/trpc';

// Note: With the exception of NODE_ENV, process.env variables are not
// available on statically build client, only server-side where there is an
// actual running process[1]. The default export uses '/api' as the url. Use
// createTRPCClient to init trpc client with a different api url, such as
// process.env('API_URL').
//
// [1] https://github.com/remix-run/remix/discussions/2928

const getURL = () => {
  const urlDefault = '/api';
  try {
    return process.env['API_URL'] ?? urlDefault;
  } catch (e) {
    return urlDefault;
  }
};

// TODO: check if this solves "everything"? to just import trpc from here

// ?: export const createTRPCClient = (url = '/api') =>
export const createTRPCClient = (url = getURL()) =>
  createTRPCProxyClient<AppRouter>({
    transformer: SuperJSON,
    links: [
      // Log to console in development and only log errors in production
      // https://trpc.io/docs/links/loggerLink
      loggerLink({
        enabled: (opts) =>
          (process.env['NODE_ENV'] === 'development' &&
            typeof window !== 'undefined') ||
          (opts.direction === 'down' && opts.result instanceof Error),
      }),
      httpBatchLink({
        url,
      }),
    ],
  });

export const trpc = createTRPCClient();
