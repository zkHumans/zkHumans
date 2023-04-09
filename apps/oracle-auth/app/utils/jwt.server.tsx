import { jwtVerify, createRemoteJWKSet } from 'jose';

import type { JOSEError } from 'jose/dist/types/util/errors';
import type { JWTPayload } from 'jose';

export const verifyJWT = async (
  token: string
): Promise<[JOSEError | null, JWTPayload | null]> => {
  try {
    const JWKS = createRemoteJWKSet(
      new URL(process.env.AUTH_HUMANODE_URI_JWKS || ''),
      {
        cacheMaxAge: 600000,
        cooldownDuration: 30000,
      }
    );

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.AUTH_HUMANODE_URI_ISSUER,
      audience: process.env.AUTH_HUMANODE_CLIENT_ID,
      algorithms: ['RS256'],
    });

    return [null, payload];
  } catch (err: unknown) {
    const error = err as JOSEError;
    console.error(`ERROR: jwt verification: ${error.code} ${error.message}`);
    error.message = humanReadableErrorMessage(error.code);
    return [error, null];
  }
};

// make error message more human readable for end users
// https://github.com/panva/jose/blob/main/docs/modules/util_errors.md
const humanReadableErrorMessage = (code: string): string => {
  switch (code) {
    case 'ERR_JWT_EXPIRED':
      return 'Session Expired';
    case 'ERR_JWKS_TIMEOUT':
      return 'Authentication Server Timeout';
    default:
      return 'Authentication Token Error';
  }
};
