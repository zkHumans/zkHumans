import { basename } from 'path';
import { bigintToBase58 } from '@zkhumans/utils';

// Note: This is a cli script!

// Determine the length, in digits, of a BigInt that corresponds to a base58
// string of a certain length.
function mineBigIntToBase58Length(length = 100) {
  for (let i = 0; i < 100; i++) {
    let s = '1';
    for (let j = 0; j < i; j++) s = s + '1';
    const b = BigInt(s);
    const b58 = bigintToBase58(b);

    console.log(`${s.length} : ${b58.length} | ${s} : ${b58}`);

    if (b58.length >= length) break;
  }
}

const EXE = basename(process.argv[1], '.js');
const length = +process.argv[2];

if (!length) {
  console.error(`USAGE: ${EXE} <length>`);
  console.error(`Example: ${EXE} 55`);
  process.exit(1);
}

mineBigIntToBase58Length(length);
