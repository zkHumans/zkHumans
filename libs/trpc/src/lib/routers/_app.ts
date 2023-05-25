import { t } from '../server';
import { healthRouter } from './health';
import { smtRouter } from './smt';

export const appRouter = t.router({
  health: healthRouter,
  smt: smtRouter,
});

export type AppRouter = typeof appRouter;
