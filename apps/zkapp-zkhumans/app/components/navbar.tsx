import * as React from 'react';
import { Form, Link } from '@remix-run/react';
import { themeChange } from 'theme-change';
import {
  ArrowLeftOnRectangleIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  BellIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
} from '@heroicons/react/24/outline';

import tailwindConfig from '../../tailwind.config';
import { IconMina } from './icon-mina';

const {
  daisyui: { themes },
} = tailwindConfig;

interface NavbarProps {
  account?: string;
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

  return (
    <div className="navbar bg-base-100">
      <div className="navbar-start">
        <div className="dropdown">
          <label tabIndex={0} className="btn-ghost btn-circle btn">
            <Bars3Icon className="h-6 w-6" strokeWidth="2" />
          </label>
          <ul
            tabIndex={0}
            className="dropdown-content menu rounded-box menu-compact bg-base-200 mt-3 w-52 p-2 shadow"
          >
            <li className="hover-bordered" onClick={closeMenu}>
              <Link to="/">Home</Link>
            </li>
            <li className="hover-bordered" onClick={closeMenu}>
              <Link to="/identifiers">Identifiers</Link>
            </li>
            <li className="hover-bordered" onClick={closeMenu}>
              <Link to="/collectives">Collectives</Link>
            </li>
            <li className="menu-title">
              <span>Settings</span>
            </li>
            <li className="hover-bordered ml-2">
              <label tabIndex={0}>Theme</label>
              <ul className="rounded-box bg-base-300 p-2">
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
        <div className="tooltip tooltip-bottom" data-tip="theme toggle">
          <button
            className={`swap btn-ghost swap-rotate btn-circle btn ${
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
      </div>
      <div className="navbar-center"></div>
      <div className="navbar-end">
        <button
          className="btn btn-primary gap-2 normal-case"
          onClick={handleConnectWallet}
        >
          {account ? account : 'Connect'}
          <IconMina />
        </button>
        {/*
        <button className="btn-ghost btn-circle btn">
          <MagnifyingGlassIcon className="h-5 w-5" strokeWidth="2" />
        </button>
        <button className="btn-ghost btn-circle btn">
          <div className="indicator">
            <BellIcon className="h-5 w-5" strokeWidth="2" />
            <span className="badge-primary badge badge-xs indicator-item"></span>
          </div>
        </button>
        <Form action="/logout" method="post">
          <div className="tooltip tooltip-bottom" data-tip="logout">
            <button type="submit" className="btn-ghost btn-circle btn">
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
