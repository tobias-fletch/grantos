BEGIN;
ALTER TABLE workspaces ADD COLUMN plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','paid'));
CREATE TABLE checklist_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 requested_by uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','draft','confirmed','failed')),
 draft jsonb, sources jsonb NOT NULL DEFAULT '[]', warnings jsonb NOT NULL DEFAULT '[]', error text,
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
 confirmed_at timestamptz, confirmed_by uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX checklist_one_active ON checklist_jobs(workspace_id,opportunity_id) WHERE status IN ('queued','running');
CREATE INDEX checklist_workspace_date ON checklist_jobs(workspace_id,created_at DESC);
CREATE TABLE grant_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000), due_date date,
 completed_at timestamptz, deleted_at timestamptz, source_url text, source_excerpt text, uncertainty text,
 generation_id uuid REFERENCES checklist_jobs(id), created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_workspace_grant ON grant_tasks(workspace_id,opportunity_id) WHERE deleted_at IS NULL;
COMMIT;
