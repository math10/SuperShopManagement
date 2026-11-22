// Entry point: `npm start`. Applies pending migrations, then serves the app.
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { createSessionStore } from './sessionStore.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
await migrate(pool, { log: (message) => console.log(message) });
const sessionStore = createSessionStore(pool);

const app = createApp({
  pool,
  sessionStore,
  sessionSecret: config.sessionSecret,
  cookieSecure: config.cookieSecure,
  trustProxy: config.trustProxy,
});

const server = app.listen(config.port, () => {
  console.log(`Super Shop Management is running on http://localhost:${server.address().port}`);
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, shutting down.`);
  setTimeout(() => {
    console.error('Shutdown took longer than 10 seconds; exiting anyway.');
    process.exit(1);
  }, 10_000).unref();
  await new Promise((resolve) => server.close(resolve));
  await sessionStore.close();
  await pool.end();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
