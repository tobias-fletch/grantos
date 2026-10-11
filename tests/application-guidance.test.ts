import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApplicationGuidance,currentGuidanceCycle,guidanceUrl,type GuidanceEvidencePage,type GuidanceProgram,type GuidanceReview} from '../src/lib/applications/guidance';
const now=Date.parse('2026-10-11T12:00:00Z');
const program:GuidanceProgram={id:'program',official_url:'https://arts.ny.gov/fellowship',source_url:'https://arts.ny.gov/fellowship',deadline_at:'2026-10-21'};
const body='Applicants must be New York State residents. Upload a résumé PDF. Applications close October 21, 2026. Apply online. For individual applicants. Selection considers artistic practice.';
const page:GuidanceEvidencePage={url:program.source_url,role:'program',association:'program-page',snapshot_id:'snapshot',fetched_at:'2026-10-11T10:00:00Z',body,links:['https://survey.alchemer.com/s3/8845598/NYSCA-Artist-Fellowship-Application-2026'],approved_domains:['arts.ny.gov'],snapshot_url:program.source_url,latest_snapshot_id:'snapshot',facts:[{field:'eligibility',value:'Applicants must be New York State residents.',excerpt:'Applicants must be New York State residents.',sourceUrl:program.source_url,cycle:'2026–27',periodEnd:'2026-10-21'},{field:'deadline',value:'2026-10-21',excerpt:'Applications close October 21, 2026.',sourceUrl:program.source_url,cycle:'2026–27',periodEnd:'2026-10-21'}]};
const review:GuidanceReview={id:'review',field:'document',value:'Upload a résumé PDF.',snapshot_id:'snapshot',source_url:page.url,source_excerpt:'Upload a résumé PDF.',source_section:'Application form',applicant_scope:'For individual applicants.',cycle:'2026–27',period_end:'2026-10-21',verified_at:'2026-10-11T10:30:00Z'};
test('guidance renders exact supported facts and keeps missing fee, match, portal, questions unknown',()=>{
 const g=buildApplicationGuidance(program,[page],[review],[],now);
 assert.equal(g.items.find(i=>i.field==='eligibility')?.value,'Applicants must be New York State residents.');
 assert.equal(g.items.find(i=>i.field==='document')?.provenance.applicantScope,review.applicant_scope);
 for(const field of ['fee','match','application_url','question'] as const)assert.ok(g.unknown.includes(field));
 assert.equal(g.applicationUrl,null);assert.equal(g.lastVerifiedAt,'2026-10-11T10:30:00.000Z');
 assert.match(g.items.find(i=>i.field==='deadline')!.value,/Time and time zone unverified/);
 assert.ok(g.suggestions.length);assert.equal(g.items.some(i=>g.suggestions.includes(i.value)),false);
});
test('only explicit official links can establish a reviewed external application portal',()=>{
 const linked={...review,field:'application_url' as const,value:(page.links as string[])[0],source_excerpt:'Apply online.'};
 assert.equal(buildApplicationGuidance(program,[page],[linked],[],now).applicationUrl,linked.value);
 for(const bad of ['https://evil.org/form','javascript:alert(1)','https://user:secret@survey.alchemer.com/form','http://survey.alchemer.com/form'])assert.equal(buildApplicationGuidance(program,[page],[{...linked,value:bad}],[],now).applicationUrl,null);
});
test('untrusted, stale, historical, superseded, cross-publisher and unresolved evidence cannot seed guidance',()=>{
 for(const change of [{association:'historical-examples-only'},{association:'catalog-source-context-unresolved'},{role:'directory'},{approved_domains:[]},{latest_snapshot_id:'newer'},{fetched_at:'2026-01-01'},{fetched_at:'2027-01-01'},{snapshot_url:'https://evil.org/fellowship'},{url:'https://evil.org/fellowship',snapshot_url:'https://evil.org/fellowship',approved_domains:['evil.org']}])assert.equal(buildApplicationGuidance(program,[{...page,...change}],[review],[],now).items.length,0);
 for(const change of [{cycle:'2025',period_end:'2025-10-21'},{cycle:'unresolved',period_end:null},{cycle:'2028',period_end:null},{source_excerpt:'Invented requirement'},{applicant_scope:'Every applicant'}])assert.equal(buildApplicationGuidance(program,[{...page,facts:[]}],[{...review,...change}],[],now).items.length,0);
});
test('source changes, discontinuation and field conflicts are visible and not imported',()=>{
 assert.equal(buildApplicationGuidance({...program,awaiting_review:true},[page],[review],[],now).items.length,0);
 assert.equal(buildApplicationGuidance({...program,monitor_state:'discontinued'},[page],[review],[],now).items.length,0);
 const g=buildApplicationGuidance(program,[page],[],[{field:'eligibility',state:'locked_conflict'}],now);assert.ok(g.unknown.includes('eligibility'));
 const conflicting={...page,facts:[...(page.facts as object[]),{field:'deadline',value:'2026-11-21',excerpt:'Applications close October 21, 2026.',sourceUrl:page.url,cycle:null}]};
 assert.ok(buildApplicationGuidance(program,[conflicting],[],[],now).unknown.includes('deadline'));
});
test('exact quote is required; numeric dates or requirement summaries are not fabricated from uncited text',()=>{
 const g=buildApplicationGuidance(program,[{...page,facts:[{field:'eligibility',value:'All businesses qualify.',excerpt:body,sourceUrl:page.url,cycle:null}]}],[],[],now);assert.ok(g.unknown.includes('eligibility'));
 const changed={...review,value:'A business plan is required.'};assert.ok(buildApplicationGuidance(program,[page],[changed],[],now).unknown.includes('document'));
});
test('reviewed criteria stay criteria rather than becoming funder questions',()=>{
 const criterion={...review,field:'criterion' as const,value:'Selection considers artistic practice.',source_excerpt:'Selection considers artistic practice.',applicant_scope:''};
 const g=buildApplicationGuidance(program,[page],[criterion],[],now);assert.ok(g.items.some(i=>i.field==='criterion'));assert.ok(g.unknown.includes('question'));
});
test('undated rolling/contact-first route remains partial and has no fabricated portal or deadline',()=>{
 const p={...program,deadline_at:null};const text='CPP grant applications are accepted on a flexible, rolling period. Contact Renee for application instructions.';
 const source={...page,body:text,facts:[{field:'rolling',value:'true',excerpt:'CPP grant applications are accepted on a flexible, rolling period.',sourceUrl:page.url,cycle:null}]};
 const step={...review,field:'step' as const,value:'Contact Renee for application instructions.',source_excerpt:'Contact Renee for application instructions.',applicant_scope:'',cycle:null,period_end:null};
 const g=buildApplicationGuidance(p,[source],[step],[],now);assert.equal(g.applicationUrl,null);assert.match(g.items.find(i=>i.field==='deadline')!.value,/Rolling/);assert.ok(g.unknown.includes('document'));
});
test('cycle boundary and public HTTPS navigation guard reject ambiguous or unsafe routes',()=>{
 assert.equal(currentGuidanceCycle('2025–26',null,null,now),true);
 assert.equal(currentGuidanceCycle('2026','2026-10-10',null,now),false);
 assert.equal(currentGuidanceCycle('2026',null,'2026-10-10',now),false);
 assert.equal(currentGuidanceCycle('2027','2026-10-21','2026-10-21',now),true);
 for(const u of ['https://127.0.0.1/form','https://localhost/a','https://intranet.local/a','https://[::1]/a','file:///tmp/form','data:text/html,foo'])assert.equal(guidanceUrl(u),null);
});
