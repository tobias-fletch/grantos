import Link from 'next/link';
import {requireWorkspace} from '@/lib/auth/workspace';
import {pool} from '@/lib/db/pool';
import {listApplications,stages} from '@/lib/applications/store';
export default async function Applications({searchParams}:{searchParams:Promise<{q?:string;stage?:string;archived?:string;error?:string}>}){
 const {session}=await requireWorkspace();const p=await searchParams;const rows=await listApplications(pool,session.user.id,p);
 return <><h1 className="text-3xl font-semibold">Applications</h1><p className="mt-3 text-[var(--muted)]">Your private grant pipeline. Save a grant or proposed candidate to start. Changing a stage never submits an application to a funder.</p>
 {p.error&&<p role="alert">We couldn’t complete that request. Please try again.</p>}
 <form className="my-6 flex flex-wrap gap-3"><label>Search<input name="q" defaultValue={p.q} maxLength={200} className="block rounded border p-2"/></label><label>Stage<select name="stage" defaultValue={p.stage??''} className="block rounded border p-2"><option value="">All stages</option>{stages.map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></label><label>Show<select name="archived" defaultValue={p.archived??'0'} className="block rounded border p-2"><option value="0">Current records</option><option value="1">Archived records</option></select></label><button className="self-end rounded bg-[var(--brand)] px-4 py-2 text-white">Apply filters</button><Link href="/app/applications" className="self-end p-2 underline">Clear</Link></form>
 <p className="mb-4 text-sm">{rows.length} applications · Ordered by personal target date, then source deadline when no target is set</p>
 <div className="space-y-4">{rows.map(a=><article key={a.id} className="rounded-xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><Link href={`/app/applications/${a.id}`} className="text-lg font-semibold underline">{a.title}</Link><span className="capitalize">{a.stage}</span></div><p className="mt-2 text-sm">Personal target: {a.target_date??'Not set'} · Source deadline: {a.deadline_at?new Date(a.deadline_at).toLocaleDateString('en-US',{timeZone:'America/New_York'}):'Unknown'} · Tasks: {a.completed}/{a.tasks}</p></article>)}</div>
 {!rows.length&&<p className="rounded-xl border p-6">No applications match. <Link href="/app/opportunities" className="underline">Find an opportunity or candidate</Link>.</p>}</>;
}
