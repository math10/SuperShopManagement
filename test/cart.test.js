import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToCart, quantityInCart, removeFromCart } from '../src/billing/cart.js';

test('adding a product appends a line', () => {
  assert.deepEqual(addToCart([], 7, 2), [{ productId: 7, quantity: 2 }]);
});

test('adding a product that is already on the bill adds to its quantity', () => {
  const cart = [{ productId: 7, quantity: 2 }, { productId: 9, quantity: 1 }];
  assert.deepEqual(addToCart(cart, 7, 3), [{ productId: 7, quantity: 5 }, { productId: 9, quantity: 1 }]);
});

test('removing a product drops only its line', () => {
  const cart = [{ productId: 7, quantity: 2 }, { productId: 9, quantity: 1 }];
  assert.deepEqual(removeFromCart(cart, 7), [{ productId: 9, quantity: 1 }]);
  assert.deepEqual(removeFromCart(cart, 42), cart);
});

test('quantityInCart reports what is on the bill, or 0', () => {
  const cart = [{ productId: 7, quantity: 2 }];
  assert.equal(quantityInCart(cart, 7), 2);
  assert.equal(quantityInCart(cart, 9), 0);
});

test('the helpers never modify the cart they are given', () => {
  const cart = [{ productId: 7, quantity: 2 }];
  addToCart(cart, 7, 1);
  addToCart(cart, 8, 1);
  removeFromCart(cart, 7);
  assert.deepEqual(cart, [{ productId: 7, quantity: 2 }]);
});
