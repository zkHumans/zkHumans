import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../middleware/prisma';
import { t } from '../server';

export const selectEvent = Prisma.validator<Prisma.eventSelect>()({
  id: true,
  isProcessed: true,
  createdAt: true,
  type: true,
  data: true,
  transactionInfo: true,
  blockHeight: true,
  globalSlot: true,
  zkappAddress: true,
});

export const eventRouter = t.router({
  create: t.procedure
    .input(
      z.object({
        id: z.string(),
        type: z.string(),
        data: z.string(),
        transactionInfo: z.string(),
        blockHeight: z.bigint(),
        globalSlot: z.bigint(),
        zkapp: z.object({
          address: z.string(),
        }),
      })
    )
    .mutation(
      async ({
        input: {
          id,
          type,
          data,
          transactionInfo,
          blockHeight,
          globalSlot,
          zkapp,
        },
      }) => {
        return await prisma.event.create({
          data: {
            id,
            type,
            data,
            transactionInfo,
            blockHeight,
            globalSlot,
            zkapp: { connect: { address: zkapp.address } },
          },
          select: selectEvent,
        });
      }
    ),

  byId: t.procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input: { id } }) => {
      return await prisma.event.findUnique({
        where: { id },
        select: selectEvent,
      });
    }),

  delete: t.procedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input: { id } }) => {
      return await prisma.event.delete({ where: { id } });
    }),

  getUnprocessed: t.procedure.query(async () => {
    return await prisma.event.findMany({
      where: { isProcessed: false },
      orderBy: [{ blockHeight: 'asc' }, { createdAt: 'asc' }],
      select: selectEvent,
    });
  }),

  markProcessed: t.procedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input: { id } }) => {
      return await prisma.event.update({
        where: { id },
        data: {
          isProcessed: true,
          data: undefined, // don't need data anymore
        },
        select: selectEvent,
      });
    }),
});
