import Head from 'next/head';
import Image from 'next/image';
// X: import styles from '../styles/Home.module.css';
import { useEffect, useState } from 'react';
import type { Add } from '../../../../libs/contracts-example/src/';
import { Mina, isReady, PublicKey, fetchAccount } from 'snarkyjs';

export default function Home() {
  useEffect(() => {
    (async () => {
      await isReady;
      const { Add } = await import(
        '../../../../libs/contracts-example/build/src/'
      );

      // Update this to use the address (public key) for your zkApp account
      // To try it out, you can try this address for an example "Add" smart contract that we've deployed to
      // Berkeley Testnet B62qisn669bZqsh8yMWkNyCA7RvjrL6gfdr3TQxymDHNhTc97xE5kNV
      const zkAppAddress =
        'B62qisn669bZqsh8yMWkNyCA7RvjrL6gfdr3TQxymDHNhTc97xE5kNV';

      const zkApp = new Add(PublicKey.fromBase58(zkAppAddress));
    })();
  }, []);

  return (
    <div>
      <Head>
        <title>Create Next App</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1>
          Welcome to <a href="https://nextjs.org">Next.js!</a>
        </h1>
      </main>
    </div>
  );
}