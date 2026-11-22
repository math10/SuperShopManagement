// Creates the admin account, or resets its password if it already exists.
// Replaces the Java app's hardcoded root / 123456 login.
//
//   ADMIN_PASSWORD='a long password' npm run create-admin
//
// Reads ADMIN_USERNAME (default "admin"), ADMIN_PASSWORD and ADMIN_NAME from
// the environment or .env.
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { checkNewPassword } from '../src/lib/passwords.js';
import { migrate } from '../src/migrate.js';
import { upsertAdmin } from '../src/users/users.js';

const config = loadConfig(process.env, { warn: () => {} }); // only DATABASE_URL matters here
const username = (process.env.ADMIN_USERNAME || 'admin').trim();
const name = (process.env.ADMIN_NAME || 'Administrator').trim();
const password = process.env.ADMIN_PASSWORD;

const problem = checkNewPassword(password);
if (problem) {
  console.error(`ADMIN_PASSWORD: ${problem} Set it in .env, or run: ADMIN_PASSWORD='…' npm run create-admin`);
  process.exitCode = 1;
} else {
  const pool = createPool(config.databaseUrl);
  try {
    await migrate(pool);
    const { user, created } = await upsertAdmin(pool, { username, name, password });
    console.log(created ? `Created admin "${user.username}".` : `Reset password for admin "${user.username}".`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
