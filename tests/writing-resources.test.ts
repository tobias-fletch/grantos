import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {DB} from '../src/lib/checklists/store';
import {applicationWritingResources,programWritingExamples,type WritingExampleEvidence} from '../src/lib/applications/writing-resources';

const now=Date.parse('2026-10-11T12:00:00Z'),official='https://arts.gov/grants/test';
const context='River Stories was a funded project supported by the Test Community Grant in 2024.';
const example={kind:'funded_project',title:'River Stories',url:'https://arts.gov/projects/river',source_url:official,excerpt:context,context,year:'2024'};
const page:WritingExampleEvidence={url:official,association:'program-page',snapshot_id:'s1',latest_snapshot_id:'s1',snapshot_url:official,fetched_at:'2026-10-11T10:00:00Z',body:context,links:[example.url],approved_domains:['arts.gov'],examples:[example]};
test('associated program examples retain source evidence without calling summaries full winning proposals',()=>{
  const data=programWritingExamples(official,[page],now);
  assert.equal(data.length,1);assert.equal(data[0].kind,'funded_project');assert.equal(data[0].snapshotId,'s1');
  assert.equal(data[0].year,'2024');assert.ok(data[0].excerpt.split(' ').length<=22);
  assert.equal(programWritingExamples(official,[page,page],now).length,1);
  const sample={...example,kind:'sample_application',title:'Sample application',context:'Sample application for the Test Community Grant.',excerpt:'Sample application for the Test Community Grant.'};
  assert.equal(programWritingExamples(official,[{...page,body:sample.context,examples:[sample]}],now)[0].kind,'sample_application');
});
test('historical examples need a current trusted snapshot and exact source support',()=>{
  for(const change of [
    {latest_snapshot_id:'newer'}, {snapshot_id:''}, {association:'catalog-source-context-unresolved'},
    {approved_domains:[]}, {body:'No grant information remains.'}, {links:[]}, {snapshot_url:'https://arts.gov/wrong'},
    {fetched_at:'2026-01-01'}, {fetched_at:'2027-01-01'}, {fetched_at:'invalid'},
    {url:'https://other.gov/grants/test'}, {examples:[{...example,source_url:'https://other.gov/a'}]},
    {examples:[{...example,url:'javascript:alert(1)'}]}, {examples:[{...example,title:'Invented title'}]},
    {examples:[{...example,excerpt:'Invented source excerpt'}]}, {examples:[{...example,context:'Invented award support'}]},
  ])assert.deepEqual(programWritingExamples(official,[{...page,...change}],now),[],JSON.stringify(change));
  assert.equal(programWritingExamples(official,[{...page,association:'historical-examples-only'}],now).length,1);
  assert.deepEqual(programWritingExamples('http://127.0.0.1',[page],now),[]);
});
test('unsupported funding and explicitly rejected examples are withheld',()=>{
  const raw={...example,context:'River Stories is an application.',excerpt:'River Stories is an application.'};
  assert.deepEqual(programWritingExamples(official,[{...page,body:raw.context,examples:[raw]}],now),[]);
  const rejected={...example,context:'River Stories was not funded by the grant.',excerpt:'River Stories was not funded by the grant.'};
  assert.deepEqual(programWritingExamples(official,[{...page,body:rejected.context,examples:[rejected]}],now),[]);
  const unrelated={...example,context:'Harbor Festival was a funded project supported by the grant.',excerpt:'Harbor Festival was a funded project supported by the grant.'};
  assert.deepEqual(programWritingExamples(official,[{...page,body:'River Stories is another project. '+unrelated.context,examples:[unrelated]}],now),[]);
  const adjacent={...example,context:'River Stories is a new proposal. Harbor Festival was a funded project supported by the grant.',excerpt:'River Stories is a new proposal.'};
  assert.deepEqual(programWritingExamples(official,[{...page,body:adjacent.context,examples:[adjacent]}],now),[]);
  const notRecipient={...example,context:'River Stories was not a grant recipient.',excerpt:'River Stories was not a grant recipient.'};
  assert.deepEqual(programWritingExamples(official,[{...page,body:notRecipient.context,examples:[notRecipient]}],now),[]);
});
test('the resource loader checks workspace ownership before reading program examples and makes no requests',async()=>{
  const calls:{sql:string;values:unknown[]}[]=[];
  const id='550e8400-e29b-41d4-a716-446655440000';
  const db={query:async(sql:string,values:unknown[]=[])=>{
    calls.push({sql,values});
    if(sql.includes('FROM workspace_members'))return {rows:[{id:'my-workspace',role:'viewer'}]};
    if(sql.includes('FROM applications WHERE'))return {rows:[]};
    throw Error('Unexpected access to program evidence');
  }} as unknown as DB;
  await assert.rejects(applicationWritingResources(db,'viewer',id),/Application not found/);
  assert.equal(calls.length,2);assert.deepEqual(calls[1].values,[id,'my-workspace']);
  const manual={query:async(sql:string)=>{
    if(sql.includes('FROM workspace_members'))return {rows:[{id:'my-workspace',role:'viewer'}]};
    if(sql.includes('FROM applications WHERE'))return {rows:[{source_url:'https://arts.gov/manual',opportunity_id:null}]};
    throw Error('No program should be loaded for manual applications');
  }} as unknown as DB;
  assert.deepEqual(await applicationWritingResources(manual,'viewer',id),{programUrl:null,savedSourceUrl:'https://arts.gov/manual',examples:[]});
});
