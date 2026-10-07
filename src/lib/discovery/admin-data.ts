import {requireEditor,type DB} from './store';
export async function catalogAdminData(db:DB,userId:string,input:Record<string,string|string[]|undefined>){
 await requireEditor(db,userId);
 const p:Record<string,string>={};for(const [key,value] of Object.entries(input))if(typeof value==='string')p[key]=value;
  const tab = typeof p.tab === "string" ? p.tab : "overview";
  const q = typeof p.q === "string" ? p.q.slice(0, 200) : "";
  const page = Math.max(1, Math.min(10000, Math.floor(Number(p.page) || 1)));
  const offset = (page - 1) * 25;
  const settings = (
    await db.query("SELECT * FROM catalog_automation WHERE id=1")
  ).rows[0];
  const owner = (
    await db.query("SELECT beta_owner FROM users WHERE id=$1", [
      userId,
    ])
  ).rows[0]?.beta_owner;
  const stats = (
    await db.query(`SELECT
 (SELECT count(*) FROM opportunities WHERE NOT is_demo AND publication_state='published' AND merged_into IS NULL) AS published,
 (SELECT count(*) FROM crawl_frontier f JOIN crawl_sources s ON s.id=f.source_id WHERE s.enabled AND next_check_at<now()) AS overdue,
 (SELECT count(*) FROM crawl_candidates WHERE status='pending' AND kind='domain') + (SELECT count(*) FROM catalog_field_state WHERE state='locked_conflict') + (SELECT count(*) FROM crawl_frontier f JOIN crawl_sources s ON s.id=f.source_id WHERE failures>=3 AND s.enabled) AS pending,
 (SELECT count(*) FROM catalog_enrichment_jobs WHERE state IN ('queued','running')) AS researching,
 (SELECT count(*) FROM catalog_enrichment_jobs WHERE state='retry') AS retrying,
 (SELECT count(*) FROM catalog_enrichment_jobs WHERE state='waiting') AS unavailable,
 (SELECT count(*) FROM catalog_field_history WHERE action='automatic' AND created_at>now()-interval '24 hours' AND (old_value IS NULL OR old_value IN ('null','"unknown"','"Unknown"','[]'))) AS facts_resolved,
 (SELECT count(*) FROM crawl_publication_results WHERE outcome='published' AND processed_at>now()-interval '24 hours') AS added,
 (SELECT count(*) FROM crawl_publication_results WHERE outcome='updated' AND processed_at>now()-interval '24 hours') AS updated,
 (SELECT count(*) FROM crawl_publication_results WHERE outcome='failed' AND processed_at>now()-interval '24 hours') AS failed,
 (SELECT pg_total_relation_size('crawl_snapshots')/1048576.0) AS snapshot_mb`)
  ).rows[0];
  const coverage = (
    await db.query(
      `SELECT category,count(DISTINCT s.id) AS sources FROM crawl_sources s CROSS JOIN unnest(categories) category WHERE enabled GROUP BY category ORDER BY category`,
    )
  ).rows;
  const focusCoverage = (
    await db.query(
      "SELECT focus,count(*) AS sources FROM crawl_sources CROSS JOIN unnest(funding_focus) focus WHERE enabled GROUP BY focus",
    )
  ).rows;
  let rows: any[] = [];
  const completeness=(await db.query(`SELECT count(*) AS total,count(*) FILTER(WHERE application_status<>'unknown') AS status,count(*) FILTER(WHERE deadline_at IS NOT NULL OR rolling) AS deadline,count(*) FILTER(WHERE maximum_award IS NOT NULL) AS amount,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM opportunity_applicant_types a WHERE a.opportunity_id=o.id)) AS applicants,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM opportunity_geographies g WHERE g.opportunity_id=o.id)) AS geography FROM opportunities o WHERE NOT is_demo AND publication_state='published' AND merged_into IS NULL`)).rows[0];
  if(tab==='research')rows=(await db.query(`SELECT j.*,o.name,count(*) OVER() AS total FROM catalog_enrichment_jobs j JOIN opportunities o ON o.id=j.opportunity_id WHERE o.publication_state='published' AND o.name ILIKE $1 AND ($2='' OR j.state=$2) ORDER BY j.next_attempt_at,j.opportunity_id LIMIT 25 OFFSET $3`,['%'+q+'%',p.state??'',offset])).rows;
  if (tab === "catalog")
    rows = (
      await db.query(
        `SELECT o.id,o.name,o.publication_state,o.verification_status,o.application_status,o.deadline_at,o.maximum_award,o.source_url,m.state,m.last_success_at,m.next_check_at,m.consecutive_failures,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('url',p.url,'role',p.role,'association',p.association,'fetched_at',p.fetched_at,'facts',p.facts)),'[]') FROM program_evidence_pages p WHERE p.opportunity_id=o.id) AS evidence_pages,
 (SELECT jsonb_object_agg(field,reason) FROM catalog_field_state WHERE opportunity_id=o.id AND reason<>'') AS unresolved,
 (SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') FROM catalog_field_state f WHERE opportunity_id=o.id) AS fields,
 (SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]') FROM (SELECT field,old_value,new_value,created_at,action FROM catalog_field_history WHERE opportunity_id=o.id ORDER BY created_at DESC LIMIT 20) h) AS fact_history,
 count(*) OVER() AS total FROM opportunities o LEFT JOIN catalog_monitoring m ON m.opportunity_id=o.id
 WHERE NOT o.is_demo AND o.merged_into IS NULL AND o.name ILIKE $1
 AND ($2='' OR o.verification_status::text=$2)
 AND ($3='' OR ($3='missing' AND (o.maximum_award IS NULL OR o.deadline_at IS NULL OR o.eligibility_notes='' OR NOT EXISTS(SELECT 1 FROM opportunity_applicant_types a WHERE a.opportunity_id=o.id) OR NOT EXISTS(SELECT 1 FROM opportunity_geographies g WHERE g.opportunity_id=o.id))))
 AND ($4='' OR ($4='overdue' AND (m.next_check_at<now() OR m.last_success_at IS NULL)))
 AND ($5='' OR o.application_status=$5)
 AND ($6='' OR ($6='hidden' AND o.publication_state='hidden') OR ($6='archived' AND (m.state='discontinued' OR o.verification_status='archived')))
 ORDER BY m.next_check_at NULLS FIRST,o.name LIMIT 25 OFFSET $7`,
        [
          "%" + q + "%",
          p.verification ?? "",
          p.facts ?? "",
          p.freshness ?? "",
          p.status ?? "",
          p.visibility ?? "",
          offset,
        ],
      )
    ).rows;
  if (tab === "sources")
    rows = (
      await db.query(
        `SELECT s.*,
 (SELECT min(next_check_at) FROM crawl_frontier WHERE source_id=s.id) AS next_check,
 (SELECT max(last_success_at) FROM crawl_frontier WHERE source_id=s.id) AS last_success,
 (SELECT count(*) FROM crawl_frontier WHERE source_id=s.id AND failures>0) AS failures,
 (SELECT count(*) FROM crawl_candidates c JOIN crawl_publication_results r ON r.candidate_id=c.id WHERE c.source_id=s.id AND r.outcome='published') AS found,
 count(*) OVER() AS total FROM crawl_sources s WHERE name ILIKE $1 ORDER BY name LIMIT 25 OFFSET $2`,
        ["%" + q + "%", offset],
      )
    ).rows;
  if (tab === "attention") {
    if(p.kind==='locked')rows=(await db.query(`SELECT f.opportunity_id AS id,o.name AS title,o.source_url AS url,'locked' AS kind,f.reason,count(*) OVER() AS total FROM catalog_field_state f JOIN opportunities o ON o.id=f.opportunity_id WHERE f.state='locked_conflict' ORDER BY f.updated_at DESC LIMIT 25 OFFSET $1`,[offset])).rows;
    else if (p.kind === "unavailable")
      rows = (
        await db.query(
          `SELECT f.id,f.url,s.name AS title,f.failures,f.source_id,'unavailable' AS kind,(SELECT error FROM crawl_visits v WHERE v.source_id=f.source_id AND v.url=f.url AND error<>'' ORDER BY created_at DESC LIMIT 1) AS error,count(*) OVER() AS total FROM crawl_frontier f JOIN crawl_sources s ON s.id=f.source_id WHERE failures>=3 AND s.enabled ORDER BY failures DESC LIMIT 25 OFFSET $1`,
          [offset],
        )
      ).rows;
    else
      rows = (
        await db.query(
          `SELECT c.*,s.name AS source_name,r.reason,
 count(*) OVER() AS total FROM crawl_candidates c JOIN crawl_sources s ON s.id=c.source_id LEFT JOIN crawl_publication_results r ON r.candidate_id=c.id
 WHERE c.status='pending' AND c.kind='domain' AND (c.title ILIKE $1 OR c.url ILIKE $1)
 AND ($2='' OR ($2='domain' AND c.kind='domain') OR ($2='changed' AND c.kind='changed') OR ($2='duplicate' AND c.proposed->>'possible_duplicate_id' IS NOT NULL) OR ($2='ambiguous' AND c.kind='new' AND c.proposed->>'possible_duplicate_id' IS NULL))
 ORDER BY c.created_at DESC LIMIT 25 OFFSET $3`,
          ["%" + q + "%", p.kind ?? "", offset],
        )
      ).rows;
  }
  if (tab === "activity")
    rows = (
      await db.query(
        `SELECT *,count(*) OVER() AS total FROM (
 SELECT r.id,r.created_at,r.trigger AS kind,r.status::text,concat(r.note,' Failures: ',(SELECT count(*) FROM crawl_visits WHERE run_id=r.id AND status IN ('failed','blocked')),'; published: ',(SELECT count(*) FROM crawl_publication_results WHERE run_id=r.id AND outcome='published'),'; updated: ',(SELECT count(*) FROM crawl_publication_results WHERE run_id=r.id AND outcome='updated')) AS detail,(SELECT count(*) FROM crawl_visits WHERE run_id=r.id)::int AS pages FROM crawl_runs r
 UNION ALL SELECT id,created_at,'search',status,note,pages FROM search_discovery_jobs
 UNION ALL SELECT id,created_at,'editor',action,subject,0 FROM catalog_admin_events
 UNION ALL SELECT id,reviewed_at,'review','verified',source_url,0 FROM opportunity_reviews
 UNION ALL SELECT candidate_id,processed_at,'publication',outcome,reason,0 FROM crawl_publication_results
 UNION ALL SELECT id,created_at,'moderation',action,opportunity_id::text,0 FROM catalog_moderation_events
 UNION ALL SELECT id,created_at,'reconciliation',action,detail,0 FROM catalog_reconciliation_events
 UNION ALL SELECT id,created_at,'reconciliation run',status,note,0 FROM catalog_reconciliation_runs
 UNION ALL SELECT id,created_at,'catalog fact',action,concat(field,': ',old_value::text,' → ',new_value::text),0 FROM catalog_field_history
 UNION ALL SELECT opportunity_id,checked_at,'enrichment',state,reason,0 FROM catalog_enrichment_jobs WHERE checked_at IS NOT NULL
 ) a ORDER BY created_at DESC LIMIT 25 OFFSET $1`,
        [offset],
      )
    ).rows;

 return JSON.parse(JSON.stringify({tab,q,page,params:p,settings,owner,stats,coverage,focusCoverage,rows,completeness}));
}
