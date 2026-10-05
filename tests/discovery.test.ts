import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import { currentWorkspace, discoveryCounts, getOpportunity, parseFilters, searchOpportunities, setSavedOpportunity } from "../src/lib/opportunities/store";

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

test("catalog contains real sources and original check dates",async()=>{
  const r=await searchOpportunities(client,users.owner,parseFilters({}));
  assert.equal(r.total,4);
  assert.ok(r.rows.every(o=>o.official_url.startsWith("https://") && o.last_checked_at && o.summary && o.eligibility_notes));
  assert.ok(r.rows.every(o=>o.last_checked_at!.toISOString().startsWith("2026-10-05")));
});
test("search, combined filters, NYC scope, award sorting and pagination work",async()=>{
  assert.equal((await searchOpportunities(client,users.owner,parseFilters({q:"Pollock"}))).rows[0].slug,"pollock-krasner-artist-grants");
  assert.equal((await searchOpportunities(client,users.owner,parseFilters({category:"Music",location:"nyc_only"}))).rows[0].slug,"awesome-nyc");
  assert.equal((await searchOpportunities(client,users.owner,parseFilters({category:"Music",minAward:"4000"}))).total,0);
  assert.equal((await searchOpportunities(client,users.owner,parseFilters({sort:"amount"}))).rows[0].slug,"pollock-krasner-artist-grants");
  const beyond=await searchOpportunities(client,users.owner,parseFilters({page:"2"}));
  assert.equal(beyond.total,4); assert.equal(beyond.rows.length,0);
});
test("search treats SQL injection, percent and underscore as literal text",async()=>{
  for(const q of ["%' OR 1=1 --","%","_"]) assert.equal((await searchOpportunities(client,users.owner,parseFilters({q}))).total,0);
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
