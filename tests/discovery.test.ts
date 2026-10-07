import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import { categories, catalogCoverage, currentWorkspace, discoveryCounts, getOpportunity, parseFilters, searchOpportunities, setSavedOpportunity } from "../src/lib/opportunities/store";
import { addTask, mutateTask, checklistData, dashboardTasks, queueChecklist, confirmChecklist } from "../src/lib/checklists/store";
import { reserveResearch, persistResearch, researchData } from '../src/lib/opportunities/research-store';
import { writeReviewedGrant } from '../src/lib/opportunities/editorial-store';
import { reviewSchema } from '../src/lib/opportunities/editorial';
import { enqueueDaily,enqueueManual,recordPage,registerLinks } from '../src/lib/discovery/store';
import { publishCandidate,classifyGrant } from '../src/lib/discovery/publish';
import { moderateGrant } from '../src/lib/opportunities/moderation';
import {unifiedSearch} from '../src/lib/opportunities/results';

dotenv.config({path:".env.local",quiet:true});
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
const client = new pg.Client({connectionString:process.env.DATABASE_URL});
const schema = `grantos_test_${randomBytes(8).toString("hex")}`;
const users = {owner:randomUUID(),other:randomUUID(),viewer:randomUUID(),outsider:randomUUID()};
let workspace: string;
let opportunity: string;
before(async()=>{
  await client.connect();
  await client.query("BEGIN");
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}", public`);
  for (const file of (await readdir("db/migrations")).filter(f=>f.endsWith(".sql")).sort()) {
    const sql = (await readFile(`db/migrations/${file}`,"utf8")).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,"");
    await client.query(sql);
  }
  for (const [name,id] of Object.entries(users)) await client.query("INSERT INTO users(id,email,name) VALUES($1,$2,$3)",[id,`${name}@integration.test`,name]);
  await client.query('UPDATE users SET beta_active=true,email_verified_at=now(),catalog_editor=true WHERE id=$1',[users.owner]);
  for (const name of ["owner","other"] as const) {
    const w = await client.query("INSERT INTO workspaces(name,slug,kind,created_by) VALUES($1,$1,'individual',$2) RETURNING id",[name,users[name]]);
    if (name === "owner") workspace=w.rows[0].id;
    await client.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",[w.rows[0].id,users[name]]);
    await client.query("INSERT INTO profiles(workspace_id,display_name,applicant_type,country,state,city,onboarding_completed_at) VALUES($1,$2,'individual','United States','New York','New York City',now())",[w.rows[0].id,name]);
    await client.query("INSERT INTO profile_categories(workspace_id,category) VALUES($1,'Music')",[w.rows[0].id]);
  }
  await client.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'viewer')",[workspace,users.viewer]);
  opportunity = (await client.query("SELECT id FROM opportunities WHERE slug='awesome-nyc'")).rows[0].id;
});
after(async()=>{ await client.query("ROLLBACK"); await client.end(); });

test('unified discovery supports category OR, stable combined pagination, and private save references',async()=>{
 const music=await searchOpportunities(client,users.owner,parseFilters({category:'Music'}),true);
 const education=await searchOpportunities(client,users.owner,parseFilters({category:'Education'}),true);
 const union=await searchOpportunities(client,users.owner,parseFilters({category:['Music','Education']}),true);
 assert.deepEqual(new Set(union.rows.map(r=>r.id)),new Set([...music.rows,...education.rows].map(r=>r.id)));
 const first=await unifiedSearch(client,users.owner,{category:['Music','Education']});
 const repeat=await unifiedSearch(client,users.owner,{category:['Music','Education']});
 assert.deepEqual(first.rows.map(r=>r.id),repeat.rows.map(r=>r.id));
 if(first.total>12){const next=await unifiedSearch(client,users.owner,{category:['Music','Education'],page:'2'});assert.ok(next.rows.every(r=>!first.rows.some(a=>a.id===r.id)));}
 await setSavedOpportunity(client,users.owner,opportunity,true);
 const own=await unifiedSearch(client,users.owner,{q:'Awesome'});const other=await unifiedSearch(client,users.other,{q:'Awesome'});
 assert.ok(own.rows.find(r=>r.id===opportunity)?.applicationId);
 assert.equal(other.rows.find(r=>r.id===opportunity)?.applicationId,null);
 await assert.rejects(unifiedSearch(client,users.outsider,{}),/Workspace required/);
 await setSavedOpportunity(client,users.owner,opportunity,false);
});

test('daily jobs deduplicate, discovery queues changes and editor review preserves records',async()=>{
 const now=new Date('2026-10-06T11:00:00Z');
 const run=await enqueueDaily(client,now);assert.ok(run);assert.equal(await enqueueDaily(client,now),undefined);
 await assert.rejects(()=>enqueueManual(client,users.viewer,''),/editor access/);
 await assert.rejects(()=>enqueueManual(client,users.other,'owner@integration.test'),/editor access/);
 assert.equal(await enqueueManual(client,users.owner,'owner@integration.test'),undefined);
 await client.query("UPDATE crawl_runs SET status='complete',finished_at=now() WHERE id=$1",[run]);
 assert.equal(await enqueueDaily(client,now),undefined);
 const source=(await client.query("INSERT INTO crawl_sources(name,url,approved_domains,categories) VALUES('Test source','https://crawler.example.org',ARRAY['crawler.example.org'],ARRAY['Music']) RETURNING *")).rows[0];
 await registerLinks(client,source,['https://crawler.example.org/grant?utm_source=a','https://crawler.example.org/grant','https://outside.example.org/apply','https://127.0.0.1/secret'],1);
 assert.equal((await client.query('SELECT count(*) FROM crawl_frontier WHERE source_id=$1',[source.id])).rows[0].count,'1');
 assert.equal((await client.query("SELECT count(*) FROM crawl_candidates WHERE source_id=$1 AND kind='domain'",[source.id])).rows[0].count,'1');
 assert.equal(await registerLinks(client,source,['https://crawler.example.org/deep'],4),true);
 const page={url:'https://crawler.example.org/grant',title:'Crawl acceptance grant',text:'Official program: individual artists can apply. Maximum award is 1000 USD.',links:[],kind:'html' as const,extracted:{}};
 await recordPage(client,source.id,page);await recordPage(client,source.id,page);
 assert.equal((await client.query("SELECT count(*) FROM crawl_candidates WHERE source_id=$1 AND kind='new'",[source.id])).rows[0].count,'1');
 const candidate=(await client.query("SELECT * FROM crawl_candidates WHERE source_id=$1 AND kind='new'",[source.id])).rows[0];
 const data=reviewSchema.parse({id:'',name:page.title,funder:'Crawl test funder',url:page.url,summary:'Funding for individual artists developing new work.',eligibility:'Individual artists may apply to this program.',notes:'Current deadline is not published.',evidence:page.text,status:'unannounced',minimum:'',maximum:'1000',fee:'',currency:'USD',deadline:'',opens:'',categories:['Music'],applicants:['individual'],locations:'United States',attested:'yes'});
 const id=await writeReviewedGrant(client,users.owner,data,'owner@integration.test',candidate.id);
 assert.equal((await client.query('SELECT status FROM crawl_candidates WHERE id=$1',[candidate.id])).rows[0].status,'approved');
 await setSavedOpportunity(client,users.owner,id,true);
 const old=(await client.query('SELECT last_verified_at FROM opportunities WHERE id=$1',[id])).rows[0].last_verified_at;
 await recordPage(client,source.id,{...page,text:page.text+' New maximum: 2000 USD.'});
 assert.equal((await client.query('SELECT maximum_award FROM opportunities WHERE id=$1',[id])).rows[0].maximum_award,'1000.00');
 const changed=(await client.query("SELECT * FROM crawl_candidates WHERE opportunity_id=$1 AND status='pending'",[id])).rows[0];assert.equal(changed.kind,'changed');
 assert.equal((await searchOpportunities(client,users.owner,parseFilters({q:'Crawl acceptance'}))).rows[0].awaiting_review,true);
 assert.equal((await client.query('SELECT last_verified_at FROM opportunities WHERE id=$1',[id])).rows[0].last_verified_at.getTime(),old.getTime());
 await writeReviewedGrant(client,users.owner,{...data,id,maximum:2000},'owner@integration.test',changed.id);
 assert.equal((await searchOpportunities(client,users.owner,parseFilters({q:'Crawl acceptance',freshness:'updated'}))).total,1);
 assert.equal((await client.query('SELECT count(*) FROM saved_opportunities WHERE opportunity_id=$1',[id])).rows[0].count,'1');
 // Remove only this test's fixtures so pre-existing discovery assertions remain unchanged.
 await client.query('DELETE FROM crawl_candidates WHERE source_id=$1',[source.id]);
 await client.query('DELETE FROM crawl_snapshots WHERE source_id=$1',[source.id]);
 await client.query('DELETE FROM crawl_frontier WHERE source_id=$1',[source.id]);
 await client.query('DELETE FROM crawl_sources WHERE id=$1',[source.id]);
 await client.query('DELETE FROM opportunity_reviews WHERE opportunity_id=$1',[id]);
 await client.query('DELETE FROM opportunities WHERE id=$1',[id]);
});

test('research enforces workspace boundaries, duplicate persistence and reservation limits',async()=>{
 await assert.rejects(()=>reserveResearch(client,users.viewer,'music grants'));
 await assert.rejects(()=>reserveResearch(client,users.outsider,'music grants'));
 const run=await reserveResearch(client,users.owner,'music grants');
 await assert.rejects(()=>reserveResearch(client,users.owner,'duplicate request'),/limit/);
 const report={queries:['music grants'],warnings:[],leads:[{url:'https://example.org/grant?utm_source=x',title:'Real source lead',snippet:'Needs review',sources:[],warnings:[]}]};
 await assert.rejects(()=>persistResearch(client,users.other,run.id,report));
 await persistResearch(client,users.owner,run.id,report);
 await persistResearch(client,users.owner,run.id,report);
 assert.equal((await researchData(client,users.owner)).leads.length,1);
 assert.equal((await researchData(client,users.other)).leads.length,0);
 assert.equal((await researchData(client,users.viewer)).leads.length,1);
 await assert.rejects(()=>researchData(client,users.outsider));
 await client.query("UPDATE discovery_limits SET used=5,next_allowed=now()-interval '1 minute' WHERE workspace_id=$1",[workspace]);
 await assert.rejects(()=>reserveResearch(client,users.owner,'daily quota'),/limit/);
});

test('editorial imports deduplicate, preserve saved records, and audit reviewed changes',async()=>{
 const data=reviewSchema.parse({id:'',name:'Integration editorial grant',funder:'Editorial test foundation',url:'https://funder.example.org/application',summary:'Research support for music education projects.',eligibility:'Nonprofit organizations in New York City.',notes:'No published deadline. Confirm the current round.',evidence:'Official evidence excerpt reviewed by the test editor.',status:'unannounced',minimum:'',maximum:'5000',fee:'0',currency:'USD',deadline:'',opens:'',categories:['Music'],applicants:['nonprofit'],locations:'United States | New York | New York City',attested:'yes'});
 await client.query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[users.owner]);
 await assert.rejects(()=>writeReviewedGrant(client,users.owner,data,'owner@integration.test'),/editor access/);
 await client.query('UPDATE users SET email_verified_at=now() WHERE id=$1',[users.owner]);
 const id=await writeReviewedGrant(client,users.owner,data,'owner@integration.test');
 await assert.rejects(()=>writeReviewedGrant(client,users.other,{...data,name:'Changed name'},'owner@integration.test'),/editor access/);
 await assert.rejects(()=>writeReviewedGrant(client,users.owner,{...data,name:'Duplicate source',url:data.url+'?utm_source=abc'},'owner@integration.test'),/already in/);
 await setSavedOpportunity(client,users.owner,id,true);
 await writeReviewedGrant(client,users.owner,{...data,id,maximum:8000},'owner@integration.test');
 assert.equal((await client.query('SELECT maximum_award FROM opportunities WHERE id=$1',[id])).rows[0].maximum_award,'8000.00');
 assert.equal((await client.query('SELECT count(*) FROM opportunity_reviews WHERE opportunity_id=$1',[id])).rows[0].count,'2');
 assert.equal((await client.query('SELECT count(*) FROM saved_opportunities WHERE opportunity_id=$1',[id])).rows[0].count,'1');
 await writeReviewedGrant(client,users.owner,{...data,id,archive:true},'owner@integration.test');
 assert.equal((await searchOpportunities(client,users.owner,parseFilters({q:'Integration editorial'}))).total,0);
 await client.query('DELETE FROM opportunity_reviews WHERE opportunity_id=$1',[id]);
 await client.query('DELETE FROM opportunities WHERE id=$1',[id]);
});

test("profile-only suggestions combine with filters and pagination",async()=>{
 const r=await searchOpportunities(client,users.owner,parseFilters({suggested:"1",category:"Music",location:"nyc_only"}));assert.equal(r.total,1);assert.equal(r.rows[0].slug,"awesome-nyc");
 assert.equal((await searchOpportunities(client,users.owner,parseFilters({suggested:"1",page:"2"}))).rows.length,0);
});
test("manual checklist CRUD is private, viewer protected, and follows saved status",async()=>{
 await setSavedOpportunity(client,users.owner,opportunity,true);
 const id=await addTask(client,users.owner,opportunity,{title:"Write project statement",notes:"Draft first",due_date:"2026-10-06"});
 await assert.rejects(()=>addTask(client,users.viewer,opportunity,{title:"Forbidden"}));
 await assert.rejects(()=>addTask(client,users.outsider,opportunity,{title:"Forbidden"}));
 assert.equal((await dashboardTasks(client,users.other)).length,0);
 await assert.rejects(()=>mutateTask(client,users.other,opportunity,id,"complete"));
 await mutateTask(client,users.owner,opportunity,id,"edit",{title:"Edited statement",notes:"Updated",due_date:null});
 assert.equal((await checklistData(client,users.owner,opportunity)).tasks[0].title,"Edited statement");
 await mutateTask(client,users.owner,opportunity,id,"complete");assert.equal((await dashboardTasks(client,users.owner)).length,0);
 await mutateTask(client,users.owner,opportunity,id,"reopen");assert.equal((await dashboardTasks(client,users.owner)).length,1);
 await setSavedOpportunity(client,users.owner,opportunity,false);assert.equal((await dashboardTasks(client,users.owner)).length,0);
 await setSavedOpportunity(client,users.owner,opportunity,true);assert.equal((await dashboardTasks(client,users.owner)).length,1);
 await mutateTask(client,users.owner,opportunity,id,"delete");assert.equal((await dashboardTasks(client,users.owner)).length,0);
 await assert.rejects(()=>addTask(client,users.owner,opportunity,{title:"",due_date:"2026-02-30"}));
 await setSavedOpportunity(client,users.owner,opportunity,false);
});
test("paid queue limits, idempotency, drafts, confirmation and downgrade preserve manual access",async()=>{
 await setSavedOpportunity(client,users.owner,opportunity,true);
 await assert.rejects(()=>queueChecklist(client,users.owner,opportunity,true),/paid plan/);
 await client.query("UPDATE workspaces SET plan='paid' WHERE id=$1",[workspace]);
 await assert.rejects(()=>queueChecklist(client,users.owner,opportunity,false),/not configured/);
 const job=await queueChecklist(client,users.owner,opportunity,true);assert.equal(await queueChecklist(client,users.owner,opportunity,true),job);
 const draft=[{title:"Project statement",notes:"Required",due_date:null,source_url:"https://www.awesomefoundation.org/en/chapters/nyc",source_excerpt:"Describe your project",uncertainty:"",date_excerpt:""}];
 await client.query("UPDATE checklist_jobs SET status='draft',draft=$2 WHERE id=$1",[job,JSON.stringify(draft)]);
 assert.equal((await dashboardTasks(client,users.owner)).length,0);
 await assert.rejects(()=>confirmChecklist(client,users.other,opportunity,job,[{index:0,title:"Hijack"}]));
 await assert.rejects(()=>confirmChecklist(client,users.viewer,opportunity,job,[{index:0,title:"Hijack"}]));
 await confirmChecklist(client,users.owner,opportunity,job,[{index:0,title:"My edited task",notes:"Edited draft",due_date:"2026-10-10"}]);
 await confirmChecklist(client,users.owner,opportunity,job,[{index:0,title:"Duplicate"}]);assert.equal((await dashboardTasks(client,users.owner)).length,1);
 const second=await queueChecklist(client,users.owner,opportunity,true);assert.notEqual(second,job);assert.equal((await dashboardTasks(client,users.owner)).length,1);
 await client.query("UPDATE checklist_jobs SET status='failed' WHERE id=$1",[second]);
 await client.query("INSERT INTO checklist_jobs(workspace_id,opportunity_id,requested_by,status) SELECT $1,$2,$3,'failed' FROM generate_series(1,8)",[workspace,opportunity,users.owner]);
 await assert.rejects(()=>queueChecklist(client,users.owner,opportunity,true),/limit of 10/);
 await client.query("UPDATE workspaces SET plan='free' WHERE id=$1",[workspace]);await assert.rejects(()=>queueChecklist(client,users.owner,opportunity,true),/paid plan/);
 const retained=(await dashboardTasks(client,users.owner))[0];await mutateTask(client,users.owner,opportunity,retained.id,"edit",{title:"Still editable"});await mutateTask(client,users.owner,opportunity,retained.id,"delete");
 await setSavedOpportunity(client,users.owner,opportunity,false);
});

test("catalog contains real sources and original check dates",async()=>{
  const r=await searchOpportunities(client,users.owner,parseFilters({}));
  assert.ok(r.total >= 21);
  assert.ok(r.rows.every(o=>o.official_url.startsWith("https://") && o.last_checked_at && o.summary && o.eligibility_notes));
  assert.ok(r.rows.every(o=>o.last_checked_at!.toISOString().startsWith("2026-10-05")));
});
test("search, combined filters, NYC scope, award sorting and pagination work",async()=>{
  assert.equal((await searchOpportunities(client,users.owner,parseFilters({q:"Pollock"}))).rows[0].slug,"pollock-krasner-artist-grants");
  assert.equal((await searchOpportunities(client,users.owner,parseFilters({category:"Music",location:"nyc_only"}))).rows[0].slug,"awesome-nyc");
  const music = await searchOpportunities(client,users.owner,parseFilters({category:"Music",minAward:"4000"}));
  assert.ok(music.total > 0); assert.ok(music.rows.every(o=>o.categories.includes("Music") && Number(o.maximum_award)>=4000));
  const sorted = await searchOpportunities(client,users.owner,parseFilters({sort:"amount"}));
  assert.ok(sorted.rows.every((o,i)=>i===0 || Number(sorted.rows[i-1].maximum_award)>=Number(o.maximum_award)));
  const beyond=await searchOpportunities(client,users.owner,parseFilters({page:"2"}));
  assert.ok(beyond.total >= 21); assert.ok(beyond.rows.length>0);
  const first=await searchOpportunities(client,users.owner,parseFilters({}));
  assert.ok(beyond.rows.every(o=>!first.rows.some(p=>p.id===o.id)));
});
test("search treats SQL injection, percent and underscore as literal text",async()=>{
  for(const q of ["%' OR 1=1 --","_"]) assert.equal((await searchOpportunities(client,users.owner,parseFilters({q}))).total,0);
  const percent=await searchOpportunities(client,users.owner,parseFilters({q:"%"}));
  assert.ok(percent.rows.every(o=>[o.name,o.summary,o.funder,o.eligibility_notes,...o.categories].join(" ").includes("%")));
});

test("each funding interest has at least five distinct sourced programs",async()=>{
  const coverage=await catalogCoverage(client);
  for(const category of categories){
    const r=await searchOpportunities(client,users.owner,parseFilters({category}));
    assert.ok(r.total>=5,`${category}: only ${r.total}`);
    assert.equal(coverage[category],r.total);
    assert.equal(new Set(r.rows.map(o=>o.id)).size,r.rows.length);
    assert.ok(r.rows.every(o=>o.categories.includes(category) && o.source_url.startsWith("https://") && o.deadline_notes));
  }
});
test("keyword terms match category and eligibility without relaxing filters",async()=>{
  const r=await searchOpportunities(client,users.owner,parseFilters({q:"photography student"}));
  assert.ok(r.rows.some(o=>o.slug==='smith-student-photography'));
  const restricted=await searchOpportunities(client,users.owner,parseFilters({category:"Photography",applicant:"student",location:"nyc_only",status:"open"}));
  assert.equal(restricted.total,0);
});
test("open programs precede closed rounds and narrow status filters stay exact",async()=>{
  const first=await searchOpportunities(client,users.owner,parseFilters({category:"Photography"}));
  assert.equal(first.rows[0].status,'open');
  const open=await searchOpportunities(client,users.owner,parseFilters({category:"Photography",status:"open"}));
  assert.ok(open.rows.every(o=>o.status==='open'));
  const free=await searchOpportunities(client,users.owner,parseFilters({saved:"1",category:"Photography"}));
  assert.equal(free.total,0);
});
test("duplicate saves are idempotent and private to a workspace",async()=>{
  await setSavedOpportunity(client,users.owner,opportunity,true);
  await setSavedOpportunity(client,users.owner,opportunity,true);
  assert.equal((await discoveryCounts(client,users.owner)).saved,"1");
  assert.equal((await discoveryCounts(client,users.other)).saved,"0");
  assert.equal((await getOpportunity(client,users.owner,"awesome-nyc")).opportunity.saved,true);
  assert.equal((await getOpportunity(client,users.other,"awesome-nyc")).opportunity.saved,false);
  await setSavedOpportunity(client,users.other,opportunity,false);
  assert.equal((await discoveryCounts(client,users.owner)).saved,"1");
});
test("viewers can read their workspace but cannot modify its shortlist",async()=>{
  assert.equal((await currentWorkspace(client,users.viewer)).role,"viewer");
  assert.equal((await searchOpportunities(client,users.viewer,parseFilters({saved:"1"}))).total,1);
  await assert.rejects(setSavedOpportunity(client,users.viewer,opportunity,true),/not permitted/);
  await assert.rejects(setSavedOpportunity(client,users.viewer,opportunity,false),/not permitted/);
});
test("users without membership cannot read private saves or write them",async()=>{
  await assert.rejects(searchOpportunities(client,users.outsider,parseFilters({saved:"1"})),/Workspace required/);
  await assert.rejects(setSavedOpportunity(client,users.outsider,opportunity,true),/not permitted/);
});
test("removing a save updates dashboard counts",async()=>{
  await setSavedOpportunity(client,users.owner,opportunity,false);
  assert.equal((await discoveryCounts(client,users.owner)).saved,"0");
});
test("expired deadlines close automatically and stale sources request reverification",async()=>{
  await client.query("UPDATE opportunities SET deadline_at=now()-interval '1 day', last_checked_at=now()-interval '91 days' WHERE id=$1",[opportunity]);
  const {opportunity:o}=await getOpportunity(client,users.owner,"awesome-nyc");
  assert.equal(o.status,"closed"); assert.equal(o.fresh,false);
  assert.ok((await searchOpportunities(client,users.owner,parseFilters({status:"closed"}))).rows.some(row=>row.id===opportunity));
});
test("unannounced dates stay unknown; archived and demo entries are excluded",async()=>{
  await client.query("UPDATE opportunities SET deadline_at=NULL, application_status='unannounced' WHERE id=$1",[opportunity]);
  const o=(await getOpportunity(client,users.owner,"awesome-nyc")).opportunity;
  assert.equal(o.deadline_at,null); assert.equal(o.status,"unannounced");
  await client.query("UPDATE opportunities SET verification_status='archived' WHERE id=$1",[opportunity]);
  assert.equal((await getOpportunity(client,users.owner,"awesome-nyc")).opportunity,undefined);
  await client.query("UPDATE opportunities SET is_demo=true WHERE slug='pollock-krasner-artist-grants'");
  assert.equal((await searchOpportunities(client,users.owner,parseFilters({q:"Pollock"}))).total,0);
});
test("invalid filter inputs are bounded and normalized",()=>{
  const f=parseFilters({q:["a","b"],page:"Infinity",minAward:"NaN",sort:"random()",category:"Anything"});
  assert.equal(f.q,"");assert.equal(f.page,1);assert.equal(f.minAward,0);assert.equal(f.sort,"deadline");assert.equal(f.category,"");
});


test('free accounts can discover incomplete auto-published leads without false eligibility matches',async()=>{
 const source=(await client.query("INSERT INTO crawl_sources(name,url,approved_domains,categories) VALUES('Auto source','https://auto.example.org',ARRAY['auto.example.org'],ARRAY['Music']) RETURNING id")).rows[0].id;
 const page={url:'https://auto.example.org/program',title:'Emerging Composers Grant',text:'The Emerging Composers Grant supports composers. Read the application requirements on this page.',links:[],kind:'html' as const,extracted:{}};
 await recordPage(client,source,page);
 const candidate=(await client.query("SELECT id FROM crawl_candidates WHERE source_id=$1 AND kind='new'",[source])).rows[0].id;
 const first=await publishCandidate(client,candidate);assert.equal(first.outcome,'published');const id=first.opportunityId!;
 assert.equal((await currentWorkspace(client,users.owner)).plan,'free');
 const search=()=>searchOpportunities(client,users.owner,parseFilters({q:'Emerging Composers'}));
 const result=await search();assert.equal(result.total,1);const row=result.rows[0];
 assert.equal(row.status,'unknown');assert.equal(row.publication_origin,'crawler');assert.equal(row.last_checked_at,null);assert.equal(row.last_verified_at,null);assert.ok(row.source_fetched_at);
 assert.deepEqual(row.applicant_types,[]);assert.deepEqual(row.locations,[]);assert.equal(row.maximum_award,null);
 for(const filter of [{applicant:'individual'},{location:'nyc'},{status:'open'},{minAward:'1'},{suggested:'1'}])assert.equal((await searchOpportunities(client,users.owner,parseFilters({q:'Emerging Composers',...filter}))).total,0);
 assert.equal((await publishCandidate(client,candidate)).outcome,'skipped');assert.equal((await search()).total,1);
 await setSavedOpportunity(client,users.owner,id,true);const task=await addTask(client,users.owner,id,{title:'Check the funder requirements'});assert.ok(task);
 await recordPage(client,source,{...page,text:page.text+' Applications are closed.',extracted:{status:'closed',status_evidence:'Applications are closed.'}});
 const changed=(await client.query("SELECT id FROM crawl_candidates WHERE opportunity_id=$1 AND status='pending'",[id])).rows[0].id;
 assert.equal((await publishCandidate(client,changed)).outcome,'updated');assert.equal((await search()).rows[0].status,'closed');assert.equal((await search()).rows[0].saved,true);assert.equal((await checklistData(client,users.owner,id)).tasks.length,1);
 await client.query("UPDATE opportunities SET verification_status='verified',last_verified_at=now(),maximum_award=1234 WHERE id=$1",[id]);
 await recordPage(client,source,{...page,text:page.text+' Changed requirements.'});
 const reviewedChange=(await client.query("SELECT id FROM crawl_candidates WHERE opportunity_id=$1 AND status='pending'",[id])).rows[0].id;
 assert.equal((await publishCandidate(client,reviewedChange)).outcome,'updated');assert.equal((await search()).rows[0].maximum_award,'1234.00');assert.equal((await search()).rows[0].awaiting_review,false);
 await assert.rejects(()=>moderateGrant(client,users.other,id,'hide',undefined,'owner@integration.test'),/editor access/);
 await moderateGrant(client,users.owner,id,'hide',undefined,'owner@integration.test');assert.equal((await search()).total,0);
 assert.equal((await publishCandidate(client,reviewedChange)).outcome,'skipped');
});

test('classification excludes directories and supports audited duplicate merges',async()=>{
 for(const title of ['Grants & Opportunities','Research Grant Programs','Grant Program Contacts','How Do I Administer the SCMP Award?','Funding Resources','Apply for Funding','SCMP Awarded Grants'])assert.ok(classifyGrant(title,'https://example.org/grants','Apply for grant funding here.'));
 assert.equal(classifyGrant('Rauschenberg Dancer Emergency Grants','https://example.org/program','Applications support artists.'),null);
 const source=(await client.query("INSERT INTO crawl_sources(name,url,approved_domains,categories) VALUES('Merge source','https://merge.example.org',ARRAY['merge.example.org'],ARRAY['Music']) RETURNING id")).rows[0].id;
 const make=async(title:string,path:string)=>{
  await recordPage(client,source,{url:'https://merge.example.org/'+path,title,text:'This funding program supports artists through grants. Application information is available.',links:[],kind:'html',extracted:{}});
  return (await client.query("SELECT id FROM crawl_candidates WHERE source_id=$1 AND url=$2 ORDER BY created_at DESC LIMIT 1",[source,'https://merge.example.org/'+path])).rows[0].id;
 };
 const a=await publishCandidate(client,await make('Test Composer Project Grant','one'));const id=a.opportunityId!;
 const duplicate=await publishCandidate(client,await make('Test Composer Project Grant 2027','alternate'));assert.equal(duplicate.outcome,'skipped');assert.equal(duplicate.opportunityId,id);
 const b=await publishCandidate(client,await make('Second Composer Award','two'));const target=b.opportunityId!;
 await setSavedOpportunity(client,users.owner,id,true);await addTask(client,users.owner,id,{title:'Keep this task'});
 await setSavedOpportunity(client,users.owner,target,true);
 await moderateGrant(client,users.owner,id,'merge',target,'owner@integration.test');
 assert.equal((await client.query('SELECT count(*) FROM saved_opportunities WHERE workspace_id=$1 AND opportunity_id=$2',[workspace,target])).rows[0].count,'1');
 assert.equal((await checklistData(client,users.owner,target)).tasks.length,1);
 assert.equal((await client.query('SELECT merged_into,publication_state FROM opportunities WHERE id=$1',[id])).rows[0].merged_into,target);
});

test('all pending source candidates are searchable by free users without publication',async()=>{
 const {searchCandidates}=await import('../src/lib/opportunities/store');
 const source=(await client.query("INSERT INTO crawl_sources(name,url,approved_domains,categories) VALUES('Public candidates','https://leads.example.org',ARRAY['leads.example.org'],ARRAY['Music']) RETURNING id")).rows[0].id;
 for(let n=0;n<14;n++)await recordPage(client,source,{url:`https://leads.example.org/${n}`,title:`Proposed music grants ${n}`,text:'Ambiguous source excerpt with funding information.',links:[],kind:'html',extracted:{}});
 await registerLinks(client,{id:source,approved_domains:['leads.example.org']},['https://unapproved.example.org/'],1);
 const filters=parseFilters({q:'Proposed music grants',category:'Music',resultType:'all'});
 const first=await searchCandidates(client,users.owner,filters);assert.equal(first.total,14);assert.equal(first.rows.length,12);
 const next=await searchCandidates(client,users.owner,filters,2);assert.equal(next.rows.length,2);assert.ok(next.rows.every(r=>!first.rows.some(f=>f.id===r.id)));
 assert.equal((await searchCandidates(client,users.other,filters)).total,14);
 assert.equal((await searchCandidates(client,users.owner,{...filters,status:'open'})).total,0);
 assert.equal((await searchCandidates(client,users.owner,{...filters,location:'nyc'})).total,0);
 assert.equal((await searchCandidates(client,users.owner,{...filters,q:'%'})).total,0);
 await assert.rejects(()=>searchCandidates(client,users.outsider,filters),/Workspace required/);
 assert.equal((await client.query("SELECT count(*) FROM crawl_candidates WHERE source_id=$1 AND status='published'",[source])).rows[0].count,'0');
});

test('grant lead filtering excludes articles and questions before pagination but retains all research on request',async()=>{
 const {searchCandidates}=await import('../src/lib/opportunities/store');
 const source=(await client.query("INSERT INTO crawl_sources(name,url,approved_domains,categories) VALUES('Filter acceptance','https://filter.example.org',ARRAY['filter.example.org'],ARRAY['Music']) RETURNING id")).rows[0].id;
 const pages=[['questions','How do I get a music grant?'],['advice','Five tips for music grants'],['directory','Music grant directory'],['news/award','Community Music Grant'],['support','Music Grant Application Process']];
 for(let n=0;n<14;n++)pages.push([`program-${n}`,`Composer Fellowship ${n}`]);
 for(const [path,title] of pages)await recordPage(client,source,{url:`https://filter.example.org/${path}`,title,text:'Applications provide funding for eligible composers.',links:[],kind:'html',extracted:{}});
 const support=(await client.query('SELECT id FROM crawl_candidates WHERE source_id=$1 AND url=$2',[source,'https://filter.example.org/support'])).rows[0];
 await client.query("INSERT INTO crawl_publication_results(candidate_id,outcome,reason) VALUES($1,'skipped','Supporting document or ambiguous listing')",[support.id]);
 const filters=parseFilters({q:'Filter acceptance'});
 assert.equal(filters.resultType,'grants');assert.equal(parseFilters({resultType:'invalid'}).resultType,'grants');
 const first=await searchCandidates(client,users.owner,filters);const second=await searchCandidates(client,users.owner,filters,2);
 assert.equal(first.total,14);assert.equal(first.rows.length,12);assert.equal(second.rows.length,2);
 assert.ok([...first.rows,...second.rows].every(r=>r.title.startsWith('Composer Fellowship')));
 assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,14);
 assert.equal((await searchCandidates(client,users.owner,{...filters,resultType:'all'})).total,19);
 assert.equal((await searchCandidates(client,users.owner,{...filters,resultType:'catalog'})).total,0);
 assert.equal((await searchCandidates(client,users.owner,{...filters,status:'open'})).total,0);
});


test('catalog monitoring archives only explicit discontinuation and preserves saved work through restoration',async()=>{
 const {monitorCatalogPage,lifecycleSignal,seedCatalogMonitoring}=await import('../src/lib/discovery/monitor');
 const grant=(await client.query("SELECT * FROM opportunities WHERE id=$1",[opportunity])).rows[0];
 await client.query("UPDATE opportunities SET publication_state='published',verification_status='verified',merged_into=NULL WHERE id=$1",[opportunity]);
 await setSavedOpportunity(client,users.owner,opportunity,true);
 const original=(await client.query('SELECT * FROM opportunities WHERE id=$1',[opportunity])).rows[0];
 const saved=(await client.query('SELECT id FROM applications WHERE opportunity_id=$1 AND workspace_id=$2',[opportunity,workspace])).rows;
 const page={url:grant.source_url,title:grant.name,text:'This program has been permanently discontinued.',links:[],kind:'html' as const,extracted:{}};
 assert.equal(lifecycleSignal(grant.name,{...page,text:'Applications are closed for this cycle.'}),null);
 assert.equal(lifecycleSignal(grant.name,{...page,text:'This program has not been discontinued.'}),null);
 assert.equal(lifecycleSignal(grant.name,{...page,text:'If this program is permanently closed, contact support.'}),null);
 assert.equal(lifecycleSignal(grant.name,{...page,text:'This program is no longer offered this year.'}),null);
 assert.equal(lifecycleSignal(grant.name,{...page,title:'Other Grant Program'}),null);
 const run=async()=> (await client.query("INSERT INTO crawl_runs(trigger,status) VALUES('acceptance','complete') RETURNING id")).rows[0].id;
 const first=await run();await monitorCatalogPage(client,first,grant.source_url,page);await monitorCatalogPage(client,first,grant.source_url,page);
 assert.equal((await client.query('SELECT count(*) FROM catalog_monitor_events WHERE run_id=$1',[first])).rows[0].count,'1');
 assert.equal((await searchOpportunities(client,users.owner,parseFilters({q:grant.name}))).rows.some(r=>r.id===opportunity),false);
 assert.equal((await searchOpportunities(client,users.owner,parseFilters({saved:'1'}))).rows.some(r=>r.id===opportunity),true);
 assert.equal((await getOpportunity(client,users.owner,grant.slug)).opportunity.monitor_state,'discontinued');
 await monitorCatalogPage(client,await run(),grant.source_url,undefined,'HTTP 404');
 assert.equal((await getOpportunity(client,users.owner,grant.slug)).opportunity.monitor_state,'discontinued');
 await monitorCatalogPage(client,await run(),grant.source_url,{...page,text:'This program is now accepting applications.'});
 assert.equal((await getOpportunity(client,users.owner,grant.slug)).opportunity.monitor_state,'active');
 for(let n=0;n<3;n++)await monitorCatalogPage(client,await run(),grant.source_url,undefined,'HTTP 503');
 const current=(await getOpportunity(client,users.owner,grant.slug)).opportunity;
 assert.equal(current.monitor_failures,3);assert.equal(current.monitor_state,'active');assert.ok(current.monitor_success);
 assert.ok((await searchOpportunities(client,users.owner,parseFilters({q:grant.name}))).rows.some(r=>r.id===opportunity));
 assert.deepEqual((await client.query('SELECT id FROM applications WHERE opportunity_id=$1 AND workspace_id=$2',[opportunity,workspace])).rows,saved);
 assert.deepEqual((await client.query('SELECT * FROM opportunities WHERE id=$1',[opportunity])).rows[0],original);
 await seedCatalogMonitoring(client);await seedCatalogMonitoring(client);
 assert.ok((await client.query('SELECT 1 FROM crawl_frontier WHERE url=$1',[grant.source_url])).rowCount);
});
