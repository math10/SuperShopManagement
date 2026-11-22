// Web plumbing shared by every page: flash messages, cross-origin
// protection and error pages.

const HEADINGS = {
  400: 'Bad request',
  403: 'Access denied',
  404: 'Page not found',
  409: 'Conflict',
  413: 'Too much data',
  500: 'Something went wrong',
};

export function renderError(res, status, message) {
  const heading = HEADINGS[status] ?? 'Error';
  res.status(status).render('error', { title: heading, heading, message });
}

// req.flash(type, message) shows a one-time message on the next page.
export function flash(req, res, next) {
  res.locals.flash = req.session.flash ?? null;
  if (req.session.flash) delete req.session.flash;
  req.flash = (type, message) => {
    req.session.flash = { type, message };
  };
  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Blocks form posts that a browser sends from another website (CSRF).
// Modern browsers say where a request came from in Sec-Fetch-Site; older ones
// send Origin, which must match the Host. Requests with neither header come
// from non-browser clients, which can't carry a victim's cookies anyway.
export function crossOriginGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const site = req.get('sec-fetch-site');
  if (site !== undefined) {
    return site === 'same-origin' || site === 'none' ? next() : blocked(res);
  }
  const origin = req.get('origin');
  if (origin === undefined) return next();
  return hostOf(origin) === req.get('host') ? next() : blocked(res);
}

function hostOf(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

function blocked(res) {
  renderError(res, 403, 'This form was sent from another website, so it was blocked. Reload the page and try again.');
}

// PostgreSQL text columns can't store a NUL byte (it raises error 22021), so
// refuse any form field or query value containing one before it reaches a query.
export function rejectNulBytes(req, res, next) {
  if (containsNul(req.body) || containsNul(req.query)) {
    return renderError(res, 400, 'The form contained a character that is not allowed. Go back and retype it.');
  }
  next();
}

function containsNul(value) {
  if (typeof value === 'string') return value.includes('\u0000');
  if (value && typeof value === 'object') return Object.values(value).some(containsNul);
  return false;
}

// A new session ID (no session fixation); the caller fills in the new session.
export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

export function notFound(req, res) {
  renderError(res, 404, 'There is no page at this address.');
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status ?? err.statusCode;
  if (status >= 400 && status < 500) {
    return renderError(res, status, 'The request could not be read. Go back and try again.');
  }
  console.error(err);
  renderError(res, 500, 'The server hit an error. Try again, and tell the administrator if it keeps happening.');
}
