import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareResults,
  matchProfile,
  type GrantResult,
} from "../src/lib/opportunities/ranking";
import { parseFilters } from "../src/lib/opportunities/store";
const grant: GrantResult = {
  id: "a",
  kind: "catalog",
  title: "Music grant",
  source: "Funder",
  url: "https://example.org/grant",
  slug: "grant",
  summary: "Music projects",
  amount: "Unknown",
  maximum: null,
  deadline: null,
  status: "unknown",
  categories: ["Music"],
  applicants: [],
  locations: [],
  verified: false,
  fetched: null,
  reasons: [],
  conflicts: 0,
  matches: 0,
  relevance: 0,
  applicationId: null,
  awaitingReview: false,
};
const profile = {
  categories: ["Music", "Education"],
  applicant_type: "individual",
  country: "United States",
  state: "New York",
  city: "New York City",
};
test("multiple interest values are validated and deduplicated, with legacy single values supported", () => {
  assert.deepEqual(
    parseFilters({ category: ["Music", "Education", "Music", "invalid"] })
      .categories,
    ["Music", "Education"],
  );
  assert.deepEqual(parseFilters({ category: "Music" }).categories, ["Music"]);
});
test("missing facts and source categories never assert eligibility or earn supported match credit", () => {
  const lead = matchProfile({ ...grant, kind: "lead" }, profile);
  assert.equal(lead.matches, 0);
  assert.deepEqual(lead.reasons, [
    "Source covers Music",
    "Eligibility needs checking",
  ]);
  const unknown = matchProfile(grant, profile);
  assert.equal(unknown.matches, 1);
  assert.ok(!unknown.reasons.includes("Available in your location"));
});
test("known matches rank ahead of unknown facts, and known conflicts remain visible below them", () => {
  const good = matchProfile(
    { ...grant, id: "good", applicants: ["individual"] },
    profile,
    [
      {
        country: "United States",
        state: null,
        city: null,
        borough: null,
        rule: "eligible",
      },
    ],
  );
  const unknown = matchProfile({ ...grant, id: "unknown" }, profile);
  const conflict = matchProfile(
    { ...grant, id: "conflict", applicants: ["nonprofit"] },
    profile,
  );
  assert.deepEqual(
    [conflict, unknown, good]
      .sort((a, b) => compareResults(a, b, "recommended"))
      .map((r) => r.id),
    ["good", "unknown", "conflict"],
  );
  assert.equal(good.matches, 3);
});
test("unknown location detail does not establish a match and equal ranks have stable ID ordering", () => {
  const r = matchProfile(grant, { ...profile, city: undefined }, [
    {
      country: "United States",
      state: "New York",
      city: "New York City",
      borough: null,
      rule: "eligible",
    },
  ]);
  assert.ok(!r.reasons.includes("Available in your location"));
  assert.ok(
    compareResults(
      { ...grant, id: "a" },
      { ...grant, id: "b" },
      "recommended",
    ) < 0,
  );
});

test("crawler-published source categories do not become confirmed profile matches", () => {
  const result = matchProfile({ ...grant, sourceCategories: true }, profile);
  assert.equal(result.matches, 0);
  assert.ok(result.reasons.includes("Source covers Music"));
  assert.ok(!result.reasons.includes("Matches Music"));
});
test("county and postal restrictions require profile evidence before location matching", () => {
  const result = matchProfile(grant, profile, [
    {
      country: "United States",
      state: "New York",
      city: null,
      borough: null,
      county: "Queens",
      postal_code: "11375",
      rule: "eligible",
    },
  ]);
  assert.ok(!result.reasons.includes("Available in your location"));
});
