import { CatalogModeration } from '@/components/catalog-moderation';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/auth/workspace';
import { pool } from '@/lib/db/pool';

import { CatalogReviewForm, type ReviewDefaults } from '@/components/catalog-review-form';
export default async function CatalogReview({searchParams}:{searchParams:Promise<{id?:string;candidate?:string;lead?:string;updated?:string}>}) {
 const {session,workspace}=await requireWorkspace();
 if(!session.user.catalogEditor)return <><h1 className="text-3xl font-semibold">Catalog review</h1><p className="mt-4">Publishing and refreshing shared catalog records requires an authorized catalog editor. Workspace members can collect sources in web research.</p><Link href="/app/research" className="mt-4 inline-block underline">Back to research</Link></>;
 const params=await searchParams;
 const lead=typeof params.lead==='string' && /^[a-f0-9-]{36}$/i.test(params.lead)?(await pool.query('SELECT * FROM discovery_leads WHERE id=$1 AND workspace_id=$2',[params.lead,workspace.id])).rows[0]:null;
 const rows=(await pool.query(`SELECT o.*,f.name AS funder,
 ARRAY(SELECT category FROM opportunity_categories WHERE opportunity_id=o.id) AS categories,
 ARRAY(SELECT applicant_type FROM opportunity_applicant_types WHERE opportunity_id=o.id) AS applicants,
 ARRAY(SELECT CASE WHEN country IS NULL THEN 'Worldwide' ELSE concat_ws(' | ',country,coalesce(state,''),coalesce(city,'')) END FROM opportunity_geographies WHERE opportunity_id=o.id AND rule='eligible') AS locations
 FROM opportunities o LEFT JOIN funders f ON f.id=o.funder_id WHERE NOT o.is_demo ORDER BY last_checked_at NULLS FIRST,name`)).rows;
 const candidate=typeof params.candidate==='string' && /^[a-f0-9-]{36}$/i.test(params.candidate)?(await pool.query("SELECT * FROM crawl_candidates WHERE id=$1 AND status='pending' AND kind<>'domain'",[params.candidate])).rows[0]:null;
 const row=rows.find(r=>r.id===(candidate?.opportunity_id??candidate?.proposed.possible_duplicate_id??params.id));
 const defaults:ReviewDefaults=row?{id:row.id,name:row.name,funder:row.funder,url:row.source_url,summary:row.summary,eligibility:row.eligibility_notes,notes:row.deadline_notes,status:row.application_status,minimum:row.minimum_award??'',maximum:row.maximum_award??'',fee:row.application_fee??'',currency:row.currency,rolling:row.rolling,deadline:row.deadline_at?.toISOString()??'',opens:row.opens_at?.toISOString()??'',categories:row.categories,applicants:row.applicants,locations:row.locations.join('\n')}:lead?{name:lead.title,url:lead.url}:{};
 if(candidate){defaults.candidateId=candidate.id;defaults.url=candidate.url;if(!row)defaults.name=candidate.proposed.name??candidate.title;}
 const history=row?(await pool.query('SELECT r.*,u.name AS reviewer FROM opportunity_reviews r JOIN users u ON u.id=r.reviewed_by WHERE opportunity_id=$1 ORDER BY reviewed_at DESC LIMIT 10',[row.id])).rows:[];
 return <><h1 className="text-3xl font-semibold">Catalog review and refresh</h1><p className="mt-3">Oldest source checks appear first. Reading a page alone never renews verification. Review its current cycle and confirm the facts before publishing.</p>
 {params.updated && <p role="status" className="mt-4">Review saved with source evidence and reviewer history.</p>}
 <Link href="/app/catalog-review" className="mt-4 inline-block underline">Add a new reviewed program</Link>
 <details className="mt-5" open><summary className="cursor-pointer font-semibold">Review queue ({rows.length})</summary><ul className="mt-3 max-h-80 overflow-auto space-y-3">{rows.map(r=><li key={r.id}><Link href={`/app/catalog-review?id=${r.id}`} className="underline">{r.name}</Link><span className="ml-2 text-sm">{r.publication_state} · {r.verification_status} · {!r.last_checked_at||Date.now()-new Date(r.last_checked_at).getTime()>90*86400000?'Reverification due':`Checked ${new Date(r.last_checked_at).toLocaleDateString('en-US')}`}</span></li>)}</ul></details>
 {lead && <p className="mt-4">Imported title and URL are unverified. Review the source before completing this form.</p>}
 {candidate && <section className="mt-4 rounded border p-4"><p>Reviewing a crawler proposal. All fields still require confirmation against the official source.</p><details><summary>Captured evidence</summary><p className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{candidate.evidence}</p></details></section>}
 {row && <CatalogModeration id={row.id} grants={rows.filter(r=>r.publication_state==='published').map(r=>({id:r.id,name:r.name}))}/> }
 <CatalogReviewForm key={candidate?.id??row?.id??lead?.id??'new'} defaults={defaults}/>
 {history.length>0 && <section className="mt-6"><h2 className="text-xl font-semibold">Review history</h2>{history.map(r=><details key={r.id} className="mt-3 rounded border p-3"><summary>{new Date(r.reviewed_at).toLocaleString('en-US')} · {r.reviewer??'Catalog editor'}</summary><a href={r.source_url} className="break-all underline" target="_blank" rel="noopener noreferrer">Reviewed source</a><p className="mt-2 whitespace-pre-wrap">{r.evidence}</p><p className="mt-2 text-sm">{r.details.archive?'Archived':r.details.status} · {r.details.name}</p></details>)}</section>}</>;
}
