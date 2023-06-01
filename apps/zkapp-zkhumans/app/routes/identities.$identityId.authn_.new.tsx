// import { useAppContext } from '../root';
import { LoaderArgs, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader = async ({ params }: LoaderArgs) => {
  return json({ params });
};

export default function TODO() {
  const { params } = useLoaderData<typeof loader>();
  // const appContext = useAppContext();

  return (
    <div className="my-2 border p-2">
      <h1>TODO: authn/new</h1>
      <p>{JSON.stringify(params, null, 2)}</p>
    </div>
  );
}
