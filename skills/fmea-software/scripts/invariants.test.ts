import { test } from "node:test";
import assert from "node:assert/strict";
import { INVARIANT_RULES, checkInvariants, checkPriorities } from "./lib/invariants.ts";
import { loadTable } from "./lib/table.ts";
import { clone, edge, graphDoc, minimalDoc, rating } from "./test-helpers.ts";
import type { Codebase, FmeaDocument } from "./lib/types.ts";
import type { Issue } from "./lib/codes.ts";

const table = loadTable();

function only(issues: Issue[], rule: string): Issue[] {
  return issues.filter((i) => i.rule === rule);
}

function expectOne(issues: Issue[], rule: string, code: string, pointer: string): void {
  const hits = only(issues, rule);
  assert.equal(hits.length, 1, `expected exactly one ${rule} issue, got ${JSON.stringify(hits)}`);
  assert.equal(hits[0].code, code);
  assert.equal(hits[0].pointer, pointer);
}

function found(issues: Issue[], rule: string): [string, string][] {
  return only(issues, rule).map((i) => [i.pointer, i.message]);
}
const CB_A: Codebase = { id: "cb-a", name: "Checkout", repo: "acme/checkout" };
const CB_B: Codebase = { id: "cb-b", name: "Session auth", repo: "acme/session-auth" };
function cycles(doc: FmeaDocument): [string, string][] { return found(checkInvariants(doc), "cause-chain-cycle"); }
function onSvc(ids: string[]): [string, string][] { return ids.map((id) => [id, "svc"]); }

test("the minimal document violates no invariant and no priority rule", () => {
  const doc = minimalDoc();
  assert.deepEqual(checkInvariants(doc), []);
  assert.deepEqual(checkPriorities(doc, table), []);
});

test("INVARIANT_RULES lists every rule id this module can report", () => {
  assert.deepEqual([...INVARIANT_RULES], [
    "element-id-unique", "function-id-unique", "chain-id-unique", "action-id-unique",
    "function-element-resolves", "chain-function-resolves", "element-parent-resolves", "element-parent-matches-id",
    "element-source-non-catalog", "element-dependency-required", "element-security-rationale-required",
    "codebase-id-unique", "element-codebase-resolves", "dependency-from-resolves", "dependency-to-resolves",
    "dependency-self", "dependency-pair-unique", "cause-chain-resolves", "cause-chain-self", "cause-chain-cycle",
    "rating-review-by-date", "post-ratings-without-completed", "post-priority-presence",
    "handoff-without-adversarial", "adversarial-without-handoff", "handoff-cause-mismatch",
    "stale-without-reason", "stale-version-ahead",
    "priority-table-mismatch", "priority-row-table-mismatch", "priority-value-mismatch", "priority-rpn-mismatch",
  ]);
  assert.equal(INVARIANT_RULES.length, 32);
});

test("element-id-unique flags the second occurrence", () => {
  const doc = minimalDoc();
  doc.elements.push(clone(doc.elements[0]));
  expectOne(checkInvariants(doc), "element-id-unique", "INVARIANT", "/elements/1/id");
});

test("function-id-unique flags the second occurrence", () => {
  const doc = minimalDoc();
  doc.functions.push(clone(doc.functions[0]));
  expectOne(checkInvariants(doc), "function-id-unique", "INVARIANT", "/functions/1/id");
});

test("chain-id-unique flags the second occurrence", () => {
  const doc = minimalDoc();
  doc.chains.push(clone(doc.chains[0]));
  expectOne(checkInvariants(doc), "chain-id-unique", "INVARIANT", "/chains/1/id");
});

test("action-id-unique is scoped to one chain", () => {
  const doc = minimalDoc();
  const action = { id: "act-1", description: "do the thing", owner: "T. Tester", status: "Open" as const, target_date: "2026-10-01" };
  doc.chains[0].actions = [action, clone(action)];
  expectOne(checkInvariants(doc), "action-id-unique", "INVARIANT", "/chains/0/actions/1/id");
  const twoChains = minimalDoc();
  twoChains.chains[0].actions = [action];
  const second = clone(twoChains.chains[0]);
  second.id = "ch-2";
  second.actions = [clone(action)];
  twoChains.chains.push(second);
  assert.deepEqual(only(checkInvariants(twoChains), "action-id-unique"), []);
});

test("function-element-resolves flags a function pointing at no element", () => {
  const doc = minimalDoc();
  doc.functions[0].element = "ghost";
  expectOne(checkInvariants(doc), "function-element-resolves", "INVARIANT", "/functions/0/element");
});

test("chain-function-resolves flags a chain pointing at no function", () => {
  const doc = minimalDoc();
  doc.chains[0].function = "fn-ghost";
  expectOne(checkInvariants(doc), "chain-function-resolves", "INVARIANT", "/chains/0/function");
});

test("element-parent-resolves flags a parent that does not exist", () => {
  const doc = minimalDoc();
  doc.elements.push({ id: "ghost.child", kind: "component", name: "Child", description: "", parent: "ghost", boundary: "in_scope", security_relevant: false, sources: [{ kind: "document", ref: "arch.md" }] });
  expectOne(checkInvariants(doc), "element-parent-resolves", "INVARIANT", "/elements/1/parent");
});

test("element-parent-matches-id flags a parent that is not the dotted prefix", () => {
  const doc = minimalDoc();
  doc.elements.push({ id: "svc.api", kind: "interface", name: "API", description: "", parent: null, boundary: "in_scope", security_relevant: false, sources: [{ kind: "document", ref: "arch.md" }] });
  expectOne(checkInvariants(doc), "element-parent-matches-id", "INVARIANT", "/elements/1/parent");
});

test("element-source-non-catalog flags an element sourced only from the catalog", () => {
  const doc = minimalDoc();
  doc.elements[0].sources = [{ kind: "catalog", ref: "cat-service-01" }];
  expectOne(checkInvariants(doc), "element-source-non-catalog", "INVARIANT", "/elements/0/sources");
});

test("element-dependency-required fires at the boundary of an outside element no edge depends on, and any edge into it satisfies it", () => {
  for (const boundary of ["owned_outside", "third_party"] as const) {
    const doc = minimalDoc();
    doc.elements.push({ id: "svc.gateway", kind: "service", name: "Gateway", description: "", parent: "svc", boundary, security_relevant: false, sources: [{ kind: "document", ref: "arch.md" }] });
    const issues = checkInvariants(doc);
    expectOne(issues, "element-dependency-required", "INVARIANT", "/elements/1/boundary");
    assert.equal(only(issues, "element-dependency-required")[0].message, `element svc.gateway has boundary ${boundary} and no edge depends on it`);
    for (const from of ["svc", "ghost", "svc.gateway"]) {
      doc.dependencies = [{ from, to: "svc.gateway", strength: "weak" }];
      assert.deepEqual(only(checkInvariants(doc), "element-dependency-required"), [], `an edge from ${from}`);
    }
    doc.dependencies = [{ from: "svc.gateway", to: "svc", strength: "strong" }];
    expectOne(checkInvariants(doc), "element-dependency-required", "INVARIANT", "/elements/1/boundary");
  }
  const doc = minimalDoc();
  doc.elements.push({ id: "svc.gateway", kind: "service", name: "Gateway", description: "", parent: "svc", boundary: "in_scope", security_relevant: false, sources: [{ kind: "document", ref: "arch.md" }] });
  assert.deepEqual(only(checkInvariants(doc), "element-dependency-required"), []);
});

test("element-security-rationale-required fires on a true flag with no or an empty rationale and accepts a rationale on a false flag", () => {
  const doc = minimalDoc();
  doc.elements.push({ id: "svc.auth", kind: "service", name: "Auth", description: "", parent: "svc", boundary: "in_scope", security_relevant: true, sources: [{ kind: "document", ref: "arch.md" }] });
  expectOne(checkInvariants(doc), "element-security-rationale-required", "INVARIANT", "/elements/1/security_rationale");
  doc.elements[1].security_rationale = "   ";
  expectOne(checkInvariants(doc), "element-security-rationale-required", "INVARIANT", "/elements/1/security_rationale");
  doc.elements[1].security_rationale = "signs the token";
  assert.deepEqual(only(checkInvariants(doc), "element-security-rationale-required"), []);
  doc.elements[1].security_relevant = false;
  doc.elements[1].security_rationale = "not trusted";
  assert.deepEqual(only(checkInvariants(doc), "element-security-rationale-required"), []);
});

test("codebase-id-unique flags each later entry that repeats an id, at its id", () => {
  const doc = minimalDoc();
  doc.meta.codebases = [CB_A, CB_B, { ...CB_A, name: "Again" }];
  assert.deepEqual(found(checkInvariants(doc), "codebase-id-unique"), [["/meta/codebases/2/id", "codebase id cb-a is used more than once"]]);
});

test("element-codebase-resolves flags every codebase while meta.codebases is absent, then only an id no entry has", () => {
  const doc = graphDoc({ elements: [{ id: "a", codebase: "cb-a" }, { id: "b", codebase: "cb-x" }] });
  assert.deepEqual(found(checkInvariants(doc), "element-codebase-resolves"), [
    ["/elements/0/codebase", "codebase cb-a names no entry of meta.codebases"],
    ["/elements/1/codebase", "codebase cb-x names no entry of meta.codebases"],
  ]);
  doc.meta.codebases = [CB_A];
  assert.deepEqual(found(checkInvariants(doc), "element-codebase-resolves"), [["/elements/1/codebase", "codebase cb-x names no entry of meta.codebases"]]);
});

test("dependency-from-resolves, dependency-to-resolves and dependency-self report edge by edge, in that order within an edge", () => {
  const doc = graphDoc({ elements: ["svc"] });
  doc.dependencies = [edge("ghost", "svc"), edge("svc", "phantom"), edge("svc", "svc"), edge("void", "void")];
  assert.deepEqual(checkInvariants(doc).filter((i) => i.rule.startsWith("dependency-")).map((i) => [i.rule, i.pointer, i.message]), [
    ["dependency-from-resolves", "/dependencies/0/from", "element ghost does not exist"],
    ["dependency-to-resolves", "/dependencies/1/to", "element phantom does not exist"],
    ["dependency-self", "/dependencies/2/to", "edge from svc to svc has the same element at both ends"],
    ["dependency-from-resolves", "/dependencies/3/from", "element void does not exist"],
    ["dependency-to-resolves", "/dependencies/3/to", "element void does not exist"],
    ["dependency-self", "/dependencies/3/to", "edge from void to void has the same element at both ends"],
  ]);
});

test("element-dependency-required is satisfied by any edge whose to names the element, a self-edge or an unresolved from included", () => {
  const doc = graphDoc({ elements: ["svc", { id: "svc.gateway", boundary: "third_party" }] });
  doc.dependencies = [edge("svc.gateway", "svc.gateway")];
  const issues = checkInvariants(doc);
  assert.deepEqual(only(issues, "element-dependency-required"), []);
  assert.deepEqual(found(issues, "dependency-self"), [["/dependencies/0/to", "edge from svc.gateway to svc.gateway has the same element at both ends"]]);
  doc.dependencies = [edge("ghost", "svc.gateway")];
  assert.deepEqual(only(checkInvariants(doc), "element-dependency-required"), []);
});

test("dependency-pair-unique is silent on one provider with two consumers at different strengths, and the document violates nothing", () => {
  const doc = graphDoc({ elements: ["checkout", "billing", { id: "gateway", boundary: "third_party" }],
    edges: [edge("checkout", "gateway", "strong"), edge("billing", "gateway", "weak")] });
  assert.deepEqual(checkInvariants(doc), []);
});

test("dependency-pair-unique flags each later edge with the same from and to, at the edge, and never an edge that shares one end or reverses it", () => {
  const doc = graphDoc({ elements: ["svc", "db", "cache"] });
  doc.dependencies = [edge("svc", "db"), edge("svc", "db", "weak")];
  assert.deepEqual(found(checkInvariants(doc), "dependency-pair-unique"), [["/dependencies/1", "edge from svc to db is listed more than once"]]);
  doc.dependencies.push(edge("svc", "db"));
  assert.deepEqual(found(checkInvariants(doc), "dependency-pair-unique").map(([p]) => p), ["/dependencies/1", "/dependencies/2"]);
  doc.dependencies = [edge("svc", "db"), edge("svc", "cache"), edge("cache", "db"), edge("db", "svc")];
  assert.deepEqual(only(checkInvariants(doc), "dependency-pair-unique"), []);
});

test("cause-chain-resolves and cause-chain-self report cause by cause, a link resolving to the first chain of its id", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-2"]) });
  doc.chains[0].causes = [{ text: "a", chain: "ch-missing" }, { text: "b", chain: "ch-1" }];
  doc.chains[1].causes[0].chain = "ch-2";
  doc.chains[2].causes[0].chain = "ch-2";
  assert.deepEqual(checkInvariants(doc).filter((i) => i.rule === "cause-chain-resolves" || i.rule === "cause-chain-self").map((i) => [i.rule, i.pointer, i.message]), [
    ["cause-chain-resolves", "/chains/0/causes/0/chain", "chain ch-missing does not exist"],
    ["cause-chain-self", "/chains/0/causes/1/chain", "cause 1 links to its own chain ch-1"],
    ["cause-chain-self", "/chains/1/causes/0/chain", "cause 0 links to its own chain ch-2"],
  ]);
});

test("cause-chain-cycle reports a two-chain and a three-chain cycle once, at the smallest link inside it", () => {
  assert.deepEqual(cycles(graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2"]), links: [["ch-1", "ch-2"], ["ch-2", "ch-1"]] })),
    [["/chains/0/causes/0/chain", "cause 0 of chain ch-1 is on a cycle of links through chains ch-1, ch-2"]]);
  assert.deepEqual(cycles(graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-3"]), links: [["ch-1", "ch-2"], ["ch-2", "ch-3"], ["ch-3", "ch-1"]] })),
    [["/chains/0/causes/0/chain", "cause 0 of chain ch-1 is on a cycle of links through chains ch-1, ch-2, ch-3"]]);
});

test("cause-chain-cycle reports two disjoint cycles once each, in pointer order", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-3", "ch-4"]), links: [["ch-1", "ch-3"], ["ch-3", "ch-1"], ["ch-2", "ch-4"], ["ch-4", "ch-2"]] });
  assert.deepEqual(cycles(doc), [
    ["/chains/0/causes/0/chain", "cause 0 of chain ch-1 is on a cycle of links through chains ch-1, ch-3"],
    ["/chains/1/causes/0/chain", "cause 0 of chain ch-2 is on a cycle of links through chains ch-2, ch-4"],
  ]);
});

test("cause-chain-cycle reports two cycles that share a link once, at the smallest (chain index, cause index)", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-3"]), links: [["ch-1", "ch-2"], ["ch-2", "ch-1"], ["ch-3", "ch-1"]] });
  doc.chains[1].causes.push({ text: "a second cause", chain: "ch-3" });
  assert.deepEqual(cycles(doc), [["/chains/0/causes/0/chain", "cause 0 of chain ch-1 is on a cycle of links through chains ch-1, ch-2, ch-3"]]);
});

test("cause-chain-cycle never reports at a link that leaves the component, though it is the chain's cause 0", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-3"]), links: [["ch-2", "ch-1"]] });
  doc.chains[0].causes = [{ text: "a", chain: "ch-3" }, { text: "b", chain: "ch-2" }];
  assert.deepEqual(cycles(doc), [["/chains/0/causes/1/chain", "cause 1 of chain ch-1 is on a cycle of links through chains ch-1, ch-2"]]);
});

test("cause-chain-cycle does not report a chain that leads into a cycle but is not on it", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-3"]), links: [["ch-1", "ch-2"], ["ch-2", "ch-3"], ["ch-3", "ch-2"]] });
  assert.deepEqual(cycles(doc), [["/chains/1/causes/0/chain", "cause 0 of chain ch-2 is on a cycle of links through chains ch-2, ch-3"]]);
});

test("cause-chain-cycle survives a dangling link and a duplicate chain id, resolving to the first chain", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-2"]), links: [["ch-1", "ch-2"], ["ch-2", "ch-1"]] });
  doc.chains[2].causes = [{ text: "a", chain: "ch-missing" }, { text: "b", chain: "ch-2" }];
  assert.doesNotThrow(() => checkInvariants(doc));
  assert.deepEqual(cycles(doc), [["/chains/0/causes/0/chain", "cause 0 of chain ch-1 is on a cycle of links through chains ch-1, ch-2"]]);
});

test("cause-chain-cycle walks a path of 20000 links without recursion, and reports it once when its end links back", () => {
  const ids = Array.from({ length: 20000 }, (_, i) => `ch-${i + 1}`);
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(ids) });
  for (let i = 0; i + 1 < ids.length; i++) doc.chains[i].causes[0].chain = ids[i + 1];
  assert.deepEqual(cycles(doc), []);
  doc.chains[ids.length - 1].causes[0].chain = ids[0];
  assert.deepEqual(cycles(doc).map(([p]) => p), ["/chains/0/causes/0/chain"]);
});

test("rating-review-by-date flags a rescored rating with no reviewer", () => {
  const doc = minimalDoc();
  doc.chains[0].ratings.O.review = { status: "rescored" };
  expectOne(checkInvariants(doc), "rating-review-by-date", "INVARIANT", "/chains/0/ratings/O/review");
});

test("rating-review-by-date reaches post_ratings too", () => {
  const doc = minimalDoc();
  doc.chains[0].actions = [{ id: "act-1", description: "done", owner: "T. Tester", status: "Completed", target_date: "2026-08-01", completed_date: "2026-08-15" }];
  doc.chains[0].post_ratings = { S: rating(8), O: rating(3), D: rating(4) };
  doc.chains[0].post_ratings.D.review = { status: "authored" };
  expectOne(checkInvariants(doc), "rating-review-by-date", "INVARIANT", "/chains/0/post_ratings/D/review");
});

test("post-ratings-without-completed flags a re-rating with no completed action", () => {
  const doc = minimalDoc();
  doc.chains[0].post_ratings = { S: rating(8), O: rating(3), D: rating(4) };
  expectOne(checkInvariants(doc), "post-ratings-without-completed", "INVARIANT", "/chains/0/post_ratings");
});

// The minimal document with one Completed action and a post-action re-rating of S 4, O 3, D 2,
// the golden fixture's ch-3 shape; under the shipped table that re-rating is M with rpn 24.
function withPostRatings(): FmeaDocument {
  const doc = minimalDoc();
  doc.chains[0].actions = [{ id: "act-1", description: "add a retry", owner: "T. Tester", status: "Completed", target_date: "2026-08-01", completed_date: "2026-08-15" }];
  doc.chains[0].post_ratings = { S: rating(4), O: rating(3), D: rating(2) };
  doc.chains[0].post_priority = { value: "M", table: "priority-fmea-software-v1", rpn: 24 };
  return doc;
}

test("a row carrying post_ratings and the post_priority they give violates nothing", () => {
  const doc = withPostRatings();
  assert.deepEqual(checkInvariants(doc), []);
  assert.deepEqual(checkPriorities(doc, table), []);
});

test("post-priority-presence flags post_priority on a row with no post_ratings", () => {
  const doc = withPostRatings();
  delete doc.chains[0].post_ratings;
  expectOne(checkInvariants(doc), "post-priority-presence", "INVARIANT", "/chains/0/post_priority");
  assert.deepEqual(checkPriorities(doc, table), [], "with no post_ratings there is nothing to recompute");
});

test("post-priority-presence flags post_ratings on a row with no post_priority", () => {
  const doc = withPostRatings();
  delete doc.chains[0].post_priority;
  expectOne(checkInvariants(doc), "post-priority-presence", "INVARIANT", "/chains/0/post_priority");
  assert.deepEqual(checkPriorities(doc, table), [], "with no post_priority there is nothing to compare");
});

test("priority-value-mismatch reaches post_priority at its own pointer", () => {
  const doc = withPostRatings();
  const wrong = table.vocabulary.find((v) => v !== doc.chains[0].post_priority!.value);
  assert.ok(wrong, "the shipped table needs at least two priority values");
  doc.chains[0].post_priority!.value = wrong;
  expectOne(checkPriorities(doc, table), "priority-value-mismatch", "PRIORITY_MISMATCH", "/chains/0/post_priority/value");
});

test("handoff-without-adversarial flags a handoff with no adversarial cause", () => {
  const doc = minimalDoc();
  doc.chains[0].handoff = { to: "threat-model", reason: "needs an attacker analysis", adversary_cause: "process crash" };
  expectOne(checkInvariants(doc), "handoff-without-adversarial", "INVARIANT", "/chains/0/handoff");
});

test("adversarial-without-handoff flags an adversarial cause with no handoff", () => {
  const doc = minimalDoc();
  doc.chains[0].causes = [{ text: "attacker replays a token", adversarial: true }];
  expectOne(checkInvariants(doc), "adversarial-without-handoff", "INVARIANT", "/chains/0/causes");
});

test("handoff-cause-mismatch flags adversary_cause that matches no adversarial cause", () => {
  const doc = minimalDoc();
  doc.chains[0].causes = [{ text: "attacker replays a token", adversarial: true }];
  doc.chains[0].handoff = { to: "threat-model", reason: "needs an attacker analysis", adversary_cause: "attacker forges a token" };
  expectOne(checkInvariants(doc), "handoff-cause-mismatch", "INVARIANT", "/chains/0/handoff/adversary_cause");
  doc.chains[0].handoff.adversary_cause = "attacker replays a token";
  assert.deepEqual(only(checkInvariants(doc), "handoff-cause-mismatch"), []);
  // A cause that exists on the chain but is not marked adversarial is still a mismatch: §6 makes
  // adversary_cause the text of a cause marked `adversarial`, not of any cause on the row.
  doc.chains[0].causes = [
    { text: "attacker replays a token", adversarial: true },
    { text: "the pricing service times out" },
  ];
  doc.chains[0].handoff.adversary_cause = "the pricing service times out";
  expectOne(checkInvariants(doc), "handoff-cause-mismatch", "INVARIANT", "/chains/0/handoff/adversary_cause");
});

test("stale-without-reason flags a flagged row with no reason", () => {
  const doc = minimalDoc();
  doc.chains[0].stale = { flag: true };
  expectOne(checkInvariants(doc), "stale-without-reason", "INVARIANT", "/chains/0/stale");
});

test("stale-version-ahead flags since_version beyond meta.version", () => {
  const doc = minimalDoc();
  doc.chains[0].stale = { flag: true, reason: "element-changed", since_version: 2 };
  expectOne(checkInvariants(doc), "stale-version-ahead", "INVARIANT", "/chains/0/stale/since_version");
});

test("stale-version-ahead allows since_version equal to meta.version", () => {
  const doc = minimalDoc();
  doc.chains[0].stale = { flag: true, reason: "scales-version", since_version: doc.meta.version };
  assert.deepEqual(only(checkInvariants(doc), "stale-version-ahead"), []);
});

test("priority-table-mismatch is reported alone and stops the per-row checks", () => {
  const doc: FmeaDocument = minimalDoc();
  doc.meta.scales.priority_table = "some-other-table";
  doc.chains[0].priority = { value: "L", table: "some-other-table", rpn: 1 };
  const issues = checkPriorities(doc, table);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "priority-table-mismatch");
  assert.equal(issues[0].code, "TABLE_ID_MISMATCH");
  assert.equal(issues[0].pointer, "/meta/scales/priority_table");
  assert.ok(issues[0].message.includes("some-other-table"));
  assert.ok(issues[0].message.includes("priority-fmea-software-v1"));
});

test("priority-row-table-mismatch flags a row naming another table", () => {
  const doc = minimalDoc();
  doc.chains[0].priority.table = "priority-other-v1";
  expectOne(checkPriorities(doc, table), "priority-row-table-mismatch", "PRIORITY_MISMATCH", "/chains/0/priority/table");
});

test("priority-value-mismatch flags a stored value the table does not give", () => {
  const doc = minimalDoc();
  const wrong = table.vocabulary.find((v) => v !== doc.chains[0].priority.value);
  assert.ok(wrong, "the shipped table needs at least two priority values");
  doc.chains[0].priority.value = wrong;
  expectOne(checkPriorities(doc, table), "priority-value-mismatch", "PRIORITY_MISMATCH", "/chains/0/priority/value");
});

test("priority-rpn-mismatch flags an rpn that is not the product", () => {
  const doc = minimalDoc();
  doc.chains[0].priority.rpn = 95;
  expectOne(checkPriorities(doc, table), "priority-rpn-mismatch", "PRIORITY_MISMATCH", "/chains/0/priority/rpn");
});
