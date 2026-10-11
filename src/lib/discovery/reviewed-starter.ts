import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client,PoolClient} from 'pg';
import {currentGuidanceCycle,guidanceFields,guidanceUrl} from '../applications/guidance';

const text=z.string().trim().min(1).max(12000);
const url=z.string().refine(v=>guidanceUrl(v)===v,'Canonical public HTTPS URL required');
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const timestamp=z.string().datetime({offset:true});
const evidence=z.object({sourceUrl:url,excerpt:text,section:z.string().max(300)}).strict();
const source=z.object({url,title:text,role:z.enum(['program','guidelines','application','supporting','directory']).default('program'),body:z.string().max(12000),links:z.array(url).max(100),fetchedAt:timestamp,section:z.string().max(300),accessMethod:z.enum(['official-page','official-document','human-browser-review']),accessNotes:z.string().max(3000)}).strict();
const guidance=evidence.extend({field:z.enum(guidanceFields),value:z.string().trim().min(1).max(3000),applicantScope:z.string().max(1000),cycle:z.string().max(80).nullable(),periodEnd:date.nullable()}).strict();
export const reviewedStarterSchema=z.object({schemaVersion:z.literal(1),reviewedAt:timestamp,records:z.array(z.object({
 key:z.string().regex(/^[a-z0-9][a-z0-9-]{2,100}$/),region:z.enum(['NY','LA']),name:z.string().min(5).max(250),funder:text,officialUrl:url,
 fundingType:z.enum(['grant','fellowship']),summary:text,cycle:z.string().max(80).nullable(),periodEnd:date.nullable(),
 status:z.enum(['open','upcoming','closed','unknown','unannounced']),rolling:z.boolean(),statusEvidence:evidence.nullable(),
 applicantTypes:z.array(z.string().min(1).max(100)).max(20),applicantTypesComplete:z.literal(false),
 geography:z.array(z.object({country:z.literal('US'),state:z.string().min(2).max(50),city:z.string().max(100).optional(),county:z.string().max(100).optional(),borough:z.string().max(100).optional(),rule:z.enum(['eligible','restricted'])}).strict()).max(30),
 geographyNotes:text,eligibilityNotes:text,unknowns:z.array(text).min(1).max(40),
 conflicts:z.array(z.object({field:z.string().min(1).max(80),reason:text,sourceUrls:z.array(url).min(2)}).strict()).max(20),
 sources:z.array(source).min(1).max(20),guidance:z.array(guidance).min(1).max(80),
 }).strict()).min(1).max(30)}).strict();
export type ReviewedStarter=z.infer<typeof reviewedStarterSchema>;
export type ReviewedRecord=ReviewedStarter['records'][number];
export function validateReviewedStarter(input:unknown,now=Date.now()):ReviewedStarter{
 const manifest=reviewedStarterSchema.parse(input),keys=new Set<string>(),urls=new Set<string>();
 const fresh=(v:string)=>Date.parse(v)<=now&&Date.parse(v)>=now-90*86400000;
 if(!fresh(manifest.reviewedAt))throw Error('Manifest review date is stale or in the future');
 for(const r of manifest.records){
  if(keys.has(r.key)||urls.has(r.officialUrl))throw Error(`Duplicate program identity: ${r.key}`);keys.add(r.key);urls.add(r.officialUrl);
  if(/\bloan\b/i.test(r.fundingType)||/\bloan (program|fund)\b/i.test(r.name))throw Error(`Loan is not a starter grant: ${r.key}`);
  if(new Set(r.sources.map(s=>s.url)).size!==r.sources.length)throw Error(`Duplicate source: ${r.key}`);
  if(!r.sources.some(s=>new URL(s.url).hostname.replace(/^www\./,'')===new URL(r.officialUrl).hostname.replace(/^www\./,'')))throw Error(`Official publisher source missing: ${r.key}`);
  for(const s of r.sources)if(!fresh(s.fetchedAt)||Date.parse(s.fetchedAt)>Date.parse(manifest.reviewedAt))throw Error(`Untrusted, future or stale source: ${r.key}`);
  const supported=(e:z.infer<typeof evidence>)=>r.sources.find(s=>s.url===e.sourceUrl&&s.body.includes(e.excerpt));
  if(r.status!=='unknown'&&(!r.statusEvidence||!supported(r.statusEvidence)))throw Error(`Status lacks exact source evidence: ${r.key}`);
  if(r.status==='open'&&!currentGuidanceCycle(r.cycle,r.periodEnd,r.periodEnd,now))throw Error(`Active status has stale/unresolved cycle: ${r.key}`);
  if(r.status==='upcoming'&&r.periodEnd&&r.periodEnd<new Date(now).toISOString().slice(0,10))throw Error(`Upcoming status has expired closing date: ${r.key}`);
  for(const c of r.conflicts)if(c.sourceUrls.some(u=>!r.sources.some(s=>s.url===u)))throw Error(`Conflict source missing: ${r.key}`);
  for(const g of r.guidance){
   const s=r.sources.find(s=>s.url===g.sourceUrl&&(s.body.includes(g.excerpt)||g.field==='application_url'&&g.excerpt===g.value&&s.links.includes(g.value)));if(!s||g.applicantScope&&!s.body.includes(g.applicantScope))throw Error(`Guidance lacks exact source or scope: ${r.key}/${g.field}`);
   if(g.field==='application_url'? !s.links.includes(g.value):!g.excerpt.includes(g.value))throw Error(`Guidance value is not verbatim or explicitly linked: ${r.key}/${g.field}`);
   if(g.field==='eligibility'&&g.value.length>1000)throw Error(`Eligibility quote too long: ${r.key}`);
   // Historical facts can remain in the audit, but never become actionable guidance.
   if(g.cycle!==r.cycle||g.periodEnd!==r.periodEnd)throw Error(`Guidance cycle differs from reviewed program: ${r.key}`);
  }
 }
 return manifest;
}
export function starterPlan(manifest:ReviewedStarter,now=Date.now()){
 return manifest.records.map(r=>({key:r.key,name:r.name,region:r.region,status:r.status,rolling:r.rolling,sources:r.sources.length,
  currentGuidance:r.guidance.filter(g=>currentGuidanceCycle(g.cycle,g.periodEnd,r.periodEnd,now)&&!r.conflicts.some(c=>c.field===g.field)&&new URL(g.sourceUrl).hostname.replace(/^www\./,'')===new URL(r.officialUrl).hostname.replace(/^www\./,'')&&r.sources.find(s=>s.url===g.sourceUrl)?.role!=='directory').length,
  unknowns:r.unknowns,conflicts:r.conflicts.map(c=>c.field)}));
}
export const reviewedHash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const evidenceHash=(s:ReviewedRecord['sources'][number],manifest:ReviewedStarter)=>reviewedHash({body:s.body,links:s.links,fetchedAt:s.fetchedAt,reviewedAt:manifest.reviewedAt,format:'official-excerpt-only-v1'});
async function appendEvidence(db:Client|PoolClient,r:ReviewedRecord,id:string,manifest:ReviewedStarter){
  for(const s of r.sources){
   const sid=(await db.query('INSERT INTO crawl_sources(name,url,approved_domains,geography,enabled) VALUES($1,$2,$3,$4,false) ON CONFLICT(url) DO NOTHING RETURNING id',[s.title,s.url,[new URL(s.url).hostname],r.geographyNotes])).rows[0]?.id??(await db.query('SELECT id FROM crawl_sources WHERE url=$1',[s.url])).rows[0].id;
   const facts=r.guidance.filter(g=>g.sourceUrl===s.url).map(g=>({...g,rule:'reviewed-starter-v1',reviewMethod:'assistant-reviewed',reviewedAt:manifest.reviewedAt,conflict:r.conflicts.some(c=>c.field===g.field)}));
   const snapshotHash=evidenceHash(s,manifest);
   const snapshot=(await db.query(`INSERT INTO crawl_snapshots(source_id,url,hash,title,body,links,extracted,fetched_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(source_id,url,hash) DO NOTHING RETURNING id`,[sid,s.url,snapshotHash,s.title,s.body,JSON.stringify(s.links),JSON.stringify({format:'official-excerpt-only-v1',accessMethod:s.accessMethod,accessNotes:s.accessNotes,reviewedAt:manifest.reviewedAt,reviewMethod:'assistant-reviewed',starterKey:r.key}),s.fetchedAt])).rows[0]??(await db.query('SELECT id FROM crawl_snapshots WHERE source_id=$1 AND url=$2 AND hash=$3',[sid,s.url,snapshotHash])).rows[0];
   await db.query(`INSERT INTO program_evidence_pages(opportunity_id,url,role,association,snapshot_id,fetched_at,facts) VALUES($1,$2,$6,'program-page',$3,$4,$5)`,[id,s.url,snapshot.id,s.fetchedAt,JSON.stringify(facts),s.role]);
   if(s.url===r.officialUrl)await db.query('INSERT INTO opportunity_source_urls(url,opportunity_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[s.url,id]);
  }
}
export type StarterImportResult={key:string;outcome:string;opportunityId:string|null;currentGuidance:number;reason?:string};
/** Caller owns BEGIN/COMMIT and staging isolation. Never fetches, refreshes, merges or updates an existing program. */
export async function importReviewedStarter(db:Client|PoolClient,input:unknown,now=Date.now(),options:{appendExistingEvidence?:boolean}={}):Promise<StarterImportResult[]>{
 const manifest=reviewedStarterSchema.parse(input),results:{key:string;outcome:string;opportunityId:string|null;currentGuidance:number;reason?:string}[]=[];
 await db.query('SELECT pg_advisory_xact_lock(7823091)');
 const completionKey=reviewedHash({manifest,appendExistingEvidence:options.appendExistingEvidence===true});
 const completed=(await db.query("SELECT subject FROM catalog_admin_events WHERE action='reviewed_staging_manifest_complete'")).rows.map(a=>JSON.parse(a.subject)).find(a=>a.completionKey===completionKey);
 if(completed)return completed.records.map((r:{key:string;opportunityId:string|null})=>({...r,outcome:'unchanged',currentGuidance:0,reason:'Exact manifest already applied; no evidence timestamps refreshed. Runtime freshness still applies.'}));
 validateReviewedStarter(manifest,now);
 for(const r of manifest.records){
  const prior=(await db.query(`SELECT o.* FROM opportunities o LEFT JOIN funders f ON f.id=o.funder_id
   WHERE o.source_url=$1 OR o.official_url=$1 OR o.id IN (SELECT opportunity_id FROM opportunity_source_urls WHERE url=$3)
   OR (lower(o.name)=lower($2) AND lower(f.name)=lower($4)) OR o.publication_provenance->>'starter_key'=$5 LIMIT 1 FOR UPDATE OF o`,[r.officialUrl,r.name,r.officialUrl,r.funder,r.key])).rows[0];
  if(prior){
   const unchanged=prior.publication_provenance?.starter_hash===reviewedHash(r);
   let reason='Existing record and all guidance/locks preserved; no guidance added or refreshed.';
   if(options.appendExistingEvidence&&!unchanged){
    const audits=(await db.query("SELECT subject FROM catalog_admin_events WHERE action='reviewed_staging_evidence_append'")).rows;
    const previous=audits.map(a=>JSON.parse(a.subject)).find(a=>a.opportunityId===prior.id&&a.key===r.key);
    if(previous){results.push({key:r.key,outcome:previous.recordHash===reviewedHash(r)?'unchanged':'skipped-existing',opportunityId:prior.id,currentGuidance:0,reason:previous.recordHash===reviewedHash(r)?'Exact evidence import already recorded; timestamps unchanged.':'Changed review requires explicit editorial reconciliation.'});continue;}
    const unsafe=prior.publication_state!=='published'||prior.verification_status==='archived'||prior.merged_into||prior.is_demo||
     (prior.deadline_at&&r.periodEnd&&new Date(prior.deadline_at).toISOString().slice(0,10)!==r.periodEnd)||
     (await db.query("SELECT 1 FROM catalog_field_state WHERE opportunity_id=$1 AND (locked OR state IN ('conflicting','locked_conflict','inaccessible')) UNION ALL SELECT 1 FROM crawl_candidates WHERE opportunity_id=$1 AND status='pending' AND kind='changed' UNION ALL SELECT 1 FROM catalog_monitoring WHERE opportunity_id=$1 AND state='discontinued'",[prior.id])).rowCount;
    // Any prior snapshot at these URLs can participate in latest-snapshot gating,
    // including another program or a human review. Do not replace or supersede it.
    const collision=(await db.query('SELECT 1 FROM crawl_snapshots WHERE url=ANY($1::text[]) LIMIT 1',[r.sources.map(s=>s.url)])).rowCount;
    if(!unsafe&&!collision&&!r.conflicts.length){
     await appendEvidence(db,r,prior.id,manifest);
     await db.query("INSERT INTO catalog_field_history(opportunity_id,field,old_value,new_value,evidence,parser_version,action) VALUES($1,'guidance','null',$2,$3,'reviewed-starter-v1','reviewed-staging-evidence-append')",[prior.id,JSON.stringify(r.guidance),JSON.stringify({sources:r.sources,reviewedAt:manifest.reviewedAt,method:'assistant-reviewed'})]);
     await db.query("INSERT INTO catalog_admin_events(action,subject) VALUES('reviewed_staging_evidence_append',$1)",[JSON.stringify({opportunityId:prior.id,key:r.key,recordHash:reviewedHash(r),reviewedAt:manifest.reviewedAt,method:'assistant-reviewed'})]);
     results.push({key:r.key,outcome:'evidence-appended',opportunityId:prior.id,currentGuidance:starterPlan({...manifest,records:[r]},now)[0].currentGuidance});continue;
    }
    reason=unsafe?'Protected, changed, inactive or conflicting existing record; evidence not appended.':collision?'Existing snapshots at an incoming source URL are preserved; reconcile evidence explicitly.':'Research source conflicts require explicit editorial reconciliation.';
   }
   results.push({key:r.key,outcome:unchanged?'unchanged':'skipped-existing',opportunityId:prior.id,currentGuidance:0,reason});continue;
  }
  let sourceCollision=false;
  for(const source of r.sources)if((await db.query('SELECT 1 FROM crawl_snapshots WHERE url=$1 AND hash<>$2 LIMIT 1',[source.url,evidenceHash(source,manifest)])).rowCount)sourceCollision=true;
  if(sourceCollision){results.push({key:r.key,outcome:'skipped-source-conflict',opportunityId:null,currentGuidance:0,reason:'Existing source snapshots could be superseded; explicit reconciliation required.'});continue;}
  const id=randomUUID();let funder=(await db.query('SELECT id FROM funders WHERE name=$1 LIMIT 1',[r.funder])).rows[0]?.id;
  if(!funder)funder=(await db.query('INSERT INTO funders(name,website_url) VALUES($1,$2) RETURNING id',[r.funder,new URL(r.officialUrl).origin])).rows[0].id;
  const provenance={method:'assistant-reviewed-official-excerpts',starter_key:r.key,starter_hash:reviewedHash(r),reviewed_at:manifest.reviewedAt,region:r.region,cycle:r.cycle,period_end:r.periodEnd,applicant_types_complete:false,applicant_types:r.applicantTypes,geography_scope:r.geographyNotes,unknowns:r.unknowns,conflicts:r.conflicts,category_origin:'unknown'};
  await db.query(`INSERT INTO opportunities(id,funder_id,name,slug,official_url,source_url,funding_type,summary,eligibility_notes,deadline_notes,application_status,publication_origin,publication_provenance,source_fetched_at,last_checked_at,deadline_at,rolling)
   VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,'Confirm the current cycle and exact deadline on the official source',$9,'editorial',$10,$11,$12,$13,$14)`,[id,funder,r.name,'reviewed-'+r.key,r.officialUrl,r.fundingType,r.summary,r.eligibilityNotes+'\nGeography: '+r.geographyNotes,r.status,JSON.stringify(provenance),r.sources.map(s=>s.fetchedAt).sort().at(-1),manifest.reviewedAt,r.periodEnd,r.rolling]);
  await db.query('INSERT INTO opportunity_source_urls(url,opportunity_id) VALUES($1,$2)',[r.officialUrl,id]);
  for(const type of r.applicantTypes)await db.query('INSERT INTO opportunity_applicant_types(opportunity_id,applicant_type) VALUES($1,$2)',[id,type]);
  for(const g of r.geography)await db.query('INSERT INTO opportunity_geographies(opportunity_id,country,state,city,county,borough,rule) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,g.country,g.state,g.city??null,g.county??null,g.borough??null,g.rule]);
  await appendEvidence(db,r,id,manifest);
  for(const [field,value] of Object.entries({name:r.name,funder:r.funder,summary:r.summary,status:r.status,eligibility:r.eligibilityNotes,geography:r.geography,applicants:r.applicantTypes,guidance:r.guidance,unknowns:r.unknowns})){
   const evidence=r.sources.map(s=>({sourceUrl:s.url,excerpt:s.body,section:s.section,fetchedAt:s.fetchedAt,reviewedAt:manifest.reviewedAt,method:'assistant-reviewed',snapshotFormat:'excerpt-only'}));
   await db.query(`INSERT INTO catalog_field_history(opportunity_id,field,old_value,new_value,evidence,parser_version,action) VALUES($1,$2,'null',$3,$4,'reviewed-starter-v1','reviewed-staging-import')`,[id,field,JSON.stringify(value),JSON.stringify(evidence)]);
  }
  for(const c of r.conflicts)await db.query(`INSERT INTO catalog_field_state(opportunity_id,field,state,evidence,reason,parser_version) VALUES($1,$2,'conflicting',$3,$4,'reviewed-starter-v1') ON CONFLICT DO NOTHING`,[id,c.field,JSON.stringify(c.sourceUrls),c.reason]);
  await db.query(`INSERT INTO catalog_admin_events(action,subject) VALUES('reviewed_staging_import',$1)`,[JSON.stringify({opportunityId:id,key:r.key,manifestHash:reviewedHash(manifest),recordHash:reviewedHash(r),reviewMethod:'assistant-reviewed',reviewedAt:manifest.reviewedAt})]);
  results.push({key:r.key,outcome:'inserted',opportunityId:id,currentGuidance:starterPlan({ ...manifest,records:[r]},now)[0].currentGuidance});
 }
 if(results.every(r=>['inserted','evidence-appended','unchanged'].includes(r.outcome)))await db.query("INSERT INTO catalog_admin_events(action,subject) VALUES('reviewed_staging_manifest_complete',$1)",[JSON.stringify({completionKey,records:results.map(r=>({key:r.key,opportunityId:r.opportunityId}))})]);
 return results;
}
