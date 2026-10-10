import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import dotenv from 'dotenv';
import {aiEnabled,researchTopic,requestFor,citedLinks,reserveResearch,researchOnce,queueResearchLinks,topicKey} from '../src/lib/discovery/ai-research';

test('AI pilot fails closed and only sends bounded broad funding data',()=>{
 const now=new Date('2026-10-10');
 assert.equal(aiEnabled({OPENAI_API_KEY:'test'},now),false);
 assert.equal(aiEnabled({CATALOG_AI_ENABLED:'true'},now),false);
 assert.equal(aiEnabled({CATALOG_AI_ENABLED:'true',OPENAI_API_KEY:'test'},now),true);
 assert.equal(aiEnabled({CATALOG_AI_ENABLED:'true',OPENAI_API_KEY:'test'},new Date('2026-11-10')),false);
 const topic=researchTopic({categories:['Music','secret phrase'],geography:{country:'CA',city:'Toronto',state:'Ontario',postal_code:'M5V2T6'},search_constraints:{q:'private user words',applicant:'individual'},email:'private@example.org',notes:'private notes'});
 const request=requestFor(topic),text=JSON.stringify(request);
 assert.equal(topic.country,'Canada');assert.equal(topic.city,'Toronto');
 for(const privateText of ['M5V2T6','private','secret phrase'])assert.equal(text.includes(privateText),false);
 assert.equal(request.store,false);assert.equal(request.max_tool_calls,1);assert.equal(request.max_output_tokens,3000);
 assert.equal(topicKey(topic),topicKey({...topic,country:'CANADA'}));
});
test('AI prose and unsafe links cannot establish grant facts or source evidence',()=>{
 const response={output:[{type:'message',content:[{type:'output_text',text:'Invented grant https://invented.org. $100000 open now!',annotations:[
  {type:'url_citation',url:'https://example.org/grant?utm_source=ai'},
  {type:'url_citation',url:'https://example.org/grant'},
  {type:'url_citation',url:'http://example.org/grant'},
  {type:'url_citation',url:'https://127.0.0.1/grant'},
  {type:'url_citation',url:'https://example.org/grant?token=secret'},
  {type:'url_citation',url:'https://user:password@example.org/grant'}]}]}]};
 assert.deepEqual(citedLinks(response),['https://example.org/grant']);
});
dotenv.config({path:'.env.local',quiet:true});
test('AI reservations, publication boundary, checkpoints, pauses and caps survive retries',async()=>{
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const db=new pg.Client({connectionString:process.env.DATABASE_URL}),schema='aipilot_'+randomBytes(8).toString('hex');
 await db.connect();
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema},public`);
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+file,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  await db.query("INSERT INTO crawl_sources(name,url,approved_domains,geography) VALUES('Approved','https://example.org',ARRAY['example.org'],'Worldwide')");
  const before=(await db.query('SELECT count(*)::int n FROM opportunities')).rows[0].n;
  let calls=0;
  const request=async()=>{calls++;return {id:'response-test',output:[{type:'message',content:[{annotations:[{type:'url_citation',url:'https://example.org/program'},{type:'url_citation',url:'https://new-funder.org/grant'}]}]}],usage:{input_tokens:10000,output_tokens:200}};};
  assert.equal(await researchOnce(db,{enabled:false,request}),'disabled');assert.equal(calls,0);
  await db.query('UPDATE catalog_automation SET paused=true');assert.equal(await researchOnce(db,{enabled:true,request}),'disabled');assert.equal(calls,0);
  await db.query('UPDATE catalog_automation SET paused=false');
  assert.equal(await researchOnce(db,{enabled:true,request}),'queued');assert.equal(calls,1);
  const row=(await db.query('SELECT * FROM catalog_ai_research')).rows[0];
  assert.equal(row.reserved_cents,10);assert.equal(row.queued_count,1);assert.equal(row.domain_count,1);
  assert.equal((await db.query("SELECT enabled FROM crawl_sources WHERE url='https://new-funder.org'")).rows[0].enabled,false);
  assert.equal((await db.query("SELECT count(*)::int n FROM crawl_candidates WHERE kind='domain' AND title='new-funder.org'")).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM opportunities')).rows[0].n,before);
  // Reprocessing a committed response never incurs another API call or duplicate frontier row.
  await db.query("UPDATE catalog_ai_research SET status='researched' WHERE id=$1",[row.id]);
  await queueResearchLinks(db,row.id);await queueResearchLinks(db,row.id);
  assert.equal((await db.query("SELECT count(*)::int n FROM crawl_frontier WHERE url='https://example.org/program'")).rows[0].n,1);
  assert.equal(calls,1);
  assert.equal(await reserveResearch(db,row.topic),null);
  assert.equal(await researchOnce(db,{enabled:true,request:async()=>{calls++;throw Error('private credential must not be logged');}}),'failed');
  const failed=(await db.query("SELECT * FROM catalog_ai_research WHERE status='failed'")).rows[0];assert.equal(failed.reserved_cents,10);assert.ok(!failed.note.includes('credential'));
  assert.ok(await reserveResearch(db,researchTopic({categories:['Education']})));
  assert.equal(await reserveResearch(db,researchTopic({categories:['Technology']})),null);
  // All attempts, including failed ones, exhaust the monthly allowance. Old day allows testing monthly cap independently.
  await db.query('DELETE FROM catalog_ai_research');
  await db.query("INSERT INTO catalog_ai_research(topic_key,topic,created_at) SELECT 'test-'||n,'{}',date_trunc('month',now()) FROM generate_series(1,100) n");
  assert.equal(await reserveResearch(db,researchTopic({categories:['Music']})),null);
  assert.equal((await db.query('SELECT sum(reserved_cents)::int n FROM catalog_ai_research')).rows[0].n,1000);
  await db.query('DELETE FROM catalog_ai_research');
  const other=new pg.Client({connectionString:process.env.DATABASE_URL});await other.connect();
  try{
   await other.query(`SET search_path TO ${schema},public`);
   const topic=researchTopic({categories:['Music'],geography:{country:'Nigeria',city:'Lagos'}});
   const concurrent=await Promise.all([reserveResearch(db,topic),reserveResearch(other,topic)]);
   assert.equal(concurrent.filter(Boolean).length,1);
  }finally{await other.end();}
 }finally{await db.query('ROLLBACK');await db.query('SET search_path TO public');await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});
