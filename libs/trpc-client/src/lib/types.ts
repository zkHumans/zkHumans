import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@zkhumans/trpc';

// https://trpc.io/docs/server/infer-types
type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

// input

export type ApiInputEventById = RouterInput['event']['byId'];
export type ApiInputEventCreate = RouterInput['event']['create'];
export type ApiInputEventDelete = RouterInput['event']['delete'];
export type ApiInputEventGetUnprocessed =
  RouterInput['event']['getUnprocessed'];
export type ApiInputEventMarkProcessed = RouterInput['event']['markProcessed'];

export type ApiInputMeta = RouterInput['meta'];

export type ApiInputStorageByKey = RouterInput['storage']['byKey'];
export type ApiInputStorageByKeyWithData =
  RouterInput['storage']['byKeyWithData'];
export type ApiInputStorageCreate = RouterInput['storage']['create'];
export type ApiInputStorageDelete = RouterInput['storage']['delete'];
export type ApiInputStorageGet = RouterInput['storage']['get'];
export type ApiInputStoragePending = RouterInput['storage']['pending'];
export type ApiInputStorageSet = RouterInput['storage']['set'];

export type ApiInputZkappByAddress = RouterInput['zkapp']['byAddress'];
export type ApiInputZkappCreate = RouterInput['zkapp']['create'];
export type ApiInputZkappDelete = RouterInput['zkapp']['delete'];
export type ApiInputZkappUpdate = RouterInput['zkapp']['update'];

// output

export type ApiOutputEventById = RouterOutput['event']['byId'];
export type ApiOutputEventCreate = RouterOutput['event']['create'];
export type ApiOutputEventDelete = RouterOutput['event']['delete'];
export type ApiOutputEventGetUnprocessed =
  RouterOutput['event']['getUnprocessed'];
export type ApiOutputEventMarkProcessed =
  RouterOutput['event']['markProcessed'];

export type ApiOutputMeta = RouterOutput['meta'];

export type ApiOutputStorageByKey = RouterOutput['storage']['byKey'];
export type ApiOutputStorageByKeyWithData =
  RouterOutput['storage']['byKeyWithData'];
export type ApiOutputStorageCreate = RouterOutput['storage']['create'];
export type ApiOutputStorageDelete = RouterOutput['storage']['delete'];
export type ApiOutputStorageGet = RouterOutput['storage']['get'];
export type ApiOutputStoragePending = RouterOutput['storage']['pending'];
export type ApiOutputStorageSet = RouterOutput['storage']['set'];

export type ApiOutputZkappByAddress = RouterOutput['zkapp']['byAddress'];
export type ApiOutputZkappCreate = RouterOutput['zkapp']['create'];
export type ApiOutputZkappDelete = RouterOutput['zkapp']['delete'];
export type ApiOutputZkappUpdate = RouterOutput['zkapp']['update'];
