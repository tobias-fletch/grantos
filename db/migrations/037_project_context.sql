BEGIN;
ALTER TABLE funding_projects ADD COLUMN context jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE funding_projects ADD CONSTRAINT funding_projects_context_object CHECK (jsonb_typeof(context) = 'object');
COMMENT ON COLUMN funding_projects.context IS 'Private, user-supplied writing and fit context. Not verified eligibility or externally transmitted.';
COMMIT;
