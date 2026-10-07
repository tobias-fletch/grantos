CREATE TABLE email_deliveries (
 token_id text PRIMARY KEY,
 status text NOT NULL CHECK(status IN ('attempted','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
