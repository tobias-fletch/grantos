BEGIN;
CREATE TABLE funding_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL, description text NOT NULL DEFAULT '', applicant_type text NOT NULL,
 country text NOT NULL, state text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '', postal_code text NOT NULL DEFAULT '',
 categories text[] NOT NULL DEFAULT '{}', amount numeric(14,2), target_date date,
 archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX funding_projects_workspace ON funding_projects(workspace_id,created_at);
COMMIT;
