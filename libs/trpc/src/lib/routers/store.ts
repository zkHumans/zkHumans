import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../middleware/prisma';
import { t } from '../server';

export const selectStoreData = Prisma.validator<Prisma.storeDataSelect>()({
  id: true,
  key: true,
  value: true,
  meta: true,
  blockHeight: true,
  globalSlot: true,
});

export const selectStore = Prisma.validator<Prisma.storeSelect>()({
  id: true,
  commitment: true,
  data: {
    select: selectStoreData,
  },
});

export const storeRouter = t.router({
  // create a Store with the given id and commitment
  create: t.procedure
    .input(
      z.object({
        id: z.string(),
        commitment: z.string(),
      })
    )
    .mutation(async ({ input: { id, commitment } }) => {
      return await prisma.store.create({
        data: {
          id,
          commitment,
        },
        select: selectStore,
      });
    }),

  // clear the Store
  clear: t.procedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input: { id } }) => {
      return await prisma.store.delete({ where: { id } });
    }),

  // get Store by id
  byId: t.procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input: { id } }) => {
      return await prisma.store.findUnique({
        where: { id },
        select: selectStore,
      });
    }),

  // get a value with the given key in a Store
  get: t.procedure
    .input(
      z.object({
        store: z.object({
          id: z.string(),
        }),
        key: z.string(),
      })
    )
    .query(async ({ input: { store, key } }) => {
      // there should be only one, but findUnique doesn't work here
      return await prisma.storeData.findFirst({
        where: { storeId: store.id, key },
        select: selectStore,
      });
    }),

  // set a key:value pair in a Store
  set: t.procedure
    .input(
      z.object({
        store: z.object({
          id: z.string(),
        }),
        key: z.string(),
        value: z.string().optional(),
        meta: z.string().optional(),
        blockHeight: z.number().optional(),
        globalSlot: z.number().optional(),
      })
    )
    .mutation(
      async ({
        input: { store, key, value, meta, blockHeight, globalSlot },
      }) => {
        return await prisma.storeData.create({
          data: {
            key,
            value,
            meta,
            blockHeight,
            globalSlot,
            store: { connect: { id: store.id } },
          },
          select: { id: true },
        });
      }
    ),
});
