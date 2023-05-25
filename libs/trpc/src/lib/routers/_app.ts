import { t } from '../server';
import { healthRouter } from './health';
import { metaProcedure } from './meta';
import { smtRouter } from './smt';

export const appRouter = t.router({
  health: healthRouter,
  meta: metaProcedure,
  smt: smtRouter,
});

export type AppRouter = typeof appRouter;
