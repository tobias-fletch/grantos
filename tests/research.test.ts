import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, deepResearch, providerSearch, researchQueries, searchProvider } from '../src/lib/opportunities/research';
import { parseLocations, reviewSchema } from '../src/lib/opportunities/editorial';

test('provider setup is explicit and missing configuration never sends a request',async()=>{
 assert.equal(searchProvider({}),null);
 assert.equal(searchProvider({TAVILY_API_KEY:' test '} )?.key,'test');
 let calls=0;
 await assert.rejects(()=>providerSearch('grants',async()=>{calls++;throw Error();},null),/coming later/);
 assert.equal(calls,0);
});
test('all provider calls are disabled even with configured keys',async()=>{
 for(const name of ['tavily','brave']){
  let calls=0;
  await assert.rejects(()=>providerSearch('music grants',async()=>{calls++;return Response.json({results:[]});},{name,key:'configured'}),/coming later/);
  assert.equal(calls,0);
 }
});
test('canonical URLs reject local sources and preserve meaningful query parameters',()=>{
 assert.equal(canonicalUrl('https://example.org/grant/?b=2&utm_source=x&a=1#apply'),'https://example.org/grant?a=1&b=2');
 for(const value of ['http://example.org','https://127.0.0.1','https://user:password@example.org','https://example.org:3000'])assert.throws(()=>canonicalUrl(value));
 assert.equal(researchQueries('music',2030).length,3);assert.match(researchQueries('music',2030)[0],/2030/);
});
test('deep research deduplicates, reads requirements, bounds pages and records partial failure',async()=>{
 let queries=0,reads=0;
 const report=await deepResearch('music artists',{search:async()=>{
  queries++;if(queries===2)throw Error('provider failed');
  return Array.from({length:20},(_,i)=>({url:`https://fund${i}.example.org/grant?utm_source=${queries}`,title:`Program ${i}`,snippet:'Review me'}));
 },read:async(url)=>{
  reads++;const u=new URL(url);
  return {source:{url,text:'Published requirements and eligibility evidence'},links:u.pathname==='/grant'?[`${u.origin}/requirements`,'https://127.0.0.1/private']:[]};
 }});
 assert.equal(queries,3);assert.equal(report.leads.length,20);assert.equal(reads,24);assert.equal(report.warnings.length,1);
 assert.equal(report.leads[0].sources.length,2);assert.equal(report.leads[19].sources.length,0);assert.ok(report.leads[19].warnings.length);
 assert.ok(report.leads.every(l=>!('status' in l)),'Search snippets must not assert application status');
});
test('editor access and structured eligibility validation fail closed',()=>{
 assert.deepEqual(parseLocations('United States | New York | New York City\nCanada'),[{country:'United States',state:'New York',city:'New York City'},{country:'Canada',state:null,city:null}]);
 assert.throws(()=>parseLocations('| New York'));
 const good={id:'',name:'Test grant',funder:'Test Foundation',url:'https://example.org',summary:'A detailed program summary for artists.',eligibility:'Individual artists in the United States.',notes:'Deadline not yet announced.',evidence:'An exact passage from the official source page.',status:'unannounced',minimum:'',maximum:'',fee:'',currency:'USD',deadline:'',opens:'',categories:['Music'],applicants:['individual'],locations:'United States',attested:'yes'};
 assert.equal(reviewSchema.safeParse(good).success,true);
 for(const edit of [{status:'open',deadline:'2020-01-01T00:00:00Z'},{minimum:'100',maximum:'10'},{attested:''},{deadline:'2030-01-01'},{categories:['Invented']}])assert.equal(reviewSchema.safeParse({...good,...edit}).success,false);
});
