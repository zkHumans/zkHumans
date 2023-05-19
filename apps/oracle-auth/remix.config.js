/**
 * @type {import('@remix-run/dev').AppConfig}
 */
module.exports = {
  future: {
    unstable_tailwind: true,
    v2_routeConvention: true,
  },
  ignoredRouteFiles: ['**/.*'],
  // appDirectory: "app",
  // assetsBuildDirectory: "public/build",
  // serverBuildPath: "build/index.js",
  // publicPath: "/build/",
  watchPaths: ['../../libs'],
};
