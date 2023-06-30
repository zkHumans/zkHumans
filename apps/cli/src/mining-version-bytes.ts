import { basename } from 'path';
import { Field, Poseidon } from 'snarkyjs';
import { bigintToUint8Array, toBase58Check } from '@zkhumans/utils';

// Note: This is a cli script!

// Discover which versionBytes value, as a parameter to the base58 checksum,
// will produce a matching string (for example '^B62q') for a number of
// "digits" in length, within the given range.
function mineVersionBytes(
  digits: number,
  match: string,
  start = 1,
  max = 1000
) {
  // create an arbitrary hash
  const hash = Poseidon.hash([Field(1000), Field(1000)]);

  // truncate the hash to the number of digits
  const s1 = hash.toBigInt().toString();
  const s2 = s1.substring(0, digits);

  for (let i = start; i <= max; i++) {
    // convert the number to base58 with a checksum
    const base58 = toBase58Check(bigintToUint8Array(BigInt(s2)), i);
    console.log(`${i} : `, base58);
    if (base58.match(match)) return i;
  }

  return null;
}

const EXE = basename(process.argv[1], '.js');
const digits = +process.argv[2];
const match_ = process.argv[3];
const start = +process.argv[4] ?? undefined;
const max = +process.argv[5] ?? undefined;

if (!max) {
  console.error(`USAGE: ${EXE} <digits> <match> [start] [max]`);
  console.error(`Example: ${EXE} 40 '^zkHM' 1 10000`);
  process.exit(1);
}

mineVersionBytes(digits, match_, start, max);
