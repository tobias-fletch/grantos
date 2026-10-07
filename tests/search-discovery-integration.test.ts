import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import {
  enqueueSearch,
  runSearchDiscovery,
} from "../src/lib/discovery/search-jobs";
import { parsePage } from "../src/lib/discovery/reader";
import { recordPage } from "../src/lib/discovery/store";
import { publishCandidate } from "../src/lib/discovery/publish";
dotenv.config({ path: ".env.local", quiet: true });
test("search jobs checkpoint, resume, publish once, cache repeat queries, and audit automatic facts", async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const schema = "grantos_search_test_" + randomBytes(8).toString("hex");
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}",public`);
    for (const f of (await readdir("db/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.query(
        (await readFile("db/migrations/" + f, "utf8")).replace(
          /^BEGIN;\s*|^COMMIT;\s*/gm,
          "",
        ),
      );
    await db.query("UPDATE crawl_sources SET enabled=false");
    const root = "https://www.spencer.org/discovery-test",
      child = "https://www.spencer.org/grant_types/discovery-test-grant";
    const source = (
      await db.query(
        "INSERT INTO crawl_sources(name,url,approved_domains,categories) VALUES('Research source',$1,ARRAY['www.spencer.org'],ARRAY['Research']) RETURNING id",
        [root],
      )
    ).rows[0].id;
    await db.query("BEGIN");
    const id = await enqueueSearch(db, { category: "Research" });
    await db.query("COMMIT");
    let reads = 0;
    const html =
      "<main><h1>Unique Search Discovery Research Grant</h1><p>This grant supports research projects with budgets up to $50,000 for eligible nonprofit institutions.</p><p>Applications are open.</p><p>Application Deadline: 2099-12-01</p><h2>Eligibility</h2><p>Eligible investigators must hold a doctorate and apply through a nonprofit organization.</p><h2>Apply</h2><p>Submit a research proposal.</p></main>";
    const reader = {
      policy: async () => ({ sitemaps: [], delay: 1500, allowed: () => true }),
      read: async (url: string) => {
        reads++;
        return parsePage(
          Buffer.from(
            url === root
              ? '<main><h1>Funding directory</h1><p>Explore research funding opportunities.</p><a href="' +
                  child +
                  '">Research grant application</a></main>'
              : html,
          ),
          "text/html",
          url,
        );
      },
    };
    await runSearchDiscovery(db, () => reads === 1, reader, id);
    assert.equal(
      (
        await db.query("SELECT status FROM search_discovery_jobs WHERE id=$1", [
          id,
        ])
      ).rows[0].status,
      "running",
    );
    await runSearchDiscovery(db, () => false, reader, id);
    const job = (
      await db.query("SELECT * FROM search_discovery_jobs WHERE id=$1", [id])
    ).rows[0];
    assert.equal(job.pages, 2);
    assert.equal(job.published, 1);
    assert.equal(job.status, "complete");
    assert.equal(reads, 2);
    const grant = (
      await db.query("SELECT * FROM opportunities WHERE source_url=$1", [child])
    ).rows[0];
    assert.equal(grant.verification_status, "needs_verification");
    assert.equal(grant.auto_verified_at,null);
    assert.ok((await db.query('SELECT 1 FROM catalog_field_history WHERE opportunity_id=$1',[grant.id])).rowCount);
    assert.equal(Number(grant.maximum_award), 50000);
    await db.query("BEGIN");
    assert.equal(await enqueueSearch(db, { category: "Research" }), id);
    await db.query("COMMIT");
    assert.equal(await runSearchDiscovery(db, () => false, reader, id), false);
    await recordPage(
      db,
      source,
      await parsePage(
        Buffer.from(html.replace("$50,000", "$60,000")),
        "text/html",
        child,
      ),
    );
    const candidate = (
      await db.query(
        "SELECT id FROM crawl_candidates WHERE url=$1 AND status='pending'",
        [child],
      )
    ).rows[0];
    await db.query("BEGIN");
    assert.equal((await publishCandidate(db, candidate.id)).outcome, "updated");
    await db.query("COMMIT");
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT maximum_award FROM opportunities WHERE id=$1",
            [grant.id],
          )
        ).rows[0].maximum_award,
      ),
      60000,
    );
  } finally {
    await db.query("ROLLBACK");
    await db.query("SET search_path TO public");
    await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await db.end();
  }
});
