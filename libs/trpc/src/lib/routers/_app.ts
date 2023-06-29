import { t } from '../server';
import { healthRouter } from './health';
import { metaProcedure } from './meta';
import { smtRouter } from './smt';
import { storeRouter } from './store';
import { zkappRouter } from './zkapp';

export const appRouter = t.router({
  health: healthRouter,
  meta: metaProcedure,
  smt: smtRouter,
  store: storeRouter,
  zkapp: zkappRouter,
});

export type AppRouter = typeof appRouter;
