BEGIN;
CREATE TABLE crawl_worker_lease (
 id integer PRIMARY KEY CHECK(id=1), owner uuid, expires_at timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO crawl_worker_lease(id) VALUES(1);
COMMIT;
