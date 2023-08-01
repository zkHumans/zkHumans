/**
 * @type {import('@remix-run/dev').AppConfig}
 */
module.exports = {
  future: {
    v2_errorBoundary: true,
    v2_headers: true,
    v2_meta: true,
    v2_normalizeFormMethod: true,
    v2_routeConvention: true,
  },
  ignoredRouteFiles: ['**/.*'],
  // appDirectory: "app",
  // assetsBuildDirectory: "public/build",
  // serverBuildPath: "build/index.js",
  // publicPath: "/build/",
  postcss: true,
  serverModuleFormat: 'cjs', // TODO esm
  tailwind: true,
  watchPaths: ['../../libs/*/src'],

  // https://remix.run/docs/en/1.15.0/pages/v2

  // // arc
  // publicPath: '/_static/build/',
  // serverBuildPath: 'server/index.js',
  // serverMainFields: ['main', 'module'],
  // serverModuleFormat: 'cjs',
  // serverPlatform: 'node',
  // serverMinify: false,

  // // cloudflare-pages
  // publicPath: '/build/',
  // serverBuildPath: 'functions/[[path]].js',
  // serverConditions: ['worker'],
  // serverMainFields: ['browser', 'module', 'main'],
  // serverModuleFormat: 'esm',
  // serverPlatform: 'neutral',
  // serverDependenciesToBundle: 'all',
  // serverMinify: true,

  // // cloudflare-workers
  // publicPath: '/build/',
  // serverBuildPath: 'build/index.js',
  // serverConditions: ['worker'],
  // serverMainFields: ['browser', 'module', 'main'],
  // serverModuleFormat: 'esm',
  // serverPlatform: 'neutral',
  // serverDependenciesToBundle: 'all',
  // serverMinify: true,

  // // deno
  // publicPath: '/build/',
  // serverBuildPath: 'build/index.js',
  // serverConditions: ['deno', 'worker'],
  // serverMainFields: ['module', 'main'],
  // serverModuleFormat: 'esm',
  // serverPlatform: 'neutral',
  // serverDependenciesToBundle: 'all',
  // serverMinify: false,

  // // netlify
  // publicPath: '/build/',
  // serverBuildPath: '.netlify/functions-internal/server.js',
  // serverConditions: 'deno, worker',
  // serverMainFields: ['main', 'module'],
  // serverModuleFormat: 'cjs',
  // serverPlatform: 'node',
  // serverMinify: false,

  // // node-cjs
  // publicPath: '/build/',
  // serverBuildPath: 'build/index.js',
  // serverMainFields: ['main', 'module'],
  // serverModuleFormat: 'cjs',
  // serverPlatform: 'node',
  // serverMinify: false,

  // // vercel
  // publicPath: '/build/',
  // serverBuildPath: 'api/index.js',
  // serverMainFields: ['main', 'module'],
  // serverModuleFormat: 'cjs',
  // serverPlatform: 'node',
  // serverMinify: false,
};
