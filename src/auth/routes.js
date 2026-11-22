import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { findUserForLogin } from '../users/users.js';
import { regenerateSession } from '../web.js';
import { requireLogin } from './middleware.js';

export const SESSION_COOKIE = 'ssm.sid';
const WRONG_LOGIN = 'Wrong ID or password.';
const NEEDS_HTTPS = 'This server accepts logins only over HTTPS (COOKIE_SECURE is on), but this page was not '
  + 'loaded over HTTPS. Open it with https://. If it already is, the proxy in front of the app must send '
  + 'X-Forwarded-Proto and TRUST_PROXY must be set.';

// Checked when the ID doesn't exist, so an unknown ID takes as long to refuse
// as a wrong password and doesn't reveal which IDs exist.
let decoyHash;

export function authRouter({ pool, loginRateLimit, cookieSecure }) {
  const router = Router();

  // With a Secure cookie on a non-HTTPS request the browser drops the cookie and
  // the user silently lands back here; say why instead.
  const insecure = (req) => cookieSecure && !req.secure;

  const limitFailedLogins = rateLimit({
    windowMs: loginRateLimit.windowMs,
    limit: loginRateLimit.limit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).render('login', {
        title: 'Log in',
        username: '',
        errors: ['Too many failed attempts. Wait a few minutes and try again.'],
      });
    },
  });

  router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('login', { title: 'Log in', username: '', errors: insecure(req) ? [NEEDS_HTTPS] : [] });
  });

  router.post('/login', (req, res, next) => {
    if (!insecure(req)) return next();
    res.status(400).render('login', { title: 'Log in', username: asText(req.body?.username), errors: [NEEDS_HTTPS] });
  }, limitFailedLogins, async (req, res) => {
    const username = asText(req.body?.username);
    const password = asText(req.body?.password);
    const user = await findUserForLogin(pool, username);
    decoyHash ??= await hashPassword('decoy-password-never-matches');
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? decoyHash);
    if (!user || !passwordOk) {
      return res.status(401).render('login', { title: 'Log in', username, errors: [WRONG_LOGIN] });
    }

    const returnTo = localPath(req.session.returnTo);
    await regenerateSession(req); // new session ID at login (no session fixation)
    req.session.userId = user.id;
    req.session.passwordVersion = user.passwordVersion;
    res.redirect(returnTo);
  });

  router.post('/logout', async (req, res) => {
    await destroySession(req);
    res.clearCookie(SESSION_COOKIE);
    res.redirect('/login');
  });

  router.get('/', requireLogin, (req, res) => {
    res.render('home', { title: 'Main page' });
  });

  return router;
}

function asText(value) {
  return typeof value === 'string' ? value : '';
}

// Only redirect to paths on this site ("//evil.example" is another site).
function localPath(value) {
  const ok = typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\');
  return ok ? value : '/';
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}
