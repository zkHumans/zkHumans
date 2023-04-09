// https://stackoverflow.com/questions/72661999/how-do-i-use-in-memory-cache-in-remix-run-dev-mode/73759389#73759389
import NodeCache from 'node-cache';

let cache: NodeCache;

declare global {
  var __cache: NodeCache | undefined;
}

if (process.env.NODE_ENV === 'production') {
  cache = new NodeCache();
} else {
  if (!global.__cache) {
    global.__cache = new NodeCache();
  }
  cache = global.__cache;
}

export { cache };
