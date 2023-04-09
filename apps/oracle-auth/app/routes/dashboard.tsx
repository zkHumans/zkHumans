import type { LoaderArgs } from '@remix-run/node';
// import { useLoaderData } from "@remix-run/react";

import { requireAuthenticatedUser } from '~/auth.server';
import { ButtonLink } from '~/ui/ButtonLink';

export async function loader({ request }: LoaderArgs) {
  const auth = await requireAuthenticatedUser(request);
  return { auth };
}

export default function Dashboard() {
  // const { auth } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col items-center space-y-8 ">
      <div className="flex flex-col items-center">
        <h1 className="text-2xl font-bold">Mina x Humanode</h1>
        <h1 className="text-1xl font-bold">Zero-Knowledge Oracle</h1>
      </div>
      <br />
      <br />
      <ButtonLink to="/logout">Logout</ButtonLink>
      {/*
      <h3>humanode identifer = {auth.id}</h3>
      <pre>{JSON.stringify(auth, null, 2)}</pre>
      */}
    </div>
  );
}
