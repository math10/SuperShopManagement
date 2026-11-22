import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';

const PgStore = connectPgSimple(session);

// Sessions live in PostgreSQL (the `session` table from the first migration),
// so logins survive a server restart.
export function createSessionStore(pool, { prune = true } = {}) {
  return new PgStore({
    pool,
    tableName: 'session',
    pruneSessionInterval: prune ? 15 * 60 : false, // seconds
  });
}
