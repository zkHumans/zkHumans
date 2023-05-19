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
import { LogFunction, ZKAppState, useConsole, useZKApp } from './hooks';
import { UI } from './components';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: styles }];

export const meta: V2_MetaFunction = () => [
  { charset: 'utf-8' },
  { title: 'zkHumans' },
  { viewport: 'width=device-width,initial-scale=1' },
];

export type AppContextType = {
  cnsl: {
    log: LogFunction;
    output: string[];
  };
  zk: {
    state: ZKAppState;
    handleConnectWallet: () => void;
    zkApp: undefined;
  };
};

export default function App() {
  const cnsl = useConsole();
  const zk = useZKApp(cnsl.log);
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
