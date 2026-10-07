export type GrantResult = {
  id: string;
  kind: "catalog" | "lead";
  title: string;
  source: string;
  url: string;
  slug: string | null;
  summary: string;
  amount: string;
  maximum: number | null;
  deadline: string | null;
  status: string;
  categories: string[];
  sourceCategories?: boolean;
  applicants: string[];
  locations: string[];
  verified: boolean;
  fetched: string | null;
  reasons: string[];
  conflicts: number;
  matches: number;
  relevance: number;
  applicationId: string | null;
  awaitingReview: boolean;
};
export type FundingProfile = {
  categories: string[];
  applicant_type: string;
  country: string;
  state?: string;
  city?: string;
  borough?: string;
  county?: string;
  postal_code?: string;
};
export type Geography = {
  country: string | null;
  state: string | null;
  city: string | null;
  borough: string | null;
  county?: string | null;
  postal_code?: string | null;
  rule: string;
};
const equal = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
export function matchProfile(
  result: GrantResult,
  profile: FundingProfile,
  geographies: Geography[] = [],
  q = "",
) {
  const reasons: string[] = [];
  let matches = 0,
    conflicts = 0;
  const interests = result.categories.filter((c) =>
    profile.categories.includes(c),
  );
  if (result.kind === "catalog") {
    if (interests.length && !result.sourceCategories) {
      matches += interests.length;
      reasons.push(...interests.slice(0, 2).map((c) => "Matches " + c));
    }
    if (interests.length && result.sourceCategories)
      reasons.push("Source covers " + interests.slice(0, 2).join(" + "));
    if (result.applicants.length) {
      if (result.applicants.includes(profile.applicant_type)) {
        matches++;
        reasons.push("Matches your applicant type");
      } else {
        conflicts++;
        reasons.push("Applicant type may not fit");
      }
    }
    const fields = [
      "country",
      "state",
      "city",
      "borough",
      "county",
      "postal_code",
    ] as const;
    const eligible = geographies.filter((g) => g.rule === "eligible");
    const fits = (g: Geography) =>
      fields.every((k) => !g[k] || equal(g[k], profile[k]));
    const excludes = geographies.some((g) => g.rule === "excluded" && fits(g));
    if (excludes) {
      conflicts++;
      reasons.push("Location may not fit");
    } else if (eligible.some(fits)) {
      matches++;
      reasons.push("Available in your location");
    } else if (
      eligible.length &&
      eligible.every((g) =>
        fields.some((k) => g[k] && profile[k] && !equal(g[k], profile[k])),
      )
    ) {
      conflicts++;
      reasons.push("Location may not fit");
    }
  } else if (interests.length)
    reasons.push("Source covers " + interests.slice(0, 2).join(" + "));
  if (
    !result.applicants.length ||
    !geographies.length ||
    result.kind === "lead"
  )
    reasons.push("Eligibility needs checking");
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const relevance = terms.reduce(
    (n, t) =>
      n +
      (result.title.toLowerCase().includes(t) ? 3 : 0) +
      (result.summary.toLowerCase().includes(t) ? 1 : 0),
    0,
  );
  return { ...result, reasons, matches, conflicts, relevance };
}
export function compareResults(a: GrantResult, b: GrantResult, sort: string) {
  const time = (v: string | null) => (v ? new Date(v).getTime() : Infinity);
  const status = (v: string) =>
    ["open", "upcoming", "unknown", "unannounced", "closed"].indexOf(v);
  if (sort === "recommended") {
    const rank =
      a.conflicts - b.conflicts ||
      b.matches - a.matches ||
      b.relevance - a.relevance;
    if (rank) return rank;
  }
  if (sort === "amount") {
    const rank = (b.maximum ?? -1) - (a.maximum ?? -1);
    if (rank) return rank;
  }
  if (sort === "recent") {
    const rank =
      (b.fetched ? time(b.fetched) : 0) - (a.fetched ? time(a.fetched) : 0);
    if (rank) return rank;
  }
  return (
    status(a.status) - status(b.status) ||
    time(a.deadline) - time(b.deadline) ||
    0 ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}
