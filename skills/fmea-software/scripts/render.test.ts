import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_PATH, renderHtml, sortChains } from "./render.ts";
import { escapeHtml } from "./lib/escape.ts";
import { checkTableShape, computePriority, loadTable } from "./lib/table.ts";
import type { PriorityTable } from "./lib/table.ts";
import { fixturePath, loadFixture, minimalDoc, rating, runCli, withTempDir } from "./test-helpers.ts";
import type { FmeaDocument, Lint, Severity } from "./lib/types.ts";

const table = loadTable();
const template = readFileSync(TEMPLATE_PATH, "utf8");
const golden = (): FmeaDocument => loadFixture<FmeaDocument>("checkout-service.fmea.json");
const vectors = loadFixture<{ vectors: string[] }>("injection-vectors.json").vectors
  .map((v) => (/[<>&"']/.test(v) ? v : `${v}<&"'>`));

// `update/stale-rows.fmea.json` is the one fixture with rows whose `stale.flag` is true: `ch-1`,
// flagged `scales-version` with all three ratings still `provisional`, and `ch-2`, flagged
// `element-changed` and re-scored by A. Reviewer on 2026-09-12. Task 26 fills `computed` only on
// `checkout-service.fmea.json` and `update/before.fmea.json`, and Task 21's `--write` runs name
// three fixtures that do not include this one, so this builder supplies `computed` and recomputes
// `priority` from the shipped table, the way the other synthesised inputs below are built.
// Recomputing writes the block Task 21 would write, so it is a no-op if that task filled it.
// The `computed` block is the one `validate.ts --write` writes for this document: quality score
// 100, three `rating-provisional` warnings on `ch-1`, no blocker.
function staleRows(): FmeaDocument {
  const doc = loadFixture<FmeaDocument>("update", "stale-rows.fmea.json");
  doc.meta.scales.priority_table = table.id;
  for (const chain of doc.chains) chain.priority = computePriority(table, chain.ratings);
  doc.computed = {
    quality_score: 100,
    lints: [
      { rule: "rating-provisional", severity: "warning", pointer: "/chains/0/ratings/S", message: "The rating is still provisional and needs re-scoring" },
      { rule: "rating-provisional", severity: "warning", pointer: "/chains/0/ratings/O", message: "The rating is still provisional and needs re-scoring" },
      { rule: "rating-provisional", severity: "warning", pointer: "/chains/0/ratings/D", message: "The rating is still provisional and needs re-scoring" },
    ],
    validated_at: "2026-09-12T11:00:00Z",
    validator_version: "0.1.0",
  };
  return doc;
}

// The free-text fields: every string the report prints that no schema pattern, format, or enum constrains.
const FREE_TEXT_KEYS = new Set([
  "name", "scope", "security", "outcome", "description", "statement", "for_whom", "failure_mode",
  "local", "next_level", "end", "text", "rationale", "owner", "trigger", "message", "reason",
  "adversary_cause", "ref", "sla", "limits", "evidence_ref", "by", "change",
]);
const FREE_TEXT_ARRAYS = new Set(["ground_rules", "included", "excluded", "reviewers", "conditions"]);

function poison(value: unknown, key: string | null, next: () => string): unknown {
  if (Array.isArray(value)) {
    if (key !== null && FREE_TEXT_ARRAYS.has(key)) return value.map(() => next());
    return value.map((v) => poison(v, null, next));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = typeof v === "string" && FREE_TEXT_KEYS.has(k) ? next() : poison(v, k, next);
    }
    return out;
  }
  return value;
}

function poisonedDocument(): FmeaDocument {
  let i = 0;
  const next = (): string => vectors[i++ % vectors.length];
  const doc = golden();
  doc.chains[0].history.push({ version: 1, date: "2026-09-07", change: "seed" });
  return poison(doc, null, next) as FmeaDocument;
}

function dataBlock(html: string): string {
  const open = '<script type="application/json" id="fmea-data">';
  const start = html.indexOf(open);
  assert.notEqual(start, -1, "the data block is missing");
  const end = html.indexOf("</script>", start);
  return html.slice(start + open.length, end);
}

const MARK_TITLES = new Map<string, string>([
  ["provisional", "At least one rating on the row was suggested during the analysis and has not been re-scored by a named reviewer, so the row's priority is not final."],
  ["stale", "The design or the scales changed after the row was rated; the row is due to be rated again."],
  ["handoff", "A cause is an attacker; the row is handed to threat modelling."],
  ["blocker", "The row, or the analysis as a whole, fails an automated check and cannot be relied on until it is fixed. See Automated checks."],
  ["warning", "An automated check found something for a reviewer to judge; it may be acceptable as it stands."],
]);
const mark = (name: string): string => `<span class="mark mark-${name}" title="${escapeHtml(MARK_TITLES.get(name) ?? "")}">${name}</span>`;
const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

function between(html: string, open: string, close: string): string {
  const start = html.indexOf(open);
  assert.notEqual(start, -1, `missing ${open}`);
  return html.slice(start, html.indexOf(close, start));
}
const sectionOf = (html: string, id: string, next: string): string => between(html, `id="${id}"`, `id="${next}"`);
const headerOf = (doc: FmeaDocument): string => sectionOf(renderHtml(doc, table, template), "header", "ground-rules");

function withComputed(doc: FmeaDocument, lints: Lint[], quality_score = 0): FmeaDocument {
  doc.computed = { quality_score, lints, validated_at: "2026-09-12T11:00:00Z", validator_version: "0.1.0" };
  return doc;
}
// One item of the "Needs attention" block, as the markup contract fixes it.
const attnItem = (what: string, list: string, why: string): string =>
  `<div class="attn-item"><div class="what">${what}</div><div>${list} <span class="why">${why}</span></div></div>`;
const SOD_TEXT = "Severity, Occurrence and Detection, each rated 1 to 10 against the scales. Higher is worse: more harm, more likely, caught later or not at all.";
const PRIORITY_TEXT = "Priority, highest first, looked up from S, O and D in the priority table. Rows are sorted by it.";
const RPN_TEXT = "S × O × D, kept for comparison with older sheets. It is not used to rank rows.";
const indexTable = (html: string): string => between(html, '<table class="index">', "</table>");
const rowSection = (html: string, id: string): string => between(html, `<article class="row" id="row-${id}">`, "</article>");
const lint = (severity: Severity, rule: string, pointer: string, message: string): Lint => ({ rule, severity, pointer, message });
const stripTags = (html: string): string => html.replace(/<[^>]+>/g, "");
/** The sections whose row ids are links (§4.3, §4.4, §4.5), each with the id of the section after it. */
const LINKED_SECTIONS: [string, string][] = [["actions", "lints"], ["lints", "provenance"], ["provenance", "fmea-data"]];

// A supplied table: the shipped bands, every cell the vocabulary's first value, shape-checked as --table-file is.
function suppliedTable(vocabulary: string[]): PriorityTable {
  const cells = Object.fromEntries(Object.keys(table.cells).map((key) => [key, vocabulary[0]]));
  return checkTableShape({ id: "priority-test-v1", vocabulary, bands: table.bands, cells }, "test table");
}

function priced(doc: FmeaDocument, index: number, value: string): FmeaDocument {
  doc.chains[index].priority.value = value;
  return doc;
}

// minimalDoc's one row with every part of §4.2: two findings and a rating-provisional one, stale with
// reason and version, a handoff, an incident, a trigger equal to no cause, a control, post-action
// ratings, an action carrying the incident, and a history entry.
function everyPart(): FmeaDocument {
  const doc = minimalDoc();
  const chain = doc.chains[0];
  chain.stale = { flag: true, reason: "element-changed", since_version: 2 };
  chain.handoff = { to: "threat-model", reason: "an adversary forges the request", adversary_cause: "attacker forges a request" };
  chain.source_incident = "INC-1";
  chain.trigger = "a deploy restarts the process";
  chain.controls = [{ kind: "detection", description: "crash alerting", status: "existing", evidence: { kind: "test_result", ref: "alert suite" } }];
  chain.actions = [{ id: "act-1", description: "add a supervisor", owner: "T. Tester", status: "Completed", target_date: "2026-08-01", completed_date: "2026-08-15", source_incident: "INC-1" }];
  chain.post_ratings = { S: rating(8), O: rating(2), D: rating(4) };
  chain.post_priority = computePriority(table, chain.post_ratings);
  chain.history = [{ version: 2, date: "2026-09-07", change: "element renamed" }];
  return withComputed(doc, [
    lint("warning", "occurrence-estimate-without-trigger", "/chains/0/post_ratings/O", "post-action finding"),
    lint("warning", "rating-provisional", "/chains/0/ratings/S", "The rating is still provisional and needs re-scoring"),
    lint("blocker", "detection-1-without-evidenced-control", "/chains/0/ratings/D", "Detection is 1 with no existing detection control carrying evidence"),
  ]);
}

test("the report carries every section id, in the order section 9 fixes", () => {
  const html = renderHtml(golden(), table, template);
  const ids = ["header", "ground-rules", "assumptions", "reviews", "structure", "chains", "actions", "lints", "provenance", "fmea-data"];
  const positions = ids.map((id) => {
    const at = html.indexOf(`id="${id}"`);
    assert.notEqual(at, -1, `section id ${id} is missing`);
    return at;
  });
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test("the ground-rules, assumptions and review-record sections carry the document's content", () => {
  const doc = golden();
  const html = renderHtml(doc, table, template);
  const section = (id: string, next: string): string =>
    html.slice(html.indexOf(`id="${id}"`), html.indexOf(`id="${next}"`));
  const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

  const groundRules = section("ground-rules", "assumptions");
  for (const rule of doc.meta.ground_rules) {
    assert.ok(groundRules.includes(escapeHtml(rule)), `the ground rules section is missing: ${rule}`);
  }
  assert.equal(count(groundRules, "<li>"), doc.meta.ground_rules.length);

  const assumptions = section("assumptions", "reviews");
  assert.equal(count(assumptions, "<li>"), doc.meta.assumptions.length);
  assert.ok(
    assumptions.includes(`${escapeHtml(doc.meta.assumptions[0].text)} <span class="empty">(user, open)</span>`),
    "the first assumption is missing its text, owner or status",
  );

  const reviews = section("reviews", "structure");
  assert.ok(
    reviews.includes(`2026-09-03 &mdash; A. Reviewer, B. Owner &mdash; ${escapeHtml(doc.meta.reviews[0].outcome)}`),
    "the review record is missing its date, its reviewers or its outcome",
  );
});

test("the automated checks section explains the checks, states the score and groups the findings", () => {
  const checks = sectionOf(renderHtml(golden(), table, template), "lints", "provenance");
  assert.ok(checks.includes("<h2>Automated checks and quality score</h2>"));
  const text = stripTags(checks);
  assert.ok(text.includes(escapeHtml("Each time the analysis is saved, a validator script checks it against the skill's rules and records what it finds here. A blocker must be fixed before the row it names, or the analysis as a whole, can be relied on. A warning is for a reviewer to judge and may be acceptable as it stands.")));
  assert.ok(text.includes(escapeHtml("Quality score: 88 of 100 — the share of chain rows with no blocker, or 0 when a blocker concerns the analysis as a whole rather than a row, or the analysis has no rows. The weighting is the skill's own.")));
  assert.ok(checks.includes("<strong>Quality score: 88 of 100</strong>"));
  // the intro's two marks, then one per group: one blocker group and three warning groups
  assert.equal(occurrences(checks, 'class="mark mark-blocker"'), 2);
  assert.equal(occurrences(checks, 'class="mark mark-warning"'), 4);
  assert.ok(checks.includes("<caption>Blockers first. Findings with the same rule and message share a line; each row location links to its row.</caption>"));
  assert.ok(checks.includes("<thead><tr><th>Severity</th><th>Rule</th><th>Where</th><th>Finding</th></tr></thead>"));
  assert.equal(occurrences(checks, "<tr>"), 5, "a head row and four groups");
  const order = ["detection-1-without-evidenced-control", "occurrence-estimate-without-trigger", "rating-provisional", "seeded-action-without-incident"]
    .map((rule) => checks.indexOf(`<code>${rule}</code>`));
  assert.ok(order.every((at) => at !== -1));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(checks.includes('<code>rating-provisional</code> <span class="muted">×8</span>'));
  assert.equal(occurrences(checks, "×"), 1, "a group of one finding shows no count");
  assert.ok(checks.includes('<a href="#row-ch-2"><code>ch-2</code></a> S, O, D<br><a href="#row-ch-4"><code>ch-4</code></a> O, D<br><a href="#row-ch-8"><code>ch-8</code></a> S, O, D'));
  assert.ok(checks.includes("<td>The rating is still provisional and needs re-scoring</td>"));
  assert.ok(checks.includes('<a href="#row-ch-7"><code>ch-7</code></a> D</td><td>Detection is 1 with no existing detection control carrying evidence</td>'));
  assert.ok(checks.includes('<a href="#row-ch-8"><code>ch-8</code></a> act-2</td>'));

  const missing = sectionOf(renderHtml(minimalDoc(), table, template), "lints", "provenance");
  assert.ok(missing.includes('<p class="empty">No computed block.</p>'));
  assert.ok(!missing.includes("Quality score"), "a document without computed has no score to state");
  const clean = sectionOf(renderHtml(withComputed(minimalDoc(), [], 100), table, template), "lints", "provenance");
  assert.ok(clean.includes("<strong>Quality score: 100 of 100</strong>"));
  assert.ok(clean.includes('<p class="empty">No findings.</p>'));
  assert.ok(!clean.includes("<table"));
});

test("a computed block whose rule id and pointer hold markup is escaped in the block, the row section and the checks table", () => {
  const rule = "<img src=x onerror=alert(1)>";
  const html = renderHtml(withComputed(minimalDoc(), [
    { rule, severity: "blocker", pointer: "/chains/0/<b>row</b>", message: "row finding" },
    { rule, severity: "blocker", pointer: "/meta/<i>doc</i>", message: "document finding" },
    { rule, severity: "warning", pointer: "/chains/9/<u>gone</u>", message: "unknown-row finding" },
  ]), table, template);
  for (const raw of ["<img", "<b>row</b>", "<i>doc</i>", "<u>gone</u>"]) assert.ok(!html.includes(raw), `raw markup printed: ${raw}`);
  const code = (s: string): string => `<code>${escapeHtml(s)}</code>`;
  const attention = between(html, 'class="attn"', 'class="toc"');
  assert.ok(attention.includes(code("/<b>row</b>")) && attention.includes(code("/meta/<i>doc</i>")));
  const row = between(html, 'id="row-ch-1"', "</article>");
  assert.ok(row.includes(code("/<b>row</b>")) && row.includes(code(rule)));
  const checks = sectionOf(html, "lints", "provenance");
  assert.ok(checks.includes(`<a href="#row-ch-1"><code>ch-1</code></a> ${code("/<b>row</b>")}</td>`));
  assert.ok(checks.includes(`document ${code("/meta/<i>doc</i>")}</td>`));
  assert.ok(checks.includes(`unknown row ${code("/chains/9/<u>gone</u>")}</td>`));
  assert.equal(occurrences(checks, code(rule)), 3, "three groups, each printing the rule escaped");
});

test("the header carries every field section 9 requires, and the provisional count", () => {
  const doc = golden();
  const html = renderHtml(doc, table, template);
  const header = html.slice(html.indexOf('id="header"'), html.indexOf('id="ground-rules"'));
  assert.ok(header.includes("<h1>Checkout service DFMEA</h1>"), "the header is missing the analysis name");
  for (const pair of [
    "<dt>Version</dt><dd>1</dd>",
    "<dt>Branch</dt><dd>DFMEA</dd>",
    `<dt>Scope</dt><dd>${escapeHtml(doc.meta.scope)}</dd>`,
    `<dt>Security boundary</dt><dd>${escapeHtml(doc.meta.boundary.security)}</dd>`,
    "<dt>Scales version</dt><dd>1</dd>",
    "<dt>Priority table</dt><dd><code>priority-fmea-software-v1</code></dd>",
  ]) {
    assert.ok(header.includes(pair), `the header is missing ${pair}`);
  }
  assert.ok(header.includes('<span class="lbl">Ratings not yet reviewed</span><span class="big">8 <small>of 27</small></span><span class="sub">provisional, in 3 rows</span>'), "the header is missing the provisional tile");
  assert.ok(!header.includes("ratings provisional"), "the old provisional line is still printed");
});

test("the provisional count and the row mark cover the post-action ratings", () => {
  const doc = minimalDoc();
  doc.chains[0].actions = [{ id: "act-1", description: "add a retry", owner: "T. Tester", status: "Completed", target_date: "2026-08-01", completed_date: "2026-08-15" }];
  doc.chains[0].post_ratings = { S: rating(4, "provisional"), O: rating(3), D: rating(2) };
  doc.chains[0].post_priority = computePriority(table, doc.chains[0].post_ratings);
  const html = renderHtml(doc, table, template);
  assert.ok(html.includes('<span class="big">1 <small>of 6</small></span><span class="sub">provisional, in 1 row</span>'), "the tile counts the post-action ratings, both in the total and in the provisional count");
  assert.ok(
    indexTable(html).includes(`<td class="nw"><a href="#row-ch-1"><code>ch-1</code></a><br>${mark("provisional")}</td>`),
    "the row is marked provisional on the strength of its post-action ratings alone",
  );
});

test("the header shows the five tiles, each linking to its section", () => {
  const header = headerOf(golden());
  assert.equal(occurrences(header, '<a class="tile'), 5);
  for (const tile of [
    '<a class="tile" href="#chains"><span class="lbl">Rows by priority</span><span class="pcounts"><span class="pcount"><span class="pri pri-top">H</span>4</span><span class="pcount"><span class="pri pri-mid">M</span>4</span><span class="pcount"><span class="pri pri-low">L</span>0</span></span><span class="sub">8 failure chains</span></a>',
    '<a class="tile" href="#chains"><span class="lbl">Ratings not yet reviewed</span><span class="big">8 <small>of 27</small></span><span class="sub">provisional, in 3 rows</span></a>',
    '<a class="tile alert" href="#lints"><span class="lbl">Automated checks</span><span class="big">1 blocker</span><span class="sub">10 warnings</span></a>',
    '<a class="tile" href="#actions"><span class="lbl">Actions</span><span class="big">8 open <small>of 9</small></span><span class="sub">next due 2026-10-09</span></a>',
    '<a class="tile" href="#lints"><span class="lbl">Quality score</span><span class="big">88 <small>of 100</small></span><span class="sub">share of rows with no blocker</span></a>',
  ]) {
    assert.ok(header.includes(tile), `the header is missing the tile ${tile}`);
  }
});

test("the Needs attention block lists the fixture's blocker, provisional ratings, handoff and next actions, in that order", () => {
  const header = headerOf(golden());
  assert.ok(header.includes('<div class="attn"><h2 class="attn-title">Needs attention</h2><div class="attn-item">'));
  const items = [
    attnItem(`1 row fails an automated check<br>${mark("blocker")}`,
      '<a href="#row-ch-7"><code>ch-7</code></a> D &mdash; Detection is 1 with no existing detection control carrying evidence',
      "A blocker is an automated check that must pass before the row, or the analysis as a whole, can be relied on. Fix it, then validate again."),
    attnItem(`8 ratings not yet reviewed<br>${mark("provisional")}`,
      '<a href="#row-ch-2"><code>ch-2</code></a> S, O, D &middot; <a href="#row-ch-4"><code>ch-4</code></a> O, D &middot; <a href="#row-ch-8"><code>ch-8</code></a> S, O, D',
      "A provisional rating was suggested during the analysis and no named reviewer has re-scored it yet. The priority of these rows is not final until one does."),
    attnItem(`1 row passed to threat modelling<br>${mark("handoff")}`,
      '<a href="#row-ch-5"><code>ch-5</code></a> A session token that this component did not issue for the current session is accepted',
      "A handoff row has an attacker as a cause. It is recorded here and handed to threat modelling, which owns the countermeasure."),
    attnItem("Next actions due",
      '2026-10-09 <a href="#row-ch-4"><code>ch-4</code></a> act-1, Platform team &middot; 2026-10-15 <a href="#row-ch-1"><code>ch-1</code></a> act-1, Payments team &middot; 2026-10-16 <a href="#row-ch-8"><code>ch-8</code></a> act-1, Payments team',
      "The open actions with the earliest target dates, three at most. All actions are listed under Actions."),
  ];
  const at = items.map((item) => header.indexOf(item));
  assert.ok(at.every((i) => i !== -1), `an item is missing or misprinted: ${at.join(", ")}`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  assert.equal(occurrences(header, '<div class="attn-item">'), 4, "an empty item (stale rows) is left out");
});

test("the Needs attention block lists stale rows with their reasons in words", () => {
  const header = headerOf(staleRows());
  const stale = header.indexOf(attnItem(`2 rows due to be rated again<br>${mark("stale")}`,
    '<a href="#row-ch-1"><code>ch-1</code></a> the scales changed &middot; <a href="#row-ch-2"><code>ch-2</code></a> its element changed',
    "A stale row was rated before the design or the scales changed. Its ratings describe the earlier state until it is rated again."));
  assert.notEqual(stale, -1, "the stale item is missing or misprinted");
  assert.ok(stale < header.indexOf("3 ratings not yet reviewed"), "the stale item comes before the provisional item");
});

test("a blocker outside any row names the document or the unknown row, with no link", () => {
  const doc = withComputed(minimalDoc(), [
    { rule: "metadata-without-ground-rules", severity: "blocker", pointer: "/meta/ground_rules", message: "the document records no ground rules" },
    { rule: "detection-1-without-evidenced-control", severity: "blocker", pointer: "/chains/9/ratings/D", message: "Detection is 1 with no existing detection control carrying evidence" },
  ]);
  assert.ok(headerOf(doc).includes(attnItem(`The document fails an automated check<br>${mark("blocker")}`,
    "unknown row <code>/chains/9/ratings/D</code> &mdash; Detection is 1 with no existing detection control carrying evidence<br>document <code>/meta/ground_rules</code> &mdash; the document records no ground rules",
    "A blocker is an automated check that must pass before the row, or the analysis as a whole, can be relied on. Fix it, then validate again.")));
});

test("with nothing to list, the Needs attention block holds its one sentence", () => {
  const header = headerOf(minimalDoc());
  assert.ok(header.includes('<div class="attn"><h2 class="attn-title">Needs attention</h2><p class="attn-none">Nothing needs attention: no blocker, no stale row, no provisional rating, no handoff and no open action.</p></div>'));
  assert.equal(occurrences(header, "attn-item"), 0);
});

test("a rating-provisional finding of severity blocker is listed in the Needs attention block and in its row", () => {
  const doc = withComputed(minimalDoc(), [lint("blocker", "rating-provisional", "/chains/0/ratings/S", "The rating is still provisional and needs re-scoring")]);
  const html = renderHtml(doc, table, template);
  const header = sectionOf(html, "header", "ground-rules");
  assert.ok(header.includes(`<div class="attn-item"><div class="what">1 row fails an automated check<br>${mark("blocker")}</div>`), "the blocker item");
  assert.ok(!header.includes("attn-none"), "the nothing-needs-attention sentence");
  const article = rowSection(html, "ch-1");
  assert.equal(occurrences(article, '<p class="finding'), 1, "one finding line in the row");
  assert.ok(article.includes(`<p class="finding">${mark("blocker")} &nbsp;S &mdash; The rating is still provisional and needs re-scoring <span class="muted"><code>rating-provisional</code></span></p>`),
    "the line names the rule");
});

test("a document without a computed block shows an em dash in the quality score tile", () => {
  const header = headerOf(minimalDoc());
  assert.ok(header.includes('<a class="tile" href="#lints"><span class="lbl">Quality score</span><span class="big">&mdash;</span><span class="sub">share of rows with no blocker</span></a>'));
  assert.ok(header.includes('<a class="tile" href="#lints"><span class="lbl">Automated checks</span><span class="big">0 blockers</span><span class="sub">0 warnings</span></a>'), "no finding, no alert");
  assert.ok(header.includes('<a class="tile" href="#actions"><span class="lbl">Actions</span><span class="big">none</span></a>'));
});

test("the header ends with the contents line, after the metadata, the tiles and the block", () => {
  const header = headerOf(golden());
  const toc = '<p class="toc"><b>Contents</b>&nbsp; <a href="#ground-rules">Ground rules</a><a href="#assumptions">Assumptions</a><a href="#reviews">Review record</a><a href="#structure">Structure</a><a href="#chains">Failure chains</a><a href="#actions">Actions</a><a href="#lints">Automated checks</a><a href="#provenance">Provenance</a></p>';
  const at = ['<dl class="header">', '<div class="tiles">', '<div class="attn">', toc].map((s) => header.indexOf(s));
  assert.ok(at.every((i) => i !== -1), `a header part is missing: ${at.join(", ")}`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
});

test("row marks: one handoff, three provisional rows, no stale row", () => {
  const index = indexTable(renderHtml(golden(), table, template));
  assert.equal(occurrences(index, 'class="mark mark-handoff"'), 1);
  assert.equal(occurrences(index, 'class="mark mark-provisional"'), 3);
  assert.equal(occurrences(index, 'class="mark mark-stale"'), 0);
});

test("a flagged row carries the stale mark; a cleared row carries none", () => {
  const index = indexTable(renderHtml(staleRows(), table, template));
  assert.equal(occurrences(index, 'class="mark mark-stale"'), 2);
  assert.ok(index.includes(`<a href="#row-ch-1"><code>ch-1</code></a><br>${mark("stale")} ${mark("provisional")}</td>`), "ch-1 is flagged scales-version with three provisional ratings");
  assert.ok(index.includes(`<a href="#row-ch-2"><code>ch-2</code></a><br>${mark("stale")}</td>`), "ch-2 is flagged element-changed and fully re-scored");
  assert.ok(index.includes(`<a href="#row-ch-3"><code>ch-3</code></a></td>`), "ch-3 had its flag cleared and carries no mark");
});

test("chains sort by priority, then by severity descending, then by id", () => {
  assert.deepEqual(sortChains(golden(), table).map((c) => c.id), ["ch-2", "ch-1", "ch-5", "ch-7", "ch-4", "ch-8", "ch-6", "ch-3"]);
  const html = renderHtml(golden(), table, template);
  const table_start = html.indexOf('id="chains"');
  const order = ["ch-2", "ch-1", "ch-5", "ch-7", "ch-4", "ch-8", "ch-6", "ch-3"].map((id) => html.indexOf(`<code>${id}</code>`, table_start));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("the chain table's caption states the sort order and that actions do not move a row", () => {
  const html = renderHtml(golden(), table, template);
  const caption = "Rows are sorted by the pre-action priority, then by severity; a row keeps its place after actions. A row id links to the row's full section below.";
  assert.ok(html.includes(`<table class="index"><caption>${escapeHtml(caption)}</caption><thead>`));
});

test("the key lists the loaded table's vocabulary and all five marks; a document with no chains has no key and no index", () => {
  const key = between(renderHtml(golden(), table, template), '<div class="key">', "</div>");
  const entries = [
    '<h3 class="key-title">How to read this table</h3><dl>',
    `<dt><b>S</b>, <b>O</b>, <b>D</b></dt><dd>${escapeHtml(SOD_TEXT)}</dd>`,
    `<dt><span class="pri pri-top">H</span> <span class="pri pri-mid">M</span> <span class="pri pri-low">L</span></dt><dd>${escapeHtml(PRIORITY_TEXT)}</dd>`,
    `<dt><b>RPN</b></dt><dd>${escapeHtml(RPN_TEXT)}</dd>`,
    ...[...MARK_TITLES].map(([name, title]) => `<dt>${mark(name)}</dt><dd>${escapeHtml(title)}</dd>`),
  ];
  const at = entries.map((entry) => key.indexOf(entry));
  assert.ok(at.every((i) => i !== -1), `the key is missing an entry: ${JSON.stringify(at)}`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b), "the key's entries are out of order");

  const empty = minimalDoc();
  empty.chains = [];
  const chains = sectionOf(renderHtml(empty, table, template), "chains", "actions");
  assert.ok(chains.includes('<p class="empty">No chains.</p>'));
  for (const absent of ['class="key"', 'class="index"', "<article"]) assert.ok(!chains.includes(absent), `a document with no chains has ${absent}`);
});

test("the index has a titled head and one row per chain linking to the row's section", () => {
  const doc = golden();
  const index = indexTable(renderHtml(doc, table, template));
  const sod = (f: string): string => `<th class="num"><abbr title="${escapeHtml(SOD_TEXT)}">${f}</abbr></th>`;
  assert.ok(index.includes(
    `<thead><tr><th><abbr title="${escapeHtml(PRIORITY_TEXT)}">Priority</abbr></th><th>Row</th><th>Element</th><th>Failure mode</th><th>End effect</th>` +
    `${sod("S")}${sod("O")}${sod("D")}<th class="num"><abbr title="${escapeHtml(RPN_TEXT)}">RPN</abbr></th><th>Actions</th></tr></thead><tbody>`,
  ));
  assert.equal(occurrences(index, "<tr>"), doc.chains.length + 1);
  const ch3 = doc.chains[2];
  assert.ok(index.includes(
    `<tr><td><span class="pri pri-mid">M</span></td><td class="nw"><a href="#row-ch-3"><code>ch-3</code></a></td><td><code>pricing</code></td>` +
    `<td>${escapeHtml(ch3.failure_mode)}</td><td>${escapeHtml(ch3.effects.end)}</td>` +
    `<td class="num">4</td><td class="num">5</td><td class="num">2</td><td class="num">40</td><td class="nw">1 open of 2<br><span class="muted">due 2026-10-30</span></td></tr>`,
  ), "ch-3's index row");
  assert.ok(index.includes(`<a href="#row-ch-7"><code>ch-7</code></a><br>${mark("blocker")}</td>`), "ch-7 carries the fixture's one blocker");
  assert.ok(index.includes('<td class="nw muted">none</td>'), "ch-5 has no action");
});

test("an expanded row shows the post-action priority letter and RPN in its post-action ratings block", () => {
  const doc = minimalDoc();
  doc.chains[0].actions = [{ id: "act-1", description: "add a retry", owner: "T. Tester", status: "Completed", target_date: "2026-08-01", completed_date: "2026-08-15" }];
  doc.chains[0].post_ratings = { S: rating(4), O: rating(3), D: rating(2) };
  doc.chains[0].post_priority = computePriority(table, doc.chains[0].post_ratings);
  const section = rowSection(renderHtml(doc, table, template), "ch-1");
  assert.ok(section.includes('<br><span class="muted">after actions:</span> <span class="pri pri-mid">M</span> <span class="muted">RPN 24</span></div></header>'), "the header's second line");
  assert.ok(section.includes('<span class="lbl">Post-action ratings — priority M, RPN 24</span><table>'), "the post-action block leads with the post-action priority");
  assert.ok(section.includes('<span class="lbl">Ratings</span><table>'), "the pre-action block carries no such line");
  assert.ok(section.includes('<td class="num">4 <span class="muted">(was 8)</span></td>'), "S changed from 8");
  assert.ok(section.includes('<td class="num">2 <span class="muted">(was 4)</span></td>'), "D changed from 4");
  assert.ok(!section.includes("(was 3)"), "O did not change");
});

test("a row section carries its parts in order on a row that has every part", () => {
  const doc = everyPart();
  const article = rowSection(renderHtml(doc, table, template), "ch-1");
  const post = doc.chains[0].post_priority!;
  const parts = [
    `<header><span class="pri pri-mid">M</span><h3><code>ch-1</code>&nbsp; stops serving</h3><div class="meta"><code>svc</code><br>S <b>8</b> &middot; O <b>3</b> &middot; D <b>4</b> &middot; <span class="muted">RPN 96</span> &middot; ${mark("stale")} ${mark("handoff")} ${mark("blocker")}<br>`,
    `<p class="finding">${mark("blocker")} &nbsp;D &mdash; Detection is 1 with no existing detection control carrying evidence <span class="muted"><code>detection-1-without-evidenced-control</code></span></p>`,
    `<p class="finding warn">${mark("warning")} &nbsp;post-action O &mdash; post-action finding <span class="muted"><code>occurrence-estimate-without-trigger</code></span></p>`,
    '<p class="stale-notice">Stale since version 2: its element changed.</p>',
    '<span class="lbl">Handoff</span><b>threat-model</b> &mdash; an adversary forges the request <span class="muted">(adversary cause: attacker forges a request)</span>',
    '<span class="lbl">Function</span>serve requests',
    '<span class="lbl">Seeded from incident</span><code>INC-1</code>',
    '<span class="lbl">Effects</span><div class="fx"><div class="box"><span class="lbl">Local</span>no response</div>',
    '<div class="box end"><span class="lbl">End</span>users cannot check out</div>',
    '<span class="lbl">Trigger</span>a deploy restarts the process',
    '<span class="lbl">Causes</span><ul><li>process crash</li></ul>',
    '<span class="lbl">Controls</span><ul><li><b>detection</b> &mdash; crash alerting <span class="muted">(existing, evidence test_result <code>alert suite</code>)</span></li></ul>',
    '<span class="lbl">Ratings</span><table>',
    `<span class="lbl">Post-action ratings — priority ${post.value}, RPN ${post.rpn}</span><table>`,
    '<span class="lbl">Actions</span><ul><li><code>act-1</code> add a supervisor <span class="muted">(T. Tester, Completed, target 2026-08-01, completed 2026-08-15, incident <code>INC-1</code>)</span></li></ul>',
    '<span class="lbl">Row history</span><ul><li>v2 2026-09-07 &mdash; element renamed</li></ul>',
    '<p class="back"><a href="#chains">',
  ];
  const at = parts.map((part) => article.indexOf(part));
  assert.ok(at.every((i) => i !== -1), `a part is missing: ${JSON.stringify(at)}`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b), "the parts are out of order");
  assert.equal(occurrences(article, '<p class="finding'), 2, "two finding lines, blocker first");
  assert.ok(!article.includes("rating-provisional"), "a rating-provisional finding is not repeated in the row");
});

test("a row section leaves out each part it has nothing for", () => {
  const doc = minimalDoc();
  doc.chains[0].trigger = "   ";
  const article = rowSection(renderHtml(doc, table, template), "ch-1");
  for (const absent of ['<p class="finding', '<p class="stale-notice">', '<span class="lbl">Handoff</span>', '<span class="lbl">Seeded from incident</span>',
    '<span class="lbl">Trigger</span>', '<span class="lbl">Post-action ratings', '<span class="lbl">Row history</span>', "mark-trigger", "after actions:"]) {
    assert.ok(!article.includes(absent), `the row has ${absent}`);
  }
  for (const present of ['<span class="lbl">Function</span>serve requests', '<span class="lbl">Effects</span>', '<span class="lbl">Causes</span><ul>',
    '<span class="lbl">Controls</span><p class="empty">No controls recorded.</p>', '<span class="lbl">Ratings</span><table>',
    '<span class="lbl">Actions</span><p class="empty">No actions on this row.</p>', '<p class="back"><a href="#chains">']) {
    assert.ok(article.includes(present), `the row lacks ${present}`);
  }
});

test("a trigger equal to a cause marks that cause and gets no part of its own", () => {
  const doc = golden();
  const html = renderHtml(doc, table, template);
  const ch2 = rowSection(html, "ch-2");
  assert.ok(ch2.includes(`<li>${escapeHtml(doc.chains[1].causes[0].text)} <span class="muted">[design]</span> <span class="mark mark-trigger">trigger</span></li>`));
  assert.equal(occurrences(ch2, "mark-trigger"), 1);
  assert.ok(!ch2.includes('<span class="lbl">Trigger</span>'));
  const ch7 = rowSection(html, "ch-7");
  assert.ok(ch7.includes(`<span class="lbl">Trigger</span>${escapeHtml(doc.chains[6].trigger!)}`));
  assert.ok(!ch7.includes("mark-trigger"));
  assert.ok(ch2.includes(`<td>${mark("provisional")}</td></tr>`), "a provisional review status shows as the mark");
  assert.ok(rowSection(html, "ch-5").includes('<span class="mark mark-adversarial">adversarial</span>'), "the adversarial mark carries no tooltip");
});

test("a finding on the row alone prints no location label", () => {
  const doc = withComputed(minimalDoc(), [lint("warning", "test-row", "/chains/0", "row-alone finding")]);
  assert.ok(rowSection(renderHtml(doc, table, template), "ch-1").includes(
    `<p class="finding warn">${mark("warning")} &nbsp;row-alone finding <span class="muted"><code>test-row</code></span></p>`,
  ));
});

test("a chain with no function, and two chains with one id, still render", () => {
  const lost = minimalDoc();
  lost.chains[0].function = "fn-missing";
  const html = renderHtml(lost, table, template);
  assert.ok(indexTable(html).includes("</td><td><code></code></td><td>stops serving</td>"), "an empty element cell");
  assert.ok(rowSection(html, "ch-1").includes('<div><span class="lbl">Function</span></div>'), "an empty function part");

  const twins = minimalDoc();
  twins.chains.push({ ...twins.chains[0], failure_mode: "second" });
  const both = renderHtml(twins, table, template);
  assert.equal(occurrences(both, '<article class="row" id="row-ch-1">'), 2);
  assert.ok(both.includes("second</h3>"));
});

test("a three-value and a one-value supplied table get the rank styles of section 4.7", () => {
  // Letters reversed, so a style that followed the letter instead of the rank would fail.
  const html = renderHtml(priced(golden(), 0, "L"), suppliedTable(["L", "M", "H"]), template);
  assert.ok(html.includes('<dt><span class="pri pri-top">L</span> <span class="pri pri-mid">M</span> <span class="pri pri-low">H</span></dt>'));
  const index = indexTable(html);
  for (const [style, value, id] of [["top", "L", "ch-1"], ["low", "H", "ch-2"], ["mid", "M", "ch-3"]]) {
    assert.ok(index.includes(`<tr><td><span class="pri pri-${style}">${value}</span></td><td class="nw"><a href="#row-${id}">`), `index row ${id}`);
    assert.ok(rowSection(html, id).includes(`<header><span class="pri pri-${style}">${value}</span><h3>`), `row header ${id}`);
  }
  const one = renderHtml(priced(minimalDoc(), 0, "P"), suppliedTable(["P"]), template);
  assert.ok(one.includes('<dt><span class="pri pri-top">P</span></dt>'));
  assert.ok(indexTable(one).includes('<tr><td><span class="pri pri-top">P</span></td>'));
  assert.ok(rowSection(one, "ch-1").includes('<header><span class="pri pri-top">P</span><h3>'));
});

test("a supplied table's vocabulary values are escaped in every badge", () => {
  const html = renderHtml(priced(minimalDoc(), 0, vectors[0]), suppliedTable(vectors), template);
  for (const vector of vectors) {
    assert.ok(!html.includes(vector), `raw vector present: ${JSON.stringify(vector)}`);
    assert.ok(html.includes(`>${escapeHtml(vector)}</span>`), `no escaped badge for ${JSON.stringify(vector)}`);
  }
  // The row's value is printed four times: in the tile, the key, the index and the row header.
  assert.equal(occurrences(html, `<span class="pri pri-top">${escapeHtml(vectors[0])}</span>`), 4);
  assert.ok(!html.includes("<img"));
});

test("a post_priority does not move a row in the sort order", () => {
  const doc = golden();
  const ch3 = doc.chains.find((c) => c.id === "ch-3");
  assert.ok(ch3 && ch3.post_ratings, "ch-3 is the fixture's one post-action row");
  ch3.post_priority = computePriority(table, ch3.post_ratings);
  assert.deepEqual(sortChains(doc, table).map((c) => c.id), ["ch-2", "ch-1", "ch-5", "ch-7", "ch-4", "ch-8", "ch-6", "ch-3"]);
  ch3.post_priority = { value: table.vocabulary[0], table: table.id, rpn: 1000 };
  assert.deepEqual(sortChains(doc, table).map((c) => c.id), ["ch-2", "ch-1", "ch-5", "ch-7", "ch-4", "ch-8", "ch-6", "ch-3"], "the highest possible post-action priority still leaves ch-3 last");
});

test("the provenance appendix names the catalog row, its tag, and the record the tag carries", () => {
  const html = renderHtml(golden(), table, template);
  assert.ok(html.includes("<td><code>cat-service-01</code></td><td><code>cites:C036</code></td><td><code>C036</code></td>"));
  assert.ok(html.includes("<td><code>cat-service-02</code></td><td><code>adapted-from:C031</code></td><td><code>C031</code></td>"));
});

test("a skill-authored tag carries no record, so the record cell is an em dash", () => {
  const doc = minimalDoc();
  doc.chains[0].catalog_refs = [{ id: "cat-security_component-01", provenance: "skill-authored" }];
  const html = renderHtml(doc, table, template);
  assert.ok(html.includes("<td><code>cat-security_component-01</code></td><td><code>skill-authored</code></td><td>&mdash;</td>"));
});

test("injection vectors are escaped everywhere they are printed", () => {
  const html = renderHtml(poisonedDocument(), table, template);
  for (const vector of vectors) {
    assert.ok(!html.includes(vector), `raw vector present: ${JSON.stringify(vector)}`);
  }
  assert.ok(!html.includes("<img"), "an escaped vector still opened an img tag");
  assert.equal(html.split("<script").length - 1, 1, "an escaped vector still opened a script tag");
});

test("the embedded JSON block round-trips and holds no raw vector", () => {
  const doc = poisonedDocument();
  const block = dataBlock(renderHtml(doc, table, template));
  for (const vector of vectors) assert.ok(!block.includes(vector), `raw vector in the data block: ${JSON.stringify(vector)}`);
  for (const ch of ["<", ">", "&", "\u2028", "\u2029"]) assert.ok(!block.includes(ch), `unescaped ${JSON.stringify(ch)} in the data block`);
  assert.deepEqual(JSON.parse(block), doc);
});

test("the report loads nothing from the network and runs no script", () => {
  const doc = golden();
  const html = renderHtml(doc, table, template);
  assert.ok(!html.includes("<details"), "no <details> remains");
  assert.equal(occurrences(html, '<article class="row"'), doc.chains.length);
  assert.ok(!html.includes("<script src"));
  assert.ok(!html.includes("http://"));
  assert.ok(!html.includes("https://"));
  assert.equal(html.split("<script").length - 1, 1);
  assert.ok(html.includes('<script type="application/json" id="fmea-data">'));
});

test("the template carries print rules for landscape pages and page breaks", () => {
  assert.equal(template.split("@media print").length - 1, 1, "the template has one print block");
  const print = template.slice(template.indexOf("@media print {"), template.indexOf("</style>"));
  for (const rule of [
    "@page { size: landscape; margin: 12mm; }",
    "body { padding:0; font-size:11px; }",
    ".back { display:none; }",
    "h2, h3, article.row > header { break-after: avoid; }",
    "article.row, tr, .attn-item, .tiles, .key { break-inside: avoid; }",
    "thead { display: table-header-group; }",
    "a { color:inherit; text-decoration:none; }",
  ]) {
    assert.ok(print.includes(rule), `the print block is missing: ${rule}`);
  }
});

test("the template lets a long element id break inside the index", () => {
  assert.ok(template.includes("table.index code { overflow-wrap:anywhere; }"));
});

test("the template styles the stale notice and shrinks the post-action badge in a row header", () => {
  assert.ok(template.includes(".stale-notice { margin:0 0 .6rem; padding:.3rem .6rem; border-left:4px solid #d9a45b; background:#fff9ec; }"));
  assert.ok(template.includes("article.row > header .meta .pri { height:1.2rem; min-width:1.2rem; font-size:.75rem; }"));
});

test("the CLI writes the report and exits 0", () => {
  withTempDir((dir) => {
    const out = join(dir, "report.html");
    const r = runCli("render.ts", [fixturePath("checkout-service.fmea.json"), "--out", out]);
    assert.equal(r.status, 0);
    assert.equal(r.stderr, "");
    assert.ok(readFileSync(out, "utf8").includes('<span class="big">8 <small>of 27</small></span>'));
  });
});

test("a document with no computed block is refused at /computed with exit 2", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    const doc = golden();
    delete doc.computed;
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    const r = runCli("render.ts", [path, "--out", join(dir, "report.html")]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^error COMPUTED_MISSING: .* at \/computed$/m);
  });
});

test("an existing output needs --force", () => {
  withTempDir((dir) => {
    const out = join(dir, "report.html");
    writeFileSync(out, "old report\n");
    const refused = runCli("render.ts", [fixturePath("checkout-service.fmea.json"), "--out", out]);
    assert.equal(refused.status, 3);
    assert.match(refused.stderr, /^error IO_EXISTS: /m);
    assert.equal(readFileSync(out, "utf8"), "old report\n");
    const forced = runCli("render.ts", [fixturePath("checkout-service.fmea.json"), "--out", out, "--force"]);
    assert.equal(forced.status, 0);
    assert.ok(readFileSync(out, "utf8").includes('<span class="big">8 <small>of 27</small></span>'));
  });
});

test("the wrong extension on either side exits 1", () => {
  withTempDir((dir) => {
    const badIn = runCli("render.ts", ["analysis.txt", "--out", join(dir, "report.html")]);
    assert.equal(badIn.status, 1);
    assert.equal(badIn.stderr, "error USAGE: the analysis file must end in .json\n");
    const badOut = runCli("render.ts", [fixturePath("checkout-service.fmea.json"), "--out", join(dir, "report.txt")]);
    assert.equal(badOut.status, 1);
    assert.equal(badOut.stderr, "error USAGE: the report file must end in .html\n");
  });
});

test("a table whose id differs from the document's pin exits 2", () => {
  withTempDir((dir) => {
    const r = runCli("render.ts", [fixturePath("checkout-service.fmea.json"), "--out", join(dir, "report.html"), "--table-file", fixturePath("tables", "well-formed-alt.json")]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^error TABLE_ID_MISMATCH: priority-table-mismatch: meta\.scales\.priority_table is priority-fmea-software-v1 but the loaded table id is priority-alt-3band-v1 at \/meta\/scales\/priority_table$/m);
  });
});

test("a schema violation exits 2 with the same coded lines validate.ts prints", () => {
  withTempDir((dir) => {
    const path = join(dir, "analysis.json");
    const doc = golden() as unknown as Record<string, unknown>;
    delete (doc.meta as Record<string, unknown>).scope;
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    const r = runCli("render.ts", [path, "--out", join(dir, "report.html")]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^error SCHEMA: schema: missing required property "scope" at \/meta$/m);
  });
});

test("every slot in the template is filled", () => {
  const html = renderHtml(golden(), table, template);
  assert.equal(html.match(/<!--@[a-z-]+-->/g), null, "an unfilled slot remains in the report");
});

test("the structure tree and the actions table carry the document's rows", () => {
  const html = renderHtml(golden(), table, template);
  const structure = html.slice(html.indexOf('id="structure"'), html.indexOf('id="chains"'));
  assert.ok(structure.includes("<code>checkout</code>"), "the structure tree is missing the root element");
  assert.ok(structure.includes("<code>checkout.payment-gateway</code>"), "the structure tree is missing a child element");
  // A tree, not a bag: every element once, and a child inside its parent's nested list.
  for (const id of ["checkout", "checkout.api", "checkout.payment-gateway", "checkout.order-store", "checkout.session-auth", "pricing"]) {
    assert.equal(structure.split(`<code>${id}</code>`).length - 1, 1, `${id} is printed more than once`);
  }
  const root = structure.slice(structure.indexOf("<code>checkout</code>"), structure.indexOf("<code>pricing</code>"));
  const nested = root.indexOf('<ul class="tree">');
  assert.notEqual(nested, -1, "the root element opens no nested list");
  assert.ok(nested < root.indexOf("<code>checkout.payment-gateway</code>"), "a child element is emitted beside its parent, not under it");
  const actions = html.slice(html.indexOf('id="actions"'), html.indexOf('id="lints"'));
  assert.ok(actions.includes("<th>Status</th>"), "the actions table has no status column");
  assert.ok(actions.includes("<code>ch-3</code>"), "the actions table is missing ch-3's actions");
});

test("the actions table is in the order of section 5.2, open actions first and each row id a link", () => {
  const actions = sectionOf(renderHtml(golden(), table, template), "actions", "lints");
  assert.ok(actions.includes("<caption>Open actions first, by target date; closed actions last.</caption>"));
  assert.ok(actions.includes("<thead><tr><th>Target</th><th>Row</th><th>Action</th><th>Description</th><th>Owner</th><th>Status</th><th>Completed</th></tr></thead>"));
  const rows = [...actions.matchAll(/<td class="nw">([0-9-]+)<\/td><td><a href="#row-([^"]+)"><code>[^<]+<\/code><\/a><\/td><td><code>([^<]+)<\/code>/g)]
    .map((m) => `${m[1]} ${m[2]} ${m[3]}`);
  assert.deepEqual(rows, [
    "2026-10-09 ch-4 act-1", "2026-10-15 ch-1 act-1", "2026-10-16 ch-8 act-1", "2026-10-23 ch-6 act-1", "2026-10-30 ch-3 act-2",
    "2026-11-02 ch-2 act-1", "2026-11-06 ch-8 act-2", "2026-11-20 ch-7 act-1", "2026-08-14 ch-3 act-1",
  ]);
  assert.equal(occurrences(actions, '<tr class="done">'), 1);
  assert.ok(actions.includes('<tr class="done"><td class="nw">2026-08-14</td>'));
});

test("slot filling never re-expands a $ pattern from a field value", () => {
  const doc = minimalDoc();
  doc.meta.name = "Cost $& rises $1 and $` here";
  const html = renderHtml(doc, table, template);
  assert.ok(html.includes("<title>Cost $&amp; rises $1 and $` here</title>"), "a $ pattern in a field value was re-expanded by the slot filler");
});

test("the provenance appendix has a head row, and a chain named like a section keeps its own anchor", () => {
  const provenance = sectionOf(renderHtml(golden(), table, template), "provenance", "fmea-data");
  assert.ok(provenance.includes("<thead><tr><th>Row</th><th>Catalog row</th><th>Tag</th><th>Record</th></tr></thead><tbody>"));
  const doc = minimalDoc();
  doc.chains[0].id = "actions";
  const html = renderHtml(doc, table, template);
  assert.equal(occurrences(html, 'id="actions"'), 1);
  assert.equal(occurrences(html, 'id="row-actions"'), 1);
});

test("every href in the report resolves to exactly one id, and the actions, checks and provenance sections link every row id", () => {
  for (const doc of [golden(), staleRows()]) {
    const html = renderHtml(doc, table, template);
    const targets = new Set([...html.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]));
    assert.ok(targets.size > 0);
    for (const target of targets) assert.equal(occurrences(html, `id="${target}"`), 1, `#${target} does not resolve to exactly one id`);
    for (const [id, next] of LINKED_SECTIONS) {
      const part = sectionOf(html, id, next);
      for (const m of part.matchAll(/<code>(ch-[^<]*)<\/code>/g)) {
        assert.ok(part.slice(0, m.index).endsWith(`<a href="#row-${m[1]}">`), `${m[1]} is printed without a link in #${id}`);
      }
    }
  }
});

test("a chain id holding an injection vector is escaped in the row's id and in every href that targets it", () => {
  const vector = 'ch-1"><img src=x onerror=alert(1)>';
  const doc = withComputed(minimalDoc(), [{ rule: "detection-1-without-evidenced-control", severity: "blocker", pointer: "/chains/0/ratings/D", message: "Detection is 1" }]);
  doc.chains[0].id = vector;
  doc.chains[0].actions = [{ id: "act-1", description: "add alerting", owner: "T. Tester", status: "Open", target_date: "2026-10-01" }];
  doc.chains[0].catalog_refs = [{ id: "cat-service-01", provenance: "cites:C036" }];
  const html = renderHtml(doc, table, template);
  const escaped = escapeHtml(vector);
  assert.ok(!html.includes("<img"), "the vector opened a tag");
  assert.equal(occurrences(html, `id="row-${escaped}"`), 1);
  const rowTargets = [...html.matchAll(/href="#(row-[^"]*)"/g)].map((m) => m[1]);
  assert.ok(rowTargets.length > 0);
  for (const target of rowTargets) assert.equal(target, `row-${escaped}`);
  for (const [id, next] of LINKED_SECTIONS) {
    assert.ok(sectionOf(html, id, next).includes(`href="#row-${escaped}"`), `#${id} does not link the row`);
  }
});
