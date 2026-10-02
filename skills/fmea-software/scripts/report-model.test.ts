import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportModel, sortChains } from "./lib/report-model.ts";
import { sortChains as renderSortChains } from "./render.ts";
import { loadTable } from "./lib/table.ts";
import type { PriorityTable } from "./lib/table.ts";
import { clone, loadFixture, minimalDoc, rating } from "./test-helpers.ts";
import type { Action, ActionStatus, Chain, FmeaDocument, Lint, Severity } from "./lib/types.ts";

const table = loadTable();
const fixture = (): FmeaDocument => loadFixture<FmeaDocument>("checkout-service.fmea.json");
const modelOf = (doc: FmeaDocument) => buildReportModel(doc, table);
const withVocabulary = (vocabulary: string[]): PriorityTable => ({ ...table, vocabulary });

function action(id: string, status: ActionStatus, target_date: string): Action {
  return { id, description: "test action", owner: "T. Tester", status, target_date };
}

function withComputed(doc: FmeaDocument, lints: Lint[], quality_score = 0): FmeaDocument {
  doc.computed = { quality_score, lints, validated_at: "2026-10-02T00:00:00Z", validator_version: "0.1.0" };
  return doc;
}

/** minimalDoc() with one chain per patch: the minimal chain under the ids ch-1, ch-2, … unless a
 *  patch sets one. Every such chain is priority M with S 8, so the index order is the id order. */
function docOf(...patches: Partial<Chain>[]): FmeaDocument {
  const doc = minimalDoc();
  const base = doc.chains[0];
  doc.chains = patches.map((p, i) => ({ ...clone(base), id: `ch-${i + 1}`, ...p }));
  return doc;
}

const chainsWithPriorities = (values: string[]): FmeaDocument =>
  docOf(...values.map((value) => ({ priority: { value, table: table.id, rpn: 96 } })));

test("sortChains, moved to the model, sorts the checkout fixture and is the function render.ts exports", () => {
  assert.deepEqual(sortChains(fixture(), table).map((c) => c.id), ["ch-2", "ch-1", "ch-5", "ch-7", "ch-4", "ch-8", "ch-6", "ch-3"]);
  assert.equal(renderSortChains, sortChains);
});

test("the tiles for the checkout fixture", () => {
  assert.deepEqual(modelOf(fixture()).tiles, {
    priorities: [{ value: "H", style: "top", count: 4 }, { value: "M", style: "mid", count: 4 }, { value: "L", style: "low", count: 0 }],
    chainsLine: "8 failure chains",
    ratings: { provisional: 8, total: 27, line: "provisional, in 3 rows" },
    checks: { blockers: "1 blocker", warnings: "10 warnings", alert: true },
    actions: { headline: "8 open", of: "of 9", line: "next due 2026-10-09" },
    qualityScore: 88,
  });
});

test("a value's badge style follows its rank in the loaded vocabulary", () => {
  assert.deepEqual(modelOf(minimalDoc()).vocabulary, [{ value: "H", style: "top" }, { value: "M", style: "mid" }, { value: "L", style: "low" }]);
  assert.deepEqual(buildReportModel(minimalDoc(), withVocabulary(["P"])).vocabulary, [{ value: "P", style: "top" }]);
  assert.deepEqual(buildReportModel(minimalDoc(), withVocabulary(["A", "B"])).vocabulary, [{ value: "A", style: "top" }, { value: "B", style: "low" }]);
  assert.deepEqual(buildReportModel(minimalDoc(), withVocabulary(["1", "2", "3", "4"])).vocabulary.map((v) => v.style), ["top", "mid", "mid", "low"]);
});

test("a one-row document takes the singular forms", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.O = rating(3, "provisional");
  doc.chains[0].actions = [action("act-1", "Open", "2026-10-01")];
  withComputed(doc, [
    { rule: "test-blocker", severity: "blocker", pointer: "/chains/0/ratings/D", message: "a blocker" },
    { rule: "test-warning", severity: "warning", pointer: "/chains/0", message: "a warning" },
  ], 0);
  assert.deepEqual(modelOf(doc).tiles, {
    priorities: [{ value: "H", style: "top", count: 0 }, { value: "M", style: "mid", count: 1 }, { value: "L", style: "low", count: 0 }],
    chainsLine: "1 failure chain",
    ratings: { provisional: 1, total: 3, line: "provisional, in 1 row" },
    checks: { blockers: "1 blocker", warnings: "1 warning", alert: true },
    actions: { headline: "1 open", of: "of 1", line: "next due 2026-10-01" },
    qualityScore: 0,
  });
});

test("the Actions tile reads none without an action, and all closed when no action is open", () => {
  const doc = minimalDoc();
  const none = modelOf(doc).tiles;
  assert.deepEqual(none.actions, { headline: "none", of: null, line: null });
  assert.deepEqual(none.ratings, { provisional: 0, total: 3, line: "all reviewed" });
  assert.deepEqual(none.checks, { blockers: "0 blockers", warnings: "0 warnings", alert: false });
  assert.equal(none.qualityScore, null, "a document without computed has no score");
  doc.chains[0].actions = [action("act-1", "Completed", "2026-08-01"), action("act-2", "Not Implemented", "2026-08-02")];
  assert.deepEqual(modelOf(doc).tiles.actions, { headline: "0 open", of: "of 2", line: "all closed" });
});

test("a priority value outside the vocabulary is counted after it, in order of first appearance, and sorts last", () => {
  const doc = chainsWithPriorities(["Z", "M", "Z", "Y"]);
  assert.deepEqual(modelOf(doc).tiles.priorities, [
    { value: "H", style: "top", count: 0 },
    { value: "M", style: "mid", count: 1 },
    { value: "L", style: "low", count: 0 },
    { value: "Z", style: "low", count: 2 },
    { value: "Y", style: "low", count: 1 },
  ]);
  assert.deepEqual(sortChains(doc, table).map((c) => c.id), ["ch-2", "ch-1", "ch-3", "ch-4"]);
});

test("a document with no chains shows zeros on every tile and none on the Actions tile", () => {
  const doc = withComputed(chainsWithPriorities([]), [
    { rule: "metadata-without-ground-rules", severity: "blocker", pointer: "/meta/ground_rules", message: "the document records no ground rules" },
    { rule: "metadata-without-ground-rules", severity: "blocker", pointer: "/meta/assumptions", message: "the document records no assumptions" },
  ], 0);
  assert.deepEqual(modelOf(doc).tiles, {
    priorities: [{ value: "H", style: "top", count: 0 }, { value: "M", style: "mid", count: 0 }, { value: "L", style: "low", count: 0 }],
    chainsLine: "0 failure chains",
    ratings: { provisional: 0, total: 0, line: "all reviewed" },
    checks: { blockers: "2 blockers", warnings: "0 warnings", alert: true },
    actions: { headline: "none", of: null, line: null },
    qualityScore: 0,
  });
});

// A finding for a built document. The message defaults to the pointer, so that findings which
// differ in pointer fall into groups of their own.
const finding = (pointer: string, severity: Severity = "warning", rule = "test-rule", message = pointer): Lint =>
  ({ rule, severity, pointer, message });

const PROVISIONAL = "The rating is still provisional and needs re-scoring";

test("a finding is a row, unknown-row or document finding by its chain index", () => {
  const doc = withComputed(minimalDoc(), ["/chains/0/ratings/S", "/chains/1/ratings/D", "/meta/ground_rules", "/chains", ""].map((p) => finding(p)));
  assert.deepEqual(modelOf(doc).groups.map((g) => g.locations), [
    [{ kind: "row", chainId: "ch-1", labels: [{ text: "S", raw: false }] }],
    [{ kind: "unknown-row", pointer: "/chains/1/ratings/D" }],
    [{ kind: "document", pointer: "/meta/ground_rules" }],
    [{ kind: "document", pointer: "/chains" }],
    [{ kind: "document", pointer: "" }],
  ]);
});

test("a row finding is labelled by where its pointer lies within the row", () => {
  const doc = minimalDoc();
  doc.chains[0].actions = [action("act-7", "Open", "2026-10-09")];
  const pointers = ["/chains/0", "/chains/0/ratings/O", "/chains/0/post_ratings/D", "/chains/0/actions/0",
    "/chains/0/actions/1", "/chains/0/ratings/S/review", "/chains/0/causes/0/text"];
  assert.deepEqual(modelOf(withComputed(doc, pointers.map((p) => finding(p)))).groups.map((g) => g.locations), [
    [{ kind: "row", chainId: "ch-1", labels: [] }],
    [{ kind: "row", chainId: "ch-1", labels: [{ text: "O", raw: false }] }],
    [{ kind: "row", chainId: "ch-1", labels: [{ text: "post-action D", raw: false }] }],
    [{ kind: "row", chainId: "ch-1", labels: [{ text: "act-7", raw: false }] }],
    [{ kind: "row", chainId: "ch-1", labels: [{ text: "/actions/1", raw: true }] }],
    [{ kind: "row", chainId: "ch-1", labels: [{ text: "/ratings/S/review", raw: true }] }],
    [{ kind: "row", chainId: "ch-1", labels: [{ text: "/causes/0/text", raw: true }] }],
  ]);
});

test("the fixture's findings form four groups, blockers first, rating-provisional as one group over three rows", () => {
  const S = { text: "S", raw: false };
  const O = { text: "O", raw: false };
  const D = { text: "D", raw: false };
  assert.deepEqual(modelOf(fixture()).groups, [
    { severity: "blocker", rule: "detection-1-without-evidenced-control", message: "Detection is 1 with no existing detection control carrying evidence",
      count: 1, locations: [{ kind: "row", chainId: "ch-7", labels: [D] }] },
    { severity: "warning", rule: "occurrence-estimate-without-trigger", message: "Occurrence is 7 or more on an estimate with no trigger recorded",
      count: 1, locations: [{ kind: "row", chainId: "ch-6", labels: [O] }] },
    { severity: "warning", rule: "rating-provisional", message: PROVISIONAL, count: 8, locations: [
      { kind: "row", chainId: "ch-2", labels: [S, O, D] },
      { kind: "row", chainId: "ch-4", labels: [O, D] },
      { kind: "row", chainId: "ch-8", labels: [S, O, D] },
    ] },
    { severity: "warning", rule: "seeded-action-without-incident", message: "action on a chain seeded from INC-2026-0314 carries no source_incident",
      count: 1, locations: [{ kind: "row", chainId: "ch-8", labels: [{ text: "act-2", raw: false }] }] },
  ]);
});

test("a group's locations: rows by first appearance, factor labels in factor order, then unknown rows, then the document", () => {
  const m = (pointer: string, severity: Severity = "warning"): Lint => finding(pointer, severity, "r", "m");
  const doc = withComputed(docOf({}, { id: "ch-0", failure_mode: "second" }), [
    m("/chains/0/post_ratings/S"), m("/chains/1/ratings/S"), m("/chains/0/causes/0"), m("/meta/x"), m("/chains/5"),
    m("/chains/0/ratings/D"), m("/chains/0/ratings/S"), m("/chains/0", "blocker"), finding("/chains/1", "warning", "r", "other"),
  ]);
  assert.deepEqual(modelOf(doc).groups, [
    { severity: "blocker", rule: "r", message: "m", count: 1, locations: [{ kind: "row", chainId: "ch-1", labels: [] }] },
    { severity: "warning", rule: "r", message: "m", count: 7, locations: [
      { kind: "row", chainId: "ch-1", labels: [
        { text: "S", raw: false }, { text: "D", raw: false }, { text: "post-action S", raw: false }, { text: "/causes/0", raw: true },
      ] },
      { kind: "row", chainId: "ch-0", labels: [{ text: "S", raw: false }] },
      { kind: "unknown-row", pointer: "/chains/5" },
      { kind: "document", pointer: "/meta/x" },
    ] },
    { severity: "warning", rule: "r", message: "other", count: 1, locations: [{ kind: "row", chainId: "ch-0", labels: [] }] },
  ]);
});

test("the fixture's rows carry their element, statement and badge styles in the index order", () => {
  const doc = fixture();
  const rows = modelOf(doc).rows;
  assert.deepEqual(rows.map((r) => [r.chain.id, r.element, r.style, r.postStyle]), [
    ["ch-2", "checkout", "top", null],
    ["ch-1", "checkout.payment-gateway", "top", null],
    ["ch-5", "checkout.session-auth", "top", null],
    ["ch-7", "checkout", "top", null],
    ["ch-4", "checkout.order-store", "mid", null],
    ["ch-8", "checkout.payment-gateway", "mid", null],
    ["ch-6", "checkout.api", "mid", null],
    ["ch-3", "pricing", "mid", "mid"],
  ]);
  assert.equal(rows[0].statement, doc.functions.find((f) => f.id === "fn-checkout-order")?.statement);
});

test("the fixture's row marks: provisional on ch-2, ch-4, ch-8, handoff on ch-5, blocker on ch-7", () => {
  assert.deepEqual(modelOf(fixture()).rows.map((r) => [r.chain.id, r.marks]), [
    ["ch-2", ["provisional"]], ["ch-1", []], ["ch-5", ["handoff"]], ["ch-7", ["blocker"]],
    ["ch-4", ["provisional"]], ["ch-8", ["provisional"]], ["ch-6", []], ["ch-3", []],
  ]);
});

test("the fixture's row findings leave out rating-provisional", () => {
  const rows = modelOf(fixture()).rows.filter((r) => r.findings.length > 0);
  assert.deepEqual(rows.map((r) => [r.chain.id, r.findings]), [
    ["ch-7", [{ severity: "blocker", rule: "detection-1-without-evidenced-control", message: "Detection is 1 with no existing detection control carrying evidence",
      where: { kind: "row", chainId: "ch-7", label: "D", raw: false } }]],
    ["ch-8", [{ severity: "warning", rule: "seeded-action-without-incident", message: "action on a chain seeded from INC-2026-0314 carries no source_incident",
      where: { kind: "row", chainId: "ch-8", label: "act-2", raw: false } }]],
    ["ch-6", [{ severity: "warning", rule: "occurrence-estimate-without-trigger", message: "Occurrence is 7 or more on an estimate with no trigger recorded",
      where: { kind: "row", chainId: "ch-6", label: "O", raw: false } }]],
  ]);
});

test("a row's marks come in the order stale, handoff, provisional, blocker", () => {
  const doc = minimalDoc();
  const chain = doc.chains[0];
  chain.stale = { flag: true, reason: "element-changed", since_version: 1 };
  chain.handoff = { to: "threat-model", reason: "an attacker", adversary_cause: "process crash" };
  chain.post_ratings = { S: rating(8), O: rating(2, "provisional"), D: rating(4) };
  assert.deepEqual(modelOf(withComputed(doc, [finding("/chains/0/ratings/D", "blocker")])).rows[0].marks,
    ["stale", "handoff", "provisional", "blocker"]);
});

test("only a blocker that points into the row marks it", () => {
  const doc = withComputed(minimalDoc(), [finding("/chains/0"), finding("/meta/ground_rules", "blocker"), finding("/chains/3", "blocker")]);
  assert.deepEqual(modelOf(doc).rows[0].marks, []);
});

test("a row's findings are blockers first, then the order of computed.lints, without rating-provisional", () => {
  const doc = withComputed(minimalDoc(), [
    finding("/chains/0/ratings/O"), finding("/chains/0/ratings/S", "warning", "rating-provisional", PROVISIONAL),
    finding("/chains/0/ratings/D", "blocker"), finding("/chains/0"),
  ]);
  assert.deepEqual(modelOf(doc).rows[0].findings.map((f) => [f.severity, f.where]), [
    ["blocker", { kind: "row", chainId: "ch-1", label: "D", raw: false }],
    ["warning", { kind: "row", chainId: "ch-1", label: "O", raw: false }],
    ["warning", { kind: "row", chainId: "ch-1", label: null, raw: false }],
  ]);
});

test("a chain whose function is missing has an empty element and statement", () => {
  const doc = minimalDoc();
  doc.chains[0].function = "fn-missing";
  const row = modelOf(doc).rows[0];
  assert.deepEqual([row.element, row.statement], ["", ""]);
});

test("two chains with the same id keep their own marks, findings and locations", () => {
  const model = modelOf(withComputed(docOf({}, { id: "ch-1", failure_mode: "second" }), [finding("/chains/1/ratings/D", "blocker")]));
  assert.deepEqual(model.rows.map((r) => [r.chain.failure_mode, r.marks, r.findings.length]), [
    ["stops serving", [], 0],
    ["second", ["blocker"], 1],
  ]);
  assert.deepEqual(model.groups[0].locations, [{ kind: "row", chainId: "ch-1", labels: [{ text: "D", raw: false }] }]);
});

test("actions: the fixture's nine actions, open by target date, then the closed one", () => {
  const rows = modelOf(fixture()).actions;
  assert.deepEqual(rows.map((r) => `${r.chainId} ${r.action.id} ${r.action.target_date}`), [
    "ch-4 act-1 2026-10-09", "ch-1 act-1 2026-10-15", "ch-8 act-1 2026-10-16", "ch-6 act-1 2026-10-23",
    "ch-3 act-2 2026-10-30", "ch-2 act-1 2026-11-02", "ch-8 act-2 2026-11-06", "ch-7 act-1 2026-11-20",
    "ch-3 act-1 2026-08-14",
  ]);
  assert.deepEqual(rows.map((r) => r.open), [true, true, true, true, true, true, true, true, false]);
});

test("actions: ties keep document order, and both closed statuses go last", () => {
  const doc = docOf(
    { id: "ch-9", actions: [action("a1", "Completed", "2026-10-01"), action("a2", "Open", "2026-10-10"), action("a3", "Not Implemented", "2026-09-01"), action("a4", "Implementation pending", "2026-10-10")] },
    { id: "ch-1", actions: [action("b1", "Decision pending", "2026-10-10"), action("b2", "Open", "2026-10-05"), action("b3", "Completed", "2026-09-01")] },
  );
  assert.deepEqual(modelOf(doc).actions.map((r) => `${r.chainId} ${r.action.id} ${r.open ? "open" : "closed"}`), [
    "ch-1 b2 open", "ch-9 a2 open", "ch-9 a4 open", "ch-1 b1 open",
    "ch-9 a3 closed", "ch-1 b3 closed", "ch-9 a1 closed",
  ]);
});
