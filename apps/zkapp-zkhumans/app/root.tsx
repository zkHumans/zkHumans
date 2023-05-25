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
import { useConsole, useZKApp } from './hooks';
import type { LogFunction, Snarkyjs, ZKAppState } from './hooks';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: styles }];

export const meta: V2_MetaFunction = () => [
  { charset: 'utf-8' },
  { title: 'zkHumans' },
  { viewport: 'width=device-width,initial-scale=1' },
];

// zkApp init function, called in-browser by useZKApp after wallet is connected
async function zkAppInit(snarkyjs: Snarkyjs, log: LogFunction) {
  const { BioAuth, IdentityManager } = await import('@zkhumans/contracts');

  const pubKey = (x: string) => snarkyjs.PublicKey.fromBase58(x);
  const meta = await trpc.meta.query();

  const bioAuth = new BioAuth(pubKey(meta.address.BioAuth));
  const identityManager = new IdentityManager(
    pubKey(meta.address.IdentityManager)
  );
  log('success', 'zkApp BioAuth @', meta.address.BioAuth);
  log('success', 'zkApp IdentityManager @', meta.address.IdentityManager);
  return { bioAuth, identityManager };
}

// our zkApp's type, deduced from the init function
export type ZKApp = Awaited<ReturnType<typeof zkAppInit>>;

export type AppContextType = {
  cnsl: {
    log: LogFunction;
    output: string[];
  };
  zk: {
    state: ZKAppState<ZKApp>;
    handleConnectWallet: () => void;
  };
};

export default function App() {
  const cnsl = useConsole();
  const zk = useZKApp<ZKApp>(cnsl.log, zkAppInit);
  const context = { cnsl, zk };

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
