// Bills (sales). All money arithmetic happens in PostgreSQL `numeric`;
// totals come back as strings with two decimals.
import { withTransaction } from '../db.js';

export class EmptyCartError extends Error {}

export class OutOfStockError extends Error {
  constructor(productName, available) {
    super(`Only ${available} of ${productName} left in stock.`);
    this.productName = productName;
    this.available = available;
  }
}

export class BillTooLargeError extends Error {}

class DuplicateCheckout extends Error {}

function cartArrays(cart) {
  return [cart.map((line) => line.productId), cart.map((line) => line.quantity)];
}

// The bill as it stands now: current names, prices and stock for each line.
export async function getCartLines(db, cart) {
  if (cart.length === 0) return { lines: [], total: '0.00' };
  const { rows } = await db.query(
    `SELECT p.id, p.name, c.name AS category_name, p.selling_price, p.stock, line.qty,
            p.selling_price * line.qty AS line_total,
            sum(p.selling_price * line.qty) OVER () AS total
     FROM unnest($1::int[], $2::int[]) WITH ORDINALITY AS line(product_id, qty, ord)
     JOIN products p ON p.id = line.product_id
     JOIN categories c ON c.id = p.category_id
     ORDER BY line.ord`,
    cartArrays(cart),
  );
  return {
    lines: rows.map((row) => ({
      productId: row.id,
      name: row.name,
      categoryName: row.category_name,
      unitPrice: row.selling_price,
      quantity: row.qty,
      lineTotal: row.line_total,
      stock: row.stock,
    })),
    total: rows[0]?.total ?? '0.00',
  };
}

// Makes the bill in one transaction:
//   1. insert the sale with the form's checkout token (unique, so a second
//      submit of the same form waits for the first, then fails over to it);
//   2. lock the products in id order (two tills can't deadlock or oversell);
//   3. check stock, insert the items, take the stock off, set the totals.
// Nothing is saved if any product is short.
export async function checkout(pool, { cashierId, cart, checkoutToken }) {
  if (cart.length === 0) throw new EmptyCartError('The bill is empty.');
  const [ids, quantities] = cartArrays(cart);
  try {
    return await withTransaction(pool, async (client) => {
      let saleId;
      try {
        const { rows } = await client.query(
          'INSERT INTO sales (cashier_id, checkout_token) VALUES ($1, $2) RETURNING id',
          [cashierId, checkoutToken],
        );
        saleId = rows[0].id;
      } catch (err) {
        if (err.code === '23505') throw new DuplicateCheckout();
        throw err;
      }

      const { rows: locked } = await client.query(
        'SELECT id, name, stock FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
        [ids],
      );
      const byId = new Map(locked.map((row) => [row.id, row]));
      for (const line of cart) {
        const product = byId.get(line.productId);
        if (!product) throw new OutOfStockError('a product on this bill', 0);
        if (product.stock < line.quantity) throw new OutOfStockError(product.name, product.stock);
      }

      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, unit_cost)
         SELECT $1, p.id, p.name, line.qty, p.selling_price, p.cost_price
         FROM unnest($2::int[], $3::int[]) WITH ORDINALITY AS line(product_id, qty, ord)
         JOIN products p ON p.id = line.product_id
         ORDER BY line.ord`,
        [saleId, ids, quantities],
      );
      await client.query(
        `UPDATE products p SET stock = p.stock - line.qty, updated_at = now()
         FROM unnest($1::int[], $2::int[]) AS line(product_id, qty)
         WHERE p.id = line.product_id`,
        [ids, quantities],
      );
      await client.query(
        `UPDATE sales s SET total = t.total, total_cost = t.total_cost
         FROM (SELECT sum(unit_price * quantity) AS total, sum(unit_cost * quantity) AS total_cost
               FROM sale_items WHERE sale_id = $1) t
         WHERE s.id = $1`,
        [saleId],
      );
      return { saleId, duplicate: false };
    });
  } catch (err) {
    if (err instanceof DuplicateCheckout) {
      const existing = await findSaleByToken(pool, checkoutToken, cashierId);
      if (existing !== null) return { saleId: existing, duplicate: true };
    }
    if (err.code === '22003') throw new BillTooLargeError('The bill total is too large to store.');
    throw err;
  }
}

export async function findSaleByToken(db, token, cashierId) {
  const { rows } = await db.query(
    'SELECT id FROM sales WHERE checkout_token = $1 AND cashier_id = $2',
    [token, cashierId],
  );
  return rows.length === 0 ? null : rows[0].id;
}

export async function getSale(db, saleId) {
  const { rows } = await db.query(
    `SELECT s.id, s.created_at, s.cashier_id, u.name AS cashier_name, u.username AS cashier_username, s.total
     FROM sales s JOIN users u ON u.id = s.cashier_id
     WHERE s.id = $1`,
    [saleId],
  );
  if (rows.length === 0) return null;
  const { rows: items } = await db.query(
    `SELECT product_name, quantity, unit_price, unit_price * quantity AS line_total
     FROM sale_items WHERE sale_id = $1 ORDER BY id`,
    [saleId],
  );
  const [sale] = rows;
  return {
    id: sale.id,
    createdAt: sale.created_at,
    cashierId: sale.cashier_id,
    cashierName: sale.cashier_name,
    cashierUsername: sale.cashier_username,
    total: sale.total,
    items: items.map((item) => ({
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
    })),
  };
}
