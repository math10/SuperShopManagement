// Starts a local PostgreSQL for development, for machines without one
// installed. Data is kept in .pgdata/ between runs. Press Ctrl+C to stop it.
//
//   npm run db:dev          (port 5433, or DEV_DB_PORT)
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(join(root, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const port = Number(process.env.DEV_DB_PORT || 5433);
const dataDir = join(root, '.pgdata');
const database = 'supershop';

const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user: 'postgres',
  password: 'postgres',
  authMethod: 'scram-sha-256',
  persistent: true,
  onLog: () => {},
});

if (!existsSync(join(dataDir, 'PG_VERSION'))) {
  console.log(`Creating a new database cluster in ${dataDir} ...`);
  await server.initialise();
}
await server.start();

const client = server.getPgClient();
await client.connect();
try {
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (rowCount === 0) await server.createDatabase(database);
} finally {
  await client.end();
}

console.log(`PostgreSQL is running. Put this in your .env:\n\nDATABASE_URL=postgres://postgres:postgres@localhost:${port}/${database}\n\nPress Ctrl+C to stop.`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  console.log('PostgreSQL stopped.');
  process.exitCode = 0;
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
