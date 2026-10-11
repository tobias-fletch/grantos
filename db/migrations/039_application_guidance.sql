BEGIN;
-- Human-reviewed application facts are append-only. Retraction is explicit and
-- does not erase the provenance of requirements already copied into private work.
CREATE TABLE opportunity_application_guidance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 opportunity_id uuid NOT NULL REFERENCES opportunities(id),
 field text NOT NULL CHECK(field IN ('application_url','eligibility','document','step','deadline','fee','match','question','criterion')),
 value text NOT NULL CHECK(length(value) BETWEEN 1 AND 3000),
 snapshot_id uuid NOT NULL REFERENCES crawl_snapshots(id),
 source_url text NOT NULL, source_excerpt text NOT NULL,
 source_section text NOT NULL DEFAULT '', applicant_scope text NOT NULL DEFAULT '',
 cycle text, period_end date,
 verified_at timestamptz NOT NULL DEFAULT now(), reviewed_by uuid NOT NULL REFERENCES users(id),
 revoked_at timestamptz
);
CREATE INDEX application_guidance_program ON opportunity_application_guidance(opportunity_id) WHERE revoked_at IS NULL;
CREATE TABLE application_guidance_imports (
 application_id uuid PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
 guidance jsonb NOT NULL CHECK(jsonb_typeof(guidance)='object'),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE application_preparation ADD COLUMN source_provenance jsonb;
ALTER TABLE grant_tasks ADD COLUMN source_provenance jsonb;
CREATE FUNCTION preserve_application_guidance_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='opportunity_application_guidance' THEN
  IF (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') THEN RAISE EXCEPTION 'Guidance evidence is immutable; record a new review'; END IF;
 ELSIF TG_TABLE_NAME='application_guidance_imports' THEN
  RAISE EXCEPTION 'Imported guidance is immutable';
 ELSIF OLD.source_provenance IS NOT NULL AND NEW.source_provenance IS DISTINCT FROM OLD.source_provenance THEN
  RAISE EXCEPTION 'Copied source provenance is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guidance_review_evidence BEFORE UPDATE ON opportunity_application_guidance FOR EACH ROW EXECUTE FUNCTION preserve_application_guidance_provenance();
CREATE TRIGGER guidance_import_evidence BEFORE UPDATE ON application_guidance_imports FOR EACH ROW EXECUTE FUNCTION preserve_application_guidance_provenance();
CREATE TRIGGER preparation_source_evidence BEFORE UPDATE ON application_preparation FOR EACH ROW EXECUTE FUNCTION preserve_application_guidance_provenance();
CREATE TRIGGER task_source_evidence BEFORE UPDATE ON grant_tasks FOR EACH ROW EXECUTE FUNCTION preserve_application_guidance_provenance();
COMMIT;
