import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { trpc } from '@zkhumans/trpc-client';

export async function loader() {
  const healthcheck = await trpc.health.check.query();
  return json({ healthcheck });
}

export default function TestPage() {
  const { healthcheck } = useLoaderData<typeof loader>();
  return (
    <div>
      <p>{`healthcheck: ${healthcheck}`}</p>
    </div>
  );
}
