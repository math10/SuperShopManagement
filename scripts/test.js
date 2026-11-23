// Runs the test suite against a real PostgreSQL.
//
//   npm test                          all test/*.test.js files
//   npm test -- test/billing.test.js  just the files named
//
// If TEST_DATABASE_URL is set, that database is used (it is emptied by the
// tests, so never point it at real data). Otherwise a throwaway PostgreSQL is
// started in a temporary folder and deleted afterwards.
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startThrowawayDatabase() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dir = await mkdtemp(join(tmpdir(), 'supershop-test-'));
  // PostgreSQL refuses to run as root (containers, some CI machines). There,
  // embedded-postgres runs it as a "postgres" user instead, which needs to
  // reach the data folder inside this otherwise private temporary folder.
  const asRoot = process.getuid?.() === 0;
  if (asRoot) await chmod(dir, 0o755);
  const port = await freePort();
  const server = new EmbeddedPostgres({
    databaseDir: join(dir, 'data'),
    port,
    user: 'postgres',
    password: 'postgres',
    authMethod: 'scram-sha-256',
    persistent: false,
    createPostgresUser: asRoot,
    onLog: () => {},
  });
  await server.initialise();
  await server.start();
  await server.createDatabase('supershop_test');
  return {
    url: `postgres://postgres:postgres@localhost:${port}/supershop_test`,
    async stop() {
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function testFiles(args) {
  if (args.length > 0) return args;
  const names = await readdir(join(root, 'test'));
  return names.filter((name) => name.endsWith('.test.js')).sort().map((name) => join('test', name));
}

function runNodeTest(files, databaseUrl) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test' },
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

const files = await testFiles(process.argv.slice(2));
const database = process.env.TEST_DATABASE_URL
  ? { url: process.env.TEST_DATABASE_URL, async stop() {} }
  : await startThrowawayDatabase();

let exitCode = 1;
try {
  const pool = createPool(database.url);
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
  exitCode = await runNodeTest(files, database.url);
} finally {
  await database.stop();
}
// Not process.exit(): embedded-postgres registers exit hooks that complain
// about a synchronous exit. The database is already stopped.
process.exitCode = exitCode;
