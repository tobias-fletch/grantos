import {pageRole,identifiableProgramName,publisherIdentity} from "../discovery/program-evidence";
import { matchesFundingFocus } from "./funding-focus";
import {
  searchCandidates,
  searchOpportunities,
  parseFilters,
  type SearchParams,
} from "./store";
import {
  matchProfile,
  compareResults,
  type GrantResult,
  type Geography,
} from "./ranking";
import type { DB } from "../checklists/store";
const date = (v: Date | string | null) =>
  v ? new Date(v).toISOString() : null;
const canonical = (v: string) => {
  try {
    return publisherIdentity(v);
  } catch {
    return v;
  }
};
export async function unifiedSearch(
  db: DB,
  userId: string,
  params: SearchParams,
) {
  const filters = parseFilters({
    ...params,
    resultType:params.resultType==='all'?'leads':params.resultType,
    sort: params.sort ?? "recommended",
    suggested: "",
  });
  // Rank the complete filtered set before pagination; no hidden result cap in the beta.
  const catalog = await searchOpportunities(db, userId, filters, true);
  const leads = await searchCandidates(db, userId, {...filters,resultType:'all'}, 1, true);
  const applications = await db.query(
    "SELECT id,opportunity_id,source_url FROM applications WHERE workspace_id=$1 ORDER BY created_at,id",
    [catalog.workspace.id],
  );
  const aliases = await db.query(
    "SELECT url,opportunity_id FROM opportunity_source_urls",
  );
  const app = (id: string | null, url: string) =>
    applications.rows.find(
      (a) =>
        (id && a.opportunity_id === id) ||
        canonical(a.source_url) === canonical(url),
    )?.id ?? null;
  const money = (v: string | null, currency: string) =>
    v == null
      ? "Unknown"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(Number(v));
  const rows: GrantResult[] = catalog.rows.filter(o=>{
    const text=o.evidence_body??o.summary,role=pageRole(o.name,o.source_url,text);
    return !['directory','announcement','supporting','guidelines','faq','application'].includes(role)||identifiableProgramName(o.name,text,o.source_url);
  }).filter((o) => matchesFundingFocus([o.name, o.summary, o.eligibility_notes].join(" "), filters.focus)).map((o) =>
    matchProfile(
      {
        id: o.id,
        kind: "catalog",
        recordType: pageRole(o.name,o.source_url,o.evidence_body??o.summary)==='ambiguous'&&!o.last_verified_at&&!/\b((?:micro)?grants?|fellowships?|awards?|fund|program)\b/i.test(o.name)?"research":"program",
        publishedAt: date((o as typeof o & {created_at:Date}).created_at),
        title: o.name,
        source: o.funder,
        url: o.source_url,
        slug: o.slug,
        summary: o.summary,
        amount:
          o.maximum_award != null
            ? o.minimum_award === o.maximum_award
              ? money(o.maximum_award, o.currency)
              : "Up to " + money(o.maximum_award, o.currency)
            : "Unknown",
        maximum: o.maximum_award == null ? null : Number(o.maximum_award),
        deadline: date(o.current_deadline),
        previousDeadline: date(o.previous_deadline),
        opens: date(o.opens_at),
        recurrence: o.recurrence,
        rolling: o.rolling,
        status: o.status,
        categories: o.categories,
        sourceCategories:
          o.publication_origin === "crawler" && !['editor','official'].includes(String(o.publication_provenance?.category_origin)),
        applicants: o.applicant_types,
        locations: o.locations,
        autoVerified: !!o.auto_verified_at,
        sourceStale: !o.monitor_success || !!(o.monitor_next && new Date(o.monitor_next).getTime()<Date.now()),
        sourceChecked: date(o.monitor_success),
        verified: o.verification_status === "verified" && !!o.last_verified_at,
        fetched: date(o.source_fetched_at ?? o.last_checked_at),
        reasons: [],
        matches: 0,
        conflicts: 0,
        relevance: 0,
        applicationId: app(o.id, o.source_url),
        awaitingReview: o.awaiting_review,
      },
      catalog.workspace,
      (o as typeof o & { geographies: Geography[] }).geographies,
      filters.q,
    ),
  );
  const ids = new Set(rows.map((r) => r.id));
  const seen = new Set(rows.map((r) => canonical(r.url)));
  for (const alias of aliases.rows)
    if (ids.has(alias.opportunity_id)) seen.add(canonical(alias.url));
  for (const c of leads.rows) {
    const role=pageRole(c.title,c.url,c.body??c.evidence);
    if(!['program','ambiguous'].includes(role))continue;
    if(filters.resultType==='catalog'&&role==='program')continue;
    if (!matchesFundingFocus([c.title, c.evidence].join(" "), filters.focus)) continue;
    if (seen.has(canonical(c.url))) continue;
    seen.add(canonical(c.url));
    rows.push(
      matchProfile(
        {
          id: c.id,
          kind: "lead",
          recordType: role==='program'?'program':'research',
          sourceCategories:true,
          title: c.title,
          source: c.source_name,
          url: c.url,
          slug: null,
          summary: c.evidence,
          amount: "Unknown",
          maximum: null,
          deadline: null,
          status: "unknown",
          categories: c.source_categories ?? [],
          applicants: [],
          locations: [],
          verified: false,
          fetched: date(c.fetched_at),
          reasons: [],
          matches: 0,
          conflicts: 0,
          relevance: 0,
          applicationId: app(null, c.url),
          awaitingReview: false,
        },
        catalog.workspace,
        [],
        filters.q,
      ),
    );
  }
  // Canonical duplicates are collapsed for display only; private application records are never merged here.
  const grouped=new Map<string,GrantResult>();
  for(const r of rows){
    const key=canonical(r.url),old=grouped.get(key);
    const priority=(v:GrantResult)=>v.kind==='catalog'?(v.verified?0:1):2;
    if(!old||priority(r)<priority(old)||(priority(r)===priority(old)&&Date.parse(r.publishedAt??r.fetched??'9999-01-01')<Date.parse(old.publishedAt??old.fetched??'9999-01-01')))grouped.set(key,r);
  }
  const unique=[...grouped.values()].sort((a,b)=>compareResults(a,b,filters.sort));
  const programs=unique.filter(r=>r.recordType==='program'),research=unique.filter(r=>r.recordType==='research');
  const counts={programs:programs.length,leads:research.length};
  filters.programPage=Math.min(filters.programPage,Math.max(1,Math.ceil(counts.programs/12)));
  filters.leadPage=Math.min(filters.leadPage,Math.max(1,Math.ceil(counts.leads/12)));
  const selected=filters.resultType==='leads'?research:programs;
  filters.page=filters.resultType==='leads'?filters.leadPage:filters.programPage;
  const page = Math.min(
    filters.page,
    Math.max(1, Math.ceil(selected.length / 12)),
  );
  filters.page = page;
  return {
    previewResult:
      selected.find((r) => r.kind + ":" + r.id === params.preview) ?? null,
    rows: selected.slice((page - 1) * 12, page * 12),
    total: selected.length,
    counts,
    filters,
    workspace: catalog.workspace,
  };
}
