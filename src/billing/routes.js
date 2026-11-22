import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { requireLogin, requireRole } from '../auth/middleware.js';
import { MAX_INT, parseWholeNumber } from '../lib/validate.js';
import { MAX_STOCK, findProduct, listProducts } from '../products/products.js';
import { renderError } from '../web.js';
import { addToCart, quantityInCart, removeFromCart } from './cart.js';
import {
  BillTooLargeError,
  OutOfStockError,
  checkout,
  findSaleByToken,
  getCartLines,
  getSale,
} from './sales.js';

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

// "Billing" (employees). The bill being built is kept in the session; every
// change gets a new cartToken, which the Make Bill form sends back.
export function billingRouter({ pool }) {
  const router = Router();
  const employeeOnly = requireRole('employee');

  async function renderBilling(req, res, { status = 200, errors = [], values = {} } = {}) {
    const cart = req.session.cart ?? [];
    const [products, { lines, total }] = await Promise.all([listProducts(pool), getCartLines(pool, cart)]);
    const groups = [];
    for (const product of products) {
      if (groups.at(-1)?.category !== product.categoryName) {
        groups.push({ category: product.categoryName, products: [] });
      }
      const available = product.stock - quantityInCart(cart, product.id);
      groups.at(-1).products.push({ ...product, available });
    }
    if (lines.length > 0 && !req.session.cartToken) req.session.cartToken = randomUUID();
    res.status(status).render('billing/index', {
      title: 'Billing',
      groups,
      lines,
      total,
      cartToken: req.session.cartToken ?? '',
      values,
      errors,
    });
  }

  router.get('/billing', employeeOnly, (req, res) => renderBilling(req, res));

  router.post('/billing/items', employeeOnly, async (req, res) => {
    const body = req.body ?? {};
    const productId = parseWholeNumber(body.productId, { min: 1, max: MAX_INT });
    const product = productId === null ? null : await findProduct(pool, productId);
    const quantity = parseWholeNumber(body.quantity, { min: 1, max: MAX_STOCK });
    const errors = [];
    if (!product) errors.push('Choose a product.');
    if (quantity === null) errors.push('Quantity must be a whole number of at least 1.');

    if (errors.length === 0) {
      const cart = req.session.cart ?? [];
      const onBill = quantityInCart(cart, product.id);
      if (onBill + quantity <= product.stock) {
        req.session.cart = addToCart(cart, product.id, quantity);
        req.session.cartToken = randomUUID();
        return res.redirect('/billing');
      }
      const already = onBill > 0 ? `, and ${onBill} are already on this bill` : '';
      errors.push(`Only ${product.stock} of ${product.name} in stock${already}.`);
    }
    const values = { productId: asText(body.productId), quantity: asText(body.quantity) };
    return renderBilling(req, res, { status: 422, errors, values });
  });

  router.post('/billing/items/:productId/remove', employeeOnly, (req, res) => {
    const productId = parseWholeNumber(req.params.productId, { min: 1, max: MAX_INT });
    if (productId !== null) {
      req.session.cart = removeFromCart(req.session.cart ?? [], productId);
      req.session.cartToken = randomUUID();
    }
    res.redirect('/billing');
  });

  router.post('/billing/cancel', employeeOnly, (req, res) => {
    clearBill(req);
    req.flash('success', 'Bill cancelled.');
    res.redirect('/billing');
  });

  router.post('/billing/checkout', employeeOnly, async (req, res) => {
    const token = asText(req.body?.cartToken);

    // The same form sent again (double click, Back + resubmit): show its receipt.
    if (token !== '') {
      const existing = await findSaleByToken(pool, token, req.user.id);
      if (existing !== null) {
        clearBill(req);
        return res.redirect(`/sales/${existing}`);
      }
    }
    const cart = req.session.cart ?? [];
    if (cart.length === 0) {
      return renderBilling(req, res, { status: 422, errors: ['The bill is empty. Add a product first.'] });
    }
    if (token !== req.session.cartToken) {
      return renderBilling(req, res, {
        status: 409,
        errors: ['This bill changed in another window. Check it and press Make Bill again.'],
      });
    }

    try {
      const { saleId } = await checkout(pool, { cashierId: req.user.id, cart, checkoutToken: token });
      clearBill(req);
      req.flash('success', `Bill #${saleId} saved.`);
      return res.redirect(`/sales/${saleId}`);
    } catch (err) {
      if (err instanceof OutOfStockError) {
        return renderBilling(req, res, {
          status: 422,
          errors: [`Only ${err.available} of ${err.productName} left in stock. Change the bill and try again.`],
        });
      }
      if (err instanceof BillTooLargeError) {
        return renderBilling(req, res, {
          status: 422,
          errors: ['This bill is too large to save. Split it into smaller bills.'],
        });
      }
      throw err;
    }
  });

  // Receipt: visible to the cashier who made the bill and to admins.
  router.get('/sales/:id', requireLogin, async (req, res) => {
    const id = parseWholeNumber(req.params.id, { min: 1, max: MAX_INT });
    const sale = id === null ? null : await getSale(pool, id);
    if (!sale) return renderError(res, 404, 'That bill does not exist.');
    if (req.user.role !== 'admin' && sale.cashierId !== req.user.id) {
      return renderError(res, 403, 'You can only see bills you made.');
    }
    res.render('billing/receipt', { title: `Bill #${sale.id}`, sale, createdAt: dateTime.format(sale.createdAt) });
  });

  return router;
}

function clearBill(req) {
  delete req.session.cart;
  delete req.session.cartToken;
}

function asText(value) {
  return typeof value === 'string' ? value : '';
}
