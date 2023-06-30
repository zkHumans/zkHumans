import { sha256 } from 'js-sha256';

export {
  bigintToBase58,
  bigintFromBase58,
  bigintToUint8Array,
  bigintFromUint8Array,
  fromBase58,
  fromBase58Check,
  toBase58,
  toBase58Check,
};

function bigintToUint8Array(x: bigint) {
  const encoder = new TextEncoder();
  return encoder.encode(x.toString());
}

function bigintFromUint8Array(x: Uint8Array | number[]) {
  const decoder = new TextDecoder('utf-8');
  const decoded = decoder.decode(Uint8Array.from(x));
  return BigInt(decoded);
}

function bigintToBase58(x: bigint) {
  return toBase58(bigintToUint8Array(x));
}

function bigintFromBase58(base58: string) {
  const x = fromBase58(base58);
  return bigintFromUint8Array(Uint8Array.from(x));
}

////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////
// https://github.com/o1-labs/snarkyjs/blob/main/src/lib/base58.ts
////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

const alphabet =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.split('');
const inverseAlphabet: Record<string, number> = {};
alphabet.forEach((c, i) => {
  inverseAlphabet[c] = i;
});

function toBase58Check(input: number[] | Uint8Array, versionByte: number) {
  const withVersion = [versionByte, ...input];
  const checksum = computeChecksum(withVersion);
  const withChecksum = withVersion.concat(checksum);
  return toBase58(withChecksum);
}

function fromBase58Check(base58: string, versionByte: number) {
  // throws on invalid character
  const bytes = fromBase58(base58);
  // check checksum
  const checksum = bytes.slice(-4);
  const originalBytes = bytes.slice(0, -4);
  const actualChecksum = computeChecksum(originalBytes);
  if (!arrayEqual(checksum, actualChecksum))
    throw Error('fromBase58Check: invalid checksum');
  // check version byte
  if (originalBytes[0] !== versionByte)
    throw Error(
      `fromBase58Check: input version byte ${versionByte} does not match encoded version byte ${originalBytes[0]}`
    );
  // return result
  return originalBytes.slice(1);
}

function toBase58(bytes: number[] | Uint8Array) {
  // count the leading zeroes. these get turned into leading zeroes in the output
  let z = 0;
  while (bytes[z] === 0) z++;
  // for some reason, this is big-endian, so we need to reverse
  const digits = [...bytes].map(BigInt).reverse();
  // change base and reverse
  let base58Digits = changeBase(digits, 256n, 58n).reverse();
  // add leading zeroes, map into alphabet
  base58Digits = Array(z).fill(0n).concat(base58Digits);
  return base58Digits.map((x) => alphabet[Number(x)]).join('');
}

function fromBase58(base58: string) {
  const base58Digits = [...base58].map((c) => {
    const digit = inverseAlphabet[c];
    if (digit === undefined) throw Error('fromBase58: invalid character');
    return BigInt(digit);
  });
  let z = 0;
  while (base58Digits[z] === 0n) z++;
  let digits = changeBase(base58Digits.reverse(), 58n, 256n).reverse();
  digits = Array(z).fill(0n).concat(digits);
  return digits.map(Number);
}

function computeChecksum(input: number[] | Uint8Array) {
  const hash1 = sha256.create();
  hash1.update(input);
  const hash2 = sha256.create();
  hash2.update(hash1.array());
  return hash2.array().slice(0, 4);
}

function arrayEqual(a: unknown[], b: unknown[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////
// https://github.com/o1-labs/snarkyjs-bindings/blob/main/crypto/bigint-helpers.ts
////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

export { changeBase, bytesToBigInt, bigIntToBytes };

function bytesToBigInt(bytes: Uint8Array | number[]) {
  let x = 0n;
  let bitPosition = 0n;
  for (const byte of bytes) {
    x += BigInt(byte) << bitPosition;
    bitPosition += 8n;
  }
  return x;
}

/**
 * Transforms bigint to little-endian array of bytes (numbers between 0 and 255) of a given length.
 * Throws an error if the bigint doesn't fit in the given number of bytes.
 */
function bigIntToBytes(x: bigint, length: number) {
  if (x < 0n) {
    throw Error(`bigIntToBytes: negative numbers are not supported, got ${x}`);
  }
  const bytes: number[] = Array(length);
  for (let i = 0; i < length; i++, x >>= 8n) {
    bytes[i] = Number(x & 0xffn);
  }
  if (x > 0n) {
    throw Error(`bigIntToBytes: input does not fit in ${length} bytes`);
  }
  return bytes;
}

function changeBase(digits: bigint[], base: bigint, newBase: bigint) {
  // 1. accumulate digits into one gigantic bigint `x`
  const x = fromBase(digits, base);
  // 2. compute new digits from `x`
  const newDigits = toBase(x, newBase);
  return newDigits;
}

/**
 * the algorithm for toBase / fromBase is more complicated than it naively has to be,
 * but that is for performance reasons.
 *
 * we'll explain it for `fromBase`. this function is about taking an array of digits
 * `[x0, ..., xn]`
 * and returning the integer (bigint) that has those digits in the given `base`:
 * ```
 * let x = x0 + x1*base + x2*base**2 + ... + xn*base**n
 * ```
 *
 * naively, we could just accumulate digits from left to right:
 * ```
 * let x = 0n;
 * let p = 1n;
 * for (let i=0; i<n; i++) {
 *   x += X[i] * p;
 *   p *= base;
 * }
 * ```
 *
 * in the ith step, `p = base**i` which is multiplied with `xi` and added to the sum.
 * however, note that this algorithm is `O(n^2)`: let `l = log2(base)`. the base power `p` is a bigint of bit length `i*l`,
 * which is multiplied by a "small" number `xi` (length l), which takes `O(i)` time in every step.
 * since this is done for `i = 0,...,n`, we end up with an `O(n^2)` algorithm.
 *
 * HOWEVER, it turns out that there are fast multiplication algorithms, and JS bigints have them built in!
 * the Schönhage-Strassen algorithm (implemented in the V8 engine, see https://github.com/v8/v8/blob/main/src/bigint/mul-fft.cc)
 * can multiply two n-bit numbers in time `O(n log(n) loglog(n))`, when n is large.
 *
 * to take advantage of asymptotically fast multiplication, we need to re-structure our algorithm such that it multiplies roughly equal-sized
 * numbers with each other (there is no asymptotic boost for multiplying a small with a large number). so, what we do is to go from the
 * original digit array to arrays of successively larger digits:
 * ```
 * step 0:                  step 1:                              step 2:
 * [x0, x1, x2, x3, ...] -> [x0 + base*x1, x2 + base*x3, ...] -> [x0 + base*x1 + base^2*(x2 + base*x3), ...] -> ...
 * ```
 *
 * ...until after a log(n) number of steps we end up with a single "digit" which is equal to the entire sum.
 *
 * in the ith step, we multiply `n/2^i` pairs of numbers of bit length `2^i*l`. each of these multiplications takes
 * time `O(2^i log(2^i) loglog(2^i))`. if we bound that with `O(2^i log(n) loglog(n))`, we get a runtime bounded by
 * ```
 * O(n/2^i * 2^i log(n) loglog(n)) = O(n log(n) loglog(n))
 * ```
 * in each step. Since we have `log(n)` steps, the result is `O(n log(n)^2 loglog(n))`.
 *
 * empirically, this method is a huge improvement over the naive `O(n^2)` algorithm and scales much better with n (the number of digits).
 *
 * similar conclusions hold for `toBase`.
 */
function fromBase(digits: bigint[], base: bigint) {
  if (base <= 0n) throw Error('fromBase: base must be positive');
  // compute powers base, base^2, base^4, ..., base^(2^k)
  // with largest k s.t. n = 2^k < digits.length
  const basePowers = [];
  for (let power = base, n = 1; n < digits.length; power **= 2n, n *= 2) {
    basePowers.push(power);
  }
  const k = basePowers.length;
  // pad digits array with zeros s.t. digits.length === 2^k
  digits = digits.concat(Array(2 ** k - digits.length).fill(0n));
  // accumulate [x0, x1, x2, x3, ...] -> [x0 + base*x1, x2 + base*x3, ...] -> [x0 + base*x1 + base^2*(x2 + base*x3), ...] -> ...
  // until we end up with a single element
  for (let i = 0; i < k; i++) {
    const newDigits = Array(digits.length >> 1);
    const basePower = basePowers[i];
    for (let j = 0; j < newDigits.length; j++) {
      newDigits[j] = digits[2 * j] + basePower * digits[2 * j + 1];
    }
    digits = newDigits;
  }
  console.assert(digits.length === 1);
  const [digit] = digits;
  return digit;
}

function toBase(x: bigint, base: bigint) {
  if (base <= 0n) throw Error('toBase: base must be positive');
  // compute powers base, base^2, base^4, ..., base^(2^k)
  // with largest k s.t. base^(2^k) < x
  const basePowers = [];
  for (let power = base; power < x; power **= 2n) {
    basePowers.push(power);
  }
  let digits = [x]; // single digit w.r.t base^(2^(k+1))
  // successively split digits w.r.t. base^(2^j) into digits w.r.t. base^(2^(j-1))
  // until we arrive at digits w.r.t. base
  const k = basePowers.length;
  for (let i = 0; i < k; i++) {
    const newDigits = Array(2 * digits.length);
    const basePower = basePowers[k - 1 - i];
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j];
      const high = x / basePower;
      newDigits[2 * j + 1] = high;
      newDigits[2 * j] = x - high * basePower;
    }
    digits = newDigits;
  }
  // pop "leading" zero digits
  while (digits[digits.length - 1] === 0n) {
    digits.pop();
  }
  return digits;
}
