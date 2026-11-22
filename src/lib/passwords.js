import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

const COST = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024; // N=32768, r=8 needs 32 MiB

// Stored form: scrypt$N$r$p$<salt base64>$<key base64>. The cost settings
// travel with each hash, so they can be raised later without breaking logins.
export async function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, KEY_LENGTH, { ...COST, maxmem: MAX_MEMORY });
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(plain, stored) {
  if (typeof plain !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const actual = await scrypt(plain, salt, expected.length, { N, r, p, maxmem: MAX_MEMORY });
    return timingSafeEqual(actual, expected);
  } catch {
    return false; // invalid cost parameters in the stored hash
  }
}

// Returns a message explaining what's wrong with a proposed password, or null.
export function checkNewPassword(plain) {
  const length = typeof plain === 'string' ? [...plain].length : 0;
  if (length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}
