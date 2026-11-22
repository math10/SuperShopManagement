import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { addAdmin, addEmployee, addProduct, buildApp, categoryId, login, resetDb, testPool } from './helpers.js';

const pool = testPool();
let app;
let admin;
let cashier;

beforeEach(async () => {
  await resetDb(pool);
  app = buildApp(pool);
  await addAdmin(pool);
  await addEmployee(pool);
  admin = await login(app, 'admin', 'admin-pass-1');
  cashier = await login(app, 'E1', 'cashier-pass-1');
});
after(() => pool.end());

async function productRow(name) {
  const { rows } = await pool.query(
    'SELECT name, cost_price, selling_price, stock FROM products WHERE name = $1',
    [name],
  );
  return rows[0];
}

async function foodId() {
  return String(await categoryId(pool, 'Food'));
}

test('both roles see the product list with prices and stock', async () => {
  await addProduct(pool, { name: 'Rice 5kg', costPrice: '400.00', sellingPrice: '450.00', stock: 12 });
  for (const agent of [admin, cashier]) {
    const res = await agent.get('/products');
    assert.equal(res.status, 200);
    assert.match(res.text, /Rice 5kg/);
    assert.match(res.text, />400\.00</);
    assert.match(res.text, />450\.00</);
    assert.match(res.text, />12</);
  }
});

test('only the admin gets add and edit links', async () => {
  const rice = await addProduct(pool, { name: 'Rice 5kg' });
  const adminPage = await admin.get('/products');
  assert.match(adminPage.text, /href="\/products\/new"/);
  assert.match(adminPage.text, new RegExp(`href="/products/${rice.id}/edit"`));
  const cashierPage = await cashier.get('/products');
  assert.doesNotMatch(cashierPage.text, /\/products\/new|\/edit"/);
});

test('the list can be filtered by category, and a junk filter shows everything', async () => {
  await addProduct(pool, { category: 'Food', name: 'Rice 5kg' });
  await addProduct(pool, { category: 'Book', name: 'Gitanjali' });
  const food = await cashier.get(`/products?category=${await foodId()}`);
  assert.match(food.text, /Rice 5kg/);
  assert.doesNotMatch(food.text, /Gitanjali/);
  const all = await cashier.get('/products?category=junk');
  assert.match(all.text, /Rice 5kg/);
  assert.match(all.text, /Gitanjali/);
});

test('after logging in, an anonymous visitor lands back on the products page', async () => {
  const visitor = request.agent(app);
  const first = await visitor.get('/products');
  assert.equal(first.status, 302);
  assert.equal(first.headers.location, '/login');
  const res = await visitor.post('/login').type('form').send({ username: 'E1', password: 'cashier-pass-1' });
  assert.equal(res.headers.location, '/products');
});

test('the admin adds a product', async () => {
  const form = await admin.get('/products/new');
  assert.equal(form.status, 200);
  assert.match(form.text, /<option value="\d+">Food<\/option>/);

  const res = await admin.post('/products').type('form').send({
    categoryId: await foodId(), name: '  Rice 5kg ', costPrice: '400', sellingPrice: '450.5', stock: '12',
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/products');
  assert.deepEqual(await productRow('Rice 5kg'), {
    name: 'Rice 5kg', cost_price: '400.00', selling_price: '450.50', stock: 12,
  });
  assert.match((await admin.get('/products')).text, /Product added/);
});

test('invalid product input is explained and what was typed is kept', async () => {
  const res = await admin.post('/products').type('form').send({
    categoryId: '999', name: 'Lentils', costPrice: '1,000', sellingPrice: '-5', stock: '-1',
  });
  assert.equal(res.status, 422);
  assert.match(res.text, /Choose a category/);
  assert.match(res.text, /Cost price must be an amount/);
  assert.match(res.text, /Selling price must be an amount/);
  assert.match(res.text, /Available must be a whole number/);
  assert.match(res.text, /value="Lentils"/);
  assert.match(res.text, /value="1,000"/);
  const { rowCount } = await pool.query('SELECT 1 FROM products');
  assert.equal(rowCount, 0);
});

test('blank names and malformed numbers are refused, never a server error', async () => {
  const food = await foodId();
  const cases = [
    { name: '   ', costPrice: '1', sellingPrice: '1', stock: '1', expect: /Enter a product name/ },
    { name: 'x'.repeat(101), costPrice: '1', sellingPrice: '1', stock: '1', expect: /Enter a product name/ },
    { name: 'A', costPrice: '1e3', sellingPrice: '1', stock: '1', expect: /Cost price/ },
    { name: 'A', costPrice: ' ', sellingPrice: '1', stock: '1', expect: /Cost price/ },
    { name: 'A', costPrice: '1', sellingPrice: '12.345', stock: '1', expect: /Selling price/ },
    { name: 'A', costPrice: '1', sellingPrice: '99999999999', stock: '1', expect: /Selling price/ },
    { name: 'A', costPrice: '1', sellingPrice: '1', stock: '1.5', expect: /Available/ },
    { name: 'A', costPrice: '1', sellingPrice: '1', stock: '100000000', expect: /Available/ },
  ];
  for (const { expect, ...fields } of cases) {
    const res = await admin.post('/products').type('form').send({ categoryId: food, ...fields });
    assert.equal(res.status, 422, JSON.stringify(fields));
    assert.match(res.text, expect, JSON.stringify(fields));
  }
  const repeated = await admin.post('/products').type('form')
    .send(`categoryId=${food}&categoryId=${food}&name=A&name=B&costPrice=1&sellingPrice=1&stock=1`);
  assert.equal(repeated.status, 422);
  const { rowCount } = await pool.query('SELECT 1 FROM products');
  assert.equal(rowCount, 0);
});

test('a duplicate name in the same category is refused', async () => {
  await addProduct(pool, { category: 'Food', name: 'Rice 5kg' });
  const res = await admin.post('/products').type('form').send({
    categoryId: await foodId(), name: 'rice 5KG', costPrice: '1', sellingPrice: '2', stock: '3',
  });
  assert.equal(res.status, 422);
  assert.match(res.text, /already exists in Food/);
});

test('employees cannot add or edit products', async () => {
  const rice = await addProduct(pool, { name: 'Rice 5kg' });
  assert.equal((await cashier.get('/products/new')).status, 403);
  assert.equal((await cashier.post('/products').type('form').send({ name: 'X' })).status, 403);
  assert.equal((await cashier.get(`/products/${rice.id}/edit`)).status, 403);
  const post = await cashier.post(`/products/${rice.id}`).type('form')
    .send({ costPrice: '1', sellingPrice: '1', stockChange: '100' });
  assert.equal(post.status, 403);
  assert.equal((await productRow('Rice 5kg')).stock, 10);
});

test('the admin changes prices and adds stock', async () => {
  const rice = await addProduct(pool, { name: 'Rice 5kg', stock: 10 });
  const form = await admin.get(`/products/${rice.id}/edit`);
  assert.equal(form.status, 200);
  assert.match(form.text, /Rice 5kg/);
  assert.match(form.text, /value="15.00"/);

  const res = await admin.post(`/products/${rice.id}`).type('form')
    .send({ costPrice: '410', sellingPrice: '460.25', stockChange: '5' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/products');
  assert.deepEqual(await productRow('Rice 5kg'), {
    name: 'Rice 5kg', cost_price: '410.00', selling_price: '460.25', stock: 15,
  });
  assert.match((await admin.get('/products')).text, /Product updated/);
});

test('a blank stock change leaves the stock alone', async () => {
  const rice = await addProduct(pool, { name: 'Rice 5kg', stock: 10 });
  const res = await admin.post(`/products/${rice.id}`).type('form')
    .send({ costPrice: '10', sellingPrice: '16', stockChange: '' });
  assert.equal(res.status, 302);
  assert.equal((await productRow('Rice 5kg')).stock, 10);
});

test('stock can be removed with a negative number, but never below zero', async () => {
  const rice = await addProduct(pool, { name: 'Rice 5kg', stock: 10 });
  const ok = await admin.post(`/products/${rice.id}`).type('form')
    .send({ costPrice: '10', sellingPrice: '15', stockChange: '-4' });
  assert.equal(ok.status, 302);
  assert.equal((await productRow('Rice 5kg')).stock, 6);

  const tooMuch = await admin.post(`/products/${rice.id}`).type('form')
    .send({ costPrice: '11', sellingPrice: '15', stockChange: '-7' });
  assert.equal(tooMuch.status, 422);
  assert.match(tooMuch.text, /only 6 in stock/);
  assert.deepEqual(await productRow('Rice 5kg'), {
    name: 'Rice 5kg', cost_price: '10.00', selling_price: '15.00', stock: 6,
  });
});

test('invalid edits are explained and change nothing', async () => {
  const rice = await addProduct(pool, { name: 'Rice 5kg', stock: 10 });
  const res = await admin.post(`/products/${rice.id}`).type('form')
    .send({ costPrice: 'abc', sellingPrice: '15', stockChange: '2.5' });
  assert.equal(res.status, 422);
  assert.match(res.text, /Cost price must be an amount/);
  assert.match(res.text, /Add to stock must be a whole number/);
  assert.match(res.text, /value="abc"/);
  assert.equal((await productRow('Rice 5kg')).stock, 10);
});

test('editing a product that does not exist is a 404 that says so', async () => {
  for (const res of [
    await admin.get('/products/999/edit'),
    await admin.get('/products/abc/edit'),
    await admin.post('/products/999').type('form').send({ costPrice: '1', sellingPrice: '1', stockChange: '0' }),
  ]) {
    assert.equal(res.status, 404);
    assert.match(res.text, /That product does not exist/);
  }
});

async function formTokenOn(agent, path) {
  const page = await agent.get(path);
  return /name="formToken" value="([^"]+)"/.exec(page.text)?.[1];
}

test('double-clicking Update applies the stock change once', async () => {
  const rice = await addProduct(pool, { name: 'Rice 5kg', stock: 10 });
  const formToken = await formTokenOn(admin, `/products/${rice.id}/edit`);
  const send = () => admin.post(`/products/${rice.id}`).type('form')
    .send({ costPrice: '10', sellingPrice: '15', stockChange: '50', formToken });
  const [first, second] = await Promise.all([send(), send()]);
  assert.deepEqual([first.status, second.status], [302, 302]);
  assert.equal((await productRow('Rice 5kg')).stock, 60);

  const resubmitted = await send(); // e.g. from the browser history
  assert.equal(resubmitted.status, 302);
  assert.equal((await productRow('Rice 5kg')).stock, 60);
});

test('double-clicking Add product adds it once, and a corrected form stays protected', async () => {
  const formToken = await formTokenOn(admin, '/products/new');
  const fields = { categoryId: await foodId(), name: 'Rice 5kg', costPrice: '1', sellingPrice: '2', stock: '3', formToken };

  const invalid = await admin.post('/products').type('form').send({ ...fields, costPrice: 'oops' });
  assert.equal(invalid.status, 422);
  assert.match(invalid.text, new RegExp(`name="formToken" value="${formToken}"`));

  const send = () => admin.post('/products').type('form').send(fields);
  const [first, second] = await Promise.all([send(), send()]);
  assert.deepEqual([first.status, second.status], [302, 302]);
  const { rowCount } = await pool.query('SELECT 1 FROM products');
  assert.equal(rowCount, 1);
  assert.match((await admin.get('/products')).text, /Product added: Rice 5kg/);
});

test('names with quotes, HTML or Bangla are stored and shown exactly', async () => {
  const food = await foodId();
  for (const name of ["Lay's <b>Chips</b>", 'চাল']) {
    const res = await admin.post('/products').type('form')
      .send({ categoryId: food, name, costPrice: '1', sellingPrice: '2', stock: '3' });
    assert.equal(res.status, 302, name);
  }
  const list = await cashier.get('/products');
  assert.match(list.text, /Lay&#39;s &lt;b&gt;Chips&lt;\/b&gt;/);
  assert.doesNotMatch(list.text, /<b>Chips<\/b>/);
  assert.match(list.text, /চাল/);
  assert.ok(await productRow("Lay's <b>Chips</b>"));
});
