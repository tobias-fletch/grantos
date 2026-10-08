BEGIN;
ALTER TABLE catalog_automation ADD COLUMN reconciliation_parser_version text NOT NULL DEFAULT '';
COMMIT;
