import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, checkNewPassword } from '../src/lib/passwords.js';

test('a hashed password verifies, and a wrong one does not', async () => {
  const stored = await hashPassword('correct horse');
  assert.equal(await verifyPassword('correct horse', stored), true);
  assert.equal(await verifyPassword('correct hors', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('hashes are salted and never contain the password', async () => {
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');
  assert.notEqual(a, b);
  assert.equal(a.includes('same-password'), false);
  assert.match(a, /^scrypt\$/);
});

test('malformed stored hashes never verify', async () => {
  for (const stored of ['', 'garbage', 'scrypt$1$2$3$x$y', 'scrypt$32768$8$1$$', 'bcrypt$a$b$c$d$e', null, undefined]) {
    assert.equal(await verifyPassword('anything', stored), false, String(stored));
  }
});

test('checkNewPassword allows 8 to 200 characters', () => {
  assert.equal(checkNewPassword('12345678'), null);
  assert.equal(checkNewPassword('x'.repeat(200)), null);
  assert.match(checkNewPassword('short'), /at least 8/);
  assert.match(checkNewPassword(''), /at least 8/);
  assert.match(checkNewPassword(undefined), /at least 8/);
  assert.match(checkNewPassword(['12345678', '12345678']), /at least 8/);
  assert.match(checkNewPassword('x'.repeat(201)), /at most 200/);
});
