BEGIN;

CREATE TYPE verification_status AS ENUM ('verified','recently_checked','needs_verification','possibly_closed','archived');

CREATE TABLE funders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funder_id uuid REFERENCES funders(id),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  official_url text NOT NULL,
  funding_type text NOT NULL,
  minimum_award numeric(14,2),
  maximum_award numeric(14,2),
  typical_award numeric(14,2),
  opens_at timestamptz,
  deadline_at timestamptz,
  rolling boolean NOT NULL DEFAULT false,
  recurring boolean NOT NULL DEFAULT false,
  fiscal_sponsor_allowed boolean,
  fiscal_sponsor_required boolean,
  match_required boolean,
  application_fee numeric(10,2),
  indirect_costs_allowed boolean,
  source_url text NOT NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  last_verified_at timestamptz,
  verification_status verification_status NOT NULL DEFAULT 'needs_verification',
  deadline_confidence smallint CHECK(deadline_confidence BETWEEN 0 AND 100),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE opportunity_categories (
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  category text NOT NULL,
  PRIMARY KEY(opportunity_id,category)
);

CREATE TABLE opportunity_applicant_types (
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  applicant_type text NOT NULL,
  PRIMARY KEY(opportunity_id,applicant_type)
);

CREATE TABLE opportunity_geographies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  country text,
  state text,
  city text,
  county text,
  borough text,
  postal_code text,
  rule text NOT NULL DEFAULT 'eligible'
);

CREATE INDEX idx_opportunities_deadline ON opportunities(deadline_at) WHERE verification_status <> 'archived';
CREATE INDEX idx_opportunities_verification ON opportunities(verification_status,last_checked_at);

COMMIT;
