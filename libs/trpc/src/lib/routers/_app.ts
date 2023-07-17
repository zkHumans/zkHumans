import { t } from '../server';
import { eventRouter } from './event';
import { healthRouter } from './health';
import { metaProcedure } from './meta';
import { storageRouter } from './storage';
import { zkappRouter } from './zkapp';

export const appRouter = t.router({
  event: eventRouter,
  health: healthRouter,
  meta: metaProcedure,
  storage: storageRouter,
  zkapp: zkappRouter,
});

export type AppRouter = typeof appRouter;
