import type { Client } from "pg";
import { createReader, type CrawlPage } from "./reader";
import { acquireCrawlLease, renewCrawlLease, releaseCrawlLease } from "./lease";
import { recordPage, registerLinks, type DB } from "./store";
import { seedCatalogMonitoring, monitorCatalogPage } from "./monitor";
import { publishBacklog } from "./publish";
import {attachEvidence,applyProgramEvidence} from './program-store';
import {relatedPage} from './program-evidence';
import {canonicalUrl} from '../opportunities/research';

export function checkHours(
  status: string,
  deadline: Date | null,
  now = new Date(),
  opens: Date | null = null,
  recurrence: string | null = null,
) {
  if(opens && opens.getTime()>=now.getTime() && opens.getTime()-now.getTime()<=30*86400000)return 6;
  if (status === "closed") return recurrence==='annual'||recurrence==='recurring'?24:168;
  if (
    deadline &&
    deadline.getTime() >= now.getTime() &&
    deadline.getTime() - now.getTime() <= 30 * 86400000
  )
    return 6;
  return 24;
}
export async function automationPaused(db: DB) {
  return (
    (await db.query("SELECT paused FROM catalog_automation WHERE id=1")).rows[0]
      ?.paused === true
  );
}
export async function enqueueHourly(db: DB, now = new Date()) {
  const settings = (
    await db.query("SELECT * FROM catalog_automation WHERE id=1")
  ).rows[0];
  if (settings.paused || !settings.hourly_enabled) return;
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  return (
    await db.query(
      "INSERT INTO crawl_runs(trigger,schedule_hour) VALUES('hourly',$1) ON CONFLICT DO NOTHING RETURNING id",
      [hour],
    )
  ).rows[0]?.id;
}
export async function pruneSnapshots(db: DB) {
  // All candidate evidence (including historical reviews) and currently cached pages are retained.
  return (
    await db.query(`DELETE FROM crawl_snapshots s WHERE id IN (
 SELECT s.id FROM crawl_snapshots s WHERE fetched_at<now()-interval '90 days'
 AND NOT EXISTS(SELECT 1 FROM crawl_candidates c WHERE c.snapshot_id=s.id)
 AND NOT EXISTS(SELECT 1 FROM crawl_frontier f WHERE f.snapshot_id=s.id)
 AND NOT EXISTS(SELECT 1 FROM program_evidence_pages p WHERE p.snapshot_id=s.id)
 AND NOT EXISTS(SELECT 1 FROM catalog_reconciliation_pages p WHERE p.snapshot_id=s.id)
 AND NOT EXISTS(SELECT 1 FROM program_round_evidence p WHERE p.snapshot_id=s.id)
 AND NOT EXISTS(SELECT 1 FROM catalog_enrichment_pages p WHERE p.snapshot_id=s.id)
 AND NOT EXISTS(SELECT 1 FROM opportunities o WHERE o.source_url=s.url OR o.official_url=s.url OR o.publication_provenance->>'snapshot_id'=s.id::text)
 ORDER BY fetched_at LIMIT 500)`)
  ).rowCount;
}

// One page per source each round; reserve the first half of the budget for due catalog URLs.
export async function runMaintenance(
  db: Client,
  reader = createReader(),
  stopping = () => false,
  budget = 976,
  finishSlice = false,
  publicationStopping = stopping,
  phase: 'all'|'maintenance'|'discovery'='all',
) {
  if (await automationPaused(db)) return 0;
  const lease = await acquireCrawlLease(db);
  if (!lease) return 0;
  let checked = 0;
  try {
    const run = (
      await db.query(
        "SELECT * FROM crawl_runs WHERE status IN ('queued','running') AND trigger IN ('hourly','targeted','manual','scheduled') ORDER BY created_at LIMIT 1",
      )
    ).rows[0];
    if (!run) return 0;
    await db.query(
      "UPDATE catalog_automation SET heartbeat_at=now(),last_error='' WHERE id=1",
    );
    await db.query(
      "UPDATE crawl_runs SET status='running',started_at=coalesce(started_at,now()),heartbeat_at=now() WHERE id=$1",
      [run.id],
    );
    if(phase!=='maintenance')await publishBacklog(db, run.id, publicationStopping);
    await seedCatalogMonitoring(db);
    const sources = (
      await db.query(
        "SELECT * FROM crawl_sources s WHERE enabled AND ($1::uuid IS NULL OR id=$1) ORDER BY (SELECT max(attempted_at) FROM crawl_frontier WHERE source_id=s.id) NULLS FIRST,id",
        [run.source_id],
      )
    ).rows;
    for (const s of sources) {
      await registerLinks(db, s, [s.url], 0);
    }
    await db.query(
      "UPDATE catalog_monitoring m SET next_check_at=f.next_check_at FROM crawl_frontier f WHERE m.source_url=f.url",
    );
    const prior = Number(
      (
        await db.query("SELECT count(*) FROM crawl_visits WHERE run_id=$1", [
          run.id,
        ])
      ).rows[0].count,
    );
    const limit = Math.min(budget, run.page_limit - prior);
    for (const maintenanceOnly of (phase==='maintenance'?[true]:phase==='discovery'?[false]:[true,false])) {
      const phaseLimit = maintenanceOnly
        ? Math.min(limit, Math.ceil(run.page_limit / 2))
        : limit;
      let progress = true;
      while (progress && checked < phaseLimit && !stopping()) {
        progress = false;
        for (const s of sources) {
          if (stopping() || checked >= phaseLimit) break;
          if (await automationPaused(db)) return checked;
          await renewCrawlLease(db, lease);
          const item = (
            await db.query(
              `SELECT f.*,o.application_status,o.deadline_at,o.opens_at,o.recurrence,m.state AS monitor_state FROM crawl_frontier f
      LEFT JOIN LATERAL (SELECT * FROM opportunities WHERE source_url=f.url AND NOT is_demo AND publication_state='published' AND merged_into IS NULL LIMIT 1) o ON true
      LEFT JOIN catalog_monitoring m ON m.opportunity_id=o.id
      WHERE f.source_id=$1 AND f.next_check_at<=now() AND (NOT $3::boolean OR o.id IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM crawl_visits v WHERE v.run_id=$2 AND v.source_id=f.source_id AND v.url=f.url)
      AND (SELECT count(*) FROM crawl_visits WHERE run_id=$2 AND source_id=$1)<50
      ORDER BY f.next_check_at,f.attempted_at NULLS FIRST,f.depth,f.id LIMIT 1`,
              [s.id, run.id, maintenanceOnly],
            )
          ).rows[0];
          if (!item) continue;
          if('canRead' in reader&&!(reader as any).canRead(item.url,s.approved_domains))continue;
          progress = true;
          let page: CrawlPage | undefined,
            error = "";
          try {
            const cached = item.snapshot_id
              ? (
                  await db.query("SELECT * FROM crawl_snapshots WHERE id=$1", [
                    item.snapshot_id,
                  ])
                ).rows[0]
              : null;
            page = await reader.read(
              item.url,
              s.approved_domains,
              cached
                ? {
                    etag: item.etag,
                    lastModified: item.last_modified,
                    page: {
                      url: cached.url,
                      title: cached.title,
                      text: cached.body,
                      links: cached.links??[],
                      kind: "html",
                      extracted: cached.extracted,
                    },
                  }
                : undefined,
            );
          } catch (e) {
            error =
              e instanceof Error
                ? e.message.slice(0, 500)
                : "Source unavailable";
          }
          await renewCrawlLease(db, lease);
          await db.query("BEGIN");
          try {
            if (page) {
              if (!page.notModified) {
                await recordPage(db, s.id, page);
                if (item.url === s.url) {
                  try {
                    const policy = await reader.policy(new URL(s.url).origin);
                    await registerLinks(
                      db,
                      s,
                      policy.sitemaps.length
                        ? policy.sitemaps
                        : [new URL("/sitemap.xml", s.url).href],
                      0,
                    );
                  } catch {}
                }
                await registerLinks(db, s, page.links, item.depth + 1);
              }
              await monitorCatalogPage(db, run.id, item.url, page);
              const associated=(await db.query('SELECT p.opportunity_id,p.association FROM program_evidence_pages p WHERE p.url=$1',[canonicalUrl(page.url)])).rows;
              if(!associated.length){
                const linked=(await db.query(`SELECT DISTINCT o.* FROM opportunities o JOIN program_evidence_pages p ON p.opportunity_id=o.id JOIN crawl_snapshots sn ON sn.id=p.snapshot_id WHERE sn.links @> $1::jsonb AND o.publication_state='published' AND o.merged_into IS NULL`,[JSON.stringify([page.url])])).rows.filter(g=>relatedPage(g,page!,true));
                if(linked.length===1)associated.push({opportunity_id:linked[0].id,association:relatedPage(linked[0],page,true)});
              }
              const snapshot=(await db.query('SELECT * FROM crawl_snapshots WHERE source_id=$1 AND url=$2 ORDER BY fetched_at DESC LIMIT 1',[s.id,canonicalUrl(page.url)])).rows[0];
              if(snapshot)for(const p of associated){await db.query('SELECT pg_advisory_xact_lock(7823091)');await attachEvidence(db,p.opportunity_id,page,snapshot,p.association);await applyProgramEvidence(db,p.opportunity_id);}
            } else
              await monitorCatalogPage(db, run.id, item.url, undefined, error);
            const hours = page
              ? item.monitor_state === "discontinued"
                ? 168
                : item.application_status
                  ? checkHours(item.application_status, item.deadline_at,new Date(),item.opens_at,item.recurrence)
                  : s.interval_hours
              : Math.min(168, Math.pow(2, Math.min(item.failures, 7)));
            await db.query(
              `UPDATE crawl_frontier SET attempted_at=now(),last_run_id=$2,next_check_at=now()+make_interval(hours=>$3),
       last_success_at=CASE WHEN $4 THEN now() ELSE last_success_at END,failures=CASE WHEN $4 THEN 0 ELSE failures+1 END,
       etag=CASE WHEN $4 THEN $5 ELSE etag END,last_modified=CASE WHEN $4 THEN $6 ELSE last_modified END,
       snapshot_id=coalesce((SELECT id FROM crawl_snapshots WHERE source_id=$7 AND url=$8 ORDER BY fetched_at DESC LIMIT 1),snapshot_id) WHERE id=$1`,
              [
                item.id,
                run.id,
                hours,
                !!page,
                page?.etag ?? item.etag,
                page?.lastModified ?? item.last_modified,
                s.id,
                page?.url ?? item.url,
              ],
            );
            await db.query(
              "UPDATE catalog_monitoring SET next_check_at=now()+make_interval(hours=>$2) WHERE source_url=$1",
              [item.url, hours],
            );
            await db.query(
              "INSERT INTO crawl_visits(run_id,source_id,url,status,error) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
              [run.id, s.id, item.url, page ? "read" : "failed", error],
            );
            await db.query(
              "UPDATE crawl_runs SET heartbeat_at=now() WHERE id=$1",
              [run.id],
            );
            await db.query(
              "UPDATE catalog_automation SET heartbeat_at=now() WHERE id=1",
            );
            await db.query("COMMIT");
            checked++;
          } catch (e) {
            await db.query("ROLLBACK");
            throw e;
          }
        }
      }
    }
    await renewCrawlLease(db, lease);
    if(phase!=='maintenance')await publishBacklog(db, run.id, publicationStopping);
    if ((!stopping() || finishSlice)&&phase!=='maintenance') {
      const failures = Number(
        (
          await db.query(
            "SELECT count(*) FROM crawl_visits WHERE run_id=$1 AND status='failed'",
            [run.id],
          )
        ).rows[0].count,
      );
      await db.query(
        "UPDATE crawl_runs SET status=$2,finished_at=now(),note='Due-source maintenance; unprocessed URLs retain their schedule.' WHERE id=$1",
        [
          run.id,
          failures || checked >= limit || stopping() ? "partial" : "complete",
        ],
      );
      await db.query(
        "UPDATE catalog_automation SET last_success_at=now(),last_error='' WHERE id=1",
      );
      await pruneSnapshots(db);
    }
    return checked;
  } finally {
    await db.query("ROLLBACK");
    await releaseCrawlLease(db, lease);
  }
}
