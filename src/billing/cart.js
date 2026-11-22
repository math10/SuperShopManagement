// The bill being built lives in the session as [{ productId, quantity }].
// These helpers always return a new array and never change the one given.

export function addToCart(cart, productId, quantity) {
  if (!cart.some((line) => line.productId === productId)) {
    return [...cart, { productId, quantity }];
  }
  return cart.map((line) => (
    line.productId === productId ? { productId, quantity: line.quantity + quantity } : line
  ));
}

export function removeFromCart(cart, productId) {
  return cart.filter((line) => line.productId !== productId);
}

export function quantityInCart(cart, productId) {
  return cart.find((line) => line.productId === productId)?.quantity ?? 0;
}
