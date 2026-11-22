import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { upsertAdmin } from '../src/users/users.js';
import { addAdmin, addEmployee, buildApp, login, resetDb, sessionCookie, testPool } from './helpers.js';

const pool = testPool();
let app;
let admin;

beforeEach(async () => {
  await resetDb(pool);
  app = buildApp(pool);
  await addAdmin(pool);
  admin = await login(app, 'admin', 'admin-pass-1');
});
after(() => pool.end());

const rahim = { name: 'Rahim Uddin', gender: 'Male', salary: '15000', password: 'temp-pass-1' };

async function userRow(username) {
  const { rows } = await pool.query(
    'SELECT username, name, gender, salary, role, must_change_password FROM users WHERE username = $1',
    [username],
  );
  return rows[0];
}

async function employeeCount() {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM users WHERE role = 'employee'");
  return rows[0].n;
}

test('the admin adds employees, who get IDs E1, E2, …', async () => {
  const form = await admin.get('/employees/new');
  assert.equal(form.status, 200);
  assert.match(form.text, /<option value="Female">Female<\/option>/);

  const first = await admin.post('/employees').type('form').send(rahim);
  assert.equal(first.status, 302);
  assert.equal(first.headers.location, '/employees/new');
  assert.match((await admin.get('/employees/new')).text, /Employee E1 added/);

  await admin.post('/employees').type('form').send({ ...rahim, name: 'Karim' });
  assert.match((await admin.get('/employees/new')).text, /Employee E2 added/);

  assert.deepEqual(await userRow('E1'), {
    username: 'E1', name: 'Rahim Uddin', gender: 'Male', salary: 15000, role: 'employee', must_change_password: true,
  });
});

test('double-clicking Add creates one employee, and both clicks report the same ID', async () => {
  const page = await admin.get('/employees/new');
  const formToken = /name="formToken" value="([^"]+)"/.exec(page.text)?.[1];
  const send = () => admin.post('/employees').type('form').send({ ...rahim, formToken });
  const [first, second] = await Promise.all([send(), send()]);
  assert.deepEqual([first.status, second.status], [302, 302]);
  assert.equal(await employeeCount(), 1);
  assert.match((await admin.get('/employees/new')).text, /Employee E1 added/);
});

test('invalid employee details are explained and nothing is saved', async () => {
  const res = await admin.post('/employees').type('form')
    .send({ name: ' ', gender: 'Robot', salary: '12.5', password: 'short' });
  assert.equal(res.status, 422);
  assert.match(res.text, /Enter the employee&#39;s name/);
  assert.match(res.text, /Choose a gender/);
  assert.match(res.text, /Salary must be a whole number/);
  assert.match(res.text, /at least 8/);
  const missing = await admin.post('/employees');
  assert.equal(missing.status, 422);
  assert.equal(await employeeCount(), 0);
});

test('when something is wrong the typed details are kept, but never the password', async () => {
  const res = await admin.post('/employees').type('form').send({ ...rahim, salary: '-1' });
  assert.equal(res.status, 422);
  assert.match(res.text, /value="Rahim Uddin"/);
  assert.match(res.text, /<option value="Male" selected>/);
  assert.doesNotMatch(res.text, /temp-pass-1/);
});

test('employees cannot add employees', async () => {
  await addEmployee(pool);
  const cashier = await login(app, 'E1', 'cashier-pass-1');
  assert.equal((await cashier.get('/employees/new')).status, 403);
  assert.equal((await cashier.post('/employees').type('form').send(rahim)).status, 403);
  assert.equal(await employeeCount(), 1);
});

test('a new employee must change the temporary password before anything else', async () => {
  await admin.post('/employees').type('form').send(rahim);
  const employee = await login(app, 'E1', 'temp-pass-1');
  for (const path of ['/', '/products', '/billing']) {
    const res = await employee.get(path);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.location, '/account/password', path);
  }
  const page = await employee.get('/account/password');
  assert.equal(page.status, 200);
  assert.match(page.text, /temporary password/);
});

test('changing the password checks the current one, the length and the confirmation', async () => {
  await addEmployee(pool);
  const cashier = await login(app, 'E1', 'cashier-pass-1');
  const change = (fields) => cashier.post('/account/password').type('form').send(fields);

  const wrongCurrent = await change({ currentPassword: 'nope-nope', newPassword: 'brand-new-1', confirmPassword: 'brand-new-1' });
  assert.equal(wrongCurrent.status, 422);
  assert.match(wrongCurrent.text, /Current password is wrong/);
  assert.doesNotMatch(wrongCurrent.text, /nope-nope|brand-new-1/);

  const mismatch = await change({ currentPassword: 'cashier-pass-1', newPassword: 'brand-new-1', confirmPassword: 'brand-new-2' });
  assert.equal(mismatch.status, 422);
  assert.match(mismatch.text, /do not match/);

  const tooShort = await change({ currentPassword: 'cashier-pass-1', newPassword: 'short', confirmPassword: 'short' });
  assert.equal(tooShort.status, 422);
  assert.match(tooShort.text, /at least 8/);

  const same = await change({ currentPassword: 'cashier-pass-1', newPassword: 'cashier-pass-1', confirmPassword: 'cashier-pass-1' });
  assert.equal(same.status, 422);
  assert.match(same.text, /different from the current/);

  const empty = await cashier.post('/account/password');
  assert.equal(empty.status, 422);

  await login(app, 'E1', 'cashier-pass-1'); // still the old password
});

test('after changing the password only the new one works', async () => {
  await admin.post('/employees').type('form').send(rahim);
  const employee = await login(app, 'E1', 'temp-pass-1');
  const res = await employee.post('/account/password').type('form')
    .send({ currentPassword: 'temp-pass-1', newPassword: 'my-own-pass-1', confirmPassword: 'my-own-pass-1' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/');
  const home = await employee.get('/');
  assert.equal(home.status, 200);
  assert.match(home.text, /Password changed/);

  await employee.post('/logout');
  const old = await request(app).post('/login').type('form').send({ username: 'E1', password: 'temp-pass-1' });
  assert.equal(old.status, 401);
  await login(app, 'E1', 'my-own-pass-1');
});

test("changing the password logs out the account's other sessions, but not this one", async () => {
  // e.g. a colleague who saw the password and logged in on another till
  await addEmployee(pool);
  const login1 = await request(app).post('/login').type('form').send({ username: 'E1', password: 'cashier-pass-1' });
  const thisTill = sessionCookie(login1);
  const otherTill = await login(app, 'E1', 'cashier-pass-1');

  const res = await request(app).post('/account/password').set('Cookie', thisTill).type('form')
    .send({ currentPassword: 'cashier-pass-1', newPassword: 'fresh-pass-2', confirmPassword: 'fresh-pass-2' });
  assert.equal(res.status, 302);
  const renewed = sessionCookie(res);
  assert.ok(renewed && renewed !== thisTill, 'the changing session gets a new session ID');

  assert.equal((await request(app).get('/').set('Cookie', renewed)).status, 200);
  assert.equal((await request(app).get('/').set('Cookie', thisTill)).status, 302, 'the old session ID is dead');
  const other = await otherTill.get('/');
  assert.equal(other.status, 302);
  assert.equal(other.headers.location, '/login');
});

test('resetting the admin password with create-admin logs out open admin sessions', async () => {
  await upsertAdmin(pool, { username: 'admin', password: 'admin-pass-9' });
  const res = await admin.get('/');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/login');
});

test('the admin can change their own password', async () => {
  const res = await admin.post('/account/password').type('form')
    .send({ currentPassword: 'admin-pass-1', newPassword: 'admin-pass-2', confirmPassword: 'admin-pass-2' });
  assert.equal(res.status, 302);
  await login(app, 'admin', 'admin-pass-2');
});

test('anonymous visitors are sent to log in', async () => {
  const res = await request(app).post('/account/password').type('form')
    .send({ currentPassword: 'x', newPassword: 'brand-new-1', confirmPassword: 'brand-new-1' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/login');
});
