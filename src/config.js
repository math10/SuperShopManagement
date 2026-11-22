import { randomBytes } from 'node:crypto';

// Reads settings from the environment (and from .env when reading
// process.env). Throws with a clear message when something required is missing.
export function loadConfig(env = process.env, { warn = console.warn } = {}) {
  if (env === process.env) loadDotEnv();

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  const isProduction = env.NODE_ENV === 'production';

  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) {
    if (isProduction) throw new Error('SESSION_SECRET must be set in production.');
    sessionSecret = randomBytes(32).toString('hex');
    warn('SESSION_SECRET is not set; using a random one, so everyone is logged out when the server restarts.');
  }

  return {
    port: parsePort(env.PORT),
    databaseUrl: env.DATABASE_URL,
    sessionSecret,
    cookieSecure: env.COOKIE_SECURE === 'true',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    isProduction,
  };
}

function loadDotEnv() {
  try {
    process.loadEnvFile('.env');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function parsePort(value) {
  if (value === undefined || value === '') return 3000;
  if (!/^\d+$/.test(value) || Number(value) > 65535) {
    throw new Error(`PORT must be a number between 0 and 65535, got "${value}".`);
  }
  return Number(value);
}

// Express accepts true, a hop count, or a list of trusted addresses.
function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
