import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {startApplication,startSavedApplication} from '../src/lib/applications/start';
import {saveResultForProject} from '../src/lib/applications/save-result';
import {prepareApplication,preparationData} from '../src/lib/applications/preparation';
import {applicationTask,archiveApplication} from '../src/lib/applications/store';
import {applicationGuidance,recordGuidanceReview,revokeGuidanceReview} from '../src/lib/applications/guidance-store';
import {saveProject} from '../src/lib/projects/store';

async function fixture(run:(db:pg.Pool,f:any)=>Promise<void>){
 dotenv.config({path:'.env.local',quiet:true});assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();
 const schema='guidance_'+randomBytes(6).toString('hex'),db=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,options:`-c search_path=${schema},public`});
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);await admin.query(`SET search_path TO ${schema},public`);await admin.query('BEGIN');
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await admin.query((await readFile('db/migrations/'+file,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  const owner=randomUUID(),viewer=randomUUID(),other=randomUUID(),editor=randomUUID(),workspace=randomUUID(),foreignWorkspace=randomUUID();
  for(const id of [owner,viewer,other,editor])await admin.query('INSERT INTO users(id,email,name,email_verified_at,beta_active,catalog_editor) VALUES($1,$2,$2,now(),true,$3)',[id,id+'@example.test',id===editor]);
  for(const [w,user] of [[workspace,owner],[foreignWorkspace,other]]){await admin.query("INSERT INTO workspaces(id,name,slug,kind,created_by) VALUES($1,'Guidance',$3,'individual',$2)",[w,user,w]);await admin.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[w,user]);}
  await admin.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'viewer')",[workspace,viewer]);
  const grant=randomUUID(),source=randomUUID(),snapshot=randomUUID(),url='https://arts.ny.gov/guidance-fixture-'+grant,portal='https://survey.alchemer.com/s3/fixture-'+grant;
  const body='Applicants must be New York State residents. Upload one work sample. Complete the eligibility quiz. Describe your artistic practice. Selection considers artistic practice. For individual applicants. Apply online.';
  await admin.query("INSERT INTO opportunities(id,name,slug,official_url,source_url,funding_type) VALUES($1,'Guidance fixture grant',$2,$3,$3,'grant')",[grant,grant,url]);
  await admin.query("INSERT INTO crawl_sources(id,name,url,approved_domains) VALUES($1,'Guidance fixture',$2,ARRAY['arts.ny.gov'])",[source,url]);
  await admin.query("INSERT INTO crawl_snapshots(id,source_id,url,hash,title,body,links) VALUES($1,$2,$3,'fixture','Guidance fixture grant',$4,$5)",[snapshot,source,url,body,JSON.stringify([portal])]);
  const facts=[{field:'eligibility',value:'Applicants must be New York State residents.',excerpt:'Applicants must be New York State residents.',sourceUrl:url,cycle:null}];
  await admin.query("INSERT INTO program_evidence_pages(opportunity_id,url,role,association,snapshot_id,fetched_at,facts) VALUES($1,$2,'program','program-page',$3,now(),$4)",[grant,url,snapshot,JSON.stringify(facts)]);
  await admin.query('COMMIT');
  const projectInput={name:'Art project',description:'Private project facts.',applicant_type:'individual',country:'United States',state:'New York',city:'New York City',postal_code:'10001',categories:['Visual Art'],amount:null,target_date:null};
  const project=await saveProject(db,owner,null,projectInput),rival=await saveProject(db,owner,null,{...projectInput,name:'Rival project'}),foreign=await saveProject(db,other,null,projectInput);
  const reviewInput={snapshot_id:snapshot,source_section:'Application instructions',applicant_scope:'For individual applicants.',cycle:null,period_end:null};
  const ids=[];
  for(const [field,value] of [['document','Upload one work sample.'],['step','Complete the eligibility quiz.'],['question','Describe your artistic practice.'],['criterion','Selection considers artistic practice.'],['application_url',portal]])ids.push(await recordGuidanceReview(db,editor,grant,{...reviewInput,field,value,source_excerpt:field==='application_url'?'Apply online.':value}));
  await run(db,{owner,viewer,other,editor,workspace,grant,url,snapshot,portal,project,rival,foreign,reviewInput,reviewIds:ids});
 }finally{await db.end();await admin.query('ROLLBACK');await admin.query('SET search_path TO public');await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
}
test('Start imports supported evidence once and preserves edits, notes, archives, project and provenance',async()=>fixture(async(db,f)=>{
 const id=await startApplication(db,f.owner,'catalog',f.grant,f.project);
 const initial=await preparationData(db,f.owner,id);assert.equal(initial.length,2);assert.equal(initial.filter(r=>r.kind==='question').length,1);
 assert.equal((await db.query('SELECT stage,project_id FROM applications WHERE id=$1',[id])).rows[0].stage,'preparing');
 const requirement=initial.find(r=>r.kind==='eligibility')!,question=initial.find(r=>r.kind==='question')!;
 assert.equal(requirement.source_provenance.originalValue,'Applicants must be New York State residents.');
 await prepareApplication(db,f.owner,id,'save',{...requirement.data,kind:'eligibility',item_id:requirement.id,version:1,requirement:'My edited requirement',notes:'My evidence'});
 await prepareApplication(db,f.owner,id,'archive',{kind:'eligibility',item_id:requirement.id,version:2});
 await prepareApplication(db,f.owner,id,'save',{...question.data,kind:'question',item_id:question.id,version:1,answer:'My carefully edited draft'});
 const tasks=(await db.query('SELECT * FROM grant_tasks WHERE application_id=$1',[id])).rows;assert.equal(tasks.length,2);assert.ok(tasks.every(t=>t.source_provenance));
 await applicationTask(db,f.owner,id,'delete',tasks[0].id,{});
 await db.query("UPDATE applications SET notes='Private note' WHERE id=$1",[id]);
 assert.equal(await startApplication(db,f.owner,'catalog',f.grant,f.project),id);
 assert.equal(await startSavedApplication(db,f.owner,id),id);
 const after=await preparationData(db,f.owner,id);assert.equal(after.length,2);assert.ok(after.find(r=>r.id===requirement.id).archived_at);
 assert.equal(after.find(r=>r.id===question.id).data.answer,'My carefully edited draft');assert.equal(after.find(r=>r.id===requirement.id).source_provenance.originalValue,requirement.source_provenance.originalValue);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM grant_tasks WHERE application_id=$1',[id])).rows[0].n,2);
 assert.equal((await db.query('SELECT notes FROM applications WHERE id=$1',[id])).rows[0].notes,'Private note');
 await assert.rejects(db.query("UPDATE application_preparation SET source_provenance='{}' WHERE id=$1",[requirement.id]),/immutable/);
 await assert.rejects(db.query("UPDATE grant_tasks SET source_provenance='{}' WHERE id=$1",[tasks[0].id]),/immutable/);
 await assert.rejects(db.query("UPDATE application_guidance_imports SET guidance='{}' WHERE application_id=$1",[id]),/immutable/);
 await archiveApplication(db,f.owner,id,true);assert.equal(await startApplication(db,f.owner,'catalog',f.grant,f.project),id);
 assert.ok((await db.query('SELECT archived_at FROM applications WHERE id=$1',[id])).rows[0].archived_at);
}));
test('Start validates writable workspace/project access and rolls back incomplete starts',async()=>fixture(async(db,f)=>{
 await assert.rejects(startApplication(db,f.viewer,'catalog',f.grant,f.project));
 await assert.rejects(startApplication(db,f.owner,'catalog',f.grant,f.foreign));
 await assert.rejects(startApplication(db,f.owner,'catalog',f.grant),/Choose a project/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM applications WHERE workspace_id=$1',[f.workspace])).rows[0].n,0);
 const id=await startApplication(db,f.owner,'catalog',f.grant,f.project);
 await assert.rejects(startApplication(db,f.owner,'catalog',f.grant,f.rival),/different project/);
 await assert.rejects(startSavedApplication(db,f.other,id,f.foreign));
 await assert.rejects(applicationGuidance(db,f.other,id));
 assert.equal((await db.query('SELECT project_id FROM applications WHERE id=$1',[id])).rows[0].project_id,f.project);
}));
test('concurrent starts seed once and competing project starts cannot reassign work',async()=>fixture(async(db,f)=>{
 const ids=await Promise.all([startApplication(db,f.owner,'catalog',f.grant,f.project),startApplication(db,f.owner,'catalog',f.grant,f.project),startApplication(db,f.owner,'catalog',f.grant,f.project)]);
 assert.equal(new Set(ids).size,1);assert.equal((await preparationData(db,f.owner,ids[0])).length,2);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM application_guidance_imports WHERE application_id=$1',[ids[0]])).rows[0].n,1);
 const results=await Promise.allSettled([startApplication(db,f.owner,'catalog',f.grant,f.rival),startApplication(db,f.owner,'catalog',f.grant,f.project)]);
 assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');
}));
test('editor ingestion is explicit, exact-source, current and retractable without erasing imported evidence',async()=>fixture(async(db,f)=>{
 const input={...f.reviewInput,field:'document',value:'Upload one work sample.',source_excerpt:'Upload one work sample.'};
 await assert.rejects(recordGuidanceReview(db,f.owner,f.grant,input),/editor access/);
 await assert.rejects(recordGuidanceReview(db,f.editor,f.grant,{...input,value:'Upload a business plan.'}),/exact requirement/);
 await assert.rejects(recordGuidanceReview(db,f.editor,f.grant,{...input,applicant_scope:'All applicants'}),/exact current-cycle/);
 await assert.rejects(recordGuidanceReview(db,f.editor,f.grant,{...input,field:'application_url',value:'https://unlinked.org/form'}),/explicit link/);
 await assert.rejects(recordGuidanceReview(db,f.editor,f.grant,{...input,cycle:'2020',period_end:'2020-12-31'}),/current-cycle/);
 await assert.rejects(db.query("UPDATE opportunity_application_guidance SET value='Changed evidence' WHERE id=$1",[f.reviewIds[0]]),/immutable/);
 const id=await startApplication(db,f.owner,'catalog',f.grant,f.project);
 await revokeGuidanceReview(db,f.editor,f.grant,f.reviewIds[0]);
 assert.ok((await applicationGuidance(db,f.owner,id)).unknown.includes('document'));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM grant_tasks WHERE application_id=$1',[id])).rows[0].n,2);
 assert.equal((await db.query('SELECT guidance FROM application_guidance_imports WHERE application_id=$1',[id])).rows[0].guidance.items.filter((i:any)=>i.field==='document').length,1);
}));
test('saved applications initialize directly and an empty import is never silently reseeded',async()=>fixture(async(db,f)=>{
 await db.query('DELETE FROM opportunity_application_guidance WHERE opportunity_id=$1',[f.grant]);await db.query("UPDATE program_evidence_pages SET facts='[]' WHERE opportunity_id=$1",[f.grant]);
 const id=await saveResultForProject(db,f.owner,'catalog',f.grant);
 await startSavedApplication(db,f.owner,id,f.project);assert.equal((await preparationData(db,f.owner,id)).length,0);
 await recordGuidanceReview(db,f.editor,f.grant,{...f.reviewInput,field:'question',value:'Describe your artistic practice.',source_excerpt:'Describe your artistic practice.'});
 await startSavedApplication(db,f.owner,id);assert.equal((await preparationData(db,f.owner,id)).length,0);
 assert.ok((await applicationGuidance(db,f.owner,id)).items.some(i=>i.field==='question'));
}));
test('external results remain unknown and saved work outlives the original search session',async()=>fixture(async(db,f)=>{
 const external=randomUUID(),session=randomUUID(),url='https://www.grants.gov/search-results-detail/98989898';
 await db.query("INSERT INTO grant_external_results(id,provider,external_id,source_url,data) VALUES($1,'grants-gov','98989898',$2,$3)",[external,url,JSON.stringify({title:'External fixture grant',url,summary:'Official API search result.',facts:[{field:'eligibility',value:'Unverified imported summary'}]})]);
 await db.query("INSERT INTO grant_search_sessions(id,workspace_id,request_id,filters) VALUES($1,$2,$3,'{}')",[session,f.workspace,randomUUID()]);
 await db.query('INSERT INTO grant_search_results(session_id,result_id) VALUES($1,$2)',[session,external]);
 await assert.rejects(startApplication(db,f.other,'external',external,f.foreign));
 const id=await startApplication(db,f.owner,'external',external,f.project);
 assert.equal((await preparationData(db,f.owner,id)).length,0);assert.equal((await applicationGuidance(db,f.owner,id)).items.length,0);
 await db.query("UPDATE grant_search_sessions SET expires_at=now()-interval '1 day' WHERE id=$1",[session]);
 assert.equal(await startSavedApplication(db,f.owner,id),id);assert.equal(await startApplication(db,f.owner,'external',external,f.project),id);
}));
test('archived and terminal applications opened from saved work are never reseeded or advanced',async()=>fixture(async(db,f)=>{
 const id=await saveResultForProject(db,f.owner,'catalog',f.grant);
 await archiveApplication(db,f.owner,id,true);
 assert.equal(await startSavedApplication(db,f.owner,id,f.project),id);
 let row=(await db.query('SELECT * FROM applications WHERE id=$1',[id])).rows[0];assert.equal(row.project_id,null);assert.ok(row.archived_at);assert.equal(row.stage,'saved');
 await archiveApplication(db,f.owner,id,false);await db.query("UPDATE applications SET stage='submitted',notes='Already submitted externally' WHERE id=$1",[id]);
 assert.equal(await startSavedApplication(db,f.owner,id,f.project),id);
 row=(await db.query('SELECT * FROM applications WHERE id=$1',[id])).rows[0];assert.equal(row.project_id,null);assert.equal(row.stage,'submitted');assert.equal(row.notes,'Already submitted externally');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM application_guidance_imports WHERE application_id=$1',[id])).rows[0].n,0);
}));
async function failDuringQuestionCopy(db:pg.Pool){
 await db.query(`CREATE FUNCTION fail_guidance_question_copy() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NEW.kind='question' AND EXISTS(SELECT 1 FROM application_guidance_imports WHERE application_id=NEW.application_id)
    AND EXISTS(SELECT 1 FROM application_preparation WHERE application_id=NEW.application_id AND kind='eligibility') THEN
   RAISE EXCEPTION 'Injected mid-seed failure after imported evidence and eligibility';
  END IF;
  RETURN NEW;
 END $$`);
 await db.query('CREATE TRIGGER fail_guidance_question_copy BEFORE INSERT ON application_preparation FOR EACH ROW EXECUTE FUNCTION fail_guidance_question_copy()');
}
async function assertNoPrivateStart(db:pg.Pool|pg.PoolClient,workspace:string){
 for(const table of ['saved_opportunities','applications','grant_tasks'])assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE workspace_id=$1`,[workspace])).rows[0].n,0,table+' must roll back');
 for(const table of ['application_guidance_imports','application_preparation','application_history'])assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} t JOIN applications a ON a.id=t.application_id WHERE a.workspace_id=$1`,[workspace])).rows[0].n,0,table+' must roll back');
}
test('Pool mid-seed failure rolls back saved application, copied rows and audit history; retry succeeds',async()=>fixture(async(db,f)=>{
 await failDuringQuestionCopy(db);
 await assert.rejects(startApplication(db,f.owner,'catalog',f.grant,f.project),/Injected mid-seed failure/);
 await assertNoPrivateStart(db,f.workspace);
 await db.query('DROP TRIGGER fail_guidance_question_copy ON application_preparation');
 const id=await startApplication(db,f.owner,'catalog',f.grant,f.project);
 assert.equal((await preparationData(db,f.owner,id)).length,2);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM application_guidance_imports WHERE application_id=$1',[id])).rows[0].n,1);
}));
test('Client nested mid-seed failure rolls back the entire start while preserving its outer transaction; retry succeeds',async()=>fixture(async(db,f)=>{
 await failDuringQuestionCopy(db);
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query("UPDATE funding_projects SET description='Outer transaction work survives' WHERE id=$1",[f.project]);
  await assert.rejects(startApplication(client,f.owner,'catalog',f.grant,f.project),/Injected mid-seed failure/);
  await assertNoPrivateStart(client,f.workspace);
  assert.equal((await client.query('SELECT description FROM funding_projects WHERE id=$1',[f.project])).rows[0].description,'Outer transaction work survives');
  await client.query('DROP TRIGGER fail_guidance_question_copy ON application_preparation');
  const id=await startApplication(client,f.owner,'catalog',f.grant,f.project);
  assert.equal((await preparationData(client,f.owner,id)).length,2);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM application_guidance_imports WHERE application_id=$1',[id])).rows[0].n,1);
 }finally{await client.query('ROLLBACK');client.release();}
}));
