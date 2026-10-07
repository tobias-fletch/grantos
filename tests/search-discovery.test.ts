import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFacts, evidenceFacts } from "../src/lib/discovery/extract";
import { parsePage } from "../src/lib/discovery/reader";
import { searchIntent } from "../src/lib/discovery/search-jobs";
const url = "https://www.spencer.org/grant_types/test-grant";
const html =
  "<main><h1>Education Research Grant</h1><p>This grant supports education research projects with budgets up to $50,000 for eligible institutions.</p><p>Applications are open.</p><p>Application Deadline: 2099-12-01</p><h2>Eligibility</h2><p>Eligible investigators must hold a doctorate and apply through a nonprofit organization.</p><h2>How to apply</h2><p>Submit a proposal through the application portal.</p></main>";
test("official source extraction verifies complete consistent evidence only", async () => {
  const page = await parsePage(Buffer.from(html), "text/html", url);
  const x = page.extracted;
  const facts = evidenceFacts(x, page.text, url);
  assert.equal(facts.maximum, 50000);
  assert.equal(facts.deadline, "2099-12-01");
  assert.equal(facts.autoVerified, true);
  assert.equal(
    evidenceFacts(x, page.text, "https://directory.example/grant").autoVerified,
    false,
  );
  assert.equal(
    evidenceFacts(
      { ...x, eligibility: "Unsupported requirement" },
      page.text,
      url,
    ).autoVerified,
    false,
  );
  assert.equal(
    evidenceFacts(
      { ...x, deadline: undefined as unknown as string },
      page.text,
      url,
    ).autoVerified,
    false,
  );
  assert.equal(
    evidenceFacts(x, page.text, url, new Date("2100-01-01")).autoVerified,
    false,
  );
});
test("extraction leaves ambiguous dates, currencies and conflicting status unverified", async () => {
  const ambiguous = html
    .replace(
      "Application Deadline: 2099-12-01",
      "Application Deadline: 2099-12-01 Deadline: 2099-12-02",
    )
    .replace(
      "Applications are open.",
      "Applications are open. Applications are closed.",
    );
  const x = extractFacts(ambiguous, url);
  assert.equal(x.deadline, undefined);
  assert.equal(x.status, undefined);
  const conflict = await parsePage(
    Buffer.from(
      html.replace(
        "Applications are open.",
        "Applications are open. Applications are closed.",
      ),
    ),
    "text/html",
    url,
  );
  assert.equal(
    evidenceFacts(conflict.extracted, conflict.text, url).autoVerified,
    false,
  );
  assert.equal(
    extractFacts(html.replace("2099-12-01", "2099-02-30"), url).deadline,
    undefined,
  );
  assert.equal(
    extractFacts(html, "https://www.nyfa.org/opportunities/test").maximum,
    undefined,
  );
});
test("equivalent search intent coalesces categories and focus and bounds normalized query tokens", () => {
  assert.equal(
    searchIntent({ category: ["Music", "Education"], q: "ART funding" }).key,
    searchIntent({ category: ["Education", "Music"], q: "art funding" }).key,
  );
  assert.notEqual(
    searchIntent({ focus: "women" }).key,
    searchIntent({ focus: "lgbtq" }).key,
  );
  assert.ok(searchIntent({ q: "x ".repeat(1000) }).terms.length <= 12);
});
