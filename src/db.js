import pg from 'pg';

// A connection pool. The 'error' listener matters: without it, PostgreSQL
// dropping an idle connection (restart, network blip) crashes the process.
export function createPool(databaseUrl, { onError = logPoolError } = {}) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  pool.on('error', onError);
  return pool;
}

function logPoolError(err) {
  console.error('PostgreSQL connection error (the pool will reconnect):', err.message);
}

// Runs fn(client) inside BEGIN/COMMIT on one connection; rolls back and
// rethrows if fn throws.
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true; // the connection itself failed; don't return it to the pool
    }
    throw err;
  } finally {
    client.release(broken);
  }
}
