// Applies pending database migrations (also done automatically by `npm start`).
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const config = loadConfig(process.env, { warn: () => {} }); // only DATABASE_URL matters here
const pool = createPool(config.databaseUrl);
try {
  const applied = await migrate(pool, { log: (message) => console.log(message) });
  if (applied.length === 0) console.log('Database is up to date.');
} finally {
  await pool.end();
}
