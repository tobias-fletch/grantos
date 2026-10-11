import {matchGeography,type GeographicMatch} from "./geography";
export type GrantResult = {
  geographyMatch?:GeographicMatch;
  // This assesses only recorded applicant/location rules, never full eligibility.
  eligibilityMatch?: {state: "potential" | "unknown" | "excluded"; reason: string};
  officialSource?: boolean;
  applicantTypesComplete?: boolean;
  id: string;
  kind: "catalog" | "lead" | "external";
  recordType?: "program" | "research";
  title: string;
  source: string;
  url: string;
  slug: string | null;
  summary: string;
  eligibility?: string;
  amount: string;
  maximum: number | null;
  deadline: string | null;
  status: string;
  publishedAt?: string | null;
  previousDeadline?: string | null;
  opens?: string | null;
  rolling?: boolean;
  recurrence?: string | null;
  categories: string[];
  sourceCategories?: boolean;
  applicants: string[];
  locations: string[];
  verified: boolean;
  autoVerified?: boolean;
  sourceStale?: boolean;
  sourceChecked?: string|null;
  fetched: string | null;
  reasons: string[];
  conflicts: number;
  matches: number;
  relevance: number;
  applicationId: string | null;
  applicationProjectId?: string | null;
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
const DAY = 86_400_000;
/** Freshness is evidence age, not the date a result happened to be displayed. */
export function currentSource(result: GrantResult, now = Date.now()) {
  const checked = Date.parse(result.sourceChecked ?? result.fetched ?? "");
  return !result.sourceStale && Number.isFinite(checked) && checked <= now && now - checked <= 90 * DAY;
}
export function sourceTrust(result: GrantResult, now = Date.now()) {
  const trusted = result.verified || result.officialSource === true;
  return trusted ? (currentSource(result, now) ? 0 : 1) : 2;
}
/** Dates constrain an explicit round status; they never manufacture an open round. */
export function resultAvailability(result: GrantResult, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const validDate = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? value.slice(0, 10) : null;
  const deadline = validDate(result.deadline ?? result.previousDeadline);
  if (result.status === "discontinued") return result.status;
  if (result.opens && Date.parse(result.opens) > now) return sourceTrust(result, now) === 0 ? "upcoming" : "unknown";
  if ((deadline && deadline < today) || ["closed", "round_ended", "between_rounds"].includes(result.status))
    return (result.status === "between_rounds" || ["annual", "recurring"].includes(result.recurrence ?? "")) ? "between_rounds" : "round_ended";
  if (result.status === "open" && ((!deadline && !result.rolling) || sourceTrust(result, now) !== 0)) return "unknown";
  if (result.status === "upcoming" && (!result.opens || Date.parse(result.opens) <= now || sourceTrust(result, now) !== 0)) return "unknown";
  return result.status;
}
export function visibleLocationResult(result: GrantResult, country: string, mode: string) {
  return result.eligibilityMatch?.state !== "excluded" && result.conflicts === 0 &&
    result.geographyMatch?.state !== "excluded" &&
    (!country || mode === "all" || result.geographyMatch?.state === mode);
}
export function applicantMatches(types: string[], applicant: string) {
  return types.includes(applicant) || (["student", "researcher", "consultant"].includes(applicant) && types.includes("individual"));
}
/** Roles and broad organization tags are not mutually exclusive legal forms. */
export function applicantDisjoint(types: string[], applicant: string) {
  const legal = ["student", "researcher", "consultant"].includes(applicant) ? "individual" : applicant;
  const disjoint: Record<string, string[]> = {
    individual: ["nonprofit", "organization", "business"],
    nonprofit: ["individual", "business"],
    business: ["individual", "nonprofit"],
  };
  return types.length > 0 && types.every(type => disjoint[legal]?.includes(type));
}
export function matchProfile(
  result: GrantResult,
  profile: FundingProfile,
  geographies: Geography[] = [],
  q = "",
) {
  const geographic = matchGeography(geographies, profile);
  const applicantKnown = result.kind !== "lead" && !!profile.applicant_type && result.applicants.length > 0;
  const applicantFits = applicantKnown && applicantMatches(result.applicants, profile.applicant_type);
  const applicantConflict = applicantKnown && !applicantFits && applicantDisjoint(result.applicants, profile.applicant_type) && (result.applicantTypesComplete === true || (result.verified && !result.autoVerified));
  const excluded = geographic.state === "excluded" || applicantConflict;
  const state = excluded ? "excluded" : applicantFits && geographic.state === "eligible" && sourceTrust(result) === 0 ? "potential" : "unknown";
  const reason = excluded ? (applicantConflict ? "Applicant type does not match published requirements" : geographic.reason)
    : state === "potential" ? "Applicant type and location match; check all other requirements"
    : "Eligibility needs checking";
  // Put unresolved eligibility first: cards show only the first three reasons.
  const reasons: string[] = [reason];
  let matches = 0, conflicts = excluded ? 1 : 0;
  if (applicantFits) { matches++; reasons.push("Matches your applicant type"); }
  else reasons.push(applicantKnown ? "Applicant tags may be incomplete; check requirements" : "Applicant eligibility needs checking");
  if (geographic.state === "eligible") matches++;
  if (geographic.reason !== reason) reasons.push(geographic.reason);
  const interests = result.categories.filter(c => profile.categories.includes(c));
  if (interests.length) {
    if (state === "potential" && !result.sourceCategories && result.kind !== "lead") {
      matches += interests.length;
      reasons.push(...interests.slice(0, 2).map(c => "Matches " + c));
    } else reasons.push((result.sourceCategories || result.kind === "lead" ? "Source covers " : "Topic overlap: ") + interests.slice(0, 2).join(" + "));
  }
  if (excluded) matches = 0;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const relevance = terms.reduce(
    (n, t) =>
      n +
      (result.title.toLowerCase().includes(t) ? 3 : 0) +
      (result.summary.toLowerCase().includes(t) ? 1 : 0),
    0,
  );
  return { ...result, geographyMatch: geographic, eligibilityMatch: {state, reason} as GrantResult["eligibilityMatch"], status: resultAvailability(result), reasons, matches, conflicts, relevance };
}
export function compareResults(a: GrantResult, b: GrantResult, sort: string) {
  const time = (v: string | null) => (v ? new Date(v).getTime() : Infinity);
  const status = (v: string) =>
    ({open:0,upcoming:1,between_rounds:2,unknown:3,unannounced:4,round_ended:5,closed:6,discontinued:7}[v] ?? 8);
  if (sort === "recommended") {
    const rank =
      a.conflicts - b.conflicts ||
      sourceTrust(a) - sourceTrust(b) ||
      Number(b.eligibilityMatch?.state === "potential") - Number(a.eligibilityMatch?.state === "potential") ||
      status(a.status) - status(b.status) ||
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
