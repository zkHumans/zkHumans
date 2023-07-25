export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// https://stackoverflow.com/a/264180
export function strToBool(s: string | undefined): boolean | undefined {
  return s === undefined ? undefined : RegExp(/^\s*(true|1|on)\s*$/i).test(s);
}

// Show first (pre) and last (post) characters of an account or hash.
export const displayAccount = (account: string, pre = 6, post = 4) =>
  `${account.slice(0, pre)}...${account.slice(-post)}`;

export const transactionLink = (hash: string) =>
  `https://berkeley.minaexplorer.com/transaction/${hash}`;

// log a "horizontal rule" (spacer) on the console
export const hr = () =>
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
