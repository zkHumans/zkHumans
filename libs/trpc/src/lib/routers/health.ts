import { prisma } from '../prisma';
import { t } from '../server';

export const healthRouter = t.router({
  check: t.procedure.query(async () => {
    // ensure a database connection can be established
    await prisma.smt.count();
    return 1;
  }),
});
