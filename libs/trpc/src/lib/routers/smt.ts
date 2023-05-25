import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../middleware/prisma';
import { t } from '../server';

export const selectSMT = Prisma.validator<Prisma.smtSelect>()({
  id: true,
  root: true,
  txns: {
    select: {
      key: true,
      value: true,
      txn: true,
    },
  },
});

export const smtRouter = t.router({
  // Create an SMT with the given name.
  create: t.procedure
    .input(
      z.object({
        id: z.string(),
        root: z.string(),
      })
    )
    .mutation(async ({ input: { id, root } }) => {
      return await prisma.smt.create({
        data: {
          id,
          root,
        },
        select: selectSMT,
      });
    }),

  get: t.procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input: { id } }) => {
      return await prisma.smt.findUnique({
        where: { id },
        select: selectSMT,
      });
    }),

  // Clear the SMT.
  clear: t.procedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input: { id } }) => {
      return await prisma.smt.delete({ where: { id } });
    }),

  // Perform a "transaction" upon the SMT; either update or delete of key:(value) pair
  // such that it can be replayed to initiate state in-memory
  txn: t.procedure
    .input(
      z.object({
        id: z.string(),
        key: z.string(),
        value: z.string().optional(),
        txn: z.enum(['update', 'delete']),
      })
    )
    .mutation(async ({ input: { id, key, value, txn } }) => {
      return await prisma.smtTxn.create({
        data: {
          key,
          value,
          txn,
          smt: { connect: { id } },
        },
        select: { id: true },
      });
    }),
});
