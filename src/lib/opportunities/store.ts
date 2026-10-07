import type { Pool, PoolClient, Client } from "pg";

type Database = Pool | PoolClient | Client;
export const categories = ["Nonprofit","Music","Visual Art","Film / Video","Theater","Dance","Writing / Literature","Photography","Research","Education","Community Project","Small Business","Technology","Agriculture / Food"];
export const applicantTypes = ["individual","organization","business","nonprofit","fiscal_sponsored","collective","student","researcher","consultant"];
export type SearchParams = Record<string, string | string[] | undefined>;
export type Filters = { resultType:string; freshness:string; q: string; category: string; applicant: string; location: string; status: string; minAward: number; sort: string; page: number; saved: boolean; suggested: boolean };
export function parseFilters(params: SearchParams): Filters {
  const value = (name: string) => typeof params[name] === "string" ? params[name] as string : "";
  const allowed = (name: string, options: string[], fallback = "") => options.includes(value(name)) ? value(name) : fallback;
  const amount = Number(value("minAward"));
  const page = Number(value("page"));
  return { resultType:allowed('resultType',['grants','all','catalog'],'grants'),freshness:allowed('freshness',['new','updated']),q: value("q").trim().slice(0,200), category: allowed("category",categories), applicant: allowed("applicant",applicantTypes),
    location: allowed("location",["nyc","nyc_only"]), status: allowed("status",["open","upcoming","closed","unannounced","unknown"]),
    minAward: Number.isFinite(amount) && amount >= 0 ? Math.min(amount,100000000) : 0,
    sort: allowed("sort",["deadline","amount","recent"],"deadline"), page: Number.isInteger(page) && page > 0 ? Math.min(page,10000) : 1,
    saved: value("saved") === "1", suggested: value("suggested") === "1" };
}

export async function currentWorkspace(db: Database, userId: string) {
  const { rows } = await db.query(`SELECT w.id, w.name, w.slug, w.kind, w.plan, wm.role,
    p.applicant_type, p.country, p.state, p.city, p.borough, p.onboarding_completed_at,
    ARRAY(SELECT category FROM profile_categories pc WHERE pc.workspace_id=w.id) AS categories
    FROM workspace_members wm JOIN workspaces w ON w.id=wm.workspace_id
    LEFT JOIN profiles p ON p.workspace_id=w.id WHERE wm.user_id=$1
    ORDER BY wm.created_at, w.id LIMIT 1`, [userId]);
  return rows[0];
}

export type Opportunity = {
  monitor_state:string; monitor_success:Date|null; monitor_failures:number; monitor_evidence:string; id: string; slug: string; name: string; funder: string; summary: string; eligibility_notes: string; deadline_notes: string;
  official_url: string; source_url: string; minimum_award: string | null; maximum_award: string | null; currency: string;
  deadline_at: Date | null; opens_at: Date | null; rolling: boolean; status: string; verification_status: string;
  publication_origin:string; publication_state:string; source_fetched_at:Date|null; last_verified_at:Date|null; last_checked_at: Date | null; categories: string[]; applicant_types: string[]; saved: boolean; fresh: boolean;
  locations: string[]; total: string; awaiting_review:boolean;
};
const base = `SELECT o.*, coalesce(m.state,'active') AS monitor_state,m.last_success_at AS monitor_success,coalesce(m.consecutive_failures,0) AS monitor_failures,m.evidence AS monitor_evidence, coalesce(f.name,'Unknown') AS funder,
  EXISTS(SELECT 1 FROM crawl_candidates cc WHERE cc.opportunity_id=o.id AND cc.status='pending' AND cc.kind='changed') AS awaiting_review,
  CASE WHEN m.state='discontinued' THEN 'closed' WHEN o.deadline_at < now() THEN 'closed'
    WHEN o.opens_at > now() THEN 'upcoming'
    WHEN o.application_status='upcoming' AND o.opens_at <= now() THEN 'open'
    ELSE o.application_status END AS status,
  (o.last_checked_at >= now() - interval '90 days') AS fresh,
  ARRAY(SELECT category FROM opportunity_categories WHERE opportunity_id=o.id ORDER BY category) AS categories,
  ARRAY(SELECT applicant_type FROM opportunity_applicant_types WHERE opportunity_id=o.id ORDER BY applicant_type) AS applicant_types,
  ARRAY(SELECT coalesce(city,state,country,'No location restriction published') FROM opportunity_geographies WHERE opportunity_id=o.id) AS locations,
  EXISTS(SELECT 1 FROM saved_opportunities s WHERE s.opportunity_id=o.id AND s.workspace_id=$1) AS saved
  FROM opportunities o LEFT JOIN funders f ON f.id=o.funder_id LEFT JOIN catalog_monitoring m ON m.opportunity_id=o.id
  WHERE NOT o.is_demo AND o.publication_state='published' AND o.verification_status <> 'archived'`;

export async function allSavedOpportunities(db:Database,userId:string) {
 const w=await currentWorkspace(db,userId);if(!w)throw new Error("Workspace required");
 return (await db.query<Opportunity>(`WITH c AS (${base}) SELECT c.* FROM c WHERE saved ORDER BY deadline_at NULLS LAST,name`,[w.id])).rows;
}

export async function searchOpportunities(db: Database, userId: string, filters: Filters) {
  const workspace = await currentWorkspace(db,userId);
  if (!workspace) throw new Error("Workspace required");
  const values: unknown[] = [workspace.id];
  const clauses: string[] = filters.saved ? [] : ["monitor_state <> 'discontinued'"];
  const bind = (v: unknown) => { values.push(v); return `$${values.length}`; };
  if (filters.q) {
    for (const term of filters.q.split(/\s+/).slice(0,20)) {
      const literal = term.replace(/[\\%_]/g, "\\$&");
      const p = bind(`%${literal}%`);
      clauses.push(`(name ILIKE ${p} ESCAPE '\\' OR summary ILIKE ${p} ESCAPE '\\' OR funder ILIKE ${p} ESCAPE '\\'
        OR eligibility_notes ILIKE ${p} ESCAPE '\\' OR array_to_string(categories,' ') ILIKE ${p} ESCAPE '\\')`);
    }
  }
  if(filters.freshness==='new')clauses.push("created_at >= now()-interval '7 days'");
  if(filters.freshness==='updated')clauses.push("catalog_updated_at >= now()-interval '7 days'");
  if (filters.category) clauses.push(`${bind(filters.category)}=ANY(categories)`);
  if (filters.applicant) clauses.push(`${bind(filters.applicant)}=ANY(applicant_types)`);
  if (filters.status) clauses.push(`status=${bind(filters.status)}`);
  if (filters.minAward) clauses.push(`maximum_award >= ${bind(filters.minAward)}`);
  if (filters.saved) clauses.push("saved");
  if (filters.location) clauses.push(`EXISTS(SELECT 1 FROM opportunity_geographies g WHERE g.opportunity_id=c.id AND g.rule='eligible' AND ${filters.location === "nyc_only"
    ? "g.city='New York City'"
    : "(g.country IS NULL OR g.country='United States') AND (g.state IS NULL OR g.state='New York') AND (g.city IS NULL OR g.city='New York City')"})`);
  if (filters.suggested) {
    clauses.push(`${bind(workspace.applicant_type)}=ANY(applicant_types)`);
    clauses.push(`categories && ${bind(workspace.categories)}::text[]`);
    clauses.push("status IN ('open','upcoming')");
    clauses.push(`EXISTS(SELECT 1 FROM opportunity_geographies g WHERE g.opportunity_id=c.id AND g.rule='eligible'
      AND (g.country IS NULL OR lower(g.country)=lower(${bind(workspace.country)}))
      AND (g.state IS NULL OR lower(g.state)=lower(${bind(workspace.state)}))
      AND (g.city IS NULL OR lower(g.city)=lower(${bind(workspace.city)}))
      AND (g.borough IS NULL OR lower(g.borough)=lower(${bind(workspace.borough)})))`);
  }
  const order = filters.sort === "amount" ? "maximum_award DESC NULLS LAST, name, id" : filters.sort === "recent" ? "last_checked_at DESC NULLS LAST, name, id" : "CASE status WHEN 'open' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'unknown' THEN 2 WHEN 'unannounced' THEN 3 ELSE 4 END, deadline_at ASC NULLS LAST, name, id";
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const count = await db.query(`WITH c AS (${base}) SELECT count(*) AS total FROM c ${where}`,values);
  const offset = bind((filters.page-1)*12);
  const result = await db.query<Opportunity>(`WITH c AS (${base}) SELECT c.* FROM c ${where} ORDER BY ${order} LIMIT 12 OFFSET ${offset}`,values);
  return { rows: result.rows, total: Number(count.rows[0].total), workspace };
}

export async function catalogCoverage(db: Database) {
  const { rows } = await db.query<{ category: string; total: number }>(`
    SELECT c.category, count(DISTINCT o.id)::int AS total
    FROM opportunity_categories c JOIN opportunities o ON o.id=c.opportunity_id
    WHERE NOT o.is_demo AND o.publication_state='published' AND o.verification_status <> 'archived'
    AND NOT EXISTS(SELECT 1 FROM catalog_monitoring m WHERE m.opportunity_id=o.id AND m.state='discontinued')
    GROUP BY c.category`);
  return Object.fromEntries(rows.map(row => [row.category,row.total]));
}

// Pending source leads are public discovery results, independent of editorial publication.
export async function searchCandidates(db:Database,userId:string,filters:Filters,page=1){
 if(!await currentWorkspace(db,userId))throw new Error('Workspace required');
 const empty={rows:[] as {id:string;title:string;url:string;evidence:string;source_name:string;fetched_at:Date;kind:string}[],total:0};
 // A candidate's proposed facts have not been confirmed and cannot establish eligibility.
 if(filters.resultType==='catalog'||filters.saved||filters.suggested||filters.applicant||filters.location||filters.minAward||(filters.status&&filters.status!=='unknown')||filters.freshness==='updated')return empty;
 const values:unknown[]=[];const bind=(v:unknown)=>{values.push(v);return `$${values.length}`;};
 const clauses=["c.status='pending'","c.kind<>'domain'","sn.id IS NOT NULL", "NOT EXISTS(SELECT 1 FROM opportunities o WHERE o.id=c.opportunity_id AND (o.publication_state='hidden' OR o.verification_status='archived' OR o.merged_into IS NOT NULL))"];
 if(filters.resultType!=='all'){
  // Filter before counting and pagination; research pages remain available in the all-results view.
  clauses.push(`c.title ~* ${bind('\\m(grants?|fellowships?|awards?|fund|funding|program)\\M')}`);
  clauses.push(`c.title !~* ${bind('(^[[:space:]]*(how|what|why|where|when|who|can|does|do|is|are|should)\\M|[?？]|\\m(articles?|news|blogs?|tips|guides?|guidelines|faq|questions?|resources?|directories|directory|webinars?|recipients?|winners?|announces?|announced|receives?|received|awarded|stories|jobs?|careers?|performance measures|grant review|reporting|technical assistance|step-by-step)\\M)')}`);
  clauses.push(`c.url !~* ${bind('^https?://[^/]+/([^?#]*/)?(articles?|news|blogs?|press|press-releases?|stories|resources|faq|jobs|careers|recipients|winners)(/|[?#]|$)')}`);
  clauses.push(`c.title !~* ${bind('^[[:space:]]*((all|current|available|our|research)[[:space:]]+)?(grants?|funding|funding opportunities|fellowships?|awards?)([[:space:]]+programs?)?[[:space:]]*$')}`);
  clauses.push(`sn.body ~* ${bind('\\m(apply|applications?|eligib[a-z]*|proposals?|funding|supports?|provides?|awards?)\\M')}`);
  clauses.push("NOT EXISTS(SELECT 1 FROM crawl_publication_results pr WHERE pr.candidate_id=c.id AND pr.outcome='skipped' AND (pr.reason ILIKE '%directory%' OR pr.reason ILIKE '%supporting%' OR pr.reason ILIKE '%non-grant%' OR pr.reason ILIKE '%biography%' OR pr.reason ILIKE '%No recognizable%' OR pr.reason ILIKE '%Insufficient program%'))");
 }
 for(const term of filters.q.split(/\s+/).filter(Boolean).slice(0,20)){
  const p=bind(`%${term.replace(/[\\%_]/g,'\\$&')}%`);
  clauses.push(`(c.title ILIKE ${p} ESCAPE '\\' OR c.evidence ILIKE ${p} ESCAPE '\\' OR s.name ILIKE ${p} ESCAPE '\\' OR array_to_string(s.categories,' ') ILIKE ${p} ESCAPE '\\')`);
 }
 if(filters.category)clauses.push(`${bind(filters.category)}=ANY(s.categories)`);
 if(filters.freshness==='new')clauses.push("c.created_at>=now()-interval '7 days'");
 clauses.push("NOT EXISTS(SELECT 1 FROM catalog_monitoring m JOIN opportunities o ON o.id=m.opportunity_id WHERE m.state='discontinued' AND (o.id=c.opportunity_id OR o.source_url=c.url))");
 const base=`FROM crawl_candidates c JOIN crawl_sources s ON s.id=c.source_id JOIN crawl_snapshots sn ON sn.id=c.snapshot_id WHERE ${clauses.join(' AND ')}`;
 const total=Number((await db.query(`SELECT count(DISTINCT c.url) AS total ${base}`,values)).rows[0].total);
 const offset=bind((Math.max(1,Math.min(10000,Math.floor(page)||1))-1)*12);
 const rows=(await db.query(`SELECT * FROM (SELECT DISTINCT ON(c.url) c.id,c.title,c.url,left(c.evidence,600) AS evidence,s.name AS source_name,sn.fetched_at,c.kind ${base} ORDER BY c.url,sn.fetched_at DESC,c.id) leads ORDER BY fetched_at DESC,url LIMIT 12 OFFSET ${offset}`,values)).rows;
 return {rows,total};
}

export async function getOpportunity(db: Database,userId: string,slug: string) {
  const workspace = await currentWorkspace(db,userId);
  if (!workspace) throw new Error("Workspace required");
  const result = await db.query<Opportunity>(`WITH c AS (${base}) SELECT * FROM c WHERE slug=$2`,[workspace.id,slug]);
  return { opportunity: result.rows[0], workspace };
}

export async function setSavedOpportunity(db: Database,userId: string,opportunityId: string,saved: boolean) {
  // Derive the workspace from the authenticated user. Never accept a workspace ID from the form.
  const workspace = await currentWorkspace(db,userId);
  if (!workspace || !["owner","admin","member"].includes(workspace.role)) throw new Error("Editing is not permitted");
  const opportunity = await db.query("SELECT id FROM opportunities WHERE id=$1 AND NOT is_demo AND publication_state='published' AND verification_status <> 'archived'",[opportunityId]);
  if (!opportunity.rowCount) throw new Error("Opportunity not found");
  if (saved) await db.query(`INSERT INTO saved_opportunities(workspace_id,opportunity_id,saved_by) VALUES($1,$2,$3)
    ON CONFLICT (workspace_id,opportunity_id) DO NOTHING`,[workspace.id,opportunityId,userId]);
  else await db.query("DELETE FROM saved_opportunities WHERE workspace_id=$1 AND opportunity_id=$2",[workspace.id,opportunityId]);
}

export async function discoveryCounts(db: Database,userId: string) {
  const workspace = await currentWorkspace(db,userId);
  if (!workspace) throw new Error("Workspace required");
  const { rows } = await db.query(`WITH c AS (${base}) SELECT count(*) AS catalog,
    count(*) FILTER(WHERE saved) AS saved,
    count(*) FILTER(WHERE saved AND deadline_at BETWEEN now() AND now()+interval '30 days' AND status <> 'closed') AS deadlines FROM c`,[workspace.id]);
  return rows[0];
}
