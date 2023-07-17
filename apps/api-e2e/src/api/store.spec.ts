import { jest } from '@jest/globals';
import { Field, MerkleMap } from 'snarkyjs';
import { ApiInputEventCreate, trpc } from '@zkhumans/trpc-client';

describe('Store', () => {
  jest.setTimeout(1000 * 100);

  ////////////////////////////////////
  // test data
  ////////////////////////////////////

  const t = '__TEST__';
  const key = t; // store identifier
  const address = t; // zkapp address

  const event: ApiInputEventCreate = {
    id: t,
    type: t,
    data: t,
    transactionInfo: t,
    blockHeight: BigInt(0),
    globalSlot: BigInt(0),
  };

  const k1 = Field(100);
  const v1 = Field(200);
  const k2 = Field(300);
  const v2 = Field(400);

  it('should create, update, restore a MerkleMap in database', async () => {
    ////////////////////////////////////
    // Get / Clear (for fresh test)
    ////////////////////////////////////

    if (await trpc.storage.byKey.query({ key }))
      await trpc.storage.delete.mutate({ key });

    if (await trpc.zkapp.byAddress.query({ address }))
      await trpc.zkapp.delete.mutate({ address });

    if (await trpc.event.byId.query({ id: event.id }))
      await trpc.event.delete.mutate({ id: event.id });

    ////////////////////////////////////
    // Create
    ////////////////////////////////////

    // Create a MM
    const mm1 = new MerkleMap();

    // crete zkapp in database
    await trpc.zkapp.create.mutate({ address });

    // create event in database
    await trpc.event.create.mutate(event);

    // create store in database
    let dbMM = await trpc.storage.create.mutate({
      key,
      value: '',
      event: { id: event.id },
      zkapp: { address },
    });

    ////////////////////////////////////
    // Update
    ////////////////////////////////////

    const data = {
      event: { id: event.id },
      storage: { key },
      zkapp: { address },
    };

    // add to the MM
    mm1.set(k1, v1);
    await trpc.storage.set.mutate({
      key: k1.toString(),
      value: v1.toString(),
      ...data,
    });

    // add to the MM
    mm1.set(k2, v2);
    await trpc.storage.set.mutate({
      key: k2.toString(),
      value: v2.toString(),
      ...data,
    });

    // delete from MM (set to "empty")
    mm1.set(k1, Field(0));
    await trpc.storage.set.mutate({
      key: k1.toString(),
      value: Field(0).toString(),
      ...data,
    });

    dbMM = await trpc.storage.byKey.query({ key });
    console.log('dbMM', dbMM);

    ////////////////////////////////////
    // Restore
    ////////////////////////////////////

    const mm2 = new MerkleMap();

    // get existing storage from database
    const dbMM2 = await trpc.storage.byKeyWithData.query({ key });

    // restore Merkle Map from db
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

    const s = await trpc.storage.delete.mutate({ key });
    expect(s).toBeTruthy();

    const z = await trpc.zkapp.delete.mutate({ address });
    expect(z).toBeTruthy();

    const e = await trpc.event.delete.mutate({ id: event.id });
    expect(e).toBeTruthy();
  });
});
