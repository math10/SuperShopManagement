-- Initial schema for SuperShopManagement (Node.js version).
-- Replaces the Java app's Oracle tables: employee, product, category, TRANSACTION.

-- Employee IDs are 'E' || nextval(...): numbers are never reused.
CREATE SEQUENCE employee_number_seq;

-- Admins and employees. The Java app hardcoded the admin (root/123456)
-- and stored employee passwords in plain text.
CREATE TABLE users (
  id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username             text NOT NULL,
  name                 text NOT NULL,
  gender               text CHECK (gender IN ('Male', 'Female', 'Other')),
  salary               integer CHECK (salary >= 0),
  role                 text NOT NULL CHECK (role IN ('admin', 'employee')),
  password_hash        text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_key ON users (lower(username));

CREATE TABLE categories (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE
);
INSERT INTO categories (name) VALUES ('Book'), ('Dress'), ('Food'), ('Laptop'), ('Mobile');

CREATE TABLE products (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id   integer NOT NULL REFERENCES categories (id),
  name          text NOT NULL CHECK (btrim(name) <> ''),
  cost_price    numeric(12, 2) NOT NULL CHECK (cost_price >= 0),
  selling_price numeric(12, 2) NOT NULL CHECK (selling_price >= 0),
  stock         integer NOT NULL CHECK (stock >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_category_name_key ON products (category_id, lower(name));

-- One row per bill. checkout_token makes a double-submitted bill a no-op.
CREATE TABLE sales (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cashier_id     integer NOT NULL REFERENCES users (id),
  checkout_token text NOT NULL UNIQUE,
  total          numeric(14, 2) NOT NULL DEFAULT 0,
  total_cost     numeric(14, 2) NOT NULL DEFAULT 0,
  profit         numeric(14, 2) GENERATED ALWAYS AS (total - total_cost) STORED,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_created_at_idx ON sales (created_at);

-- What was sold on each bill, with the name and prices as they were then.
CREATE TABLE sale_items (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sale_id      integer NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  product_id   integer NOT NULL REFERENCES products (id),
  product_name text NOT NULL,
  quantity     integer NOT NULL CHECK (quantity > 0),
  unit_price   numeric(12, 2) NOT NULL,
  unit_cost    numeric(12, 2) NOT NULL
);
CREATE INDEX sale_items_sale_id_idx ON sale_items (sale_id);

-- Login sessions (the table connect-pg-simple expects).
CREATE TABLE session (
  sid    varchar NOT NULL PRIMARY KEY,
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX session_expire_idx ON session (expire);
