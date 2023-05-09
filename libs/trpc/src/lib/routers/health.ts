import { t } from '../server';

export const healthRouter = t.router({
  check: t.procedure.query(() => '1'),
});
