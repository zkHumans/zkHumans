/* eslint-disable */
export default {
  displayName: 'contracts-zkhumans',
  preset: '../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.spec.json', useESM: true },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/contracts-zkhumans',

  // from zk-generated contracts
  testEnvironment: 'node',
};
