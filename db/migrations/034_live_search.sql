BEGIN;
CREATE TABLE grant_search_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 request_id uuid NOT NULL, filters jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day', UNIQUE(workspace_id,request_id)
);
CREATE TABLE grant_search_progress (
 session_id uuid NOT NULL REFERENCES grant_search_sessions(id), provider text NOT NULL,
 cursor integer NOT NULL DEFAULT 0, pending jsonb NOT NULL DEFAULT '[]', total integer,
 exhausted boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'queued',
 lease_until timestamptz, owner uuid, retry_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,provider)
);
CREATE TABLE grant_search_requests (
 key text PRIMARY KEY, provider text NOT NULL, owner uuid, lease_until timestamptz,
 response jsonb, fetched_at timestamptz, retry_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE grant_external_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL, external_id text NOT NULL,
 source_url text NOT NULL, data jsonb NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now(),
 publication_checked_at timestamptz,
 UNIQUE(provider,external_id)
);
CREATE TABLE grant_search_results (
 session_id uuid NOT NULL REFERENCES grant_search_sessions(id), result_id uuid NOT NULL REFERENCES grant_external_results(id),
 PRIMARY KEY(session_id,result_id)
);
CREATE INDEX grant_search_session_expiry ON grant_search_sessions(expires_at);
COMMIT;
