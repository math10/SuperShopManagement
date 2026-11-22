import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const quiet = { warn: () => {} };
const base = { DATABASE_URL: 'postgres://db', SESSION_SECRET: 's' };

test('DATABASE_URL is required', () => {
  assert.throws(() => loadConfig({}, quiet), /DATABASE_URL/);
});

test('SESSION_SECRET is required in production', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'postgres://db', NODE_ENV: 'production' }, quiet),
    /SESSION_SECRET/,
  );
});

test('development without SESSION_SECRET gets a random secret and one warning', () => {
  const warnings = [];
  const a = loadConfig({ DATABASE_URL: 'postgres://db' }, { warn: (m) => warnings.push(m) });
  const b = loadConfig({ DATABASE_URL: 'postgres://db' }, quiet);
  assert.ok(a.sessionSecret.length >= 32);
  assert.notEqual(a.sessionSecret, b.sessionSecret);
  assert.equal(warnings.length, 1);
});

test('defaults', () => {
  assert.deepEqual(loadConfig(base, quiet), {
    port: 3000,
    databaseUrl: 'postgres://db',
    sessionSecret: 's',
    cookieSecure: false,
    trustProxy: false,
    isProduction: false,
  });
});

test('reads every setting', () => {
  const env = { ...base, NODE_ENV: 'production', PORT: '8080', COOKIE_SECURE: 'true', TRUST_PROXY: '1' };
  assert.deepEqual(loadConfig(env, quiet), {
    port: 8080,
    databaseUrl: 'postgres://db',
    sessionSecret: 's',
    cookieSecure: true,
    trustProxy: 1,
    isProduction: true,
  });
});

test('TRUST_PROXY accepts true or an address list', () => {
  assert.equal(loadConfig({ ...base, TRUST_PROXY: 'true' }, quiet).trustProxy, true);
  assert.equal(
    loadConfig({ ...base, TRUST_PROXY: 'loopback, 10.0.0.1' }, quiet).trustProxy,
    'loopback, 10.0.0.1',
  );
});

test('an invalid PORT is rejected', () => {
  assert.throws(() => loadConfig({ ...base, PORT: 'abc' }, quiet), /PORT/);
});
