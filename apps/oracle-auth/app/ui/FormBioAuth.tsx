import { Form } from '@remix-run/react';

export const FormBioAuth = () => {
  return (
    <Form action="/auth/humanode" method="post">
      <button className="rounded border border-gray-700 bg-gray-200 px-2 py-2 font-medium text-black hover:bg-gray-300">
        Crypto-Biometric Authentication
        <img src="/humanode-350x250.png" alt="" />
      </button>
    </Form>
  );
};
