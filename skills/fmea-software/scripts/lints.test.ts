import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASCADING_ROWS, MACHINE_RULES, formatLintLine, runLints, tablePropertyLints } from "./lib/lints.ts";
import { loadTable } from "./lib/table.ts";
import { validateDocument } from "./lib/validation.ts";
import { SKILL_ROOT, bandTable, citeO, clone, edge, graphDoc, loadFixture, minimalDoc, newElement, rating, readingDoc } from "./test-helpers.ts";
import type { Assumption, AssumptionStatus, Chain, Codebase, Control, FmeaDocument, Lint, Source, TrackerLink } from "./lib/types.ts";

const REFERENCE = readFileSync(join(SKILL_ROOT, "references", "quality-and-lint.md"), "utf8");

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
    ["dependency-row-without-dependency", "warning"],
    ["security-row-without-flag", "warning"],
    ["repo-ref-form", "warning"],
    ["repo-ref-codebase", "warning"],
    ["cause-chain-unlinked", "warning"],
    ["cause-chain-severity", "warning"],
    ["linked-cause-occurrence-drift", "warning"],
    ["chain-flow-step-mismatch", "warning"],
    ["chain-flow-no-steps", "warning"],
    ["chain-flow-rationale-unnamed", "warning"],
    ["flow-users-provisional", "warning"],
    ["edge-reliability-unstated", "warning"],
    ["conversion-substitution-unrecorded", "warning"],
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

function golden(): FmeaDocument {
  return loadFixture<FmeaDocument>("checkout-service.fmea.json");
}

function elementById(doc: FmeaDocument, id: string): FmeaDocument["elements"][number] {
  const el = doc.elements.find((e) => e.id === id);
  assert.ok(el, `the document has no element ${id}`);
  return el;
}

test("dependency-row-without-dependency fires on a cat-dependency- ref whose element is the provider of no edge and stays silent on an in_scope provider", () => {
  const doc = golden();
  assert.equal(doc.chains[0].catalog_refs[0].id, "cat-dependency-01");
  assert.deepEqual(fired(doc, "dependency-row-without-dependency"), []);
  elementById(doc, "pricing").boundary = "in_scope";
  assert.ok(doc.dependencies.some((e) => e.to === "pricing"));
  doc.chains[2].catalog_refs = [{ id: "cat-dependency-02", provenance: "skill-authored" }];
  assert.deepEqual(fired(doc, "dependency-row-without-dependency"), []);
  doc.dependencies = doc.dependencies.filter((e) => e.to !== "checkout.payment-gateway");
  elementById(doc, "checkout.payment-gateway").boundary = "in_scope";
  const finding: Lint = {
    rule: "dependency-row-without-dependency", severity: "warning", pointer: "/chains/0/catalog_refs/0/id",
    message: "chain ch-1 applies dependency row cat-dependency-01 to element checkout.payment-gateway, which is the provider of no edge",
  };
  assert.deepEqual(fired(doc, "dependency-row-without-dependency"), [finding]);
  doc.dependencies.push({ from: "checkout.payment-gateway", to: "pricing", strength: "weak" });
  assert.deepEqual(fired(doc, "dependency-row-without-dependency"), [finding], "an edge out of the element does not make it a provider");
});

test("security-row-without-flag fires on a cat-security- ref whose element is not security-relevant", () => {
  const doc = golden();
  assert.equal(doc.chains[4].catalog_refs[0].id, "cat-security-01");
  assert.deepEqual(fired(doc, "security-row-without-flag"), []);

  const auth = elementById(doc, "checkout.session-auth");
  auth.security_relevant = false;
  delete auth.security_rationale;
  assert.deepEqual(fired(doc, "security-row-without-flag"), [{
    rule: "security-row-without-flag", severity: "warning", pointer: "/chains/4/catalog_refs/0/id",
    message: "chain ch-5 applies security row cat-security-01 to element checkout.session-auth, which is not marked security-relevant",
  }]);
});

test("the row lints skip a chain whose function does not resolve", () => {
  const doc = golden();
  elementById(doc, "checkout.session-auth").security_relevant = false;
  doc.chains[4].function = "fn-missing";
  assert.deepEqual(fired(doc, "security-row-without-flag"), []);
});

test("repo-ref-form stays silent while no repo ref is qualified, then flags the unqualified and the short-SHA refs, and ignores document refs", () => {
  const doc = minimalDoc();
  const element = (id: string, kind: "repo" | "document", ref: string): FmeaDocument["elements"][number] => ({
    id, kind: "service", name: id, description: "", parent: null, boundary: "in_scope", security_relevant: false, sources: [{ kind, ref }],
  });
  doc.elements.push(element("bare", "repo", "src/a.ts"));
  assert.deepEqual(fired(doc, "repo-ref-form"), []);

  doc.elements.push(element("qualified", "repo", "acme/checkout@" + "a".repeat(40) + ":src/b.ts"));
  const one = fired(doc, "repo-ref-form");
  assert.equal(one.length, 1);
  assert.equal(one[0].severity, "warning");
  assert.equal(one[0].pointer, "/elements/1/sources/0/ref");
  assert.match(one[0].message, /^repo ref src\/a\.ts on element bare\b/);
  assert.match(one[0].message, /is not in the owner\/repo@commit:path form/);

  doc.elements[2].sources[0].ref = "acme/checkout@abc1234:src/b.ts";
  const two = fired(doc, "repo-ref-form");
  assert.equal(two.length, 2);
  assert.equal(two[1].pointer, "/elements/2/sources/0/ref");
  assert.match(two[1].message, /^repo ref acme\/checkout@abc1234:src\/b\.ts on element qualified\b/);
  assert.match(two[1].message, /full 40-hex-digit SHA/);

  doc.elements.push(element("doc", "document", "acme/checkout@abc1234:docs/x.md"));
  assert.deepEqual(fired(doc, "repo-ref-form"), two);
});

const SHA = "a".repeat(40);
const CODEBASES: Codebase[] = [{ id: "cb-a", name: "A", repo: "acme/a" }, { id: "cb-b", name: "B", repo: "acme/b" }];
function repoSource(repo: string, path = "src/index.ts"): Source { return { kind: "repo", ref: `${repo}@${SHA}:${path}` }; }

test("repo-ref-codebase flags a head no codebase lists, then a head that differs from the element's effective codebase, one finding per ref in element and source order", () => {
  const doc = graphDoc({ elements: [
    { id: "a", codebase: "cb-a", sources: [repoSource("acme/a"), repoSource("acme/b", "src/b.ts")] },
    { id: "a.x", sources: [repoSource("acme/zzz", "src/x.ts")] },
  ] });
  doc.meta.codebases = structuredClone(CODEBASES);
  assert.deepEqual(fired(doc, "repo-ref-codebase"), [
    { rule: "repo-ref-codebase", severity: "warning", pointer: "/elements/0/sources/1/ref",
      message: `repo ref acme/b@${SHA}:src/b.ts on element a names repository acme/b, but the element's codebase cb-a is acme/a` },
    { rule: "repo-ref-codebase", severity: "warning", pointer: "/elements/1/sources/0/ref",
      message: `repo ref acme/zzz@${SHA}:src/x.ts on element a.x names repository acme/zzz, which no entry of meta.codebases lists` },
  ]);
  delete doc.meta.codebases;
  assert.deepEqual(fired(doc, "repo-ref-codebase"), []);
});

test("repo-ref-codebase compares the head byte for byte and leaves an unqualified ref alone", () => {
  const doc = graphDoc({ elements: [{ id: "a", codebase: "cb-a", sources: [repoSource("Acme/A"), { kind: "repo", ref: "src/a.ts" }] }] });
  doc.meta.codebases = structuredClone(CODEBASES);
  assert.deepEqual(fired(doc, "repo-ref-codebase").map((l) => [l.pointer, l.message]), [
    ["/elements/0/sources/0/ref", `repo ref Acme/A@${SHA}:src/index.ts on element a names repository Acme/A, which no entry of meta.codebases lists`],
  ]);
});

test("repo-ref-codebase gives only the first check to an element with no effective codebase: a head that names an entry passes, one that names none is flagged", () => {
  const doc = graphDoc({ elements: [
    { id: "gw", boundary: "third_party", codebase: "cb-b" },
    { id: "gw.adapter", sources: [repoSource("acme/b"), repoSource("acme/zzz", "src/adapter.ts")] },
    { id: "a", codebase: "cb-missing", sources: [repoSource("acme/b")] },
    { id: "a.x", sources: [repoSource("acme/b"), repoSource("acme/zzz", "src/x.ts")] },
  ] });
  doc.meta.codebases = structuredClone(CODEBASES);
  assert.deepEqual(fired(doc, "repo-ref-codebase").map((l) => [l.pointer, l.message]), [
    ["/elements/1/sources/1/ref", `repo ref acme/zzz@${SHA}:src/adapter.ts on element gw.adapter names repository acme/zzz, which no entry of meta.codebases lists`],
    ["/elements/3/sources/1/ref", `repo ref acme/zzz@${SHA}:src/x.ts on element a.x names repository acme/zzz, which no entry of meta.codebases lists`],
  ]);
});

// ch-1 on svc.api (fn-svc.api, functions[1]) links its one cause to ch-2 on svc (fn-svc, functions[0]), its parent, with no edge.
function childToParent(): FmeaDocument {
  return graphDoc({ elements: ["svc", "svc.api"], chains: [["ch-1", "svc.api"], ["ch-2", "svc"]], links: [["ch-1", "ch-2"]] });
}
const CHILD_TO_PARENT = "cause 0 links to chain ch-2 on element svc, which is neither element svc.api nor below it, and no edge joins them";

test("cause-chain-unlinked accepts a same-element link, a link to a grandchild with no edge, and a link across an ancestor-to-ancestor edge", () => {
  assert.deepEqual(fired(graphDoc({ elements: ["svc"], chains: [["ch-1", "svc"], ["ch-2", "svc"]], links: [["ch-1", "ch-2"]] }), "cause-chain-unlinked"), []);
  assert.deepEqual(fired(graphDoc({ elements: ["svc", "svc.api", "svc.api.h"], chains: [["ch-1", "svc"], ["ch-2", "svc.api.h"]], links: [["ch-1", "ch-2"]] }), "cause-chain-unlinked"), []);
  assert.deepEqual(fired(graphDoc({ elements: ["a", "a.x", "b", "b.y"], edges: [edge("a", "b")], chains: [["ch-1", "a.x"], ["ch-2", "b.y"]], links: [["ch-1", "ch-2"]] }), "cause-chain-unlinked"), []);
});

test("cause-chain-unlinked flags a child-to-parent link no edge covers, keeps flagging it across an edge from the parent down, and accepts it once the child depends on the parent", () => {
  const doc = childToParent();
  assert.deepEqual(fired(doc, "cause-chain-unlinked"), [{ rule: "cause-chain-unlinked", severity: "warning", pointer: "/chains/0/causes/0/chain", message: CHILD_TO_PARENT }]);
  doc.dependencies = [edge("svc", "svc.api")];
  assert.deepEqual(fired(doc, "cause-chain-unlinked").map((l) => l.message), [CHILD_TO_PARENT]);
  doc.dependencies = [edge("svc.api", "svc")];
  assert.deepEqual(fired(doc, "cause-chain-unlinked"), []);
});

test("cause-chain-unlinked decides by the walk and not the id text: a nested id whose parent is missing or null is not below C", () => {
  for (const parent of ["ghost", null]) {
    const doc = graphDoc({ elements: ["svc", { id: "svc.api", parent }], chains: [["ch-1", "svc"], ["ch-2", "svc.api"]], links: [["ch-1", "ch-2"]] });
    assert.deepEqual(fired(doc, "cause-chain-unlinked").map((l) => [l.pointer, l.message]),
      [["/chains/0/causes/0/chain", "cause 0 links to chain ch-2 on element svc.api, which is neither element svc nor below it, and no edge joins them"]]);
  }
});

test("cause-chain-unlinked returns on two elements that name each other as parent, and accepts a link between them", () => {
  const doc = graphDoc({ elements: [{ id: "a", parent: "b" }, { id: "b", parent: "a" }], chains: [["ch-1", "a"], ["ch-2", "b"]], links: [["ch-1", "ch-2"]] });
  assert.deepEqual(fired(doc, "cause-chain-unlinked"), []);
});

test("cause-chain-unlinked skips a link that does not resolve, and a function or an element of either end that does not resolve", () => {
  const breaks: [string, (d: FmeaDocument) => void][] = [
    ["the link", (d) => { d.chains[0].causes[0].chain = "ch-missing"; }],
    ["the consumer's function", (d) => { d.chains[0].function = "fn-missing"; }],
    ["the consumer's element", (d) => { d.functions[1].element = "ghost"; }],
    ["the provider's function", (d) => { d.chains[1].function = "fn-missing"; }],
    ["the provider's element", (d) => { d.functions[0].element = "ghost"; }],
  ];
  for (const [what, breakDoc] of breaks) {
    const doc = childToParent();
    breakDoc(doc);
    assert.deepEqual(fired(doc, "cause-chain-unlinked"), [], what);
  }
});

const DRIFT = "linked-cause-occurrence-drift";

// ch-1 on svc (fn-svc, functions[0]) links its one cause to ch-2 on db (fn-db, functions[1]) across an edge;
// graphDoc writes ch-2's O as the cause's cited_o.
function linkedPair(): FmeaDocument {
  return graphDoc({ elements: ["svc", "db"], edges: [edge("svc", "db")], chains: [["ch-1", "svc"], ["ch-2", "db"]], links: [["ch-1", "ch-2"]] });
}
function severityPair(consumerS: number, providerS: number): FmeaDocument {
  const doc = linkedPair();
  doc.chains[0].ratings.S = rating(consumerS);
  doc.chains[1].ratings.S = rating(providerS);
  return doc;
}
const BELOW = "chain ch-2 rates S 7, below S 9 of chain ch-1, whose only cause is its failure mode";
// Each breaks one end of linkedPair's link without touching the link itself.
const UNRESOLVED_ENDS: [string, (doc: FmeaDocument) => void][] = [
  ["the consumer's function", (d) => { d.chains[0].function = "fn-missing"; }],
  ["the consumer's element", (d) => { d.functions[0].element = "ghost"; }],
  ["the provider's function", (d) => { d.chains[1].function = "fn-missing"; }],
  ["the provider's element", (d) => { d.functions[1].element = "ghost"; }],
];

test("CASCADING_ROWS is exactly the six positive-feedback catalog rows", () => {
  assert.deepEqual([...CASCADING_ROWS], ["cat-service-01", "cat-service-02", "cat-service-03", "cat-service-05", "cat-dependency-03", "cat-dependency-04"]);
});

test("cause-chain-severity flags a provider rated below its single-cause consumer, at the provider's S", () => {
  assert.deepEqual(fired(severityPair(9, 7), "cause-chain-severity"), [{ rule: "cause-chain-severity", severity: "warning", pointer: "/chains/1/ratings/S", message: BELOW }]);
});

test("cause-chain-severity reads ratings and never post_ratings", () => {
  const equal = severityPair(8, 8);
  equal.chains[1].post_ratings = { S: rating(2), O: rating(3), D: rating(4) };
  equal.chains[0].post_ratings = { S: rating(10), O: rating(3), D: rating(4) };
  assert.deepEqual(fired(equal, "cause-chain-severity"), []);
  const below = severityPair(9, 7);
  below.chains[1].post_ratings = { S: rating(9), O: rating(3), D: rating(4) };
  assert.deepEqual(fired(below, "cause-chain-severity").map((l) => l.message), [BELOW]);
});

test("cause-chain-severity is silent on a two-cause consumer, on an equal S, on a trigger that restates the linked cause, and on an unresolved link", () => {
  const twoCauses = severityPair(9, 7);
  twoCauses.chains[0].causes.push({ text: "a deploy fails" });
  assert.deepEqual(fired(twoCauses, "cause-chain-severity"), []);
  assert.deepEqual(fired(severityPair(8, 8), "cause-chain-severity"), []);
  const restated = severityPair(9, 7);
  restated.chains[0].trigger = ` ${restated.chains[0].causes[0].text} `;
  assert.deepEqual(fired(restated, "cause-chain-severity"), []);
  const unresolved = severityPair(9, 7);
  unresolved.chains[0].causes[0].chain = "ch-missing";
  assert.deepEqual(fired(unresolved, "cause-chain-severity"), []);
});

for (const id of ["cat-service-01", "cat-service-02", "cat-service-03", "cat-service-05", "cat-dependency-03", "cat-dependency-04"]) {
  test(`cause-chain-severity is silent on a single-cause linked consumer citing ${id}`, () => {
    const doc = severityPair(9, 7);
    doc.chains[0].catalog_refs = [{ id, provenance: "skill-authored" }];
    assert.deepEqual(fired(doc, "cause-chain-severity"), []);
  });
}

test("cause-chain-severity fires on a consumer citing cat-service-04 or cat-dependency-01, so no prefix or range matches", () => {
  for (const id of ["cat-service-04", "cat-dependency-01"]) {
    const doc = severityPair(9, 7);
    doc.chains[0].catalog_refs = [{ id, provenance: "skill-authored" }];
    assert.deepEqual(fired(doc, "cause-chain-severity").map((l) => l.message), [BELOW]);
  }
});

test("cause-chain-severity gives one finding per pair, by provider chain index then consumer chain index", () => {
  const doc = graphDoc({ elements: ["svc"], chains: [["ch-1", "svc"], ["ch-2", "svc"], ["ch-3", "svc"], ["ch-4", "svc"], ["ch-5", "svc"]],
    links: [["ch-1", "ch-5"], ["ch-2", "ch-4"], ["ch-3", "ch-4"]] });
  for (const i of [0, 1, 2]) doc.chains[i].ratings.S = rating(9);
  for (const i of [3, 4]) doc.chains[i].ratings.S = rating(5);
  assert.deepEqual(fired(doc, "cause-chain-severity").map((l) => [l.pointer, l.message]), [
    ["/chains/3/ratings/S", "chain ch-4 rates S 5, below S 9 of chain ch-2, whose only cause is its failure mode"],
    ["/chains/3/ratings/S", "chain ch-4 rates S 5, below S 9 of chain ch-3, whose only cause is its failure mode"],
    ["/chains/4/ratings/S", "chain ch-5 rates S 5, below S 9 of chain ch-1, whose only cause is its failure mode"],
  ]);
});

test("linked-cause-occurrence-drift is silent on a citation that matches, with and without evidence_ref", () => {
  const doc = linkedPair();
  assert.deepEqual(fired(doc, DRIFT), []);
  doc.chains[1].ratings.O = { ...rating(6, "rescored", "observed_incident"), evidence_ref: "INC-2026-0314" };
  doc.chains[0].causes[0].cited_o = citeO(doc.chains[1]);
  assert.deepEqual(fired(doc, DRIFT), []);
});

test("linked-cause-occurrence-drift is silent with no link, on an unresolved link and a self-link that carry no cited_o, and on a provider or a consumer without ratings", () => {
  assert.deepEqual(fired(minimalDoc(), DRIFT), []);
  for (const chain of ["ch-missing", "ch-1"]) {
    const doc = linkedPair();
    doc.chains[0].causes[0] = { text: "process crash", chain };
    assert.deepEqual(fired(doc, DRIFT), []);
  }
  for (const i of [0, 1]) {
    const doc = linkedPair();
    doc.chains[1].ratings.O = rating(5);
    delete (doc.chains[i] as Partial<Chain>).ratings;
    assert.deepEqual(fired(doc, DRIFT), []);
  }
});

test("cause-chain-severity and linked-cause-occurrence-drift are silent when a function or an element of either end does not resolve", () => {
  for (const [what, breakEnd] of UNRESOLVED_ENDS) {
    const severe = severityPair(9, 7);
    breakEnd(severe);
    assert.deepEqual(fired(severe, "cause-chain-severity"), [], what);
    const drifting = linkedPair();
    drifting.chains[1].ratings.O = rating(5);
    breakEnd(drifting);
    assert.deepEqual(fired(drifting, DRIFT), [], what);
  }
});

test("linked-cause-occurrence-drift fires at the consumer's O on a different value, evidence_kind, or evidence_ref present on one side only", () => {
  const cases: [(doc: FmeaDocument) => void, string][] = [
    [(d) => { d.chains[1].ratings.O = rating(5); }, "cause 0 cites ch-2 at O 3 (estimate); ch-2 now rates O 5 (estimate)"],
    [(d) => { d.chains[1].ratings.O = rating(3, "rescored", "test_result"); }, "cause 0 cites ch-2 at O 3 (estimate); ch-2 now rates O 3 (test_result)"],
    [(d) => { d.chains[1].ratings.O.evidence_ref = "load-test-7"; }, "cause 0 cites ch-2 at O 3 (estimate); ch-2 now rates O 3 (estimate, load-test-7)"],
    [(d) => { d.chains[0].causes[0].cited_o!.evidence_ref = "load-test-7"; }, "cause 0 cites ch-2 at O 3 (estimate, load-test-7); ch-2 now rates O 3 (estimate)"],
  ];
  for (const [change, message] of cases) {
    const doc = linkedPair();
    change(doc);
    assert.deepEqual(fired(doc, DRIFT), [{ rule: DRIFT, severity: "warning", pointer: "/chains/0/ratings/O", message }]);
  }
});

test("linked-cause-occurrence-drift reports a provider rating whose evidence_ref is empty as drift, since no valid citation records it", () => {
  const doc = linkedPair();
  doc.chains[1].ratings.O.evidence_ref = "";
  assert.deepEqual(fired(doc, DRIFT).map((l) => l.message), ["cause 0 cites ch-2 at O 3 (estimate); ch-2 now rates O 3 (estimate, )"]);
});

test("linked-cause-occurrence-drift reports the absent citation once graphDoc's cited_o is deleted", () => {
  const doc = linkedPair();
  delete doc.chains[0].causes[0].cited_o;
  assert.deepEqual(fired(doc, DRIFT), [{ rule: DRIFT, severity: "warning", pointer: "/chains/0/ratings/O",
    message: "cause 0 links to ch-2 but records no cited O; re-score O and record the provider's O" }]);
});

test("linked-cause-occurrence-drift flags a stray cited_o at the cause's cited_o: no chain, an unresolved link, a self-link", () => {
  const stray = [{ rule: DRIFT, severity: "warning", pointer: "/chains/0/causes/0/cited_o", message: "cited O recorded on a cause with no linked chain" }];
  const bare = minimalDoc();
  bare.chains[0].causes[0].cited_o = { value: 3, evidence_kind: "estimate" };
  assert.deepEqual(fired(bare, DRIFT), stray);
  for (const chain of ["ch-missing", "ch-1"]) {
    const doc = linkedPair();
    doc.chains[0].causes[0].chain = chain;
    assert.deepEqual(fired(doc, DRIFT), stray);
  }
});

test("linked-cause-occurrence-drift ignores post_ratings", () => {
  const doc = linkedPair();
  doc.chains[1].post_ratings = { S: rating(8), O: rating(1), D: rating(4) };
  assert.deepEqual(fired(doc, DRIFT), []);
});

test("linked-cause-occurrence-drift reports two drifting causes in chain then cause order", () => {
  const doc = graphDoc({ elements: ["svc"], chains: [["ch-1", "svc"], ["ch-2", "svc"], ["ch-3", "svc"]], links: [["ch-1", "ch-2"], ["ch-2", "ch-3"]] });
  doc.chains[0].causes.push({ text: "a second failure", chain: "ch-3", cited_o: citeO(doc.chains[2]) });
  doc.chains[1].ratings.O = rating(4);
  doc.chains[2].ratings.O = rating(5);
  assert.deepEqual(fired(doc, DRIFT).map((l) => [l.pointer, l.message]), [
    ["/chains/0/ratings/O", "cause 0 cites ch-2 at O 3 (estimate); ch-2 now rates O 4 (estimate)"],
    ["/chains/0/ratings/O", "cause 1 cites ch-3 at O 3 (estimate); ch-3 now rates O 5 (estimate)"],
    ["/chains/1/ratings/O", "cause 0 cites ch-3 at O 3 (estimate); ch-3 now rates O 5 (estimate)"],
  ]);
});

test("runLints takes a rule subset", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.S = rating(8, "provisional");
  assert.deepEqual(runLints(doc, [ruleById("detection-1-without-evidenced-control")]), []);
});

// The golden fixture's lint facts. A rule that fires on the golden analysis fails here first, before validate.test.ts.
test("the golden fixture produces exactly the seventeen lints the later tasks assert, none from the four rules of schema v3", () => {
  const doc = loadFixture<FmeaDocument>("checkout-service.fmea.json");
  const lints = runLints(doc);
  assert.equal(lints.length, 17);
  assert.equal(lints.filter((l) => l.severity === "blocker").length, 1);
  for (const rule of ["repo-ref-codebase", "cause-chain-unlinked", "cause-chain-severity", "linked-cause-occurrence-drift"]) {
    assert.deepEqual(lints.filter((l) => l.rule === rule), [], rule);
  }
});

test("linked-cause-occurrence-drift on the golden fixture: ch-1's O raised to 7 gives exactly one finding, at /chains/8/ratings/O", () => {
  const doc = golden();
  assert.deepEqual(fired(doc, "linked-cause-occurrence-drift"), []);
  doc.chains[0].ratings.O.value = 7;
  assert.deepEqual(fired(doc, "linked-cause-occurrence-drift"), [{
    rule: "linked-cause-occurrence-drift", severity: "warning", pointer: "/chains/8/ratings/O",
    message: "cause 0 cites ch-1 at O 6 (observed_incident, INC-2026-0314); ch-1 now rates O 7 (observed_incident, INC-2026-0314)",
  }]);
});

// ---- The loaded table's broken properties, which validateDocument adds after the document's lints.

test("tablePropertyLints gives one priority-table-property warning per broken property, at /meta/scales/priority_table", () => {
  const t = bandTable(["L", "M", "H"]);
  t.cells["1-3-3"] = "M";
  assert.deepEqual(tablePropertyLints(t), [{
    rule: "priority-table-property", severity: "warning", pointer: "/meta/scales/priority_table",
    message: 'table priority-test-properties breaks "S of 1 is always L" at 1-3-3 (M)',
  }]);
  assert.deepEqual(tablePropertyLints(loadTable()), []);
});

test("formatLintLine prints a finding as one line, severity and rule first, whatever its message holds", () => {
  const finding: Lint = { rule: "priority-table-property", severity: "warning", pointer: "/meta/scales/priority_table", message: 'table a\nb\u2028c breaks "x" at 1-1-1 (H)' };
  assert.equal(formatLintLine(finding), 'warning priority-table-property: table a b c breaks "x" at 1-1-1 (H)');
});

// ---- The four lints of the authored chain-to-flow link. Each pins the [pointer, message] pairs,
// as the linked-cause tests do, `fired` returning whole findings.

test("chain-flow-step-mismatch fires when a flow's steps omit the chain's function, unless a prefix is recorded", () => {
  const doc = minimalDoc();
  doc.functions.push({ id: "fn-2", element: "svc", statement: "settle an authorization", conditions: [], for_whom: "clients" });
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High", steps: ["fn-2"] }];
  doc.chains[0].flows = ["flow-1"];
  assert.deepEqual(fired(doc, "chain-flow-step-mismatch").map((l) => [l.pointer, l.message]), [["/chains/0/flows/0", "chain ch-1 names flow flow-1, whose steps do not include function fn-1"]]);
  doc.flows[0].steps_partial = true;
  assert.deepEqual(fired(doc, "chain-flow-step-mismatch"), []);
  doc.flows[0].steps = [];
  assert.deepEqual(fired(doc, "chain-flow-step-mismatch"), []);
});

test("chain-flow-no-steps fires on a chain-named flow with empty steps whatever steps_partial says", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High" }];
  doc.chains[0].flows = ["flow-1"];
  const expected = [["/chains/0/flows/0", "chain ch-1 names flow flow-1, which records no steps"]];
  assert.deepEqual(fired(doc, "chain-flow-no-steps").map((l) => [l.pointer, l.message]), expected);
  doc.flows[0].steps = [];
  doc.flows[0].steps_partial = true;
  assert.deepEqual(fired(doc, "chain-flow-no-steps").map((l) => [l.pointer, l.message]), expected);
  assert.deepEqual(fired(doc, "chain-flow-step-mismatch"), []);
});

test("chain-flow-rationale-unnamed reads ids out of the Severity rationale", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "Checkout submission", value_priority: "High" }];
  doc.chains[0].flows = ["flow-1"];
  assert.deepEqual(fired(doc, "chain-flow-rationale-unnamed").map((l) => [l.pointer, l.message]), [["/chains/0/ratings/S", "chain ch-1 names flow flow-1 and its Severity rationale names no flow id"]]);
  doc.chains[0].ratings.S.rationale = "the checkout journey dies, so S is 8";
  assert.deepEqual(fired(doc, "chain-flow-rationale-unnamed").map((l) => [l.pointer, l.message]), [["/chains/0/ratings/S", "chain ch-1 names flow flow-1 and its Severity rationale names no flow id"]]);
  doc.chains[0].ratings.S.rationale = "flow-1 dies at majority radius, so S is 8";
  assert.deepEqual(fired(doc, "chain-flow-rationale-unnamed"), []);
});

test("flow-users-provisional fires while a chain-named flow's users.review is absent or provisional", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High", users: { population: "all shoppers" } }];
  doc.chains[0].flows = ["flow-1"];
  const expected = [["/flows/0/users/review", "flow flow-1 is named by chain ch-1 and its population is not yet re-scored by a named person"]];
  assert.deepEqual(fired(doc, "flow-users-provisional").map((l) => [l.pointer, l.message]), expected);
  doc.flows[0].users!.review = { status: "provisional" };
  assert.deepEqual(fired(doc, "flow-users-provisional").map((l) => [l.pointer, l.message]), expected);
  doc.flows[0].users!.review = { status: "rescored", by: "R. Viewer", date: "2026-10-12" };
  assert.deepEqual(fired(doc, "flow-users-provisional"), []);
});

// The coupling half of the flow link is a reviewer judgement (§4.2, §4.4): two named flows whose
// steps share a provider function can break together from one cause, and no machine rule can read
// that. The test pins the documented reviewer row and that no machine lint fires on the pair.
test("chain-flow-shared-provider is the reviewer rule for a chain naming two flows that share a provider, and no machine lint fires on the pair", () => {
  const doc = readingDoc();
  doc.functions.push({ id: "fn-2", element: "svc", statement: "settle an authorization", conditions: [], for_whom: "clients" });
  doc.flows = [
    { id: "flow-a", name: "A", value_priority: "High", sources: [{ kind: "document", ref: "flow-notes.md" }], users: { population: "all shoppers", review: { status: "rescored", by: "R. Viewer", date: "2026-10-12" } }, steps: ["fn-1"] },
    { id: "flow-b", name: "B", value_priority: "Medium", sources: [{ kind: "document", ref: "flow-notes.md" }], users: { population: "shoppers who retry", review: { status: "rescored", by: "R. Viewer", date: "2026-10-12" } }, steps: ["fn-1", "fn-2"] },
  ];
  doc.chains[0].flows = ["flow-a", "flow-b"];
  doc.chains[0].ratings.S.rationale = "flow-a and flow-b share fn-1; flow-a set the band";
  const row = REFERENCE.split("\n").find((l) => l.startsWith("| `chain-flow-shared-provider` |"));
  assert.ok(row, "quality-and-lint.md documents chain-flow-shared-provider");
  assert.ok(row!.includes("| reviewer |"), "chain-flow-shared-provider is documented as a reviewer rule");
  assert.deepEqual(runLints(doc).map((l) => l.rule), []);
});

// ---- The c1 lint on an edge whose sla or limits the inputs do not state. The assumption texts are
// the 0.7.0 round's prompt-1 documents verbatim, the order store's words are the golden's inputs'.

const UNSTATED = "edge-reliability-unstated";
const PRICING = { id: "pricing", name: "Pricing service", boundary: "owned_outside" as const };
const SLA = "99.9% monthly availability";
function pricingDoc(extra: { sla?: string; limits?: string }, assumptions: Assumption[]): FmeaDocument {
  const doc = graphDoc({ elements: ["checkout", PRICING], edges: [edge("checkout", "pricing", "weak", extra)] });
  doc.meta.assumptions = assumptions;
  return doc;
}
const open = (text: string, owner = "user", status: AssumptionStatus = "open"): Assumption => ({ text, owner, status });
const FIRES = "edge checkout -> pricing: limits is missing or a placeholder, and no open assumption owned by user names pricing and limits. Leave limits out and record that assumption; copy the inputs' words instead only where they say there is none or none is published.";
const FIRES_ONCE: Lint[] = [{ rule: UNSTATED, severity: "warning", pointer: "/dependencies/0", message: FIRES }];
const GOLDEN_PRICING = "The pricing service's request ceiling is not documented in the supplied inputs; the Occurrence rating for pricing-related rows rests on exposure reasoning rather than on a stated limit.";

test("edge-reliability-unstated fires on p1/high/run1's shape: no limits and assumptions that name pricing without a field", () => {
  const doc = pricingDoc({ sla: SLA }, [
    open("pricing's repository is not named in the inputs, so pricing carries no codebase entry and is analysed from its published contract alone."),
    open("The pricing service returns a quote valid for the shopper's session, but no maximum age for a quote held in the cart is stated in the inputs; chk-03 treats the held price as unbounded in age and reads the occurrence gate accordingly. Where the platform team states a maximum age, chk-03's O is to be re-scored."),
  ]);
  assert.deepEqual(fired(doc, UNSTATED), [{ rule: UNSTATED, severity: "warning", pointer: "/dependencies/0", message: FIRES }]);
});

test("edge-reliability-unstated fires on p1/high/run2's shape: a placeholder naming the inputs is unstated", () => {
  const doc = pricingDoc({ sla: SLA, limits: "no rate limit published in the inputs" }, [
    open("pricing's repository is not named in the inputs; pricing stays in the analysis as an element owned outside the run and no repository source is recorded for it."),
  ]);
  assert.deepEqual(fired(doc, UNSTATED), FIRES_ONCE);
});

test("edge-reliability-unstated fires on p1/medium/run1's shape", () => {
  const doc = pricingDoc({ sla: SLA }, [
    open("pricing's repository is not named in the inputs. The run therefore covers acme/checkout and acme/session-auth only, and pricing is analysed as an element owned outside the boundary (owned_outside) with no codebase recorded for it."),
  ]);
  assert.deepEqual(fired(doc, UNSTATED), FIRES_ONCE);
});

test("edge-reliability-unstated is silent on p1/medium/run2's shape: a placeholder beside an assumption naming the provider and its limits", () => {
  const doc = pricingDoc({ sla: SLA, limits: "not stated in the inputs" }, [
    open("The pricing service's 99.9% monthly availability is stated but its scaling limits are not, so no chain rates a capacity mode on pricing and no chain gives it a limits value on its edge."),
  ]);
  assert.deepEqual(fired(doc, UNSTATED), []);
});

test("edge-reliability-unstated is silent on the inputs' stated absence, the order store's words", () => {
  assert.deepEqual(fired(pricingDoc({ sla: "99.99% monthly", limits: "no published request ceiling" }, []), UNSTATED), []);
});

test("edge-reliability-unstated is silent on the golden's assumption, which names the provider and a ceiling", () => {
  assert.deepEqual(fired(pricingDoc({ sla: "99.9% monthly" }, [open(GOLDEN_PRICING)]), UNSTATED), []);
});

test("edge-reliability-unstated: an assumption that is closed, or owned by someone else, does not silence", () => {
  const closed = fired(pricingDoc({ sla: "99.9% monthly" }, [open(GOLDEN_PRICING, "user", "closed")]), UNSTATED);
  assert.deepEqual(closed, FIRES_ONCE);
  const reviewers = fired(pricingDoc({ sla: "99.9% monthly" }, [open(GOLDEN_PRICING, "A. Reviewer")]), UNSTATED);
  assert.deepEqual(reviewers, FIRES_ONCE);
});

test("edge-reliability-unstated: both fields unstated give two findings, sla first, on the same pointer", () => {
  const lints = fired(pricingDoc({ limits: "TBD" }, []), UNSTATED);
  assert.equal(lints.length, 2);
  assert.deepEqual(lints.map((l) => [l.rule, l.severity, l.pointer]), [[UNSTATED, "warning", "/dependencies/0"], [UNSTATED, "warning", "/dependencies/0"]]);
  assert.ok(lints[0].message.startsWith("edge checkout -> pricing: sla is missing or a placeholder"), lints[0].message);
  assert.ok(lints[1].message.startsWith("edge checkout -> pricing: limits is missing or a placeholder"), lints[1].message);
});

test("edge-reliability-unstated: the run-placeholder pattern matches whole words, case-insensitively, and an empty string", () => {
  for (const v of ["Unknown", "n/a", "tbd", "None stated", "not documented", ""]) {
    assert.deepEqual(fired(pricingDoc({ sla: SLA, limits: v }, []), UNSTATED), FIRES_ONCE, v);
  }
  for (const v of ["50 rps per merchant", "99.9% monthly"]) {
    assert.deepEqual(fired(pricingDoc({ sla: SLA, limits: v }, []), UNSTATED), [], v);
  }
});

test("edge-reliability-unstated: the provider is matched as a whole token by id or name, so pricing does not stand in for checkout.pricing-cache, and one assumption silences every field of its edge", () => {
  const cacheDoc = (assumptions: Assumption[]): FmeaDocument => {
    const doc = graphDoc({
      elements: ["checkout", PRICING, { id: "checkout.pricing-cache", name: "Pricing cache" }],
      edges: [edge("checkout", "pricing", "weak", { sla: SLA }), edge("checkout", "checkout.pricing-cache", "weak")],
    });
    doc.meta.assumptions = assumptions;
    return doc;
  };
  const pricing = open("pricing's scaling limits are not stated in the inputs.");
  const cache = open("checkout.pricing-cache's sla is not stated in the inputs.");
  const onPricing = fired(cacheDoc([pricing]), UNSTATED);
  assert.deepEqual(onPricing.map((l) => l.pointer), ["/dependencies/1", "/dependencies/1"]);
  assert.deepEqual(fired(cacheDoc([cache]), UNSTATED), FIRES_ONCE);
  assert.deepEqual(fired(cacheDoc([pricing, cache]), UNSTATED), []);
});

test("edge-reliability-unstated: the provider id at the end of a sentence still counts, and a dot that continues a dotted id does not", () => {
  assert.deepEqual(fired(pricingDoc({ sla: SLA }, [open("No scaling limit is stated for pricing.")]), UNSTATED), []);
  assert.deepEqual(fired(pricingDoc({ sla: SLA }, [open("No scaling limit is stated for the Pricing service.")]), UNSTATED), []);
  assert.deepEqual(fired(pricingDoc({ sla: SLA }, [open("No scaling limit is stated for pricing.cache.")]), UNSTATED), FIRES_ONCE);
});

test("edge-reliability-unstated: a field word matches as a whole word, so a substring does not silence", () => {
  assert.deepEqual(fired(pricingDoc({ sla: SLA }, [open("pricing's configuration is to be separately reviewed")]), UNSTATED), FIRES_ONCE);
  assert.deepEqual(fired(pricingDoc({ sla: SLA }, [open("pricing's rate limit is not stated")]), UNSTATED), []);
});

// The renamed provider's name holds none of its id, so only the escaped name can silence the edge.
test("edge-reliability-unstated's provider match is case-insensitive, escaped and bounded on both sides", () => {
  assert.deepEqual(fired(pricingDoc({ sla: SLA }, [open("No scaling limit is stated for PRICING.")]), UNSTATED), []);
  assert.deepEqual(fired(pricingDoc({ sla: SLA }, [open("pricing's SLA is unknown")]), UNSTATED), []);
  assert.deepEqual(fired(pricingDoc({ sla: SLA }, [open("checkout.pricing has no stated limit")]), UNSTATED), FIRES_ONCE);
  assert.deepEqual(fired(pricingDoc({ sla: SLA }, [open("pricing-cache has no stated limit")]), UNSTATED), FIRES_ONCE);
  const renamed = pricingDoc({ sla: SLA }, [open("Quote engine (v2)'s rate limit is not stated")]);
  renamed.elements[1].name = "Quote engine (v2)";
  assert.deepEqual(fired(renamed, UNSTATED), []);
});

test("edge-reliability-unstated: minimalDoc and readingDoc stay silent", () => {
  assert.deepEqual(fired(minimalDoc(), UNSTATED), []);
  assert.deepEqual(runLints(readingDoc()), []);
});

// ---- The c11 lint on a conversion whose default rationale meta.history does not count. The
// history entries are the 0.7.0 round's prompt-6 documents verbatim, each named by its source.

const UNRECORDED = "conversion-substitution-unrecorded";
const MESSAGE = (r: number): string => `${r} row(s) carry the default rationale, and no meta.history clause names rationale with that count or with those rows' chain ids or element names. Keep the default, and add that clause to meta.history, not to an assumption or a row's history.`;
const unrecorded = (r: number): Lint[] => [{ rule: UNRECORDED, severity: "warning", pointer: "/meta/history", message: MESSAGE(r) }];
const DEFAULT_RATIONALE = "converted from legacy-rpn-sheet.csv; no rationale recorded";

/** minimalDoc over the legacy sheet's four rows: chains ch-1 to ch-4, each on its own function fn-1
 *  to fn-4 of its own element. The chains `defaultChainIds` names carry the default S rationale,
 *  and meta.history holds one entry per change. */
function convertedDoc(defaultChainIds: string[], changes: string[]): FmeaDocument {
  const doc = minimalDoc();
  const base = doc.chains[0];
  doc.elements = [
    newElement("checkout-api", { name: "Checkout API" }),
    newElement("payment-gateway", { name: "Payment Gateway", boundary: "third_party" }),
    newElement("order-store", { name: "Order Store" }),
    newElement("pricing-service", { name: "Pricing Service" }),
  ];
  doc.functions = doc.elements.map((el, i) => ({ id: `fn-${i + 1}`, element: el.id, statement: "serve requests", conditions: [], for_whom: "clients" }));
  doc.chains = doc.functions.map((fn, i): Chain => ({ ...clone(base), id: `ch-${i + 1}`, function: fn.id }));
  for (const chain of doc.chains) {
    if (defaultChainIds.includes(chain.id)) chain.ratings.S.rationale = DEFAULT_RATIONALE;
  }
  doc.meta.history = changes.map((change) => ({ version: 1, date: "2026-10-13", change }));
  return doc;
}

// build/evals/flow-model/p6/high/run1/analysis.json, meta.history[0].change.
const P6_HIGH_RUN1 = "Converted from inputs/legacy-rpn-sheet.csv (Prepared by J. Legacy; Date 2025-11-30) to the fmea-software schema v3. Column mapping: Item -> elements[].name, and, with no type/owner/external column, elements[].kind and elements[].boundary typed by the converter from the item text (Checkout API = interface, Payment Gateway = service, Order Store = datastore, Pricing Service = service; all in_scope); Function -> functions[].statement; Failure Mode -> chains[].failure_mode; Effect -> chains[].effects.end; Cause -> chains[].causes[].text; Current Controls -> chains[].controls[], the leading 'Detection:'/'Prevention:' token read as controls[].kind and the remainder as controls[].description; S, O, D -> chains[].ratings.S/O/D.value; Justification -> chains[].ratings.*.rationale; Recommended Action -> chains[].actions[].description; Owner -> chains[].actions[].owner (the action owner, never an element owner); Status -> chains[].actions[].status. Declared substitutions, with row counts: elements[].security_relevant set false on 4 rows; chains[].effects.local and chains[].effects.next_level set to the default 'converted from inputs/legacy-rpn-sheet.csv; no local effect recorded' and 'converted from inputs/legacy-rpn-sheet.csv; no next-level effect recorded' on 4 rows each; functions[].for_whom set to the default 'converted from inputs/legacy-rpn-sheet.csv; no consumer recorded in the sheet' on 4 rows; chains[].ratings.*.evidence_kind set to estimate on 12 ratings; chains[].ratings.*.review set to status authored, by 'J. Legacy', date '2025-11-30' on 12 ratings; chains[].ratings.*.rationale set to the default 'converted from inputs/legacy-rpn-sheet.csv; no rationale recorded' on 1 rating column (the Payment Gateway row, whose Justification cell is empty), the other 3 rows carrying the sheet's Justification text; chains[].controls[].status set to existing on 4 rows; chains[].controls[].evidence.kind set to none on 4 rows; chains[].actions[].target_date set to the conversion date 2026-10-13 on 4 rows, the sheet recording no target date; chains[].id generated as row-1 .. row-4 from the sheet's row order, the sheet carrying no row id. Empty-trigger note: the sheet records no trigger, so chains[].trigger is omitted on all 4 rows. No edge is written: the sheet carries no type/external/strength/SLA/limits column, so dependencies[] is empty. No codebase is added and no cause link is written: the conversion adds neither, both being later work for a person through an ordinary update. RPN note: the Order Store row states RPN 200 while its retained S 7, O 5 and D 6 multiply to 210; priority.rpn is the computed 210 and the sheet's stated 200 is kept in that row's history[]. No flows are authored, the sheet carrying no flow column.";

// build/evals/flow-model/p6/high/run2/analysis.json, meta.history[0].change.
const P6_HIGH_RUN2 = "Converted from legacy-rpn-sheet.csv (sheet author J. Legacy, sheet date 2025-11-30) on 2026-10-13. Column mapping: Item -> elements[].name, and through its slug elements[].id; Function -> functions[].statement; Failure Mode -> chains[].failure_mode; Effect -> chains[].effects.end; Cause -> chains[].causes[0].text; Current Controls -> chains[].controls[], the cell's 'Prevention: ' or 'Detection: ' prefix read into controls[].kind and the remainder into controls[].description; S, O and D -> chains[].ratings.{S,O,D}.value; Recommended Action -> chains[].actions[].description; Owner -> chains[].actions[].owner (the action owner, never an element owner); Status -> chains[].actions[].status; Justification -> chains[].ratings.*.rationale. The sheet's RPN column is not converted: priority.ts computes priority.rpn as the product of the retained values, and the sheet's stated RPN is carried in a row's history[] only where it differs. Declared substitutions and the rows they cover: elements[].kind typed by the converter from the item text, 4 rows (Checkout API -> interface, by the tie-break for an item named as an API with no deployable of its own named; Payment Gateway -> service; Order Store -> datastore; Pricing Service -> service); elements[].boundary in_scope, 4 rows, no type, owner-as-role or external column being present; elements[].security_relevant false, 4 rows, the sheet and its item text saying nothing about security; elements[].description 'converted from legacy-rpn-sheet.csv; no description recorded', 4 rows; functions[].for_whom derived from the sheet's Function and Effect text, 4 rows; functions[].conditions empty, 4 rows; chains[].effects.local and chains[].effects.next_level the declared defaults, 4 rows, the sheet carrying a single Effect column mapped to effects.end; chains[].causes[0].origin absent, 4 rows, the sheet classifying no cause; chains[].trigger empty, 4 rows, the sheet recording no trigger (noted here as the conversion rules require); chains[].controls[].status existing, 4 rows, and controls[].evidence.kind none, 4 rows, the sheet recording no control evidence; chains[].ratings.*.evidence_kind estimate, 12 ratings, the sheet carrying no evidence-kind column; chains[].ratings.*.review status authored, by the sheet's Prepared-by name J. Legacy, dated the sheet's date 2025-11-30, 12 ratings; chains[].actions[].target_date the conversion date 2026-10-13, 4 actions, the sheet carrying no target-date column; chains[].id generated from the item and failure mode, 4 rows, the sheet carrying no row-id column. Dependency edges: the sheet carries no strength, SLA or scaling-limit column and lists no item outside the boundary, so dependencies[] is empty and no edge assumption is recorded. No cause is linked to another row's failure mode, no flow is authored and no codebase is added, as the conversion rules require; linking and codebase assignment are later work for the person through an ordinary update. The Order Store row states RPN 200 where the retained S, O and D values give 210; that stated value is recorded in that chain's history[] and is never used to rank. meta.scales.version is 2, the version of references/scales-software.md at conversion time.";

// build/evals/flow-model/p6/medium/run1/analysis.json, meta.history[0].change.
const P6_MEDIUM_RUN1 = "Converted from legacy-rpn-sheet.csv (prepared by J. Legacy, dated 2025-11-30) on 2026-10-13. Column mapping: Item -> elements[].name; Function -> functions[].statement; Failure Mode -> chains[].failure_mode; Effect -> chains[].effects.end; Cause -> chains[].causes[0].text; Current Controls -> chains[].controls[], with the sheet's 'Detection:' and 'Prevention:' prefixes read as the control's kind and status set to existing; S, O and D -> chains[].ratings.S, .O and .D as authored values with review.status 'authored', by 'J. Legacy' and date '2025-11-30'; RPN -> never copied into priority.rpn, which is the product of the three retained ratings, and the sheet's stated value is recorded in that chain's history[] where it differs; Recommended Action -> chains[].actions[0].description; Owner -> chains[].actions[0].owner (the sheet's Owner is the action owner, never an element owner); Status -> chains[].actions[0].status; Justification -> chains[].ratings[].rationale. Substitutions, each a declared default and not an invented input: the sheet has no type, boundary, external, strength, SLA or limits column, so every item is typed by the boundary and role tests applied to its item text and its boundary is in_scope (4 rows); security_relevant is false on all four elements (4 rows); ratings[].evidence_kind is 'estimate' (12 ratings across 4 rows); controls[].evidence.kind is 'none' (4 controls across 4 rows); effects.local and effects.next_level carry the default text 'not recorded in legacy-rpn-sheet.csv; the sheet carries a single Effect column' (8 fields across 4 rows); functions[].for_whom is derived from the function text because the sheet records no for-whom column (4 rows); actions[].target_date is the conversion date 2026-10-13 because the sheet records no target date (4 rows); ratings[].rationale is 'converted from legacy-rpn-sheet.csv; no rationale recorded' on the one row whose Justification cell is empty, and the sheet's Justification text on the other three. trigger is empty on all four chains: the sheet records no trigger column. No item is outside the boundary and no row carries a strength, an SLA or a limit, so dependencies[] is empty. The conversion adds no chain link, even where a Cause cell restates another row's Failure Mode, and no codebase; meta.scales.version is 2, from the 'scales version: 2' line of references/scales-software.md. Rows: checkout-api-1 (S6 O4 D5; sheet RPN 120), payment-gateway-1 (S8 O6 D3; sheet RPN 144), order-store-1 (S7 O5 D6; sheet states RPN 200 where S times O times D is 210), pricing-service-1 (S4 O5 D2; sheet RPN 40).";

// build/evals/flow-model/p6/medium/run2/analysis.json, meta.history[0].change and meta.history[1].change.
const P6_MEDIUM_RUN2 = [
  "Converted from the legacy RPN sheet legacy-rpn-sheet.csv (header rows 'Prepared by' J. Legacy and 'Date' 2025-11-30; data columns Item, Function, Failure Mode, Effect, Cause, Current Controls, S, O, D, RPN, Recommended Action, Owner, Status, Justification). Column mapping: Item -> elements[].name; Function -> functions[].statement; Failure Mode -> chains[].failure_mode; Effect -> chains[].effects.end; Cause -> chains[].causes[].text; Current Controls -> chains[].controls[] (the 'Prevention:' or 'Detection:' prefix selects controls[].kind, the remainder is the description); S -> chains[].ratings.S.value; O -> chains[].ratings.O.value; D -> chains[].ratings.D.value; RPN -> unmapped (priority.rpn is computed as S x O x D and is never copied from the sheet); Recommended Action -> chains[].actions[].description; Owner -> chains[].actions[].owner (the action owner, never an element owner); Status -> chains[].actions[].status; Justification -> chains[].ratings[].rationale.",
  "Declared substitutions and conversion notes. No type, owner or external column maps to a role or a boundary, so each item was typed by the boundary and role tests applied to the item text ('typed by the converter from the item text'): checkout-api as an interface (named as an API with no deployable of its own named), payment-gateway and pricing-service as services, order-store as a datastore; all four are in_scope. Substituted fields: security_relevant false on 4 elements (the sheet states no security property); effects.local and effects.next_level on 8 fields with the default 'not recorded in legacy-rpn-sheet.csv' (the sheet has a single Effect column, mapped to effects.end); causes origin and adversarial left unset on 4 causes (the sheet does not classify them); ratings[].evidence_kind 'estimate' on 12 ratings (the sheet carries no evidence-kind column); controls[].status 'existing' on 4 controls and controls[].evidence.kind 'none' on 4 controls (the sheet carries no evidence column); actions[].target_date on 4 actions with the conversion date 2026-10-13 (the sheet states none); functions[].for_whom on 4 fields, from the consumer named in the row's own text where one is named and otherwise the default 'not recorded in legacy-rpn-sheet.csv'; functions[].conditions empty on 4 functions. chains[].trigger is left empty on all four rows and each row is flagged for it; the sheet's Cause column is the only causal text and names no separate initiating event. Ratings are the sheet's authored values, kept with review.status 'authored', by the sheet's stated author J. Legacy and the sheet's date 2025-11-30; they were not re-rated. No dependencies[] edge is written: the sheet names no outside item and no strength, SLA or limit for any item, so dependencies is empty. The conversion adds no cause link and no codebase. On chain-03 (Order Store) the sheet's stated RPN 200 differs from the computed S x O x D product 7 x 5 x 6 = 210; the sheet's value is recorded in that row's history[].",
];

test("conversion-substitution-unrecorded is silent on p6/high/run1's history, which counts the substitution on 1 rating column", () => {
  assert.deepEqual(fired(convertedDoc(["ch-2"], [P6_HIGH_RUN1]), UNRECORDED), []);
});

test("conversion-substitution-unrecorded fires on p6/high/run2's history, whose only rationale clause is the column mapping", () => {
  assert.deepEqual(fired(convertedDoc(["ch-2"], [P6_HIGH_RUN2]), UNRECORDED), [{ rule: UNRECORDED, severity: "warning", pointer: "/meta/history", message: MESSAGE(1) }]);
});

test("conversion-substitution-unrecorded is silent on p6/medium/run1's history, which says the one row", () => {
  assert.deepEqual(fired(convertedDoc(["ch-2"], [P6_MEDIUM_RUN1]), UNRECORDED), []);
});

test("conversion-substitution-unrecorded fires on p6/medium/run2's two history entries", () => {
  assert.deepEqual(fired(convertedDoc(["ch-2"], P6_MEDIUM_RUN2), UNRECORDED), unrecorded(1));
});

test("conversion-substitution-unrecorded is silent on the shipped expected conversion, which records 1 of 4 rows", () => {
  const doc = loadFixture<FmeaDocument>("legacy-rpn-sheet.expected.fmea.json");
  assert.equal(doc.chains[1].ratings.S.rationale, DEFAULT_RATIONALE, "its ch-2 carries the default");
  assert.deepEqual(fired(doc, UNRECORDED), []);
});

test("conversion-substitution-unrecorded: a date, a chain id ending in -1, a longer number, an underscore and a letter are not the count: digits adjacent to a letter, a digit, - or _ do not count", () => {
  for (const change of ["rationale mapped on 2026-10-13 from row ch-1", "rationale defaulted on 10 rows", "rationale defaulted on row_1", "rationale defaulted on v1", "rationale defaulted on rows 1-4"]) {
    assert.deepEqual(fired(convertedDoc(["ch-2"], [change]), UNRECORDED), unrecorded(1), change);
  }
  assert.deepEqual(fired(convertedDoc(["ch-1"], ["ratings.rationale substituted with the default on 1 row"]), UNRECORDED), []);
});

test("conversion-substitution-unrecorded: the number word, or every default row named by its id or its element's name, records it; a clause boundary separates the count from the word", () => {
  for (const change of ["rationale defaulted on two rows", "Rationale defaulted on Two rows", "rationale defaulted on ch-1 and ch-2"]) {
    assert.deepEqual(fired(convertedDoc(["ch-1", "ch-2"], [change]), UNRECORDED), [], change);
  }
  assert.deepEqual(fired(convertedDoc(["ch-2"], ["rationale defaulted on the Payment Gateway row"]), UNRECORDED), []);
  assert.deepEqual(fired(convertedDoc(["ch-2"], ["Justification -> ratings.S.rationale one-to-one"]), UNRECORDED), unrecorded(1), "a hyphen beside the word is not the count");
  for (const change of ["rationale defaulted on the Payment Gateway row", "rationale defaulted on ch-1", "rationale substituted. 2 rows took the default", "rationale substituted; 2 rows took the default", "rationale defaulted on 3 rows"]) {
    assert.deepEqual(fired(convertedDoc(["ch-1", "ch-2"], [change]), UNRECORDED), unrecorded(2), change);
  }
});

// Five spaces in a row: an unguarded whole-token match of a three-space name needs a space on each side.
test("conversion-substitution-unrecorded: one row named by id and one by element name record it, and a name of spaces names no row", () => {
  assert.deepEqual(fired(convertedDoc(["ch-1", "ch-2"], ["rationale defaulted on ch-1 and the Payment Gateway row"]), UNRECORDED), []);
  assert.deepEqual(fired(convertedDoc(["ch-1", "ch-2"], ["rationale defaulted on ch-1 and ch-9"]), UNRECORDED), unrecorded(2));
  const blank = convertedDoc(["ch-2"], [`rationale substituted on the${" ".repeat(5)}row`]);
  blank.elements[1].name = "   ";
  assert.deepEqual(fired(blank, UNRECORDED), unrecorded(1));
});

test("conversion-substitution-unrecorded: the inputs/ prefix on the default still counts, and a rationale that is not the default never does", () => {
  const prefixed = convertedDoc([], []);
  prefixed.chains[2].ratings.O.rationale = "converted from inputs/legacy-rpn-sheet.csv; no rationale recorded";
  prefixed.chains[2].ratings.D.rationale = "converted from inputs/legacy-rpn-sheet.csv; no rationale recorded";
  assert.deepEqual(fired(prefixed, UNRECORDED), unrecorded(1), "two default ratings on one chain are one row");
  const own = convertedDoc([], []);
  own.chains[0].ratings.S.rationale = "the sheet's own words";
  assert.deepEqual(fired(own, UNRECORDED), []);
});

test("conversion-substitution-unrecorded: minimalDoc stays silent", () => {
  assert.deepEqual(fired(minimalDoc(), UNRECORDED), []);
});
