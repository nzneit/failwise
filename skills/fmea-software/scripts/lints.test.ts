import { test } from "node:test";
import assert from "node:assert/strict";
import { CASCADING_ROWS, MACHINE_RULES, formatLintLine, runLints, tablePropertyLints } from "./lib/lints.ts";
import { loadTable } from "./lib/table.ts";
import { validateDocument } from "./lib/validation.ts";
import { bandTable, citeO, edge, graphDoc, loadFixture, minimalDoc, rating } from "./test-helpers.ts";
import type { Chain, Codebase, Control, FmeaDocument, Lint, Source, TrackerLink } from "./lib/types.ts";

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

// The golden fixture's lint facts, recorded in the plan reference §H and asserted by Tasks 26,
// 27 and 28. Pinned here so that a rule added in Step 5 which fires on the golden analysis fails
// in this task rather than two tasks later inside validate.test.ts.
test("the golden fixture produces exactly the eleven lints the later tasks assert", () => {
  const doc = loadFixture<FmeaDocument>("checkout-service.fmea.json");
  const lints = runLints(doc);
  assert.equal(lints.length, 11);
  assert.equal(lints.filter((l) => l.severity === "blocker").length, 1);
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
