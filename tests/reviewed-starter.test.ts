import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {Client} from 'pg';
import {validateReviewedStarter,importReviewedStarter,type ReviewedStarter} from '../src/lib/discovery/reviewed-starter';
import {buildApplicationGuidance,type GuidanceEvidencePage} from '../src/lib/applications/guidance';
const now=Date.parse('2026-10-11T20:00:00Z'),url='https://arts.ny.gov/import-test';
function fixture():ReviewedStarter{return {schemaVersion:1,reviewedAt:'2026-10-11T19:00:00Z',records:[{key:'ny-import-test',region:'NY',name:'Reviewed Test Grant',funder:'Test Funder',officialUrl:url,fundingType:'grant',summary:'Restricted arts project grant.',cycle:'2026',periodEnd:'2026-11-20',status:'open',rolling:false,statusEvidence:{sourceUrl:url,excerpt:'Applications close November 20, 2026.',section:'Deadline'},applicantTypes:[],applicantTypesComplete:false,geography:[{country:'US',state:'NY',rule:'restricted'}],geographyNotes:'Restricted project coverage; applicant domicile unverified.',eligibilityNotes:'Unknown; confirm legal applicant.',unknowns:['Fee and match unknown'],conflicts:[],sources:[{url,title:'Reviewed Test Grant',role:'program',body:'Applications close November 20, 2026. Upload a résumé PDF.',links:[],fetchedAt:'2026-10-11T18:00:00Z',section:'Guidelines',accessMethod:'official-page',accessNotes:'Excerpt-only official source research.'}],guidance:[{field:'document',value:'Upload a résumé PDF.',sourceUrl:url,excerpt:'Upload a résumé PDF.',section:'Documents',applicantScope:'',cycle:'2026',periodEnd:'2026-11-20'}]}]};}
test('strict manifest rejects invented facts, future/stale dates, duplicates, loans and unknown keys',()=>{
 assert.equal(validateReviewedStarter(fixture(),now).records.length,1);
 for(const mutate of [(m:ReviewedStarter)=>{m.reviewedAt='2027-01-01T00:00:00Z';},(m:ReviewedStarter)=>{m.records[0].sources[0].fetchedAt='2025-01-01T00:00:00Z';},(m:ReviewedStarter)=>{m.records[0].guidance[0].value='Invented requirement';},(m:ReviewedStarter)=>{m.records.push(m.records[0]);},(m:ReviewedStarter)=>{m.records[0].name='Loan Program';},(m:ReviewedStarter)=>{m.records[0].guidance[0].applicantScope='Everyone';}]){const m=fixture();mutate(m);assert.throws(()=>validateReviewedStarter(m,now));}
 assert.throws(()=>validateReviewedStarter({...fixture(),trustMe:true},now));
});
test('assistant-reviewed source facts preserve provenance without human verification, respect conflicts and expire',()=>{
 const r=fixture().records[0],p:GuidanceEvidencePage={url,role:'program',association:'program-page',snapshot_id:'snapshot',fetched_at:r.sources[0].fetchedAt,body:r.sources[0].body,links:[],approved_domains:['arts.ny.gov'],snapshot_url:url,latest_snapshot_id:'snapshot',facts:r.guidance.map(g=>({...g,rule:'reviewed-starter-v1',reviewMethod:'assistant-reviewed',reviewedAt:'2026-10-11T19:00:00Z'}))};
 const program={id:'id',official_url:url,source_url:url,deadline_at:r.periodEnd};
 const g=buildApplicationGuidance(program,[p],[],[],now);assert.equal(g.items.length,1);assert.equal(g.items[0].provenance.method,'assistant-reviewed');assert.equal(g.lastVerifiedAt,null);assert.equal(g.items[0].provenance.section,'Documents');
 assert.equal(buildApplicationGuidance(program,[p],[],[{field:'document',state:'conflicting'}],now).items.length,0);
 assert.equal(buildApplicationGuidance(program,[p],[],[],Date.parse('2027-01-20')).items.length,0);
});
test('database import is atomic, idempotent and never overwrites manual fields, locks or snapshots',async()=>{
 if(!process.env.DATABASE_URL||!['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Integration tests require an isolated loopback database');
 const db=new Client({connectionString:process.env.DATABASE_URL}),schema='reviewed_starter_'+randomBytes(8).toString('hex');await db.connect();
 try{await db.query('BEGIN');await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET LOCAL search_path TO ${schema},public`);
 for(const f of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+f,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
 const m=fixture(),first=await importReviewedStarter(db,m,now);assert.equal(first[0].outcome,'inserted');const id=first[0].opportunityId;
 const before=(await db.query('SELECT * FROM opportunities WHERE id=$1',[id])).rows[0];assert.equal(before.verification_status,'needs_verification');assert.equal(before.last_verified_at,null);
 const snaps=(await db.query('SELECT count(*)::int AS n FROM crawl_snapshots')).rows[0].n;
 assert.equal((await importReviewedStarter(db,m,now))[0].outcome,'unchanged');assert.equal((await importReviewedStarter(db,m,Date.parse('2027-06-01')))[0].outcome,'unchanged');assert.equal((await db.query('SELECT count(*)::int AS n FROM crawl_snapshots')).rows[0].n,snaps);
 await db.query("UPDATE opportunities SET eligibility_notes='Manual condition' WHERE id=$1",[id]);await db.query("INSERT INTO catalog_field_state(opportunity_id,field,locked,state) VALUES($1,'eligibility',true,'found')",[id]);
 m.records[0].eligibilityNotes='Changed research';assert.equal((await importReviewedStarter(db,m,now))[0].outcome,'skipped-existing');assert.equal((await db.query('SELECT eligibility_notes FROM opportunities WHERE id=$1',[id])).rows[0].eligibility_notes,'Manual condition');assert.equal((await db.query('SELECT locked FROM catalog_field_state WHERE opportunity_id=$1',[id])).rows[0].locked,true);
 const states=(await db.query('SELECT field FROM catalog_field_history WHERE opportunity_id=$1',[id])).rows.map(r=>r.field);assert.ok(states.includes('guidance'));assert.ok(states.includes('unknowns'));
 // Shared supporting URL must not collapse distinct official program identities.
 const second=fixture();second.records[0].key='ny-import-distinct';second.records[0].name='Distinct Reviewed Grant';second.records[0].officialUrl=url+'/two';second.records[0].sources.push({...second.records[0].sources[0],url:url+'/two'});assert.equal((await importReviewedStarter(db,second,now))[0].outcome,'inserted');

 // Explicit evidence enrichment leaves an existing editorial record byte-for-byte unchanged.
 const append=fixture();const a=append.records[0];a.key='ny-append-review';a.name='Existing Manual Grant';a.officialUrl=url+'/append';a.sources[0].url=a.officialUrl;a.statusEvidence!.sourceUrl=a.officialUrl;a.guidance[0].sourceUrl=a.officialUrl;
 const manual=(await db.query("INSERT INTO opportunities(name,slug,official_url,source_url,funding_type,summary,eligibility_notes) VALUES($1,'manual-append',$2,$2,'grant','Manual summary','Manual legal condition') RETURNING *",[a.name,a.officialUrl])).rows[0];
 const added=await importReviewedStarter(db,append,now,{appendExistingEvidence:true});assert.equal(added[0].outcome,'evidence-appended');assert.deepEqual((await db.query('SELECT * FROM opportunities WHERE id=$1',[manual.id])).rows[0],manual);
 assert.equal((await importReviewedStarter(db,append,now,{appendExistingEvidence:true}))[0].outcome,'unchanged');
 // A prior snapshot collision must not supersede any program or human-review evidence.
 const collision=fixture();const c=collision.records[0];c.key='ny-existing-collision';c.name='Existing Collision Grant';c.officialUrl=url+'/collision';c.sources.push({...c.sources[0],url:c.officialUrl});
 await db.query("INSERT INTO opportunities(name,slug,official_url,source_url,funding_type) VALUES($1,'manual-collision',$2,$2,'grant')",[c.name,c.officialUrl]);
 const count=(await db.query('SELECT count(*)::int n FROM crawl_snapshots')).rows[0].n;
 const refused=await importReviewedStarter(db,collision,now,{appendExistingEvidence:true});assert.equal(refused[0].outcome,'skipped-existing');assert.match(refused[0].reason!,/snapshots/);assert.equal((await db.query('SELECT count(*)::int n FROM crawl_snapshots')).rows[0].n,count);
 // Changed reviews never replace a previously appended immutable audit.
 a.guidance[0].section='Changed review';assert.equal((await importReviewedStarter(db,append,now,{appendExistingEvidence:true}))[0].outcome,'skipped-existing');
 }finally{await db.query('ROLLBACK');await db.end();}
});
