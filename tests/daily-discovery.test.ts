import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robotsPolicy,parsePage,createReader } from '../src/lib/discovery/reader';
import { scheduledDay,requirePremiumSearch } from '../src/lib/discovery/policy';
import { Response,type fetch } from 'undici';

test('Eastern schedule handles 6am boundaries, missed mornings and daylight saving',()=>{
 assert.equal(scheduledDay(new Date('2026-10-06T09:59:59Z')),'2026-10-05');
 assert.equal(scheduledDay(new Date('2026-10-06T10:00:00Z')),'2026-10-06');
 assert.equal(scheduledDay(new Date('2026-03-08T09:59:00Z')),'2026-03-07');
 assert.equal(scheduledDay(new Date('2026-03-08T10:00:00Z')),'2026-03-08');
 assert.equal(scheduledDay(new Date('2026-11-01T10:59:00Z')),'2026-10-31');
 assert.equal(scheduledDay(new Date('2026-11-01T11:00:00Z')),'2026-11-01');
 assert.equal(scheduledDay(new Date('2026-10-20T18:00:00Z')),'2026-10-20');
 for(const plan of ['free','paid',undefined])assert.throws(()=>requirePremiumSearch(plan),/coming later/);
});
test('robots handles specific agents, longest match, wildcard endings and delays',()=>{
 const p=robotsPolicy('User-agent: *\nDisallow: /\nUser-agent: GrantOSDiscovery\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\nCrawl-delay: 3\nSitemap: https://example.org/map.xml');
 assert.equal(p.allowed('https://example.org/grants'),true);
 assert.equal(p.allowed('https://example.org/private/a'),false);
 assert.equal(p.allowed('https://example.org/private/public/grant'),true);
 assert.equal(p.allowed('https://example.org/grant.pdf'),false);
 assert.equal(p.allowed('https://example.org/grant.pdf?download=1'),true);
 assert.equal(p.delay,3000);assert.equal(p.sitemaps.length,1);
 assert.equal(robotsPolicy('User-agent: *\nDisallow: /').allowed('https://example.org/grants'),false);
});
test('discovery extracts directory pagination, feed links, sitemap URLs and supported facts',async()=>{
 const page=await parsePage(Buffer.from('<html><head><title>Grant Directory</title></head><body><main><h1>Education grants</h1><a href="/grant_types/small">Research Grant</a><a rel="next" href="?page=2">Next</a><a href="/file.pdf">Guidelines</a></main><footer>Noise</footer></body></html>'),'text/html','https://www.spencer.org/research-grants');
 assert.equal(page.links.length,3);assert.ok(!page.text.includes('Noise'));
 const xml=await parsePage(Buffer.from('<urlset><url><loc>https://example.org/grant</loc></url></urlset>'),'application/xml','https://example.org/sitemap.xml');assert.deepEqual(xml.links,['https://example.org/grant']);
 const feed=await parsePage(Buffer.from('<feed><entry><link href="https://example.org/apply"/></entry></feed>'),'application/atom+xml','https://example.org/feed');assert.deepEqual(feed.links,['https://example.org/apply']);
 const spencer=await parsePage(Buffer.from('<h1>Education Grant</h1><p>Applications Open: Now closed.</p>'),'text/html','https://www.spencer.org/grant_types/example');assert.equal(spencer.extracted.status,'closed');
 assert.equal(page.extracted.status,undefined);
});
test('crawler respects robots before reads, rejects private DNS and unapproved redirects',async()=>{
 let calls:string[]=[];
 const reader=createReader({resolve:async()=>[{address:'8.8.8.8',family:4}],sleep:async()=>{},request:(async(url)=>{calls.push(String(url));return new Response(String(url).endsWith('robots.txt')?'User-agent: *\nDisallow: /private':'<h1>Grant</h1><p>Public application details for this program.</p>',{headers:{'content-type':'text/html'}});}) as typeof fetch});
 await assert.rejects(()=>reader.read('https://example.org/private',['example.org']),/Disallowed/);assert.equal(calls.length,1);
 await reader.read('https://example.org/grant',['example.org']);assert.equal(calls.length,2);
 const privateReader=createReader({resolve:async()=>[{address:'127.0.0.1',family:4}],sleep:async()=>{},request:(async()=>{throw Error('must not fetch');}) as typeof fetch});
 await assert.rejects(()=>privateReader.read('https://example.org/grant',['example.org']),/public/);
 calls=[];
 const redirectReader=createReader({resolve:async()=>[{address:'8.8.8.8',family:4}],sleep:async()=>{},request:(async(url)=>{calls.push(String(url));return String(url).endsWith('robots.txt')?new Response('',{status:404}):new Response('',{status:302,headers:{location:'https://unapproved.org/grant'}});}) as typeof fetch});
 await assert.rejects(()=>redirectReader.read('https://example.org/grant',['example.org']),/approval/);assert.equal(calls.length,2);
});
test('crawler retries temporary failures and defers unavailable robots policies',async()=>{
 let retries=0;
 const reader=createReader({resolve:async()=>[{address:'8.8.8.8',family:4}],sleep:async()=>{},request:(async(url)=>{
 if(String(url).endsWith('robots.txt'))return new Response('',{status:404});
 retries++;return retries<3?new Response('',{status:503}):new Response('<h1>Grant</h1><p>Applications and eligibility for this grant program.</p>',{headers:{'content-type':'text/html'}});
 }) as typeof fetch});
 await reader.read('https://example.org/grant',['example.org']);assert.equal(retries,3);
 const blocked=createReader({resolve:async()=>[{address:'8.8.8.8',family:4}],sleep:async()=>{},request:(async()=>new Response('',{status:503})) as typeof fetch});
 await assert.rejects(()=>blocked.read('https://example.org/grant',['example.org']),/Robots policy unavailable/);
});
