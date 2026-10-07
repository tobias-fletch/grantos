BEGIN;
CREATE TABLE applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL, candidate_id uuid REFERENCES crawl_candidates(id) ON DELETE SET NULL,
 title text NOT NULL, source_url text NOT NULL, source_excerpt text NOT NULL DEFAULT '', source_fetched_at timestamptz,
 stage text NOT NULL DEFAULT 'saved' CHECK(stage IN ('saved','preparing','submitted','awarded','declined','withdrawn')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=20000), target_date date, submitted_date date,
 requested_amount numeric(14,2) CHECK(requested_amount>=0), awarded_amount numeric(14,2) CHECK(awarded_amount>=0),
 archived_at timestamptz, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,source_url)
);
CREATE INDEX applications_workspace_grant ON applications(workspace_id,opportunity_id);
CREATE TABLE application_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES users(id), event text NOT NULL, previous_stage text, stage text, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO applications(workspace_id,opportunity_id,title,source_url,source_fetched_at,created_by,created_at)
 SELECT s.workspace_id,o.id,o.name,rtrim(o.source_url,'/'),o.source_fetched_at,s.saved_by,s.saved_at FROM saved_opportunities s JOIN opportunities o ON o.id=s.opportunity_id ON CONFLICT DO NOTHING;
INSERT INTO application_history(application_id,actor_id,event,stage) SELECT id,created_by,'Saved','saved' FROM applications;
ALTER TABLE grant_tasks ALTER COLUMN opportunity_id DROP NOT NULL;
ALTER TABLE grant_tasks ADD COLUMN application_id uuid REFERENCES applications(id);
UPDATE grant_tasks t SET application_id=a.id FROM applications a WHERE a.workspace_id=t.workspace_id AND a.opportunity_id=t.opportunity_id;
ALTER TABLE grant_tasks ADD CONSTRAINT task_parent CHECK(opportunity_id IS NOT NULL OR application_id IS NOT NULL);
CREATE FUNCTION track_saved_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE app_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text,9010));
 SELECT id INTO app_id FROM applications WHERE workspace_id=NEW.workspace_id AND opportunity_id=NEW.opportunity_id ORDER BY created_at LIMIT 1;
 IF app_id IS NULL THEN
 INSERT INTO applications(workspace_id,opportunity_id,title,source_url,source_fetched_at,created_by)
 SELECT NEW.workspace_id,o.id,o.name,rtrim(o.source_url,'/'),o.source_fetched_at,NEW.saved_by FROM opportunities o WHERE o.id=NEW.opportunity_id
 ON CONFLICT(workspace_id,source_url) DO UPDATE SET opportunity_id=excluded.opportunity_id RETURNING id INTO app_id;
 INSERT INTO application_history(application_id,actor_id,event,stage) VALUES(app_id,NEW.saved_by,'Saved','saved');
 END IF;
 UPDATE grant_tasks SET application_id=app_id WHERE workspace_id=NEW.workspace_id AND opportunity_id=NEW.opportunity_id AND application_id IS NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER saved_application AFTER INSERT ON saved_opportunities FOR EACH ROW EXECUTE FUNCTION track_saved_application();
CREATE FUNCTION attach_application_task() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.application_id IS NULL THEN
 SELECT id INTO NEW.application_id FROM applications WHERE workspace_id=NEW.workspace_id AND opportunity_id=NEW.opportunity_id ORDER BY created_at LIMIT 1;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER application_task BEFORE INSERT ON grant_tasks FOR EACH ROW EXECUTE FUNCTION attach_application_task();
CREATE FUNCTION link_source_application() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE applications SET opportunity_id=NEW.opportunity_id,updated_at=now() WHERE opportunity_id IS NULL AND source_url=rtrim(NEW.url,'/');
 UPDATE grant_tasks t SET opportunity_id=a.opportunity_id FROM applications a WHERE t.application_id=a.id AND t.opportunity_id IS NULL AND a.opportunity_id=NEW.opportunity_id;
 RETURN NEW;
END $$;
CREATE TRIGGER link_application_source AFTER INSERT OR UPDATE ON opportunity_source_urls FOR EACH ROW EXECUTE FUNCTION link_source_application();
CREATE FUNCTION link_catalog_application() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.merged_into IS NOT NULL THEN
 UPDATE applications SET opportunity_id=NEW.merged_into,updated_at=now() WHERE opportunity_id=NEW.id;
 ELSE
 UPDATE applications SET opportunity_id=NEW.id,updated_at=now() WHERE opportunity_id IS NULL AND source_url=rtrim(NEW.source_url,'/');
 END IF;
 UPDATE grant_tasks t SET opportunity_id=a.opportunity_id FROM applications a WHERE t.application_id=a.id AND t.opportunity_id IS DISTINCT FROM a.opportunity_id;
 RETURN NEW;
END $$;
CREATE TRIGGER link_application_catalog AFTER INSERT OR UPDATE OF source_url,merged_into ON opportunities FOR EACH ROW EXECUTE FUNCTION link_catalog_application();
COMMIT;
