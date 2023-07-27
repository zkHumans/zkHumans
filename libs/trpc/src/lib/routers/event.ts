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
  transactionHash: true,
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
        transactionHash: z.string(),
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
          transactionHash,
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
            transactionHash,
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

  select: t.procedure
    .input(
      z.object({
        isProcessed: z.boolean().optional(),
        createdAt: z.date().optional(),
        type: z.string().optional(),
        transactionHash: z.string().optional(),
        blockHeight: z.bigint().optional(),
        globalSlot: z.bigint().optional(),
        zkappAddress: z.string().optional(),
      })
    )
    .query(async ({ input: { ...data } }) => {
      return await prisma.event.findMany({
        where: { ...data },
        orderBy: [{ createdAt: 'asc' }],
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
          data: '', // don't need data anymore
        },
        select: selectEvent,
      });
    }),
});
