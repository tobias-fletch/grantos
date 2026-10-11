import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {Client} from 'pg';
import {importReviewedStarter,validateReviewedStarter} from '../src/lib/discovery/reviewed-starter';
import {enrichReviewedGuidance} from '../src/lib/discovery/reviewed-guidance-enrichment';
import {buildApplicationGuidance} from '../src/lib/applications/guidance';
const now=Date.parse('2026-10-11T23:59:00Z');
test('reviewed enrichment preserves editorial records and immutable snapshots; all 20 retain usable guides',async()=>{
 if(!process.env.DATABASE_URL||!['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Integration tests require an isolated loopback database');
 const db=new Client({connectionString:process.env.DATABASE_URL}),schema='guidance_revision_'+randomBytes(8).toString('hex');await db.connect();
 try{await db.query('BEGIN');await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET LOCAL search_path TO ${schema},public`);
 for(const f of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+f,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
 const original=JSON.parse(await readFile('data/reviewed-starter-catalog.json','utf8')),revision=JSON.parse(await readFile('data/reviewed-starter-guidance.json','utf8'));
 validateReviewedStarter(revision,now);const imported=await importReviewedStarter(db,original,now,{appendExistingEvidence:true});assert.equal(imported.length,20);assert.ok(imported.every(r=>['inserted','evidence-appended'].includes(r.outcome)));
 const opportunities=(await db.query('SELECT * FROM opportunities ORDER BY id')).rows,oldSnapshots=(await db.query('SELECT * FROM crawl_snapshots ORDER BY id')).rows;
 const first=await enrichReviewedGuidance(db,revision,now);assert.equal(first.length,20);assert.ok(first.every(r=>r.outcome==='enriched'),JSON.stringify(first.filter(r=>r.outcome!=='enriched')));
 assert.deepEqual((await db.query('SELECT * FROM opportunities ORDER BY id')).rows,opportunities);
 assert.deepEqual((await db.query('SELECT * FROM crawl_snapshots WHERE id=ANY($1::uuid[]) ORDER BY id',[oldSnapshots.map(s=>s.id)])).rows,oldSnapshots);
 const tied=(await db.query('SELECT 1 FROM crawl_snapshots old JOIN crawl_snapshots newer ON old.url=newer.url AND old.fetched_at=newer.fetched_at AND old.recorded_at<newer.recorded_at WHERE old.id=ANY($1::uuid[]) LIMIT 1',[oldSnapshots.map(s=>s.id)])).rowCount;assert.ok(tied,'Equal source fetch times have deterministic newer recording order');
 const facts=[];
 for(const r of first){const p=(await db.query('SELECT * FROM opportunities WHERE id=$1',[r.opportunityId])).rows[0];
 const pages=(await db.query(`SELECT p.*,s.body,s.links,s.url snapshot_url,c.approved_domains,(SELECT n.id FROM crawl_snapshots n WHERE n.url=s.url ORDER BY n.fetched_at DESC,n.recorded_at DESC,n.id DESC LIMIT 1) latest_snapshot_id FROM program_evidence_pages p JOIN crawl_snapshots s ON s.id=p.snapshot_id JOIN crawl_sources c ON c.id=s.source_id WHERE p.opportunity_id=$1`,[r.opportunityId])).rows;
 const states=(await db.query('SELECT field,state FROM catalog_field_state WHERE opportunity_id=$1',[r.opportunityId])).rows;
 const g=buildApplicationGuidance(p,pages,[],states,now);assert.ok(g.items.length>0,r.key);assert.ok(g.programUrl,r.key);assert.equal(g.lastVerifiedAt,null);facts.push(...g.items);
 }
 assert.ok(facts.filter(f=>f.field==='document').length>=15,'At least 15 evidenced document constraints');assert.ok(facts.filter(f=>f.field==='application_url').length>=8,'At least eight explicit application routes');
 const count=(await db.query('SELECT count(*)::int n FROM crawl_snapshots')).rows[0].n;
 assert.ok((await enrichReviewedGuidance(db,revision,Date.parse('2027-06-01'))).every(r=>r.outcome==='unchanged'));
 assert.equal((await db.query('SELECT count(*)::int n FROM crawl_snapshots')).rows[0].n,count);
 // An incomplete or changed source cannot discard prior exact evidence.
 const changed=structuredClone(revision);changed.records=[changed.records[0]];changed.records[0].sources[0].body+='\nNew verified excerpt.';changed.records[0].guidance.push({...changed.records[0].guidance[0],field:'step',value:'New verified excerpt.',excerpt:'New verified excerpt.'});
 const target=first[0].opportunityId;await db.query("INSERT INTO catalog_field_state(opportunity_id,field,locked,state) VALUES($1,'custom-editor-note',true,'found')",[target]);
 const refused=await enrichReviewedGuidance(db,changed,now);assert.equal(refused[0].outcome,'skipped');assert.match(refused[0].reason!,/Locked/);assert.equal((await db.query('SELECT count(*)::int n FROM crawl_snapshots')).rows[0].n,count);
 }finally{await db.query('ROLLBACK');await db.end();}
});
