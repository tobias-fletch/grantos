import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { discoveryCounts, parseFilters, searchOpportunities } from "@/lib/opportunities/store";
import { OpportunityCard } from "@/components/opportunity";

export default async function Dashboard() {
  const {session,workspace} = await requireWorkspace();
  const [counts,suggestions] = await Promise.all([discoveryCounts(pool,session.user.id),searchOpportunities(pool,session.user.id,parseFilters({suggested:"1"}))]);
  const cards = [["Catalog opportunities",counts.catalog,"/app/opportunities"],["Profile suggestions",String(suggestions.total),"/app/matches"],["Saved grants",counts.saved,"/app/saved"],["Saved deadlines · 30 days",counts.deadlines,"/app/saved?sort=deadline"]];
  return <>
    <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted)]">Overview</p>
    <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Welcome, {session.user.name ?? "there"}</h1>
    <p className="mt-3 text-[var(--muted)]">Find funding worth pursuing, and build your shortlist.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,href])=><Link href={href} key={label} className="rounded-2xl border border-black/10 bg-white p-6 hover:border-[var(--brand)]"><p className="text-3xl font-semibold">{value}</p><p className="mt-2 text-sm text-[var(--muted)]">{label}</p></Link>)}</div>
    <div className="mb-5 mt-10 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Start with your profile</h2><Link href="/app/matches" className="text-sm text-[var(--brand)] underline">All suggestions</Link></div>
    <p className="mb-5 text-sm text-[var(--muted)]">Based on your interests, applicant type, and location. Review full eligibility with each funder.</p>
    <div className="grid gap-5">{suggestions.rows.slice(0,3).map(o=><OpportunityCard key={o.id} opportunity={o} returnTo="/app/dashboard" canEdit={workspace.role !== "viewer"}/>)}</div>
    {!suggestions.total && <div className="rounded-2xl border border-dashed border-black/20 p-8"><p>No suggestions from the starter catalog yet.</p><Link href="/app/opportunities" className="mt-4 inline-block text-[var(--brand)] underline">Explore all opportunities</Link></div>}
  </>;
}
