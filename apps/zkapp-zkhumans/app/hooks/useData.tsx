import { useEffect, useState } from 'react';

import type { ApiSmtGetOutput } from '@zkhumans/trpc-client';
import type { AppContextType } from '../root';
import type { LogFunction } from './useConsole';

export function useData(log: LogFunction, zk: AppContextType['zk']) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [identities, setIdentities] = useState(
    [] as NonNullable<ApiSmtGetOutput>[]
  );

  // get identities upon account change or refresh trigger
  useEffect(() => {
    (async () => {
      const { IdentityClientUtils } = await import('@zkhumans/utils-client');
      if (zk.state.account) {
        const ids = await IdentityClientUtils.getIdentities(zk.state.account);
        setIdentities(() => ids);
        if (!ids.length) log('info', 'No identities yet, create one! ⭐');
      } else {
        setIdentities(() => []);
      }
    })();
  }, [zk.state.account, refreshTrigger]);

  const refresh = () => setRefreshTrigger((x) => x + 1);

  return { identities, refresh };
}
