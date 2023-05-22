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
import styles from './tailwind.css';
import { UI } from './components';
import { useConsole, useZKApp } from './hooks';
import type { LogFunction, Snarkyjs, ZKAppState } from './hooks';

/**
 * the address (public key) of the zkApp account
 */
const ZKAPP_ADDRESS_BIOAUTH =
  'B62qifx6gjn7Zy9MYvt8YKVPhxqdqnWesyj1otKpn95ZyL6eTnBUJaU';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: styles }];

export const meta: V2_MetaFunction = () => [
  { charset: 'utf-8' },
  { title: 'zkHumans' },
  { viewport: 'width=device-width,initial-scale=1' },
];

// zkApp init function, called in-browser by useZKApp after wallet is connected
async function zkAppInit(snarkyjs: Snarkyjs) {
  const { BioAuth } = await import('@zkhumans/contracts');
  return new BioAuth(snarkyjs.PublicKey.fromBase58(ZKAPP_ADDRESS_BIOAUTH));
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
