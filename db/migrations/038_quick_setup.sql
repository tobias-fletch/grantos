BEGIN;

ALTER TABLE profiles
  ADD COLUMN quick_setup_project_id uuid,
  ADD COLUMN quick_setup_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT profiles_quick_setup_draft_object CHECK (jsonb_typeof(quick_setup_draft) = 'object'),
  ADD CONSTRAINT profiles_quick_setup_project_workspace
    FOREIGN KEY (quick_setup_project_id, workspace_id) REFERENCES funding_projects(id, workspace_id);

COMMENT ON COLUMN profiles.quick_setup_draft IS 'Private, resumable first-setup project inputs; never transmitted to discovery providers.';
COMMENT ON COLUMN profiles.quick_setup_project_id IS 'The project created by first setup. Repeated setup submissions never overwrite it.';

COMMIT;
