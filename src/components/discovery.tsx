import { saveCandidateAction } from "@/app/actions/applications";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { applicantTypes, categories, catalogCoverage, parseFilters, searchOpportunities, searchCandidates, type SearchParams } from "@/lib/opportunities/store";
import { OpportunityCard } from "./opportunity";

export async function Discovery({ params,mode="all" }: { params:SearchParams;mode?:"all"|"saved"|"suggested" }) {
  const { session } = await requireWorkspace();
  const filters = parseFilters({ ...params, saved: mode === "saved" ? "1" : "", suggested: mode === "suggested" ? "1" : params.suggested });
  const { rows,total,workspace } = await searchOpportunities(pool,session.user.id,filters);
  const candidatePage=Math.max(1,Math.min(10000,Number(params.candidatePage)||1));
  const candidates=await searchCandidates(pool,session.user.id,filters,candidatePage);
  const coverage = await catalogCoverage(pool);
  const crawl=(await pool.query("SELECT status,finished_at,note FROM crawl_runs WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1")).rows[0];
  const categoryLink = "/app/opportunities" + (filters.category ? `?category=${encodeURIComponent(filters.category)}` : "");
  const path = mode === "saved" ? "/app/saved" : mode === "suggested" ? "/app/matches" : "/app/opportunities";
  const query = new URLSearchParams();
  for (const [key,v] of Object.entries(filters)) if (!["saved","suggested"].includes(key) && v && !(key === "page" && v === 1)) query.set(key,String(v));
  if (filters.suggested) query.set("suggested","1");
  const returnTo = path + (query.size ? `?${query}` : "");
  const pageLink = (page: number) => { const p = new URLSearchParams(query); p.set("page",String(page)); return `${path}?${p}`; };
  const candidateLink=(page:number)=>{const p=new URLSearchParams(query);p.set('candidatePage',String(page));return `${path}?${p}#candidates`;};
  return <>
    <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted)]">Funding discovery</p>
    <h1 className="mt-2 text-3xl font-semibold md:text-4xl">{mode === "saved" ? "Your saved grants" : mode === "suggested" ? "Suggestions for your profile" : "Find your next opportunity"}</h1>
    <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">{mode === "saved" ? "A private shortlist shared only with your workspace." : mode === "suggested" ? "Based on your funding interests, applicant type, and location. These are discovery suggestions; review every funder’s full requirements." : "Explore real programs with official sources, published deadlines, and clear eligibility notes."}</p>
    <p className="mt-3 text-sm text-[var(--muted)]">Search catalog listings and likely grant leads without approval. Grant leads hides likely articles, questions, directories, and supporting pages; choose All research pages to include them. Classification is automatic, not verification. Specific filters exclude unknown fields.</p>
    {candidates.total>0&&<p className="mt-3 text-sm"><a href="#candidates" className="underline">Browse {candidates.total} {filters.resultType === "all" ? "research candidates" : "grant leads"}</a> · Included below without approval.</p>}
    {mode !== "saved" && <p className="mt-4 text-sm">Premium web research — coming later. <Link href="/app/research" className="underline">Import a funder source</Link></p>}
    <p className="mt-3 text-sm text-[var(--muted)]">{crawl ? `Last completed crawl: ${new Date(crawl.finished_at).toLocaleString('en-US',{timeZone:'America/New_York'})} Eastern · ${crawl.status}. ${crawl.note}` : 'Daily source discovery is scheduled for 6:00 a.m. Eastern; no completed crawl yet.'}</p>
    {crawl && Date.now()-new Date(crawl.finished_at).getTime()>36*60*60*1000 && <p className="mt-3 rounded border border-amber-200 p-3 text-sm">Refresh overdue. The discovery worker has not completed a recent refresh; check dates at the source.</p>}
    {params.error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">We couldn’t save that grant. Check your workspace permissions and try again.</p>}
    <form method="get" action={path} className="mt-7 grid gap-4 rounded-2xl border border-black/10 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
      {mode !== "saved" && <label className="flex items-center gap-3 font-semibold sm:col-span-2 lg:col-span-4"><input type="checkbox" name="suggested" value="1" defaultChecked={filters.suggested}/>My profile suggestions only</label>}
      <label className="text-sm sm:col-span-2">Search<input name="q" defaultValue={filters.q} placeholder="Title, funder, or keyword" maxLength={200} className="mt-2 w-full rounded-lg border border-black/15 p-3"/></label>
      {mode !== "saved" && <label className="text-sm">Results<select name="resultType" defaultValue={filters.resultType} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="grants">Grant leads (hide articles and questions)</option><option value="all">All research pages</option><option value="catalog">Catalog listings only</option></select></label>}
      <label className="text-sm">Funding interest<select name="category" defaultValue={filters.category} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="">All interests</option>{categories.map(c=><option key={c} value={c}>{c} ({coverage[c] ?? 0})</option>)}</select></label>
      <label className="text-sm">Applicant type<select name="applicant" defaultValue={filters.applicant} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="">All applicant types</option>{applicantTypes.map(a=><option key={a} value={a}>{a.replaceAll("_"," ")}</option>)}</select></label>
      <label className="text-sm">Location<select name="location" defaultValue={filters.location} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="">All locations</option><option value="nyc">Available to NYC applicants</option><option value="nyc_only">NYC-specific programs</option></select></label>
      <label className="text-sm">Application status<select name="status" defaultValue={filters.status} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="">All statuses</option><option value="unknown">Unknown</option><option value="open">Open</option><option value="upcoming">Upcoming</option><option value="unannounced">Next cycle unannounced</option><option value="closed">Closed</option></select></label>
      <label className="text-sm">Award potential ($ minimum)<input type="number" name="minAward" min={0} max={100000000} defaultValue={filters.minAward || ""} placeholder="Any amount" className="mt-2 w-full rounded-lg border border-black/15 p-3"/></label>
      <label className="text-sm">Catalog changes<select name="freshness" defaultValue={filters.freshness} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="">Any time</option><option value="new">Added in the last 7 days</option><option value="updated">Updated in the last 7 days</option></select></label>
      <label className="text-sm">Sort by<select name="sort" defaultValue={filters.sort} className="mt-2 w-full rounded-lg border border-black/15 p-3"><option value="deadline">Open first, then deadline</option><option value="amount">Highest award</option><option value="recent">Recently checked</option></select></label>
      <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4"><button className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white">Apply filters</button><Link href={path} className="text-sm underline">Clear filters</Link></div>
    </form>
    <div className="mb-4 mt-8 flex justify-between gap-4 text-sm text-[var(--muted)]"><p>{total} {total === 1 ? "opportunity" : "opportunities"}{filters.page > 1 ? ` · Page ${filters.page}` : ""}</p><Link href="/app/opportunities?location=nyc" className="underline">NYC discovery</Link></div>
    {mode !== "saved" && total < 5 && (filters.q || filters.applicant || filters.location || filters.status || filters.minAward || filters.suggested) && <aside className="mb-5 rounded-xl border border-black/10 bg-white p-5 text-sm"><p>Fewer than five programs match all your filters. We keep your eligibility and status filters intact.</p><Link href={categoryLink} className="mt-2 inline-block underline">{filters.category ? `Browse all ${coverage[filters.category] ?? 0} ${filters.category} programs across all statuses` : "Browse the full catalog"}</Link></aside>}
    <div className="grid gap-5">{rows.map(o=><OpportunityCard key={o.id} opportunity={o} returnTo={returnTo} canEdit={workspace.role !== "viewer"}/>)}</div>
    {!rows.length && <section className="rounded-2xl border border-dashed border-black/20 p-10 text-center"><h2 className="text-xl font-semibold">{mode === "saved" && !filters.q && !filters.category ? "Your shortlist starts here" : "No opportunities match these filters"}</h2><p className="mt-3 text-[var(--muted)]">{mode === "saved" ? "Save a grant from Opportunities to keep its requirements and deadline handy." : "Try fewer filters or browse the full catalog. Missing results do not mean funding is unavailable."}</p><Link href="/app/opportunities" className="mt-5 inline-block font-semibold text-[var(--brand)] underline">Browse all opportunities</Link></section>}
    <nav aria-label="Results pages" className="mt-6 flex justify-between">{filters.page > 1 ? <Link href={pageLink(filters.page-1)} className="underline">Previous page</Link> : <span/>}{filters.page*12 < total && <Link href={pageLink(filters.page+1)} className="underline">Next page</Link>}</nav>
    {candidates.total>0&&<section id="candidates" className="mt-10">
      <h2 className="text-2xl font-semibold">{filters.resultType === "all" ? "Research candidates" : "Proposed grant leads"} ({candidates.total})</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">Available to every plan immediately. {filters.resultType === "all" ? "These pages may include articles, directories, supporting pages, or proposed updates." : "These pages appear to describe funding programs; automated filtering may miss or misclassify a page."} Amounts, deadlines, eligibility, and application status are Unknown until confirmed. Existing catalog facts remain unchanged.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{candidates.rows.map(c=><article key={c.id} className="rounded-2xl border border-black/10 bg-white p-5">
        <p className="text-xs font-semibold">Candidate — unverified{c.kind==='changed'?' · Proposed source update':''}</p>
        <h3 className="mt-2 text-lg font-semibold"><a className="underline" href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a></h3>
        <p className="mt-2 text-sm text-[var(--muted)]">{c.source_name} · Fetched {new Date(c.fetched_at).toLocaleDateString('en-US',{timeZone:'America/New_York'})}</p>
        <p className="mt-3 text-sm">{c.evidence}</p><form action={saveCandidateAction} className="mt-3"><input type="hidden" name="candidateId" value={c.id}/><button className="rounded bg-[var(--brand)] px-4 py-2 text-sm text-white">Save to applications</button></form>
        <a href={c.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm underline">View source</a>
      </article>)}</div>
      <nav aria-label="Candidate pages" className="mt-5 flex justify-between">{candidatePage>1?<Link href={candidateLink(candidatePage-1)} className="underline">Previous candidates</Link>:<span/>}{candidatePage*12<candidates.total&&<Link href={candidateLink(candidatePage+1)} className="underline">More candidates</Link>}</nav>
    </section>}
  </>;
}
