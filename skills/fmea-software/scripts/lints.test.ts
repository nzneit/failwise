import { test } from "node:test";
import assert from "node:assert/strict";
import { MACHINE_RULES, runLints } from "./lib/lints.ts";
import { loadTable } from "./lib/table.ts";
import { validateDocument } from "./validate.ts";
import { loadFixture, minimalDoc, rating } from "./test-helpers.ts";
import type { Control, FmeaDocument, Lint, TrackerLink } from "./lib/types.ts";

function ruleById(id: string) {
  const rule = MACHINE_RULES.find((r) => r.id === id);
  assert.ok(rule, `MACHINE_RULES has no rule ${id}`);
  return rule;
}

function fired(doc: FmeaDocument, id: string): Lint[] {
  return ruleById(id).check(doc);
}

const detectionControl: Control = {
  kind: "detection", description: "alert on the failure", status: "existing",
  evidence: { kind: "test_result", ref: "detect.spec" },
};

/** `minimalDoc()` carries neither ground rules nor assumptions, which
 *  `metadata-without-ground-rules` flags; a document that is clean under every rule carries both. */
function documentedDoc(): FmeaDocument {
  const doc = minimalDoc();
  doc.meta.ground_rules = ["rate against the shipped anchors"];
  doc.meta.assumptions = [{ text: "the gateway holds its published SLA", owner: "T. Tester", status: "open" }];
  return doc;
}

test("MACHINE_RULES lists every rule with its severity, in order", () => {
  assert.deepEqual(MACHINE_RULES.map((r) => [r.id, r.severity]), [
    ["occurrence-estimate-without-trigger", "warning"],
    ["detection-1-without-evidenced-control", "blocker"],
    ["rating-provisional", "warning"],
    ["seeded-action-without-incident", "warning"],
    ["metadata-without-ground-rules", "blocker"],
    ["tracker-link-without-config", "warning"],
    ["tracker-link-shared", "warning"],
  ]);
});

// `minimalDoc()` itself records no ground rules and no assumptions, which the blocker rule
// `metadata-without-ground-rules` flags (pinned below); a whole-document run therefore starts from
// `documentedDoc()`, the same document with the two metadata lists a real analysis carries.
test("a minimal document that records its ground rules and assumptions produces no lints", () => {
  assert.deepEqual(runLints(documentedDoc()), []);
});

test("occurrence-estimate-without-trigger stays silent when a trigger is recorded", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.O = rating(8, "rescored", "estimate");
  doc.chains[0].trigger = "load exceeds advertised capacity";
  assert.deepEqual(fired(doc, "occurrence-estimate-without-trigger"), []);
});

test("occurrence-estimate-without-trigger fires on an estimate of 7 with a blank trigger", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.O = rating(7, "rescored", "estimate");
  doc.chains[0].trigger = "   ";
  const lints = fired(doc, "occurrence-estimate-without-trigger");
  assert.equal(lints.length, 1);
  assert.equal(lints[0].pointer, "/chains/0/ratings/O");
  assert.equal(lints[0].severity, "warning");
});

test("occurrence-estimate-without-trigger stays silent below 7 and on observed evidence", () => {
  const low = minimalDoc();
  low.chains[0].ratings.O = rating(6, "rescored", "estimate");
  assert.deepEqual(fired(low, "occurrence-estimate-without-trigger"), []);
  const observed = minimalDoc();
  observed.chains[0].ratings.O = rating(9, "rescored", "observed_incident");
  assert.deepEqual(fired(observed, "occurrence-estimate-without-trigger"), []);
});

test("detection-1-without-evidenced-control stays silent with an evidenced existing detection control", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.D = rating(1);
  doc.chains[0].controls = [detectionControl];
  assert.deepEqual(fired(doc, "detection-1-without-evidenced-control"), []);
});

test("detection-1-without-evidenced-control fires when the only detection control is planned", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.D = rating(1);
  doc.chains[0].controls = [{ kind: "detection", description: "planned dashboard", status: "planned", evidence: { kind: "none" } }];
  const lints = fired(doc, "detection-1-without-evidenced-control");
  assert.equal(lints.length, 1);
  assert.equal(lints[0].pointer, "/chains/0/ratings/D");
  assert.equal(lints[0].severity, "blocker");
});

test("detection-1-without-evidenced-control fires when the existing control carries no evidence", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.D = rating(1);
  doc.chains[0].controls = [{ kind: "detection", description: "someone watches the graph", status: "existing", evidence: { kind: "none" } }];
  assert.equal(fired(doc, "detection-1-without-evidenced-control").length, 1);
});

test("rating-provisional stays silent when every rating is reviewed", () => {
  assert.deepEqual(fired(minimalDoc(), "rating-provisional"), []);
});

test("rating-provisional fires once per provisional rating, on ratings and post_ratings alike", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.S = rating(8, "provisional");
  doc.chains[0].actions = [{ id: "act-1", description: "done", owner: "T. Tester", status: "Completed", target_date: "2026-08-01", completed_date: "2026-08-15" }];
  doc.chains[0].post_ratings = { S: rating(8), O: rating(3, "provisional"), D: rating(4) };
  const lints = fired(doc, "rating-provisional");
  assert.deepEqual(lints.map((l) => l.pointer), ["/chains/0/ratings/S", "/chains/0/post_ratings/O"]);
  assert.deepEqual(lints.map((l) => l.severity), ["warning", "warning"]);
});

test("rating-provisional names no factor in its message, so a pre-action and a post-action finding read alike", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.D = rating(4, "provisional");
  doc.chains[0].post_ratings = { S: rating(8, "provisional"), O: rating(3), D: rating(4) };
  assert.deepEqual(fired(doc, "rating-provisional").map((l) => [l.pointer, l.message]), [
    ["/chains/0/ratings/D", "The rating is still provisional and needs re-scoring"],
    ["/chains/0/post_ratings/S", "The rating is still provisional and needs re-scoring"],
  ]);
});

test("seeded-action-without-incident stays silent when the action carries the incident", () => {
  const doc = minimalDoc();
  doc.chains[0].source_incident = "INC-2026-0314";
  doc.chains[0].actions = [{ id: "act-1", description: "fix it", owner: "T. Tester", status: "Open", target_date: "2026-10-01", source_incident: "INC-2026-0314" }];
  assert.deepEqual(fired(doc, "seeded-action-without-incident"), []);
});

test("seeded-action-without-incident fires on an action with no incident on a seeded chain", () => {
  const doc = minimalDoc();
  doc.chains[0].source_incident = "INC-2026-0314";
  doc.chains[0].actions = [
    { id: "act-1", description: "fix it", owner: "T. Tester", status: "Open", target_date: "2026-10-01", source_incident: "INC-2026-0314" },
    { id: "act-2", description: "also fix it", owner: "T. Tester", status: "Open", target_date: "2026-11-01" },
  ];
  const lints = fired(doc, "seeded-action-without-incident");
  assert.equal(lints.length, 1);
  assert.equal(lints[0].pointer, "/chains/0/actions/1");
});

test("seeded-action-without-incident stays silent on a chain that was not seeded", () => {
  const doc = minimalDoc();
  doc.chains[0].actions = [{ id: "act-1", description: "fix it", owner: "T. Tester", status: "Open", target_date: "2026-10-01" }];
  assert.deepEqual(fired(doc, "seeded-action-without-incident"), []);
});

test("metadata-without-ground-rules stays silent when the document records both lists", () => {
  assert.deepEqual(fired(documentedDoc(), "metadata-without-ground-rules"), []);
});

test("metadata-without-ground-rules fires once per empty list, ground_rules first", () => {
  const doc = minimalDoc();
  const lints = fired(doc, "metadata-without-ground-rules");
  assert.deepEqual(lints.map((l) => l.pointer), ["/meta/ground_rules", "/meta/assumptions"]);
  assert.deepEqual(lints.map((l) => l.severity), ["blocker", "blocker"]);
});

function link(id: string, provider: TrackerLink["provider"] = "github"): TrackerLink {
  return { provider, id, key: `acme/risk#${id}`, url: `https://github.com/acme/risk/issues/${id}`, linked: "2026-10-02" };
}

function linkedDoc(ids: string[]): FmeaDocument {
  const doc = documentedDoc();
  doc.meta.tracker = { provider: "github", project: "acme/risk", label: "failwise" };
  doc.chains[0].actions = ids.map((id, j) => ({
    id: `act-${j + 1}`, description: "fix it", owner: "T. Tester", status: "Open", target_date: "2026-10-01", tracker: link(id),
  }));
  return doc;
}

test("tracker-link-without-config fires on a link when meta.tracker is absent", () => {
  const doc = linkedDoc(["1"]);
  delete doc.meta.tracker;
  const lints = fired(doc, "tracker-link-without-config");
  assert.equal(lints.length, 1);
  assert.equal(lints[0].pointer, "/chains/0/actions/0/tracker");
  assert.equal(lints[0].severity, "warning");
});

test("tracker-link-without-config stays silent when meta.tracker names the same provider", () => {
  assert.deepEqual(fired(linkedDoc(["1", "2"]), "tracker-link-without-config"), []);
  assert.deepEqual(fired(documentedDoc(), "tracker-link-without-config"), []);
});

test("tracker-link-shared fires on every action after the first that carries the same tracker id", () => {
  const doc = linkedDoc(["1", "7", "1"]);
  const second = structuredClone(doc.chains[0]);
  second.id = "ch-2";
  second.actions = [{ ...second.actions[0], id: "act-9", tracker: link("1") }];
  doc.chains.push(second);
  const lints = fired(doc, "tracker-link-shared");
  assert.deepEqual(lints.map((l) => l.pointer), ["/chains/0/actions/2/tracker", "/chains/1/actions/0/tracker"]);
  assert.ok(lints.every((l) => l.severity === "warning" && l.message.includes(`${doc.chains[0].id}/act-1`)));
});

test("neither tracker lint fails validation: validateDocument stays ok with both firing", () => {
  const doc = linkedDoc(["1", "1"]);
  delete doc.meta.tracker;
  assert.equal(fired(doc, "tracker-link-without-config").length, 2);
  assert.equal(fired(doc, "tracker-link-shared").length, 1);
  const result = validateDocument(doc, loadTable());
  assert.equal(result.ok, true);
});

test("runLints returns rules in MACHINE_RULES order and then in document order", () => {
  const doc = documentedDoc();
  const second = structuredClone(doc.chains[0]);
  second.id = "ch-2";
  doc.chains.push(second);
  doc.chains[0].ratings.O = rating(8, "provisional", "estimate");
  doc.chains[1].ratings.O = rating(8, "provisional", "estimate");
  doc.chains[1].ratings.D = rating(1, "provisional");
  const lints = runLints(doc);
  assert.deepEqual(lints.map((l) => `${l.rule} ${l.pointer}`), [
    "occurrence-estimate-without-trigger /chains/0/ratings/O",
    "occurrence-estimate-without-trigger /chains/1/ratings/O",
    "detection-1-without-evidenced-control /chains/1/ratings/D",
    "rating-provisional /chains/0/ratings/O",
    "rating-provisional /chains/1/ratings/O",
    "rating-provisional /chains/1/ratings/D",
  ]);
});

test("runLints takes a rule subset", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.S = rating(8, "provisional");
  assert.deepEqual(runLints(doc, [ruleById("detection-1-without-evidenced-control")]), []);
});

// The golden fixture's lint facts, recorded in the plan reference §H and asserted by Tasks 26,
// 27 and 28. Pinned here so that a rule added in Step 5 which fires on the golden analysis fails
// in this task rather than two tasks later inside validate.test.ts.
test("the golden fixture produces exactly the eleven lints the later tasks assert", () => {
  const doc = loadFixture<FmeaDocument>("checkout-service.fmea.json");
  const lints = runLints(doc);
  assert.equal(lints.length, 11);
  assert.equal(lints.filter((l) => l.severity === "blocker").length, 1);
});
