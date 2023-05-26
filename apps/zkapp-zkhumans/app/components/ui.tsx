import { Link } from '@remix-run/react';

import { Console, Modal, Navbar } from '../components';
import { supportedNetworks } from '../hooks';
import { AppContextType } from '../root';

interface UIProps {
  children: React.ReactNode;
  context: AppContextType;
}

export function UI({ children, context }: UIProps) {
  const { cnsl, zk } = context;

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
    <Modal title={`Unsupported Network: ${zk.state.network}`}>
      Please configure your wallet for one of the following supported networks:
      <b> {supportedNetworks.join(', ')}</b>
    </Modal>
  );

  const linkFaucet = 'https://faucet.minaprotocol.com/';
  const ModalNeedAccountNetwork = () => (
    <Modal title={`Account does not exist on the Network`}>
      Please visit{' '}
      <Link
        to={`${linkFaucet}?address=${zk.state.account}`}
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
        handleConnectWallet={zk.handleConnectWallet}
        account={zk.state.account}
      />
      {zk.state.hasWallet === false && <ModalNeedWallet />}
      {zk.state.hasNetwork === false && <ModalNeedNetwork />}
      {zk.state.hasAccountNetwork === false && <ModalNeedAccountNetwork />}

      <div className="flex flex-grow flex-col">{children}</div>

      <Console output={cnsl.output} />
    </div>
  );
}
