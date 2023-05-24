import SuperJSON from 'superjson';
import { createTRPCProxyClient, httpBatchLink, loggerLink } from '@trpc/client';
import type { AppRouter } from '@zkhumans/trpc';

// Not Working: import { trpc } from '@zkhumans/trpc';

// Note: This is a duplication of trpc client in @zkhumans/trpc as simply
// importing trpc client from there results in browser error about
// PrismaClient does not work in-browser. Creating trpc client here ensures
// only the AppRouter type is imported from the library.

export const trpc = createTRPCProxyClient<AppRouter>({
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
      url: process.env['API_URL'] ?? 'http://localhost:3000/api',
    }),
  ],
});
