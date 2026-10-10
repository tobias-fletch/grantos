import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePage} from '../src/lib/discovery/reader';
import {examplesFor,recordProgramExamples} from '../src/lib/discovery/program-examples';
import {attachEvidence} from '../src/lib/discovery/program-store';
import {randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';import dotenv from 'dotenv';
const program={name:'Harbor Creative Grant',source_url:'https://example.org/harbor-grant'};
async function page(html:string,url=program.source_url){return await parsePage(Buffer.from(html),'text/html',url);}
test('official project cards retain short excerpts, images and sample application links',async()=>{
 const p=await page(`<main><h1>Harbor Creative Grant</h1><section><h2>Past recipients</h2><article><h3>River Stories</h3><a href='/projects/river'>River Stories</a><p>Harbor Creative Grant recipient in 2024, this community film project explores the river.</p><img src='/images/river.jpg' alt='River Stories screening'></article></section><p><a href='/samples/proposal.pdf'>Sample application</a> for the Harbor Creative Grant.</p><p><a href='/guidelines.pdf'>Application guidelines</a></p><p><a href='/form.pdf'>Blank application template</a></p></main>`);
 assert.ok(p.links.includes("https://example.org/projects/river"));
 const examples=examplesFor(program,p,true);assert.equal(examples.length,2);
 const project=examples.find(e=>e.kind==='funded_project')!;assert.equal(project.image_url,'https://example.org/images/river.jpg');assert.equal(project.year,'2024');assert.ok(project.excerpt.split(' ').length<=22);
 assert.equal(examples.find(e=>e.kind==='sample_application')?.url,'https://example.org/samples/proposal.pdf');
});
test('project pages require explicit program evidence; logos, external trackers and rejected proposals are excluded',async()=>{
 const p=await page(`<main><h1>River Stories</h1><p>River Stories was funded by the Harbor Creative Grant in 2024.</p><figure><img src='https://tracker.example/image.jpg'><figcaption>Project image</figcaption></figure></main>`,'https://example.org/projects/river');
 const e=examplesFor(program,p);assert.equal(e.length,1);assert.equal(e[0].image_url,null);
 assert.equal(examplesFor({...program,name:'Other Foundation Grant'},p).length,0);
 const bad=await page(`<main><h1>Unfunded project</h1><p>This proposal was not funded by the Harbor Creative Grant.</p></main>`,'https://example.org/project');assert.equal(examplesFor(program,bad).length,0);
 const dir=await page(`<main><h1>Past recipients</h1><p>Harbor Creative Grant recipients in 2024.</p></main>`,'https://example.org/recipients');assert.equal(examplesFor(program,dir).length,0);
 const unsafe=await page(`<main><p>Funded project <a href='https://127.0.0.1/private'>Private grant recipient</a></p></main>`);assert.equal(examplesFor(program,unsafe,true).length,0);
});
dotenv.config({path:'.env.local',quiet:true});
test('examples persist separately, are idempotent, and do not update current grant facts',async()=>{
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname));
 const db=new pg.Client({connectionString:process.env.DATABASE_URL}),schema='examples_'+randomBytes(8).toString('hex');await db.connect();
 try{
  await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema},public`);
  for(const f of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.query((await readFile('db/migrations/'+f,'utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,''));
  const id=(await db.query("INSERT INTO opportunities(name,slug,source_url,official_url,summary,funding_type,application_status) VALUES($1,'harbor',$2,$2,'Test program','grant','unknown') RETURNING id",[program.name,program.source_url])).rows[0].id;
  const p=await page(`<main><h1>River Stories</h1><p>River Stories received the Harbor Creative Grant and was funded by this program in 2022. Applications are open until December 1, 2022.</p></main>`,'https://example.org/river');
  const snapshot={id:null,fetched_at:new Date()};
  assert.equal(await recordProgramExamples(db,id,p,snapshot),true);await recordProgramExamples(db,id,p,snapshot);
  await attachEvidence(db,id,p,snapshot,'explicit-program-identifier');
  assert.equal((await db.query('SELECT 1 FROM opportunity_source_urls WHERE url=$1',[p.url])).rowCount,0);
  await recordProgramExamples(db,id,{...p,extracted:{}},snapshot);
  const rows=(await db.query('SELECT facts,examples FROM program_evidence_pages WHERE opportunity_id=$1',[id])).rows;assert.equal(rows.length,1);assert.deepEqual(rows[0].facts,[]);assert.equal(rows[0].examples.length,1);
  assert.equal((await db.query('SELECT application_status FROM opportunities WHERE id=$1',[id])).rows[0].application_status,'unknown');
  // Source removes evidence: current example is cleared rather than kept indefinitely.
  await recordProgramExamples(db,id,await page('<main><h1>River Stories</h1><p>No grant information published.</p></main>',p.url),snapshot);
  assert.deepEqual((await db.query('SELECT examples FROM program_evidence_pages WHERE opportunity_id=$1',[id])).rows[0].examples,[]);
 }finally{await db.query('ROLLBACK');await db.query('SET search_path TO public');await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end();}
});
