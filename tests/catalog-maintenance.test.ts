import {catalogAdminData} from '../src/lib/discovery/admin-data';
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import {
  checkHours,
  enqueueHourly,
  runMaintenance,
  pruneSnapshots,
} from "../src/lib/discovery/maintenance";
import { maintenanceCommand } from "../src/lib/discovery/admin";
import {
  createReader,
  robotsPolicy,
  type CrawlPage,
} from "../src/lib/discovery/reader";
import { registerLinks } from "../src/lib/discovery/store";
dotenv.config({ path: ".env.local", quiet: true });
test("freshness priorities distinguish approaching deadlines from closed cycles", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  assert.equal(checkHours("open", new Date("2026-10-10"), now), 6);
  assert.equal(checkHours("unknown", null, now), 24);
  assert.equal(checkHours("closed", new Date("2026-10-10"), now), 168);
  assert.equal(checkHours("open", new Date("2025-01-01"), now), 24);
});
test("conditional reader uses validators, preserves cached facts, and still checks robots", async () => {
  let seen = false;
  const cached: CrawlPage = {
    url: "https://example.org/grant",
    title: "Program Grant",
    text: "Current program grant application requirements.",
    links: [],
    kind: "html",
    extracted: {},
  };
  const reader = createReader({
    resolve: async () => [{ address: "8.8.8.8", family: 4 }],
    sleep: async () => {},
    request: (async (url: any, options: any) => {
      if (String(url).endsWith("robots.txt"))
        return new Response("", { status: 404 });
      seen =
        (options?.headers as Record<string, string>)["if-none-match"] === "abc";
      return new Response(null, { status: 304 });
    }) as any,
  });
  const result = await reader.read(cached.url, ["example.org"], {
    etag: "abc",
    page: cached,
  });
  assert.ok(seen);
  assert.ok(result.notModified);
  assert.equal(result.text, cached.text);
});
test("maintenance fairly prioritizes grants, resumes, deduplicates hourly jobs, backs off and protects evidence", async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL }),
    schema = "maintenance_" + randomBytes(8).toString("hex");
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
    await db.query("UPDATE catalog_automation SET hourly_enabled=true");
    const ids: string[] = [];
    for (const host of ["a.example.org", "b.example.org"]) {
      const s = (
        await db.query(
          "INSERT INTO crawl_sources(name,url,approved_domains) VALUES($1,$2,$3) RETURNING *",
          [host, "https://" + host + "/", [host]],
        )
      ).rows[0];
      ids.push(s.id);
      await registerLinks(
        db,
        s,
        ["https://" + host + "/grant", "https://" + host + "/new-grant"],
        0,
      );
      await db.query(
        "INSERT INTO opportunities(name,slug,official_url,source_url,funding_type,application_status,deadline_at) VALUES($1,$2,$3,$3,'grant','open',now()+interval '3 days')",
        ["Maintenance Grant " + host, host, "https://" + host + "/grant"],
      );
    }
    const run = await enqueueHourly(db, new Date("2026-11-01T05:17:00Z"));
    assert.ok(run);
    assert.equal(
      await enqueueHourly(db, new Date("2026-11-01T05:40:00Z")),
      undefined,
    );
    await db.query("UPDATE crawl_runs SET page_limit=4 WHERE id=$1", [run]);
    const urls: string[] = [];
    let failed = false;
    const reader = {
      policy: async () => robotsPolicy(""),
      read: async (url: string): Promise<CrawlPage> => {
        urls.push(url);
        if (failed) throw Error("HTTP 503");
        return {
          url,
          title: url.endsWith("/grant")
            ? "Maintenance Grant " + new URL(url).hostname
            : "Directory of grants",
          text: "This grant supports projects. Applications are open.",
          links: [],
          kind: "html",
          extracted: {},
        };
      },
    };
    await runMaintenance(db, reader, () => urls.length === 1);
    assert.equal(urls.length, 1);
    assert.equal(
      (await db.query("SELECT status FROM crawl_runs WHERE id=$1", [run]))
        .rows[0].status,
      "running",
    );
    await runMaintenance(db, reader);
    assert.equal(urls.length, 4);
    assert.ok(urls[0].endsWith("/grant"));
    assert.ok(urls[1].endsWith("/grant"));
    assert.notEqual(new URL(urls[0]).hostname, new URL(urls[1]).hostname);
    assert.equal(new Set(urls).size, 4);
    assert.equal(
      (
        await db.query(
          "SELECT count(*) FROM catalog_monitoring WHERE last_success_at IS NOT NULL",
        )
      ).rows[0].count,
      "2",
    );
    assert.ok(await enqueueHourly(db, new Date("2026-11-01T06:17:00Z"))); // repeated Eastern hour has distinct UTC job
    await db.query(
      "UPDATE crawl_frontier SET next_check_at=now()-interval '1 hour'",
    );
    failed = true;
    await runMaintenance(db, reader, () => false, 2);
    assert.equal(
      (
        await db.query(
          "SELECT count(*) FROM crawl_frontier WHERE failures>0 AND next_check_at>now()",
        )
      ).rows[0].count,
      "2",
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*) FROM catalog_monitoring WHERE state='discontinued'",
        )
      ).rows[0].count,
      "0",
    );
    await db.query("UPDATE catalog_automation SET paused=true");
    assert.equal(await runMaintenance(db, reader), 0);
    assert.equal(await enqueueHourly(db), undefined);
    const outsider = (
      await db.query(
        "INSERT INTO users(email,name) VALUES('outside@test.invalid','Outside') RETURNING id",
      )
    ).rows[0].id;
    await assert.rejects(maintenanceCommand(db, outsider, "resume", ""));
    const editor = (
      await db.query(
        "INSERT INTO users(email,name,beta_active,email_verified_at,catalog_editor) VALUES('editor@test.invalid','Editor',true,now(),true) RETURNING id",
      )
    ).rows[0].id;
    await assert.rejects(maintenanceCommand(db, editor, "resume", ""));
    await assert.rejects(catalogAdminData(db,outsider,{}));
    for(const tab of ['overview','catalog','sources','attention','activity']){
      const view=await catalogAdminData(db,editor,{tab});assert.equal(view.tab,tab);
    }
    const filtered=await catalogAdminData(db,editor,{tab:'catalog',verification:'verified',facts:'missing',freshness:'overdue'});assert.ok(Array.isArray(filtered.rows));
    const orphan = (
      await db.query(
        "INSERT INTO crawl_snapshots(source_id,url,hash,title,body,fetched_at) VALUES($1,'https://a.example.org/old','old','old','old',now()-interval '100 days') RETURNING id",
        [ids[0]],
      )
    ).rows[0].id;
    assert.equal(await pruneSnapshots(db), 1);
    assert.equal(
      (await db.query("SELECT 1 FROM crawl_snapshots WHERE id=$1", [orphan]))
        .rowCount,
      0,
    );
    assert.ok(
      Number(
        (await db.query("SELECT count(*) FROM crawl_snapshots")).rows[0].count,
      ) > 0,
    );
  } finally {
    await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await db.end();
  }
});

import { extractFacts } from "../src/lib/discovery/extract";
test("Spencer month-name deadlines require one explicit valid cycle", () => {
  const url = "https://www.spencer.org/grant_types/small-research-grant";
  assert.equal(
    extractFacts(
      "<main><p>Application Deadline: December 1, 2099</p></main>",
      url,
    ).deadline,
    "2099-12-01",
  );
  assert.equal(
    extractFacts(
      "<main><p>Application Deadline: February 30, 2099</p></main>",
      url,
    ).deadline,
    undefined,
  );
  assert.equal(
    extractFacts(
      "<main><p>Application Deadline: December 1, 2099</p><p>Deadline: 2099-11-01</p></main>",
      url,
    ).deadline,
    undefined,
  );
  assert.equal(
    extractFacts(
      "<main><p>Application Deadline: December 1, 2099</p></main>",
      "https://other.example/grant",
    ).deadline,
    undefined,
  );
});
