import type { LinksFunction, V2_MetaFunction } from '@remix-run/node';
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useOutletContext,
} from '@remix-run/react';
import { trpc } from '@zkhumans/trpc-client';
import styles from './tailwind.css';
import { UI } from './components';
import { useConsole, useData, useZKApp } from './hooks';
import type { CNSL, Snarkyjs } from './hooks';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: styles }];

export const meta: V2_MetaFunction = () => [
  { charset: 'utf-8' },
  { title: 'zkHumans' },
  { viewport: 'width=device-width,initial-scale=1' },
];

// zkApp init function, called in-browser through useZKApp
async function zkAppInit(snarkyjs: Snarkyjs, cnsl: CNSL) {
  const { IdentityManager } = await import('@zkhumans/contracts');

  // Note: takes a very long time!
  await IdentityManager.compile();

  const meta = await trpc.meta.query();
  const identityManager = new IdentityManager(
    snarkyjs.PublicKey.fromBase58(meta.address.IdentityManager)
  );
  cnsl.log('success', 'zkApp IdentityManager @', meta.address.IdentityManager);

  return { identityManager };
}

// our zkApp's type, deduced from the init function
export type ZKApp = Awaited<ReturnType<typeof zkAppInit>>;

export type AppContextType = {
  cnsl: ReturnType<typeof useConsole>;
  data: ReturnType<typeof useData>;
  zk: ReturnType<typeof useZKApp<ZKApp>>;
};

export default function App() {
  const cnsl = useConsole();
  const zk = useZKApp<ZKApp>(cnsl, zkAppInit);
  const data = useData(cnsl, zk);
  const context = { cnsl, data, zk };

  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <UI context={context}>
          <Outlet context={context} />
        </UI>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

export function useAppContext() {
  return useOutletContext<AppContextType>();
}
