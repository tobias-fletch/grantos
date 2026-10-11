import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareResults,
  resultAvailability,
  visibleLocationResult,
  sourceTrust,
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
  assert.ok(lead.reasons.includes("Source covers Music"));
  assert.equal(lead.reasons[0], "Eligibility needs checking");
  const unknown = matchProfile(grant, profile);
  assert.equal(unknown.matches, 0);
  assert.equal(unknown.eligibilityMatch?.state, "unknown");
  assert.ok(!unknown.reasons.includes("Available in your location"));
});
test("known matches rank ahead of unknown facts, and known conflicts remain visible below them", () => {
  const good = matchProfile(
    { ...grant, id: "good", applicants: ["individual"], verified: true, fetched: new Date().toISOString() },
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
    { ...grant, id: "conflict", applicants: ["nonprofit"], verified: true },
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

const nationwide = [{country: "United States", state: null, city: null, borough: null, rule: "eligible"}];
const fresh = () => ({...grant, verified: true, fetched: new Date().toISOString(), applicants: ["individual"]});
test("NEA-style authoritative nonprofit eligibility excludes individual artists despite music and nationwide matches", () => {
  // https://www.arts.gov/grants/grants-for-arts-projects
  const result = matchProfile({...fresh(), title:"NEA Grants for Arts Projects", applicants:["nonprofit", "organization"]}, profile, nationwide);
  assert.equal(result.eligibilityMatch?.state, "excluded");
  assert.equal(result.matches, 0);
  for (const mode of ["all", "eligible", "unknown"]) assert.equal(visibleLocationResult(result, "United States", mode), false);
  const partial = matchProfile({...grant, applicants:["nonprofit"]}, profile, nationwide);
  assert.equal(partial.eligibilityMatch?.state, "unknown");
  assert.equal(visibleLocationResult(partial,"United States","eligible"),true);
});
test("LMCC and Brooklyn location fixtures match boroughs without certifying project requirements", () => {
  // https://lmcc.net/resources/manhattan-arts-grants/creative-engagement/
  // https://www.brooklynartscouncil.org/what-we-do/grants/brooklyn-arts-fund
  const local = (borough: string) => [{...nationwide[0],state:"New York",city:"New York City",borough}];
  const manhattan = {...profile, borough:"Manhattan"};
  const lmcc = matchProfile({...fresh(), title:"LMCC Creative Engagement", eligibility:"Manhattan applicant AND public project in Manhattan; other rules apply"},manhattan,local("Manhattan"));
  assert.equal(lmcc.eligibilityMatch?.state,"potential");
  assert.match(lmcc.reasons[0],/check all other requirements/);
  assert.equal(matchProfile(fresh(),manhattan,local("Brooklyn")).eligibilityMatch?.state,"excluded");
  assert.equal(matchProfile(fresh(),profile,local("Manhattan")).eligibilityMatch?.state,"unknown");
});
test("arbitrary US searches include local, statewide and national rules without a New York bias", () => {
  const chicago={...profile,state:"Illinois",city:"Chicago",borough:""};
  for (const geography of [nationwide,[{...nationwide[0],state:"Illinois"}],[{...nationwide[0],state:"Illinois",city:"Chicago"}]]) {
    const result=matchProfile(fresh(),chicago,geography);
    assert.equal(result.eligibilityMatch?.state,"potential");
    assert.equal(visibleLocationResult(result,"United States","eligible"),true);
  }
  assert.equal(matchProfile(fresh(),chicago,[{...nationwide[0],state:"New York"}]).eligibilityMatch?.state,"excluded");
  assert.equal(matchProfile({...fresh(), applicants:[]},chicago,nationwide).eligibilityMatch?.state,"unknown");
});
test("applicant roles and broad organization tags are not false legal exclusions", () => {
  assert.equal(matchProfile(fresh(),{...profile,applicant_type:"student"},nationwide).eligibilityMatch?.state,"potential");
  assert.equal(matchProfile({...fresh(),applicants:["organization"]},{...profile,applicant_type:"nonprofit"},nationwide).eligibilityMatch?.state,"unknown");
});
test("current trusted evidence ranks before stale or unverified topic and location matches", () => {
  const official=matchProfile({...fresh(),id:"official",verified:false,officialSource:true},profile,[]);
  const stale=matchProfile({...fresh(),id:"stale",fetched:"2020-01-01"},profile,nationwide);
  const unverified=matchProfile({...fresh(),id:"unverified",verified:false},profile,nationwide);
  assert.deepEqual([unverified,stale,official].sort((a,b)=>compareResults(a,b,"recommended")).map(r=>r.id),["official","stale","unverified"]);
  assert.equal(sourceTrust({...fresh(),fetched:"2099-01-01"}),1);
  assert.equal(sourceTrust({...fresh(),sourceStale:true}),1);
});
test("availability needs a current round, not recurrence or an unknown deadline", () => {
  const now=Date.parse("2026-10-11T12:00:00Z");
  const current={...fresh(),fetched:"2026-10-10T12:00:00Z",status:"open"};
  assert.equal(resultAvailability(current,now),"unknown");
  assert.equal(resultAvailability({...current,rolling:true},now),"open");
  assert.equal(resultAvailability({...current,rolling:true,verified:false},now),"unknown");
  assert.equal(resultAvailability({...current,rolling:true,fetched:"2020-01-01"},now),"unknown");
  assert.equal(resultAvailability({...current,deadline:"2026-10-11"},now),"open");
  assert.equal(resultAvailability({...current,deadline:"2026-10-10"},now),"round_ended");
  // https://www.nyfa.org/awards-grants/nysca-nyfa-artist-fellowship/
  const nyfa={...current,title:"NYSCA/NYFA Artist Fellowship",recurrence:"annual",previousDeadline:"2026-01-27",deadline:null};
  assert.equal(resultAvailability(nyfa,now),"between_rounds");
  assert.equal(resultAvailability({...nyfa,opens:"2027-01-01"},now),"upcoming");
  assert.equal(resultAvailability({...current,status:"upcoming",opens:"2026-10-01"},now),"unknown");
});
