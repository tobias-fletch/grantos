import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePage} from '../src/lib/discovery/reader';
import {pageRole,programFacts,resolveProgramFacts} from '../src/lib/discovery/program-evidence';
import {classifyGrant} from '../src/lib/discovery/publish';
import {sourceLocationPriority,matchGeography} from '../src/lib/opportunities/geography';
const now=new Date('2026-10-11T12:00:00Z');
async function facts(url:string,html:string){const page=await parsePage(Buffer.from(html),'text/html',url);return {page,facts:programFacts(page,now.toISOString(),now),values:resolveProgramFacts(programFacts(page,now.toISOString(),now),now).values};}

test('NYSCA weekday deadline survives without invented timezone, residency or open status',async()=>{
 const r=await facts('https://arts.ny.gov/SOAfellow','<main><h1>State of the Arts Fellowship</h1><p>Artists from all disciplines are invited to apply for this unique opportunity.</p><p>Application Deadline: Wednesday, October 21, 2026, 5:00pm.</p></main>');
 assert.equal(r.values.deadline,'2026-10-21');
 assert.equal(r.values.status,undefined);assert.equal(r.values.geography,undefined);
 assert.equal(r.values.applicants,undefined);
 const invalid=await facts('https://arts.ny.gov/SOAfellow','<h1>State of the Arts Fellowship</h1><p>Applications support artists. Deadline: Monday, February 30, 2027.</p>');
 assert.equal(invalid.values.deadline,undefined);
});

test('multi-program NY and Louisiana hubs cannot leak mixed open/closed or upcoming facts',()=>{
 for(const [url,title] of [['https://arts.ny.gov/OpportunityGuidelines','FY2027 NYSCA Opportunity Guidelines'],['https://cnyarts.org/grants/statewide-community-regrants/','Statewide Community Regrant Program 2027'],['https://www.artsbr.org/grants','Arts Council Grants']]){
  const page={url,title,text:'Capital applications are open. Other applications are closed. Applications open March 11, 2027. Deadline: January 12, 2027.',extracted:{}};
  assert.equal(pageRole(title,url,page.text),'directory');assert.deepEqual(programFacts(page,now.toISOString(),now),[]);assert.ok(classifyGrant(title,url,page.text));
 }
});

test('current LDAF closure headings override old project dates without turning beneficiaries into applicants',async()=>{
 const samples=[
  ['louisiana-agricultural-workforce-development-program','Louisiana Agricultural Workforce Development Program','Business Application period is CLOSED','Intern Eligibility: Louisiana secondary or postsecondary students. The new application window will be announced soon.'],
  ['resilient-food-systems-infrastructure','Resilient Food Systems Infrastructure','Application period is CLOSED','Complex Infrastructure funding period concludes December 31, 2026.'],
 ];
 for(const [path,title,heading,body] of samples){
  const r=await facts('https://www.ldaf.la.gov/business/grants-funding/'+path,`<main><h1>${title}</h1><p>This grant provides funding for Louisiana agriculture.</p><h2>${heading}</h2><p>${body}</p></main>`);
  assert.equal(classifyGrant(r.page.title,r.page.url,r.page.text),null);
  assert.equal(r.values.status,'closed');assert.equal(r.values.deadline,undefined);assert.equal(r.values.applicants,undefined);assert.equal(r.values.geography,undefined);
 }
 const r=await facts('https://www.ldaf.la.gov/food/selling/produce/specialty-crops/program','<main><h1>Specialty Crop Block Grant Program</h1><p>This grant supports specialty crops.</p><h2>Application period has closed for the SCBG</h2></main>');
 assert.equal(r.values.status,'closed');
 const sidebar=await facts('https://www.ldaf.la.gov/food/selling/produce/specialty-crops/program','<h1>Specialty Crop Block Grant Program</h1><h2>Application period has closed for the SCBG</h2><p>Related news: 2026 applications are open.</p>');
 assert.equal(sidebar.values.status,'closed');
 const linked=programFacts({url:'https://www.ldaf.la.gov/food/selling/produce/specialty-crops/program/guidelines',title:'Guidelines',text:'2026 applications are open.',extracted:{}},now.toISOString(),now);
 const conflict=resolveProgramFacts([...sidebar.facts,...linked],now);
 assert.equal(conflict.values.status,undefined);assert.match(conflict.reasons.status,/Conflicting current LDAF/);
 const dated=await facts('https://www.ldaf.la.gov/food/selling/produce/specialty-crops/program','<h1>Specialty Crop Block Grant Program</h1><p>This grant supports agriculture. Deadline: April 30, 2026.</p><h2>Application period has closed for the SCBG</h2>');
 const later=new Date('2028-01-01T00:00:00Z');
 assert.equal(resolveProgramFacts(programFacts(dated.page,later.toISOString(),later),later).values.status,'closed');
 const unrelated=await facts('https://example.org/grant','<h1>Example Grant Program</h1><h2>Application period is CLOSED</h2><p>Funding supports agriculture.</p>');assert.equal(unrelated.values.status,undefined);
 const prose=await facts('https://www.ldaf.la.gov/business/grants-funding/resilient-food-systems-infrastructure','<h1>Resilient Food Systems Infrastructure</h1><p>In an old grant announcement: Application period is CLOSED</p>');assert.equal(prose.values.status,undefined);
});

test('state research includes restricted regional administrators but never makes their opportunities statewide',()=>{
 const ny={country:'United States',state:'New York',city:'',postal_code:''};
 const la={country:'United States',state:'Louisiana',city:'',postal_code:''};
 assert.equal(sourceLocationPriority('Cortland County / Onondaga County / New York',ny),2);
 assert.equal(sourceLocationPriority('Lafayette Parish / Louisiana',la),2);
 assert.equal(sourceLocationPriority('Louisiana',la),3);
 assert.equal(sourceLocationPriority('Lafayette Parish / Louisiana',ny),0);
 assert.equal(sourceLocationPriority('Lafayette Parish / Louisiana',{...la,city:'New Orleans'}),0);
 assert.equal(matchGeography([],la).state,'unknown');
});

test('Louisiana Bar Foundation CPP is a distinct rolling nonprofit grant, not general business funding',async()=>{
 const html='<main><h1>Community Partnership Panels</h1><p>CPP grant applications are accepted on a flexible, rolling period.</p><p>The Jock Scott Community Partnership Panel Grant Program funds 501(c)(3) organizations to initiate or expand an activity that meets at least 1 of the following 3 criteria: 1) Provides direct legal services to the poor; 2) Provides law-related education; and/or 3) Provides for the administration of justice.</p></main>';
 const r=await facts('https://raisingthebar.org/community-partnership-panels/',html);
 assert.equal(classifyGrant(r.page.title,r.page.url,r.page.text),null);
 assert.equal(r.values.status,'open');assert.equal(r.values.rolling,'true');
 assert.equal(r.values.applicants,'["nonprofit"]');assert.match(r.values.eligibility!,/direct legal services/);
 assert.equal(r.values.maximum,undefined);assert.equal(r.values.geography,undefined);
 const other=await facts('https://example.org/community-partnership-panels/',html);
 assert.equal(other.values.status,undefined);
});
