import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { checkout } from '../src/billing/sales.js';
import { addAdmin, addEmployee, addProduct, buildApp, login, resetDb, testPool } from './helpers.js';

const pool = testPool();
let app;
let cashier;

beforeEach(async () => {
  await resetDb(pool);
  app = buildApp(pool);
  await addAdmin(pool);
  await addEmployee(pool); // E1
  cashier = await login(app, 'E1', 'cashier-pass-1');
});
after(() => pool.end());

function addToBill(agent, product, quantity) {
  return agent.post('/billing/items').type('form')
    .send({ productId: String(product.id), quantity: String(quantity) });
}

async function cartTokenOf(agent) {
  const page = await agent.get('/billing');
  return /name="cartToken" value="([^"]+)"/.exec(page.text)?.[1];
}

async function makeBill(agent) {
  return agent.post('/billing/checkout').type('form').send({ cartToken: await cartTokenOf(agent) });
}

async function stockOf(product) {
  const { rows } = await pool.query('SELECT stock FROM products WHERE id = $1', [product.id]);
  return rows[0].stock;
}

async function salesCount() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM sales');
  return rows[0].n;
}

test('the billing page groups products by category and disables sold-out ones', async () => {
  await addProduct(pool, { category: 'Food', name: 'Rice', stock: 5 });
  const soldOut = await addProduct(pool, { category: 'Book', name: 'Gitanjali', stock: 0 });
  const res = await cashier.get('/billing');
  assert.equal(res.status, 200);
  assert.match(res.text, /<optgroup label="Food">/);
  assert.match(res.text, /<optgroup label="Book">/);
  assert.match(res.text, new RegExp(`<option value="${soldOut.id}" disabled>`));
});

test('adding to the bill shows the line and the total', async () => {
  const rice = await addProduct(pool, { name: 'Rice', sellingPrice: '15.00', stock: 5 });
  const res = await addToBill(cashier, rice, 2);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/billing');
  const page = await cashier.get('/billing');
  assert.match(page.text, /<td>Rice<\/td>/);
  assert.match(page.text, /<td class="num">30\.00<\/td>/);
});

test('the stock check uses the chosen product and what is already on the bill', async () => {
  // The Java app checked against the first product in the category, not the chosen one.
  const scarce = await addProduct(pool, { category: 'Food', name: 'Aaa scarce', stock: 3 });
  const plenty = await addProduct(pool, { category: 'Food', name: 'Zzz plenty', stock: 50 });
  assert.equal((await addToBill(cashier, plenty, 10)).status, 302);
  assert.equal((await addToBill(cashier, scarce, 2)).status, 302);
  const tooMany = await addToBill(cashier, scarce, 2);
  assert.equal(tooMany.status, 422);
  assert.match(tooMany.text, /Only 3 of Aaa scarce/);
  assert.match(tooMany.text, /2 are already on this bill/);
  assert.equal((await addToBill(cashier, scarce, 1)).status, 302);
});

test('bad quantities and unknown products are refused without touching the bill', async () => {
  const rice = await addProduct(pool, { name: 'Rice', stock: 5 });
  for (const quantity of ['0', '-1', 'abc', '1.5', '', '1e2', ' ']) {
    const res = await cashier.post('/billing/items').type('form').send({ productId: String(rice.id), quantity });
    assert.equal(res.status, 422, JSON.stringify(quantity));
    assert.match(res.text, /Quantity must be a whole number/);
  }
  const repeated = await cashier.post('/billing/items').type('form').send(`productId=${rice.id}&quantity=1&quantity=2`);
  assert.equal(repeated.status, 422);
  const unknown = await cashier.post('/billing/items').type('form').send({ productId: '999', quantity: '1' });
  assert.equal(unknown.status, 422);
  assert.match(unknown.text, /Choose a product/);
  assert.equal(await cartTokenOf(cashier), undefined, 'nothing should be on the bill');
});

test('a line can be removed and the whole bill cancelled', async () => {
  const rice = await addProduct(pool, { name: 'Rice' });
  const dal = await addProduct(pool, { name: 'Dal' });
  await addToBill(cashier, rice, 1);
  await addToBill(cashier, dal, 1);

  assert.equal((await cashier.post(`/billing/items/${rice.id}/remove`)).status, 302);
  let page = await cashier.get('/billing');
  assert.doesNotMatch(page.text, /<td>Rice<\/td>/);
  assert.match(page.text, /<td>Dal<\/td>/);

  assert.equal((await cashier.post('/billing/cancel')).status, 302);
  page = await cashier.get('/billing');
  assert.doesNotMatch(page.text, /<td>Dal<\/td>/);
  assert.match(page.text, /Bill cancelled/);
  assert.equal(await stockOf(dal), 10);
  assert.equal(await salesCount(), 0);
});

test("making a bill takes each product's quantity off that product's own stock", async () => {
  // The Java app bound the new stock values in reverse order, swapping them between products.
  const a = await addProduct(pool, { name: 'Product A', costPrice: '10.00', sellingPrice: '15.00', stock: 10 });
  const b = await addProduct(pool, { name: 'Product B', costPrice: '3.00', sellingPrice: '5.00', stock: 20 });
  await addToBill(cashier, a, 2);
  await addToBill(cashier, b, 5);
  const res = await makeBill(cashier);
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/sales\/\d+$/);
  assert.equal(await stockOf(a), 8);
  assert.equal(await stockOf(b), 15);
});

test('the bill is saved with its items, totals and profit, and the receipt shows them', async () => {
  const a = await addProduct(pool, { name: 'Product A', costPrice: '10.00', sellingPrice: '15.00', stock: 10 });
  const b = await addProduct(pool, { name: 'Product B', costPrice: '3.00', sellingPrice: '5.00', stock: 20 });
  await addToBill(cashier, a, 2);
  await addToBill(cashier, b, 5);
  const res = await makeBill(cashier);

  // A: 2 × 15.00 = 30.00 and B: 5 × 5.00 = 25.00 → 55.00; cost 2 × 10.00 + 5 × 3.00 = 35.00.
  const { rows: [sale] } = await pool.query('SELECT id, total, total_cost, profit FROM sales');
  assert.deepEqual(
    { total: sale.total, totalCost: sale.total_cost, profit: sale.profit },
    { total: '55.00', totalCost: '35.00', profit: '20.00' },
  );
  const { rows: items } = await pool.query(
    'SELECT product_name, quantity, unit_price, unit_cost FROM sale_items WHERE sale_id = $1 ORDER BY id',
    [sale.id],
  );
  assert.deepEqual(items, [
    { product_name: 'Product A', quantity: 2, unit_price: '15.00', unit_cost: '10.00' },
    { product_name: 'Product B', quantity: 5, unit_price: '5.00', unit_cost: '3.00' },
  ]);

  const receipt = await cashier.get(res.headers.location);
  assert.equal(receipt.status, 200);
  assert.match(receipt.text, new RegExp(`Bill #${sale.id}`));
  assert.match(receipt.text, /<td>Product A<\/td>/);
  assert.match(receipt.text, /<td class="num">55\.00<\/td>/);
  assert.match((await cashier.get('/billing')).text, /No items yet/);
});

test('an empty bill cannot be made', async () => {
  const res = await cashier.post('/billing/checkout').type('form').send({ cartToken: '' });
  assert.equal(res.status, 422);
  assert.match(res.text, /empty/);
  assert.equal(await salesCount(), 0);
});

test('a bill with 30 different products can be made', async () => {
  // The Java bill table had 25 fixed rows; the 26th item crashed it.
  const products = [];
  for (let i = 1; i <= 30; i += 1) {
    products.push(await addProduct(pool, { name: `Item ${String(i).padStart(2, '0')}`, stock: 5 }));
  }
  for (const product of products) {
    assert.equal((await addToBill(cashier, product, 1)).status, 302);
  }
  assert.equal((await makeBill(cashier)).status, 302);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM sale_items');
  assert.equal(rows[0].n, 30);
});

test('pressing Make Bill twice creates one bill and takes the stock once', async () => {
  const rice = await addProduct(pool, { name: 'Rice', stock: 10 });
  await addToBill(cashier, rice, 3);
  const token = await cartTokenOf(cashier);
  const [first, second] = await Promise.all([
    cashier.post('/billing/checkout').type('form').send({ cartToken: token }),
    cashier.post('/billing/checkout').type('form').send({ cartToken: token }),
  ]);
  assert.equal(first.status, 302);
  assert.equal(second.status, 302);
  assert.equal(first.headers.location, second.headers.location);
  assert.equal(await salesCount(), 1);
  assert.equal(await stockOf(rice), 7);

  const later = await cashier.post('/billing/checkout').type('form').send({ cartToken: token });
  assert.equal(later.headers.location, first.headers.location, 'a resubmitted form shows the same receipt');
  assert.equal(await salesCount(), 1);
});

test('checking out the same token twice at the data layer returns the first sale', async () => {
  const rice = await addProduct(pool, { name: 'Rice', stock: 10 });
  const { rows: [{ id: cashierId }] } = await pool.query("SELECT id FROM users WHERE username = 'E1'");
  const args = { cashierId, cart: [{ productId: rice.id, quantity: 2 }], checkoutToken: 'token-1' };
  const results = await Promise.all([checkout(pool, args), checkout(pool, args)]);
  assert.deepEqual(results.map((r) => r.duplicate).sort(), [false, true]);
  assert.equal(results[0].saleId, results[1].saleId);
  assert.equal(await stockOf(rice), 8);
});

test('two tills cannot sell more than is in stock', async () => {
  const rice = await addProduct(pool, { name: 'Rice', stock: 5 });
  await addEmployee(pool, { name: 'Second Cashier' }); // E2
  const other = await login(app, 'E2', 'cashier-pass-1');
  await addToBill(cashier, rice, 3);
  await addToBill(other, rice, 3);
  const [tokenA, tokenB] = await Promise.all([cartTokenOf(cashier), cartTokenOf(other)]);
  const results = await Promise.all([
    cashier.post('/billing/checkout').type('form').send({ cartToken: tokenA }),
    other.post('/billing/checkout').type('form').send({ cartToken: tokenB }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [302, 422]);
  assert.match(results.find((r) => r.status === 422).text, /Only 2 of Rice/);
  assert.equal(await stockOf(rice), 2);
  assert.equal(await salesCount(), 1);
});

test('a bill changed in another window is not made from the old page', async () => {
  const rice = await addProduct(pool, { name: 'Rice', stock: 10 });
  await addToBill(cashier, rice, 1);
  const oldToken = await cartTokenOf(cashier);
  await addToBill(cashier, rice, 1);
  const res = await cashier.post('/billing/checkout').type('form').send({ cartToken: oldToken });
  assert.equal(res.status, 409);
  assert.match(res.text, /changed/);
  assert.equal(await salesCount(), 0);
});

test('the bill is charged at the current price', async () => {
  const rice = await addProduct(pool, { name: 'Rice', sellingPrice: '15.00', stock: 5 });
  await addToBill(cashier, rice, 3);
  await pool.query("UPDATE products SET selling_price = '20.00' WHERE id = $1", [rice.id]); // the admin changed the price
  assert.match((await cashier.get('/billing')).text, /<td class="num">60\.00<\/td>/);
  await makeBill(cashier);
  const { rows: [sale] } = await pool.query('SELECT total FROM sales');
  assert.equal(sale.total, '60.00');
});

test('stock sold elsewhere while the bill is open is shown, and the bill is refused', async () => {
  const rice = await addProduct(pool, { name: 'Rice', stock: 3 });
  await addToBill(cashier, rice, 3);
  await pool.query('UPDATE products SET stock = 1 WHERE id = $1', [rice.id]); // another till sold two
  assert.match((await cashier.get('/billing')).text, /Only 1 left in stock/);
  const res = await makeBill(cashier);
  assert.equal(res.status, 422);
  assert.match(res.text, /Only 1 of Rice/);
  assert.equal(await salesCount(), 0);
  assert.equal(await stockOf(rice), 1);
});

test('a bill too large to store is refused cleanly', async () => {
  const gold = await addProduct(pool, { name: 'Gold bar', costPrice: '1.00', sellingPrice: '9999999999.99', stock: 1000 });
  await addToBill(cashier, gold, 1000);
  const res = await makeBill(cashier);
  assert.equal(res.status, 422);
  assert.match(res.text, /too large/);
  assert.equal(await salesCount(), 0);
  assert.equal(await stockOf(gold), 1000);
});

test('names with quotes and Bangla appear on the bill and the receipt', async () => {
  const chal = await addProduct(pool, { name: 'চাল', stock: 5 });
  const lays = await addProduct(pool, { name: "Lay's", stock: 5 });
  await addToBill(cashier, chal, 1);
  await addToBill(cashier, lays, 1);
  const res = await makeBill(cashier);
  const receipt = await cashier.get(res.headers.location);
  assert.match(receipt.text, /<td>চাল<\/td>/);
  assert.match(receipt.text, /<td>Lay&#39;s<\/td>/);
});

test('the admin cannot use billing but can see any receipt; other cashiers cannot', async () => {
  const rice = await addProduct(pool, { name: 'Rice' });
  await addToBill(cashier, rice, 1);
  const { headers: { location } } = await makeBill(cashier);

  const admin = await login(app, 'admin', 'admin-pass-1');
  assert.equal((await admin.get('/billing')).status, 403);
  const adminAdd = await admin.post('/billing/items').type('form').send({ productId: String(rice.id), quantity: '1' });
  assert.equal(adminAdd.status, 403);
  assert.equal((await admin.get(location)).status, 200);

  await addEmployee(pool, { name: 'Other Cashier' }); // E2
  const other = await login(app, 'E2', 'cashier-pass-1');
  assert.equal((await other.get(location)).status, 403);
  assert.equal((await cashier.get('/sales/999')).status, 404);
  assert.equal((await cashier.get('/sales/abc')).status, 404);
});
