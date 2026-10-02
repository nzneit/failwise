import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_PATH, renderHtml, sortChains } from "./render.ts";
import { escapeHtml } from "./lib/escape.ts";
import { computePriority, loadTable } from "./lib/table.ts";
import { fixturePath, loadFixture, minimalDoc, rating, runCli, withTempDir } from "./test-helpers.ts";
import type { FmeaDocument, Lint } from "./lib/types.ts";

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

test("the ground-rules, assumptions, review-record and lint sections carry the document's content", () => {
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

  const lints = section("lints", "provenance");
  assert.ok(lints.includes("<strong>Quality score: 88</strong>"), "the lint section is missing the quality score");
  // The caption states both of `lib/quality.ts`'s rules, so a reader can reconcile a printed 0 with
  // a lint table whose blockers all point outside `chains[]` (added 2026-09-11 after the Task 33
  // correction review; the caption stopped at "the share of chain rows with no blocker lint").
  assert.ok(
    lints.includes(
      '<span class="empty">(the share of chain rows with no blocker lint, or 0 when a blocker sits outside the chain rows; the weighting is the skill\'s own)</span>',
    ),
    "the lint section's caption does not state the rule the printed score follows",
  );
  assert.equal(count(lints, "<tr>"), doc.computed!.lints.length + 1);
  assert.ok(
    lints.includes('<td><code>detection-1-without-evidenced-control</code></td><td class="sev-blocker">blocker</td>'),
    "the lint table is missing the blocker row",
  );
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
    html.includes('<td><code>ch-1</code><span class="mark mark-provisional">provisional</span></td>'),
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
  const html = renderHtml(golden(), table, template);
  const count = (needle: string): number => occurrences(sectionOf(html, "chains", "actions"), needle);
  assert.equal(count('class="mark mark-handoff"'), 1);
  assert.equal(count('class="mark mark-provisional"'), 3);
  assert.equal(count('class="mark mark-stale"'), 0);
});

test("a flagged row carries the stale mark; a cleared row carries none", () => {
  const html = renderHtml(staleRows(), table, template);
  const count = (needle: string): number => occurrences(sectionOf(html, "chains", "actions"), needle);
  assert.equal(count('class="mark mark-stale"'), 2);
  assert.ok(html.includes('<td><code>ch-1</code><span class="mark mark-stale">stale</span><span class="mark mark-provisional">provisional</span></td>'), "ch-1 is flagged scales-version with three provisional ratings");
  assert.ok(html.includes('<td><code>ch-2</code><span class="mark mark-stale">stale</span></td>'), "ch-2 is flagged element-changed and fully re-scored");
  assert.ok(html.includes("<td><code>ch-3</code></td>"), "ch-3 had its flag cleared and carries no mark");
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
  assert.ok(html.includes("<caption>Rows are sorted by the pre-action priority, then by severity; a row keeps its place after actions.</caption>"));
});

test("an expanded row shows the post-action priority letter and RPN in its post-action ratings block", () => {
  const doc = minimalDoc();
  doc.chains[0].actions = [{ id: "act-1", description: "add a retry", owner: "T. Tester", status: "Completed", target_date: "2026-08-01", completed_date: "2026-08-15" }];
  doc.chains[0].post_ratings = { S: rating(4), O: rating(3), D: rating(2) };
  doc.chains[0].post_priority = computePriority(table, doc.chains[0].post_ratings);
  const html = renderHtml(doc, table, template);
  assert.ok(html.includes("<h3>Post-action ratings</h3><p>Priority M &mdash; RPN 24</p><table>"), "the post-action block leads with the post-action priority");
  assert.ok(html.includes("<h3>Ratings</h3><table>"), "the pre-action block carries no such line");
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
  assert.equal(html.split("<details>").length - 1, doc.chains.length);
  assert.ok(html.includes("<summary>Row detail for ch-1</summary>"));
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

test("slot filling never re-expands a $ pattern from a field value", () => {
  const doc = minimalDoc();
  doc.meta.name = "Cost $& rises $1 and $` here";
  const html = renderHtml(doc, table, template);
  assert.ok(html.includes("<title>Cost $&amp; rises $1 and $` here</title>"), "a $ pattern in a field value was re-expanded by the slot filler");
});
