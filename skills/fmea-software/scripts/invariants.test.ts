import { test } from "node:test";
import assert from "node:assert/strict";
import { INVARIANT_RULES, checkInvariants, checkPriorities } from "./lib/invariants.ts";
import { loadTable } from "./lib/table.ts";
import { clone, minimalDoc, rating } from "./test-helpers.ts";
import type { FmeaDocument } from "./lib/types.ts";
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

test("the minimal document violates no invariant and no priority rule", () => {
  const doc = minimalDoc();
  assert.deepEqual(checkInvariants(doc), []);
  assert.deepEqual(checkPriorities(doc, table), []);
});

test("INVARIANT_RULES lists every rule id this module can report", () => {
  assert.deepEqual([...INVARIANT_RULES], [
    "element-id-unique", "function-id-unique", "chain-id-unique", "action-id-unique",
    "function-element-resolves", "chain-function-resolves", "element-parent-resolves", "element-parent-matches-id",
    "element-source-non-catalog", "element-dependency-required",
    "rating-review-by-date", "post-ratings-without-completed", "post-priority-presence",
    "handoff-without-adversarial", "adversarial-without-handoff", "handoff-cause-mismatch",
    "stale-without-reason", "stale-version-ahead",
    "priority-table-mismatch", "priority-row-table-mismatch", "priority-value-mismatch", "priority-rpn-mismatch",
  ]);
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
  doc.elements.push({ id: "ghost.child", kind: "component", name: "Child", description: "", parent: "ghost", sources: [{ kind: "document", ref: "arch.md" }] });
  expectOne(checkInvariants(doc), "element-parent-resolves", "INVARIANT", "/elements/1/parent");
});

test("element-parent-matches-id flags a parent that is not the dotted prefix", () => {
  const doc = minimalDoc();
  doc.elements.push({ id: "svc.api", kind: "interface", name: "API", description: "", parent: null, sources: [{ kind: "document", ref: "arch.md" }] });
  expectOne(checkInvariants(doc), "element-parent-matches-id", "INVARIANT", "/elements/1/parent");
});

test("element-source-non-catalog flags an element sourced only from the catalog", () => {
  const doc = minimalDoc();
  doc.elements[0].sources = [{ kind: "catalog", ref: "cat-service-01" }];
  expectOne(checkInvariants(doc), "element-source-non-catalog", "INVARIANT", "/elements/0/sources");
});

test("element-dependency-required flags an external_dependency with no dependency block", () => {
  const doc = minimalDoc();
  doc.elements.push({ id: "svc.gateway", kind: "external_dependency", name: "Gateway", description: "", parent: "svc", sources: [{ kind: "document", ref: "arch.md" }] });
  expectOne(checkInvariants(doc), "element-dependency-required", "INVARIANT", "/elements/1/dependency");
  doc.elements[1].dependency = { strength: "strong" };
  assert.deepEqual(only(checkInvariants(doc), "element-dependency-required"), []);
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
