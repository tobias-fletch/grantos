import type { Pool, PoolClient, Client } from "pg";

type Database = Pool | PoolClient | Client;
export const categories = ["Nonprofit","Music","Visual Art","Film / Video","Theater","Dance","Writing / Literature","Photography","Research","Education","Community Project","Small Business","Technology","Agriculture / Food"];
export const applicantTypes = ["individual","organization","business","nonprofit","fiscal_sponsored","collective","student","researcher","consultant"];
export type SearchParams = Record<string, string | string[] | undefined>;
export type Filters = { q: string; category: string; applicant: string; location: string; status: string; minAward: number; sort: string; page: number; saved: boolean; suggested: boolean };
export function parseFilters(params: SearchParams): Filters {
  const value = (name: string) => typeof params[name] === "string" ? params[name] as string : "";
  const allowed = (name: string, options: string[], fallback = "") => options.includes(value(name)) ? value(name) : fallback;
  const amount = Number(value("minAward"));
  const page = Number(value("page"));
  return { q: value("q").trim().slice(0,200), category: allowed("category",categories), applicant: allowed("applicant",applicantTypes),
    location: allowed("location",["nyc","nyc_only"]), status: allowed("status",["open","upcoming","closed","unannounced"]),
    minAward: Number.isFinite(amount) && amount >= 0 ? Math.min(amount,100000000) : 0,
    sort: allowed("sort",["deadline","amount","recent"],"deadline"), page: Number.isInteger(page) && page > 0 ? Math.min(page,10000) : 1,
    saved: value("saved") === "1", suggested: value("suggested") === "1" };
}

export async function currentWorkspace(db: Database, userId: string) {
  const { rows } = await db.query(`SELECT w.id, w.name, w.slug, w.kind, wm.role,
    p.applicant_type, p.country, p.state, p.city, p.borough, p.onboarding_completed_at,
    ARRAY(SELECT category FROM profile_categories pc WHERE pc.workspace_id=w.id) AS categories
    FROM workspace_members wm JOIN workspaces w ON w.id=wm.workspace_id
    LEFT JOIN profiles p ON p.workspace_id=w.id WHERE wm.user_id=$1
    ORDER BY wm.created_at, w.id LIMIT 1`, [userId]);
  return rows[0];
}

export type Opportunity = {
  id: string; slug: string; name: string; funder: string; summary: string; eligibility_notes: string; deadline_notes: string;
  official_url: string; source_url: string; minimum_award: string | null; maximum_award: string | null; currency: string;
  deadline_at: Date | null; opens_at: Date | null; rolling: boolean; status: string; verification_status: string;
  last_checked_at: Date | null; categories: string[]; applicant_types: string[]; saved: boolean; fresh: boolean;
  locations: string[]; total: string;
};
const base = `SELECT o.*, f.name AS funder,
  CASE WHEN o.deadline_at < now() THEN 'closed'
    WHEN o.opens_at > now() THEN 'upcoming'
    WHEN o.application_status='upcoming' AND o.opens_at <= now() THEN 'open'
    ELSE o.application_status END AS status,
  (o.last_checked_at >= now() - interval '90 days') AS fresh,
  ARRAY(SELECT category FROM opportunity_categories WHERE opportunity_id=o.id ORDER BY category) AS categories,
  ARRAY(SELECT applicant_type FROM opportunity_applicant_types WHERE opportunity_id=o.id ORDER BY applicant_type) AS applicant_types,
  ARRAY(SELECT coalesce(city,state,country,'No location restriction published') FROM opportunity_geographies WHERE opportunity_id=o.id) AS locations,
  EXISTS(SELECT 1 FROM saved_opportunities s WHERE s.opportunity_id=o.id AND s.workspace_id=$1) AS saved
  FROM opportunities o LEFT JOIN funders f ON f.id=o.funder_id
  WHERE NOT o.is_demo AND o.verification_status <> 'archived'`;

export async function searchOpportunities(db: Database, userId: string, filters: Filters) {
  const workspace = await currentWorkspace(db,userId);
  if (!workspace) throw new Error("Workspace required");
  const values: unknown[] = [workspace.id];
  const clauses: string[] = [];
  const bind = (v: unknown) => { values.push(v); return `$${values.length}`; };
  if (filters.q) {
    const literal = filters.q.replace(/[\\%_]/g, "\\$&");
    const p = bind(`%${literal}%`);
    clauses.push(`(name ILIKE ${p} ESCAPE '\\' OR summary ILIKE ${p} ESCAPE '\\' OR funder ILIKE ${p} ESCAPE '\\')`);
  }
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
  const order = filters.sort === "amount" ? "maximum_award DESC NULLS LAST, name, id" : filters.sort === "recent" ? "last_checked_at DESC NULLS LAST, name, id" : "deadline_at ASC NULLS LAST, name, id";
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const count = await db.query(`WITH c AS (${base}) SELECT count(*) AS total FROM c ${where}`,values);
  const offset = bind((filters.page-1)*12);
  const result = await db.query<Opportunity>(`WITH c AS (${base}) SELECT c.* FROM c ${where} ORDER BY ${order} LIMIT 12 OFFSET ${offset}`,values);
  return { rows: result.rows, total: Number(count.rows[0].total), workspace };
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
  const opportunity = await db.query("SELECT id FROM opportunities WHERE id=$1 AND NOT is_demo AND verification_status <> 'archived'",[opportunityId]);
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
