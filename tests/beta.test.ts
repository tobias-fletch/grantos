import {before,after,test} from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {readdir,readFile} from 'node:fs/promises';import pg from 'pg';import dotenv from 'dotenv';import bcrypt from 'bcryptjs';
import {createInvitation,redeemInvitation,issueToken,verifyEmail,resetPassword,validSession,accountAllowed,editorAllowed,requireBetaOwner,revokeInvitation,setBetaAccess,rateLimit} from '../src/lib/beta/security';import {sendAccountEmail} from '../src/lib/beta/email';
dotenv.config({path:'.env.local',quiet:true});process.env.AUTH_SECRET??='isolated-test-secret';
const schema=`beta_test_${randomBytes(8).toString('hex')}`;const admin=new pg.Client({connectionString:process.env.DATABASE_URL});const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`});let owner:string,user:string;
before(async()=>{await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);await admin.query(`SET search_path TO ${schema},public`);for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await admin.query(await readFile(`db/migrations/${file}`,'utf8'));
 owner=(await admin.query("INSERT INTO users(email,name,beta_owner,beta_active,email_verified_at,catalog_editor) VALUES('owner@beta.example','Owner',true,true,now(),true) RETURNING id")).rows[0].id;});
after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const registration=(token:string,email='invited@beta.example')=>({name:'Beta tester',email,password:'A private test password 2026!',token});
test('invitation redemption is email-bound, hashed, expiring and single-use under concurrency',async()=>{
 await assert.rejects(()=>redeemInvitation(pool,registration('')));
 const t=await createInvitation(pool,owner,'invited@beta.example');const stored=(await pool.query('SELECT token_hash FROM beta_tokens WHERE id=$1',[t.id])).rows[0];assert.notEqual(stored.token_hash,t.token);assert.equal(stored.token_hash.length,64);
 await assert.rejects(()=>redeemInvitation(pool,registration(t.token,'wrong@beta.example')));
 const results=await Promise.allSettled([redeemInvitation(pool,registration(t.token)),redeemInvitation(pool,registration(t.token))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 user=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<string>).value;assert.ok(await validSession(pool,user,0,true));assert.equal((await pool.query('SELECT count(*)::int AS n FROM workspace_members WHERE user_id=$1',[user])).rows[0].n,1);
 for(const mode of ['expired','revoked']){const x=await createInvitation(pool,owner,`${mode}@beta.example`);if(mode==='expired')await pool.query("UPDATE beta_tokens SET expires_at=now()-interval '1 second' WHERE id=$1",[x.id]);else await revokeInvitation(pool,owner,x.id);await assert.rejects(()=>redeemInvitation(pool,registration(x.token,`${mode}@beta.example`)));}
});
test('verified roles and active beta status are mandatory; allowlisted emails grant nothing',async()=>{
 assert.equal(await editorAllowed(pool,user),false);await assert.rejects(()=>requireBetaOwner(pool,user));await assert.rejects(()=>createInvitation(pool,user,'someone@beta.example'));
 assert.equal(accountAllowed({beta_active:true,email_verified_at:null},true),false);assert.equal(accountAllowed({beta_active:false,email_verified_at:new Date()},true),false);
 await pool.query('UPDATE users SET catalog_editor=true,email_verified_at=NULL WHERE id=$1',[user]);assert.equal(await editorAllowed(pool,user),false);assert.equal(await validSession(pool,user,0,true),null);
 const token=await issueToken(pool,'invited@beta.example','verify');await verifyEmail(pool,token.token);await assert.rejects(()=>verifyEmail(pool,token.token));assert.equal(await editorAllowed(pool,user),true);assert.equal(await validSession(pool,user,0,true),null);assert.ok(await validSession(pool,user,1,true));
});
test('password recovery invalidates all sessions and outstanding reset links',async()=>{
 const a=await issueToken(pool,'invited@beta.example','reset');const b=await issueToken(pool,'invited@beta.example','reset');await resetPassword(pool,a.token,'A changed password 2026!');await assert.rejects(()=>resetPassword(pool,b.token,'Another password 2026!'));assert.equal(await validSession(pool,user,1,true),null);assert.ok(await validSession(pool,user,2,true));assert.ok(await bcrypt.compare('A changed password 2026!',(await pool.query('SELECT password_hash FROM users WHERE id=$1',[user])).rows[0].password_hash));
 const expired=await issueToken(pool,'invited@beta.example','reset');await pool.query("UPDATE beta_tokens SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);await assert.rejects(()=>resetPassword(pool,expired.token,'Another password 2026!'));
 await setBetaAccess(pool,owner,user,false);assert.equal(await validSession(pool,user,2,true),null);assert.equal(await editorAllowed(pool,user),false);await assert.rejects(()=>setBetaAccess(pool,owner,owner,false));await setBetaAccess(pool,owner,user,true);assert.equal(await validSession(pool,user,2,true),null);
});
test('shared rate limit atomically enforces attempts across connections',async()=>{const results=await Promise.all(Array.from({length:15},()=>rateLimit(pool,'beta-atomic-test',5,900)));assert.equal(results.filter(Boolean).length,5);});
test('email quota gates delivery and uses idempotency without live provider calls',async()=>{
 const original=globalThis.fetch;const previous={...process.env};let calls=0;
 process.env.RESEND_API_KEY='test-key';process.env.EMAIL_FROM='GrantOS <beta@test.example>';process.env.APP_URL='https://grantos.test.example';process.env.EMAIL_ENABLED='true';
 globalThis.fetch=async (_url,options)=>{calls++;assert.equal((options?.headers as Record<string,string>)['Idempotency-Key'],'test-email-id');return new Response('{}',{status:200});};
 try{await sendAccountEmail(pool,'tester@test.example','verify','test-token','test-email-id');assert.equal(calls,1);await pool.query("UPDATE email_budget SET count=90 WHERE day=(now() AT TIME ZONE 'UTC')::date");await assert.rejects(()=>sendAccountEmail(pool,'tester@test.example','verify','test-token','test-email-id'));assert.equal(calls,1);process.env.EMAIL_ENABLED='false';await assert.rejects(()=>sendAccountEmail(pool,'tester@test.example','verify','test-token','test-email-id'));assert.equal(calls,1);}
 finally{globalThis.fetch=original;for(const key of ['RESEND_API_KEY','EMAIL_FROM','APP_URL','EMAIL_ENABLED']){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});

test('beta AI generation stays disabled with provider credentials present',async()=>{
 const {generationConfigured,generateDraft}=await import('../src/lib/checklists/generate');const oldKey=process.env.OPENAI_API_KEY,oldModel=process.env.OPENAI_CHECKLIST_MODEL,oldFetch=globalThis.fetch;let calls=0;
 process.env.OPENAI_API_KEY='test-configured';process.env.OPENAI_CHECKLIST_MODEL='test-model';globalThis.fetch=async()=>{calls++;throw Error('Unexpected provider call');};
 try{assert.equal(generationConfigured(),false);await assert.rejects(()=>generateDraft([]),/not configured/);assert.equal(calls,0);}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;if(oldModel===undefined)delete process.env.OPENAI_CHECKLIST_MODEL;else process.env.OPENAI_CHECKLIST_MODEL=oldModel;}
});
