import type { ActionArgs, LoaderArgs } from '@remix-run/server-runtime';
import { remixHandleTRPCRequest } from '@zkhumans/trpc';

export async function loader(args: LoaderArgs) {
  return remixHandleTRPCRequest(args);
}

export async function action(args: ActionArgs) {
  return remixHandleTRPCRequest(args);
}
