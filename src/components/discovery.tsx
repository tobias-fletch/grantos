import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { applicantTypes, categories, parseFilters, searchOpportunities, type SearchParams } from "@/lib/opportunities/store";
import { OpportunityCard } from "./opportunity";

export async function Discovery({ params,mode="all" }: { params:SearchParams;mode?:"all"|"saved"|"suggested" }) {
  const { session } = await requireWorkspace();
  const filters = parseFilters({ ...params, saved: mode === "saved" ? "1" : "", suggested: mode === "suggested" ? "1" : "" });
  const { rows,total,workspace } = await searchOpportunities(pool,session.user.id,filters);
  const path = mode === "saved" ? "/app/saved" : mode === "suggested" ? "/app/matches" : "/app/opportunities";
  const query = new URLSearchParams();
  for (const [key,v] of Object.entries(filters)) if (!["saved","suggested"].includes(key) && v && !(key === "page" && v === 1)) query.set(key,String(v));
  const returnTo = path + (query.size ? `?${query}` : "");
  const pageLink = (page: number) => { const p = new URLSearchParams(query); p.set("page",String(page)); return `${path}?${p}`; };
  return <>
    <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted)]">Funding discovery</p>
    <h1 className="mt-2 text-3xl font-semibold md:text-4xl">{mode === "saved" ? "Your saved grants" : mode === "suggested" ? "Suggestions for your profile" : "Find your next opportunity"}</h1>
    <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">{mode === "saved" ? "A private shortlist shared only with your workspace." : mode === "suggested" ? "Based on your funding interests, applicant type, and location. These are discovery suggestions; review every funder’s full requirements." : "Explore real programs with official sources, published deadlines, and clear eligibility notes."}</p>
    <p className="mt-3 text-sm text-[var(--muted)]">Starter catalog · checked October 5, 2026. Confirm the official page before applying.</p>
    {params.error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">We couldn’t save that grant. Check your workspace permissions and try again.</p>}
    <form method="get" action={path} className="mt-7 grid gap-4 rounded-2xl border border-black/10 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm sm:col-span-2">Search<input name="q" defaultValue={filters.q} placeholder="Title, funder, or keyword" maxLength={200} className="mt-2 w-full rounded-lg border border-black/15 p-3"/></label>
      <label className="text-sm">Funding interest<select name="category" defaultValue={filters.category} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="">All interests</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="text-sm">Applicant type<select name="applicant" defaultValue={filters.applicant} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="">All applicant types</option>{applicantTypes.map(a=><option key={a} value={a}>{a.replaceAll("_"," ")}</option>)}</select></label>
      <label className="text-sm">Location<select name="location" defaultValue={filters.location} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="">All locations</option><option value="nyc">Available to NYC applicants</option><option value="nyc_only">NYC-specific programs</option></select></label>
      <label className="text-sm">Application status<select name="status" defaultValue={filters.status} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="">All statuses</option><option value="open">Open</option><option value="upcoming">Upcoming</option><option value="unannounced">Next cycle unannounced</option><option value="closed">Closed</option></select></label>
      <label className="text-sm">Award potential ($ minimum)<input type="number" name="minAward" min={0} max={100000000} defaultValue={filters.minAward || ""} placeholder="Any amount" className="mt-2 w-full rounded-lg border border-black/15 p-3"/></label>
      <label className="text-sm">Sort by<select name="sort" defaultValue={filters.sort} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="deadline">Deadline first</option><option value="amount">Highest award</option><option value="recent">Recently checked</option></select></label>
      <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4"><button className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white">Apply filters</button><Link href={path} className="text-sm underline">Clear filters</Link></div>
    </form>
    <div className="mb-4 mt-8 flex justify-between gap-4 text-sm text-[var(--muted)]"><p>{total} {total === 1 ? "opportunity" : "opportunities"}{filters.page > 1 ? ` · Page ${filters.page}` : ""}</p><Link href="/app/opportunities?location=nyc" className="underline">NYC discovery</Link></div>
    <div className="grid gap-5">{rows.map(o=><OpportunityCard key={o.id} opportunity={o} returnTo={returnTo} canEdit={workspace.role !== "viewer"}/>)}</div>
    {!rows.length && <section className="rounded-2xl border border-dashed border-black/20 p-10 text-center"><h2 className="text-xl font-semibold">{mode === "saved" && !filters.q && !filters.category ? "Your shortlist starts here" : "No opportunities match these filters"}</h2><p className="mt-3 text-[var(--muted)]">{mode === "saved" ? "Save a grant from Opportunities to keep its requirements and deadline handy." : "Try a broader interest or browse the starter catalog. Missing results do not mean funding is unavailable."}</p><Link href="/app/opportunities" className="mt-5 inline-block font-semibold text-[var(--brand)] underline">Browse all opportunities</Link></section>}
    <nav aria-label="Results pages" className="mt-6 flex justify-between">{filters.page > 1 ? <Link href={pageLink(filters.page-1)} className="underline">Previous page</Link> : <span/>}{filters.page*12 < total && <Link href={pageLink(filters.page+1)} className="underline">Next page</Link>}</nav>
  </>;
}
