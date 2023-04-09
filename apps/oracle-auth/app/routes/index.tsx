import type { LoaderArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';

import { FormBioAuth } from '~/ui/FormBioAuth';
import { isAuthenticated } from '~/auth.server';

export async function loader({ request }: LoaderArgs) {
  const isAuthed = await isAuthenticated(request);
  return { isAuthed };
}

export default function Index() {
  const { isAuthed } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col items-center space-y-8 ">
      <div className="flex flex-col items-center">
        <h1 className="text-2xl font-bold">Mina x Humanode</h1>
        <h1 className="text-1xl font-bold">Zero-Knowledge Oracle</h1>
      </div>
      <FormBioAuth />
      {isAuthed && <Link to="/logout">Logout</Link>}
    </div>
  );
}
