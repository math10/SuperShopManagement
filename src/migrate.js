import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

// Arbitrary constant; holding this advisory lock means "migrations running".
const MIGRATION_LOCK = 7_427_381;

// Applies every .sql file in `dir` that hasn't been applied yet, in file-name
// order, each in its own transaction. Returns the names it applied.
export async function migrate(pool, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name       text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )`);
      const { rows } = await client.query('SELECT name FROM schema_migrations');
      const done = new Set(rows.map((row) => row.name));
      const pending = (await readdir(dir))
        .filter((name) => name.endsWith('.sql') && !done.has(name))
        .sort();

      for (const name of pending) {
        const sql = await readFile(join(dir, name), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw new Error(`Migration ${name} failed: ${err.message}`, { cause: err });
        }
        log(`applied ${name}`);
      }
      return pending;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    }
  } finally {
    client.release();
  }
}
