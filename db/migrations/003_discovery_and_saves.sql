BEGIN;
ALTER TABLE opportunities ADD COLUMN summary text NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN eligibility_notes text NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN deadline_notes text NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN application_status text NOT NULL DEFAULT 'unannounced'
  CHECK (application_status IN ('open','upcoming','closed','unannounced'));
ALTER TABLE opportunities ADD COLUMN currency text NOT NULL DEFAULT 'USD';
CREATE TABLE saved_opportunities (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  saved_by uuid NOT NULL REFERENCES users(id),
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, opportunity_id)
);
CREATE INDEX idx_saved_workspace_date ON saved_opportunities(workspace_id, saved_at DESC);
CREATE INDEX idx_opportunity_categories_category ON opportunity_categories(category, opportunity_id);
CREATE INDEX idx_opportunity_applicant_type ON opportunity_applicant_types(applicant_type, opportunity_id);
COMMIT;
