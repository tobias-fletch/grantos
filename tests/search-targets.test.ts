import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import {normalizeLocation,sourceLocationPriority,matchGeography,explicitPlace,usStates} from '../src/lib/opportunities/geography';
import {targetMatch,measureSearchTarget,researchTerms} from '../src/lib/discovery/search-targets';
import {enqueueSearch,runSearchDiscovery,searchIntent} from '../src/lib/discovery/search-jobs';
import {parsePage} from '../src/lib/discovery/reader';
import {searchSubmission} from '../src/lib/opportunities/search-navigation';
import {programFacts,resolveProgramFacts} from '../src/lib/discovery/program-evidence';

test('international locations preserve postal codes, national scopes and country-qualified local scopes',()=>{
 for(const [country,state,city] of [['Canada','Ontario','Toronto'],['United Kingdom','England','London'],['India','Maharashtra','Mumbai'],['Nigeria','Lagos','Lagos'],['Brazil','São Paulo','São Paulo'],['Australia','Victoria','Melbourne']]){
  const t=normalizeLocation({country,state,city});
  assert.equal(sourceLocationPriority(country,t),2);
  assert.equal(sourceLocationPriority(`${state} / ${country}`,t),3);
  assert.equal(sourceLocationPriority(`${city} / ${state} / ${country}`,t),4);
  assert.equal(sourceLocationPriority('Worldwide',t),2);
  assert.equal(sourceLocationPriority('United States',t),0);
  assert.equal(sourceLocationPriority(city,t),0);
  assert.equal(matchGeography([{country,state:null,city:null,borough:null,rule:'eligible'}],t).state,'eligible');
  const place=explicitPlace(`${city}, ${state}, ${country}`);assert.ok(place);assert.equal(place.country,country);
 }
 const ca=normalizeLocation({country:'CA',state:'Ontario',city:'Toronto',postal_code:'m5v 2t6'});
 assert.equal(ca.country,'Canada');assert.equal(ca.postal_code,'M5V2T6');
 assert.equal(sourceLocationPriority('United States / Canada',ca),2);
 assert.equal(normalizeLocation({country:'UK',state:'WA',postal_code:'SW1A 1AA'}).state,'WA');
 assert.equal(normalizeLocation({country:'US',state:'WA'}).state,'Washington');
 assert.equal(sourceLocationPriority('London / Ontario / Canada',normalizeLocation({country:'United Kingdom',city:'London'})),0);
 assert.equal(sourceLocationPriority('Paris / France',normalizeLocation({country:'US',city:'Paris',state:'Texas'})),0);
 assert.equal(explicitPlace('Canada except Ontario'),null);assert.equal(explicitPlace('Ontario, Canada'),null);
 assert.equal(searchIntent({country:'CA',city:'Toronto'}).key,searchIntent({country:'Canada',city:'toronto'}).key);
 for(const [code,state] of Object.entries(usStates))assert.equal(sourceLocationPriority(state,normalizeLocation({country:'US',state:code})),3);
 assert.equal(explicitPlace('Georgia'),null);
 const changed=searchSubmission(new URLSearchParams({country:'Canada',city:'',state:'',postal_code:''}),{country:'',city:'',state:'',postal_code:'',location:'any'},'request');assert.equal(changed.has('location'),false);
});

test('target matches reject unknown requirements, unsupported categories and excluded locations',()=>{
 const job={categories:['Music'],geography:normalizeLocation({country:'Canada',city:'Toronto'}),search_constraints:{applicant:'individual'}};
 const row={name:'Northern Music Fellowship Grant',source_url:'https://example.org/music-grant',source_checked_at:new Date(),summary:'This grant supports musicians.',eligibility_notes:'',categories:['Music'],applicants:['individual'],publication_origin:'crawler',publication_provenance:{category_origin:'official'},geographies:[{country:'Canada',rule:'eligible'}]};
 assert.equal(targetMatch(row,job),true);
 assert.equal(targetMatch({...row,source_checked_at:new Date(0)},job),false);
 assert.equal(targetMatch({...row,applicants:[]},job),false);
 assert.equal(targetMatch({...row,applicants:[]},job,true),true);
 assert.equal(targetMatch({...row,applicants:['business']},job,true),false);
 assert.equal(targetMatch({...row,geographies:[]},job),false);
 assert.equal(targetMatch({...row,geographies:[{country:'United States',rule:'eligible'}]},job,true),false);
 assert.equal(targetMatch({...row,publication_provenance:{}},job),false);
 assert.equal(targetMatch(row,{...job,search_constraints:{applicant:'individual',minAward:100}}),false);
 assert.ok(researchTerms(['music']).includes('performing'));
});

test('explicit residency extraction supports countries and qualified cities without guessing ambiguous places',()=>{
 const now=new Date();
 for(const place of ['Canada','Louisiana','Toronto, Ontario, Canada','Mumbai, Maharashtra, India']){
  const p={url:'https://example.org/grant',title:'Northern Music Fellowship Grant',text:`Applicants must reside in ${place}. Applications are open.`,kind:'html' as const,links:[],extracted:{}};
  const facts=resolveProgramFacts(programFacts(p,now.toISOString(),now),now).values;
  assert.deepEqual(JSON.parse(facts.geography!),[explicitPlace(place)]);
 }
 for(const place of ['Springfield','Canada except Ontario','Ontario, Canada']){
  const p={url:'https://example.org/grant',title:'Northern Music Fellowship Grant',text:`Applicants must reside in ${place}.`,kind:'html' as const,links:[],extracted:{}};
  assert.equal(programFacts(p,now.toISOString(),now).some(f=>f.field==='geography'),false);
 }
});

dotenv.config({path:'.env.local',quiet:true});
test('search targets count unique open matches separately, expand source waves and preserve research backoff',async()=>{
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const db=new pg.Client({connectionString:process.env.DATABASE_URL}),schema='targets_'+randomBytes(8).toString('hex');await db.connect();
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema},public`);
  for(const f of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+f,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  await db.query("UPDATE opportunities SET publication_state='hidden'");await db.query('UPDATE crawl_sources SET enabled=false');
  for(let i=0;i<9;i++)await db.query("INSERT INTO crawl_sources(name,url,approved_domains,geography,categories) VALUES($1,$2,ARRAY['example.org'],'Canada',ARRAY['Music'])",['Canadian funding '+i,'https://example.org/source-'+i]);
  const params={country:'Canada',city:'Toronto',category:'Music',applicant:'individual'};
  await db.query('BEGIN');const id=await enqueueSearch(db,params);await db.query('COMMIT');
  for(let i=0;i<13;i++){
   const grant=(await db.query(`INSERT INTO opportunities(name,slug,source_url,official_url,summary,funding_type,publication_origin,application_status,publication_provenance,last_checked_at)
    VALUES($1,$2,$3,$3,'This grant supports musicians.','grant','crawler',$4,'{"category_origin":"official"}',now()) RETURNING id`,['Music Grant '+i,'music-'+i,'https://example.org/grant-'+i,i<10?'open':i<12?'upcoming':'unknown'])).rows[0].id;
   await db.query("INSERT INTO opportunity_categories VALUES($1,'Music')",[grant]);
   await db.query("INSERT INTO opportunity_applicant_types VALUES($1,'individual')",[grant]);
   if(i!==12)await db.query("INSERT INTO opportunity_geographies(opportunity_id,country,rule) VALUES($1,'Canada','eligible')",[grant]);
  }
  let job=(await db.query('SELECT * FROM search_discovery_jobs WHERE id=$1',[id])).rows[0];
  assert.deepEqual(await measureSearchTarget(db,job),{matched:10,watchlist:2});
  const pending=(await db.query('SELECT * FROM catalog_enrichment_jobs WHERE search_priority_until IS NOT NULL')).rows[0];assert.ok(pending);
  await db.query("UPDATE catalog_enrichment_jobs SET next_attempt_at=now()+interval '1 day' WHERE opportunity_id=$1",[pending.opportunity_id]);
  await measureSearchTarget(db,job);assert.ok(new Date((await db.query('SELECT next_attempt_at FROM catalog_enrichment_jobs WHERE opportunity_id=$1',[pending.opportunity_id])).rows[0].next_attempt_at).getTime()>Date.now()+23*3600000);
  const reader={policy:async()=>({sitemaps:[],delay:1500,allowed:()=>true}),read:async(url:string)=>parsePage(Buffer.from('<main><h1>Funding directory</h1><p>Browse funding programs.</p></main>'),'text/html',url)};
  await runSearchDiscovery(db,()=>false,reader,id,1);
  assert.equal((await db.query('SELECT status FROM search_discovery_jobs WHERE id=$1',[id])).rows[0].status,'complete');
  await db.query("UPDATE opportunities SET publication_state='hidden'");
  await db.query('BEGIN');const more=await enqueueSearch(db,{...params,q:'additional'});await db.query('COMMIT');
  await runSearchDiscovery(db,()=>false,reader,more);
  job=(await db.query('SELECT * FROM search_discovery_jobs WHERE id=$1',[more])).rows[0];
  assert.equal(job.research_wave,2);assert.equal(job.source_ids.length,9);assert.equal(job.pages,8);assert.equal(job.status,'running');
  await runSearchDiscovery(db,()=>false,reader,more);
  job=(await db.query('SELECT * FROM search_discovery_jobs WHERE id=$1',[more])).rows[0];
  assert.equal(job.pages,9);assert.equal(job.status,'partial');assert.equal(job.matched_count,0);
  assert.equal(await runSearchDiscovery(db,()=>false,reader,more),false);
  // A large directory cannot turn the ten-match goal into unlimited crawling.
  await db.query('UPDATE crawl_sources SET enabled=false');
  await db.query("INSERT INTO crawl_sources(name,url,approved_domains,geography,categories) VALUES('Large directory','https://example.org/large-directory',ARRAY['example.org'],'Canada',ARRAY['Music'])");
  await db.query('BEGIN');const bounded=await enqueueSearch(db,{...params,q:'bounded'});await db.query('COMMIT');
  let reads=0;
  const large={...reader,read:async(url:string)=>{reads++;return parsePage(Buffer.from('<main><h1>Funding directory</h1>'+Array.from({length:150},(_,i)=>`<a href="https://example.org/program-${i}">Grant ${i}</a>`).join('')+'</main>'),'text/html',url);}};
  for(let i=0;i<6;i++)await runSearchDiscovery(db,()=>false,large,bounded);
  const capped=(await db.query('SELECT * FROM search_discovery_jobs WHERE id=$1',[bounded])).rows[0];
  assert.equal(capped.pages,120);assert.equal(capped.research_wave,5);assert.equal(capped.status,'partial');assert.equal(reads,120);
 }finally{await db.query('ROLLBACK');await db.query('SET search_path TO public');await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});
