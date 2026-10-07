import Link from "next/link";
import {CatalogHealth} from '@/components/catalog-health';
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { getOpportunity } from "@/lib/opportunities/store";
import { award, checkedDate, deadline, verificationLabel, statusLabel, SaveButton } from "@/components/opportunity";
import { Checklist } from "@/components/checklist";

export default async function OpportunityDetail({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|undefined>>}) {
  const {session} = await requireWorkspace();
  const {slug} = await params;
  const {opportunity:o,workspace} = await getOpportunity(pool,session.user.id,slug);
  if (!o) notFound();
  const applications=(await pool.query('SELECT id,stage FROM applications WHERE workspace_id=$1 AND opportunity_id=$2 ORDER BY created_at',[workspace.id,o.id])).rows;
  const query=await searchParams;
  return <>
    <Link href="/app/opportunities" className="text-sm text-[var(--brand)] underline">← All opportunities</Link>
    <p className="mt-8 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{o.funder}</p>
    <h1 className="mt-2 text-3xl font-semibold md:text-4xl">{o.name}</h1>
    {applications.map(a=><Link key={a.id} href={`/app/applications/${a.id}`} className="mt-3 mr-4 inline-block underline">Open application · {a.stage}</Link>)}
    <p className="mt-5 max-w-3xl text-lg leading-8 text-[var(--muted)]">{o.summary}</p>
    <div className="mt-6 flex flex-wrap gap-4"><SaveButton opportunity={o} returnTo={`/app/opportunities/${slug}`} canEdit={workspace.role !== "viewer"}/><a href={o.official_url} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--brand)] px-5 py-2 font-semibold text-white">Visit program source ↗</a></div>
    <section className="mt-8 grid gap-6 rounded-2xl border border-black/10 bg-white p-6 sm:grid-cols-2"><div><p className="text-sm text-[var(--muted)]">Award</p><p className="mt-2 text-2xl font-semibold">{award(o)}</p></div><div><p className="text-sm text-[var(--muted)]">Application status</p><p className="mt-2 text-xl capitalize">{statusLabel(o)}</p></div><div><p className="text-sm text-[var(--muted)]">Deadline</p><p className="mt-2 font-semibold">{deadline(o)}</p></div><div><p className="text-sm text-[var(--muted)]">Location</p><p className="mt-2">{o.locations.join(" · ") || "Unknown"}</p></div></section>
    <section className="mt-8 rounded-2xl border border-black/10 bg-white p-6"><h2 className="text-xl font-semibold">Who can apply</h2><p className="mt-4 leading-8 text-[var(--muted)]">{o.eligibility_notes || "Unknown"}</p><p className="mt-4 text-sm">Applicant types: {o.applicant_types.join(", ") || "Unknown"}</p><p className="mt-3 text-sm">Interests: {o.categories.join(" · ") || "Unknown"}</p><p className="mt-5 text-sm text-[var(--muted)]">These summaries help you discover programs. Only the funder can confirm eligibility.</p></section>
    <section className="mt-6 rounded-2xl border border-black/10 bg-white p-6"><h2 className="text-xl font-semibold">Dates and source</h2><p className="mt-4 leading-8 text-[var(--muted)]">{o.deadline_notes || "Unknown"}</p><p className="mt-4 text-sm">{verificationLabel(o)} · {o.publication_origin==='crawler'&&!o.last_verified_at?'Source fetched':'Last checked'} {checkedDate(o.publication_origin==='crawler'&&!o.last_verified_at?o.source_fetched_at:o.last_checked_at)}</p><a href={o.source_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block break-all text-sm text-[var(--brand)] underline">Source page ↗</a></section>
    {o.awaiting_review && <p className="mt-4 text-amber-800">Source changes awaiting review. Confirm current details with the funder.</p>}
    <CatalogHealth state={o.monitor_state} success={o.monitor_success} failures={o.monitor_failures} evidence={o.monitor_evidence}/>
    <Checklist userId={session.user.id} opportunity={o} error={query.checklistError} updated={query.checklistUpdated==="1"}/>
  </>;
}
