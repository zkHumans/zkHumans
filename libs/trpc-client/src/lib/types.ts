import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@zkhumans/trpc';

// https://trpc.io/docs/server/infer-types
type RI = inferRouterInputs<AppRouter>;
type RO = inferRouterOutputs<AppRouter>;

// input

export type ApiInputEventById = RI['event']['byId'];
export type ApiInputEventCreate = RI['event']['create'];
export type ApiInputEventDelete = RI['event']['delete'];
export type ApiInputEventGetUnprocessed = RI['event']['getUnprocessed'];
export type ApiInputEventMarkProcessed = RI['event']['markProcessed'];

export type ApiInputMeta = RI['meta'];

export type ApiInputStorageByKey = RI['storage']['byKey'];
export type ApiInputStorageByKeyWithData = RI['storage']['byKeyWithData'];
export type ApiInputStorageByKeyWithEvents = RI['storage']['byKeyWithEvents'];
export type ApiInputStorageCreate = RI['storage']['create'];
export type ApiInputStorageDelete = RI['storage']['delete'];
export type ApiInputStorageGet = RI['storage']['get'];
export type ApiInputStoragePending = RI['storage']['pending'];
export type ApiInputStorageSet = RI['storage']['set'];

export type ApiInputZkappByAddress = RI['zkapp']['byAddress'];
export type ApiInputZkappCreate = RI['zkapp']['create'];
export type ApiInputZkappDelete = RI['zkapp']['delete'];
export type ApiInputZkappUpdate = RI['zkapp']['update'];

// output

export type ApiOutputEventById = RO['event']['byId'];
export type ApiOutputEventCreate = RO['event']['create'];
export type ApiOutputEventDelete = RO['event']['delete'];
export type ApiOutputEventGetUnprocessed = RO['event']['getUnprocessed'];
export type ApiOutputEventMarkProcessed = RO['event']['markProcessed'];

export type ApiOutputMeta = RO['meta'];

export type ApiOutputStorageByKey = RO['storage']['byKey'];
export type ApiOutputStorageByKeyWithData = RO['storage']['byKeyWithData'];
export type ApiOutputStorageByKeyWithEvents = RO['storage']['byKeyWithEvents'];
export type ApiOutputStorageCreate = RO['storage']['create'];
export type ApiOutputStorageDelete = RO['storage']['delete'];
export type ApiOutputStorageGet = RO['storage']['get'];
export type ApiOutputStoragePending = RO['storage']['pending'];
export type ApiOutputStorageSet = RO['storage']['set'];

export type ApiOutputZkappByAddress = RO['zkapp']['byAddress'];
export type ApiOutputZkappCreate = RO['zkapp']['create'];
export type ApiOutputZkappDelete = RO['zkapp']['delete'];
export type ApiOutputZkappUpdate = RO['zkapp']['update'];
