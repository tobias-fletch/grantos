import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import {pageRole,programFacts,resolveProgramFacts} from '../src/lib/discovery/program-evidence';
import {freezeReconciliation,runReconciliation} from '../src/lib/discovery/reconcile';
import {settleReconciliation,reconciliationSummary} from '../src/lib/discovery/reconciliation-summary';
import {unifiedSearch} from '../src/lib/opportunities/results';
import {parseFilters} from '../src/lib/opportunities/store';
import {writeField,fieldValue} from '../src/lib/discovery/program-store';
dotenv.config({path:'.env.local',quiet:true});
const now=new Date('2026-10-08T12:00:00Z');
test('stored official fixtures establish ranges and recurrence without inventing dates or annual-report funding',async()=>{
 const fixtures=JSON.parse(await readFile('tests/fixtures/catalog-quality-excerpts.json','utf8'));
 const values=fixtures.map((f:any)=>resolveProgramFacts(programFacts({url:f.url,title:f.title,text:f.title+'. '+f.excerpts.join('. '),extracted:{}},f.fetchedAt,now),now).values);
 assert.equal(values[0].minimum,'30000');assert.equal(values[0].maximum,'150000');assert.equal(values[0].recurrence,'annual');
 assert.equal(values[4].maximum,'45000');assert.equal(values[4].recurrence,'annual');assert.equal(values[4].categories,'["Music"]');
 assert.equal(values[5].recurrence,'annual');assert.equal(values[3].recurrence,'annual');
 for(const i of [1,2,6]){assert.equal(values[i].recurrence,undefined);assert.equal(values[i].status,undefined);}
 for(const v of values)assert.equal(v.deadline,undefined);
 assert.equal(pageRole('"16 Terrific Grants for Women Business Owners"','https://example.org/article','Funding supports businesses'),'directory');
 for(const title of ['2018-grants-recap-APPROVED-FINAL','Grant Archives - Creative Capital','Grant Program Contacts','Grants & Scholarships','The Grants — W. Eugene Smith Fund'])assert.equal(pageRole(title,'https://example.org/page',''),'directory');
 assert.equal(pageRole('DEB Virtual Office Hour: Mid-Career Advancement Solicitation','https://example.org/page',''),'supporting');
 assert.equal(pageRole(fixtures[1].title,fixtures[1].url,fixtures[1].excerpts.join(' ')),'supporting');
});
test('search views and reconciliation outcomes preserve independent pages, retries and category provenance',async()=>{
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const db=new pg.Client({connectionString:process.env.DATABASE_URL}),schema='quality_'+randomBytes(8).toString('hex');await db.connect();
 try{
 await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema},public`);
 for(const f of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+f,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
 await db.query("UPDATE opportunities SET publication_state='hidden'");await db.query('UPDATE crawl_sources SET enabled=false');
 const user=(await db.query("INSERT INTO users(email,beta_active) VALUES('quality@example.invalid',true) RETURNING id")).rows[0].id;
 const ws=(await db.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES('Quality','quality','individual',$1) RETURNING id",[user])).rows[0].id;
 await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,user]);
 const source=(await db.query("INSERT INTO crawl_sources(name,url,approved_domains,enabled) VALUES('Official','https://example.org',ARRAY['example.org'],true) RETURNING id")).rows[0].id;
 let first='';
 for(let i=0;i<14;i++){
 const id=(await db.query("INSERT INTO opportunities(name,slug,source_url,official_url,summary,funding_type,publication_origin,application_status) VALUES($1,$2,$3,$3,'Funding supports applicants','grant','crawler','unknown') RETURNING id",['Quality Grant '+i,'quality-'+i,'https://example.org/grant-'+i])).rows[0].id;if(!i)first=id;
 await db.query("INSERT INTO crawl_candidates(source_id,url,title,kind,hash,evidence,proposed) VALUES($1,$2,$3,'new',$2,'Potential official opportunity; identity not established','{}')",[source,'https://example.org/lead-'+i,'Creative opportunity '+i]);
 }
 await db.query("INSERT INTO crawl_candidates(source_id,url,title,kind,hash,evidence,proposed) VALUES($1,'https://example.org/roundup','16 Terrific Grants for Women Business Owners','new','roundup','Funding supports businesses','{}')",[source]);
 await db.query("INSERT INTO crawl_snapshots(source_id,url,hash,title,body) SELECT source_id,url,hash,title,evidence FROM crawl_candidates WHERE source_id=$1",[source]);
 await db.query('UPDATE crawl_candidates c SET snapshot_id=sn.id FROM crawl_snapshots sn WHERE c.source_id=$1 AND sn.source_id=c.source_id AND sn.url=c.url',[source]);
 const programs=await unifiedSearch(db,user,{programPage:'2',leadPage:'2'});assert.deepEqual(programs.counts,{programs:14,leads:14});assert.equal(programs.rows.length,2);assert.equal(programs.filters.page,2);
 const leads=await unifiedSearch(db,user,{resultType:'leads',programPage:'2',leadPage:'2'});assert.equal(leads.rows.length,2);assert.ok(leads.rows.every(r=>r.recordType==='research'));assert.equal(leads.filters.programPage,2);
 assert.equal((await unifiedSearch(db,user,{resultType:'all',page:'2'})).filters.leadPage,2);
 assert.equal((await unifiedSearch(db,user,{resultType:'grants',page:'2'})).rows.length,2);
 assert.equal((await unifiedSearch(db,user,{status:'open'})).total,0);
 assert.equal((await unifiedSearch(db,user,{minAward:'1'})).total,0);
 assert.equal(parseFilters({}).sort,'recommended');assert.equal(parseFilters({candidatePage:'3'}).leadPage,3);
 await writeField(db,first,'categories',{values:['Music'],origin:'source'});
 let g=(await db.query('SELECT * FROM opportunities WHERE id=$1',[first])).rows[0];const old=await fieldValue(db,g,'categories');
 await writeField(db,first,'categories',{values:['Visual Art'],origin:'official'});await writeField(db,first,'categories',old);
 g=(await db.query('SELECT * FROM opportunities WHERE id=$1',[first])).rows[0];assert.deepEqual(await fieldValue(db,g,'categories'),old);
 const run=await freezeReconciliation(db);
 await db.query("UPDATE catalog_reconciliation_items SET status='ambiguous',reason='Identity unresolved' WHERE run_id=$1",[run]);
 const item=(await db.query("UPDATE catalog_reconciliation_items SET status='blocked',next_attempt_at=now()+interval '2 days' WHERE run_id=$1 AND opportunity_id=$2 RETURNING id",[run,first])).rows[0].id;
 await db.query("UPDATE catalog_reconciliation_pages SET state='failed',attempts=3,next_attempt_at=now()+interval '2 days',reason='Temporary failure' WHERE item_id=$1",[item]);
 const retry=(await db.query('SELECT * FROM catalog_reconciliation_pages WHERE item_id=$1',[item])).rows[0];
 const summary=await settleReconciliation(db,run);assert.equal(summary.unchecked,0);assert.equal(summary.retry_scheduled,1);assert.ok(summary.research_needed>0);
 assert.equal((await db.query('SELECT status FROM catalog_reconciliation_runs WHERE id=$1',[run])).rows[0].status,'complete');
 let calls=0;const reader={policy:async()=>({sitemaps:[],delay:0,allowed:()=>true}),read:async()=>{calls++;throw Error('No network expected before backoff');}};
 await runReconciliation(db,reader);assert.equal(calls,0);
 const next=await freezeReconciliation(db);assert.notEqual(next,run);
 const checkpoint=(await db.query('SELECT p.* FROM catalog_reconciliation_pages p JOIN catalog_reconciliation_items i ON i.id=p.item_id WHERE i.run_id=$1 AND i.opportunity_id=$2',[next,first])).rows[0];
 assert.equal(checkpoint.attempts,3);assert.equal(checkpoint.state,'failed');assert.equal(checkpoint.next_attempt_at.toISOString(),retry.next_attempt_at.toISOString());
 assert.equal((await reconciliationSummary(db,run)).continued_elsewhere,1);
 await db.query("UPDATE catalog_reconciliation_items SET status='ambiguous' WHERE run_id=$1",[next]);await settleReconciliation(db,next);
 await db.query("UPDATE catalog_reconciliation_items SET status='blocked',next_attempt_at=now()-interval '1 minute' WHERE id=$1",[checkpoint.item_id]);
 await db.query("UPDATE catalog_reconciliation_pages SET next_attempt_at=now()-interval '1 minute' WHERE item_id=$1",[checkpoint.item_id]);
 await runReconciliation(db,reader);assert.equal(calls,1);
 assert.equal((await db.query('SELECT attempts FROM catalog_reconciliation_pages WHERE item_id=$1',[checkpoint.item_id])).rows[0].attempts,4);
 }finally{await db.query('ROLLBACK');await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});
