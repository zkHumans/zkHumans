import { useEffect, useState } from 'react';
import { Identifier } from '@zkhumans/utils';

import type { ApiOutputStoreById } from '@zkhumans/trpc-client';
import type { AppContextType } from '../root';
import type { CNSL } from './useConsole';

type UIIdentity = NonNullable<ApiOutputStoreById> & { base58: string };

export function useData(cnsl: CNSL, zk: AppContextType['zk']) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [identities, setIdentities] = useState([] as UIIdentity[]);

  // get identities upon account change or refresh trigger
  useEffect(() => {
    (async () => {
      const { IdentityClientUtils } = await import('@zkhumans/utils-client');
      const { Field } = await import('snarkyjs');

      if (zk.state.account) {
        const ids = [] as UIIdentity[];
        const dbIds = await IdentityClientUtils.getIdentities(zk.state.account);
        for (const id of dbIds) {
          const base58 = Identifier.fromField(Field(id.identifier)).toBase58();
          ids.push({ ...id, base58 });
        }
        setIdentities(() => ids);
        if (!ids.length) cnsl.log('info', 'No identities yet, create one! ⭐');
      } else {
        setIdentities(() => []);
      }
    })();
  }, [zk.state.account, refreshTrigger]);

  const refresh = () => setRefreshTrigger((x) => x + 1);

  return { identities, refresh };
}
