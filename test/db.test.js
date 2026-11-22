import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPool, withTransaction } from '../src/db.js';
import { testPool } from './helpers.js';

const pool = testPool();

before(() => pool.query('CREATE TABLE IF NOT EXISTS tx_probe (v text)'));
after(async () => {
  await pool.query('DROP TABLE IF EXISTS tx_probe');
  await pool.end();
});

test('withTransaction commits and returns the callback result', async () => {
  const result = await withTransaction(pool, async (client) => {
    await client.query("INSERT INTO tx_probe VALUES ('kept')");
    return 'done';
  });
  assert.equal(result, 'done');
  const { rows } = await pool.query("SELECT v FROM tx_probe WHERE v = 'kept'");
  assert.equal(rows.length, 1);
});

test('withTransaction rolls back and rethrows when the callback fails', async () => {
  await assert.rejects(
    withTransaction(pool, async (client) => {
      await client.query("INSERT INTO tx_probe VALUES ('discarded')");
      throw new Error('boom');
    }),
    /boom/,
  );
  const { rows } = await pool.query("SELECT v FROM tx_probe WHERE v = 'discarded'");
  assert.equal(rows.length, 0);
});

test('a pool survives the database dropping one of its idle connections', async () => {
  const seen = [];
  const own = createPool(process.env.DATABASE_URL, { onError: (err) => seen.push(err) });
  try {
    const client = await own.connect();
    const { rows: [{ pid }] } = await client.query('SELECT pg_backend_pid() AS pid');
    client.release();
    const idleBefore = own.idleCount;

    const killer = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await killer.connect();
    try {
      await killer.query('SELECT pg_terminate_backend($1)', [pid]);
    } finally {
      await killer.end();
    }
    for (let i = 0; i < 100 && own.idleCount >= idleBefore; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.equal(seen.length, 1);
    const { rows } = await own.query('SELECT 1 AS ok');
    assert.equal(rows[0].ok, 1);
  } finally {
    await own.end();
  }
});
