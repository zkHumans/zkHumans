const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,

  // print coverage to console
  // https://github.com/nrwl/nx/issues/1337
  // Note: 202304: causes "Validation Warning" but works
  coverageReporters: ['html', 'text'],

  // From zk-generated contracts
  // 202305: Fixes: snarky-smt | SyntaxError: Unexpected token 'export'
  transformIgnorePatterns: [
    '<rootDir>/node_modules/(?!(tslib|snarkyjs/node_modules/tslib))',
  ],
};
