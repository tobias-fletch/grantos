import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import {matchGeography,normalizeLocation,locationParams,sourceLocationPriority} from '../src/lib/opportunities/geography';
import {searchIntent,enqueueSearch} from '../src/lib/discovery/search-jobs';
import {unifiedSearch} from '../src/lib/opportunities/results';
import type {Geography} from '../src/lib/opportunities/ranking';
import {searchSubmission,researchRequest} from '../src/lib/opportunities/search-navigation';
const target=normalizeLocation({country:'USA',state:'LA',city:'New Orleans'});
const geo=(v:Partial<Geography>):Geography=>({country:'United States',state:null,city:null,borough:null,rule:'eligible',...v});
test('geographic eligibility includes supported broader scopes, exclusions win, unknown stays unknown',()=>{
 for(const g of [geo({city:'New Orleans',state:'LA'}),geo({state:'Louisiana'}),geo({}),geo({country:'Worldwide'})])assert.equal(matchGeography([g],target).state,'eligible');
 for(const g of [geo({state:'Texas'}),geo({state:'LA',city:'Baton Rouge'})])assert.equal(matchGeography([g],target).state,'excluded');
 assert.equal(matchGeography([geo({}),geo({rule:'excluded',state:'LA'})],target).state,'excluded');
 assert.equal(matchGeography([geo({}),geo({rule:'excluded',county:'Orleans'})],target).state,'unknown');
 assert.equal(matchGeography([geo({postal_code:'70112'})],target).state,'unknown');
 assert.equal(matchGeography([geo({postal_code:'70112'})],{...target,postal_code:'70112-1234'}).state,'eligible');
 assert.equal(matchGeography([],target).state,'unknown');
 assert.equal(matchGeography([geo({postal_code:'70112–70119'})],target).state,'unknown');
 assert.equal(matchGeography([geo({country:null})],target).state,'unknown');
 assert.match(matchGeography([geo({})],target).reason,/nationwide/);
});
test('location defaults, saved NYC URLs, normalization and intent isolation',()=>{
 assert.equal(locationParams({},target).state,'Louisiana');
 assert.equal(locationParams({location:'any'},target).country,'');
 assert.equal(locationParams({location:'nyc'},target).city,'New York City');
 assert.equal(locationParams({state:'TX',city:'Austin'},target).state,'Texas');
 assert.equal(searchIntent({country:'USA',state:'LA',city:'New Orleans'}).key,searchIntent({country:'United States',state:'Louisiana',city:'new orleans'}).key);
 assert.notEqual(searchIntent({state:'LA'}).key,searchIntent({state:'TX'}).key);
 assert.notEqual(searchIntent({state:'LA',status:'open'}).key,searchIntent({state:'LA',status:'unknown'}).key);
 assert.equal(sourceLocationPriority('New Orleans / Louisiana',target),4);
 assert.equal(sourceLocationPriority('Louisiana',target),3);
 assert.equal(sourceLocationPriority('United States',target),2);
 assert.equal(sourceLocationPriority('New York City',target),0);
 assert.equal(sourceLocationPriority('New Orleans / Louisiana',{...target,city:'Baton Rouge'}),0);
});
test('explicit searches create requests while navigation retains identity and legacy location',()=>{
 const previous={location:'nyc_only',city:'New York City',state:'New York',postal_code:''};
 const first=searchSubmission(new URLSearchParams({city:previous.city,state:previous.state,q:'arts'}),previous,randomUUID());
 assert.equal(first.get('location'),'nyc_only');
 const second=searchSubmission(first,previous,randomUUID());assert.notEqual(researchRequest(first),researchRequest(second));
 for(const key of ['sort','programPage','leadPage','resultType','preview']){const navigation=new URLSearchParams(first);navigation.set(key,'2');assert.equal(researchRequest(navigation),researchRequest(first));}
 assert.equal(researchRequest(new URLSearchParams('discover=1')),null);
 assert.equal(searchSubmission(new URLSearchParams({city:'New Orleans',state:'Louisiana'}),previous,randomUUID()).has('location'),false);
 assert.equal(searchSubmission(new URLSearchParams(),{...previous,location:'any',city:'',state:''},randomUUID()).get('location'),'any');
});

dotenv.config({path:'.env.local',quiet:true});
test('location search filters before pagination and queues durable scoped work without touching private saves',async()=>{
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const db=new pg.Client({connectionString:process.env.DATABASE_URL}),schema='location_'+randomBytes(8).toString('hex');await db.connect();
 try{
 await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema},public`);
 for(const f of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+f,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
 await db.query("UPDATE opportunities SET publication_state='hidden'");await db.query('UPDATE crawl_sources SET enabled=false');
 const user=(await db.query("INSERT INTO users(email,beta_active) VALUES('location@example.invalid',true) RETURNING id")).rows[0].id;
 const ws=(await db.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES('Location','location','individual',$1) RETURNING id",[user])).rows[0].id;
 await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,user]);
 for(let i=0;i<16;i++){
 const id=(await db.query("INSERT INTO opportunities(name,slug,source_url,official_url,summary,funding_type,publication_origin,application_status) VALUES($1,$2,$3,$3,'Funding supports applicants','grant','crawler','unknown') RETURNING id",['Location Grant '+i,'location-'+i,'https://example.org/grant-'+i])).rows[0].id;
 if(i<14)await db.query("INSERT INTO opportunity_geographies(opportunity_id,country,state,rule) VALUES($1,'United States',$2,'eligible')",[id,i===13?'Texas':'Louisiana']);
 }
 await db.query("INSERT INTO profiles(workspace_id,display_name,applicant_type,country,state,city) VALUES($1,'Local applicant','individual','United States','LA','New Orleans')",[ws]);
 assert.equal((await unifiedSearch(db,user,{})).total,13);
 assert.equal((await unifiedSearch(db,user,{location:'any'})).total,16);
 const params={country:'United States',state:'LA',city:'New Orleans'};
 const a=await unifiedSearch(db,user,params);assert.equal(a.total,13);assert.equal(a.eligibleProgramCount,13);assert.equal(a.locationUnknown,2);assert.equal(a.rows.length,12);
 const b=await unifiedSearch(db,user,{...params,programPage:'2'});assert.equal(b.rows.length,1);
 const unknown=await unifiedSearch(db,user,{...params,geoEligibility:'unknown'});assert.equal(unknown.total,2);assert.ok(unknown.rows.every(r=>r.geographyMatch?.state==='unknown'));
 assert.equal((await unifiedSearch(db,user,{...params,minAward:'100'})).total,0);
 const sourceIds=[];
 for(const scope of ['New York City','United States','Louisiana','New Orleans / Louisiana'])sourceIds.push((await db.query("INSERT INTO crawl_sources(name,url,approved_domains,geography,enabled) VALUES($1,$2,ARRAY['example.org'],$1,true) RETURNING id",[scope,'https://example.org/'+sourceIds.length])).rows[0].id);
 await db.query('BEGIN');const id=await enqueueSearch(db,params);await db.query('COMMIT');
 await db.query('BEGIN');assert.equal(await enqueueSearch(db,{...params,state:'Louisiana'}),id);await db.query('COMMIT');
 const job=(await db.query('SELECT * FROM search_discovery_jobs WHERE id=$1',[id])).rows[0];assert.deepEqual(job.source_ids,[sourceIds[3],sourceIds[2],sourceIds[1]]);assert.equal(job.coverage_gap,false);assert.equal(job.geography.state,'Louisiana');
 await db.query("UPDATE search_discovery_jobs SET status='running' WHERE id=$1",[id]);
 await db.query('BEGIN');assert.equal(await enqueueSearch(db,params),id);await db.query('COMMIT');
 const request={id:randomUUID(),userId:user};
 await db.query('BEGIN');assert.equal(await enqueueSearch(db,params,request),id);await db.query('COMMIT');
 assert.equal((await db.query('SELECT started_job FROM search_discovery_submissions WHERE id=$1',[request.id])).rows[0].started_job,false);
 await db.query("UPDATE search_discovery_jobs SET status='complete',pages=4 WHERE id=$1",[id]);
 await db.query('BEGIN');assert.equal(await enqueueSearch(db,params,request),id);await db.query('COMMIT');
 assert.equal((await db.query('SELECT status FROM search_discovery_jobs WHERE id=$1',[id])).rows[0].status,'complete');
 // Even a just-completed job can be restarted by a new explicit submission.
 const fresh={id:randomUUID(),userId:user};
 await db.query('BEGIN');assert.equal(await enqueueSearch(db,params,fresh),id);await db.query('COMMIT');
 assert.equal((await db.query('SELECT pages FROM search_discovery_jobs WHERE id=$1',[id])).rows[0].pages,0);
 assert.equal((await db.query('SELECT started_job FROM search_discovery_submissions WHERE id=$1',[fresh.id])).rows[0].started_job,true);
 await db.query('BEGIN');await assert.rejects(enqueueSearch(db,{...params,state:'TX'},fresh),/does not match/);await db.query('ROLLBACK');
 await db.query('BEGIN');const other=await enqueueSearch(db,{...params,state:'TX',city:'Austin'});await db.query('COMMIT');
 assert.equal((await db.query('SELECT coverage_gap FROM search_discovery_jobs WHERE id=$1',[other])).rows[0].coverage_gap,true);
 for(let i=0;i<8;i++){await db.query('BEGIN');await enqueueSearch(db,{...params,q:'unique'+i});await db.query('COMMIT');}
 await db.query('BEGIN');await assert.rejects(enqueueSearch(db,{...params,q:'overflow'}),/queue is full/);await db.query('ROLLBACK');
 }finally{await db.query('ROLLBACK');await db.query('SET search_path TO public');await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});
