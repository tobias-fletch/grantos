import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';import dotenv from 'dotenv';
import {programFacts,resolveProgramFacts,pageRole} from '../src/lib/discovery/program-evidence';
import {attachEvidence,applyProgramEvidence} from '../src/lib/discovery/program-store';
import {runEnrichment,rankResearchLinks} from '../src/lib/discovery/enrichment';
import {boundedReader} from '../src/lib/discovery/catalog-scheduler';
import {fieldCommand} from '../src/lib/discovery/admin';
import {recordPage} from '../src/lib/discovery/store';
import type {CrawlPage} from '../src/lib/discovery/reader';
dotenv.config({path:'.env.local',quiet:true});
const now=new Date('2026-10-07T12:00:00Z');
function page(url:string,title:string,text:string,links:string[]=[]):CrawlPage{return {url,title,text,links,kind:'html',extracted:{}};}
test('real USDA and Spencer evidence extracts USD maxima and explicit status without award totals',async()=>{
 const fixtures=JSON.parse(await readFile('tests/fixtures/official-program-excerpts.json','utf8'));
 for(const f of fixtures){const result=resolveProgramFacts(programFacts(page(f.url,f.title,f.excerpts.join('. ')),f.fetchedAt,now),now);
  assert.equal(result.values.maximum,f.url.includes('usda.gov')?'1000000':'50000');
  if(f.url.includes('usda.gov')){assert.equal(result.values.minimum,'50000');assert.equal(result.values.status,'closed');}
 }
});
test('cross-year rounds, rolling applications, amount ranges and explicit eligibility retain evidence',()=>{
 const p=page('https://example.org/grant','Creative Grant 2026–2027','Applications are open. Deadline: January 15, 2027. Grant amounts range from $5,000 to $20,000. Eligible applicants include individual artists. Applicants must reside in New York City.');
 const facts=programFacts(p,now.toISOString(),now),v=resolveProgramFacts(facts,now).values;
 assert.equal(v.status,'open');assert.equal(v.deadline,'2027-01-15');assert.equal(v.maximum,'20000');assert.equal(v.minimum,'5000');assert.deepEqual(JSON.parse(v.applicants!),['individual']);assert.equal(JSON.parse(v.geography!)[0].city,'New York City');
 const rolling=programFacts(page('https://example.org/faq','FAQ','Applications are accepted on a rolling basis.'),now.toISOString(),now);
 assert.equal(resolveProgramFacts(rolling,now).values.rolling,'true');
 assert.equal(resolveProgramFacts(rolling,now).values.status,'open');
 assert.equal(resolveProgramFacts([...facts,...rolling],now).values.deadline,undefined);
 const negative=programFacts(page('https://example.org/grant','Creative Grant','Eligible applicants include organizations, but not individual artists. Funding supports applicants.'),now.toISOString(),now);
 assert.equal(negative.some(f=>f.field==='applicants'),false);
});
test('shared reader enforces aggregate and per-source budgets across worker phases',async()=>{
 let calls=0;const base={read:async(url:string)=>{calls++;return page(url,'Grant','Funding supports applicants.');},policy:async()=>({sitemaps:[],delay:1500,allowed:()=>true})};
 const reader=boundedReader(base,60);
 for(let i=0;i<50;i++)await reader.read('https://one.example/'+i,['one.example']);
 assert.equal(reader.canRead('https://one.example',['one.example']),false);
 await assert.rejects(()=>reader.read('https://one.example/51',['one.example']));
 for(let i=0;i<10;i++)await reader.read('https://two.example/'+i,['two.example']);
 assert.equal(reader.pages,60);assert.equal(calls,60);assert.equal(reader.canRead('https://three.example',['three.example']),false);
 assert.equal(rankResearchLinks('Creative Practice Grant',['deadline'],['https://example.org/news','https://example.org/creative/application'])[0],'https://example.org/creative/application');
 assert.deepEqual(rankResearchLinks('Creative Practice Grant',['deadline'],['http://example.org/creative/application','mailto:grants@example.org','https://127.0.0.1/application','not a URL']),[]);
});
test('eligibility excerpts keep abbreviations intact and reject truncated sentences',()=>{
 assert.equal(pageRole('Anatomy of a WomensNet Grant Application','https://ambergrantsforwomen.com/anatomy-of-a-womensnet-grant-application-2','This grant supports applicants.'),'supporting');
 const text='Applicants must be domestic entities owned, operated, and located within the 50 U.S. states and territories. Funding supports projects.';
 const result=programFacts(page('https://www.ams.usda.gov/services/grants/lfpp','Local Food Promotion Program',text),now.toISOString(),now);
 assert.equal(result.find(f=>f.field==='eligibility')?.value,'Applicants must be domestic entities owned, operated, and located within the 50 U.S. states and territories.');
 const clauses=programFacts(page('https://example.org/grant','Research Grant','This grant supports research. Open to projects using quantitative methods. Open to projects using varied data sources.'),now.toISOString(),now);
 assert.equal(resolveProgramFacts(clauses,now).values.eligibility,'Open to projects using quantitative methods. Open to projects using varied data sources.');
});
test('enrichment resumes, audits verified changes, preserves missing facts, locks and restores fields, and rejects unauthorized actions',async()=>{
 const db=new pg.Client({connectionString:process.env.DATABASE_URL}),schema='cataloger_'+randomBytes(8).toString('hex');await db.connect();
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema},public`);
  for(const f of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+f,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  await db.query("UPDATE opportunities SET publication_state='hidden'");await db.query('UPDATE crawl_sources SET enabled=false');
  const url='https://example.org/creative',s=(await db.query("INSERT INTO crawl_sources(name,url,approved_domains) VALUES('Official',$1,ARRAY['example.org']) RETURNING id",[url])).rows[0].id;
  const id=(await db.query("INSERT INTO opportunities(name,slug,source_url,official_url,funding_type,publication_origin,application_status,verification_status,last_verified_at,maximum_award) VALUES('Creative Practice Grant','creative',$1,$1,'grant','crawler','unknown','verified',now(),1234) RETURNING id",[url])).rows[0].id;
  const documents=new Map([[url,page(url,'Creative Practice Grant','Funding supports artists.',[url+'/guidelines.pdf'])],[url+'/guidelines.pdf',page(url+'/guidelines.pdf','Guidelines','Creative Practice Grant. Maximum grant amount: USD 5,000. Eligible applicants include individual artists. Applicants must reside in New York City.')]]);
  let calls=0;const reader={read:async(u:string)=>{calls++;if(!documents.has(u))throw Error('Unavailable');const p=documents.get(u)!;return {...p,url:p.url.endsWith('.pdf')?p.url:p.url+'/'};},policy:async()=>({sitemaps:[],delay:1500,allowed:()=>true})};
  await runEnrichment(db,reader,()=>false,1);
  assert.equal((await db.query('SELECT state FROM catalog_enrichment_jobs WHERE opportunity_id=$1',[id])).rows[0].state,'running');
  await db.query('UPDATE catalog_enrichment_jobs SET next_attempt_at=now()');await runEnrichment(db,reader,()=>false,10);
  let g=(await db.query('SELECT * FROM opportunities WHERE id=$1',[id])).rows[0];assert.equal(Number(g.maximum_award),5000);assert.equal(g.last_verified_at,null);assert.equal(g.verification_status,'needs_verification');
  assert.equal((await db.query('SELECT count(*) FROM opportunity_applicant_types WHERE opportunity_id=$1',[id])).rows[0].count,'1');
  const history=Number((await db.query('SELECT count(*) FROM catalog_field_history WHERE opportunity_id=$1',[id])).rows[0].count);
  await db.query('BEGIN');await applyProgramEvidence(db,id);await db.query('COMMIT');assert.equal(Number((await db.query('SELECT count(*) FROM catalog_field_history WHERE opportunity_id=$1',[id])).rows[0].count),history);
  await assert.rejects(()=>fieldCommand(db,'00000000-0000-0000-0000-000000000001','lock-field',id,'maximum'),/editor access/);
  const owner=(await db.query("INSERT INTO users(email,beta_active,beta_owner,catalog_editor,email_verified_at) VALUES('editor@test.invalid',true,true,true,now()) RETURNING id")).rows[0].id;
  await db.query('BEGIN');await fieldCommand(db,owner,'rollback-field',id,'maximum');await db.query('COMMIT');
  assert.equal(Number((await db.query('SELECT maximum_award FROM opportunities WHERE id=$1',[id])).rows[0].maximum_award),1234);
  await db.query('BEGIN');await applyProgramEvidence(db,id);await db.query('COMMIT');assert.equal((await db.query("SELECT state FROM catalog_field_state WHERE opportunity_id=$1 AND field='maximum'",[id])).rows[0].state,'locked_conflict');
  await db.query('BEGIN');await fieldCommand(db,owner,'unlock-field',id,'maximum');await applyProgramEvidence(db,id);await db.query('COMMIT');
  assert.equal(Number((await db.query('SELECT maximum_award FROM opportunities WHERE id=$1',[id])).rows[0].maximum_award),5000);
  await db.query("UPDATE opportunities SET eligibility_notes='Full existing requirements, restrictions, and matching funds.' WHERE id=$1",[id]);
  await db.query('BEGIN');await applyProgramEvidence(db,id);await db.query('COMMIT');
  assert.equal((await db.query('SELECT eligibility_notes FROM opportunities WHERE id=$1',[id])).rows[0].eligibility_notes,'Full existing requirements, restrictions, and matching funds.');
  assert.ok(calls<=3);
 }finally{await db.query('ROLLBACK');await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});

