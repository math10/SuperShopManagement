// Products and categories. Prices come back from PostgreSQL as strings with
// two decimals ("450.00") and are passed back the same way; no money
// arithmetic happens in JavaScript.

export const MAX_STOCK = 99_999_999; // the Java app's number(8)

export class DuplicateProductError extends Error {}

export class StockBelowZeroError extends Error {
  constructor(currentStock) {
    super(`Stock would drop below zero (currently ${currentStock}).`);
    this.currentStock = currentStock;
  }
}

const SELECT_PRODUCT = `
  SELECT p.id, p.name, p.category_id, c.name AS category_name, p.cost_price, p.selling_price, p.stock
  FROM products p JOIN categories c ON c.id = p.category_id`;

function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    costPrice: row.cost_price,
    sellingPrice: row.selling_price,
    stock: row.stock,
  };
}

export async function listCategories(db) {
  const { rows } = await db.query('SELECT id, name FROM categories ORDER BY name');
  return rows;
}

export async function listProducts(db, { categoryId = null } = {}) {
  const { rows } = await db.query(
    `${SELECT_PRODUCT} WHERE ($1::int IS NULL OR p.category_id = $1) ORDER BY c.name, lower(p.name), p.id`,
    [categoryId],
  );
  return rows.map(toProduct);
}

export async function findProduct(db, id) {
  const { rows } = await db.query(`${SELECT_PRODUCT} WHERE p.id = $1`, [id]);
  return rows.length === 0 ? null : toProduct(rows[0]);
}

export async function createProduct(db, { categoryId, name, costPrice, sellingPrice, stock }) {
  try {
    const { rows } = await db.query(
      `INSERT INTO products (category_id, name, cost_price, selling_price, stock)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [categoryId, name, costPrice, sellingPrice, stock],
    );
    return findProduct(db, rows[0].id);
  } catch (err) {
    if (err.code === '23505') throw new DuplicateProductError(`A product named "${name}" already exists.`);
    throw err;
  }
}

// Sets both prices and adds stockChange (negative removes) to the current
// stock in one statement, so a sale happening at the same moment isn't lost.
// Returns null if the product doesn't exist.
export async function updateProduct(db, id, { costPrice, sellingPrice, stockChange }) {
  const { rowCount } = await db.query(
    `UPDATE products
     SET cost_price = $2, selling_price = $3, stock = stock + $4, updated_at = now()
     WHERE id = $1 AND stock + $4 >= 0`,
    [id, costPrice, sellingPrice, stockChange],
  );
  const product = await findProduct(db, id);
  if (rowCount === 0 && product) throw new StockBelowZeroError(product.stock);
  return product;
}
