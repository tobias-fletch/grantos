import { requirePremiumSearch } from '../discovery/policy';
import { load } from 'cheerio';
import { safeUrl, retrieve, type Source } from '../checklists/sources';

export type SearchHit = { url: string; title: string; snippet: string };
export type ResearchLead = SearchHit & { sources: Source[]; warnings: string[] };
export type ResearchReport = { queries: string[]; leads: ResearchLead[]; warnings: string[] };
export function searchProvider(env: Partial<NodeJS.ProcessEnv> = process.env) {
 if (env.TAVILY_API_KEY?.trim()) return { name: 'tavily', key: env.TAVILY_API_KEY.trim() };
 if (env.BRAVE_SEARCH_API_KEY?.trim()) return { name: 'brave', key: env.BRAVE_SEARCH_API_KEY.trim() };
 return null;
}
export function canonicalUrl(value: string) {
 const u = safeUrl(value); u.hash = '';
 for (const key of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) u.searchParams.delete(key);
 u.searchParams.sort(); u.pathname = u.pathname.replace(/\/+$/, '') || '/';
 return u.href;
}
const plain = (value: unknown, max: number) => typeof value === 'string' ? load(value).text().trim().slice(0,max) : '';
export async function providerSearch(query: string, request: typeof fetch = fetch, provider = searchProvider()): Promise<SearchHit[]> {
 requirePremiumSearch();
 if (!provider) throw new Error('Live search is not configured.');
 const endpoint = new URL(provider.name === 'tavily' ? 'https://api.tavily.com/search' : 'https://api.search.brave.com/res/v1/web/search');
 if (provider.name === 'brave') { endpoint.searchParams.set('q',query); endpoint.searchParams.set('count','20'); }
 const response = await request(endpoint, provider.name === 'tavily' ? {
  method:'POST', headers:{Authorization:`Bearer ${provider.key}`,'Content-Type':'application/json'},
  body:JSON.stringify({query,search_depth:'advanced',max_results:20,include_answer:false,include_raw_content:false}), signal:AbortSignal.timeout(20000),redirect:'error'
 } : {headers:{'X-Subscription-Token':provider.key,Accept:'application/json'},signal:AbortSignal.timeout(20000),redirect:'error'});
 if (!response.ok) throw new Error(response.status === 429 ? 'Search provider rate limit reached. Try again later.' : 'Search provider could not complete the request. Check configuration and provider account.');
 const data = await response.json();
 const results = provider.name === 'tavily' ? data.results : data.web?.results;
 if (!Array.isArray(results)) throw new Error('Search provider returned an unexpected response.');
 return results.slice(0,20).flatMap((r) => {
  try { return [{url:canonicalUrl(r.url),title:plain(r.title,250),snippet:plain(r.content ?? r.description,1000)}]; } catch { return []; }
 });
}
export function researchQueries(topic: string, year = new Date().getFullYear()) {
 const clean = topic.replace(/[\r\n]/g,' ').trim().slice(0,220);
 if (clean.length < 3) throw new Error('Describe the funding you need in at least three characters.');
 return [`${clean} grants funding application ${year}`,`${clean} foundation grant eligibility deadline`,`${clean} grants official guidelines apply rolling`];
}
export async function deepResearch(topic: string, deps = { search:providerSearch, read:retrieve }): Promise<ResearchReport> {
 const queries = researchQueries(topic); const warnings: string[] = []; const hits = new Map<string,SearchHit>();
 // Sequential queries avoid bursting provider quotas. No query contains private account data.
 for (const q of queries) {
  try { for (const h of await deps.search(q)) { const url=canonicalUrl(h.url); if(!hits.has(url)) hits.set(url,{...h,url}); } }
  catch { warnings.push('One search query failed. Results may be incomplete; check the provider configuration or retry later.'); }
 }
 const leads: ResearchLead[] = [...hits.values()].slice(0,30).map(h=>({...h,sources:[],warnings:[]}));
 // Inspect a bounded set of landing pages and one linked requirements page per candidate.
 for (let start=0;start<Math.min(leads.length,12);start+=3) {
  await Promise.all(leads.slice(start,Math.min(start+3,12)).map(async lead=>{
   try {
    const origin=new URL(lead.url).origin; const page=await deps.read(lead.url,origin);
    lead.sources.push(page.source);
    const next=page.links.find(link=>{try{return safeUrl(link).origin===origin && canonicalUrl(link)!==lead.url;}catch{return false;}});
    if(next) { try {lead.sources.push((await deps.read(next,origin)).source);}catch{lead.warnings.push('A linked requirements page could not be read.');} }
   } catch { lead.warnings.push('Page could not be read automatically. Open the source to review it.'); }
  }));
 }
 for(const lead of leads.slice(12)) lead.warnings.push('Search result only; source reading limit reached.');
 return {queries,leads,warnings};
}
