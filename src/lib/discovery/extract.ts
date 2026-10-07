import { load } from "cheerio";
export const EXTRACTION_VERSION = "evidence-v2";
export function extractFacts(html: string, url: string) {
  const $ = load(html);
  $("script,style,nav,footer,header,noscript,form,iframe").remove();
  $("p,div,section,h1,h2,h3,h4,h5,h6,li,dt,dd,br").append(" ");
  const text = (
    $("main").length ? $("main").text() : $("body").text() || $.text()
  )
    .replace(/\s+/g, " ")
    .trim();
  const facts: Record<string, string> = { extractor: EXTRACTION_VERSION };
  const paragraphs = $("p")
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, " ").trim());
  const summary = paragraphs.find(
    (t) =>
      t.length >= 60 &&
      t.length <= 1500 &&
      /\b(grant|funding|fellowship|award)s?\b/i.test(t),
  );
  if (summary && text.includes(summary)) facts.summary = summary;
  // Capture whole eligibility sections; do not infer applicant classes from isolated mentions.
  const sections = $("h2,h3,h4,dt")
    .toArray()
    .filter((el) =>
      /^(?:eligibility(?: and restrictions)?|eligible applicants|who (?:may|can) apply(?: for this program)?\??|who is eligible\??)[:\s]*$/i.test($(el).text().trim()),
    )
    .map((el) =>
      $(el).nextUntil("h1,h2,h3,h4,dt").text().replace(/\s+/g, " ").trim(),
    )
    .filter((t) => t.length >= 40 && t.length <= 5000 && text.includes(t));
  if (sections.length === 1) facts.eligibility = sections[0];
  const deadlines = [
    ...text.matchAll(
      /(?:Application Deadline|Applications Due|Deadline)\s*:\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/gi,
    ),
  ];
  if (deadlines.length === 1) {
    const raw = deadlines[0][1];
    const parts = raw.includes("/") ? raw.split("/") : raw.split("-");
    const y = Number(parts[raw.includes("/") ? 2 : 0]),
      m = Number(parts[raw.includes("/") ? 0 : 1]),
      d = Number(parts[raw.includes("/") ? 1 : 2]);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    ) {
      facts.deadline = date.toISOString().slice(0, 10);
      facts.deadline_evidence = deadlines[0][0];
    }
  }
  // This adapter is deliberately narrow: USD maximum for an official Spencer program.
  const u = new URL(url);
  if (
    u.hostname === "www.spencer.org" &&
    u.pathname.startsWith("/grant_types/")
  ) {
    // Spencer also publishes explicit month-name deadlines. Conflicting cycles stay unknown.
    const named=[...text.matchAll(/(?:Application Deadline|Applications Due|Deadline)\s*:\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi)];
    if(named.length===1&&deadlines.length===0){
      const month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(named[0][1].toLowerCase());
      const day=Number(named[0][2]),year=Number(named[0][3]),date=new Date(Date.UTC(year,month,day));
      if(date.getUTCMonth()===month&&date.getUTCDate()===day){facts.deadline=date.toISOString().slice(0,10);facts.deadline_evidence=named[0][0];}
    }else if(named.length){delete facts.deadline;delete facts.deadline_evidence;}
    const amounts = [...text.matchAll(/budgets up to \$([\d,]+)\b/gi)];
    const values = [...new Set(amounts.map((m) => m[1].replaceAll(",", "")))];
    if (
      values.length === 1 &&
      Number(values[0]) > 0 &&
      Number(values[0]) <= 100000000
    ) {
      facts.maximum = values[0];
      facts.currency = "USD";
      facts.amount_evidence = amounts[0][0];
    }
    const closed = text.match(
      /Applications (?:are |currently )?closed\.?|Applications Open:?\s*Now closed\.?/i,
    );
    const open = text.match(/Applications are (?:currently )?open\.?/i);
    if (closed && !open) {
      facts.status = "closed";
      facts.status_evidence = closed[0];
    } else if (open && !closed) {
      facts.status = "open";
      facts.status_evidence = open[0];
    }
    facts.official_adapter = "spencer-program-v1";
  }
  return facts;
}
export function evidenceFacts(
  x: Record<string, string>,
  body: string,
  url: string,
  now = new Date(),
) {
  const supported = (key: string) =>
    typeof x[key] === "string" && x[key].length >= 12 && body.includes(x[key]);
  const summary = supported("summary") ? x.summary : null;
  const eligibility = supported("eligibility") ? x.eligibility : null;
  const status =
    ["open", "closed"].includes(x.status) && supported("status_evidence")
      ? x.status
      : "unknown";
  const maximum =
    x.currency === "USD" &&
    supported("amount_evidence") &&
    Number(x.maximum) > 0 &&
    Number(x.maximum) <= 100000000
      ? Number(x.maximum)
      : null;
  const deadline =
    supported("deadline_evidence") &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.deadline ?? "") &&
    !Number.isNaN(Date.parse(x.deadline))
      ? x.deadline
      : null;
  const u = new URL(url);
  const official =
    u.hostname === "www.spencer.org" &&
    u.pathname.startsWith("/grant_types/") &&
    x.official_adapter === "spencer-program-v1";
  const consistent =
    status !== "open" ||
    (!!deadline && Date.parse(deadline + "T23:59:59Z") >= now.getTime());
  const autoVerified = !!(
    official &&
    summary &&
    eligibility &&
    maximum &&
    deadline &&
    status !== "unknown" &&
    consistent
  );
  return { summary, eligibility, status, maximum, deadline, autoVerified };
}
