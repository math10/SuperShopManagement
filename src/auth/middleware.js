import { findUserById } from '../users/users.js';
import { renderError } from '../web.js';

// Loads the logged-in user from the database on every request, so a changed
// role, a removed account or a changed password takes effect immediately.
export function loadUser(pool) {
  return async function loadUserMiddleware(req, res, next) {
    req.user = null;
    res.locals.user = null;
    if (req.session.userId !== undefined) {
      const user = await findUserById(pool, req.session.userId);
      if (user && user.passwordVersion === req.session.passwordVersion) {
        req.user = user;
        res.locals.user = user;
      } else {
        // The account is gone, or its password changed since this session logged in.
        delete req.session.userId;
        delete req.session.passwordVersion;
      }
    }
    next();
  };
}

export function requireLogin(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

export function requireRole(role) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user) return requireLogin(req, res, next);
    if (req.user.role !== role) return renderError(res, 403, "Your account can't open this page.");
    next();
  };
}

const OPEN_WHILE_PASSWORD_MUST_CHANGE = new Set(['/account/password', '/logout']);

// New employees must replace the temporary password the admin gave them
// before they can do anything else.
export function enforcePasswordChange(req, res, next) {
  if (req.user?.mustChangePassword && !OPEN_WHILE_PASSWORD_MUST_CHANGE.has(req.path)) {
    return res.redirect('/account/password');
  }
  next();
}
