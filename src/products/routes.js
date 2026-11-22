import { Router } from 'express';
import { requireLogin, requireRole } from '../auth/middleware.js';
import { formToken, oncePerForm } from '../forms.js';
import { MAX_INT, cleanText, parseMoney, parseWholeNumber } from '../lib/validate.js';
import { renderError } from '../web.js';
import {
  DuplicateProductError,
  MAX_STOCK,
  StockBelowZeroError,
  createProduct,
  findProduct,
  listCategories,
  listProducts,
  updateProduct,
} from './products.js';

const MONEY_HINT = 'an amount like 12.50 (no commas)';

export function productsRouter({ pool }) {
  const router = Router();
  const adminOnly = requireRole('admin');

  // "Get Product Information" (both roles) and "Product Management" (admin).
  router.get('/products', requireLogin, async (req, res) => {
    const categories = await listCategories(pool);
    const wanted = parseWholeNumber(req.query.category, { min: 1, max: MAX_INT });
    const selectedCategoryId = categories.some((c) => c.id === wanted) ? wanted : null;
    const products = await listProducts(pool, { categoryId: selectedCategoryId });
    res.render('products/index', { title: 'Products', categories, selectedCategoryId, products });
  });

  router.get('/products/new', adminOnly, async (req, res) => {
    res.render('products/new', {
      title: 'Add product', categories: await listCategories(pool), values: {}, errors: [], formToken: formToken(),
    });
  });

  router.post('/products', adminOnly, async (req, res) => {
    const body = req.body ?? {};
    const token = formToken(body.formToken);
    const categories = await listCategories(pool);
    const errors = [];

    const categoryId = parseWholeNumber(body.categoryId, { min: 1, max: MAX_INT });
    const category = categories.find((c) => c.id === categoryId);
    if (!category) errors.push('Choose a category.');
    const name = cleanText(body.name, { maxLength: 100 });
    if (!name) errors.push('Enter a product name (up to 100 characters).');
    const costPrice = parseMoney(body.costPrice);
    if (costPrice === null) errors.push(`Cost price must be ${MONEY_HINT}.`);
    const sellingPrice = parseMoney(body.sellingPrice);
    if (sellingPrice === null) errors.push(`Selling price must be ${MONEY_HINT}.`);
    const stock = parseWholeNumber(body.stock, { min: 0, max: MAX_STOCK });
    if (stock === null) errors.push(`Available must be a whole number from 0 to ${MAX_STOCK}.`);

    if (errors.length === 0) {
      try {
        const { result: product } = await oncePerForm(pool, token, (client) => (
          createProduct(client, { categoryId, name, costPrice, sellingPrice, stock })
        ));
        req.flash('success', `Product added: ${product.name}.`);
        return res.redirect('/products');
      } catch (err) {
        if (!(err instanceof DuplicateProductError)) throw err;
        errors.push(`A product named "${name}" already exists in ${category.name}.`);
      }
    }
    res.status(422).render('products/new', {
      title: 'Add product', categories, values: formValues(body), errors, formToken: token,
    });
  });

  router.get('/products/:id/edit', adminOnly, async (req, res) => {
    const product = await productFromParam(req);
    if (!product) return productNotFound(res);
    const values = { costPrice: product.costPrice, sellingPrice: product.sellingPrice, stockChange: '0' };
    res.render('products/edit', { title: `Edit ${product.name}`, product, values, errors: [], formToken: formToken() });
  });

  router.post('/products/:id', adminOnly, async (req, res) => {
    const product = await productFromParam(req);
    if (!product) return productNotFound(res);
    const body = req.body ?? {};
    const token = formToken(body.formToken);
    const errors = [];

    const costPrice = parseMoney(body.costPrice);
    if (costPrice === null) errors.push(`Cost price must be ${MONEY_HINT}.`);
    const sellingPrice = parseMoney(body.sellingPrice);
    if (sellingPrice === null) errors.push(`Selling price must be ${MONEY_HINT}.`);
    const blankChange = typeof body.stockChange === 'string' && body.stockChange.trim() === '';
    const stockChange = blankChange ? 0 : parseWholeNumber(body.stockChange, { min: -MAX_STOCK, max: MAX_STOCK });
    if (stockChange === null) {
      errors.push('Add to stock must be a whole number (use a negative number to remove stock).');
    }

    if (errors.length === 0) {
      try {
        const { result: updated } = await oncePerForm(pool, token, (client) => (
          updateProduct(client, product.id, { costPrice, sellingPrice, stockChange })
        ));
        if (!updated) return productNotFound(res);
        req.flash('success', `Product updated: ${updated.name}.`);
        return res.redirect('/products');
      } catch (err) {
        if (!(err instanceof StockBelowZeroError)) throw err;
        errors.push(`There are only ${err.currentStock} in stock, so you can't remove ${-stockChange}.`);
        product.stock = err.currentStock;
      }
    }
    res.status(422).render('products/edit', {
      title: `Edit ${product.name}`, product, values: formValues(body), errors, formToken: token,
    });
  });

  async function productFromParam(req) {
    const id = parseWholeNumber(req.params.id, { min: 1, max: MAX_INT });
    return id === null ? null : findProduct(pool, id);
  }

  return router;
}

function productNotFound(res) {
  renderError(res, 404, 'That product does not exist.');
}

// Echo back what was typed (only plain strings) so a fix doesn't mean retyping.
function formValues(body) {
  const values = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') values[key] = value;
  }
  return values;
}
