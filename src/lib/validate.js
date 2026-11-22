// Parsers for form input. Each returns the cleaned value, or null when the
// input is invalid, including when it isn't a string (a repeated form
// field arrives as an array).

// Largest value a PostgreSQL integer column (and id) can hold.
export const MAX_INT = 2_147_483_647;

// Up to 10 digits before the point (numeric(12,2)), at most 2 after.
const MONEY = /^(\d{1,10})(?:\.(\d{1,2}))?$/;

// "12.5" → "12.50". No signs, commas, exponents or leading dots.
export function parseMoney(input) {
  if (typeof input !== 'string') return null;
  const match = MONEY.exec(input.trim());
  if (!match) return null;
  const whole = String(Number(match[1]));
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return `${whole}.${fraction}`;
}

const WHOLE_NUMBER = /^-?\d{1,15}$/;

export function parseWholeNumber(input, { min, max }) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!WHOLE_NUMBER.test(text)) return null;
  const value = Number(text) + 0; // + 0 turns -0 into 0
  if (value < min || value > max) return null;
  return value;
}

export function cleanText(input, { maxLength }) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (text === '' || [...text].length > maxLength) return null;
  return text;
}
