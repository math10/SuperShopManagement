// Admin and employee accounts. `db` is a pg Pool or a client inside a transaction.
import { hashPassword, verifyPassword } from '../lib/passwords.js';

const COLUMNS = 'id, username, name, role, gender, salary, must_change_password, password_version';

function toUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    gender: row.gender,
    salary: row.salary,
    mustChangePassword: row.must_change_password,
    passwordVersion: row.password_version,
  };
}

// For login only: the result carries passwordHash.
export async function findUserForLogin(db, username) {
  if (typeof username !== 'string') return null;
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, password_hash FROM users WHERE lower(username) = lower($1)`,
    [username.trim()],
  );
  if (rows.length === 0) return null;
  return { ...toUser(rows[0]), passwordHash: rows[0].password_hash };
}

export async function findUserById(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows.length === 0 ? null : toUser(rows[0]);
}

export async function checkPassword(db, userId, plain) {
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) return false;
  return verifyPassword(plain, rows[0].password_hash);
}

// The ID comes from a sequence, so it's unique even when two admins add
// employees at once (the Java app used COUNT(*) + 1).
export async function createEmployee(db, { name, gender, salary, password, mustChangePassword = true }) {
  const passwordHash = await hashPassword(password);
  const { rows } = await db.query(
    `INSERT INTO users (username, name, gender, salary, role, password_hash, must_change_password)
     VALUES ('E' || nextval('employee_number_seq'), $1, $2, $3, 'employee', $4, $5)
     RETURNING ${COLUMNS}`,
    [name, gender, salary, passwordHash, mustChangePassword],
  );
  return toUser(rows[0]);
}

// Creates the admin account, or resets its password if it exists.
export async function upsertAdmin(db, { username, name = 'Administrator', password }) {
  const login = username.trim();
  if (/^e\d+$/i.test(login)) {
    throw new Error(`"${login}" looks like an employee ID (E1, E2, …); choose another admin username.`);
  }
  const passwordHash = await hashPassword(password);
  const existing = await findUserForLogin(db, login);
  if (existing) {
    const { rows } = await db.query(
      `UPDATE users SET password_hash = $2, must_change_password = false, password_version = password_version + 1
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [existing.id, passwordHash],
    );
    return { user: toUser(rows[0]), created: false };
  }
  const { rows } = await db.query(
    `INSERT INTO users (username, name, role, password_hash) VALUES ($1, $2, 'admin', $3) RETURNING ${COLUMNS}`,
    [login, name, passwordHash],
  );
  return { user: toUser(rows[0]), created: true };
}

// Returns the new password version; sessions holding an older one are logged out.
export async function changePassword(db, userId, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  const { rows } = await db.query(
    `UPDATE users SET password_hash = $2, must_change_password = false, password_version = password_version + 1
     WHERE id = $1 RETURNING password_version`,
    [userId, passwordHash],
  );
  return rows[0].password_version;
}
