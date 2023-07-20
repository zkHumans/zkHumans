import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../middleware/prisma';
import { t } from '../server';

export const selectStorage = Prisma.validator<Prisma.storageSelect>()({
  key: true,
  value: true,
  meta: true,
  isPending: true,
  commitmentPending: true,
  commitmentSettled: true,
  settlementChecksum: true,
  storageKey: true,
  zkappAddress: true,
  createdAt: true,
  updatedAt: true,
});

export const storageRouter = t.router({
  // get storage by key
  byKey: t.procedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input: { key } }) => {
      return await prisma.storage.findUnique({
        where: { key },
        select: selectStorage,
      });
    }),

  // get storage by key, with data
  byKeyWithData: t.procedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input: { key } }) => {
      return await prisma.storage.findUnique({
        where: { key },
        select: { ...selectStorage, data: { select: selectStorage } },
      });
    }),

  commit: t.procedure
    .input(
      z.object({
        commitmentPending: z.string(),
        commitmentSettled: z.string(),
        event: z.object({
          id: z.string(),
        }),
        zkapp: z.object({
          address: z.string(),
        }),
      })
    )
    .mutation(
      async ({
        input: { commitmentPending, commitmentSettled, event, zkapp },
      }) => {
        const x = await prisma.storage.updateMany({
          where: {
            isPending: true,
            commitmentPending,
            zkappAddress: zkapp.address,
          },
          data: {
            isPending: false,
            commitmentSettled,
          },
        });

        // update event-storage relation, must be done individually
        // https://github.com/prisma/prisma/issues/3143
        const storage = await prisma.storage.findMany({
          where: {
            commitmentPending,
            commitmentSettled,
            zkappAddress: zkapp.address,
          },
        });
        await Promise.all(
          storage.map((s) => {
            return prisma.storage.update({
              where: { key: s.key },
              data: { events: { connect: { id: event.id } } },
            });
          })
        );

        return x;
      }
    ),

  // create a unit of key:value storage
  // use when storage.key is not known
  // use set when storage.key exists
  create: t.procedure
    .input(
      z.object({
        key: z.string(),
        value: z.string(),
        meta: z.string().optional(),
        isPending: z.boolean().optional(),
        commitmentPending: z.string().optional(),
        commitmentSettled: z.string().optional(),
        settlementChecksum: z.string().optional(),
        event: z.object({
          id: z.string(),
        }),
        zkapp: z.object({
          address: z.string(),
        }),
      })
    )
    .mutation(async ({ input: { key, value, event, zkapp, ...data } }) => {
      return await prisma.storage.create({
        data: {
          key,
          value,
          events: { connect: { id: event.id } },
          zkapp: { connect: { address: zkapp.address } },
          ...data,
        },
        select: selectStorage,
      });
    }),

  delete: t.procedure
    .input(
      z.object({
        key: z.string(),
      })
    )
    .mutation(async ({ input: { key } }) => {
      return await prisma.storage.delete({ where: { key } });
    }),

  // get a value with the given key in a Store
  get: t.procedure
    .input(
      z.object({
        storage: z.object({
          key: z.string(),
        }),
        key: z.string(),
      })
    )
    .query(async ({ input: { storage, key } }) => {
      // there should be only one, but findUnique doesn't work here
      return await prisma.storage.findFirst({
        where: { storageKey: storage.key, key },
        select: selectStorage,
      });
    }),

  pending: t.procedure.query(async () => {
    return await prisma.storage.findMany({
      where: { isPending: true },
      orderBy: [{ createdAt: 'asc' }],
      select: selectStorage,
    });
  }),

  // set or create a unit of key:value storage
  // requires storage with storage.key to exist
  set: t.procedure
    .input(
      z.object({
        key: z.string(),
        value: z.string(),
        meta: z.string().optional(),
        isPending: z.boolean().optional(),
        commitmentPending: z.string().optional(),
        commitmentSettled: z.string().optional(),
        settlementChecksum: z.string().optional(),
        event: z.object({
          id: z.string(),
        }),
        storage: z.object({
          key: z.string(),
        }),
        zkapp: z.object({
          address: z.string(),
        }),
      })
    )
    .mutation(
      async ({ input: { key, value, event, storage, zkapp, ...data } }) => {
        return await prisma.storage.upsert({
          where: { key },
          update: {
            value,
            ...data,
          },
          create: {
            key,
            value,
            events: { connect: { id: event.id } },
            storage: { connect: { key: storage.key } },
            zkapp: { connect: { address: zkapp.address } },
            ...data,
          },
          select: selectStorage,
        });
      }
    ),
});
