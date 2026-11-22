import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { enforcePasswordChange, loadUser } from './auth/middleware.js';
import { authRouter, SESSION_COOKIE } from './auth/routes.js';
import { billingRouter } from './billing/routes.js';
import { productsRouter } from './products/routes.js';
import { reportsRouter } from './reports/routes.js';
import { usersRouter } from './users/routes.js';
import { crossOriginGuard, errorHandler, flash, notFound, rejectNulBytes } from './web.js';

const here = dirname(fileURLToPath(import.meta.url));
const EIGHT_HOURS = 8 * 60 * 60 * 1000;

export function createApp({
  pool,
  sessionStore,
  sessionSecret,
  cookieSecure = false,
  trustProxy = false,
  loginRateLimit = { windowMs: 15 * 60 * 1000, limit: 10 },
}) {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.set('view engine', 'ejs');
  app.set('views', join(here, 'views'));

  app.use(helmet({
    contentSecurityPolicy: {
      // Only ask browsers to upgrade to HTTPS when the app is served over HTTPS;
      // on a plain-HTTP shop network it would break the stylesheet and forms.
      directives: { upgradeInsecureRequests: cookieSecure ? [] : null },
    },
    // Helmet's default (no-referrer) makes browsers send "Origin: null" on our own
    // form posts. Over plain HTTP to a LAN address they also omit Sec-Fetch-Site,
    // so crossOriginGuard would block every login. same-origin keeps referrers
    // private from other sites but lets our own posts carry their real Origin.
    referrerPolicy: { policy: 'same-origin' },
  }));
  app.use(express.static(join(here, 'public')));
  app.use(crossOriginGuard);
  app.use(express.urlencoded({ extended: false }));
  app.use(rejectNulBytes);
  app.use(session({
    name: SESSION_COOKIE,
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: cookieSecure, maxAge: EIGHT_HOURS },
  }));
  app.use(flash);
  app.use(loadUser(pool));
  app.use(enforcePasswordChange);

  app.use(authRouter({ pool, loginRateLimit, cookieSecure }));
  app.use(productsRouter({ pool }));
  app.use(usersRouter({ pool }));
  app.use(billingRouter({ pool }));
  app.use(reportsRouter({ pool }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
