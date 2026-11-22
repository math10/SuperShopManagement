import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../src/migrate.js';
import { testPool, resetDb } from './helpers.js';

const pool = testPool();

before(() => resetDb(pool));
after(() => pool.end());

async function migrationDir(files) {
  const dir = await mkdtemp(join(tmpdir(), 'ssm-migrations-'));
  for (const [name, sql] of Object.entries(files)) {
    await writeFile(join(dir, name), sql);
  }
  return dir;
}

test('migrations seed the five original categories, with "Drass" corrected', async () => {
  const { rows } = await pool.query('SELECT name FROM categories ORDER BY name');
  assert.deepEqual(rows.map((r) => r.name), ['Book', 'Dress', 'Food', 'Laptop', 'Mobile']);
});

test('running migrate again applies nothing', async () => {
  assert.deepEqual(await migrate(pool), []);
});

test('pending migrations are applied in file-name order and recorded', async () => {
  const dir = await migrationDir({
    '902_second.sql': "INSERT INTO mig_order VALUES ('second');",
    '901_first.sql': "CREATE TABLE mig_order (v text); INSERT INTO mig_order VALUES ('first');",
  });
  try {
    assert.deepEqual(await migrate(pool, { dir }), ['901_first.sql', '902_second.sql']);
    assert.deepEqual(await migrate(pool, { dir }), []);
    const { rows } = await pool.query('SELECT v FROM mig_order ORDER BY v');
    assert.deepEqual(rows.map((r) => r.v), ['first', 'second']);
  } finally {
    await pool.query('DROP TABLE IF EXISTS mig_order');
    await pool.query("DELETE FROM schema_migrations WHERE name IN ('901_first.sql', '902_second.sql')");
    await rm(dir, { recursive: true, force: true });
  }
});

test('a failing migration leaves no partial changes and is not recorded', async () => {
  const dir = await migrationDir({ '903_broken.sql': 'CREATE TABLE mig_probe (id int); SELECT 1/0;' });
  try {
    await assert.rejects(migrate(pool, { dir }), /903_broken\.sql/);
    const { rows } = await pool.query(
      `SELECT to_regclass('mig_probe') AS tbl,
              (SELECT count(*)::int FROM schema_migrations WHERE name = '903_broken.sql') AS recorded`,
    );
    assert.deepEqual(rows[0], { tbl: null, recorded: 0 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('stock can never be negative', async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO products (category_id, name, cost_price, selling_price, stock)
       SELECT id, 'Broken', 1, 2, -1 FROM categories WHERE name = 'Food'`,
    ),
    { code: '23514' },
  );
});

test('product names are unique within a category, ignoring case', async () => {
  const insert = (category, name) => pool.query(
    `INSERT INTO products (category_id, name, cost_price, selling_price, stock)
     SELECT id, $2, 1, 2, 0 FROM categories WHERE name = $1`,
    [category, name],
  );
  await insert('Food', 'Rice');
  await assert.rejects(insert('Food', 'rice'), { code: '23505' });
  await insert('Book', 'Rice');
});
