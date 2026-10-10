import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportModel, sortChains } from "./lib/report-model.ts";
import { sortChains as renderSortChains } from "./render.ts";
import { computePriority, loadTable } from "./lib/table.ts";
import type { PriorityTable } from "./lib/table.ts";
import { clone, edge, graphDoc, loadFixture, minimalDoc, rating, withoutTracker } from "./test-helpers.ts";
import type { Action, ActionStatus, Chain, Codebase, FmeaDocument, Lint, Severity, TrackerLink } from "./lib/types.ts";

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
  assert.deepEqual(sortChains(fixture(), table).map((c) => c.id), ["ch-2", "ch-1", "ch-5", "ch-7", "ch-9", "ch-4", "ch-8", "ch-6", "ch-3"]);
  assert.equal(renderSortChains, sortChains);
});

test("the tiles for the checkout fixture", () => {
  assert.deepEqual(modelOf(fixture()).tiles, {
    priorities: [{ value: "H", style: "top", count: 5 }, { value: "M", style: "mid", count: 4 }, { value: "L", style: "low", count: 0 }],
    chainsLine: "9 failure chains",
    ratings: { provisional: 11, total: 30, line: "provisional, in 4 rows" },
    checks: { blockers: "1 blocker", warnings: "13 warnings", alert: true },
    actions: { headline: "8 open", of: "of 9", line: "next due 2026-10-09" },
    qualityScore: 89,
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

function rowById(model: ReturnType<typeof buildReportModel>, id: string) {
  const row = model.rows.find((r) => r.chain.id === id);
  assert.ok(row, `no row ${id}`);
  return row;
}

const attentionOf = (doc: FmeaDocument) => modelOf(doc).attention;

// update/stale-rows.fmea.json has no priority blocks and no computed block. render.test.ts's
// staleRows() cannot be imported from a test file, so this helper fills the priorities the same way.
// Index order: ch-4 (H), then ch-1, ch-3, ch-2, ch-5 (M, by S 8, 7, 5, 4).
function staleFixture(): FmeaDocument {
  const doc = loadFixture<FmeaDocument>("update", "stale-rows.fmea.json");
  for (const chain of doc.chains) chain.priority = computePriority(table, chain.ratings);
  return doc;
}

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

test("the fixture's findings form four groups, blockers first, rating-provisional as one group over four rows", () => {
  const S = { text: "S", raw: false };
  const O = { text: "O", raw: false };
  const D = { text: "D", raw: false };
  assert.deepEqual(modelOf(fixture()).groups, [
    { severity: "blocker", rule: "detection-1-without-evidenced-control", message: "Detection is 1 with no existing detection control carrying evidence",
      count: 1, locations: [{ kind: "row", chainId: "ch-7", labels: [D] }] },
    { severity: "warning", rule: "occurrence-estimate-without-trigger", message: "Occurrence is 7 or more on an estimate with no trigger recorded",
      count: 1, locations: [{ kind: "row", chainId: "ch-6", labels: [O] }] },
    { severity: "warning", rule: "rating-provisional", message: PROVISIONAL, count: 11, locations: [
      { kind: "row", chainId: "ch-2", labels: [S, O, D] },
      { kind: "row", chainId: "ch-4", labels: [O, D] },
      { kind: "row", chainId: "ch-8", labels: [S, O, D] },
      { kind: "row", chainId: "ch-9", labels: [S, O, D] },
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
    ["ch-9", "checkout", "top", null],
    ["ch-4", "checkout.order-store", "mid", null],
    ["ch-8", "checkout.payment-gateway", "mid", null],
    ["ch-6", "checkout.api", "mid", null],
    ["ch-3", "pricing", "mid", "mid"],
  ]);
  assert.equal(rows[0].statement, doc.functions.find((f) => f.id === "fn-checkout-order")?.statement);
});

test("the fixture's row marks: provisional on ch-2, ch-9, ch-4, ch-8, handoff on ch-5, blocker on ch-7", () => {
  assert.deepEqual(modelOf(fixture()).rows.map((r) => [r.chain.id, r.marks]), [
    ["ch-2", ["provisional"]], ["ch-1", []], ["ch-5", ["handoff"]], ["ch-7", ["blocker"]], ["ch-9", ["provisional"]],
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

test("actions cell: the fixture's open, open-of-total and none forms, each with its earliest open date", () => {
  const model = modelOf(fixture());
  assert.deepEqual(rowById(model, "ch-1").actionsCell, { text: "1 open", due: "2026-10-15" });
  assert.deepEqual(rowById(model, "ch-3").actionsCell, { text: "1 open of 2", due: "2026-10-30" });
  assert.deepEqual(rowById(model, "ch-8").actionsCell, { text: "2 open", due: "2026-10-16" });
  assert.deepEqual(rowById(model, "ch-5").actionsCell, { text: "none", due: null });
});

test("actions cell: all actions closed reads all T closed with no date; due is the earliest, not the first", () => {
  const model = modelOf(docOf(
    { actions: [action("a1", "Completed", "2026-09-01"), action("a2", "Not Implemented", "2026-08-01")] },
    { actions: [action("b1", "Open", "2026-11-01"), action("b2", "Decision pending", "2026-10-01")] },
  ));
  assert.deepEqual(rowById(model, "ch-1").actionsCell, { text: "all 2 closed", due: null });
  assert.deepEqual(rowById(model, "ch-2").actionsCell, { text: "2 open", due: "2026-10-01" });
});

test("trigger: the fixture's ch-2 trigger restates its first cause, ch-1's stands alone, ch-4 has none", () => {
  const model = modelOf(fixture());
  const pick = (id: string) => { const r = rowById(model, id); return { trigger: r.trigger, triggerCauses: r.triggerCauses }; };
  assert.deepEqual(pick("ch-2"), { trigger: null, triggerCauses: [0] });
  assert.deepEqual(pick("ch-1"), { trigger: "A promotion drives submissions above the merchant's authorized rate at the gateway", triggerCauses: [] });
  assert.deepEqual(pick("ch-4"), { trigger: null, triggerCauses: [] });
});

test("trigger: equal to two causes after trimming, empty after trimming, and trimmed when it stands alone", () => {
  const model = modelOf(docOf(
    { trigger: " queue fills\n", causes: [{ text: "queue fills " }, { text: "no admission control" }, { text: "\tqueue fills" }] },
    { trigger: "   ", causes: [{ text: " " }, { text: "process crash" }] },
    { trigger: "  a burst of traffic  ", causes: [{ text: "process crash" }] },
  ));
  assert.deepEqual(model.rows.map((r) => [r.chain.id, r.trigger, r.triggerCauses]), [
    ["ch-1", null, [0, 2]],
    ["ch-2", null, []],
    ["ch-3", "a burst of traffic", []],
  ]);
});

test("stale notice: the four reasons in words", () => {
  const model = modelOf(docOf(
    { stale: { flag: true, reason: "element-changed", since_version: 2 } },
    { stale: { flag: true, reason: "function-changed", since_version: 3 } },
    { stale: { flag: true, reason: "control-removed", since_version: 2 } },
    { stale: { flag: true, reason: "scales-version", since_version: 2 } },
  ));
  assert.deepEqual(model.rows.map((r) => r.staleNotice), [
    "Stale since version 2: its element changed.",
    "Stale since version 3: its function changed.",
    "Stale since version 2: a control it relied on was removed.",
    "Stale since version 2: the scales changed.",
  ]);
});

test("stale notice: without since_version, without reason, without either, and on a row that is not stale", () => {
  const model = modelOf(docOf(
    { stale: { flag: true, reason: "control-removed" } },
    { stale: { flag: true, since_version: 2 } },
    { stale: { flag: true } },
    { stale: { flag: false } },
  ));
  assert.deepEqual(model.rows.map((r) => r.staleNotice), [
    "Stale: a control it relied on was removed.",
    "Stale since version 2.",
    "Stale.",
    null,
  ]);
  assert.ok(modelOf(fixture()).rows.every((r) => r.staleNotice === null));
});

test("attention: a document with nothing to list has every item left out", () => {
  assert.deepEqual(attentionOf(minimalDoc()), { blockers: null, stale: null, provisional: null, handoffs: null, nextActions: [] });
});

test("attention: stale rows in index order with their reasons in words", () => {
  const doc = staleFixture();
  doc.chains[3].stale = { flag: true };   // ch-4: first in the index, no reason
  assert.deepEqual(attentionOf(doc).stale, {
    label: "3 rows due to be rated again",
    rows: [
      { chainId: "ch-4", reason: null },
      { chainId: "ch-1", reason: "its element changed" },
      { chainId: "ch-2", reason: "the scales changed" },
    ],
  });
  doc.chains[1].stale = { flag: false };
  doc.chains[3].stale = { flag: false };
  assert.equal(attentionOf(doc).stale?.label, "1 row due to be rated again");
});

test("attention: handoff rows in index order with their failure modes", () => {
  const doc = withComputed(docOf({ id: "ch-2" }, { id: "ch-1" }), []);
  doc.chains.forEach((c, i) => {
    c.handoff = { to: "threat-model", reason: "an attacker", adversary_cause: "process crash" };
    c.failure_mode = `mode ${i}`;
  });
  assert.deepEqual(attentionOf(doc).handoffs, {
    label: "2 rows passed to threat modelling",
    rows: [{ chainId: "ch-1", failureMode: "mode 1" }, { chainId: "ch-2", failureMode: "mode 0" }],
  });
});

test("attention: next actions due are the three earliest open actions", () => {
  const checkout = attentionOf(fixture());
  assert.deepEqual(
    checkout.nextActions.map((r) => [r.action.target_date, r.chainId, r.action.id, r.action.owner, r.open]),
    [["2026-10-09", "ch-4", "act-1", "Platform team", true], ["2026-10-15", "ch-1", "act-1", "Payments team", true], ["2026-10-16", "ch-8", "act-1", "Payments team", true]],
  );
  const doc = minimalDoc();
  doc.chains[0].actions = (["Completed", "Not Implemented", "Decision pending"] as const)
    .map((status, j) => action(`act-${j + 1}`, status, `2026-08-0${j + 1}`));
  assert.deepEqual(attentionOf(doc).nextActions.map((r) => r.action.id), ["act-3"]);
  doc.chains[0].actions.pop();
  assert.deepEqual(attentionOf(doc).nextActions, []);
});

test("attention: provisional rows list their factors, pre-action before post-action", () => {
  const one = minimalDoc();
  one.chains[0].ratings.D = rating(4, "provisional");
  assert.deepEqual(attentionOf(one).provisional, { label: "1 rating not yet reviewed", rows: [{ chainId: "ch-1", factors: ["D"] }] });

  const post = minimalDoc();
  post.chains[0].ratings.O = rating(3, "provisional");
  post.chains[0].post_ratings = { S: rating(4, "provisional"), O: rating(3), D: rating(2, "provisional") };
  assert.deepEqual(attentionOf(post).provisional, {
    label: "3 ratings not yet reviewed",
    rows: [{ chainId: "ch-1", factors: ["O", "post-action S", "post-action D"] }],
  });

  const two = withComputed(docOf({ id: "ch-2" }, { id: "ch-1" }), []);
  two.chains[0].ratings.S = rating(8, "provisional");
  two.chains[1].ratings.D = rating(4, "provisional");
  assert.deepEqual(attentionOf(two).provisional, {
    label: "2 ratings not yet reviewed",
    rows: [{ chainId: "ch-1", factors: ["D"] }, { chainId: "ch-2", factors: ["S"] }],
  });
});

test("attention: the blocker label follows the blocker-label table", () => {
  const cases: [string[], string][] = [
    [["/chains/0/ratings/D"], "1 row fails an automated check"],
    [["/chains/0/ratings/S", "/chains/0/ratings/D", "/chains/1"], "2 rows fail an automated check"],
    [["/chains/0", "/meta/ground_rules"], "1 row and the document fail an automated check"],
    [["/chains/1", "/chains/0", ""], "2 rows and the document fail an automated check"],
    [["/meta/assumptions"], "The document fails an automated check"],
    [["/chains/9", "/meta/assumptions"], "The document fails an automated check"],
    [["/chains/9", "/chains/2"], "An automated check fails"],
  ];
  for (const [pointers, label] of cases) {
    const doc = withComputed(docOf({}, {}), pointers.map((p) => finding(p, "blocker")));
    assert.equal(attentionOf(doc).blockers?.label, label, pointers.join(" "));
  }
  assert.equal(attentionOf(withComputed(docOf({}), [finding("/chains/0", "warning")])).blockers, null);
});

test("attention: blocker lines are row findings by index order, then unknown-row, then document", () => {
  // Positions: /chains/0 is ch-2, /chains/1 is ch-1, and the index order is ch-1, ch-2.
  const doc = withComputed(docOf({ id: "ch-2" }, { id: "ch-1" }), [
    finding("/meta/ground_rules", "blocker"),
    finding("/chains/0/ratings/S", "blocker"),
    finding("/chains/7", "blocker"),
    finding("/chains/1/ratings/O", "warning"),
    finding("/chains/1", "blocker"),
    finding("/chains/0", "blocker"),
    finding("", "blocker"),
  ]);
  const blockers = attentionOf(doc).blockers;
  assert.equal(blockers?.label, "2 rows and the document fail an automated check");
  assert.deepEqual(blockers?.lines.map((l) => l.message), ["/chains/1", "/chains/0/ratings/S", "/chains/0", "/chains/7", "/meta/ground_rules", ""]);
  assert.deepEqual(blockers?.lines.map((l) => l.where.kind), ["row", "row", "row", "unknown-row", "document", "document"]);

  const noChains = attentionOf(withComputed(docOf(), [finding("/meta/ground_rules", "blocker"), finding("/chains/0", "blocker")]));
  assert.deepEqual(noChains.blockers?.lines.map((l) => l.message), ["/chains/0", "/meta/ground_rules"]);
  assert.equal(noChains.blockers?.label, "The document fails an automated check");
});

test("attention: a rating-provisional finding of severity blocker stays in its row and in the blocker item", () => {
  const blocker = finding("/chains/0/ratings/S", "blocker", "rating-provisional", PROVISIONAL);
  const placed = { severity: "blocker", rule: "rating-provisional", message: PROVISIONAL, where: { kind: "row", chainId: "ch-1", label: "S", raw: false } };
  const model = modelOf(withComputed(minimalDoc(), [blocker]));
  assert.deepEqual(model.rows[0].marks, ["blocker"]);
  assert.deepEqual(model.rows[0].findings, [placed]);
  assert.deepEqual(model.attention.blockers, { label: "1 row fails an automated check", lines: [placed] });

  const withWarning = modelOf(withComputed(minimalDoc(), [finding("/chains/0/ratings/O", "warning", "rating-provisional", PROVISIONAL), blocker]));
  assert.deepEqual(withWarning.rows[0].findings, [placed], "the warning of the rule is still left out");
});

test("attention: the checkout fixture's block", () => {
  const a = attentionOf(fixture());
  assert.deepEqual(Object.keys(a), ["blockers", "stale", "provisional", "handoffs", "nextActions"]);
  assert.deepEqual(a.blockers, {
    label: "1 row fails an automated check",
    lines: [{
      severity: "blocker",
      rule: "detection-1-without-evidenced-control",
      message: "Detection is 1 with no existing detection control carrying evidence",
      where: { kind: "row", chainId: "ch-7", label: "D", raw: false },
    }],
  });
  assert.equal(a.stale, null);
  assert.deepEqual(a.provisional, {
    label: "11 ratings not yet reviewed",
    rows: [
      { chainId: "ch-2", factors: ["S", "O", "D"] }, { chainId: "ch-9", factors: ["S", "O", "D"] },
      { chainId: "ch-4", factors: ["O", "D"] }, { chainId: "ch-8", factors: ["S", "O", "D"] },
    ],
  });
  assert.deepEqual(a.handoffs, {
    label: "1 row passed to threat modelling",
    rows: [{ chainId: "ch-5", failureMode: "A session token that this component did not issue for the current session is accepted" }],
  });
  assert.deepEqual(a.nextActions.map((r) => `${r.chainId} ${r.action.id}`), ["ch-4 act-1", "ch-1 act-1", "ch-8 act-1"]);
});

const trackerLink = (url = "https://github.example.com/acme/checkout/issues/12", observed?: TrackerLink["observed"]): TrackerLink =>
  ({ provider: "github", id: "12", key: "acme/checkout#12", url, linked: "2026-10-01", ...(observed ? { observed } : {}) });

function linkedDoc(link: TrackerLink): FmeaDocument {
  const doc = minimalDoc();
  doc.chains[0].actions = [{ ...action("act-1", "Open", "2026-11-01"), tracker: link }, action("act-2", "Open", "2026-11-02")];
  return doc;
}

test("an action with no link has a null tracker, and a document with no link is not tracked", () => {
  // The fixture is linked now, so the unlinked case is the fixture with its links removed.
  const model = modelOf(withoutTracker(fixture()));
  assert.ok(model.actions.every((a) => a.tracker === null));
  assert.equal(model.tracked, false);
});

test("a link with observed gives its key, its url and '<state>, seen <date>'", () => {
  const model = modelOf(linkedDoc(trackerLink(undefined, { state: "open", detail: "", date: "2026-10-02" })));
  assert.equal(model.tracked, true);
  assert.deepEqual(model.actions[0].tracker, { key: "acme/checkout#12", url: "https://github.example.com/acme/checkout/issues/12", seen: "open, seen 2026-10-02" });
  assert.equal(model.actions[1].tracker, null);
});

test("a link with no observed gives 'not yet read'", () => {
  assert.equal(modelOf(linkedDoc(trackerLink())).actions[0].tracker?.seen, "not yet read");
});

test("a url that does not begin https:// gives a null url", () => {
  for (const url of ["http://github.example.com/x", "javascript:alert(1)", "HTTPS://x.example.com", " https://x.example.com"]) {
    const tracker = modelOf(linkedDoc(trackerLink(url))).actions[0].tracker;
    assert.equal(tracker?.url, null, url);
    assert.equal(tracker?.key, "acme/checkout#12");
  }
});

const cb = (id: string): Codebase => ({ id, name: `${id} codebase`, repo: `acme/${id}` });
function chainOf(doc: FmeaDocument, id: string): Chain {
  const chain = doc.chains.find((c) => c.id === id);
  assert.ok(chain, `no chain ${id}`);
  return chain;
}
const CH1_MODE = "The authorization call exceeds its timeout budget and returns no decision";

test("roots: the checkout fixture's two top-level elements, every count rolling up the subtree", () => {
  assert.deepEqual(modelOf(fixture()).roots, [
    { id: "checkout", name: "Checkout service", codebase: "Checkout service", chains: 8, top: { value: "H", count: 5 }, provisional: 4, openActions: 7 },
    { id: "pricing", name: "Pricing service", codebase: "owned outside", chains: 1, top: { value: "H", count: 0 }, provisional: 0, openActions: 1 },
  ]);
});

test("roots: ordered by the best priority rank in the subtree, ties by id, an out-of-vocabulary value after L, chainless roots last by id", () => {
  const doc = graphDoc({
    elements: ["e", "c", "b", "a", "a.x", "x", "y", "d"],
    chains: [["ch-a", "a"], ["ch-ax", "a.x"], ["ch-b", "b"], ["ch-c", "c"], ["ch-x", "x"], ["ch-y", "y"]],
  });
  chainOf(doc, "ch-ax").priority.value = "H";
  chainOf(doc, "ch-x").priority.value = "Z";
  chainOf(doc, "ch-y").priority.value = "L";
  assert.deepEqual(modelOf(doc).roots.map((r) => [r.id, r.chains, r.top.count]), [
    ["a", 2, 1], ["b", 1, 0], ["c", 1, 0], ["y", 1, 0], ["x", 1, 0], ["d", 0, 0], ["e", 0, 0],
  ]);
});

test("roots: two top-level elements sharing an id give one row and one section, for the first", () => {
  const model = modelOf(graphDoc({ elements: ["a", { id: "a", name: "second" }], chains: [["ch-1", "a"]] }));
  assert.deepEqual(model.roots.map((r) => [r.id, r.name, r.chains]), [["a", "a", 1]]);
  assert.deepEqual(model.sections.map((s) => s.root), [{ id: "a", name: "a" }]);
});

test("sections: one per root with chains in the roots' order, rows in index order, then the rootless tail", () => {
  assert.deepEqual(modelOf(fixture()).sections.map((s) => [s.root?.id ?? null, s.rows.map((r) => r.chain.id)]), [
    ["checkout", ["ch-2", "ch-1", "ch-5", "ch-7", "ch-9", "ch-4", "ch-8", "ch-6"]],
    ["pricing", ["ch-3"]],
  ]);
  const doc = graphDoc({
    elements: ["a", "b.c", { id: "m", parent: "n" }, { id: "n", parent: "m" }],
    chains: [["ch-1", "a"], ["ch-2", "b.c"], ["ch-3", "m"], ["ch-4", "a"]],
  });
  chainOf(doc, "ch-4").function = "fn-missing";
  assert.deepEqual(modelOf(doc).sections.map((s) => [s.root?.id ?? null, s.rows.map((r) => r.chain.id)]), [
    ["a", ["ch-1"]],
    [null, ["ch-2", "ch-3", "ch-4"]],
  ]);
});

test("codebases: overrides, an outside element that never inherits, in-scope children under it inheriting nothing, and a codebase that names no entry", () => {
  const doc = graphDoc({
    elements: [
      { id: "r", codebase: "main" },
      { id: "r.lib", codebase: "lib" },
      "r.lib.util",
      { id: "r.gw", boundary: "third_party" },
      "r.gw.adapter",
      { id: "r.ext", boundary: "owned_outside", codebase: "ext" },
      "r.ext.adapter",
      { id: "r.ext.own", codebase: "own" },
      "r.ext.own.kid",
      { id: "solo", codebase: "missing" },
      "solo.kid",
      { id: "vendor", boundary: "third_party" },
      { id: "partner", boundary: "owned_outside" },
      { id: "platform", boundary: "owned_outside", codebase: "ext" },
    ],
  });
  doc.meta.codebases = ["main", "lib", "ext", "own"].map(cb);
  const model = modelOf(doc);
  assert.deepEqual(model.codebases, doc.meta.codebases);
  assert.deepEqual(model.treeLabels, [
    "main codebase", "lib codebase", "lib codebase", null, "none", "ext codebase", "none",
    "own codebase", "own codebase", "none", "none", null, null, "ext codebase",
  ]);
  assert.deepEqual(model.roots.map((r) => [r.id, r.codebase]), [
    ["partner", "owned outside"], ["platform", "ext codebase"], ["r", "main codebase"], ["solo", "none"], ["vendor", "third party"],
  ]);
});

test("codebases: a document without meta.codebases has no codebase text on a root or a tree line", () => {
  const model = modelOf(graphDoc({ elements: ["a", { id: "a.gw", boundary: "third_party" }, { id: "b", boundary: "owned_outside" }] }));
  assert.deepEqual(model.codebases, []);
  assert.deepEqual(model.treeLabels, [null, null, null]);
  assert.deepEqual(model.roots.map((r) => r.codebase), [null, null]);
});

test("roots: the provisional count counts chains, not ratings, post-action ratings included, and open actions follow isOpen", () => {
  const doc = graphDoc({ elements: ["a"], chains: [["ch-1", "a"], ["ch-2", "a"], ["ch-3", "a"]] });
  chainOf(doc, "ch-1").ratings = { S: rating(8, "provisional"), O: rating(3, "provisional"), D: rating(4, "provisional") };
  chainOf(doc, "ch-2").post_ratings = { S: rating(8), O: rating(3, "provisional"), D: rating(4) };
  chainOf(doc, "ch-3").actions = [action("act-1", "Open", "2026-10-01"), action("act-2", "Completed", "2026-10-02"),
    action("act-3", "Not Implemented", "2026-10-03"), action("act-4", "Implementation pending", "2026-10-04")];
  assert.deepEqual(modelOf(doc).roots.map((r) => [r.provisional, r.openActions]), [[2, 2]]);
});

test("roots: the top count is taken against the first value of the table the report is rendered with", () => {
  assert.deepEqual(buildReportModel(fixture(), withVocabulary(["M", "H", "L"])).roots.map((r) => [r.id, r.top]), [
    ["checkout", { value: "M", count: 3 }],
    ["pricing", { value: "M", count: 1 }],
  ]);
});

test("edges: every edge in document order, two consumers of one provider at different strengths included", () => {
  const doc = graphDoc({ elements: ["a", "b", "p"], edges: [edge("b", "p", "weak", { sla: "99.9% monthly" }), edge("a", "p", "strong", { limits: "10 rps" })] });
  const model = modelOf(doc);
  assert.deepEqual(model.edges, doc.dependencies);
  assert.deepEqual(model.edges.map((e) => [e.from, e.to, e.strength]), [["b", "p", "weak"], ["a", "p", "strong"]]);
  assert.deepEqual(modelOf(fixture()).edges.map((e) => [e.from, e.to, e.strength]), [
    ["checkout", "checkout.payment-gateway", "strong"], ["checkout", "pricing", "weak"], ["checkout", "checkout.order-store", "strong"],
  ]);
});

test("cause links: one per resolved link that is not a self-link, the mode flagged when it differs from the cause text under trimming", () => {
  const golden = modelOf(fixture());
  assert.deepEqual(rowById(golden, "ch-9").causeLinks, [{ cause: 0, chainId: "ch-1", element: "checkout.payment-gateway", failureMode: CH1_MODE, differs: false }]);
  assert.deepEqual(golden.rows.filter((r) => r.chain.id !== "ch-9").map((r) => r.causeLinks), golden.rows.slice(1).map(() => []));
  const doc = graphDoc({ elements: ["p", "a"], chains: [["ch-p", "p"], ["ch-a", "a"]], links: [["ch-a", "ch-p"]] });
  chainOf(doc, "ch-a").causes.push({ text: "x", chain: "ch-missing" }, { text: "y", chain: "ch-a" });
  assert.deepEqual(rowById(modelOf(doc), "ch-a").causeLinks, [{ cause: 0, chainId: "ch-p", element: "p", failureMode: "stops serving", differs: true }]);
  chainOf(doc, "ch-a").causes[0].text = "  stops serving ";
  chainOf(doc, "ch-p").function = "fn-missing";
  assert.deepEqual(rowById(modelOf(doc), "ch-a").causeLinks, [{ cause: 0, chainId: "ch-p", element: "", failureMode: "stops serving", differs: false }]);
});

test("propagates to: each consumer once, in index order, on the first chain of the provider's id only", () => {
  assert.deepEqual(rowById(modelOf(fixture()), "ch-1").propagatesTo, [{ chainId: "ch-9", element: "checkout" }]);
  const doc = graphDoc({ elements: ["p", "a", "b", "c"], chains: [["ch-p", "p"], ["ch-b", "b"], ["ch-a", "a"], ["ch-c", "c"]], links: [["ch-b", "ch-p"], ["ch-a", "ch-p"]] });
  chainOf(doc, "ch-a").causes.push({ text: "a second cause", chain: "ch-p" });
  chainOf(doc, "ch-c").causes[0].chain = "ch-p";
  chainOf(doc, "ch-c").function = "fn-missing";
  const fnB = doc.functions.find((f) => f.id === "fn-b");
  assert.ok(fnB);
  fnB.element = "ghost";
  doc.chains.push(clone(chainOf(doc, "ch-p")));
  const model = modelOf(doc);
  assert.deepEqual(model.rows.filter((r) => r.chain.id === "ch-p").map((r) => r.propagatesTo), [
    [{ chainId: "ch-a", element: "a" }, { chainId: "ch-b", element: "ghost" }, { chainId: "ch-c", element: "" }],
    [],
  ]);
});
