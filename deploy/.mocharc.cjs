process.env.NODE_ENV = 'test';
module.exports = {
  loader: 'ts-node/esm',
  extensions: ['ts'],
  spec: ['**/*.test.*'],
  exit: true,
  ignore: ['node_modules/**'],
  slow: 5000,
  timeout: 600000,
  retries: 0,
  parallel: true,
  'no-warnings': true,
  'use-openssl-ca': true,
};
