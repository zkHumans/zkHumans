import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../middleware/prisma';
import { t } from '../server';

export const selectStoreData = Prisma.validator<Prisma.storeDataSelect>()({
  id: true,
  key: true,
  value: true,
  meta: true,
  isPending: true,
  commitmentPending: true,
  commitmentSettled: true,
  settlementChecksum: true,
});

export const selectStore = Prisma.validator<Prisma.storeSelect>()({
  identifier: true,
  commitment: true,
  meta: true,
  data: {
    select: selectStoreData,
  },
});

export const storeRouter = t.router({
  // create a new Store with the given id and commitment
  // corresponds to event `store:new`
  create: t.procedure
    .input(
      z.object({
        identifier: z.string(),
        commitment: z.string(),
        meta: z.string().optional(),
        zkapp: z.object({
          address: z.string(),
        }),
        event: z.object({
          id: z.string(),
        }),
      })
    )
    .mutation(
      async ({ input: { zkapp, event, identifier, commitment, ...data } }) => {
        return await prisma.store.create({
          data: {
            identifier,
            commitment,
            zkapp: { connect: { address: zkapp.address } },
            event: { connect: { id: event.id } },
            ...data,
          },
          select: selectStore,
        });
      }
    ),

  delete: t.procedure
    .input(
      z.object({
        identifier: z.string(),
      })
    )
    .mutation(async ({ input: { identifier } }) => {
      return await prisma.store.delete({ where: { identifier } });
    }),

  // get Store by id
  byId: t.procedure
    .input(z.object({ identifier: z.string() }))
    .query(async ({ input: { identifier } }) => {
      return await prisma.store.findUnique({
        where: { identifier },
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

  getPending: t.procedure.query(async () => {
    return await prisma.storeData.findMany({
      where: { isPending: true },
      orderBy: [{ id: 'asc' }],
      select: selectStoreData,
    });
  }),

  // set a key:value pair in a Store
  set: t.procedure
    .input(
      z.object({
        store: z.object({
          identifier: z.string(),
        }),
        event: z.object({
          id: z.string(),
        }),
        key: z.string(),
        value: z.string().optional(),
        meta: z.string().optional(),
        isPending: z.boolean().optional(),
        commitmentPending: z.string().optional(),
        commitmentSettled: z.string().optional(),
        settlementChecksum: z.string().optional(),
      })
    )
    .mutation(async ({ input: { store, event, key, ...data } }) => {
      return await prisma.storeData.upsert({
        where: { key_storeId: { key, storeId: store.identifier } },
        update: {
          ...data,
        },
        create: {
          ...data,
          key,
          store: { connect: { identifier: store.identifier } },
          event: { connect: { id: event.id } },
        },
        select: selectStoreData,
      });
    }),
});
