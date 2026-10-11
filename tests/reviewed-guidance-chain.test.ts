import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trustedGuidancePage,buildApplicationGuidance,guidanceAuthorityChain,type GuidanceEvidencePage} from '../src/lib/applications/guidance';
const now=Date.parse('2026-10-11T20:00:00Z'),official='https://arts.ny.gov/specific-program',target='https://survey.alchemer.com/s3/specific-form';
const program={id:'program',official_url:official,source_url:official,deadline_at:'2026-10-21'};
function page(url:string,links:string[]=[],association='program-page'):GuidanceEvidencePage{return {url,snapshot_url:url,snapshot_id:url,latest_snapshot_id:url,role:'program',association,body:'Resume or CV (PDF Upload)',links,approved_domains:[new URL(url).hostname],fetched_at:'2026-10-11T18:00:00Z',facts:[]};}
test('exact current official link authorizes reviewed external document, not an arbitrary host',()=>{
 const root=page(official,[target]),form=page(target,[],'reviewed-official-link');
 assert.equal(trustedGuidancePage(program,form,now),false);assert.equal(trustedGuidancePage(program,form,now,[root,form]),true);
 assert.deepEqual(guidanceAuthorityChain(program,form,[root,form],now),[official,target]);
 for(const bad of [{links:[]},{url:'https://arts.ny.gov/unrelated',snapshot_url:'https://arts.ny.gov/unrelated'},{role:'directory'},{latest_snapshot_id:'changed'},{fetched_at:'2025-01-01'},{links:[target+'?other=1']},{links:[target+'/']}])assert.equal(trustedGuidancePage(program,form,now,[{...root,...bad},form]),false);
 assert.equal(trustedGuidancePage(program,{...form,association:'official-program-link'},now,[root,form]),false);
});
test('bounded canonical to same-publisher guidelines to external chain works; external intermediates and third hop fail',()=>{
 const mid='https://arts.ny.gov/specific-program/guidelines',root=page(official,[mid]),middle={...page(mid,[target]),role:'guidelines'},form=page(target,[],'reviewed-official-link');
 assert.equal(trustedGuidancePage(program,form,now,[root,middle,form]),true);assert.deepEqual(guidanceAuthorityChain(program,form,[root,middle,form],now),[official,mid,target]);
 const external=page('https://other.org/guide',[target],'reviewed-official-link');assert.equal(trustedGuidancePage(program,form,now,[page(official,[external.url]),external,form]),false);
 const last=page(mid+'/more',[target]);assert.equal(trustedGuidancePage(program,form,now,[root,page(mid,[last.url]),last,form]),false);
 for(const malformed of [{...middle,url:'not a URL'},{...middle,snapshot_url:'javascript:bad'},{...middle,latest_snapshot_id:'changed'}])assert.doesNotThrow(()=>assert.equal(trustedGuidancePage(program,form,now,[root,malformed,form]),false));
});
test('rendered external requirements retain full authority chain and exact href evidence can establish application route',()=>{
 const root=page(official,[target]),form=page(target,[],'reviewed-official-link');
 form.facts=[{rule:'reviewed-starter-v1',reviewMethod:'assistant-reviewed',reviewedAt:'2026-10-11T19:00:00Z',field:'document',value:form.body,excerpt:form.body,sourceUrl:target,cycle:'2026',periodEnd:'2026-10-21'}];
 root.facts=[{rule:'reviewed-starter-v1',reviewMethod:'assistant-reviewed',reviewedAt:'2026-10-11T19:00:00Z',field:'application_url',value:target,excerpt:target,sourceUrl:official,cycle:'2026',periodEnd:'2026-10-21'}];
 const g=buildApplicationGuidance(program,[root,form],[],[],now);assert.equal(g.applicationUrl,target);assert.deepEqual(g.items.find(i=>i.field==='document')?.provenance.authorityChain,[official,target]);assert.equal(g.lastVerifiedAt,null);
 assert.doesNotThrow(()=>buildApplicationGuidance(program,[root,form,{...root,url:'malformed'}],[],[],now));
});
