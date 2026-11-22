# Super Shop Management

A point-of-sale and stock app for a super shop, as a web app on Node.js (Express) and PostgreSQL.

- **Admin:** manage products (add, change prices, restock), add employees, see the profit report.
- **Employee (cashier):** look up products, make bills, change their password.

The pages are rendered on the server and work without client-side JavaScript or internet access, so the app runs on an offline shop network.

## Quick start

You need Node.js 20.12 or newer (use 22 or 24 LTS; 20 is past end-of-life). You don't need PostgreSQL installed: `npm run db:dev` runs one locally.

```bash
npm install
cp .env.example .env    # then set SESSION_SECRET and ADMIN_PASSWORD in .env
npm run db:dev          # terminal 1: local PostgreSQL on port 5433 (skip if you have your own)
npm run create-admin    # terminal 2: creates the admin account from .env
npm start               # http://localhost:3000
```

Log in as `admin` with the password from `.env`.

### First steps in the app

1. **Products → Add product.** Add what the shop sells. Categories start as Book, Dress, Food, Laptop and Mobile.
2. **Add Employee.** Enter name, gender, salary and a temporary password. The app gives the new employee an ID (E1, E2, …); tell them the ID and the temporary password.
3. The employee logs in, must choose their own password, and can then use **Billing**: pick products, press **Make Bill**, and get a receipt.
4. **Profit** shows the number of bills, total sales and profit for all time, the past week, month or year.

## Configuration

Set these in `.env` (see `.env.example`) or in the environment. Real environment variables take precedence over `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `SESSION_SECRET` | random per start (dev only) | Signs login cookies. **Required when `NODE_ENV=production`.** |
| `PORT` | `3000` | HTTP port |
| `COOKIE_SECURE` | `false` | Set `true` when the app is served over HTTPS. It also tells browsers to upgrade requests to HTTPS. |
| `TRUST_PROXY` | off | Set when running behind a reverse proxy: `true`, a hop count such as `1`, or an address list |
| `ADMIN_USERNAME` | `admin` | Used by `npm run create-admin` |
| `ADMIN_PASSWORD` | (none) | Used by `npm run create-admin` (8–200 characters) |
| `ADMIN_NAME` | `Administrator` | Used by `npm run create-admin` |
| `DEV_DB_PORT` | `5433` | Port for `npm run db:dev` |

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Applies pending database migrations, then starts the server |
| `npm run dev` | Same, restarting when files change |
| `npm run migrate` | Applies pending migrations only |
| `npm run create-admin` | Creates the admin account, or resets its password if it exists (this is how to recover a forgotten admin password) |
| `npm run db:dev` | Runs a local PostgreSQL with its data in `.pgdata/`. Press Ctrl+C to stop it. |
| `npm test` | Runs the test suite against a throwaway PostgreSQL that it starts and deletes |

`npm test` needs nothing installed besides Node. To run the tests against a PostgreSQL you already have, set `TEST_DATABASE_URL`. **The tests empty that database.**

## Running it for a shop

- Use a real PostgreSQL server (`npm run db:dev` is for development). Set `NODE_ENV=production`, a long random `SESSION_SECRET`, and `DATABASE_URL`.
- Every till only needs a browser pointed at the server, for example `http://shop-server:3000`.
- **Over HTTPS** (recommended), set `COOKIE_SECURE=true`. Logins then work only over HTTPS. If someone opens the app over plain HTTP, the login page explains this instead of quietly failing.
- **Behind nginx or another proxy** that handles HTTPS, set `TRUST_PROXY=1` (the number of proxies in front) and pass these headers:

  ```nginx
  proxy_set_header Host              $http_host;   # keeps the port; the cross-site check compares it
  proxy_set_header X-Forwarded-Proto $scheme;      # tells the app the browser used HTTPS
  proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
  ```

  Without `X-Forwarded-Proto`, the app can't tell that the browser used HTTPS, so with `COOKIE_SECURE=true` logins are refused.
- Back up the database with `pg_dump`. Sessions are stored in it too, so restarting the server doesn't log anyone out.

## Project layout

```
migrations/          SQL migrations, applied in file-name order
scripts/             create-admin, migrate, dev-db, test runner
src/
  server.js          entry point (npm start)
  app.js             Express app: security headers, sessions, routes
  auth/              login, logout, main menu, access checks
  users/             employees and passwords
  products/          product list, add, update
  billing/           bill (cart), checkout, receipts
  reports/           profit report
  lib/               input validation, password hashing
  views/             EJS templates
  public/            styles.css
test/                node:test + supertest, against real PostgreSQL
```

## Changes from the Java version

The original Java Swing + Oracle desktop app is kept in the `legacy-java` branch.

### Screens

| Java window | Web page |
|---|---|
| `ShopManagment` (login) | `/login` |
| `AdminPage`, `MainPage` (menus) | `/` (the menu depends on who logged in) |
| `ProductManagemnt`, `GetProductInformation` | `/products`: one table with a category filter. Admins also get "Add product" and "Edit". |
| `AddProduct` | `/products/new` |
| `UpdateProduct` | `/products/:id/edit`: change prices and add stock (a negative number removes stock) |
| `BillingPage` | `/billing`, then a receipt at `/sales/:id` |
| `ProfitCalculation` | `/reports/profit` |
| `AddEmployee` | `/employees/new` |
| `ChangePassword` | `/account/password` (admins can use it now too) |

### Bugs fixed

1. **Stock went to the wrong products.** On a bill with two or more products, the new stock counts were saved in reverse order, so products swapped counts. Stock is now reduced per product inside one database transaction.
2. **The billing stock check used the wrong product.** It checked the first product in the category, not the one selected. It now uses the selected product, including what is already on the bill.
3. **The bill had 25 fixed rows,** and a 26th item crashed it. There is no limit now.
4. **Two tills could overwrite each other's stock.** Rows are now locked while a bill is saved, so stock can't be oversold and never goes negative.
5. **SQL injection.** Every query was built from what users typed, so anyone could log in without a password. All queries now use parameters.
6. **Credentials.**
   - The admin login (`root`/`123456`) and the database password were written into the code. The admin is now a database account created with `npm run create-admin`, and settings come from the environment.
   - Passwords were stored as plain text, and a new employee's first password was their ID. Passwords are now hashed with scrypt, the admin sets a temporary password, and the employee must change it at first login.
7. **Bad input.**
   - Billing took zero or negative quantities, and a non-numeric quantity threw an error.
   - An empty bill could be saved.
   - Every form now validates its input and explains what's wrong.
8. **Repeated "Make Bill".** Pressing it twice (or resubmitting) can't create two bills; it shows the first bill's receipt.
9. **Leaks and duplicates.**
   - Every window opened a database connection and never closed it. The app now uses one connection pool.
   - Employee IDs were computed as count + 1 with no unique key. They now come from a database sequence.
10. **Typos:** "Managment", "Avaiable", "Catagory" and the "Drass" category are fixed.

### Other changes

- Each bill now also saves **what was sold** (items, prices and cost at the time), not just the profit. The profit report also shows total sales.
- The admin can change their password, and everyone can log out.
- **Double clicks are safe.** Make Bill, Add product, Update and Add Employee each apply once, and both clicks see the same result.
- **Password changes end other sessions.** Changing a password, or resetting the admin's with `npm run create-admin`, logs that account out everywhere else.
- **Not imported:** data from an existing Oracle database. Employee passwords there are plain text and bills have no items, so importing would need a one-off script.

### Not included yet

Editing or removing employees, an employee list, adding categories, renaming products or moving them to another category, deleting products, returns and refunds, multiple branches, barcode scanners and receipt printers. Browsers can print receipts with Ctrl+P.
