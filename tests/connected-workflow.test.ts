import {externalCard,externalDetailCard} from '../src/lib/search/results';
import {normalizeLive} from '../src/lib/search/providers';
import {parseFilters} from '../src/lib/opportunities/store';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {saveProject} from '../src/lib/projects/store';
import {projectSearch} from '../src/lib/projects/search';
import {saveResultForProject,ProjectSaveConflict} from '../src/lib/applications/save-result';
import {prepareApplication,preparationData} from '../src/lib/applications/preparation';
import {editApplication,applicationTask,listApplications} from '../src/lib/applications/store';

const project={name:'Art workshops',description:'Weekly printmaking workshops.',applicant_type:'individual',country:'United States',state:'New York',city:'New York City',postal_code:'10001',categories:['Visual Art'],amount:5000,target_date:'2027-01-01',context:{beneficiaries:'Local adult artists',activities:'Three printmaking sessions',intended_outcomes:'Participants create a print',evidence:'Prior pilot involved 12 adults'}};
test('project navigation carries identity, not private writing facts',()=>{
 const id=randomUUID(),url=new URL('https://example.org'+projectSearch({...project,id}));
 assert.equal(url.searchParams.get('project'),id);
 assert.equal(url.searchParams.get('applicant'),'individual');
 for(const value of [project.description,project.context.evidence,project.context.beneficiaries])assert.equal(url.href.includes(encodeURIComponent(value)),false);
});
test('connected project save, drafting, tasks and tracking preserve scope and user writing',async()=>{
 dotenv.config({path:'.env.local',quiet:true});
 assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
 const schema='workflow_'+randomBytes(6).toString('hex');
 try{
  await db.query('BEGIN');await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET LOCAL search_path TO ${schema},public`);
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+file,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  const owner=randomUUID(),viewer=randomUUID(),other=randomUUID();
  for(const user of [owner,viewer,other])await db.query('INSERT INTO users(id,email,name) VALUES($1,$2,$2)',[user,user+'@example.test']);
  const makeWorkspace=async(user:string)=>{const id=randomUUID();await db.query("INSERT INTO workspaces(id,name,slug,kind,created_by) VALUES($1,'Test',$3,'individual',$2)",[id,user,id]);await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[id,user]);return id;};
  const workspace=await makeWorkspace(owner);await makeWorkspace(other);await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'viewer')",[workspace,viewer]);
  const a=await saveProject(db,owner,null,project),b=await saveProject(db,owner,null,{...project,name:'Project B'}),foreign=await saveProject(db,other,null,project);
  const grants=(await db.query("SELECT id FROM opportunities WHERE NOT is_demo AND publication_state='published' AND verification_status<>'archived' LIMIT 2")).rows;
  assert.equal(grants.length,2);
  await assert.rejects(saveResultForProject(db,owner,'catalog',grants[1].id,foreign));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM applications WHERE workspace_id=$1',[workspace])).rows[0].n,0);
  await assert.rejects(saveResultForProject(db,viewer,'catalog',grants[0].id,a));
  const application=await saveResultForProject(db,owner,'catalog',grants[0].id,a);
  assert.equal(await saveResultForProject(db,owner,'catalog',grants[0].id,a),application);
  await assert.rejects(saveResultForProject(db,owner,'catalog',grants[0].id,b),ProjectSaveConflict);
  assert.equal((await db.query('SELECT project_id FROM applications WHERE id=$1',[application])).rows[0].project_id,a);
  await prepareApplication(db,owner,application,'draft_starters',{});
  const starters=(await preparationData(db,owner,application)).filter(r=>r.kind==='question');assert.ok(starters.length>0);
  await prepareApplication(db,owner,application,'draft_starters',{});assert.equal((await preparationData(db,owner,application)).filter(r=>r.kind==='question').length,starters.length);
  const first=starters[0];await prepareApplication(db,owner,application,'save',{...first.data,kind:'question',item_id:first.id,version:first.version,answer:'My carefully edited response'});
  await saveProject(db,owner,a,{...project,description:'Changed project description'});
  await prepareApplication(db,owner,application,'draft_starters',{});
  assert.equal((await preparationData(db,owner,application)).find(r=>r.id===first.id).data.answer,'My carefully edited response');
  await applicationTask(db,owner,application,'add',null,{title:'Confirm residency with funder',notes:'Check official guidance',due_date:'2027-01-02'});
  await editApplication(db,owner,application,{stage:'preparing',notes:'Working draft',target_date:'2027-01-03',submitted_date:null,requested_amount:5000,awarded_amount:null});
  const tracked=(await listApplications(db,owner)).find(r=>r.id===application);assert.equal(tracked.project_name,'Art workshops');assert.equal(tracked.stage,'preparing');assert.equal(tracked.tasks,1);assert.equal(tracked.target_date,'2027-01-03');
 }finally{await db.query('ROLLBACK');await db.end();}
});

test('authorized external detail remains viewable when workspace and project applicant differ',()=>{
 const data=normalizeLive('california',{PortalID:991,Title:'Business Grant',Type:'Grant',Status:'active',AgencyDept:'Business',Purpose:'Business support.',ApplicantType:'Business',Geography:'Statewide',ApplicationDeadline:'Ongoing'});
 assert.ok(data);const row={id:randomUUID(),data,fetched_at:new Date()};
 assert.equal(externalCard(row,parseFilters({location:'any'}),{categories:[],applicant_type:'individual',country:''}),null);
 assert.ok(externalDetailCard(row));
});

test('simultaneous saves preserve one application and reject competing project reassignment',async()=>{
 dotenv.config({path:'.env.local',quiet:true});
 assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();
 const schema='workflow_race_'+randomBytes(6).toString('hex');
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL,max:4,options:`-c search_path=${schema},public`});
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);await admin.query(`SET search_path TO ${schema},public`);
  await admin.query('BEGIN');
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await admin.query((await readFile('db/migrations/'+file,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  const owner=randomUUID(),workspace=randomUUID();
  await admin.query('INSERT INTO users(id,email,name) VALUES($1,$2,$2)',[owner,owner+'@race.example']);
  await admin.query("INSERT INTO workspaces(id,name,slug,kind,created_by) VALUES($1,'Race',$3,'individual',$2)",[workspace,owner,workspace]);
  await admin.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[workspace,owner]);
  await admin.query('COMMIT');
  const a=await saveProject(db,owner,null,project),b=await saveProject(db,owner,null,{...project,name:'Rival project'});
  const grants=(await db.query("SELECT id FROM opportunities WHERE NOT is_demo AND publication_state='published' AND verification_status<>'archived' LIMIT 2")).rows;
  const repeated=await Promise.all([saveResultForProject(db,owner,'catalog',grants[0].id,a),saveResultForProject(db,owner,'catalog',grants[0].id,a)]);
  assert.equal(repeated[0],repeated[1]);
  const competing=await Promise.allSettled([saveResultForProject(db,owner,'catalog',grants[1].id,a),saveResultForProject(db,owner,'catalog',grants[1].id,b)]);
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
  const rejected=competing.find(r=>r.status==='rejected');assert.ok(rejected?.status==='rejected'&&rejected.reason instanceof ProjectSaveConflict);
  const rows=(await db.query('SELECT opportunity_id,project_id FROM applications WHERE workspace_id=$1',[workspace])).rows;
  assert.equal(rows.length,2);assert.equal(rows.find(r=>r.opportunity_id===grants[0].id).project_id,a);
  const winner=competing[0].status==='fulfilled'?a:b;assert.equal(rows.find(r=>r.opportunity_id===grants[1].id).project_id,winner);
 }finally{await db.end();await admin.query('ROLLBACK');await admin.query('SET search_path TO public');await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
