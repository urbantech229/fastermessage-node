const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FasterMessage, ApiError, Webhook, VERSION } = require('../dist/cjs/index.js');
const { version } = require('../package.json');

test('le paquet se charge aussi en CommonJS', () => {
  assert.equal(new FasterMessage({ username: 'a', password: 'b', apiKey: 'fm_test_x' }).testMode, true);
  assert.equal(typeof ApiError, 'function');
  assert.equal(typeof Webhook.isGenuine, 'function');
});

test('la version annoncée est celle du paquet', () => {
  assert.equal(VERSION, version);
});
