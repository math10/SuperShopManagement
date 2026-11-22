import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { addAdmin, addEmployee, addProduct, buildApp, categoryId, login, resetDb, testPool } from './helpers.js';

const pool = testPool();
let app;

beforeEach(async () => {
  await resetDb(pool);
  app = buildApp(pool);
});
after(() => pool.end());

// PostgreSQL text can't hold a NUL byte (error 22021), so one in any field
// used to become a 500 and an error-log entry, even from the anonymous login form.
test('a NUL byte in any form field or query is refused with a 400, never a 500', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  await addAdmin(pool);
  await addEmployee(pool);
  const rice = await addProduct(pool, { name: 'Rice' });
  const admin = await login(app, 'admin', 'admin-pass-1');
  const cashier = await login(app, 'E1', 'cashier-pass-1');

  const responses = {
    'anonymous login': await request(app).post('/login').type('form').send('username=adm%00in&password=x'),
    'product name': await admin.post('/products').type('form')
      .send(`categoryId=${await categoryId(pool, 'Food')}&name=Ri%00ce&costPrice=1&sellingPrice=2&stock=3`),
    'employee name': await admin.post('/employees').type('form')
      .send('name=Ra%00him&gender=Male&salary=100&password=temp-pass-1'),
    'checkout token': await cashier.post('/billing/checkout').type('form').send('cartToken=abc%00def'),
    'query string': await cashier.get('/products?category=1%00'),
  };
  for (const [what, res] of Object.entries(responses)) {
    assert.equal(res.status, 400, what);
  }
  assert.equal(logged.mock.callCount(), 0, 'nothing should reach the error log');
  const { rowCount } = await pool.query("SELECT 1 FROM products WHERE name <> 'Rice'");
  assert.equal(rowCount, 0);
  assert.equal((await pool.query('SELECT stock FROM products WHERE id = $1', [rice.id])).rows[0].stock, 10);
});
