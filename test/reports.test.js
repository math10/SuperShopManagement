import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addAdmin, addEmployee, buildApp, login, resetDb, testPool } from './helpers.js';

const pool = testPool();
let app;
let admin;
let cashierId;

beforeEach(async () => {
  await resetDb(pool);
  app = buildApp(pool);
  await addAdmin(pool);
  cashierId = (await addEmployee(pool)).id;
  admin = await login(app, 'admin', 'admin-pass-1');
});
after(() => pool.end());

async function addSale({ daysAgo, total, totalCost }) {
  await pool.query(
    `INSERT INTO sales (cashier_id, checkout_token, total, total_cost, created_at)
     VALUES ($1, $2, $3, $4, now() - make_interval(days => $5))`,
    [cashierId, randomUUID(), total, totalCost, daysAgo],
  );
}

async function addSampleSales() {
  // profits 1.00, 2.00, 3.00, 4.00 at 1, 10, 100 and 400 days ago
  await addSale({ daysAgo: 1, total: '11.00', totalCost: '10.00' });
  await addSale({ daysAgo: 10, total: '22.00', totalCost: '20.00' });
  await addSale({ daysAgo: 100, total: '33.00', totalCost: '30.00' });
  await addSale({ daysAgo: 400, total: '44.00', totalCost: '40.00' });
}

function stats(html) {
  const pick = (id) => new RegExp(`id="${id}">([^<]*)<`).exec(html)?.[1];
  return { bills: pick('bill-count'), revenue: pick('revenue'), profit: pick('profit') };
}

test('each period counts only the bills inside it', async () => {
  await addSampleSales();
  const expected = {
    week: { bills: '1', revenue: '11.00', profit: '1.00' },
    month: { bills: '2', revenue: '33.00', profit: '3.00' },
    year: { bills: '3', revenue: '66.00', profit: '6.00' },
    all: { bills: '4', revenue: '110.00', profit: '10.00' },
  };
  for (const [period, want] of Object.entries(expected)) {
    const res = await admin.get(`/reports/profit?period=${period}`);
    assert.equal(res.status, 200, period);
    assert.deepEqual(stats(res.text), want, period);
  }
});

test('without a period, or with an unknown one, the report covers all time', async () => {
  await addSampleSales();
  for (const path of ['/reports/profit', '/reports/profit?period=bogus', '/reports/profit?period=week&period=all']) {
    const res = await admin.get(path);
    assert.deepEqual(stats(res.text), { bills: '4', revenue: '110.00', profit: '10.00' }, path);
    assert.match(res.text, /<option value="all" selected>All time<\/option>/, path);
  }
});

test('the selected period stays selected', async () => {
  const res = await admin.get('/reports/profit?period=month');
  assert.match(res.text, /<option value="month" selected>Past 1 month<\/option>/);
});

test('with no bills the report shows zeros', async () => {
  const res = await admin.get('/reports/profit');
  assert.deepEqual(stats(res.text), { bills: '0', revenue: '0.00', profit: '0.00' });
});

test('a loss shows as negative profit', async () => {
  await addSale({ daysAgo: 0, total: '5.00', totalCost: '8.50' });
  const res = await admin.get('/reports/profit');
  assert.deepEqual(stats(res.text), { bills: '1', revenue: '5.00', profit: '-3.50' });
});

test('employees cannot see the profit report', async () => {
  const cashier = await login(app, 'E1', 'cashier-pass-1');
  assert.equal((await cashier.get('/reports/profit')).status, 403);
});
