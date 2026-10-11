import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {enqueueSearch} from '../src/lib/discovery/search-jobs';

test('NY/LA source migration is additive, idempotent, preserves editor settings and enters bounded search',async()=>{
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});
 const schema='grantos_nyla_'+randomBytes(8).toString('hex');
 await db.connect();
 try{
  await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}",public`);
  const names=(await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort();
  for(const name of names.filter(n=>n<'036'))await db.query(await readFile('db/migrations/'+name,'utf8'));
  const count=async()=>(await db.query('SELECT count(*)::int n FROM crawl_sources')).rows[0].n;
  const before=await count(),opportunities=(await db.query('SELECT count(*)::int n FROM opportunities')).rows[0].n;
  const migration=await readFile('db/migrations/036_ny_la_official_sources.sql','utf8');
  await db.query(migration);assert.equal(await count(),before+12);
  const url='https://www.ldaf.la.gov/business/grants-funding/louisiana-agricultural-workforce-development-program';
  await db.query('UPDATE crawl_sources SET enabled=false,interval_hours=168,name=$2 WHERE url=$1',[url,'Editor custom title']);
  await db.query(migration);assert.equal(await count(),before+12);
  const preserved=(await db.query('SELECT enabled,interval_hours,name FROM crawl_sources WHERE url=$1',[url])).rows[0];
  assert.deepEqual(preserved,{enabled:false,interval_hours:168,name:'Editor custom title'});
  assert.equal((await db.query('SELECT count(*)::int n FROM opportunities')).rows[0].n,opportunities);
  const id=await enqueueSearch(db,{country:'United States',state:'Louisiana',category:'Agriculture / Food',applicant:'business'});
  const sources=(await db.query('SELECT s.url FROM crawl_sources s JOIN search_discovery_jobs j ON s.id=ANY(j.source_ids) WHERE j.id=$1',[id])).rows.map(r=>r.url);
  assert.ok(sources.includes('https://www.ldaf.la.gov/business/grants-funding/resilient-food-systems-infrastructure'));
  assert.ok(!sources.includes(url));assert.ok(sources.length<=8);
  const blocked=(await db.query("SELECT enabled FROM crawl_sources WHERE url IN ('https://arts.ny.gov/SOAfellow','https://esd.ny.gov/global-ny-fund-grant-program')")).rows;
  assert.equal(blocked.length,2);assert.ok(blocked.every(r=>!r.enabled));
 }finally{await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.end();}
});
