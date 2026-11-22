import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { testPool, resetDb } from './helpers.js';
import { verifyPassword } from '../src/lib/passwords.js';
import {
  changePassword,
  checkPassword,
  createEmployee,
  findUserById,
  findUserForLogin,
  upsertAdmin,
} from '../src/users/users.js';

const pool = testPool();

beforeEach(() => resetDb(pool));
after(() => pool.end());

const rahim = { name: 'Rahim', gender: 'Male', salary: 15000, password: 'first-pass-1' };

test('employees get IDs E1, E2, … and must change their first password', async () => {
  const a = await createEmployee(pool, rahim);
  const b = await createEmployee(pool, { ...rahim, name: 'Karim' });
  assert.equal(a.username, 'E1');
  assert.equal(b.username, 'E2');
  assert.equal(a.role, 'employee');
  assert.equal(a.name, 'Rahim');
  assert.equal(a.gender, 'Male');
  assert.equal(a.salary, 15000);
  assert.equal(a.mustChangePassword, true);
  assert.equal('passwordHash' in a, false);
});

test('employee IDs stay unique when employees are added at the same moment', async () => {
  const people = await Promise.all(
    Array.from({ length: 5 }, (_, i) => createEmployee(pool, { ...rahim, name: `Person ${i}` })),
  );
  assert.deepEqual(people.map((p) => p.username).sort(), ['E1', 'E2', 'E3', 'E4', 'E5']);
});

test('login lookup ignores case and surrounding spaces, and carries the hash', async () => {
  await createEmployee(pool, rahim);
  const user = await findUserForLogin(pool, '  e1 ');
  assert.equal(user.username, 'E1');
  assert.equal(await verifyPassword('first-pass-1', user.passwordHash), true);
  assert.equal(await findUserForLogin(pool, 'E9'), null);
  assert.equal(await findUserForLogin(pool, ['E1']), null);
});

test('findUserById never exposes the password hash', async () => {
  const created = await createEmployee(pool, rahim);
  const user = await findUserById(pool, created.id);
  assert.equal(user.username, 'E1');
  assert.equal('passwordHash' in user, false);
  assert.equal(await findUserById(pool, 999), null);
});

test('upsertAdmin creates the admin, then resets its password', async () => {
  const first = await upsertAdmin(pool, { username: 'admin', password: 'admin-pass-1' });
  assert.equal(first.created, true);
  assert.equal(first.user.role, 'admin');
  assert.equal(first.user.mustChangePassword, false);

  const second = await upsertAdmin(pool, { username: 'ADMIN', password: 'admin-pass-2' });
  assert.equal(second.created, false);
  assert.equal(second.user.id, first.user.id);
  assert.equal(await checkPassword(pool, first.user.id, 'admin-pass-1'), false);
  assert.equal(await checkPassword(pool, first.user.id, 'admin-pass-2'), true);
});

test('upsertAdmin refuses usernames that look like employee IDs', async () => {
  await createEmployee(pool, rahim);
  await assert.rejects(upsertAdmin(pool, { username: 'e1', password: 'admin-pass-1' }), /employee ID/);
  await assert.rejects(upsertAdmin(pool, { username: 'E7', password: 'admin-pass-1' }), /employee ID/);
  assert.equal((await findUserForLogin(pool, 'E1')).role, 'employee');
});

test('changePassword replaces the password and clears the must-change flag', async () => {
  const user = await createEmployee(pool, rahim);
  await changePassword(pool, user.id, 'second-pass-2');
  assert.equal(await checkPassword(pool, user.id, 'first-pass-1'), false);
  assert.equal(await checkPassword(pool, user.id, 'second-pass-2'), true);
  assert.equal((await findUserById(pool, user.id)).mustChangePassword, false);
  assert.equal(await checkPassword(pool, 999, 'second-pass-2'), false);
});

test('the create-admin script creates, then resets, and refuses a short password', () => {
  const run = (env) => spawnSync(process.execPath, ['scripts/create-admin.js'], {
    env: { ...process.env, ADMIN_NAME: 'Owner', ...env },
    encoding: 'utf8',
  });

  const created = run({ ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'boss-pass-123' });
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /Created admin "boss"/);

  const reset = run({ ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'boss-pass-456' });
  assert.equal(reset.status, 0, reset.stderr);
  assert.match(reset.stdout, /Reset password for admin "boss"/);

  const refused = run({ ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'short' });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /at least 8/);
});

test('the create-admin script stores what it was given', async () => {
  const result = spawnSync(process.execPath, ['scripts/create-admin.js'], {
    env: { ...process.env, ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'boss-pass-123', ADMIN_NAME: 'Owner' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const user = await findUserForLogin(pool, 'boss');
  assert.equal(user.name, 'Owner');
  assert.equal(user.role, 'admin');
  assert.equal(await verifyPassword('boss-pass-123', user.passwordHash), true);
});
