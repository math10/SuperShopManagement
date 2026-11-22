# SuperShopManagement Node.js Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Java Swing + Oracle SuperShopManagement app as an Express + PostgreSQL web app with the same roles and screens, with the original's bugs fixed.

**Architecture:**
- Server-rendered Express 5 app (EJS views), organised by feature (`auth`, `users`, `products`, `billing`, `reports`).
- Each feature has a data module (plain SQL through `pg`) and a routes module.
- `createApp({ pool, ... })` builds the app so tests can inject a pool. `src/server.js` is the only entry point that reads config and listens.

**Tech Stack:**
- Runtime: Node ≥ 20.12 (ESM), Express 5.3, pg 8, EJS 7, express-session 1.19 + connect-pg-simple 10, helmet 8, express-rate-limit 8.
- Dev and test: node:test, supertest 7, embedded-postgres 18.7.0-beta.19.

**Spec:** `docs/superpowers/specs/2026-11-21-nodejs-conversion-design.md`

## Global Constraints

- Node `>=20.12`; `"type": "module"`. Run with `export PATH="$HOME/.nvm/versions/node/v20.16.0/bin:$PATH"` (node is not on PATH by default).
- Every SQL statement is parameterised. No user input is ever concatenated into SQL.
- Money is `numeric` in PostgreSQL and all arithmetic happens in SQL. JS validates input with `^\d{1,10}(\.\d{1,2})?$` and passes strings through.
- A failed form validation returns 422 and re-renders the form with its messages and the entered values. Non-string or repeated fields count as invalid.
- Not logged in → 302 to `/login`. Wrong role → 403 error page. Unknown route → 404 page.
- No client-side JS. No CDN or external assets.
- UI text uses the original's labels with typos fixed ("Management", "Available", "Category", "Dress").
- Passwords are 8–200 characters and hashed with scrypt.
- No git commits unless the user asks. The workspace is not a git repo.
- Test command: `npm test` runs everything. `npm test -- test/<file>.test.js` runs one file. Both start a throwaway PostgreSQL unless `TEST_DATABASE_URL` is set.

## Review Focus

1. **Double-clicking "Make bill"** (or resubmitting): exactly one sale is created and stock goes down once. The second request lands on the same receipt. Test in Task 6.
2. **Two tills selling the last units at the same moment:** one succeeds and the other gets an out-of-stock message. Stock never goes negative. Test in Task 6.
3. **Product names with apostrophes, `<script>`, or Bangla text (`চাল`):** saved, billed and shown exactly as typed. No SQL error, no HTML injection. Tests in Tasks 4 and 6.
4. **Malformed numbers** (`1,000`, ` 5 `, `1e3`, `-0`, `12.345`, `99999999999`, repeated fields): a validation message, never a 500. Tests in Tasks 2 and 4–6.
5. **A cart left open while an admin changes a price or another till sells the stock:** the cart re-displays the current price and stock. Checkout charges the current price and refuses if stock is short. Test in Task 6.

---

### Task 1: Project scaffold, schema, and test harness

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`
- Create: `migrations/001_initial.sql`
- Create: `src/config.js`, `src/db.js`, `src/migrate.js`
- Create: `scripts/test.js`, `scripts/dev-db.js`, `scripts/migrate.js`
- Test: `test/helpers.js`, `test/schema.test.js`

**Interfaces:**
- Produces:
  - `loadConfig(env = process.env) → { port, databaseUrl, sessionSecret, cookieSecure, trustProxy, isProduction }`. It loads `.env` if present and throws if `DATABASE_URL` is missing, or if `SESSION_SECRET` is missing in production.
  - `createPool(databaseUrl) → pg.Pool`, with an `'error'` listener so idle-client errors don't crash the process.
  - `withTransaction(pool, async (client) => …) → result`: BEGIN, then COMMIT, or ROLLBACK and rethrow.
  - `migrate(pool, { dir?, log? }) → string[]`: names of the newly applied files.
  - `test/helpers.js`: `testPool()` and `resetDb(pool)`. `resetDb` truncates users, products, sales, sale_items and session with RESTART IDENTITY, and restarts `employee_number_seq` at 1.

- [ ] **Step 1: Write `test/schema.test.js`**
  - `migrations seed the five categories`: `select name from categories order by name` → `['Book','Dress','Food','Laptop','Mobile']`.
  - `migrate is idempotent`: a second `migrate(pool)` returns `[]`.
  - `stock cannot go negative`: inserting a product with stock −1 rejects with code `23514`.
  - `product names are unique per category ignoring case`: `Rice` then `rice` in Food rejects with `23505`. `Rice` in Book succeeds.
  - `employee numbers come from a sequence`: `select nextval('employee_number_seq')` → `'1'` after `resetDb`.
- [ ] **Step 2: Write `scripts/test.js`.** If `TEST_DATABASE_URL` is unset:
  1. Start embedded-postgres in a fresh `os.tmpdir()` folder on a free port.
  2. Create `supershop_test` and run `migrate`.
  3. Spawn `node --test --test-concurrency=1 <files or all test/*.test.js>` with `DATABASE_URL`, `NODE_ENV=test`.
  4. Stop the server, delete the folder, and exit with the child's exit code.
- [ ] **Step 3: Run `npm test -- test/schema.test.js`.** Expected: FAIL (no migration or `migrate`).
- [ ] **Step 4: Implement the config, db, migrate and migration files** following the spec's data model. `migrate` takes `pg_advisory_lock`, creates `schema_migrations`, and applies each pending file in its own transaction.
- [ ] **Step 5: Run `npm test -- test/schema.test.js`.** Expected: 5 pass.
- [ ] **Step 6: Write `scripts/dev-db.js` and `scripts/migrate.js`.**
  - `dev-db.js`: a persistent embedded server in `.pgdata/` on `DEV_DB_PORT` (default 5433). It creates `supershop` if missing, prints the `DATABASE_URL`, and stops on SIGINT/SIGTERM.
  - Check: run `npm run db:dev`, then `DATABASE_URL=… npm run migrate` prints `applied 001_initial.sql`. Stop it.

### Task 2: Passwords, validation helpers, user accounts

**Files:**
- Create: `src/lib/passwords.js`, `src/lib/validate.js`, `src/users/users.js`, `scripts/create-admin.js`
- Test: `test/validate.test.js`, `test/passwords.test.js`, `test/users.test.js`

**Interfaces:**
- Produces:
  - `hashPassword(plain) → Promise<string>`, format `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>` (N=32768, r=8, p=1, 64-byte key, maxmem 64 MiB).
  - `verifyPassword(plain, stored) → Promise<boolean>`: false for malformed `stored`.
  - `checkNewPassword(plain) → string | null`: an error message, or null when valid. Constants `MIN_PASSWORD_LENGTH = 8` and `MAX_PASSWORD_LENGTH = 200`.
  - `parseMoney(input) → string | null`, normalised to 2 decimals.
  - `parseWholeNumber(input, { min, max }) → number | null`: accepts `^-?\d+$` after trimming.
  - `cleanText(input, { maxLength }) → string | null`: trimmed; null when empty or too long.
  - User shape (camelCase): `{ id, username, name, role, gender, salary, mustChangePassword }`.
  - Users data functions, where `db` is a pool or client:
    - `findUserForLogin(db, username) → (user & { passwordHash }) | null`: trims, case-insensitive.
    - `findUserById(db, id) → user | null`.
    - `checkPassword(db, userId, plain) → boolean`.
    - `createEmployee(db, { name, gender, salary, password, mustChangePassword = true }) → user`.
    - `upsertAdmin(db, { username, name = 'Administrator', password }) → { user, created }`.
    - `changePassword(db, userId, newPassword) → void`: clears `must_change_password`.

- [ ] **Step 1: Write the tests.**
  - `parseMoney`: `'12'→'12.00'`, `'12.5'→'12.50'`, `' 7.25 '→'7.25'`, `'0'→'0.00'`, `'9999999999.99'` ok. These return null: `'-1'`, `'1,000'`, `'1e3'`, `'12.345'`, `'99999999999'`, `''`, `'.5'`, `['1','2']`, `undefined`.
  - `parseWholeNumber('5', {min:1,max:10})→5`. These return null: `'0'` with min 1, `'1.5'`, `'abc'`, `'11'` with max 10, `['1']`. `'-3'` with `{min:-5,max:5}` → −3.
  - `cleanText('  Rice  ', {maxLength:100})→'Rice'`. Null for `'   '` and for 101 characters.
  - Passwords: a hash verifies; a wrong password fails; two hashes of the same password differ; `verifyPassword('x','garbage')→false`. `checkNewPassword('short')` gives a message mentioning `8`.
  - `createEmployee` twice → usernames `E1`, `E2`, and `mustChangePassword` is true.
  - `findUserForLogin(pool,' e1 ')` finds `E1` and includes `passwordHash`. `findUserById` omits `passwordHash`.
  - `upsertAdmin` reports `created:true` the first time. The second call with a new password reports `created:false`, and only the new password verifies.
  - `changePassword` → `checkPassword` is true with the new password and false with the old one, and `mustChangePassword` is false.
- [ ] **Step 2: Run** `npm test -- test/validate.test.js test/passwords.test.js test/users.test.js`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement the three modules.**
- [ ] **Step 4: Re-run.** Expected: all pass.
- [ ] **Step 5: Implement `scripts/create-admin.js`.** It loads config, runs `migrate`, reads `ADMIN_USERNAME` (default `admin`), `ADMIN_PASSWORD` (validated by `checkNewPassword`) and `ADMIN_NAME`, calls `upsertAdmin`, and prints `Created admin "admin"` or `Reset password for admin "admin"`. Check it against the dev database.

### Task 3: Web shell — sessions, login/logout, menus, access control, security middleware

**Files:**
- Create: `src/app.js`, `src/server.js`, `src/sessionStore.js`, `src/web.js`, `src/auth/middleware.js`, `src/auth/routes.js`
- Create views: `src/views/partials/{header,footer,messages}.ejs`, `src/views/{login,home,error}.ejs`
- Create: `src/public/styles.css`
- Modify: `test/helpers.js`, adding `buildApp`, `addAdmin`, `addEmployee` and `login`
- Test: `test/auth.test.js`

**Interfaces:**
- Consumes: Task 1 `createPool` and `migrate`; Task 2 users functions and `verifyPassword`.
- Produces:
  - `createApp({ pool, sessionStore, sessionSecret, cookieSecure = false, trustProxy = false, loginRateLimit = { windowMs: 900000, limit: 10 } }) → express.Application`.
  - `createSessionStore(pool, { prune = true }) → Store`.
  - `src/web.js`:
    - `flash` middleware: `req.flash(type, message)`, exposed as `res.locals.flash` on the next render.
    - `crossOriginGuard`: rejects unsafe methods when `Sec-Fetch-Site` is not `same-origin`/`none`, or when the `Origin` host ≠ the `Host` header.
    - `notFound`.
    - `errorHandler`: logs the error and renders `error.ejs` with status 500.
    - `renderError(res, status, message)`.
  - `src/auth/middleware.js`:
    - `loadUser`: sets `req.user` and `res.locals.user` from `req.session.userId`. A stale id destroys the session.
    - `requireLogin`.
    - `requireRole(role)`: 403.
    - `enforcePasswordChange`: when `req.user.mustChangePassword`, redirects to `/account/password` for every path except that one and `/logout`.
  - `test/helpers.js`:
    - `buildApp(pool, overrides?)`: test session store with no pruning, `sessionSecret: 'test-secret'`, `loginRateLimit.limit: 1000`.
    - `addAdmin(pool, { username='admin', password='admin-pass-1' })`.
    - `addEmployee(pool, { name='Test Cashier', password='cashier-pass-1', mustChangePassword=false }) → user`.
    - `login(app, username, password) → supertest agent`: asserts a 302.
  - Views use `res.locals.user`, `flash` and `title`. The header nav is role-based and has a logout button (a POST form).

- [ ] **Step 1: Write `test/auth.test.js`.**
  - `redirects anonymous users to /login`: `GET /` → 302 to `/login`.
  - `admin sees the admin menu`: after login, `GET /` has 200 and contains `Product Management`, `Profit Calculation`, `Add Employee`, `Change Password`, but not `Billing`.
  - `employee sees the employee menu`: contains `Get Product Information`, `Billing`, `Change Password`, but not `Add Employee`.
  - `login is case-insensitive and trims`: `' e1 '` works.
  - `wrong password`: 401, contains `Wrong ID or password`.
  - `SQL injection in the ID fails safely`: `x' OR '1'='1` → 401.
  - `logout ends the session`: `POST /logout` → 302 to `/login`, then `GET /` → 302 to `/login`.
  - `session id changes at login`: the cookie before login ≠ the cookie after.
  - `cross-site POST rejected`: `POST /login` with `Sec-Fetch-Site: cross-site` → 403. `Origin: http://evil.example` → 403. `Sec-Fetch-Site: same-origin` passes.
  - `rate limit`: with `loginRateLimit {limit: 2}`, the 3rd failed login → 429 with `Too many`.
  - `security headers`: `x-content-type-options: nosniff` and a `content-security-policy` header are present.
  - `404 page`: `GET /nope` → 404, contains `Page not found`.
- [ ] **Step 2: Run** `npm test -- test/auth.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the files above.** `src/server.js`: loadConfig → createPool → migrate → createApp → listen, and on SIGTERM/SIGINT close the server and end the pool.
- [ ] **Step 4: Re-run.** Expected: all pass. Then run `npm test` for everything.

### Task 4: Products — list, add, edit

**Files:**
- Create: `src/products/products.js`, `src/products/routes.js`, `src/views/products/{index,new,edit}.ejs`
- Modify: `src/app.js` (mount the routes), `src/views/home.ejs` (links)
- Test: `test/products.test.js`

**Interfaces:**
- Consumes: `parseMoney`, `parseWholeNumber`, `cleanText`, `requireLogin`, `requireRole`, `renderError`, and helpers from Task 3.
- Produces:
  - `listCategories(db) → [{ id, name }]`, ordered by name.
  - `listProducts(db, { categoryId = null }) → [{ id, name, categoryId, categoryName, costPrice, sellingPrice, stock }]`, ordered by category then name; prices are strings.
  - `findProduct(db, id) → product | null`.
  - `createProduct(db, { categoryId, name, costPrice, sellingPrice, stock }) → product`: throws `DuplicateProductError` on 23505.
  - `updateProduct(db, id, { costPrice, sellingPrice, stockChange }) → product | null` (null = not found): throws `StockBelowZeroError` with `.currentStock`. It uses `stock = stock + $n … WHERE stock + $n >= 0`.
  - Test helper `addProduct(pool, { category='Food', name, costPrice='10.00', sellingPrice='15.00', stock=10 }) → product`.

- [ ] **Step 1: Write `test/products.test.js`.**
  - `both roles see the product list` (200, includes the product name, price `15.00`, stock).
  - `filter by category` (`?category=<Food id>` excludes a Book product).
  - `admin adds a product`: POST → 302 to `/products` with flash `Product added`, and the row exists.
  - `validation errors re-render with messages`: blank name, price `1,000`, stock `-1`, category `999` → 422, the messages are shown, and the typed name is kept.
  - `duplicate name in the same category` → 422, `already exists`.
  - `employee cannot add or edit` (403 for GET and POST).
  - `admin edits prices and adds stock`: stock 10 + `5` → 15, and prices are updated.
  - `negative stock change cannot go below zero`: 10 + `-11` → 422, `only 10 in stock`.
  - `edit unknown product` → 404.
  - `special characters`: `Lay's <b>Chips</b>` and `চাল` are added, and the list shows `Lay&#39;s &lt;b&gt;Chips&lt;/b&gt;` and `চাল`.
- [ ] **Step 2: Run** `npm test -- test/products.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Re-run.** Expected: all pass.

### Task 5: Employees and passwords

**Files:**
- Create: `src/users/routes.js`, `src/views/employees/new.ejs`, `src/views/account/password.ejs`
- Modify: `src/app.js`
- Test: `test/employees.test.js`

**Interfaces:**
- Consumes: Task 2 users functions and `checkNewPassword`; Task 3 middleware.
- Produces: routes `GET /employees/new`, `POST /employees` (admin), `GET/POST /account/password` (any logged-in user).

- [ ] **Step 1: Write `test/employees.test.js`.**
  - `admin adds employees with sequential IDs`: two posts → flashes contain `E1` then `E2`.
  - `employee validation`: blank name, gender `Robot`, salary `12.5`, short password → 422 with messages.
  - `employee cannot open Add Employee` (403).
  - `new employee must change password first`: login → `GET /billing` → 302 to `/account/password`.
  - `change password errors`: wrong current password → 422 `Current password is wrong`; mismatch → 422 `do not match`; too short → 422.
  - `change password works`: after the change, logout. The old password fails (401), the new one works, and `GET /` → 200.
  - `admin can change own password`.
- [ ] **Step 2: Run** `npm test -- test/employees.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Re-run.** Expected: all pass.

### Task 6: Billing — cart, checkout, receipt

**Files:**
- Create: `src/billing/cart.js`, `src/billing/sales.js`, `src/billing/routes.js`, `src/views/billing/{index,receipt}.ejs`
- Modify: `src/app.js`
- Test: `test/cart.test.js`, `test/billing.test.js`

**Interfaces:**
- Consumes: products functions (Task 4), `withTransaction` (Task 1), `parseWholeNumber`, middleware.
- Produces:
  - Cart helpers (pure; the cart is `[{ productId, quantity }]`):
    - `addToCart(cart, productId, quantity) → cart`: merges.
    - `removeFromCart(cart, productId) → cart`.
    - `quantityInCart(cart, productId) → number`.
  - `getCartLines(db, cart) → { lines: [{ productId, name, categoryName, unitPrice, quantity, lineTotal, stock }], total }`: prices and totals are SQL-computed strings; `total` is `'0.00'` when empty.
  - `checkout(pool, { cashierId, cart, checkoutToken }) → { saleId, duplicate: boolean }`: throws `EmptyCartError`, or `OutOfStockError` with `.productName` and `.available`. It also throws `BillTooLargeError` on numeric overflow (`22003`).
  - `findSaleByToken(db, token, cashierId) → saleId | null`.
  - `getSale(db, saleId) → { id, createdAt, cashierId, cashierName, cashierUsername, total, items: [{ productName, quantity, unitPrice, lineTotal }] } | null`.
  - The session holds `req.session.cart` and `req.session.cartToken` (`randomUUID()`, renewed on every add or remove, deleted on checkout or cancel).

- [ ] **Step 1: Write `test/cart.test.js`.** Merge on add, remove, `quantityInCart`, and inputs left unmodified (the helpers return new arrays).
- [ ] **Step 2: Write `test/billing.test.js`.**
  - `billing page groups products by category`: `<optgroup label="Food">`; an out-of-stock product's option is `disabled`.
  - `add to cart shows line and total`: 2 × 15.00 → `30.00`.
  - `stock check uses the chosen product and the quantity in the cart`: a product with stock 3; adding 2, then 2 → 422 `Only 3`; adding 1 → ok.
  - `quantity validation`: `0`, `-1`, `abc`, `1.5`, `['1','2']` → 422; product `999` → 422.
  - `remove line and cancel bill`.
  - `checkout updates each product's own stock` (the reversed-order bug): A stock 10 qty 2, B stock 20 qty 5 → A 8, B 15.
  - The same checkout saves the sale: `total` `55.00` (A 15.00 × 2 + B 5.00 × 5), the right `total_cost`, `profit`, and 2 `sale_items`. It redirects to `/sales/:id`, which shows the items and the total, and the cart is empty afterwards.
  - `empty cart cannot be billed` → 422 `empty`.
  - `30 different products on one bill` → checkout succeeds with 30 items.
  - `double submit creates one sale`: two parallel `POST /billing/checkout` requests with the same token from the same agent → both 302 to the same `/sales/:id`, there is exactly 1 row in `sales`, and stock went down once.
  - `stale token` → 409 `changed`.
  - `two tills cannot oversell`: stock 5, two employees each with a cart of 3, checkouts in parallel → one 302, one 422 `Only 2`, and stock is 2.
  - `cart reflects price and stock changes`: after adding, the admin changes the price to 20.00 → the page shows `20.00`. Another till buys the stock → checkout → 422 and nothing is saved.
  - `special characters on the bill` (`চাল`, `Lay's`) → the receipt shows them.
  - `admin cannot use billing` (403). `receipt visible to its cashier and admins, 403 for another employee`.
- [ ] **Step 3: Run** `npm test -- test/cart.test.js test/billing.test.js`. Expected: FAIL.
- [ ] **Step 4: Implement.** Checkout order inside `withTransaction`:
  1. Insert the sale with the token. On 23505, roll back and return the existing sale as `duplicate: true`.
  2. `SELECT … FOR UPDATE` the products, ordered by id.
  3. Check stock.
  4. Insert the items from `unnest($ids::int[], $qtys::int[])` joined to products.
  5. Decrement stock.
  6. Update the sale's totals from its items.
- [ ] **Step 5: Re-run.** Expected: all pass. Then run `npm test` for everything.

### Task 7: Profit report

**Files:**
- Create: `src/reports/reports.js`, `src/reports/routes.js`, `src/views/reports/profit.ejs`
- Modify: `src/app.js`
- Test: `test/reports.test.js`

**Interfaces:**
- Produces:
  - `PERIODS = { all: { label: 'All time', days: null }, week: { label: 'Past 1 week', days: 7 }, month: { label: 'Past 1 month', days: 30 }, year: { label: 'Past 1 year', days: 365 } }`.
  - `salesSummary(db, periodKey) → { salesCount: number, revenue: string, profit: string }`, with `'0.00'` when there are no sales.

- [ ] **Step 1: Write `test/reports.test.js`.** Insert sales directly, backdated to 1, 10, 100 and 400 days ago, with profits 1.00, 2.00, 3.00 and 4.00. Expected counts and profits: `week` → 1 / `1.00`, `month` → 2 / `3.00`, `year` → 3 / `6.00`, `all` → 4 / `10.00`. Also:
  - revenue is shown;
  - `?period=bogus` → All time;
  - with no sales → `0` and `0.00`;
  - an employee → 403.
- [ ] **Step 2: Run** `npm test -- test/reports.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Filter with `created_at >= now() - make_interval(days => $1)` when `days` is set.
- [ ] **Step 4: Re-run.** Expected: all pass.

### Task 8: README and end-to-end check

**Files:**
- Create: `README.md`. Sections:
  - what it is;
  - quick start (`npm install`, `npm run db:dev`, `.env`, `npm run create-admin`, `npm start`);
  - configuration table;
  - scripts;
  - what changed from the Java version (screen map and fixed bugs);
  - follow-ups.

- [ ] **Step 1: Run `npm test`.** Expected: every test passes, 0 failures.
- [ ] **Step 2: Start the dev database and the app, then walk the main flow.** Create an admin, log in as admin, add a product, add an employee, log in as the employee, change the password, make a bill, then log in as admin and check the profit report. Expected: each step returns the page described in the spec.
- [ ] **Step 3: Write the README** with the commands exactly as verified in Step 2.
