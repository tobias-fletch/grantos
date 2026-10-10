import {canonicalUrl} from "../opportunities/research";
import {normalizeLocation,sourceLocationPriority,locationParams} from "../opportunities/geography";
import {automationPaused} from './maintenance';
import {acquireCrawlLease,renewCrawlLease,releaseCrawlLease} from "./lease";
import { createHash } from "node:crypto";
import type { Client, PoolClient } from "pg";
import { parseFilters, type SearchParams } from "../opportunities/store";
import { fundingFocusOptions } from "../opportunities/funding-focus";
import { createReader } from "./reader";
import { registerLinks, recordPage } from "./store";
import { publishBacklog } from "./publish";
type DB = Client | PoolClient;
export function searchIntent(params: SearchParams) {
  const f = parseFilters(locationParams(params));
  const terms = [
    ...new Set(
      [
        f.q,
        ...f.focus.map(
          (v) => fundingFocusOptions.find((o) => o.value === v)?.label ?? "",
        ),
      ]
        .join(" ")
        .toLowerCase()
        .match(/[a-z0-9]{3,30}/g) ?? [],
    ),
  ]
    .filter((t) => !["and", "for", "the", "with"].includes(t))
    .slice(0, 12)
    .sort();
  const categories = [...f.categories].sort();
  const geography=normalizeLocation(f);
  const constraints={applicant:f.applicant,status:f.status,minAward:f.minAward,freshness:f.freshness,focus:[...f.focus].sort()};
  return {
    geography, constraints,
    terms,
    categories,
    key: createHash("sha256")
      .update(JSON.stringify({ terms, categories,geography:{...geography,city:geography.city.toLowerCase()},constraints }))
      .digest("hex"),
  };
}
export async function enqueueSearch(db: DB, params: SearchParams, submission?: {id:string;userId:string}) {
  const intent = searchIntent(params);
  await db.query("SELECT pg_advisory_xact_lock(7823095)");
  if(submission){
    const receipt=(await db.query("SELECT job_id,search_key,user_id FROM search_discovery_submissions WHERE id=$1",[submission.id])).rows[0];
    if(receipt){
      if(receipt.user_id!==submission.userId||receipt.search_key!==intent.key)throw Error('Submission does not match this search');
      return receipt.job_id;
    }
  }
  async function remember(id:string,started:boolean){
    if(submission)await db.query('INSERT INTO search_discovery_submissions(id,user_id,job_id,search_key,started_job) VALUES($1,$2,$3,$4,$5)',[submission.id,submission.userId,id,intent.key,started]);
    return id;
  }
  const prior = (
    await db.query("SELECT * FROM search_discovery_jobs WHERE search_key=$1", [
      intent.key,
    ])
  ).rows[0];
  if (
    prior &&
    (["queued", "running"].includes(prior.status) ||
      (!submission && Date.now() - new Date(prior.created_at).getTime() < 6 * 3600000))
  )
    return remember(prior.id,false);
  const recent = (
    await db.query(
      "SELECT ((SELECT count(*) FROM search_discovery_submissions WHERE started_job AND created_at>now()-interval '1 hour') + (SELECT count(*) FROM search_discovery_jobs j WHERE j.created_at>now()-interval '1 hour' AND NOT EXISTS (SELECT 1 FROM search_discovery_submissions s WHERE s.job_id=j.id AND s.started_job AND s.created_at>=j.created_at)))::int AS n",
    )
  ).rows[0].n;
  if (recent >= 30) throw Error("Shared discovery hourly budget reached");
  const active = (
    await db.query(
      "SELECT count(*)::int AS n FROM search_discovery_jobs WHERE status IN ('queued','running')",
    )
  ).rows[0].n;
  if (active >= 10) throw Error("Search discovery queue is full");
  // Category overlap is a source-selection hint, never evidence of grant eligibility.
  const sources = (
    await db.query(
      "SELECT id,name,url,categories,geography FROM crawl_sources WHERE enabled",
    )
  ).rows;
  const ranked = sources
    .map((s) => ({
      id: s.id,
      categoryMatch:!intent.categories.length||s.categories.some((c:string)=>intent.categories.includes(c)),
      geo:sourceLocationPriority(s.geography??"",intent.geography),
      score:
        s.categories.filter((c: string) => intent.categories.includes(c))
          .length *
          10 +
        intent.terms.filter((t) =>
          (s.name + " " + s.url).toLowerCase().includes(t),
        ).length,
    }))
    .filter(s=>s.categoryMatch&&(!intent.geography.country||s.geo>0))
    .sort((a, b) => b.geo-a.geo || b.score - a.score || a.id.localeCompare(b.id));
  const chosen = ranked.slice(0, 8).map((s) => s.id);
  const coverageGap=!!intent.geography.country&&!ranked.some(s=>s.geo>=3);
  if (prior) {
    await db.query("DELETE FROM search_discovery_visits WHERE job_id=$1", [
      prior.id,
    ]);
    await db.query(
      "UPDATE search_discovery_jobs SET status='queued',last_served_at=NULL,next_attempt_at=now(),created_at=now(),finished_at=NULL,pages=0,failures=0,published=0,updated=0,note='',source_ids=$2,geography=$3,search_constraints=$4,coverage_gap=$5 WHERE id=$1",
      [prior.id, chosen,JSON.stringify(intent.geography),JSON.stringify(intent.constraints),coverageGap],
    );
    return remember(prior.id,true);
  }
  const id = (
    await db.query(
      "INSERT INTO search_discovery_jobs(search_key,terms,categories,source_ids,geography,search_constraints,coverage_gap) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [intent.key, intent.terms, intent.categories, chosen,JSON.stringify(intent.geography),JSON.stringify(intent.constraints),coverageGap],
    )
  ).rows[0].id;
  return remember(id,true);
}
export async function runSearchDiscovery(
  db: DB,
  stopping = () => false,
  reader = createReader(),
  jobId?: string,
  pageLimit=24,
  fetchStopping=stopping,
) {
  if(await automationPaused(db))return false;
  const lease=await acquireCrawlLease(db);
  if(!lease)return false;
  try {
    const job = (
      await db.query(
        "SELECT * FROM search_discovery_jobs WHERE status IN ('queued','running') AND next_attempt_at<=now() AND ($1::uuid IS NULL OR id=$1) ORDER BY last_served_at NULLS FIRST,created_at,id LIMIT 1",
        [jobId ?? null],
      )
    ).rows[0];
    if (!job) return false;
    await db.query(
      "UPDATE search_discovery_jobs SET status='running',last_served_at=now() WHERE id=$1",
      [job.id],
    );
    async function publishChecked(){
      const totals=await publishBacklog(db,null,stopping,job.id);
      await db.query('UPDATE search_discovery_jobs SET published=published+$2,updated=updated+$3 WHERE id=$1',[job.id,totals.published,totals.updated]);
    }
    await publishChecked();
    const sources = (
      await db.query(
        "SELECT * FROM crawl_sources WHERE enabled AND id=ANY($1::uuid[]) ORDER BY (SELECT count(*) FROM search_discovery_visits v WHERE v.job_id=$2 AND v.source_id=crawl_sources.id),array_position($1::uuid[],id)",
        [job.source_ids,job.id],
      )
    ).rows;
    for (const source of sources)
      await registerLinks(db, source, [source.url], 0);
    // Round-robin sources prevents a large directory consuming the entire search budget.
    let progressed = true;
    let capacityLimited=false;
    const turnLimit=Math.min(24,job.pages+Math.max(1,Math.min(24,pageLimit)));
    while (job.pages < turnLimit && !fetchStopping() && progressed) {
      progressed = false;
      for (const source of sources) {
        if (job.pages >= turnLimit || fetchStopping()) break;
        await renewCrawlLease(db,lease);
        const items = (
          await db.query(
            "SELECT f.* FROM crawl_frontier f WHERE source_id=$1 AND (failures=0 OR next_check_at<=now()) AND NOT EXISTS(SELECT 1 FROM search_discovery_visits v WHERE v.job_id=$2 AND v.source_id=f.source_id AND v.url=f.url) ORDER BY attempted_at NULLS FIRST,depth,id LIMIT 500",
            [source.id, job.id],
          )
        ).rows;
        items.sort(
          (a, b) =>
            searchPagePriority(b.url,job.terms)-searchPagePriority(a.url,job.terms) || a.depth-b.depth,
        );
        const item = items[0];
        if (!item) continue;
        if('canRead' in reader&&!(reader as any).canRead(item.url,source.approved_domains)){capacityLimited=true;continue;}
        progressed = true;
        let failed = false;
        let evidenceUrl:string|null=null;
        try {
          const page = await reader.read(item.url, source.approved_domains);
          await db.query("BEGIN");
          await recordPage(db, source.id, page);
          evidenceUrl=canonicalUrl(page.url);
          await registerLinks(db, source, page.links, item.depth + 1);
          await db.query("COMMIT");
        } catch {
          await db.query("ROLLBACK");
          failed = true;
        }
        // A crash before checkpointing retries an idempotent snapshot/publication.
        await db.query("BEGIN");
        await db.query(
          "INSERT INTO search_discovery_visits(job_id,source_id,url,evidence_url) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [job.id, source.id, item.url,evidenceUrl],
        );
        await db.query(
          "UPDATE crawl_frontier SET attempted_at=now(),last_success_at=CASE WHEN $2 THEN last_success_at ELSE now() END,failures=CASE WHEN $2 THEN failures+1 ELSE 0 END,next_check_at=CASE WHEN $2 THEN now()+make_interval(secs=>least(86400,300*power(2,least(failures,8)))::int) ELSE next_check_at END WHERE id=$1",
          [item.id,failed],
        );
        await db.query(
          "UPDATE search_discovery_jobs SET pages=pages+1,failures=failures+$2 WHERE id=$1",
          [job.id, failed ? 1 : 0],
        );
        await db.query("COMMIT");
        job.pages++;
      }
    }
    await renewCrawlLease(db,lease);
    await publishChecked();
    if (stopping() || fetchStopping() || (progressed && job.pages<24 && job.pages>=turnLimit)) return true;
    if(capacityLimited){await db.query("UPDATE search_discovery_jobs SET next_attempt_at=now()+interval '1 minute',note='Invocation capacity reached; continuing next run.' WHERE id=$1",[job.id]);return true;}
    // A temporarily unavailable page is deferred, not mistaken for completed coverage.
    const deferred=(await db.query("SELECT min(f.next_check_at) due FROM crawl_frontier f WHERE f.source_id=ANY($1::uuid[]) AND f.failures>0 AND f.next_check_at>now() AND NOT EXISTS(SELECT 1 FROM search_discovery_visits v WHERE v.job_id=$2 AND v.source_id=f.source_id AND v.url=f.url)",[job.source_ids,job.id])).rows[0]?.due;
    if(deferred&&job.pages<24){await db.query("UPDATE search_discovery_jobs SET next_attempt_at=$2,note='Source retry scheduled; existing results remain available.' WHERE id=$1",[job.id,deferred]);return true;}
    await db.query(
      "UPDATE search_discovery_jobs SET status=CASE WHEN failures>0 OR pages>=24 THEN 'partial' ELSE 'complete' END,finished_at=now(),note='Approved sources checked; bounded coverage. New identifiable grants publish automatically.' WHERE id=$1",
      [job.id],
    );
    return true;
  } finally {
    await db.query("ROLLBACK");
    await releaseCrawlLease(db,lease);
  }
}

/** Prefer program/application pages over directory branches, without changing domain policy. */
export function searchPagePriority(url:string,terms:string[]){
 const path=new URL(url).pathname.toLowerCase();
 return terms.filter(t=>path.includes(t)).length*10 + (/grant|fellowship|fund|award/.test(path)?4:0) + (/apply|application|guideline|eligib|deadline|\.pdf$/.test(path)?3:0) - (/news|blog|recipient|winner/.test(path)?8:0);
}
