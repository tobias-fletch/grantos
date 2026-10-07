import Link from 'next/link';
import { requireWorkspace } from '@/lib/auth/workspace';
import { pool } from '@/lib/db/pool';
import { researchData } from '@/lib/opportunities/research-store';
import { searchProvider } from '@/lib/opportunities/research';
import { ResearchForms } from '@/components/research-forms';
import type { Source } from '@/lib/checklists/sources';

export default async function ResearchPage({searchParams}:{searchParams:Promise<{topic?:string}>}) {
 const {session,workspace}=await requireWorkspace();
 const {leads,runs}=await researchData(pool,session.user.id);
 const params=await searchParams;
 return <>
 <h1 className="text-3xl font-semibold">Source research</h1>
 <p className="mt-3">Daily discovery follows registered funder sources. Import public sources and keep research in your workspace. Leads need review: source reading does not confirm eligibility or an open deadline.</p>
 <ResearchForms configured={!!searchProvider()} canEdit={workspace.role!=='viewer'} topic={typeof params.topic==='string'?params.topic.slice(0,220):''}/>
 <Link href="/app/catalog-review" className="mt-5 inline-block underline">Catalog review and refresh</Link>
 <section className="mt-8"><h2 className="text-xl font-semibold">Recent research</h2>
 {runs.length===0 && <p className="mt-3">No searches yet.</p>}
 {runs.map(run=><div key={run.id} className="mt-3 rounded border p-3"><p>{run.query} · {run.status==='running' && Date.now()-new Date(run.created_at).getTime()>600000?'Interrupted — retry search':run.status} · {new Date(run.created_at).toLocaleString('en-US')}</p>{run.report.count!==undefined && <p>{run.report.count} distinct source leads</p>}{(run.report.warnings??[]).map((w:string,i:number)=><p key={i} className="text-sm">{w}</p>)}</div>)}
 </section>
 <section className="mt-8"><h2 className="text-xl font-semibold">Your research leads</h2><p className="mt-2 text-sm">Up to 60 recently collected sources. Several pages may describe the same grant; confirm the program before importing it into the catalog.</p>
 {leads.map(lead=><article key={lead.id} className="mt-4 rounded-xl border bg-white p-5">
 <a href={lead.url} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold underline">{lead.title||lead.url}</a>
 <p className="mt-2 break-all text-sm">{lead.url}</p><p className="mt-3">{lead.snippet}</p>
 <p className="mt-3 text-sm">{lead.checked_at?`Source read ${new Date(lead.checked_at).toLocaleDateString('en-US')} — eligibility and dates need review`:'Source not read — unverified search result'}</p>
 {lead.existing_slug && <Link href={`/app/opportunities/${lead.existing_slug}`} className="mt-2 inline-block underline">Already in catalog — view and save grant</Link>}
 {!lead.existing_slug && session.user.catalogEditor && <Link href={`/app/catalog-review?lead=${lead.id}`} className="mt-2 inline-block underline">Review this lead for catalog publication</Link>}
 {lead.warnings.map((w:string,i:number)=><p key={i} className="mt-2 text-sm">{w}</p>)}
 {lead.sources.map((source:Source)=><details key={source.url} className="mt-3"><summary className="cursor-pointer">Read captured source evidence</summary><a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-sm underline">{source.url}</a><p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-sm">{source.text}</p></details>)}
 </article>)}
 </section></>;
}
