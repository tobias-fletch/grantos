import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';import dotenv from 'dotenv';
import {spawnSync} from 'node:child_process';
import {pageRole,programFacts,resolveProgramFacts,relatedPage,sameProgramLocation,identifiableProgramName} from '../src/lib/discovery/program-evidence';
import {freezeReconciliation,runReconciliation,applyProgramEvidence} from '../src/lib/discovery/reconcile';
import {recordPage} from '../src/lib/discovery/store';
import type {CrawlPage} from '../src/lib/discovery/reader';
dotenv.config({path:'.env.local',quiet:true});
const now=new Date('2026-10-07T12:00:00Z');
test('standalone worker starts under the repository module format without connecting to a real database',()=>{
 const result=spawnSync(process.execPath,['--import','tsx','scripts/reconcile-catalog.ts'],{env:{...process.env,DISCOVERY_DATABASE_URL:'postgresql://invalid@127.0.0.1:1/invalid'},encoding:'utf8',timeout:15000});
 assert.equal(result.status,1);assert.match(result.stderr,/Reconciliation interrupted; checkpoints retained/);assert.doesNotMatch(result.stderr,/Transform failed|Top-level await/);
});
function page(url:string,title:string,text:string,links:string[]=[]):CrawlPage{return {url,title,text,links,kind:'html',extracted:{}};}
test('page roles exclude announcements and directories; official relationships never use title similarity alone',()=>{
 assert.equal(pageRole('Grant recipients announced','https://example.org/news','applications open'),'announcement');
 assert.equal(pageRole('Funding overview','https://example.org/funding','apply for grants'),'directory');
 const grant={name:'Creative Practice Grant',source_url:'https://example.org/creative'};
 assert.equal(relatedPage(grant,page('https://example.org/different','Creative Practice Grant','Apply now')),null);
 assert.equal(relatedPage(grant,page('https://example.org/creative/faq','FAQ','Requirements')),'official-program-subpage');
 assert.equal(relatedPage(grant,page('https://other.org/creative/faq','FAQ','Creative Practice Grant'),true),null);
 assert.equal(sameProgramLocation('https://example.org/program/','https://www.example.org/program'),true);
 assert.equal(sameProgramLocation('https://example.org/program','https://example.org/directory'),false);
 assert.equal(identifiableProgramName('Amber Grant for Women','Funding supports applications.'),true);
 assert.equal(identifiableProgramName('Frequently Asked Questions','Funding supports applications.'),false);
});
test('combined evidence distinguishes current conflicts, historical rounds and absent application status',()=>{
 const extract=(p:CrawlPage)=>programFacts(p,now.toISOString(),now);
 const program=page('https://example.org/creative','Creative Practice Grant 2026','Funding supports artists. Deadline: December 15, 2026.');
 const faq=page('https://example.org/creative/faq','FAQ','Creative Practice Grant requirements.');
 const application=page('https://example.org/creative/application','Application','2026 applications are open.');
 const old=page('https://example.org/creative/old.pdf','Guidelines 2024','Applications are closed. Deadline: 2024-01-01.');
 assert.equal(resolveProgramFacts(extract(program),now).values.status,undefined);
 assert.equal(resolveProgramFacts([...extract(program),...extract(application),...extract(faq),...extract(old)],now).values.status,'open');
 assert.equal(resolveProgramFacts(extract(old),now).values.status,undefined);
 const conflict=page('https://example.org/creative/guidelines','Guidelines 2026','Applications are closed.');
 assert.match(resolveProgramFacts([...extract(application),...extract(conflict)],now).reasons.status,/Conflicting/);
 const dated=page('https://example.org/old','Old Grant','Applications are open. Deadline: 2020-01-01.');
 assert.equal(resolveProgramFacts(extract(dated),now).values.status,undefined);
});
test('reconciliation freezes inventory, resumes, combines official program/FAQ/PDF, hides noise and preserves verified facts',async()=>{
 const db=new pg.Client({connectionString:process.env.DATABASE_URL}),schema='reconcile_'+randomBytes(8).toString('hex');await db.connect();
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema},public`);
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+file,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  await db.query("UPDATE opportunities SET publication_state='hidden'");await db.query('UPDATE crawl_sources SET enabled=false');
  const source=(await db.query("INSERT INTO crawl_sources(name,url,approved_domains) VALUES('Official','https://example.org',ARRAY['example.org']) RETURNING id")).rows[0].id;
  const url='https://example.org/creative';
  const id=(await db.query("INSERT INTO opportunities(name,slug,source_url,official_url,funding_type,publication_origin,application_status) VALUES('Creative Practice Grant','creative',$1,$1,'grant','crawler','unknown') RETURNING id",[url])).rows[0].id;
  const faqGrant=(await db.query("INSERT INTO opportunities(name,slug,source_url,official_url,funding_type,publication_origin,application_status) VALUES('Established Artists Grant','artists','https://example.org/faq-only','https://example.org/faq-only','grant','crawler','unknown') RETURNING id")).rows[0].id;
  const documents=new Map<string,CrawlPage>([
   [url,page(url,'Creative Practice Grant','Funding supports artists. Deadline: December 15, 2026.',[url+'/application',url+'/faq',url+'/guidelines.pdf'])],
   [url+'/application',page(url+'/application','Application','2026 applications are open.')],
   [url+'/faq',page(url+'/faq','FAQ','Creative Practice Grant requirements and helpful answers.')],
   [url+'/guidelines.pdf',{...page(url+'/guidelines.pdf','guidelines.pdf','Creative Practice Grant 2026. Maximum grant amount: USD 5,000.'),kind:'pdf'}],
   ['https://example.org/news',page('https://example.org/news','Grant winners announced','Creative Practice Grant awards announced.')],
   ['https://example.org/faq-only',page('https://example.org/faq-only','Frequently Asked Questions','Funding supports artists. Applications are open.')]
  ]);
  await recordPage(db,source,documents.get('https://example.org/news')!);
  const run=await freezeReconciliation(db);assert.equal(await freezeReconciliation(db),run);
  const read=async(u:string)=>{assert.ok(documents.has(u));return documents.get(u)!;};
  const reader={read,policy:async()=>({sitemaps:[],delay:1500,allowed:()=>true})};
  const first=await runReconciliation(db,reader,()=>false,1);assert.equal(first.pages,1);assert.ok(first.unfinished>0);
  await db.query("UPDATE catalog_reconciliation_items SET next_attempt_at=now() WHERE run_id=$1",[run]);
  await runReconciliation(db,reader);
  const grant=(await db.query('SELECT * FROM opportunities WHERE id=$1',[id])).rows[0];assert.equal(grant.application_status,'open');assert.equal(Number(grant.maximum_award),5000);assert.equal(grant.name,'Creative Practice Grant');
  assert.equal(Number((await db.query('SELECT count(*) FROM program_evidence_pages WHERE opportunity_id=$1',[id])).rows[0].count),4);
  assert.equal(Number((await db.query("SELECT count(*) FROM opportunities WHERE publication_state='published'")).rows[0].count),2);
  const retained=(await db.query('SELECT publication_state,application_status FROM opportunities WHERE id=$1',[faqGrant])).rows[0];
  assert.equal(retained.publication_state,'published');assert.equal(retained.application_status,'unknown');
  assert.equal((await runReconciliation(db,reader)).pages,0);
  await db.query("UPDATE opportunities SET verification_status='verified',last_verified_at=now(),application_status='closed' WHERE id=$1",[id]);
  await applyProgramEvidence(db,id);assert.equal((await db.query('SELECT application_status FROM opportunities WHERE id=$1',[id])).rows[0].application_status,'closed');
  await db.query("UPDATE opportunities SET publication_state='hidden' WHERE id=$1",[id]);await applyProgramEvidence(db,id);assert.equal((await db.query('SELECT publication_state FROM opportunities WHERE id=$1',[id])).rows[0].publication_state,'hidden');
  for(let n=0;n<6;n++){
   const base='https://example.org/bounded-'+n;
   await db.query("INSERT INTO opportunities(name,slug,source_url,official_url,funding_type,publication_origin) VALUES($1,$2,$3,$3,'grant','crawler')",['Bounded Program Grant '+n,'bounded-'+n,base]);
   const links=Array.from({length:25},(_,i)=>base+'/guidelines-'+i+'.pdf');
   documents.set(base,page(base,'Bounded Program Grant '+n,'Funding supports applications.',links));
   for(const link of links)documents.set(link,{...page(link,'Guidelines','Bounded Program Grant '+n+' requirements.'),kind:'pdf'});
  }
  await freezeReconciliation(db);
  const bounded=await runReconciliation(db,reader);assert.equal(bounded.pages,50);assert.ok(bounded.unfinished>0);
  assert.equal((await db.query('SELECT 1 FROM catalog_reconciliation_pages GROUP BY item_id HAVING count(*)>11')).rowCount,0);
  await db.query("UPDATE crawl_worker_lease SET owner=gen_random_uuid(),expires_at=now()+interval '10 minutes' WHERE id=1");
  assert.equal((await runReconciliation(db,reader)).pages,0);
  await db.query("UPDATE crawl_worker_lease SET owner=NULL,expires_at='-infinity' WHERE id=1");
  await db.query('UPDATE crawl_sources SET enabled=false WHERE id=$1',[source]);
  assert.equal((await runReconciliation(db,reader)).pages,0);
 }finally{await db.query('ROLLBACK');await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});
