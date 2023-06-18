import MinaProvider from '@aurowallet/mina-provider';
import { delay } from '@zkhumans/utils';
import { useEffect, useState } from 'react';
import type { LogFunction } from './useConsole';

import type { SignedData } from '@aurowallet/mina-provider/dist/TSTypes';

export type Snarkyjs = typeof import('snarkyjs');
export type WalletSignedData = SignedData;

// 'Mainnet', 'Devnet', 'Berkeley', or 'Unknown'
export const supportedNetworks = ['Berkeley'];

const isNetworkSupported = (network: string) =>
  supportedNetworks.includes(network);

const MINA_NETWORK = 'https://proxy.berkeley.minaexplorer.com/graphql';

/**
 * How often to (re)check the MINA network for presence of account.
 */
const CYCLE_CHECK_ACCOUNT_NETWORK = 5_000;

const stateInit = {
  /**
   * Has a MINA account been wallet-connected to the site?
   */
  hasAccount: null as null | boolean,

  /**
   * Does the MINA account exist on-chain?
   */
  hasAccountNetwork: null as null | boolean,

  /**
   * Has a fatal error occurred?
   */
  hasError: null as null | boolean,

  /**
   * Is the wallet configured to a supported network?
   */
  hasNetwork: null as null | boolean,

  /**
   * Is MINA-compatible wallet installed?
   */
  hasWallet: null as null | boolean,

  /**
   * The user's account; a PublicKey in Base58 string format.
   */
  account: null as null | string,

  /**
   * Which network the user's wallet is configured for.
   */
  network: null as null | string,

  /**
   * Dynamically imported snarkyjs ala `await import('snarkyjs')`.
   * (in-browser only)
   */
  snarkyjs: null as null | Snarkyjs,

  /**
   * aka "window.mina"
   */
  wallet: undefined as undefined | MinaProvider,

  /**
   * Smart Contract(s) as returned by custom zkAppInit().
   */
  zkApp: null as null | any, // eslint-disable-line @typescript-eslint/no-explicit-any

  /**
   * Used internally to recheck hasAccountNetwork.
   */
  counterAccountNetwork: 0,
};

export type ZKAppState<T> = Omit<typeof stateInit, 'zkApp'> & {
  zkApp: T | null;
};

export function useZKApp<T>(
  log: LogFunction,
  zkAppInit: (snarkyjs: Snarkyjs, log: LogFunction) => Promise<T>
) {
  const [state, setState] = useState<ZKAppState<T>>(stateInit);

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
    setState((s) => ({ ...s, hasWallet, wallet }));
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

  async function getSignedMessage(
    message: string
  ): Promise<WalletSignedData | null> {
    log('info', 'Requesting signature from wallet...');
    try {
      if (!state.wallet) throw new Error('wallet not connected');
      if (!state.hasAccountNetwork) throw new Error('account not found');
      const data = await state.wallet?.signMessage({
        message,
      });
      if (!data) throw new Error('signature empty');
      log('success', 'Signature received!');
      return data;
    } catch (
      err: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) {
      log('error', 'Signature failed:', err.message);
      console.log('ERROR', err.message, err.code);
      return null;
    }
  }

  function handleConnectWallet() {
    log('info', 'Connectng wallet...');

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
        `@T+${window.performance.now() - timeStart} ms | snarkyjs ready`
      );

      ////////////////////////////////////////////////////////////////////////
      // load zkApp!
      ////////////////////////////////////////////////////////////////////////

      try {
        const zkApp = await zkAppInit(snarkyjs, log);
        setState((s) => ({ ...s, hasError: false, zkApp }));
        log(
          'success',
          'zkApp(s) loaded!',
          'isSecureContext:',
          isSecureContext,
          'crossOriginIsolated:',
          self.crossOriginIsolated
        );
        log(
          'time',
          `@T+${window.performance.now() - timeStart} ms | zkApp ready`
        );
      } catch (
        err: any // eslint-disable-line @typescript-eslint/no-explicit-any
      ) {
        log('error', 'ERROR: zkAppInit:', err.message, err.code);
        setState((s) => ({ ...s, hasError: true }));
      }
    })();
  }

  return { state, getSignedMessage, handleConnectWallet };
}
