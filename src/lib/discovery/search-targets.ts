import type {Client,PoolClient} from 'pg';
import {catalogAvailabilitySql} from '../opportunities/availability-sql';
import {matchGeography} from '../opportunities/geography';
import {matchesFundingFocus} from '../opportunities/funding-focus';
import {pageRole,identifiableProgramName,publisherIdentity} from './program-evidence';

/** Search targets count supported filter matches, never a guarantee of full eligibility. */
export function targetMatch(row:any,job:any,allowUnknown=false){
 const c=job.search_constraints??{};
 if(!allowUnknown&&(!row.source_checked_at||Date.now()-new Date(row.source_checked_at).getTime()>86400000))return false;
 const text=[row.name,row.funder,row.summary,row.eligibility_notes,...row.categories].join(' ').toLowerCase();
 const terms=String(c.q??'').toLowerCase().split(/\s+/).filter(Boolean);
 if(terms.some(t=>!text.includes(t))||!matchesFundingFocus(text,c.focus??[]))return false;
 const knownCategories=row.categories.length&&!(row.publication_origin==='crawler'&&!['editor','official'].includes(row.publication_provenance?.category_origin));
 if(job.categories.length&&(knownCategories?!job.categories.some((v:string)=>row.categories.includes(v)):!allowUnknown))return false;
 if(!c.applicant||(!row.applicants.includes(c.applicant)&&(!allowUnknown||row.applicants.length)))return false;
 const geographic=matchGeography(row.geographies,job.geography??{}).state;
 if(!job.geography?.country||geographic==='excluded'||(!allowUnknown&&geographic!=='eligible'))return false;
 if(c.minAward&&(row.maximum_award==null?!allowUnknown:Number(row.maximum_award)<c.minAward))return false;
 if(c.freshness==='new'&&Date.now()-new Date(row.created_at).getTime()>7*86400000)return false;
 if(c.freshness==='updated'&&(!row.catalog_updated_at||Date.now()-new Date(row.catalog_updated_at).getTime()>7*86400000))return false;
 const role=pageRole(row.name,row.source_url,row.body??row.summary);
 return role==='program'||identifiableProgramName(row.name,row.body??row.summary,row.source_url);
}
export async function measureSearchTarget(db:Client|PoolClient,job:any){
 const rows=(await db.query(`SELECT o.*,f.name AS funder,${catalogAvailabilitySql} AS status,sn.body,
 greatest(m.last_success_at,o.source_fetched_at,o.last_checked_at,o.last_verified_at) AS source_checked_at,
 ARRAY(SELECT category FROM opportunity_categories WHERE opportunity_id=o.id) categories,
 ARRAY(SELECT applicant_type FROM opportunity_applicant_types WHERE opportunity_id=o.id) applicants,
 coalesce((SELECT jsonb_agg(g) FROM opportunity_geographies g WHERE g.opportunity_id=o.id),'[]') geographies
 FROM opportunities o LEFT JOIN funders f ON f.id=o.funder_id LEFT JOIN catalog_monitoring m ON m.opportunity_id=o.id
 LEFT JOIN LATERAL(SELECT body FROM crawl_snapshots WHERE url=o.source_url ORDER BY fetched_at DESC LIMIT 1) sn ON true
 WHERE NOT o.is_demo AND o.merged_into IS NULL AND o.publication_state='published' AND o.verification_status<>'archived'
 AND coalesce(m.state,'active')<>'discontinued' ORDER BY o.created_at,o.id`)).rows;
 const seen=new Set<string>();let matched=0,watchlist=0;
 const research=rows.filter(r=>targetMatch(r,job,true)&&(!targetMatch(r,job)||r.status==='unknown')).slice(0,10).map(r=>r.id);
 // Prioritize existing research without resetting retry timing or locks.
 if(research.length)await db.query(`INSERT INTO catalog_enrichment_jobs(opportunity_id,source_id,search_priority_until)
 SELECT o.id,(SELECT s.id FROM crawl_sources s WHERE s.enabled AND split_part(o.source_url,'/',3)=ANY(s.approved_domains) ORDER BY s.id LIMIT 1),now()+interval '1 day'
 FROM opportunities o WHERE o.id=ANY($1::uuid[])
 ON CONFLICT(opportunity_id) DO UPDATE SET search_priority_until=excluded.search_priority_until`,[research]);
 for(const row of rows){
  if(!targetMatch(row,job))continue;
  let identity:string;try{identity=publisherIdentity(row.source_url);}catch{continue;}
  if(seen.has(identity))continue;seen.add(identity);
  if(row.status===(job.search_constraints?.status||'open'))matched++;
  if(['upcoming','between_rounds'].includes(row.status))watchlist++;
 }
 await db.query('UPDATE search_discovery_jobs SET matched_count=$2,watchlist_count=$3,match_checked_at=now() WHERE id=$1',[job.id,matched,watchlist]);
 return {matched,watchlist};
}

// Related concepts guide research only; they never weaken eligibility filters.
export function researchTerms(terms:string[]){
 const related:Record<string,string[]>={music:['performing','artist'],film:['cinema','filmmaker'],theater:['theatre','performing'],writing:['literature','author'],technology:['innovation','research'],nonprofit:['community','charity']};
 return [...new Set(terms.flatMap(t=>[t,...(related[t]??[])]))];
}
