import { jest } from '@jest/globals';
import { trpc } from '@zkhumans/trpc';

import { smtApplyTransactions, smtValueToString } from '@zkhumans/utils';
import { MemoryStore, SparseMerkleTree } from 'snarky-smt';
import { Field } from 'snarkyjs';

describe('SMT', () => {
  jest.setTimeout(1000 * 100);

  const id = '__TEST__';

  const k1 = Field(0);
  const v1 = Field(1);
  const k2 = Field(2);
  const v2 = Field(3);

  it('should create, update, restore an SMT in database', async () => {
    ////////////////////////////////////
    // Get / Clear (for fresh test)
    ////////////////////////////////////

    if (await trpc.smt.get.query({ id })) await trpc.smt.clear.mutate({ id });

    ////////////////////////////////////
    // Create
    ////////////////////////////////////

    // Create an SMT
    const store1 = new MemoryStore<Field>();
    const smt1 = await SparseMerkleTree.build(store1, Field, Field);

    // get SMT data from database, create if not exists
    let dbSmt =
      (await trpc.smt.get.query({ id })) ??
      (await trpc.smt.create.mutate({ id, root: '' }));

    // apply db-stored SMT modification history to restore in-memory
    // (there are none, as this is a fresh SMT)
    await smtApplyTransactions(smt1, Field, Field, dbSmt);

    ////////////////////////////////////
    // Update
    ////////////////////////////////////

    // add to the SMT
    await smt1.update(k1, v1);
    await trpc.smt.txn.mutate({
      id,
      txn: 'update',
      key: smtValueToString(k1, Field),
      value: smtValueToString(v1, Field),
    });

    // add to the SMT
    await smt1.update(k2, v2);
    await trpc.smt.txn.mutate({
      id,
      txn: 'update',
      key: smtValueToString(k2, Field),
      value: smtValueToString(v2, Field),
    });

    // delete from SMT
    await smt1.delete(k1);
    await trpc.smt.txn.mutate({
      id,
      txn: 'delete',
      key: smtValueToString(k1, Field),
    });

    dbSmt = await trpc.smt.get.query({ id });
    console.log('dbSmt', dbSmt);

    ////////////////////////////////////
    // Restore
    ////////////////////////////////////

    const store2 = new MemoryStore<Field>();
    const smt2 = await SparseMerkleTree.build(store2, Field, Field);

    // get SMT data from database, create if not exists
    let dbSmt2 =
      (await trpc.smt.get.query({ id })) ??
      (await trpc.smt.create.mutate({ id, root: '' }));

    // apply db-stored SMT modification history to restore in-memory
    await smtApplyTransactions(smt2, Field, Field, dbSmt2);

    dbSmt2 = await trpc.smt.get.query({ id });
    console.log('dbSmt2', dbSmt2);

    ////////////////////////////////////
    // Prove
    ////////////////////////////////////

    const proof1 = await smt1.prove(k2);
    const proof2 = await smt2.prove(k2);

    expect(proof1.root.toString()).toEqual(proof2.root.toString());

    ////////////////////////////////////
    // Clear
    ////////////////////////////////////

    const s = await trpc.smt.clear.mutate({ id });
    expect(s).toBeTruthy();
  });
});
