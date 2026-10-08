import {programFacts,resolveProgramFacts,pageRole} from '../src/lib/discovery/program-evidence';
import {classifyGrant} from '../src/lib/discovery/publish';
import {ownContributions,insertContribution,contributionQuota} from '../src/lib/discovery/contribution-store';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';import dotenv from 'dotenv';
import {contributionInput} from '../src/lib/discovery/contribution-input';
import {processContributions} from '../src/lib/discovery/contributions';
import {beginWorkerSample,finishWorkerSample} from '../src/lib/discovery/worker-metrics';
dotenv.config({path:'.env.local',quiet:true});
test('contribution inputs require safe URLs, real correction fields and bounded private text',()=>{
 const base={url:'https://example.org/grant/?utm_source=test#part',opportunityId:'',field:'program',proposed:'',note:''};
 assert.equal(contributionInput(base).url,'https://example.org/grant');
 for(const url of ['https://127.0.0.1','https://[::1]','http://example.org','https://name:password@example.org','https://example.local'])assert.throws(()=>contributionInput({...base,url}));
 assert.throws(()=>contributionInput({...base,field:'deadline'}));
 assert.throws(()=>contributionInput({...base,note:'a'.repeat(2001)}));
 assert.throws(()=>contributionInput({...base,opportunityId:'00000000-0000-4000-8000-000000000001'}));
});
test('official contributions publish idempotently, ignore assertions, respect locks, leases, pauses and retries',async()=>{
 const db=new pg.Client({connectionString:process.env.DATABASE_URL}),schema='contributions_'+randomBytes(8).toString('hex');await db.connect();
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema},public`);
  for(const f of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+f,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  await db.query('UPDATE crawl_sources SET enabled=false');
  const source=(await db.query("INSERT INTO crawl_sources(name,url,approved_domains) VALUES('Official','https://example.org/grant',ARRAY['example.org']) RETURNING id")).rows[0].id;
  const user=(await db.query("INSERT INTO users(email,beta_active) VALUES('contributor@example.invalid',true) RETURNING id")).rows[0].id;
  const workspace=(await db.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES('Contributor','contributor','individual',$1) RETURNING id",[user])).rows[0].id;
  await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[workspace,user]);
  const stranger=(await db.query("INSERT INTO users(email,beta_active) VALUES('other@example.invalid',true) RETURNING id")).rows[0].id;
  await assert.rejects(()=>ownContributions(db,stranger),/access denied/);
  await assert.rejects(()=>insertContribution(db,stranger,{}),/access denied/);
  for(let n=0;n<10;n++)assert.equal(await contributionQuota(db,user),true);
  assert.equal(await contributionQuota(db,user),false);
  const add=async(url:string,id:string|null=null,field='program')=>(await db.query('INSERT INTO catalog_contributions(source_url,opportunity_id,field) VALUES($1,$2,$3) ON CONFLICT(source_url,opportunity_id,field) DO UPDATE SET source_url=excluded.source_url RETURNING id',[url,id,field])).rows[0].id;
  const contribution=await add('https://example.org/grant');assert.equal(await add('https://example.org/grant'),contribution);
  await db.query('INSERT INTO catalog_contribution_submissions(contribution_id,user_id,proposed_value,note) VALUES($1,$2,$3,$4)',[contribution,user,'Everyone gets $999999','PRIVATE NOTE']);
  const entries=await ownContributions(db,user);assert.equal(entries.length,1);assert.equal(entries[0].note,'PRIVATE NOTE');
  await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'viewer')",[workspace,stranger]);
  assert.equal((await ownContributions(db,stranger)).length,0);
  await assert.rejects(()=>insertContribution(db,stranger,{}),/access denied/);
  let calls=0,amount=5000;
  const reader={policy:async()=>({sitemaps:[],delay:1500,allowed:()=>true}),read:async(url:string)=>{calls++;return {url,title:'Creative Practice Grant',text:`This grant supports creative projects. Applications are open. Grant amounts up to $${amount}. Eligible applicants include individual artists.`,links:[],kind:'html' as const,extracted:{}};}};
  await db.query('UPDATE catalog_automation SET paused=true');await processContributions(db,reader);assert.equal(calls,0);
  await db.query('UPDATE catalog_automation SET paused=false');
  await db.query("UPDATE crawl_worker_lease SET owner=gen_random_uuid(),expires_at=now()+interval '1 minute'");await processContributions(db,reader);assert.equal(calls,0);
  await db.query("UPDATE crawl_worker_lease SET owner=NULL,expires_at='-infinity'");
  await processContributions(db,reader);
  const grant=(await db.query("SELECT * FROM opportunities WHERE source_url='https://example.org/grant'")).rows[0];assert.ok(grant);assert.equal(Number(grant.maximum_award),5000);
  assert.equal((await db.query('SELECT state FROM catalog_contributions WHERE id=$1',[contribution])).rows[0].state,'applied');
  await processContributions(db,reader);assert.equal(calls,1);
  await db.query("UPDATE catalog_contributions SET state='unconfirmed' WHERE id=$1",[contribution]);
  await processContributions(db,reader);assert.equal(calls,1);assert.equal((await db.query('SELECT state FROM catalog_contributions WHERE id=$1',[contribution])).rows[0].state,'applied');
  const correction=await add('https://example.org/grant',grant.id,'maximum');amount=6000;
  await db.query("UPDATE catalog_field_state SET locked=true WHERE opportunity_id=$1 AND field='maximum'",[grant.id]);
  await processContributions(db,reader);assert.equal((await db.query('SELECT state FROM catalog_contributions WHERE id=$1',[correction])).rows[0].state,'decision');assert.equal(Number((await db.query('SELECT maximum_award FROM opportunities WHERE id=$1',[grant.id])).rows[0].maximum_award),5000);
  const unknown=await add('https://unapproved.example/grant');await processContributions(db,reader);assert.equal((await db.query('SELECT state FROM catalog_contributions WHERE id=$1',[unknown])).rows[0].state,'decision');assert.equal(calls,2);
  const retry=await add('https://example.org/retry');await db.query("INSERT INTO crawl_frontier(source_id,url,depth,failures,next_check_at) VALUES($1,'https://example.org/retry',0,2,now()+interval '2 hours')",[source]);await processContributions(db,reader);assert.equal(calls,2);assert.equal((await db.query('SELECT attempts FROM catalog_contributions WHERE id=$1',[retry])).rows[0].attempts,0);
  const sample=await beginWorkerSample(db);await finishWorkerSample(db,sample,calls,'bounded');assert.equal((await db.query('SELECT outcome FROM catalog_worker_samples WHERE id=$1',[sample])).rows[0].outcome,'bounded');
 }finally{await db.query('ROLLBACK');await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});

test('Spencer official fixtures distinguish fixed award, separate program budgets and invitation-only rounds',async()=>{
 const fixtures=JSON.parse(await readFile('tests/fixtures/spencer-contribution-excerpts.json','utf8'));
 for(const f of fixtures){const page={...f,links:[],kind:'html' as const,extracted:{}};const facts=resolveProgramFacts(programFacts(page,f.fetchedAt,new Date(f.fetchedAt)),new Date(f.fetchedAt));
  assert.equal(classifyGrant(f.title,f.url,f.text),null);
  if(f.url.endsWith('vision-grants')){assert.equal(facts.values.maximum,'75000');assert.equal(facts.values.minimum,'75000');}
  else{assert.equal(pageRole(f.title,f.url,f.text),'program');assert.equal(facts.values.maximum,'400000');assert.notEqual(facts.values.status,'open');assert.notEqual(pageRole(f.title,'https://untrusted.example/program',f.text),'program');}
 }
});
