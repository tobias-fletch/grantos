import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';import dotenv from 'dotenv';
import {startSession,searchBatch,sessionStatus,sharedRequest} from '../src/lib/search/sessions';
import {searchRequest,normalizeLive,officialJson,providerKeyword} from '../src/lib/search/providers';
import {externalCard,saveExternal,externalAccess,externalResults} from '../src/lib/search/results';
import {parseFilters} from '../src/lib/opportunities/store';
import {exampleQuery,awardExamples} from '../src/lib/search/examples';
import {importGrant} from '../src/lib/discovery/provider-sync';
const ca=(id:number)=>({PortalID:id,Title:'Community Education Grant '+id,Type:'Grant',Status:'active',AgencyDept:'Education Department',Purpose:'Community education projects.',ApplicantType:'Nonprofit',Geography:'Statewide',ApplicationDeadline:'Ongoing'});
test('live requests disclose only keywords; status coverage and strict grant filtering',async()=>{
 const f=parseFilters({q:'education',city:'New Orleans',postal_code:'70118'}),spec=searchRequest('grants-gov',f,20);
 assert.equal(spec.body?.startRecordNum,20);assert.equal(spec.body?.oppStatuses,'posted');assert.ok(searchRequest('grants-gov',f,0,2).body?.oppStatuses.includes('archived'));assert.ok(!JSON.stringify(spec).includes('70118'));assert.ok(!JSON.stringify(spec).includes('New Orleans'));
 assert.equal(providerKeyword('education 70118 person@example.test 555-123-4567'),'education');
 assert.equal(normalizeLive('california',{...ca(1),Type:'Loan'}),null);
 await assert.rejects(officialJson('https://127.0.0.1',undefined,AbortSignal.timeout(100)));await assert.rejects(officialJson('https://example.com',undefined,AbortSignal.timeout(100)));
});
test('external matches respect geography and applicant conflicts; unknown is not eligibility',()=>{
 const row={id:randomUUID(),data:normalizeLive('california',ca(1)),fetched_at:new Date()},profile={categories:[],applicant_type:'nonprofit',country:'United States',state:'California'};
 assert.equal(externalCard(row,parseFilters({country:'United States',state:'Louisiana'}),profile),null);
 assert.equal(externalCard(row,parseFilters({applicant:'student'}),profile),null);
 assert.equal(externalCard(row,parseFilters({country:'United States',state:'California'}),profile)?.geographyMatch?.state,'eligible');
 const unknown={...row,data:normalizeLive('california',{...ca(1),Geography:''})};assert.equal(externalCard(unknown,parseFilters({country:'United States',state:'Louisiana'}),profile)?.geographyMatch?.state,'unknown');
});
test('examples require exact program associations and never use title similarity',()=>{
 assert.equal(exampleQuery({funder:'NIH',body:'Cancer research'}),null);
 assert.ok(exampleQuery({funder:'National Institutes of Health',opportunityNumber:'PAR-25-123'}));
 const r=awardExamples('nih','PAR-25-123',{results:[{appl_id:123,opportunity_number:'PAR-25-124',project_title:'Matching words'},{appl_id:124,opportunity_number:'PAR-25-123',project_title:'Funded project',fiscal_year:2025}]});assert.equal(r.length,1);assert.ok(r[0].url.endsWith('124'));
});
test('sessions paginate beyond ten, isolate workspaces, recover failures and save before publication',async()=>{
 dotenv.config({path:'.env.local',quiet:true});assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();const schema='live_'+randomBytes(6).toString('hex');
 try{await db.query('BEGIN');await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET LOCAL search_path TO ${schema},public`);
 for(const f of(await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+f,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
 async function user(email:string){const u=(await db.query('INSERT INTO users(email,name) VALUES($1,$1) RETURNING id',[email])).rows[0].id;const w=(await db.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES($1,$1,'individual',$2) RETURNING id",[email,u])).rows[0].id;await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[w,u]);return u;}
 let sharedCalls=0;const shared=async()=>{sharedCalls++;await new Promise(r=>setTimeout(r,50));return {ok:true};};
 const sharedValues=await Promise.all([sharedRequest(db,'nih','https://api.reporter.nih.gov/test',undefined,new Date(0),AbortSignal.timeout(2000),shared),sharedRequest(db,'nih','https://api.reporter.nih.gov/test',undefined,new Date(0),AbortSignal.timeout(2000),shared)]);assert.equal(sharedCalls,1);assert.deepEqual(sharedValues,[{ok:true},{ok:true}]);
 const u=await user('live@example.test'),other=await user('other@example.test'),requestId=randomUUID(),id=await startSession(db,u,requestId,{q:'education'});assert.equal(await startSession(db,u,requestId,{}),id);
 let calls=0;const request=async(url:string)=>{calls++;if(url.includes('grants.gov'))throw Error('Temporary outage');const offset=Number(new URL(url).searchParams.get('offset'));return {success:true,result:{total:25,records:Array.from({length:offset===0?20:5},(_,i)=>ca(offset+i+1))}};};
 let status=await searchBatch(db,u,id,request);assert.equal(status.retrieved,20);assert.equal(status.providers.find(p=>p.provider==='grants-gov')?.status,'unavailable');status=await searchBatch(db,u,id,request);assert.equal(status.retrieved,25);
 const n=calls;await searchBatch(db,u,id,request);assert.equal(calls,n);await assert.rejects(sessionStatus(db,other,id));
 const e=(await db.query('SELECT id,data FROM grant_external_results ORDER BY external_id LIMIT 1')).rows[0];await assert.rejects(externalAccess(db,other,e.id));const app=await saveExternal(db,u,e.id);assert.equal(await saveExternal(db,u,e.id),app);await db.query("UPDATE applications SET notes='Private work' WHERE id=$1",[app]);await importGrant(db,e.data);const a=(await db.query('SELECT opportunity_id,notes FROM applications WHERE id=$1',[app])).rows[0];assert.ok(a.opportunity_id);assert.equal(a.notes,'Private work');
 const remaining=await externalResults(db,u,requestId,parseFilters({}),{categories:[],applicant_type:'',country:''});assert.ok(!remaining.some(r=>r.id===e.id),'Catalog records take precedence over API facts');
 await db.query("UPDATE workspace_members SET role='viewer' WHERE user_id=$1",[u]);await assert.rejects(saveExternal(db,u,e.id));
 await db.query("UPDATE grant_search_progress SET lease_until=now()-interval '1 second',owner=$2,status='searching',retry_at=now()-interval '1 second' WHERE session_id=$1 AND provider='grants-gov'",[id,randomUUID()]);
 await db.query("UPDATE grant_search_requests SET retry_at=now()-interval '1 second' WHERE provider='grants-gov'");
 let resumed=0;await searchBatch(db,u,id,async()=>{resumed++;return {errorcode:0,data:{oppHits:[],hitCount:0}};});assert.equal(resumed,1);assert.equal((await sessionStatus(db,u,id)).providers.find(p=>p.provider==='grants-gov')?.status,'more');
 const second=await startSession(db,u,randomUUID(),{q:'education'});assert.notEqual(second,id);
 }finally{await db.query('ROLLBACK');await db.end();}
});
