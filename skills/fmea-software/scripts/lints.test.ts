import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASCADING_ROWS, MACHINE_RULES, formatLintLine, runLints, tablePropertyLints } from "./lib/lints.ts";
import { loadTable } from "./lib/table.ts";
import { validateDocument } from "./lib/validation.ts";
import { SKILL_ROOT, bandTable, citeO, clone, edge, graphDoc, loadFixture, minimalDoc, newElement, rating, readingDoc } from "./test-helpers.ts";
import type { Assumption, AssumptionStatus, Chain, Codebase, Control, Effects, FmeaDocument, Lint, Source, TrackerLink } from "./lib/types.ts";

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
  assert.deepEqual(fired(doc, "chain-flow-rationale-unnamed").map((l) => [l.pointer, l.message]), [["/chains/0/ratings/S", "chain ch-1 names flow flow-1 and its Severity rationale names none of the flows the chain names"]]);
  doc.chains[0].ratings.S.rationale = "the checkout journey dies, so S is 8";
  assert.deepEqual(fired(doc, "chain-flow-rationale-unnamed").map((l) => [l.pointer, l.message]), [["/chains/0/ratings/S", "chain ch-1 names flow flow-1 and its Severity rationale names none of the flows the chain names"]]);
  doc.chains[0].ratings.S.rationale = "flow-1 dies at majority radius, so S is 8";
  assert.deepEqual(fired(doc, "chain-flow-rationale-unnamed"), []);
});

test("chain-flow-rationale-unnamed reads a flow id followed by a final full stop, a colon or an ellipsis, and not one inside a longer id", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "Checkout submission", value_priority: "High" }];
  doc.chains[0].flows = ["flow-1"];
  for (const rationale of ["S is 8, the band read over the worst single flow, flow-1.", "flow-1: shoppers lose checkout, so S is 8", "S is 8 over flow-1... which dies at majority radius"]) {
    doc.chains[0].ratings.S.rationale = rationale;
    assert.deepEqual(fired(doc, "chain-flow-rationale-unnamed"), [], rationale);
  }
  for (const rationale of ["myflow-1x dies, so S is 8", "flow-1.cache dies, so S is 8", "flow-10 dies, so S is 8"]) {
    doc.chains[0].ratings.S.rationale = rationale;
    assert.equal(fired(doc, "chain-flow-rationale-unnamed").length, 1, rationale);
  }
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

// ---- Ruling 5 of the stage-1 gate (spec §11.5): the prose-0 baseline's pricing edges. Each limits
// value and each assumption that names pricing is copied verbatim from
// build/evals/prose-0/<prompt>/<capability>/<run>/analysis.json; the other edges are stated there.

test("edge-reliability-unstated: the placeholder pattern reads none recorded and none published, and the inputs test reads the design and supplied inputs", () => {
  for (const v of ["none recorded", "None Published", "nothing in the design inputs", "nothing in the supplied inputs", "nothing in the inputs"]) {
    assert.deepEqual(fired(pricingDoc({ sla: SLA, limits: v }, []), UNSTATED), FIRES_ONCE, v);
  }
  for (const v of ["nothing in the provider's inputs", "nothing recorded"]) {
    assert.deepEqual(fired(pricingDoc({ sla: SLA, limits: v }, []), UNSTATED), [], v);
  }
});

test("edge-reliability-unstated fires on prose-0's p5/high/run2: none published in the design inputs, beside two assumptions that name pricing and no field", () => {
  const doc = pricingDoc({ sla: SLA, limits: "none published in the design inputs" }, [
    open("pricing's repository is not named in the design inputs and is not part of this run. No entry is written for it in meta.codebases and no qualified repo source ref names it. Because the run covers two codebases (acme/checkout and acme/session-auth), no repo source ref of any kind is written, so that the repo-ref-form lint's consistency requirement is not broken by refs whose commits the inputs do not state."),
    open("A weak-edge disagreement is recorded for review: the edge checkout to pricing is classified weak, and the end effect of chain-6-pricing-unavailable is in the loss-of-access class, so the classification and the effect disagree. Severity is rated on the end effect as written, and the edge's strength is left as the design inputs classify it, for a named person to confirm."),
  ]);
  assert.deepEqual(fired(doc, UNSTATED), FIRES_ONCE);
});

// The prose-0 judge scored c1 0 here, neither pricing assumption asking for the limit; the per-edge
// rule reads `availability` in the repository one as a field word, so the edge stays silenced. The
// c-03 one holds no field word and silences nothing. Ruling 5 keeps the per-edge rule.
test("edge-reliability-unstated reads prose-0's p1/medium/run2 none recorded, and of its two pricing assumptions the repository one, which holds the word availability, silences the edge: a known gap", () => {
  const repository = open("The pricing service's repository is not named in the inputs, so pricing carries no codebase entry and no repository source reference; its functions and modes are read from the published contract and the recorded availability commitment alone.");
  const coupled = open("Chain c-03 names flow-checkout and flow-retry, whose steps share the pricing and payment-gateway provider functions; the two flows are coupled through those providers and the row is rated on the flows as named.");
  assert.deepEqual(fired(pricingDoc({ sla: SLA, limits: "none recorded" }, []), UNSTATED), FIRES_ONCE);
  assert.deepEqual(fired(pricingDoc({ sla: SLA, limits: "none recorded" }, [coupled]), UNSTATED), FIRES_ONCE);
  assert.deepEqual(fired(pricingDoc({ sla: SLA, limits: "none recorded" }, [repository, coupled]), UNSTATED), []);
});

test("edge-reliability-unstated is silent on prose-0's p5/medium/run1, whose limits is a fallback sentence neither pattern reads: a known gap", () => {
  const doc = pricingDoc({ sla: SLA, limits: "Checkout falls back to the last quoted price held in the cart when pricing does not answer." }, [
    open("pricing's repository is not named in the inputs, so pricing enters the analysis as an owned_outside element with no meta.codebases entry and no codebase on the element."),
  ]);
  assert.deepEqual(fired(doc, UNSTATED), []);
});

// Ruling 5: the copied-words case stays with the judge, since no text test tells it from a stated absence.
test("edge-reliability-unstated is silent on prose-0's p1/medium/run1, which gave pricing the order store's words", () => {
  const doc = pricingDoc({ sla: SLA, limits: "no published request ceiling" }, [
    open("The pricing service is owned by the platform team and its repository is not named in the inputs, so pricing is not an entry in meta.codebases and no repo source is recorded for it; it stays in the analysis as a root element owned outside the boundary, with the outputs of its published contract as its sources."),
  ]);
  assert.deepEqual(fired(doc, UNSTATED), []);
});

// ---- The c11 lint on a conversion whose default rationale meta.history does not count. The
// history entries are the 0.7.0 round's prompt-6 documents verbatim, each named by its source.

const UNRECORDED = "conversion-substitution-unrecorded";
const MESSAGE = (r: number): string => `${r} row(s) carry the default rationale, and no meta.history clause names rationale with that count or with those rows' chain ids or element names. Keep the default, and add that clause to meta.history, not to an assumption or a row's history.`;
const unrecorded = (r: number): Lint[] => [{ rule: UNRECORDED, severity: "warning", pointer: "/meta/history", message: MESSAGE(r) }];
const DEFAULT_RATIONALE = "converted from legacy-rpn-sheet.csv; no rationale recorded";

/** minimalDoc over the legacy sheet's four rows: chains ch-1 to ch-4, each on its own function fn-1
 *  to fn-4 of its own element. The chains `defaultChainIds` names carry the default S rationale,
 *  and meta.history holds one entry per change. Each chain's local and next-level effect names its
 *  own element and no chain has a control, so of a conversion's defaults only the rationale applies. */
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
  doc.chains = doc.functions.map((fn, i): Chain => ({
    ...clone(base), id: `ch-${i + 1}`, function: fn.id,
    effects: { ...base.effects, local: `${fn.element} stops answering`, next_level: `${fn.element}'s callers time out` },
  }));
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

test("conversion-substitution-unrecorded: the default counts in sentence case, with a final full stop, or with spaces around it", () => {
  for (const rationale of ["Converted from legacy-rpn-sheet.csv; no rationale recorded", "converted from legacy-rpn-sheet.csv; no rationale recorded.", "CONVERTED FROM legacy-rpn-sheet.csv; No rationale recorded.", "  converted from legacy-rpn-sheet.csv; no rationale recorded "]) {
    const doc = convertedDoc([], []);
    doc.chains[1].ratings.S.rationale = rationale;
    assert.deepEqual(fired(doc, UNRECORDED), unrecorded(1), rationale);
  }
});

test("conversion-substitution-unrecorded: minimalDoc stays silent", () => {
  assert.deepEqual(fired(minimalDoc(), UNRECORDED), []);
});

// ---- Ruling 4 of the stage-1 gate (spec §11.5): in a conversion of two chains or more, the four
// other defaults a conversion declares. The history entries are the stage-1 round's prompt-6
// documents verbatim, each named by its source; the judge's c11 evidence in
// build/evals/prose-1/results.json names the default each failing run left uncounted.

const DEFAULT_MESSAGE = (count: number, unit: string, field: string): string => `${count} ${unit}(s) carry the default ${field}, and no meta.history clause names ${field} with that count or with those rows' chain ids or element names. Keep the default, and add that clause to meta.history, not to an assumption or a row's history.`;
const TYPING_MESSAGE = (count: number): string => `${count} element(s) carry the default typing, and no meta.history clause names the typing with that count or with every element's id or name. Keep the typing, and add that clause to meta.history, not to an assumption, a ground rule or a row's history.`;
const unrecordedDefaults = (...found: [number, string, string][]): Lint[] =>
  found.map(([count, unit, field]) => ({ rule: UNRECORDED, severity: "warning", pointer: "/meta/history", message: unit === "element" ? TYPING_MESSAGE(count) : DEFAULT_MESSAGE(count, unit, field) }));
const FOUR_DEFAULTS = ["status", "evidence.kind", "effects.local", "effects.next_level"];
const SHEET = "Converted from legacy-rpn-sheet.csv";
const RATIONALE_1 = "rationale defaulted on 1 row";
const KIND_4 = "evidence_kind estimate on 4 rows";
const TYPING_4 = "typing by the converter on 4 elements";
// The rationale and the two defaults of §11.6 ruling 3 recorded, so a test of the four control and
// effect defaults reads those four alone.
const RECORDED_3 = `${RATIONALE_1}; ${KIND_4}; ${TYPING_4}`;

/** convertedDoc with ch-2's default rationale and the conversion's four other defaults applied, as
 *  the legacy sheet's conversion writes them: one control per chain with status existing and
 *  evidence kind none, and the same local and next-level effect on every chain. Every rating is an
 *  estimate, as minimalDoc's are, and there are four elements, so the ratings' evidence_kind and
 *  the elements' typing are defaults of it as well. */
function defaultedDoc(changes: string[]): FmeaDocument {
  const doc = convertedDoc(["ch-2"], changes);
  for (const chain of doc.chains) {
    chain.effects = { ...chain.effects, local: "converted from legacy-rpn-sheet.csv; no local effect recorded", next_level: "converted from legacy-rpn-sheet.csv; no next-level effect recorded" };
    chain.controls = [{ ...clone(detectionControl), evidence: { kind: "none" } }];
  }
  return doc;
}

/** The field each c11 finding of `doc` names, in order. */
function unrecordedFields(doc: FmeaDocument): string[] {
  return fired(doc, UNRECORDED).map((l) => /carry the default (\S+), and/.exec(l.message)?.[1] ?? l.message);
}

// build/evals/prose-1/p6/high/run1/analysis.json, meta.history[0].change, meta.history[1].change and meta.history[2].change.
const PROSE1_HIGH_RUN1 = [
  "Converted from legacy-rpn-sheet.csv, whose header states 'Prepared by' J. Legacy and 'Date' 2025-11-30. Columns used: Item -> elements[].id and elements[].name; Function -> functions[].statement; Failure Mode -> chains[].failure_mode; Effect -> chains[].effects.end; Cause -> chains[].causes[].text; Current Controls -> chains[].controls[]; S, O, D -> chains[].ratings.S, chains[].ratings.O and chains[].ratings.D; RPN -> kept for reference and comparison in priority.rpn and never used to rank; Recommended Action -> chains[].actions[].description; Owner -> chains[].actions[].owner, the action owner and never an element owner; Status -> chains[].actions[].status; Justification -> chains[].ratings[].rationale. The Current Controls column carries the control kind as a 'Detection: ' or 'Prevention: ' prefix, which the converter reads as chains[].controls[].kind and strips from the description. Typing decisions, each typed by the converter from the item text: checkout-api is an interface, an item named as an API with no deployable of its own named; payment-gateway is a service; order-store is a datastore; pricing-service is a service. Boundary decisions, each typed by the converter from the item text: all four items take boundary in_scope, the sheet's item text placing none of them outside the organisation's control.",
  "Declared substitutions of the conversion from legacy-rpn-sheet.csv, each a default and not an invented input: boundary in_scope on 4 elements; security_relevant false on 4 elements; description on 4 elements; source ref on 4 elements; for_whom on 4 functions; conditions empty on 4 functions; effects.local and effects.next_level on 4 chains; target_date on 4 actions; evidence_kind estimate on 12 ratings; controls evidence.kind none on 4 controls; trigger left empty on 4 chains; rationale 1 row (the Payment Gateway row, whose Justification cell is empty); meta.scales.version set to 2, the 'scales version: 2' line of scales-software.md at conversion time. The sheet carries no strength, SLA or limits for any item, so the conversion writes no entry of dependencies[], and it adds no cause-chain link and lists no codebase.",
  "What the conversion deliberately leaves for later work: the conversion adds no cause-chain link, even where a Cause cell restates another row's Failure Mode, and runs no linking pass; it lists no codebase; it writes no dependency edge, the sheet carrying no strength, an SLA or limits for any item; and it leaves trigger empty on every chain, the sheet naming no initiating event. Each of these is later work for the person through an ordinary update, and so are the flows, the incident records and the control inventory the design-inputs checklist asks for.",
];

// build/evals/prose-1/p6/high/run2/analysis.json, meta.history[0].change.
const PROSE1_HIGH_RUN2 = [
  "Converted from legacy-rpn-sheet.csv by the skill's conversion mode; the sheet is dated 2025-11-30 and prepared by J. Legacy, and those are the ratings' authored by and date. Columns used: Item -> elements[].name and elements[].id; Function -> functions[].statement; Failure Mode -> chains[].failure_mode; Effect -> chains[].effects.end; Cause -> chains[].causes[].text; Current Controls -> chains[].controls[].kind, taken from the cell's leading Detection: or Prevention: label, and chains[].controls[].description, that label removed; S, O and D -> chains[].ratings.S, .O and .D; RPN -> no field, the sheet's value kept only in a row's history where it differs from S x O x D; Recommended Action -> chains[].actions[].description; Owner -> chains[].actions[].owner and never an element owner; Status -> chains[].actions[].status; Justification -> chains[].ratings.*.rationale. Element typing: the sheet carries no type, owner-boundary or external column, so all 4 elements were typed by the converter from the item text, by the boundary and role tests of structure-elements.md: checkout-api, payment-gateway and pricing-service are services, order-store is a datastore, and checkout-api is an interface under the tie-break that an item named as an API with no deployable of its own named is an interface; all 4 are in_scope. No edge: the sheet carries no outside item and no strength, SLA or limits on any item, so dependencies[] is empty and no edge assumption is written. Substitutions: substituted rationale 1 row, chain row-2 at Payment Gateway, whose Justification cell is empty, its three ratings carrying the text converted from legacy-rpn-sheet.csv; no rationale recorded; substituted the effect default on 4 rows, effects.local and effects.next_level set to converted from legacy-rpn-sheet.csv with the level's name and no effect recorded, the sheet having one Effect column that maps to end alone; substituted evidence_kind estimate on 12 ratings, the sheet carrying no evidence-kind column; substituted the control evidence kind none on 4 controls, the sheet carrying no control-evidence column; substituted security_relevant false on 4 elements, the sheet and its item text saying nothing about a security property; substituted for_whom on 4 functions, each set to converted from legacy-rpn-sheet.csv and no for_whom recorded; substituted elements[].description empty on 4 elements, the sheet carrying no description column; substituted functions[].conditions empty on 4 functions, the sheet carrying no conditions column; substituted actions[].target_date with the conversion date 2026-10-15 on 4 actions, the sheet carrying no target-date column; substituted chains[].id with row-1 to row-4 in sheet order on 4 rows, the sheet carrying no row-id column; substituted functions[].id with fn- followed by the element id on 4 functions. chains[].priority.rpn is S x O x D of the retained ratings, computed by priority.ts and never copied from the sheet's RPN column; the sheet states 200 on the Order Store row where that product is 210, and the sheet's value is recorded in that row's chains[].history. trigger is left empty on all 4 rows, the sheet carrying no trigger column. No link between chains is added, even where a Cause cell restates another row's failure mode, and no codebase is added, because the inputs name no repository; neither step 4's linking pass nor the codebase collection runs on a converted sheet, and both are later work for the person through an ordinary update. The 15 open assumptions record what the design-inputs checklist asks for that the sheet does not supply.",
];

// build/evals/prose-1/p6/medium/run1/analysis.json, meta.history[0].change.
const PROSE1_MEDIUM_RUN1 = [
  "Converted from legacy-rpn-sheet.csv, a legacy RPN-based FMEA sheet prepared by J. Legacy and dated 2025-11-30, into this schema; the sheet's S, O and D are carried as authored ratings and its RPN is retained for reference in priority.rpn, which ranks nothing. Columns used and their mapping: Item -> elements[].id (kebab-case of the item text) and elements[].name; Function -> functions[].statement; Failure Mode -> chains[].failure_mode; Effect -> chains[].effects.end; Cause -> chains[].causes[].text; Current Controls -> chains[].controls[].description, with the cell's 'Detection:' or 'Prevention:' prefix setting controls[].kind; S, O and D -> chains[].ratings.{S,O,D}.value; RPN -> compared with the computed product and retained for reference; Recommended Action -> chains[].actions[].description; Owner -> chains[].actions[].owner; Status -> chains[].actions[].status; Justification -> chains[].ratings[].rationale. The sheet has no type, owner or external column, so each element is typed by the converter from the item text: Checkout API is an interface, being named as an API with no deployable of its own named; Payment Gateway and Pricing Service are services; Order Store is a datastore; all four take boundary in_scope. Declared substitutions, each a default and not an invented input: security_relevant false on 4 elements; elements[].description left empty on 4 elements; functions[].conditions left empty on 4 functions; functions[].for_whom on 4 functions; effects.local on 4 rows and effects.next_level on 4 rows, both from the single Effect column; ratings[].evidence_kind estimate on 12 ratings; controls[].status existing on 4 controls and controls[].evidence.kind none on 4 controls; actions[].target_date on 4 actions, set to the conversion date 2026-10-15; rationale 1 row, the Payment Gateway row, whose Justification cell is empty and whose ratings carry the default 'converted from legacy-rpn-sheet.csv; no rationale recorded'. The sheet's Owner column is the action owner and no element owner. The trigger field is left out on all 4 rows, the sheet carrying no trigger column. meta.scales.version is 2, the version the ratings were made against; the conversion re-rates nothing. The Order Store row states RPN 200 where S times O times D is 210, and the sheet's stated value is recorded in that row's history. The conversion adds no dependency edge, none of the four items carrying a strength, an SLA or limits and none being outside the scope; it adds no codebase, no flow and no cause-to-chain link. dependencies[] is empty.",
];

// build/evals/prose-1/p6/medium/run2/analysis.json, meta.history[0].change and meta.history[1].change.
const PROSE1_MEDIUM_RUN2 = [
  "Converted from inputs/legacy-rpn-sheet.csv, prepared by J. Legacy and dated 2025-11-30, into this schema; column mapping, every column the sheet carries being used: Item mapped to elements[].id and elements[].name; Function mapped to functions[].statement; Failure Mode mapped to chains[].failure_mode; Effect mapped to chains[].effects.end; Cause mapped to chains[].causes[].text; Current Controls mapped to chains[].controls[], the cell's leading Detection: or Prevention: label read into controls[].kind and removed from controls[].description; S, O and D mapped to chains[].ratings[].value; RPN mapped to no field and kept for reference only, since chains[].priority.rpn is computed by priority.ts as S times O times D and a sheet value that differs is recorded on the row's history; Recommended Action mapped to chains[].actions[].description; Owner mapped to chains[].actions[].owner, the action owner and never an element owner; Status mapped to chains[].actions[].status; Justification mapped to chains[].ratings[].rationale; the header rows Prepared by and Date mapped to each rating's review.by and review.date; chains[].trigger left empty on every row (4 chains), the sheet carrying no trigger column",
  "Conversion substitutions, each a declared default and never an invented input: typing, typed by the converter from the item text, checkout-api an interface because it is an item named as an API with no deployable of its own named, and payment-gateway, order-store and pricing-service by the role tests (4 elements); elements[].boundary in_scope on every element (4 elements); elements[].security_relevant false on every element (4 elements); elements[].description left empty (4 elements); elements[].id, functions[].id and chains[].id assigned by the converter, the sheet carrying no identifier column (4 each); functions[].conditions left empty (4 functions); functions[].for_whom the declared default 'not recorded in the legacy sheet' (4 functions); causes[].origin left absent (4 causes); controls[].status existing (4 controls); controls[].evidence.kind none, the sheet mapping no column to it (4 controls); ratings[].evidence_kind estimate, the sheet mapping no column to it (12 ratings); rationale: 1 row carries the default rationale text, its Justification cell being empty (row-2, Payment Gateway); actions[].id the declared default act-1, one per row (4 actions); actions[].target_date the conversion date 2026-10-15, the sheet carrying no target-date column (4 actions); flows[] left absent, the sheet recording no flow; dependencies[] left empty, the sheet recording no dependency (0 edges); catalog_refs left empty (4 chains); post_ratings, post_priority, handoff and source_incident left absent and stale left unflagged (4 chains); meta.codebases left absent, the sheet naming no repository; meta.reviews left empty, no review having been reported; meta.created and meta.updated take the conversion date 2026-10-15, and each rating's review.by is the sheet's stated author J. Legacy with review.date the sheet's date 2025-11-30. This conversion adds no link between chains and no codebase: linking a cause to another chain whose failure mode it restates, and naming the repositories, are later work for the person through an ordinary update.",
];

test("conversion-substitution-unrecorded's rationale finding keeps the shipped message, in the form every default's finding takes", () => {
  assert.equal(DEFAULT_MESSAGE(1, "row", "rationale"), MESSAGE(1));
});

test("conversion-substitution-unrecorded fires on prose-1's p6/high/run1 on status only: its history counts evidence.kind on 4 controls, the two effects on 4 chains, rationale on 1 row, evidence_kind on 12 ratings and the typing's boundary on 4 elements", () => {
  assert.deepEqual(fired(defaultedDoc(PROSE1_HIGH_RUN1), UNRECORDED), unrecordedDefaults([4, "control", "status"]));
});

test("conversion-substitution-unrecorded fires on prose-1's p6/high/run2 on status only, which no clause names; it counts evidence_kind on 12 ratings and types all 4 elements", () => {
  assert.deepEqual(fired(defaultedDoc(PROSE1_HIGH_RUN2), UNRECORDED), unrecordedDefaults([4, "control", "status"]));
});

test("conversion-substitution-unrecorded fires on prose-1's p6/medium/run2 on effects.local and effects.next_level only, which neither history entry names; it counts evidence_kind on 12 ratings and the typing on 4 elements", () => {
  assert.deepEqual(fired(defaultedDoc(PROSE1_MEDIUM_RUN2), UNRECORDED), unrecordedDefaults([4, "row", "effects.local"], [4, "row", "effects.next_level"]));
});

test("conversion-substitution-unrecorded is silent on prose-1's p6/medium/run1, which counts all five defaults, evidence_kind on 12 ratings and the typing's boundary on all four elements", () => {
  assert.deepEqual(fired(defaultedDoc(PROSE1_MEDIUM_RUN1), UNRECORDED), []);
});

test("conversion-substitution-unrecorded is silent on all seven defaults of the shipped expected conversion, which counts each on 4 of 4 rows and names each element with its type", () => {
  const doc = loadFixture<FmeaDocument>("legacy-rpn-sheet.expected.fmea.json");
  const controls = doc.chains.flatMap((chain) => chain.controls);
  assert.ok(controls.length > 0 && controls.every((c) => c.status === "existing" && c.evidence.kind === "none"), "every control carries both control defaults");
  assert.equal(new Set(doc.chains.map((chain) => chain.effects.local)).size, 1, "one local effect on every chain");
  assert.equal(new Set(doc.chains.map((chain) => chain.effects.next_level)).size, 1, "one next-level effect on every chain");
  assert.ok(doc.chains.every((chain) => (["S", "O", "D"] as const).every((f) => chain.ratings[f].evidence_kind === "estimate")), "every rating is an estimate");
  assert.equal(doc.elements.length, 4, "four typed elements");
  assert.deepEqual(fired(doc, UNRECORDED), []);
});

test("conversion-substitution-unrecorded: a document that is not a conversion is read for the rationale default only, and any of the three detector phrases makes it one", () => {
  assert.deepEqual(unrecordedFields(defaultedDoc(["Imported legacy-rpn-sheet.csv", RECORDED_3])), []);
  assert.deepEqual(fired(defaultedDoc([]), UNRECORDED), unrecorded(1));
  for (const detector of [SHEET, "column mapping: Item -> elements[].name", "Conversion notes"]) {
    assert.deepEqual(unrecordedFields(defaultedDoc([detector, RECORDED_3])), FOUR_DEFAULTS, detector);
  }
});

test("conversion-substitution-unrecorded: a conversion of one chain is read for the rationale default only", () => {
  const single = defaultedDoc([SHEET]);
  single.chains = single.chains.slice(1, 2);
  assert.deepEqual(fired(single, UNRECORDED), unrecorded(1));
});

test("conversion-substitution-unrecorded: a control default holds when every control carries it and there is one, and counts the controls", () => {
  const planned = defaultedDoc([SHEET, RECORDED_3]);
  planned.chains[0].controls[0].status = "planned";
  assert.deepEqual(unrecordedFields(planned), ["evidence.kind", "effects.local", "effects.next_level"]);
  const evidenced = defaultedDoc([SHEET, RECORDED_3]);
  evidenced.chains[3].controls[0].evidence = { kind: "test_result", ref: "detect.spec" };
  assert.deepEqual(unrecordedFields(evidenced), ["status", "effects.local", "effects.next_level"]);
  const bare = defaultedDoc([SHEET, RECORDED_3]);
  for (const chain of bare.chains) chain.controls = [];
  assert.deepEqual(unrecordedFields(bare), ["effects.local", "effects.next_level"]);
  const five = defaultedDoc([SHEET, RECORDED_3, "effects.local and effects.next_level defaulted on 4 rows"]);
  five.chains[0].controls.push(clone(five.chains[0].controls[0]));
  assert.deepEqual(fired(five, UNRECORDED), unrecordedDefaults([5, "control", "status"], [5, "control", "evidence.kind"]));
});

test("conversion-substitution-unrecorded: an effect default holds when every chain carries the same text, empty and absent counted as the same", () => {
  const blank = defaultedDoc([SHEET, RECORDED_3, "controls[].status existing and controls[].evidence.kind none on 4 controls"]);
  for (const chain of blank.chains) chain.effects.local = "";
  delete (blank.chains[2].effects as Partial<Effects>).local;
  assert.deepEqual(fired(blank, UNRECORDED), unrecordedDefaults([4, "row", "effects.local"], [4, "row", "effects.next_level"]));
  blank.chains[0].effects.next_level = "the shopper retries";
  assert.deepEqual(unrecordedFields(blank), ["effects.local"]);
});

test("conversion-substitution-unrecorded: a clause records a default when it names the field, case-insensitively, with the count, its number word, or every affected row by chain id or element name", () => {
  const unrecordedWith = (clause: string): string[] => unrecordedFields(defaultedDoc([SHEET, RECORDED_3, clause]));
  const recording: [string, string[]][] = [
    ["status", ["controls[].status existing on 4 controls", "Status existing on four controls", "status existing on ch-1, ch-2, ch-3 and ch-4", "status existing on the Checkout API, Payment Gateway, Order Store and Pricing Service rows"]],
    ["evidence.kind", ["controls[].evidence.kind none on 4 controls", "Evidence kind none on 4 controls"]],
    ["effects.local", ["effects.local on 4 rows", "the local effect on 4 rows", "Local defaulted on 4 rows", "the localised effects on 4 rows"]],
    ["effects.next_level", ["effects.next_level on 4 rows", "next_level on 4 rows", "Next level on 4 rows", "next-level on 4 rows"]],
  ];
  for (const [field, clauses] of recording) {
    for (const clause of clauses) assert.deepEqual(unrecordedWith(clause), FOUR_DEFAULTS.filter((f) => f !== field), clause);
  }
  // Since §11.6 ruling 3, `evidence_kind` names the ratings' field and no longer the controls'.
  for (const clause of ["statuses existing on 4 controls", "status existing on 3 controls", "status existing on ch-1, ch-2 and ch-3", "evidence none on 4 controls", "kind none on 4 controls", "evidence_kind none on 4 controls", "effects on 4 rows", "locale on 4 rows", "level on 4 rows", "nextlevel on 4 rows"]) {
    assert.deepEqual(unrecordedWith(clause), FOUR_DEFAULTS, clause);
  }
});

test("conversion-substitution-unrecorded: a full stop or a semicolon ends a clause, and a dot that continues a dotted name does not", () => {
  for (const clause of ["status existing. 4 controls took it", "status existing; 4 controls took it", "evidence.kind none. 4 controls"]) {
    assert.deepEqual(unrecordedFields(defaultedDoc([SHEET, RECORDED_3, clause])), FOUR_DEFAULTS, clause);
  }
  assert.deepEqual(fired(convertedDoc(["ch-2"], ["1 row carries the default chains[].ratings.S.rationale"]), UNRECORDED), []);
});

// ---- Fix round 1 of the round-1b revision: a `;` or a `.` inside a quoted span does not end a
// clause. The history entries are the prose-0 round's prompt-6 documents verbatim, each of whose
// effect clause quotes a default text that holds a `;` or an ellipsis before its count.

// build/evals/prose-0/p6/medium/run1/analysis.json, meta.history[0].change.
const PROSE0_MEDIUM_RUN1 = [
  "Converted from legacy-rpn-sheet.csv (Prepared by J. Legacy, dated 2025-11-30). Column mapping: Item -> elements[].name; Function -> functions[].statement; Failure Mode -> chains[].failure_mode; Effect -> chains[].effects.end; Cause -> chains[].causes[].text; Current Controls -> chains[].controls[].description, with the leading Prevention:/Detection: token read as the control's kind; S, O and D -> chains[].ratings, copied as authored and never re-rated; RPN -> not copied, priority.rpn is written by priority.ts as the product of the three retained ratings; Recommended Action -> chains[].actions[].description; Owner -> chains[].actions[].owner, the action owner and never an element owner; Status -> chains[].actions[].status; Justification -> chains[].ratings.*.rationale. Declared substitutions, with row counts: effects.local and effects.next_level take the defaults 'converted from legacy-rpn-sheet.csv; no local effect recorded' and 'converted from legacy-rpn-sheet.csv; no next-level effect recorded' on 4 rows each, because the sheet carries a single Effect column and it is mapped to end; ratings.*.evidence_kind is estimate on 12 rows and controls[].evidence.kind is none on 4 rows, because the sheet has no evidence-kind column; ratings.*.review is authored, by 'J. Legacy' with date 2025-11-30, on 12 rows, the sheet's stated author and date; actions[].target_date is the conversion date 2026-10-14 on 4 rows, because the sheet records no target date; boundary is in_scope and security_relevant is false on all 4 elements; every element is typed by the converter from the item text (Checkout API an interface, Payment Gateway a service, Order Store a datastore, Pricing Service a service); elements[].description is left empty, functions[].conditions is empty, and functions[].for_whom carries 'not recorded in the source sheet' on the rows whose sheet text names no consumer. dependencies[] is written empty: the sheet records no strength, SLA or limit for any item, so no item is an inside dependency and no item is outside the boundary. Empty-trigger note: the sheet records no trigger for any row, so trigger is omitted on all 4 chains. The failure-mode catalog was pruned to nothing: a conversion reuses only the rows the sheet contains, so every chains[].catalog_refs is empty and no catalog row prompted an element. The conversion adds no cause link, even where a Cause cell might restate another row's Failure Mode, and no codebase; both are later work for the person through an ordinary update. meta.scales.priority_table is recorded by the first priority.ts --write.",
];

// build/evals/prose-0/p6/medium/run2/analysis.json, meta.history[0].change and meta.history[1].change.
const PROSE0_MEDIUM_RUN2 = [
  "Converted from the legacy RPN sheet legacy-rpn-sheet.csv (prepared by J. Legacy, dated 2025-11-30). Column mapping: Item -> elements[].id, elements[].name and elements[].description; Function -> functions[].statement; Failure Mode -> chains[].failure_mode; Effect -> chains[].effects.end; Cause -> chains[].causes[].text; Current Controls -> chains[].controls[], the leading 'Detection:' or 'Prevention:' prefix setting controls[].kind and the remaining text controls[].description; S, O and D -> chains[].ratings.S/.O/.D with review.status 'authored', by 'J. Legacy', date 2025-11-30; RPN -> not copied, recomputed as S x O x D into priority.rpn by priority.ts; Recommended Action -> chains[].actions[].description; Owner -> chains[].actions[].owner, the action owner and never an element owner; Status -> chains[].actions[].status; Justification -> ratings[].rationale. Declared substitutions and defaults, with the row count they apply to: elements[].kind and elements[].boundary typed by the converter from the item text (4 rows); elements[].security_relevant false (4 rows); functions[].for_whom read from the row's function and effect text, functions[].conditions empty (4 rows); chains[].effects.local and chains[].effects.next_level filled with the declared default 'converted from legacy-rpn-sheet.csv; no local effect recorded' and '... no next-level effect recorded' (4 rows); ratings[].evidence_kind 'estimate' (4 rows); ratings[].rationale defaulted to 'converted from legacy-rpn-sheet.csv; no rationale recorded' where the Justification cell is empty (2 rows); controls[].status 'existing' (4 rows); controls[].evidence.kind 'none' (4 rows); chains[].actions[].target_date defaulted to the conversion date 2026-10-14 (4 rows); chains[].trigger left empty (4 rows). No catalog row was applied and catalog_refs[] is empty on every chain. All four items were typed in_scope, so no item needs an inbound edge and the sheet carries no strength, SLA or limits column, so dependencies[] is empty. meta.scales.version is 2, the 'scales version: N' line of scales-software.md at conversion time.",
  "Conversion notes: no trigger is recorded on any row, because the sheet carries no trigger column. The sheet states an RPN of 200 on the row 'Order Store'; its S, O and D values give 210, so the stated value is recorded in that chain's history[] and the computed product is used for priority. The conversion adds no dependency edge, no flow, no catalog reference, no chain link and no codebase, the sheet supplying none of them; adding any of these is later work for a named person through an ordinary update.",
];

test("conversion-substitution-unrecorded is silent on prose-0's p6/medium/run1 effects, whose clause quotes two default texts holding a `;` before its count; its rationale and status stay uncounted", () => {
  assert.deepEqual(fired(defaultedDoc(PROSE0_MEDIUM_RUN1), UNRECORDED), unrecordedDefaults([1, "row", "rationale"], [4, "control", "status"]));
});

// Its run put the default rationale on two rows, Payment Gateway's and Pricing Service's.
test("conversion-substitution-unrecorded is silent on prose-0's p6/medium/run2, whose effect clause quotes a default text holding a `;` and an ellipsis before its count", () => {
  const doc = defaultedDoc(PROSE0_MEDIUM_RUN2);
  doc.chains[3].ratings.S.rationale = DEFAULT_RATIONALE;
  assert.deepEqual(fired(doc, UNRECORDED), []);
});

test("conversion-substitution-unrecorded: a `;` or a `.` inside a quoted span does not end a clause, in straight or curly single or double quotes, and an unmatched opening quote runs to the end", () => {
  const unrecordedWith = (clause: string): string[] => unrecordedFields(defaultedDoc([SHEET, RECORDED_3, clause]));
  const recorded = FOUR_DEFAULTS.filter((f) => f !== "status");
  for (const clause of [
    "status set to 'existing; the sheet records none' on 4 controls",
    "status set to \"existing; the sheet records none\" on 4 controls",
    "status set to ‘existing; the sheet records none’ on 4 controls",
    "status set to “existing; the sheet records none” on 4 controls",
    "status set to 'existing.' on 4 controls",
    "status set to '... existing' on 4 controls",
    "status set to 'existing; on 4 controls",
  ]) {
    assert.deepEqual(unrecordedWith(clause), recorded, clause);
  }
  assert.deepEqual(unrecordedWith("status set to 'existing'; 4 controls in all"), FOUR_DEFAULTS, "a `;` after the closing quote still ends the clause");
});

// An apostrophe has a word character on one side: it neither opens a span nor, inside one, closes it.
test("conversion-substitution-unrecorded: an apostrophe is not a quote, so it neither opens nor closes a quoted span", () => {
  const unrecordedWith = (clause: string): string[] => unrecordedFields(defaultedDoc([SHEET, RECORDED_3, clause]));
  assert.deepEqual(unrecordedWith("status taken from the sheet's controls; 4 controls in all"), FOUR_DEFAULTS);
  assert.deepEqual(unrecordedWith("status taken from the rows' controls; 4 controls in all"), FOUR_DEFAULTS);
  assert.deepEqual(unrecordedWith("status set to 'the sheet's default; existing' on 4 controls"), FOUR_DEFAULTS.filter((f) => f !== "status"));
});

// ---- Ruling 3 of the second stage-1 gate (spec §11.6): in a conversion of two chains or more, the
// ratings' evidence_kind estimate, counted by row or by rating, and the elements' typing, counted
// by element or recorded by a clause that maps a column to elements[].kind or elements[].boundary.
// The history entries are round 1b's prompt-6 documents verbatim, each named by its source.

// build/evals/prose-1b/p6/high/run1/analysis.json, meta.history[0].change to meta.history[4].change.
const PROSE1B_HIGH_RUN1 = [
  "Converted from inputs/legacy-rpn-sheet.csv, prepared by J. Legacy and dated 2025-11-30, by column mapping: Item -> elements[].name, with the element id taken from it as lowercased kebab-case; Function -> functions[].statement; Failure Mode -> chains[].failure_mode; Effect -> chains[].effects.end; Cause -> chains[].causes[].text; Current Controls -> chains[].controls[].description, with the cell's 'Detection:' or 'Prevention:' prefix mapped to controls[].kind and removed from the description; S, O and D -> chains[].ratings.S, ratings.O and ratings.D; RPN -> checked against the product of the three ratings and never copied; Recommended Action -> chains[].actions[].description; Owner -> chains[].actions[].owner, the action owner and never an element owner; Status -> chains[].actions[].status; Justification -> chains[].ratings[].rationale. Every column of the sheet is named here and none was left unused.",
  "Element typing, typed by the converter from the item text, the sheet carrying no type, owner or external column: Checkout API is an interface, an item named as an API with no deployable of its own named and a contract analysed in its own right; Payment Gateway and Pricing Service are services, each answering requests with a runtime of its own; Order Store is a datastore, holding state at rest that other elements read or write and doing nothing on its own. All 4 elements take boundary in_scope, the sheet classifying no ownership, and security_relevant is false on those 4 elements as a declared default because no item text says a security property depends on the element.",
  "Declared substitutions: rationale: 1 row (row-2) carries the default 'converted from inputs/legacy-rpn-sheet.csv; no rationale recorded', its Justification cell being empty; evidence_kind: estimate on 4 rows and evidence_ref left empty on 4 rows, the sheet carrying no evidence column; controls[].status: existing on 4 controls, the sheet's Current Controls column naming controls that are in place now; controls[].evidence.kind: none on 4 controls, the sheet stating no evidence for any control; effects.local carries the default 'converted from inputs/legacy-rpn-sheet.csv; no local effect recorded' on 4 rows; effects.next_level carries the default 'converted from inputs/legacy-rpn-sheet.csv; no next-level effect recorded' on 4 rows, the sheet having a single Effect column; actions[].target_date: 2026-10-15 on 4 actions, the sheet recording no target date; functions[].for_whom carries the default 'not named in the sheet' on 4 functions and functions[].conditions is empty on those 4 functions; trigger is left empty on 4 chains; causes[].origin is left unclassified on 4 chains; chains[].flows is absent on 4 chains and flows[] is absent, the sheet naming no critical flow; catalog_refs is empty on 4 chains; row ids row-1 to row-4 were generated by the converter, the sheet carrying no row id column.",
  "chains[].priority and its rpn are written by priority.ts from the retained ratings with the shipped table; the sheet states RPN 120 for row-1, 144 for row-2, 200 for row-3 and 40 for row-4, of which row-3 alone differs from the product of its ratings 7, 5 and 6, which is 210, so the sheet's 200 is recorded in the history of row-3 and no sheet RPN was copied or used to rank.",
  "meta.codebases is absent and no element carries a codebase, the sheet naming no repository, and the missing value is recorded as an open assumption rather than invented. meta.ground_rules carries 4 rules declared by the converter, the sheet stating none, and meta.assumptions carries 8 open assumptions owned by user for the inputs the sheet does not supply. No review is recorded: no team report of a review of this conversion was given. No cause link and no catalog_refs are written, because the conversion adds no link even where a Cause cell restates another row's Failure Mode, and adds no catalog row; both are later work for the person through an ordinary update.",
];

// build/evals/prose-1b/p6/high/run2/analysis.json, meta.history[0].change and meta.history[1].change.
const PROSE1B_HIGH_RUN2 = [
  "Converted from the legacy RPN sheet legacy-rpn-sheet.csv. The column mapping: the columns Item, Function, Failure Mode, Effect, Cause, Current Controls, S, O, D, RPN, Recommended Action, Owner, Status and Justification were all used; Item maps to elements[].name and each element id is taken from it; Function maps to functions[].statement; Failure Mode maps to chains[].failure_mode; Effect maps to chains[].effects.end; Cause maps to chains[].causes[].text; Current Controls maps to chains[].controls[], with the cell's '<Prevention or Detection>: ' prefix mapped to controls[].kind and the text after that prefix mapped to controls[].description; S, O and D map to chains[].ratings[].value; Recommended Action maps to chains[].actions[].description; Owner maps to chains[].actions[].owner and is the action owner and never an element owner; Status maps to chains[].actions[].status; Justification maps to chains[].ratings[].rationale wherever the cell is filled; Prepared by maps to chains[].ratings[].review.by and Date maps to chains[].ratings[].review.date; the RPN column is not copied, the row's priority being computed by priority.ts, and where the stated RPN differs from S times O times D the sheet's value is recorded in that row's history[].",
  "Declared substitutions of the conversion. elements[].boundary is in_scope on 4 elements and elements[].security_relevant is false on 4 elements, both read by the converter because the sheet carries no type, external or boundary column; each element's role is typed by the converter from the item text, checkout-api as an interface, payment-gateway as a service, order-store as a datastore and pricing-service as a service; elements[].description is left empty on 4 elements; functions[].conditions is left empty on 4 functions; functions[].for_whom takes the declared default 'converted from legacy-rpn-sheet.csv; no consumer recorded' on 4 functions; chains[].trigger is left empty on 4 rows, the sheet naming no trigger and no trigger-kind vocabulary being sourced; chains[].catalog_refs is empty on 4 rows, the conversion adding no catalog row; chains[].stale carries the false flag on 4 rows; chains[].post_ratings is left out on 4 rows, no action being Completed; controls[].status takes the declared default existing on 4 controls; controls[].evidence.kind takes the declared default none on 4 controls, the sheet carrying no evidence column; effects.local takes the declared default 'converted from legacy-rpn-sheet.csv; no local effect recorded' on 4 rows, the sheet carrying a single effect column; effects.next_level takes the declared default 'converted from legacy-rpn-sheet.csv; no next-level effect recorded' on 4 rows, the sheet carrying a single effect column; rationale takes the declared default 'converted from legacy-rpn-sheet.csv; no rationale recorded' on 1 row, the Payment Gateway row, whose Justification cell is empty; ratings[].evidence_kind is estimate on 12 ratings, the sheet carrying no evidence column; ratings[].review is authored on 12 ratings, by J. Legacy at 2025-11-30 from the sheet's Prepared by and Date rows; actions[].target_date takes the sheet's date 2025-11-30 as a declared default on 4 actions; actions[].completed_date is left out on 4 actions, no action being Completed. The conversion adds no chain link, even where a Cause cell restates another row's Failure Mode, and the step-4 linking pass does not run on a converted sheet; it adds no codebase, so meta.codebases[] is absent and no element carries a codebase; it authors no flow, so flows[] is absent; dependencies[] is empty, the sheet carrying no strength, SLA or limits for any item; meta.scales.version is set to 2 from the scales version line of scales-software.md.",
];

// build/evals/prose-1b/p6/medium/run1/analysis.json, meta.history[0].change.
const PROSE1B_MEDIUM_RUN1 = [
  "Converted from the legacy RPN sheet legacy-rpn-sheet.csv, prepared by J. Legacy and dated 2025-11-30, four rows; column mapping: Item to elements[].name, Function to functions[].statement, Failure Mode to chains[].failure_mode, Effect to chains[].effects.end, Cause to chains[].causes[].text, Current Controls to chains[].controls[] with the cell's leading Detection or Prevention word mapping to controls[].kind and the remaining text to controls[].description, S, O and D to chains[].ratings[].value, Recommended Action to chains[].actions[].description, Owner to chains[].actions[].owner, Status to chains[].actions[].status, and Justification to the rationale of each of the row's three ratings; the sheet's stated RPN is kept in the row's own history where it differs from S times O times D, which is the row Order Store with 200 against 210, while priority.rpn and the priority value are computed by the skill's table and never copied from the sheet; the sheet carries no row-id, type, boundary, strength, SLA, limits, target-date, trigger, origin, flow, codebase or owner-of-element column; each element is typed by the converter from the item text and the ids are the converter's; effects.local default \"converted from legacy-rpn-sheet.csv; no local effect recorded\" on four rows; effects.next_level default \"converted from legacy-rpn-sheet.csv; no next-level effect recorded\" on four rows; controls[].status default existing on four controls; controls[].evidence.kind default none on four controls; rationale default \"converted from legacy-rpn-sheet.csv; no rationale recorded\" on one row, the row whose Justification cell is empty, which is Payment Gateway; functions[].for_whom default \"converted from legacy-rpn-sheet.csv; no consumer recorded\" on four functions; functions[].conditions left empty on four functions; ratings[].evidence_kind default estimate on twelve ratings; actions[].target_date default the sheet date 2025-11-30 on four actions; chains[].trigger left empty on four rows; causes[].origin left empty on four causes; chains[].flows, chains[].catalog_refs, chains[].handoff and chains[].source_incident left empty on four rows; elements[].description left empty on four elements; security_relevant default false on four elements; meta.codebases left absent and dependencies[] left empty; no link between rows is added, even where a Cause cell restates another row's Failure Mode, and no codebase is added, both later work for the person through an ordinary update; the sheet's ratings are kept with review status authored, by J. Legacy and dated 2025-11-30, and are never re-rated.",
];

// build/evals/prose-1b/p6/medium/run2/analysis.json, meta.history[0].change and meta.history[1].change.
const PROSE1B_MEDIUM_RUN2 = [
  "Converted from the legacy RPN sheet inputs/legacy-rpn-sheet.csv, prepared by J. Legacy on 2025-11-30; column mapping: Item to elements[].id and elements[].name; Function to functions[].statement; Failure Mode to chains[].failure_mode; Effect to chains[].effects.end; Cause to chains[].causes[].text; Current Controls to chains[].controls[], the leading Detection: or Prevention: label selecting controls[].kind and kept in the control's description; S, O and D to chains[].ratings.S, chains[].ratings.O and chains[].ratings.D; RPN to no field, priority.rpn being recomputed as the product of the converted ratings; Recommended Action to chains[].actions[].description; Owner to chains[].actions[].owner; Status to chains[].actions[].status; Justification to chains[].ratings[].rationale. The sheet's header block supplies the author J. Legacy and the date 2025-11-30. Chain ids, function ids and action ids are generated by the converter from the sheet's Item and Failure Mode cells, the sheet carrying no id column, and each row's chain history names the sheet row it came from.",
  "Substituted fields of the conversion, each named with its count: rationale one row carries the declared default text where the Justification cell is empty; controls[].status four controls carry the declared default existing; controls[].evidence.kind four controls carry the declared default none, the sheet recording no control evidence; effects.local four rows carry the same declared default text; effects.next-level four rows carry the same declared default text; actions[].target_date four actions carry the conversion date 2026-10-15 as a declared default, the sheet stating no due date; functions[].for_whom four functions carry the declared default not named by the sheet; elements[].security_relevant four elements take the declared default false; trigger left empty on four rows, the sheet naming no initiating event for any row. The sheet states RPN 200 on its Order Store row while the product of that row's converted ratings is 210; the sheet's value is recorded in that row's chain history and never in priority.rpn.",
];

// The same document's meta.assumptions entries on the two defaults, and its ground rule on the typing.
const PROSE1B_MEDIUM_RUN2_ASSUMPTIONS: Assumption[] = [
  { text: "The sheet's Justification cells refer to a storefront outage in the spring release, a failover drill in the autumn and a pricing incident review, but none of those records was supplied, so every converted rating carries evidence_kind estimate. A named person should produce the records and re-score the ratings against the anchors.", owner: "user", status: "open" },
  { text: "The sheet carries no type, owner or external column, so each element's role and boundary were typed by the converter from the item text: the Checkout API as an interface, the Payment Gateway and the Pricing Service as services, the Order Store as a datastore, and all four as in_scope. A named person should confirm each role and boundary, and whether any item is owned outside this analysis or is third-party.", owner: "user", status: "open" },
];
const PROSE1B_MEDIUM_RUN2_GROUND_RULE = "Each element's role and boundary are typed by the converter from the item text, and security_relevant is false unless the sheet says otherwise.";

/** The control and effect defaults of defaultedDoc recorded, in one history entry of two clauses. */
const CONTROLS_EFFECTS_4 = "controls[].status existing and controls[].evidence.kind none on 4 controls; effects.local and effects.next_level on 4 rows";

test("conversion-substitution-unrecorded is silent on prose-1b's p6/high/run1, which counts evidence_kind on 4 rows and the typing's boundary on all 4 elements", () => {
  assert.deepEqual(fired(defaultedDoc(PROSE1B_HIGH_RUN1), UNRECORDED), []);
});

test("conversion-substitution-unrecorded is silent on prose-1b's p6/high/run2, which counts evidence_kind on 12 ratings and elements[].boundary on 4 elements", () => {
  assert.deepEqual(fired(defaultedDoc(PROSE1B_HIGH_RUN2), UNRECORDED), []);
});

test("conversion-substitution-unrecorded fires on prose-1b's p6/medium/run1 on the typing only: it counts evidence_kind on twelve ratings, and says each element is typed by the converter with no count and no element named, a known gap", () => {
  assert.deepEqual(fired(defaultedDoc(PROSE1B_MEDIUM_RUN1), UNRECORDED), unrecordedDefaults([4, "element", "typing"]));
});

test("conversion-substitution-unrecorded fires on prose-1b's p6/medium/run2 on evidence_kind and the typing, which it records only in meta.assumptions and a ground rule", () => {
  const doc = defaultedDoc(PROSE1B_MEDIUM_RUN2);
  doc.meta.assumptions = PROSE1B_MEDIUM_RUN2_ASSUMPTIONS;
  doc.meta.ground_rules = [PROSE1B_MEDIUM_RUN2_GROUND_RULE];
  assert.deepEqual(fired(doc, UNRECORDED), unrecordedDefaults([4, "row", "evidence_kind"], [4, "element", "typing"]));
});

test("conversion-substitution-unrecorded gives a finding per default in order, the ratings' evidence_kind counted by row and the typing by element in its own wording", () => {
  assert.deepEqual(fired(defaultedDoc([SHEET]), UNRECORDED), unrecordedDefaults(
    [1, "row", "rationale"], [4, "control", "status"], [4, "control", "evidence.kind"], [4, "row", "effects.local"], [4, "row", "effects.next_level"],
    [4, "row", "evidence_kind"], [4, "element", "typing"],
  ));
});

test("conversion-substitution-unrecorded: the ratings' evidence_kind clause does not stand in for the controls' evidence.kind, nor the controls' clause for the ratings'", () => {
  const others = [SHEET, RATIONALE_1, TYPING_4, "controls[].status existing on 4 controls", "effects.local and effects.next_level on 4 rows"];
  assert.deepEqual(unrecordedFields(defaultedDoc([...others, "evidence_kind: estimate on 4 rows"])), ["evidence.kind"]);
  assert.deepEqual(unrecordedFields(defaultedDoc([...others, "evidence_kind: estimate on 4 rows", "controls[].evidence.kind: none on 4 controls"])), []);
  assert.deepEqual(unrecordedFields(defaultedDoc([...others, "controls[].evidence.kind: none on 4 controls"])), ["evidence_kind"]);
});

test("conversion-substitution-unrecorded: evidence_kind is recorded by a clause naming it, or estimate, with the count of rows, the count of ratings, either's number word, or every chain by id or element name", () => {
  const unrecordedWith = (clause: string): string[] => unrecordedFields(defaultedDoc([SHEET, RATIONALE_1, TYPING_4, CONTROLS_EFFECTS_4, clause]));
  for (const clause of [
    "evidence_kind estimate on 4 rows", "Evidence_Kind estimate on four rows", "ratings[].evidence_kind is estimate on 12 ratings", "default estimate on twelve ratings",
    "evidence_kind estimate on ch-1, ch-2, ch-3 and ch-4", "estimate on the Checkout API, Payment Gateway, Order Store and Pricing Service rows",
  ]) {
    assert.deepEqual(unrecordedWith(clause), [], clause);
  }
  for (const clause of ["evidence_kind estimate on 3 rows", "evidence_kind estimate on 13 ratings", "estimates on 4 rows", "evidence kind on 4 rows", "evidence_kind estimate on ch-1, ch-2 and ch-3"]) {
    assert.deepEqual(unrecordedWith(clause), ["evidence_kind"], clause);
  }
});

test("conversion-substitution-unrecorded: the count of ratings is three times the rows, and it records the ratings' evidence_kind alone", () => {
  const twoRows = (clause: string): FmeaDocument => {
    const doc = defaultedDoc([SHEET, RATIONALE_1, TYPING_4, CONTROLS_EFFECTS_4, clause]);
    doc.chains = doc.chains.slice(0, 2);
    return doc;
  };
  assert.ok(!unrecordedFields(twoRows("evidence_kind estimate on 6 ratings")).includes("evidence_kind"));
  assert.ok(unrecordedFields(twoRows("evidence_kind estimate on 12 ratings")).includes("evidence_kind"));
  for (const clause of ["controls[].status existing and controls[].evidence.kind none on 12 controls", "effects.local and effects.next_level on 12 rows", "rationale defaulted on 3 rows", "typed by the converter on 12 elements"]) {
    const doc = defaultedDoc([SHEET, KIND_4, clause]);
    assert.deepEqual(unrecordedFields(doc), ["rationale", ...FOUR_DEFAULTS, "typing"], clause);
  }
});

test("conversion-substitution-unrecorded: a document with one rating that is not an estimate carries no evidence_kind default", () => {
  for (const factor of ["S", "O", "D"] as const) {
    const doc = defaultedDoc([SHEET, RATIONALE_1, TYPING_4, CONTROLS_EFFECTS_4]);
    assert.deepEqual(unrecordedFields(doc), ["evidence_kind"], factor);
    doc.chains[3].ratings[factor].evidence_kind = "test_result";
    assert.deepEqual(unrecordedFields(doc), [], factor);
  }
});

test("conversion-substitution-unrecorded: the typing is recorded by a clause naming it with the count of elements, its number word, or every element by id or by name", () => {
  const unrecordedWith = (clause: string): string[] => unrecordedFields(defaultedDoc([SHEET, RATIONALE_1, KIND_4, CONTROLS_EFFECTS_4, clause]));
  for (const clause of [
    "typed by the converter on 4 elements", "Typing on four elements", "each element's role from the item text, 4 elements", "boundary in_scope on 4 elements", "types set on 4 elements",
    "typed checkout-api, payment-gateway, order-store and pricing-service", "typed Checkout API, Payment Gateway, Order Store and Pricing Service",
  ]) {
    assert.deepEqual(unrecordedWith(clause), [], clause);
  }
  for (const clause of [
    "typed by the converter", "typed by the converter on 3 elements", "typed checkout-api, payment-gateway and order-store", "subtype on 4 elements", "typical on 4 elements", "roles on 4 elements",
    "kind set by the converter on 4 elements", "evidence.kind none on 4 elements",
  ]) {
    assert.deepEqual(unrecordedWith(clause), ["typing"], clause);
  }
});

test("conversion-substitution-unrecorded: a clause that maps a column to elements[].kind or elements[].boundary records the typing whatever its count, and records no other default", () => {
  const unrecordedWith = (clause: string): string[] => unrecordedFields(defaultedDoc([SHEET, RATIONALE_1, KIND_4, CONTROLS_EFFECTS_4, clause]));
  for (const clause of ["Type to elements[].kind", "Item -> elements[].kind", "Owner to elements[].boundary"]) {
    assert.deepEqual(unrecordedWith(clause), [], clause);
  }
  assert.deepEqual(unrecordedFields(defaultedDoc([SHEET, "Item -> elements[].kind, Owner -> elements[].boundary"])), ["rationale", ...FOUR_DEFAULTS, "evidence_kind"]);
});

// The mapping test is case-sensitive, so the capitalised name is read by the field's own name with its count.
test("conversion-substitution-unrecorded: elements[].kind as a whole token names the typing, so with the count it records it, and kind alone does not", () => {
  const unrecordedWith = (clause: string): string[] => unrecordedFields(defaultedDoc([SHEET, RATIONALE_1, KIND_4, CONTROLS_EFFECTS_4, clause]));
  for (const clause of ["elements[].kind set by the converter on 4 elements", "Elements[].Kind set by the converter on 4 elements"]) {
    assert.deepEqual(unrecordedWith(clause), [], clause);
  }
  for (const clause of ["Elements[].Kind set by the converter", "Elements[].Kinds set by the converter on 4 elements", "kind set by the converter on 4 elements"]) {
    assert.deepEqual(unrecordedWith(clause), ["typing"], clause);
  }
});

test("conversion-substitution-unrecorded: the typing counts every element, a chain on it or not, and a document with no element carries none", () => {
  const extra = defaultedDoc([SHEET, RATIONALE_1, KIND_4, CONTROLS_EFFECTS_4]);
  extra.elements.push(newElement("audit-log", { name: "Audit Log" }));
  assert.deepEqual(fired(extra, UNRECORDED), unrecordedDefaults([5, "element", "typing"]));
  extra.meta.history.push({ version: 1, date: "2026-10-15", change: "typed by the converter on 5 elements" });
  assert.deepEqual(fired(extra, UNRECORDED), []);
  const none = defaultedDoc([SHEET, RATIONALE_1, KIND_4, CONTROLS_EFFECTS_4]);
  none.elements = [];
  assert.deepEqual(unrecordedFields(none), []);
});

test("conversion-substitution-unrecorded: a conversion of one chain, and a document that is not a conversion, read neither evidence_kind nor the typing", () => {
  const single = defaultedDoc([SHEET, RATIONALE_1]);
  single.chains = single.chains.slice(1, 2);
  assert.deepEqual(fired(single, UNRECORDED), []);
  assert.deepEqual(fired(defaultedDoc(["Imported legacy-rpn-sheet.csv", RATIONALE_1]), UNRECORDED), []);
  assert.deepEqual(unrecordedFields(defaultedDoc([SHEET, RATIONALE_1, CONTROLS_EFFECTS_4])), ["evidence_kind", "typing"], "the same four chains as a conversion read both");
});
