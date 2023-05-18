import MinaProvider from '@aurowallet/mina-provider';
import { useEffect, useState } from 'react';
import type { LogFunction } from './useConsole';

type Snarkyjs = typeof import('snarkyjs');

// 'Mainnet', 'Devnet', 'Berkeley', or 'Unknown'
export const supportedNetworks = ['Berkeley'];

const isNetworkSupported = (network: string) =>
  supportedNetworks.includes(network);

const MINA_NETWORK = 'https://proxy.berkeley.minaexplorer.com/graphql';

/**
 * the address (public key) of the zkApp account
 */
const ZKAPP_ADDRESS_BIOAUTH =
  'B62qifx6gjn7Zy9MYvt8YKVPhxqdqnWesyj1otKpn95ZyL6eTnBUJaU';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * How often to (re)check the MINA network for presence of account.
 */
const CYCLE_CHECK_ACCOUNT_NETWORK = 5_000;

export function useZKApp(log: LogFunction) {
  let zkApp;

  const [state, setState] = useState({
    hasAccount: null as null | boolean, // has a MINA account been wallet-connected to the site
    hasAccountNetwork: null as null | boolean, // does the MINA account exist on-chain
    hasNetwork: null as null | boolean, // is the wallet configured to supported network
    hasWallet: null as null | boolean, // is MINA-compatible wallet installed
    account: null as null | string,
    network: null as null | string,
    snarkyjs: null as null | Snarkyjs,
    counterAccountNetwork: 0,
  });

  // watch for MINA wallet changes
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = (window as any).mina as MinaProvider;
    if (wallet) {
      wallet.on('chainChanged', (network) => checkNetwork(network));
      wallet.on('accountsChanged', (accounts) => {
        setState((s) => ({
          ...s,
          account: null,
          hasAccount: null,
          hasAccountNetwork: null,
        }));
        checkAccount(accounts);
      });
    }
  }, []);

  // wait for account to exist on network, if it did not
  // as counter is a useEffect dep, setting it triggers re-check
  useEffect(() => {
    (async () => {
      if (
        state.account &&
        state.hasNetwork &&
        state.snarkyjs &&
        !state.hasAccountNetwork
      ) {
        if (!(await checkAccountNetwork(state.account))) {
          await delay(CYCLE_CHECK_ACCOUNT_NETWORK);
          setState((s) => ({
            ...s,
            counterAccountNetwork: state.counterAccountNetwork + 1,
          }));
        }
      }
    })();
  }, [
    state.account,
    state.counterAccountNetwork,
    state.hasNetwork,
    state.snarkyjs,
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getWallet = () => (window as any).mina as MinaProvider | undefined;

  // check if user device has mina-compatible wallet
  const checkWallet = (wallet?: MinaProvider) => {
    const hasWallet = wallet !== undefined;
    setState((s) => ({ ...s, hasWallet }));
    log(hasWallet ? 'success' : 'error', 'has MINA-compatible wallet');
    return hasWallet;
  };

  // check if network is supported
  const checkNetwork = (network: string) => {
    let hasNetwork = false;
    if (isNetworkSupported(network)) hasNetwork = true;
    setState((s) => ({ ...s, hasNetwork, network }));
    log(hasNetwork ? 'success' : 'error', 'supported network:', network);
    return hasNetwork;
  };

  // check if account is already connected
  const checkAccount = (accounts?: string[]) => {
    let hasAccount = false;
    let account = null as null | string;
    if (accounts && accounts.length) {
      hasAccount = true;
      account = accounts.at(0) ?? null;
    }
    setState((s) => ({ ...s, hasAccount, account }));
    log(hasAccount ? 'success' : 'error', 'connected account:', account);
    return hasAccount;
  };

  /**
   * checkAccountNetwork.
   * Note: call after snarkyjs.isReady otherwise returns false
   * @param account - the MINA account to look for presence on the network
   */
  const checkAccountNetwork = async (account: string) => {
    if (!state.snarkyjs) return false;
    let hasAccountNetwork = false;
    const res = await state.snarkyjs.fetchAccount({ publicKey: account });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(res as any).error) hasAccountNetwork = true;
    setState((s) => ({ ...s, hasAccountNetwork }));
    log(
      hasAccountNetwork ? 'success' : 'error',
      'account exists on network:',
      account
    );
    return hasAccountNetwork;
  };

  // request connected account
  const requestAccount = async () => {
    try {
      const wallet = getWallet();
      const accounts = await wallet?.requestAccounts();
      // log('requestAccount --> checkAccount');
      return checkAccount(accounts);
    } catch (
      err: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
      // https://docs.minaprotocol.com/zkapps/how-to-write-a-zkapp-ui
      // If the user has a wallet installed but has not created an account, an
      // exception will be thrown. Consider showing "not connected"

      // https://docs.aurowallet.com/general/reference/api-reference/mina-provider/methods
      // If user reject, requestAccounts will throw an error with code and message filed
      log('error', 'ERROR: checkAccount:', err.message, err.code);
      setState((s) => ({ ...s, hasAccount: false, account: null }));
      return false;
    }
  };

  function handleConnectWallet() {
    log('info', 'Connect wallet!');

    (async () => {
      const wallet = getWallet();
      if (!checkWallet(wallet) || !wallet) return;

      const network = await wallet.requestNetwork();
      if (!checkNetwork(network)) return;

      const accounts = await wallet.getAccounts();
      if (!checkAccount(accounts) && !(await requestAccount())) return;

      ////////////////////////////////////////////////////////////////////////
      // load snarky!
      ////////////////////////////////////////////////////////////////////////

      log('time', '@T+0 ms | Loading...');
      const timeStart = window.performance.now();
      const snarkyjs = await import('snarkyjs');
      log(
        'time',
        `@T+${window.performance.now() - timeStart} ms | snarkyjs import`
      );
      await snarkyjs.isReady;
      snarkyjs.Mina.setActiveInstance(snarkyjs.Mina.Network(MINA_NETWORK));
      setState((s) => ({ ...s, snarkyjs }));
      log(
        'time',
        `@T+${window.performance.now() - timeStart} ms | snarkyjs isReady`
      );

      const { BioAuth } = await import('@zkhumans/contracts');
      log(
        'time',
        `@T+${
          window.performance.now() - timeStart
        } ms | BioAuth contract imported`
      );

      // Update this to use the address (public key) for your zkApp account
      zkApp = new BioAuth(snarkyjs.PublicKey.fromBase58(ZKAPP_ADDRESS_BIOAUTH));
      log(
        'info',
        'zkApp loaded!',
        'isSecureContext:',
        isSecureContext,
        'self.crossOriginIsolated:',
        self.crossOriginIsolated
      );
      log(
        'time',
        `@T+${window.performance.now() - timeStart} ms | zkApp = new BioAuth`
      );
    })();
  }

  return { state, handleConnectWallet, zkApp };
}
