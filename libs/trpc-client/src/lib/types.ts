import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@zkhumans/trpc';

// https://trpc.io/docs/server/infer-types
type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

export type ApiStoreByIdInput = RouterInput['store']['byId'];
export type ApiStoreByIdOutput = RouterOutput['store']['byId'];
