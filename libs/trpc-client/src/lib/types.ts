import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@zkhumans/trpc';

// https://trpc.io/docs/server/infer-types
type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

export type ApiSmtGetInput = RouterInput['smt']['get'];
export type ApiSmtGetOutput = RouterOutput['smt']['get'];
