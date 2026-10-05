import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { allSavedOpportunities } from "@/lib/opportunities/store";
import { dashboardTasks, type Task } from "@/lib/checklists/store";
import { deadline } from "@/components/opportunity";

export default async function Dashboard() {
 const {session}=await requireWorkspace();
 const [grants,tasks]=await Promise.all([allSavedOpportunities(pool,session.user.id),dashboardTasks(pool,session.user.id)]);
 const now=new Date();const soon=new Date(now.getTime()+30*86400000);
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
 const upcoming=grants.filter(o=>o.deadline_at && o.deadline_at>=now && o.deadline_at<=soon);
 const overdueGrants=grants.filter(o=>o.deadline_at && o.deadline_at<now);
 const overdueTasks=tasks.filter(t=>t.due_date && t.due_date<today);
 const currentTasks=tasks.filter(t=>!t.due_date || t.due_date>=today);
 const taskList=(list:Task[])=>list.length?<ul className="mt-4 divide-y divide-black/10">{list.slice(0,12).map(t=><li key={t.id} className="flex items-start justify-between gap-4 py-4"><div><Link href={`/app/opportunities/${t.slug}#checklist`} className="font-semibold underline">{t.title}</Link><p className="mt-1 text-sm text-[var(--muted)]">{t.grant_name}</p></div><span className="whitespace-nowrap text-sm">{t.due_date??"No date set"}</span></li>)}</ul>:<p className="mt-4 text-sm text-[var(--muted)]">Nothing here yet.</p>;
 return <>
 <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted)]">Your funding workspace</p>
 <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Welcome, {session.user.name??"there"}</h1>
 <p className="mt-3 text-[var(--muted)]">Your saved grants, upcoming deadlines, and next steps in one place.</p>
 <div className="mt-8 grid gap-4 sm:grid-cols-3">{[["Saved grants",grants.length],["Grant deadlines · 30 days",upcoming.length],["Incomplete tasks",tasks.length]].map(([label,value])=><div key={label} className="rounded-2xl border border-black/10 bg-white p-6"><p className="text-3xl font-semibold">{value}</p><p className="mt-2 text-sm text-[var(--muted)]">{label}</p></div>)}</div>
 <section className="mt-8 rounded-2xl border border-black/10 bg-white p-6"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-2xl font-semibold">Saved grants</h2><Link href="/app/saved" className="text-sm underline">View all saved grants</Link></div>
 {grants.length?<ul className="mt-4 divide-y divide-black/10">{grants.slice(0,6).map(o=><li key={o.id} className="py-4"><Link href={`/app/opportunities/${o.slug}`} className="font-semibold underline">{o.name}</Link><p className="mt-2 text-sm text-[var(--muted)]">{o.funder} · {deadline(o)}</p><Link href={`/app/opportunities/${o.slug}#checklist`} className="mt-2 inline-block text-sm underline">Manage optional checklist{tasks.some(t=>t.opportunity_id===o.id)?` · ${tasks.filter(t=>t.opportunity_id===o.id).length} tasks remaining`:""}</Link></li>)}</ul>:<div className="mt-5"><p className="text-[var(--muted)]">Save grants you want to pursue to start building your workspace.</p><Link href="/app/opportunities" className="mt-4 inline-block font-semibold underline">Explore opportunities</Link></div>}
 </section>
 <div className="mt-8 grid gap-6 xl:grid-cols-2"><section className="rounded-2xl border border-black/10 bg-white p-6"><h2 className="text-2xl font-semibold">Upcoming grant deadlines</h2><p className="mt-2 text-sm text-[var(--muted)]">Published deadlines for your saved grants in the next 30 days.</p>{upcoming.length?<ul className="mt-4 space-y-4">{upcoming.map(o=><li key={o.id}><Link href={`/app/opportunities/${o.slug}`} className="font-semibold underline">{o.name}</Link><p className="mt-1 text-sm">{deadline(o)}</p></li>)}</ul>:<p className="mt-4 text-sm text-[var(--muted)]">No saved grant deadlines in the next 30 days. Rolling programs and unannounced dates are listed with your saved grants.</p>}</section>
 <section className="rounded-2xl border border-black/10 bg-white p-6"><h2 className="text-2xl font-semibold">To-do list</h2><p className="mt-2 text-sm text-[var(--muted)]">Manual tasks and confirmed checklist items. Open a grant to edit or mark tasks complete.</p>{taskList(currentTasks)}{currentTasks.length>12 && <p className="mt-3 text-sm">Showing the first 12 tasks. Open your saved grants to manage all tasks.</p>}</section></div>
 {(overdueGrants.length>0 || overdueTasks.length>0) && <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-2xl font-semibold">Overdue</h2>{overdueGrants.map(o=><p key={o.id} className="mt-4"><Link href={`/app/opportunities/${o.slug}`} className="font-semibold underline">{o.name}</Link><span className="ml-2 text-sm">Grant deadline passed · {deadline(o)}</span></p>)}{taskList(overdueTasks)}{overdueTasks.length>12 && <p className="mt-3 text-sm">Showing the first 12 overdue tasks. Open saved grants to manage all tasks.</p>}</section>}
 </>;
}
