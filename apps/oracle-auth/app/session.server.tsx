import { createCookieSessionStorage } from '@remix-run/node';
import invariant from 'tiny-invariant';

invariant(process.env.AUTH_SESSION_SECRET, 'AUTH_SESSION_SECRET must be set');

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '_session', // use any name you want here
    httpOnly: true, // for security reasons, make this cookie http only
    path: '/', // remember to add this so the cookie will work in all routes
    sameSite: 'lax', // this helps with CSRF
    secrets: [process.env.AUTH_SESSION_SECRET], // replace this with an actual secret
    secure: process.env.NODE_ENV === 'production', // enable this in prod only
  },
});
