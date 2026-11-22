-- Forms that change data (add or update a product, add an employee) carry a
-- one-time token in a hidden field. A double-click or a resubmitted page sends
-- the same token again and gets the first submission's result instead of
-- applying the change twice (e.g. adding the same stock twice).
CREATE TABLE form_submissions (
  token        uuid PRIMARY KEY,
  result       jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
