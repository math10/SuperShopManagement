# SuperShopManagement → Node.js: design

## Intent

Rebuild the 2015 Java Swing + Oracle desktop app ([math10/SuperShopManagement](https://github.com/math10/SuperShopManagement)) as a web app on Node.js with Express and PostgreSQL. It keeps the same two roles, the same screens and the same workflows, and fixes the original's bugs and security holes. Stack chosen by the user on 2026-11-21: web app, Express, PostgreSQL.

## Scope rule

**In:** every feature of the original, plus only:

1. what a web app needs in order to work: sessions, logout, navigation, confirmation and error messages;
2. fixes for the original's bugs and security holes (listed below);
3. saving each bill's line items. The original saved only a timestamp and the profit, so nobody could see what was sold.

**Out (follow-ups, not built):** editing or deleting employees, an employee list, managing categories, renaming or recategorising products, deleting products, returns, multiple branches, barcode scanning, printer integration, translations.

**Anti-goals:**
- anything that can make stock counts wrong;
- needing internet access at runtime. A shop LAN may be offline, so there are no CDN assets.

## Screens: original → new

| Java window | Who | New route |
|---|---|---|
| `ShopManagment` (login) | all | `GET/POST /login`, `POST /logout` |
| `AdminPage` / `MainPage` (menus) | admin / employee | `GET /` (menu depends on role) |
| `ProductManagemnt` (menu) | admin | merged into `/products` (list with "Add product" and per-row "Edit") |
| `GetProductInformation` | both | `GET /products?category=<id>`: a table, not two dropdowns |
| `AddProduct` | admin | `GET /products/new`, `POST /products` |
| `UpdateProduct` | admin | `GET /products/:id/edit`, `POST /products/:id` |
| `BillingPage` | employee | `GET /billing`, `POST /billing/items`, `POST /billing/items/:productId/remove`, `POST /billing/cancel`, `POST /billing/checkout`; receipt at `GET /sales/:id` |
| `ProfitCalculation` | admin | `GET /reports/profit?period=all\|week\|month\|year` |
| `AddEmployee` | admin | `GET /employees/new`, `POST /employees` |
| `ChangePassword` | employee (now admin too) | `GET/POST /account/password` |

UI text keeps the original labels with the typos fixed: "Management", "Available", "Category". The seeded category "Drass" becomes "Dress".

## Data model (PostgreSQL)

- `users`: id, username (unique, case-insensitive), name, gender (`Male`/`Female`/`Other`, null for admins), salary (integer ≥ 0, null for admins), role (`admin`/`employee`), password_hash, must_change_password, created_at. Employee usernames are `'E' || nextval('employee_number_seq')`, so a number is never reused.
- `categories`: id, name (unique). Seeded with Book, Dress, Food, Laptop, Mobile.
- `products`: id, category_id, name, cost_price and selling_price (`numeric(12,2)`, ≥ 0), stock (integer ≥ 0, enforced by a CHECK), timestamps. Name is unique per category, ignoring case.
- `sales`: id, cashier_id, checkout_token (unique), total and total_cost (`numeric(14,2)`), profit (generated as total − total_cost), created_at.
- `sale_items`: sale_id, product_id, product_name (snapshot), quantity > 0, unit_price, unit_cost (both snapshots).
- `session`: the connect-pg-simple table.
- `schema_migrations`: names of the migrations already applied.
- Added after the final review:
  - `form_submissions` (migration 002): token (uuid primary key), result (jsonb), submitted_at. It stores the one-time tokens that protect data-changing forms against double submits.
  - `users.password_version` (migration 003): raised on every password change or admin reset.

## Behaviour decisions

- **Login:** the ID is trimmed and matched case-insensitively. Any failure shows "Wrong ID or password" with status 401. Failed attempts are rate-limited per IP (default 10 per 15 minutes). The session is regenerated at login. Logout destroys the session.
- **Admin account:** lives in the database and is created or reset with `npm run create-admin` (`ADMIN_USERNAME`, default `admin`, and `ADMIN_PASSWORD`). This replaces the hardcoded `root` / `123456`.
- **Employees:** the admin enters name, gender, salary and a temporary password. The employee must change it at first login: every page except the change-password page and logout redirects there. This replaces "initial password = ID".
- **Passwords:** scrypt from `node:crypto`, with a per-password salt and the parameters stored in the hash string. Length 8–200 characters.
- **Billing:**
  - One product picker, grouped by category with `<optgroup>`, showing price and stock. Out-of-stock products are disabled.
  - Adding a product already in the cart adds to its quantity.
  - The stock check includes the quantity already in the cart.
  - The cashier can remove a line or cancel the whole bill.
  - The cart lives in the session as `[{ productId, quantity }]` and is re-read from the database on every render, so price and stock are always current.
  - Every change to the cart issues a new `cartToken`, which goes into the form.
  - **Checkout runs in one transaction:**
    1. Insert the sale with the posted token. The unique index makes a double submit wait for the first, then fail and redirect to the first one's receipt.
    2. Lock the product rows in id order.
    3. Verify stock.
    4. Insert the items.
    5. Decrement stock relative to the current value (`stock = stock - qty`).
    6. Set the totals.
  - If any product is short, nothing is saved and the cashier sees the product and how many are left.
  - A token that doesn't match the session's means the bill changed in another window. The response is 409 and the bill is shown again.
  - **After a successful checkout:** the cart is cleared and the receipt page opens. The cashier who made the sale and admins can view it.
- **Update product:** change the cost and selling price, and add to stock. A negative number removes stock, but the result can't go below 0. Name and category are fixed, as in the original.
- **Profit report:** periods are All time, Past 1 week (7 days), Past 1 month (30 days) and Past 1 year (365 days). It shows the number of bills, revenue and profit. An unknown period falls back to All time.
- **Money:**
  - The database stores `numeric`, and all arithmetic happens in SQL.
  - JS only validates input with `^\d{1,10}(\.\d{1,2})?$` and normalises it to 2 decimals. Commas, signs and exponents are rejected.
  - Values are displayed exactly as PostgreSQL returns them (2 decimals).
- **Validation:** a failed form re-renders with its messages and the entered values, status 422. Repeated or non-string fields count as invalid, never a 500.
- **Access:** not logged in → redirect to `/login`. Wrong role → 403 page. Billing is employee-only, and products management and reports are admin-only, as in the original.
- **Security:**
  - Parameterised SQL only.
  - Sessions are stored in PostgreSQL. The cookie is httpOnly and SameSite=Lax, and it is Secure when `COOKIE_SECURE=true`.
  - Cross-origin POSTs are rejected (`Sec-Fetch-Site`, falling back to an `Origin` host check).
  - Helmet sets the security headers, and EJS escapes all output.
  - Secrets come only from the environment.
- **Migrations:** plain `.sql` files in `migrations/`, applied in name order, each inside its own transaction, under an advisory lock. They run on `npm start` and on `npm run migrate`.

### Added after the final review

- **Referrer-Policy is `same-origin`.** Helmet's default, `no-referrer`, makes browsers send `Origin: null` on the app's own form posts. Over plain HTTP to a LAN address, browsers also omit `Sec-Fetch-Site`, so the cross-origin guard blocked every login. `same-origin` keeps referrers private from other sites and restores the real `Origin`. `Origin: null` is still refused.
- **Double submits.** Add product, Update product and Add Employee carry a one-time `formToken`. The token is claimed in `form_submissions` in the same transaction as the change. A repeat of the same token gets the first submission's result and changes nothing. A request without a usable token gets a fresh one and runs once.
- **Password changes end other sessions.** Each session records the account's `password_version`. A session holding an older version is logged out on its next request. The session that changed the password continues under a new session ID.
- **NUL bytes.** Any form field or query value containing a NUL byte gets a 400, because PostgreSQL text can't hold it and it used to cause a 500.
- **`COOKIE_SECURE` on a non-HTTPS request.** The login page explains that logins need HTTPS and refuses the post with a 400 instead of silently failing. This usually means a proxy that doesn't send `X-Forwarded-Proto`.

## Bugs in the original that this fixes

1. On a bill with two or more products, the stock values were bound in reverse order, so products swapped stock counts (`BillingPage.java:357-366`).
2. The "Available" label and the stock check followed the category dropdown, not the selected product (`BillingPage` has no listener on the product dropdown).
3. The bill table had a fixed 25 rows, so the 26th item crashed it.
4. Stock was written as an absolute value computed when the screen opened, so two tills overwrote each other.
5. SQL was built from user input everywhere, so anyone could log in without a password (`ShopManagment.java:225`).
6. The admin login (`root`/`123456`) and the database login were hardcoded, and passwords were stored as plain text.
7. Negative or zero quantities were accepted at billing. Non-numeric quantities threw from the input check.
8. An empty bill could be made and counted as a transaction.
9. Every window opened a database connection and never closed it.
10. Employee IDs were count + 1 with no unique key.
11. Smaller items: typos, the read-only product screen used editable fields, and change-password errors were written into the password boxes.

## Constraints

- Node ≥ 20.12, ESM. Tested on 20.16. Node 20 is past end-of-life, so production should use 22 or 24 LTS.
- Express 5, `pg` without an ORM, EJS, express-session with connect-pg-simple, helmet, express-rate-limit.
- Tests use `node:test` and supertest against a real PostgreSQL.
- The dev machine has no PostgreSQL, Docker or root access. The `embedded-postgres` devDependency powers `npm run db:dev` (a persistent local server) and `npm test` (a throwaway server, unless `TEST_DATABASE_URL` is set).
- No client-side JavaScript is required.

## Left to the builder

Visual design: plain, readable CSS that works on a till tablet. Also file-level structure and naming beyond what the plan fixes.
