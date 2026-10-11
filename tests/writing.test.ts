import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {projectDraftStarters,preparationReadiness,starterHistoryEvent} from '../src/lib/applications/writing';
import {prepareApplication,preparationData} from '../src/lib/applications/preparation';
import {saveProject} from '../src/lib/projects/store';

test('local draft starters copy only explicit facts and leave missing information as prompts',()=>{
 const p={name:'Kitchen',description:'We run cooking workshops.',amount:5000,country:'US',context:{beneficiaries:'Adults in Ward 4',activities:'Four workshops',intended_outcomes:'Learn food preparation',evidence:'Participants requested classes',evidence_url:'https://example.org/evidence'}};
 const result=projectDraftStarters(p),text=result.map(r=>r.answer).join('\n');
 assert.equal(result.length,3);assert.deepEqual(result,projectDraftStarters(p));
 for(const fact of [p.description,...Object.values(p.context)])assert.ok(text.includes(fact));
 assert.ok(text.includes('[Describe where the project will operate]'));
 assert.ok(text.includes('[Explain the need this project addresses using facts you can support]'));
 assert.ok(!text.includes('5000'));assert.ok(!text.includes('eligible'));assert.ok(!text.includes('guaranteed'));
 assert.ok(result.every(r=>r.word_limit===null&&r.source_url===''));
 const empty=projectDraftStarters({});assert.ok(empty.every(r=>r.answer.includes('[')));
 assert.ok(!JSON.stringify(empty).includes('undefined'));
});
test('readiness counts missing prompts, unresolved assessments, word limits and tasks without promising completion',()=>{
 const row=(kind:string,data:Record<string,unknown>,archived_at:unknown=null)=>({kind,data,archived_at});
 const r=preparationReadiness([
  row('eligibility',{status:'meets'}),row('eligibility',{status:'unchecked'}),row('eligibility',{status:'does_not_meet'}),row('eligibility',{status:'needs_confirmation'}),row('eligibility',{status:'unchecked'},'yesterday'),
  row('question',{answer:''}),row('question',{answer:'[Add evidence]'}),row('question',{answer:'one two three',word_limit:2}),row('question',{answer:'ok',word_limit:1}),row('question',{answer:''},'yesterday')
 ],[{},{completed_at:'today'},{deleted_at:'today'}]);
 assert.deepEqual(r,{eligibilityCount:4,unresolvedEligibility:3,questionCount:4,missingDrafts:2,overLimitDrafts:1,openTasks:1,finalFunderReviewRequired:true});
 assert.equal(preparationReadiness([]).openTasks,null);
 assert.equal(preparationReadiness([],[]).finalFunderReviewRequired,true);
});
test('starter creation is workspace authorized, preserves manual work and remains idempotent after editing and archiving',async()=>{
 dotenv.config({path:'.env.local',quiet:true});assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');const schema='writing_'+randomBytes(6).toString('hex');await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET LOCAL search_path TO ${schema},public`);
  for(const f of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+f,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  const owner=randomUUID(),viewer=randomUUID(),other=randomUUID();
  for(const u of [owner,viewer,other])await db.query('INSERT INTO users(id,email,name) VALUES($1,$2,$2)',[u,u+'@test.example']);
  const w=(await db.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES('Writing','writing','individual',$1) RETURNING id",[owner])).rows[0].id;
  const w2=(await db.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES('Other','writing-other','individual',$1) RETURNING id",[other])).rows[0].id;
  await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')",[w,owner,viewer,w2,other]);
  const p={name:'Community kitchen',description:'Cooking workshops',applicant_type:'business',country:'United States',state:'Louisiana',city:'New Orleans',postal_code:'',categories:['Small Business'],amount:null,target_date:null,context:{activities:'Host four workshops'}};
  const project=await saveProject(db,owner,null,p),foreign=await saveProject(db,other,null,{...p,description:'Secret other workspace facts'});
  const app=(await db.query("INSERT INTO applications(workspace_id,title,source_url,created_by) VALUES($1,'Writing test','https://example.org/writing',$2) RETURNING id",[w,owner])).rows[0].id;
  await assert.rejects(prepareApplication(db,owner,app,'draft_starters',{}),/Connect an active project/);
  await prepareApplication(db,owner,app,'project',{project_id:project});
  await assert.rejects(prepareApplication(db,viewer,app,'draft_starters',{}),/denied/);
  await assert.rejects(prepareApplication(db,other,app,'draft_starters',{}),/not found/);
  await assert.rejects(prepareApplication(db,owner,app,'project',{project_id:foreign}),/Project unavailable/);
  await db.query('SAVEPOINT foreign_project_link');
  await assert.rejects(db.query('UPDATE applications SET project_id=$2 WHERE id=$1',[app,foreign]),/foreign key/);
  await db.query('ROLLBACK TO SAVEPOINT foreign_project_link');
  await db.query('RELEASE SAVEPOINT foreign_project_link');
  await db.query('UPDATE funding_projects SET archived_at=now() WHERE id=$1',[project]);
  await assert.rejects(prepareApplication(db,owner,app,'draft_starters',{}),/Project unavailable/);
  await db.query('UPDATE funding_projects SET archived_at=NULL WHERE id=$1',[project]);
  const manual={kind:'question',question:'My funder question',answer:'My existing answer',word_limit:100,source_url:''};
  await prepareApplication(db,owner,app,'save',manual);
  await prepareApplication(db,owner,app,'draft_starters',{});
  let rows=await preparationData(db,owner,app);assert.equal(rows.length,4);assert.equal(rows.find(r=>r.data.question===manual.question).data.answer,manual.answer);
  const beforeProjectEdit=JSON.stringify(rows.map(r=>r.data));
  await saveProject(db,owner,project,{...p,description:'Changed after starter creation',context:{activities:'Different planned activities'}});
  await prepareApplication(db,owner,app,'draft_starters',{});
  rows=await preparationData(db,owner,app);assert.equal(JSON.stringify(rows.map(r=>r.data)),beforeProjectEdit);
  assert.ok(!JSON.stringify(rows).includes('Changed after starter creation'));
  const starter=rows.find(r=>r.data.starter_key);
  await prepareApplication(db,owner,app,'save',{...starter.data,kind:'question',item_id:starter.id,version:1,answer:'Carefully revised'});
  await assert.rejects(prepareApplication(db,owner,app,'save',{...starter.data,kind:'question',item_id:starter.id,version:1,answer:'Stale overwrite'}),/Item changed/);
  await prepareApplication(db,owner,app,'archive',{kind:'question',item_id:starter.id,version:2});
  await prepareApplication(db,owner,app,'draft_starters',{});
  rows=await preparationData(db,owner,app);assert.equal(rows.length,4);assert.equal(rows.find(r=>r.id===starter.id).data.answer,'Carefully revised');assert.ok(rows.find(r=>r.id===starter.id).archived_at);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM application_history WHERE application_id=$1 AND event=$2',[app,starterHistoryEvent])).rows[0].n,1);
  await db.query('UPDATE applications SET archived_at=now() WHERE id=$1',[app]);
  await assert.rejects(prepareApplication(db,owner,app,'draft_starters',{}),/Connect an active project/);
 }finally{await db.query('ROLLBACK');await db.end();}
});
