// https://stackoverflow.com/a/264180
export function strToBool(s: string | undefined): boolean | undefined {
  return s === undefined ? undefined : RegExp(/^\s*(true|1|on)\s*$/i).test(s);
}
