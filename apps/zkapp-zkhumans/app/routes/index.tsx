import { Link } from '@remix-run/react';
import { Console, Modal, Navbar } from '../components';
import { useConsole, useZKApp, supportedNetworks } from '../hooks';

// Show first 6 and last 4 characters of user's Mina account.
const displayAccount = (account: string) =>
  `${account.slice(0, 6)}...${account.slice(-4)}`;

export default function Index() {
  const { consoleLog, log } = useConsole();
  const { state, handleConnectWallet } = useZKApp(log);

  const linkAuro = 'https://www.aurowallet.com/';
  const ModalNeedWallet = () => (
    <Modal title="MINA-compatible Wallet Not Found">
      Install Auro Wallet here:
      <br />
      <Link to={linkAuro} target="_blank" className="link link-primary">
        {linkAuro}
      </Link>
      .
    </Modal>
  );

  const ModalNeedNetwork = () => (
    <Modal title={`Unsupported Network: ${state.network}`}>
      Please configure your wallet for one of the following supported networks:
      <b> {supportedNetworks.join(', ')}</b>
    </Modal>
  );

  const linkFaucet = 'https://faucet.minaprotocol.com/';
  const ModalNeedAccountNetwork = () => (
    <Modal title={`Account does not exist on the Network`}>
      Please visit{' '}
      <Link
        to={`${linkFaucet}?address=${state.account}`}
        className="link link-primary"
        rel="noreferrer"
        target="_blank"
      >
        the faucet
      </Link>{' '}
      to fund this account.
    </Modal>
  );

  return (
    <div className="flex h-full min-h-screen flex-col">
      <Navbar
        authenticated={false}
        handleConnectWallet={handleConnectWallet}
        account={state.account ? displayAccount(state.account) : undefined}
      />
      {state.hasWallet === false && <ModalNeedWallet />}
      {state.hasNetwork === false && <ModalNeedNetwork />}
      {state.hasAccountNetwork === false && <ModalNeedAccountNetwork />}

      <div className="my-10 flex flex-grow flex-col items-center space-y-8">
        <div className="flex flex-col items-center">
          <h1 className="text-2xl font-bold">zkHumans</h1>
          <h1 className="text-1xl font-bold">
            Anon CryptoBiometric Memberships
          </h1>
        </div>
      </div>
      <Console log={consoleLog} />
    </div>
  );
}
