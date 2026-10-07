import Link from 'next/link';
import { requireWorkspace } from '@/lib/auth/workspace';
import { pool } from '@/lib/db/pool';

import { CrawlButton,SourceForm } from '@/components/discovery-admin-form';
export default async function DiscoveryAdmin(){
 const {session}=await requireWorkspace();
 if(!session.user.catalogEditor)return <p>Catalog editor access is required to manage discovery.</p>;
 const sources=(await pool.query('SELECT * FROM crawl_sources ORDER BY name')).rows;
 const runs=(await pool.query(`SELECT r.*,
 (SELECT count(*) FROM crawl_publication_results WHERE run_id=r.id AND outcome='published') AS published,
 (SELECT count(*) FROM crawl_publication_results WHERE run_id=r.id AND outcome='updated') AS updated,
 (SELECT count(*) FROM crawl_publication_results WHERE run_id=r.id AND outcome='skipped') AS skipped,
 (SELECT count(*) FROM crawl_publication_results WHERE run_id=r.id AND outcome='failed') AS publication_failed,
 (SELECT count(*) FROM crawl_visits WHERE run_id=r.id) AS pages,
 (SELECT count(*) FROM crawl_visits WHERE run_id=r.id AND status IN ('failed','blocked')) AS failures,
 (SELECT count(*) FROM crawl_candidates c JOIN crawl_visits v ON v.run_id=r.id AND v.source_id=c.source_id AND v.url=c.url WHERE c.kind='new' AND c.created_at>=r.created_at) AS new_candidates,
 (SELECT count(*) FROM crawl_candidates c JOIN crawl_visits v ON v.run_id=r.id AND v.source_id=c.source_id AND v.url=c.url WHERE c.kind='changed' AND c.created_at>=r.created_at) AS changes
 FROM crawl_runs r ORDER BY created_at DESC LIMIT 10`)).rows;
 const candidates=(await pool.query("SELECT c.*,s.name AS source_name,p.reason AS publication_reason FROM crawl_candidates c LEFT JOIN crawl_publication_results p ON p.candidate_id=c.id JOIN crawl_sources s ON s.id=c.source_id WHERE c.status='pending' ORDER BY c.kind,c.created_at DESC LIMIT 100")).rows;
 const count=(await pool.query("SELECT count(*) FROM crawl_candidates WHERE status='pending'")).rows[0].count;
 const failures=(await pool.query("SELECT v.url,v.error FROM crawl_visits v JOIN crawl_runs r ON r.id=v.run_id WHERE v.status IN ('failed','blocked') ORDER BY r.created_at DESC,v.created_at DESC LIMIT 20")).rows;
 return <><h1 className="text-3xl font-semibold">Daily discovery</h1><p className="mt-3">Runs at 6:00 a.m. Eastern while the local worker is available, with catch-up after downtime. Identifiable grant leads publish automatically as unverified. All pending source candidates are already visible in Opportunities without approval. Reviewing facts is optional. No paid search or AI calls.</p>
 <div className="mt-5"><CrawlButton command="run" label="Run refresh now"/></div>
 <h2 className="mt-8 text-xl font-semibold">Recent runs</h2><div className="overflow-x-auto"><table className="mt-3 w-full text-left text-sm"><thead><tr>{['Started','Status','Pages','New leads','Changes','Failures','Published','Updated','Skipped','Publication failures'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{runs.map(r=><tr key={r.id}><td className="p-2">{new Date(r.created_at).toLocaleString('en-US',{timeZone:'America/New_York'})}</td><td>{r.status}<p>{r.note}</p></td><td>{r.pages}</td><td>{r.new_candidates}</td><td>{r.changes}</td><td>{r.failures}</td><td>{r.published}</td><td>{r.updated}</td><td>{r.skipped}</td><td>{r.publication_failed}</td></tr>)}</tbody></table></div>
 <Link href="/app/catalog-review" className="mt-5 inline-block underline">Manage published listings, verify, hide, or merge</Link>
 <p className="mt-3"><Link href="/app/opportunities#candidates" className="underline">Browse all proposed candidates in search — no approval needed</Link></p><h2 className="mt-8 text-xl font-semibold">Optional review queue ({count})</h2><p className="text-sm">Showing up to 100 pending items. Approving a domain allows crawling; it does not approve grants.</p>
 {candidates.map(c=><article key={c.id} className="mt-4 rounded border bg-white p-4"><h3 className="font-semibold">{c.title} · {c.kind}</h3><a href={c.url} target="_blank" rel="noopener noreferrer" className="break-all text-sm underline">{c.url}</a><p className="text-sm">{c.source_name}</p>
 {c.publication_reason && <p className="mt-2 text-sm">Publication: {c.publication_reason}</p>}
 {c.proposed.possible_duplicate_name && <p>Possible duplicate: {c.proposed.possible_duplicate_name}. Review the existing record before adding another.</p>}
 {c.kind!=='domain' && <><div className="mt-3 grid gap-3 md:grid-cols-2"><div><h4 className="font-semibold">Current catalog facts</h4>{Object.entries(c.previous).filter(([key])=>key!=='id').map(([key,value])=><p key={key} className="text-sm">{key}: {String(value??'Unknown')}</p>)}</div><div><h4 className="font-semibold">Proposed facts (not verified)</h4>{Object.entries(c.proposed).filter(([key])=>!['previous_excerpt','possible_duplicate_id','possible_duplicate_name'].includes(key)).map(([key,value])=><p key={key} className="text-sm">{key}: {String(value??'Unknown')}</p>)}<p className="text-sm">Unextracted fields remain unknown.</p></div></div><details className="mt-3"><summary>Compare source evidence</summary><div className="grid gap-3 md:grid-cols-2"><p className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{c.proposed.previous_excerpt??'First source snapshot; no earlier capture.'}</p><p className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{c.evidence}</p></div></details><Link href={`/app/catalog-review?candidate=${c.id}`} className="my-3 inline-block underline">Review facts (optional)</Link></>}
 <div className="mt-3">{c.kind==='domain' && <CrawlButton command="domain" id={c.id} label="Approve domain"/>}<CrawlButton command="dismiss" id={c.id} label="Dismiss candidate"/></div></article>)}
 <details className="mt-8"><summary className="text-xl font-semibold">Recent source failures</summary>{failures.map((f,i)=><p key={i} className="mt-2 break-all text-sm">{f.url}: {f.error}</p>)}</details>
 <h2 className="mt-8 text-xl font-semibold">Source registry ({sources.length})</h2><details><summary>Add a source</summary><SourceForm/></details>{sources.map(s=><details key={s.id} className="mt-3"><summary>{s.name} · {s.enabled?'enabled':'disabled'}</summary><SourceForm source={s}/></details>)}
 </>;
}
