import { randomUUID } from 'node:crypto';
import { withTransaction } from './db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The one-time token for a form's hidden "formToken" field. When a form is
// shown again after a validation error, the posted token is reused, so the
// corrected submission is still protected against a double-click. A request
// without a usable token (an old cached page, a script) gets a fresh one and
// simply runs once.
export function formToken(posted) {
  return typeof posted === 'string' && UUID.test(posted) ? posted.toLowerCase() : randomUUID();
}

// Runs action(client) inside a transaction at most once per token. The token
// is claimed in the same transaction: a second submit of the same form waits
// for the first, then gets its stored result instead of running the action again.
export async function oncePerForm(pool, token, action) {
  return withTransaction(pool, async (client) => {
    const { rowCount } = await client.query(
      'INSERT INTO form_submissions (token) VALUES ($1) ON CONFLICT (token) DO NOTHING',
      [token],
    );
    if (rowCount === 0) {
      const { rows } = await client.query('SELECT result FROM form_submissions WHERE token = $1', [token]);
      return { repeated: true, result: rows[0].result };
    }
    const result = await action(client);
    await client.query(
      'UPDATE form_submissions SET result = $2 WHERE token = $1',
      [token, JSON.stringify(result ?? null)],
    );
    return { repeated: false, result };
  });
}
