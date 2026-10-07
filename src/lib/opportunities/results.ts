import {
  searchCandidates,
  searchOpportunities,
  parseFilters,
  type SearchParams,
} from "./store";
import { canonicalUrl } from "./research";
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
    return canonicalUrl(v).replace(/\/$/, "");
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
    sort: params.sort ?? "recommended",
    suggested: "",
  });
  // Rank the complete filtered set before pagination; no hidden result cap in the beta.
  const catalog = await searchOpportunities(db, userId, filters, true);
  const leads = await searchCandidates(db, userId, filters, 1, true);
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
  const rows: GrantResult[] = catalog.rows.map((o) =>
    matchProfile(
      {
        id: o.id,
        kind: "catalog",
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
        deadline: date(o.deadline_at),
        status: o.status,
        categories: o.categories,
        sourceCategories:
          o.publication_origin === "crawler" && !o.last_verified_at,
        applicants: o.applicant_types,
        locations: o.locations,
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
    if (seen.has(canonical(c.url)) || ids.has(c.opportunity_id)) continue;
    seen.add(canonical(c.url));
    rows.push(
      matchProfile(
        {
          id: c.id,
          kind: "lead",
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
          applicationId: app(c.opportunity_id, c.url),
          awaitingReview: false,
        },
        catalog.workspace,
        [],
        filters.q,
      ),
    );
  }
  // Canonical duplicates are collapsed for display only; private application records are never merged here.
  const unique = [
    ...new Map(rows.map((r) => [canonical(r.url), r])).values(),
  ].sort((a, b) => compareResults(a, b, filters.sort));
  const page = Math.min(
    filters.page,
    Math.max(1, Math.ceil(unique.length / 12)),
  );
  filters.page = page;
  return {
    previewResult:
      unique.find((r) => r.kind + ":" + r.id === params.preview) ?? null,
    rows: unique.slice((page - 1) * 12, page * 12),
    total: unique.length,
    filters,
    workspace: catalog.workspace,
  };
}
