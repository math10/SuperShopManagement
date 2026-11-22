// Shared helpers for the test suite. Tests run against a real PostgreSQL
// database whose URL scripts/test.js puts in DATABASE_URL.
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { createSessionStore } from '../src/sessionStore.js';
import { createEmployee, upsertAdmin } from '../src/users/users.js';

export function testPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Run the tests with `npm test`.');
  }
  return createPool(process.env.DATABASE_URL);
}

// Empties every table the app writes to (categories are seed data and stay).
export async function resetDb(pool) {
  await pool.query('TRUNCATE sale_items, sales, products, users, session, form_submissions RESTART IDENTITY CASCADE');
  await pool.query('ALTER SEQUENCE employee_number_seq RESTART WITH 1');
}

export function buildApp(pool, overrides = {}) {
  return createApp({
    pool,
    sessionStore: createSessionStore(pool, { prune: false }),
    sessionSecret: 'test-secret',
    loginRateLimit: { windowMs: 60_000, limit: 1000 },
    ...overrides,
  });
}

export async function addAdmin(pool, { username = 'admin', password = 'admin-pass-1' } = {}) {
  const { user } = await upsertAdmin(pool, { username, password });
  return user;
}

export async function addEmployee(pool, {
  name = 'Test Cashier',
  password = 'cashier-pass-1',
  mustChangePassword = false,
} = {}) {
  return createEmployee(pool, { name, gender: 'Other', salary: 10000, password, mustChangePassword });
}

// Logs in and returns a supertest agent that keeps the session cookie.
export async function login(app, username, password) {
  const agent = request.agent(app);
  const res = await agent.post('/login').type('form').send({ username, password });
  assert.equal(res.status, 302, `logging in as ${username} returned ${res.status}`);
  return agent;
}

export function sessionCookie(res) {
  const cookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('ssm.sid='));
  return cookie ? cookie.split(';')[0] : null;
}

// Inserts a product directly (independent of the code under test).
export async function addProduct(pool, {
  category = 'Food',
  name,
  costPrice = '10.00',
  sellingPrice = '15.00',
  stock = 10,
}) {
  const { rows } = await pool.query(
    `INSERT INTO products (category_id, name, cost_price, selling_price, stock)
     SELECT id, $2, $3, $4, $5 FROM categories WHERE name = $1
     RETURNING id, name, cost_price, selling_price, stock`,
    [category, name, costPrice, sellingPrice, stock],
  );
  const [row] = rows;
  return { id: row.id, name: row.name, costPrice: row.cost_price, sellingPrice: row.selling_price, stock: row.stock };
}

export async function categoryId(pool, name) {
  const { rows } = await pool.query('SELECT id FROM categories WHERE name = $1', [name]);
  return rows[0].id;
}
