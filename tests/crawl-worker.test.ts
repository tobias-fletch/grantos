import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import pg from 'pg';
import dotenv from 'dotenv';
import { runCrawl } from '../src/lib/discovery/worker';
import { publishBacklog,classifyGrant,likelySameProgram } from '../src/lib/discovery/publish';
import { recordPage } from '../src/lib/discovery/store';
import { robotsPolicy,type CrawlPage } from '../src/lib/discovery/reader';
dotenv.config({path:'.env.local',quiet:true});
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
const guard=new pg.Client({connectionString:process.env.DATABASE_URL});
const schema=`grantos_crawl_test_${randomBytes(8).toString('hex')}`;let sourceId:string;
before(async()=>{
 await db.connect();await guard.connect();await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}",public`);
 for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile(`db/migrations/${file}`,'utf8'));
 await db.query('UPDATE crawl_sources SET enabled=false');
 sourceId=(await db.query("INSERT INTO crawl_sources(name,url,approved_domains) VALUES('Worker fixture','https://worker.example.org/',ARRAY['worker.example.org']) RETURNING id")).rows[0].id;
});
after(async()=>{await guard.end();await db.query(`DROP SCHEMA "${schema}" CASCADE`);await db.end();});
test('publication checkpoints survive replay and changed sources update the same listing',async()=>{
 for(const title of ['Manage a Grant','Get a Grant','Grant listing','Tips for Submitting a Strong Farmer Grant Proposal','Funding at NSF','Amber Grant Rules','Development Manager, Grants & Operations'])assert.ok(classifyGrant(title,'https://worker.example.org/page','Funding applications are available.'));
 assert.ok(classifyGrant('Yulan Grant','https://worker.example.org/recipients/yulan-grant','Grant application funding'));
 assert.ok(likelySameProgram('APPLY NOW FOR AN AMBER GRANT','https://ambergrantsforwomen.com/get-an-amber-grant/apply-now',{name:'Amber Grant for Women',source_url:'https://ambergrantsforwomen.com/get-an-amber-grant/'}));
 assert.ok(likelySameProgram('Grant for Artists','https://www.pkf.org/grants/grant-for-artists',{name:'Pollock-Krasner Artist Grants',source_url:'https://www.pkf.org/how-to-apply/'}));
 const page:CrawlPage={url:'https://worker.example.org/replay-grant',title:'Checkpoint Arts Grant',text:'Funding applications support artists. Version one.',links:[],kind:'html',extracted:{}};
 await recordPage(db,sourceId,page);
 assert.equal((await publishBacklog(db)).published,1);
 const id=(await db.query("SELECT id FROM opportunities WHERE name='Checkpoint Arts Grant'")).rows[0].id;
 assert.deepEqual(await publishBacklog(db),{published:0,updated:0,skipped:0,failed:0});
 await recordPage(db,sourceId,{...page,text:'Funding applications support artists. Version two.'});
 assert.equal((await publishBacklog(db)).updated,1);
 assert.equal((await db.query("SELECT id FROM opportunities WHERE name='Checkpoint Arts Grant'")).rows[0].id,id);
 await recordPage(db,sourceId,page);
 assert.equal((await publishBacklog(db)).updated,1);
 assert.deepEqual(await publishBacklog(db),{published:0,updated:0,skipped:0,failed:0});
});
test('worker uses a singleton lock and resumes checkpoints without rereading successful pages',async()=>{
 const run=(await db.query("INSERT INTO crawl_runs(trigger,page_limit,source_id) VALUES('acceptance',4,$1) RETURNING id",[sourceId])).rows[0].id;
 await guard.query('SELECT pg_advisory_lock(hashtext($1),7823092)',[schema]);assert.equal(await runCrawl(db),false);await guard.query('SELECT pg_advisory_unlock(hashtext($1),7823092)',[schema]);
 const urls:string[]=[];
 const reader={policy:async()=>robotsPolicy(''),read:async(url:string):Promise<CrawlPage>=>{urls.push(url);return {url,title:'Worker grant',text:'An official funding program with detailed application requirements.',links:url.endsWith('/')?['https://worker.example.org/grant','https://worker.example.org/next']:[],kind:'html',extracted:{}};}};
 await runCrawl(db,reader,()=>urls.length>=1);
 assert.equal((await db.query('SELECT status FROM crawl_runs WHERE id=$1',[run])).rows[0].status,'running');
 const first=urls[0];await runCrawl(db,reader);
 assert.equal(urls.filter(u=>u===first).length,1);assert.equal(urls.length,4);
 const completed=(await db.query('SELECT * FROM crawl_runs WHERE id=$1',[run])).rows[0];assert.equal(completed.status,'partial');assert.ok(completed.finished_at);
});
test('50 pages per source and total page limit preserve frontier for later runs',async()=>{
 await db.query('DELETE FROM crawl_frontier WHERE source_id=$1',[sourceId]);
 const run=(await db.query("INSERT INTO crawl_runs(trigger,page_limit,source_id) VALUES('acceptance',1000,$1) RETURNING id",[sourceId])).rows[0].id;
 const visited:string[]=[];
 const reader={policy:async()=>robotsPolicy(''),read:async(url:string):Promise<CrawlPage>=>{visited.push(url);return {url,title:'Grant listing',text:'Current grant opportunities and application information for artists.',links:url.endsWith('/')?Array.from({length:70},(_,i)=>`https://worker.example.org/grant-${i}`):[],kind:'html',extracted:{}};}};
 await runCrawl(db,reader);assert.equal(visited.length,50);
 assert.equal((await db.query('SELECT status FROM crawl_runs WHERE id=$1',[run])).rows[0].status,'partial');
 const next=(await db.query("INSERT INTO crawl_runs(trigger,page_limit,source_id) VALUES('acceptance',5,$1) RETURNING id",[sourceId])).rows[0].id;
 const previous=new Set(visited);visited.length=0;await runCrawl(db,reader);assert.equal(visited.length,5);assert.ok(visited.some(u=>!previous.has(u)));
 assert.equal((await db.query('SELECT count(*) FROM crawl_visits WHERE run_id=$1',[next])).rows[0].count,'5');
});


test('catalog sources are checked without directory links and monitored through failure and return',async()=>{
 const url='https://worker.example.org/monitor-only';
 const id=(await db.query("INSERT INTO opportunities(name,slug,official_url,source_url,funding_type) VALUES('Monitor Acceptance Grant','monitor-acceptance',$1,$1,'grant') RETURNING id",[url])).rows[0].id;
 let fail=false,retired=true;
 const reader={policy:async()=>robotsPolicy(''),read:async(target:string):Promise<CrawlPage>=>{
  if(target===url&&fail)throw Error('Source returned HTTP 404.');
  return {url:target,title:target===url?'Monitor Acceptance Grant':'Directory',text:target===url?(retired?'This program has been permanently discontinued.':'This program is now accepting applications.'):'A directory of funding application information.',links:[],kind:'html',extracted:{}};
 }};
 const run=async()=>{await db.query('DELETE FROM crawl_frontier WHERE source_id=$1',[sourceId]);const id=(await db.query("INSERT INTO crawl_runs(trigger,page_limit,source_id) VALUES('acceptance',50,$1) RETURNING id",[sourceId])).rows[0].id;await runCrawl(db,reader);return id;};
 await run();assert.equal((await db.query('SELECT state FROM catalog_monitoring WHERE opportunity_id=$1',[id])).rows[0].state,'discontinued');
 fail=true;const failed=await run();assert.equal((await db.query('SELECT outcome FROM catalog_monitor_events WHERE opportunity_id=$1 AND run_id=$2',[id,failed])).rows[0].outcome,'failed');
 fail=false;retired=false;await run();const restored=(await db.query('SELECT * FROM catalog_monitoring WHERE opportunity_id=$1',[id])).rows[0];assert.equal(restored.state,'active');assert.equal(restored.consecutive_failures,0);assert.ok(restored.last_success_at);
 await db.query("UPDATE opportunities SET publication_state='hidden' WHERE id=$1",[id]);await run();assert.equal((await db.query('SELECT publication_state FROM opportunities WHERE id=$1',[id])).rows[0].publication_state,'hidden');
});
