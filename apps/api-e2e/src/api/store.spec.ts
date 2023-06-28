import { jest } from '@jest/globals';
import { Field, MerkleMap } from 'snarkyjs';
import { createTRPCClient } from '@zkhumans/trpc-client';

const trpc = createTRPCClient(process.env['API_URL']);

describe('Store', () => {
  jest.setTimeout(1000 * 100);

  const id = '__TEST__';

  const k1 = Field(100);
  const v1 = Field(200);
  const k2 = Field(300);
  const v2 = Field(400);

  it('should create, update, restore a MerkleMap in database', async () => {
    ////////////////////////////////////
    // Get / Clear (for fresh test)
    ////////////////////////////////////

    if (await trpc.store.byId.query({ id }))
      await trpc.store.clear.mutate({ id });

    ////////////////////////////////////
    // Create
    ////////////////////////////////////

    // Create a MM
    const mm1 = new MerkleMap();

    // get store from database, create if not exists
    let dbMM =
      (await trpc.store.byId.query({ id })) ??
      (await trpc.store.create.mutate({ id, commitment: '' }));

    // restore Merkle Map from db store
    for (const data of dbMM.data) {
      try {
        mm1.set(Field(data.key), Field(data.value));
      } catch (e) {
        console.log('Error', e.message);
      }
    }

    ////////////////////////////////////
    // Update
    ////////////////////////////////////

    // add to the MM
    mm1.set(k1, v1);
    await trpc.store.set.mutate({
      store: { id },
      key: k1.toString(),
      value: v1.toString(),
    });

    // add to the MM
    mm1.set(k2, v2);
    await trpc.store.set.mutate({
      store: { id },
      key: k2.toString(),
      value: v2.toString(),
    });

    // delete from MM (set to "empty")
    mm1.set(k1, Field(0));
    await trpc.store.set.mutate({
      store: { id },
      key: k1.toString(),
      value: Field(0).toString(),
    });

    dbMM = await trpc.store.byId.query({ id });
    console.log('dbMM', dbMM);

    ////////////////////////////////////
    // Restore
    ////////////////////////////////////

    const mm2 = new MerkleMap();

    // get store from database, create if not exists
    const dbMM2 =
      (await trpc.store.byId.query({ id })) ??
      (await trpc.store.create.mutate({ id, commitment: '' }));

    // restore Merkle Map from db store
    for (const data of dbMM2.data) {
      try {
        mm2.set(Field(data.key), Field(data.value));
      } catch (e) {
        console.log('Error', e.message);
      }
    }

    console.log('dbMM2', dbMM2);

    ////////////////////////////////////
    // Prove
    ////////////////////////////////////

    const witness1 = mm1.getWitness(k2);
    const witness2 = mm2.getWitness(k2);
    expect(witness1.equals(witness2).toBoolean()).toBeTruthy();

    ////////////////////////////////////
    // Clear
    ////////////////////////////////////

    const s = await trpc.store.clear.mutate({ id });
    expect(s).toBeTruthy();
  });
});
