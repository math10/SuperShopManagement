import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createPool } from '../src/db.js';
import { addAdmin, addEmployee, buildApp, login, resetDb, sessionCookie, testPool } from './helpers.js';

const pool = testPool();
let app;

beforeEach(async () => {
  await resetDb(pool);
  app = buildApp(pool);
});
after(() => pool.end());

const cashier = { username: 'E1', password: 'cashier-pass-1' };

test('anonymous visitors are sent to the login page', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/login');
});

test('the login page has an ID and a password field', async () => {
  const res = await request(app).get('/login');
  assert.equal(res.status, 200);
  assert.match(res.text, /name="username"/);
  assert.match(res.text, /type="password" name="password"/);
});

test('the admin sees the admin menu', async () => {
  await addAdmin(pool);
  const agent = await login(app, 'admin', 'admin-pass-1');
  const res = await agent.get('/');
  assert.equal(res.status, 200);
  for (const label of ['Product Management', 'Profit Calculation', 'Add Employee', 'Change Password']) {
    assert.match(res.text, new RegExp(label));
  }
  assert.doesNotMatch(res.text, /Billing/);
});

test('an employee sees the employee menu', async () => {
  await addEmployee(pool);
  const agent = await login(app, cashier.username, cashier.password);
  const res = await agent.get('/');
  assert.equal(res.status, 200);
  for (const label of ['Get Product Information', 'Billing', 'Change Password']) {
    assert.match(res.text, new RegExp(label));
  }
  assert.doesNotMatch(res.text, /Add Employee|Profit Calculation/);
});

test('the user ID is matched ignoring case and surrounding spaces', async () => {
  await addEmployee(pool);
  await login(app, ' e1 ', cashier.password);
});

test('a wrong password is refused with a generic message and the ID is kept', async () => {
  await addEmployee(pool);
  const res = await request(app).post('/login').type('form').send({ username: 'E1', password: 'wrong-pass' });
  assert.equal(res.status, 401);
  assert.match(res.text, /Wrong ID or password/);
  assert.match(res.text, /value="E1"/);
});

test('an unknown ID gets the same message as a wrong password', async () => {
  const res = await request(app).post('/login').type('form').send({ username: 'E9', password: 'whatever-1' });
  assert.equal(res.status, 401);
  assert.match(res.text, /Wrong ID or password/);
});

test('SQL injection in the ID is just a wrong ID', async () => {
  await addEmployee(pool);
  for (const username of ["x' OR '1'='1", "E1' --", "' UNION SELECT 'a' FROM users --"]) {
    const res = await request(app).post('/login').type('form').send({ username, password: 'a' });
    assert.equal(res.status, 401, username);
  }
});

test('repeated or missing form fields do not crash the login', async () => {
  await addEmployee(pool);
  const repeated = await request(app).post('/login').type('form')
    .send('username=E1&username=E2&password=cashier-pass-1&password=x');
  assert.equal(repeated.status, 401);
  const empty = await request(app).post('/login');
  assert.equal(empty.status, 401);
});

test('logging out ends the session', async () => {
  await addEmployee(pool);
  const agent = await login(app, cashier.username, cashier.password);
  const out = await agent.post('/logout');
  assert.equal(out.status, 302);
  assert.equal(out.headers.location, '/login');
  const afterwards = await agent.get('/');
  assert.equal(afterwards.status, 302);
  assert.equal(afterwards.headers.location, '/login');
});

test('logging in replaces the session ID and returns to the page that was asked for', async () => {
  await addEmployee(pool);
  const first = await request(app).get('/?from=bookmark');
  const before = sessionCookie(first);
  assert.ok(before, 'expected a session cookie for the anonymous visit');

  const res = await request(app).post('/login').set('Cookie', before).type('form').send(cashier);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/?from=bookmark');
  const afterLogin = sessionCookie(res);
  assert.ok(afterLogin);
  assert.notEqual(afterLogin, before);

  const stale = await request(app).get('/').set('Cookie', before);
  assert.equal(stale.status, 302, 'the pre-login session ID must not be logged in');
});

test('cross-site form posts are blocked', async () => {
  await addEmployee(pool);
  const crossSite = await request(app).post('/login').set('Sec-Fetch-Site', 'cross-site').type('form').send(cashier);
  assert.equal(crossSite.status, 403);
  const foreignOrigin = await request(app).post('/login').set('Origin', 'http://evil.example').type('form').send(cashier);
  assert.equal(foreignOrigin.status, 403);
  const sameOrigin = await request(app).post('/login').set('Sec-Fetch-Site', 'same-origin').type('form').send(cashier);
  assert.equal(sameOrigin.status, 302);
});

test('pages let browsers send their origin with form posts', async () => {
  // On plain HTTP to a LAN address browsers send no Sec-Fetch-Site, and under
  // Referrer-Policy: no-referrer they send "Origin: null", which the guard must block.
  const res = await request(app).get('/login');
  assert.equal(res.headers['referrer-policy'], 'same-origin');
});

test('a post whose Origin matches the Host passes without Sec-Fetch-Site', async () => {
  await addEmployee(pool);
  const res = await request(app).post('/login')
    .set('Host', 'shop-server:3000').set('Origin', 'http://shop-server:3000')
    .type('form').send(cashier);
  assert.equal(res.status, 302);
});

test('a post with Origin: null and no Sec-Fetch-Site is blocked', async () => {
  await addEmployee(pool);
  const res = await request(app).post('/login').set('Origin', 'null').type('form').send(cashier);
  assert.equal(res.status, 403);
});

test('repeated failed logins are rate limited', async () => {
  await addEmployee(pool);
  const limited = buildApp(pool, { loginRateLimit: { windowMs: 60_000, limit: 2 } });
  const attempt = (password) => request(limited).post('/login').type('form').send({ username: 'E1', password });
  assert.equal((await attempt('wrong-pass-1')).status, 401);
  assert.equal((await attempt('wrong-pass-2')).status, 401);
  const third = await attempt(cashier.password);
  assert.equal(third.status, 429);
  assert.match(third.text, /Too many failed attempts/);
});

test('successful logins do not count toward the rate limit', async () => {
  await addEmployee(pool);
  const limited = buildApp(pool, { loginRateLimit: { windowMs: 60_000, limit: 2 } });
  for (let i = 0; i < 4; i += 1) {
    await login(limited, cashier.username, cashier.password);
  }
});

test('responses carry security headers', async () => {
  const res = await request(app).get('/login');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('over plain HTTP the page does not tell browsers to switch to HTTPS', async () => {
  // A shop LAN often has no HTTPS; upgrade-insecure-requests would break CSS and forms there.
  const res = await request(app).get('/login');
  assert.doesNotMatch(res.headers['content-security-policy'], /upgrade-insecure-requests/);
  const secureApp = buildApp(pool, { cookieSecure: true });
  const secureRes = await request(secureApp).get('/login');
  assert.match(secureRes.headers['content-security-policy'], /upgrade-insecure-requests/);
});

test('the session cookie is HttpOnly and SameSite=Lax', async () => {
  await addEmployee(pool);
  const res = await request(app).post('/login').type('form').send(cashier);
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('ssm.sid='));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /Secure/);
});

test('with COOKIE_SECURE behind an HTTPS proxy the cookie is Secure', async () => {
  await addEmployee(pool);
  const secureApp = buildApp(pool, { cookieSecure: true, trustProxy: true });
  const res = await request(secureApp).post('/login').set('X-Forwarded-Proto', 'https').type('form').send(cashier);
  assert.equal(res.status, 302);
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('ssm.sid='));
  assert.match(cookie, /Secure/);
});

test('with COOKIE_SECURE but a request that is not HTTPS, login explains why it cannot work', async () => {
  // Without this, the browser drops the Secure cookie and the user silently lands back on /login
  // (e.g. a proxy that doesn't send X-Forwarded-Proto).
  await addEmployee(pool);
  const secureApp = buildApp(pool, { cookieSecure: true });
  const page = await request(secureApp).get('/login');
  assert.match(page.text, /only over HTTPS/);
  const res = await request(secureApp).post('/login').type('form').send(cashier);
  assert.equal(res.status, 400);
  assert.match(res.text, /only over HTTPS/);
  assert.match(res.text, /X-Forwarded-Proto/);
});

test('an account removed mid-session is logged out', async () => {
  const employee = await addEmployee(pool);
  const agent = await login(app, employee.username, cashier.password);
  await pool.query('DELETE FROM users WHERE id = $1', [employee.id]);
  const res = await agent.get('/');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/login');
});

test('unknown pages get a 404 page', async () => {
  const res = await request(app).get('/nope');
  assert.equal(res.status, 404);
  assert.match(res.text, /Page not found/);
});

test('an oversized form gets a 413 page instead of a server error', async () => {
  const res = await request(app).post('/login').type('form').send(`username=${'x'.repeat(200_000)}&password=x`);
  assert.equal(res.status, 413);
  assert.match(res.text, /Too much data/);
});

test('a database outage shows an error page and is logged, without crashing', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const deadPool = createPool('postgres://postgres:postgres@127.0.0.1:1/nowhere', { onError: () => {} });
  try {
    const broken = buildApp(deadPool);
    const res = await request(broken).post('/login').type('form').send(cashier);
    assert.equal(res.status, 500);
    assert.match(res.text, /Something went wrong/);
    assert.equal(logged.mock.callCount(), 1);
  } finally {
    await deadPool.end();
  }
});

test('the stylesheet is served', async () => {
  const res = await request(app).get('/styles.css');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/css/);
});
