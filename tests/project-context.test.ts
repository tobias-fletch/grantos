import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import dotenv from 'dotenv';
import {projectContextSchema,projectContextFromForm,legalStatuses} from '../src/lib/projects/context';
import {saveProject,listProjects,archiveProject,projectInput} from '../src/lib/projects/store';
import {projectSearch} from '../src/lib/projects/search';

const input={name:'Community art studio',description:'Private project description',applicant_type:'individual',country:'United States',state:'Louisiana',city:'New Orleans',postal_code:'70112',categories:['Visual Art'],amount:'5000',target_date:null};
const context={legal_status:'individual' as const,service_area:'Rural Louisiana and online',beneficiaries:'Local artists',activities:'Three workshops',intended_outcomes:'Build participants’ skills',evidence:'Held two workshops last year',evidence_url:'https://example.org/portfolio'};

test('project context supports empty legacy profiles and explicit legal statuses without inference',()=>{
 assert.deepEqual(projectContextSchema.parse({}),{});
 for(const legal_status of legalStatuses)assert.equal(projectContextSchema.parse({legal_status}).legal_status,legal_status);
 assert.equal(projectContextSchema.parse({legal_status:''}).legal_status,undefined);
 assert.equal(projectContextSchema.safeParse({legal_status:'verified nonprofit'}).success,false);
 assert.equal(projectInput.parse(input).context,undefined);
 assert.equal(projectInput.parse({...input,applicant_type:'business',context:{}}).context?.legal_status,undefined);
 assert.equal(projectContextSchema.parse({service_area:'  Online  '}).service_area,'Online');
});

test('project context bounds text and allows only optional http(s) evidence links',()=>{
 for(const [field,max] of Object.entries({service_area:1000,beneficiaries:2000,activities:4000,intended_outcomes:3000,evidence:6000,evidence_url:2000})){
  assert.equal(projectContextSchema.safeParse({[field]:'x'.repeat(max+1)}).success,false,field);
 }
 for(const evidence_url of ['', 'https://example.org/work','http://example.org/work'])assert.equal(projectContextSchema.safeParse({evidence_url}).success,true);
 for(const evidence_url of ['javascript:alert(1)','data:text/plain,test','ftp://example.org','example.org','https://user:secret@example.org'])assert.equal(projectContextSchema.safeParse({evidence_url}).success,false,evidence_url);
});

test('project context form extraction is explicit and private context stays outside search URLs',()=>{
 const form=new FormData();assert.equal(projectContextFromForm(form),undefined);
 for(const [key,value] of Object.entries(context))form.set(`context_${key}`,value);
 assert.deepEqual(projectContextFromForm(form),context);
 const search=projectSearch({...input,context} as typeof input);
 for(const [key,value] of Object.entries(context).filter(([key])=>key!=='legal_status'))assert.equal(decodeURIComponent(search).includes(value),false);
 assert.equal(search,projectSearch(input));
 const params=new URL('https://example.org'+search).searchParams;
 assert.equal(params.get('city'),'New Orleans');
 assert.equal(params.has('context'),false);
});

dotenv.config({path:'.env.local',quiet:true});
test('project context round-trips, retains legacy data, and enforces workspace isolation', {skip:!process.env.DATABASE_URL},async()=>{
 const connectionString=process.env.DATABASE_URL!;
 assert.ok(['localhost','127.0.0.1'].includes(new URL(connectionString).hostname),'Use a local test database');
 const db=new pg.Client({connectionString});await db.connect();
 const schema='project_context_'+randomBytes(6).toString('hex');
 try{
  await db.query('BEGIN');await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET LOCAL search_path TO ${schema},public`);
  for(const file of (await readdir('db/migrations')).filter(file=>file.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+file,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  const owner=randomUUID(),viewer=randomUUID(),other=randomUUID();
  for(const id of [owner,viewer,other])await db.query('INSERT INTO users(id,email,name) VALUES($1,$2,$2)',[id,id+'@test.example']);
  const workspace=(await db.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES('Context','context','individual',$1) RETURNING id",[owner])).rows[0].id;
  const otherWorkspace=(await db.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES('Other','other-context','individual',$1) RETURNING id",[other])).rows[0].id;
  await db.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')",[workspace,owner,viewer,otherWorkspace,other]);
  const legacy=await saveProject(db,owner,null,input);
  assert.deepEqual((await listProjects(db,owner)).find(p=>p.id===legacy).context,{});
  const id=await saveProject(db,owner,null,{...input,context});
  assert.deepEqual((await listProjects(db,viewer)).find(p=>p.id===id).context,context);
  await saveProject(db,owner,id,{...input,name:'Renamed studio'});
  assert.deepEqual((await listProjects(db,owner)).find(p=>p.id===id).context,context);
  await assert.rejects(saveProject(db,viewer,id,{...input,context:{evidence:'Edited'}}),/denied/);
  await assert.rejects(saveProject(db,other,id,{...input,context:{evidence:'Edited'}}),/not found/);
  assert.deepEqual(await listProjects(db,other),[]);
  await archiveProject(db,owner,id,true);await archiveProject(db,owner,id,false);
  assert.deepEqual((await listProjects(db,owner)).find(p=>p.id===id).context,context);
  await saveProject(db,owner,id,{...input,context:{}});
  assert.deepEqual((await listProjects(db,owner)).find(p=>p.id===id).context,{});
 }finally{await db.query('ROLLBACK');await db.end();}
});
