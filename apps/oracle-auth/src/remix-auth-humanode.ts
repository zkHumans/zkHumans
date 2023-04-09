import { OAuth2Strategy } from 'remix-auth-oauth2';
import type { StrategyVerifyCallback } from 'remix-auth';
import type {
  OAuth2Profile,
  OAuth2StrategyVerifyParams,
} from 'remix-auth-oauth2';

export type HumanodeScope = 'openid';

/**
 * This interface declares what configuration the strategy needs from the
 * developer to correctly work.
 */
export interface HumanodeStrategyOptions {
  clientID: string;
  clientSecret: string;
  callbackURL: string;
  scope?: HumanodeScope[];
  // TODO: issuer?: string;
  // TODO: authEndpoint?: string;
  // TODO: tokenEndpoint?: string;
}

export interface HumanodeProfile extends OAuth2Profile {
  id: string;
}

export interface HumanodeExtraParams extends Record<string, string | number> {
  tokenType: string;
}

export class HumanodeStrategy<User> extends OAuth2Strategy<
  User,
  HumanodeProfile,
  HumanodeExtraParams
> {
  name = 'humanode';

  private scope: HumanodeScope[];

  constructor(
    { clientID, clientSecret, callbackURL, scope }: HumanodeStrategyOptions,
    verify: StrategyVerifyCallback<
      User,
      OAuth2StrategyVerifyParams<HumanodeProfile, HumanodeExtraParams>
    >
  ) {
    super(
      {
        clientID,
        clientSecret,
        callbackURL,
        authorizationURL: 'https://auth.staging.oauth2.humanode.io/oauth2/auth',
        tokenURL: 'https://auth.staging.oauth2.humanode.io/oauth2/token',
      },
      verify
    );
    // do something with the options here
    this.scope = scope ?? ['openid'];
  }

  protected authorizationParams(): URLSearchParams {
    return new URLSearchParams({
      scope: this.scope.join(' '),
    });
  }
}
