import * as React from 'react';
import { Link } from '@remix-run/react';
import { themeChange } from 'theme-change';
import {
  ArrowLeftOnRectangleIcon,
  ArrowRightOnRectangleIcon,
  EllipsisHorizontalIcon,
  MoonIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import { displayAccount } from '@zkhumans/utils';

import tailwindConfig from '../../tailwind.config';
import { IconMina } from './icon-mina';

const {
  daisyui: { themes },
} = tailwindConfig;

interface NavbarProps {
  account: string | null;
  authenticated: boolean;
  handleConnectWallet: () => void;
}

export function Navbar({
  account,
  authenticated,
  handleConnectWallet,
}: NavbarProps) {
  const [themeDark, setThemeDark] = React.useState<boolean>(false);

  React.useEffect(() => {
    console.log('authenticated', authenticated);
    themeChange(false);
  }, []);

  React.useEffect(() => {
    setThemeDark(localStorage.getItem('theme') === 'dark');
  }, [themeDark]);

  // [Close the dropdown menu upon menu item click](https://github.com/saadeghi/daisyui/issues/157#issuecomment-1119796119)
  const closeMenu = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const buttonThemeToggle = (
    <div className="tooltip tooltip-bottom" data-tip="theme toggle">
      <button
        className={`swap btn-ghost swap-rotate btn-square btn ${
          themeDark ? 'swap-active' : ''
        }`}
        onClick={() => setThemeDark(!themeDark)}
      >
        <div className="swap-on" data-set-theme="dark">
          <SunIcon className="h-6 w-6" strokeWidth="2" />
        </div>
        <div className="swap-off" data-set-theme="light">
          <MoonIcon className="h-6 w-6" strokeWidth="2" />
        </div>
      </button>
    </div>
  );

  const buttonWalletConnect = (
    <button
      className="btn btn-primary gap-2 normal-case"
      onClick={handleConnectWallet}
    >
      {account ? displayAccount(account) : 'Connect'}
      <IconMina />
    </button>
  );

  const links = (
    <div>
      <Link to={'./identities'}>
        <button className="btn btn-ghost btn-square normal-case">IDs</button>
      </Link>
    </div>
  );

  const logo = (
    <div className="mr-4">
      <Link to={'/'}>
        <b>zkHumans</b>
      </Link>
    </div>
  );

  const menu = (
    <div className="dropdown z-50">
      <label tabIndex={0} className="btn-ghost btn-square btn">
        {/* <Bars3Icon className="h-6 w-6" strokeWidth="2" /> */}
        <EllipsisHorizontalIcon className="h-6 w-6" strokeWidth="2" />
      </label>
      <ul
        tabIndex={0}
        className="dropdown-content menu rounded-box menu-md bg-base-200 text-base-content mt-3 w-52 shadow"
      >
        <li className="hover-bordered" onClick={closeMenu}>
          <Link to="/identities">Identities</Link>
        </li>
        <li className="hover-bordered" onClick={closeMenu}>
          <Link to="/collectives">Collectives</Link>
        </li>
        <li className="menu-title">
          <span>Settings</span>
        </li>
        <li className="hover-bordered ml-2">
          <label tabIndex={0}>Theme</label>
          <ul className="rounded-box bg-base-300 text-base-content p-2">
            {themes.map((theme: string) => (
              <li key={theme}>
                <span data-set-theme={theme}>{theme}</span>
              </li>
            ))}
          </ul>
        </li>
        <li className="menu-title">
          <span>Account</span>
        </li>
        <li className="hover-bordered" onClick={closeMenu}>
          {authenticated ? (
            <Link to="/logout">
              <ArrowRightOnRectangleIcon
                className="h-6 w-6 rotate-180"
                strokeWidth="2"
              />
              Logout
            </Link>
          ) : (
            <Link to="/login">
              <ArrowLeftOnRectangleIcon
                className="h-6 w-6 rotate-180"
                strokeWidth="2"
              />
              Login
            </Link>
          )}
        </li>
      </ul>
    </div>
  );

  return (
    <div className="navbar bg-base-100 text-base-content">
      <div className="navbar-start">
        {logo}
        {links}
        {menu}
      </div>
      <div className="navbar-center"></div>
      <div className="navbar-end">
        {buttonThemeToggle}
        {buttonWalletConnect}
        {/*
        <button className="btn-ghost btn-square btn">
          <MagnifyingGlassIcon className="h-5 w-5" strokeWidth="2" />
        </button>
        <button className="btn-ghost btn-square btn">
          <div className="indicator">
            <BellIcon className="h-5 w-5" strokeWidth="2" />
            <span className="badge-primary badge badge-xs indicator-item"></span>
          </div>
        </button>
        <Form action="/logout" method="post">
          <div className="tooltip tooltip-bottom" data-tip="logout">
            <button type="submit" className="btn-ghost btn-square btn">
              <ArrowLeftOnRectangleIcon
                className="h-6 w-6 rotate-180"
                strokeWidth="2"
              />
            </button>
          </div>
        </Form>
        */}
      </div>
    </div>
  );
}
