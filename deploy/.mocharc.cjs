process.env.NODE_ENV = 'test';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
module.exports = {
  loader: 'ts-node/esm',
  extensions: ['ts'],
  spec: ['**/*.test.*'],
  exit: true,
  ignore: ['node_modules/**'],
  slow: 5000,
  timeout: 600000,
  retries: 0,
  parallel: false,
  'no-warnings': true,
  'use-openssl-ca': false,
};
