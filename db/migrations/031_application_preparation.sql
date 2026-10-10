BEGIN;
ALTER TABLE funding_projects ADD CONSTRAINT funding_projects_workspace_identity UNIQUE(id,workspace_id);
ALTER TABLE applications ADD COLUMN project_id uuid;
ALTER TABLE applications ADD CONSTRAINT application_private_project FOREIGN KEY(project_id,workspace_id) REFERENCES funding_projects(id,workspace_id);
CREATE TABLE application_preparation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('eligibility','question','budget')), data jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX application_preparation_parent ON application_preparation(application_id,kind);
COMMIT;
