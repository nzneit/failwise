import { test } from "node:test";
import assert from "node:assert/strict";
import { chainElement, edgeJoins, effectiveCodebases, indexDocument, isDescendantOf, resolvedLinks, rootOf, sameLineage, sameTrimmed, triggerRestates } from "./lib/graph.ts";
import type { DocIndex, ResolvedLink } from "./lib/graph.ts";
import { edge, graphDoc, minimalDoc, newElement } from "./test-helpers.ts";
import type { DependencyEdge } from "./lib/types.ts";

test("graphDoc builds one function per element and one chain per entry, and a link writes the provider's O as cited_o", () => {
  const doc = graphDoc({ elements: ["svc", { id: "db", boundary: "third_party" }], edges: [edge("svc", "db", "weak", { sla: "99.9% monthly" })],
    chains: [["ch-1", "svc"], ["ch-2", "db"]], links: [["ch-1", "ch-2"]] });
  assert.deepEqual(doc.functions.map((f) => [f.id, f.element]), [["fn-svc", "svc"], ["fn-db", "db"]]);
  assert.deepEqual(doc.chains.map((c) => [c.id, c.function]), [["ch-1", "fn-svc"], ["ch-2", "fn-db"]]);
  assert.deepEqual(doc.dependencies, [{ from: "svc", to: "db", strength: "weak", sla: "99.9% monthly" }]);
  assert.deepEqual(doc.chains[0].causes[0], { text: "process crash", chain: "ch-2", cited_o: { value: 3, evidence_kind: "estimate" } });
  assert.equal(doc.elements[1].boundary, "third_party");
  assert.equal(newElement("svc.api.handler").parent, "svc.api");
  assert.equal(newElement("svc").parent, null);
});

test("indexDocument maps each element, function and chain id to its first occurrence in document order", () => {
  const doc = graphDoc({ elements: ["svc", "db", "svc"], chains: [["ch-1", "svc"], ["ch-2", "db"], ["ch-1", "db"]] });
  const index: DocIndex = indexDocument(doc);
  assert.deepEqual([...index.element], [["svc", 0], ["db", 1]]);
  assert.deepEqual([...index.fn], [["fn-svc", 0], ["fn-db", 1]]);
  assert.deepEqual([...index.chain], [["ch-1", 0], ["ch-2", 1]]);
});

test("the parent walk lists ancestors nearest first and ends at a null parent and at a parent that does not resolve", () => {
  const doc = graphDoc({ elements: ["svc", "svc.api", "svc.api.handler", "ghost.child"] });
  assert.deepEqual(indexDocument(doc).ancestors, [[], [0], [1, 0], []]);
});

test("two elements that name each other as parent end the walk, each the other's ancestor", () => {
  const doc = graphDoc({ elements: [{ id: "a", parent: "b" }, { id: "b", parent: "a" }, { id: "c", parent: "a" }] });
  const index = indexDocument(doc);
  assert.deepEqual(index.ancestors, [[1], [0], [0, 1]]);
  assert.equal(isDescendantOf(index, 0, 1), true);
  assert.equal(isDescendantOf(index, 1, 0), true);
});

test("sameLineage holds for an element, its ancestors and its descendants, and not for a sibling or another root", () => {
  const index = indexDocument(graphDoc({ elements: ["svc", "svc.api", "svc.db", "pricing"] }));
  assert.deepEqual([sameLineage(index, 1, 1), sameLineage(index, 1, 0), sameLineage(index, 0, 1), sameLineage(index, 1, 2), sameLineage(index, 0, 3)],
    [true, true, true, false, false]);
});

test("chainElement reaches the element through the first function of the chain's id, and gives undefined when either does not resolve", () => {
  const doc = graphDoc({ elements: ["svc", "db"], chains: [["ch-1", "db"], ["ch-2", "svc"], ["ch-3", "svc"], ["ch-4", "svc"]] });
  doc.functions.push({ ...doc.functions[0], element: "db" });
  doc.functions.push({ id: "fn-ghost", element: "ghost", statement: "s", conditions: [], for_whom: "x" });
  doc.chains[2].function = "fn-missing";
  doc.chains[3].function = "fn-ghost";
  const index = indexDocument(doc);
  assert.deepEqual([0, 1, 2, 3].map((c) => chainElement(doc, index, c)), [1, 0, undefined, undefined]);
});

test("resolvedLinks keeps links that resolve to the first chain of the id, in chain and cause order, and drops unresolved links and self-links", () => {
  const doc = graphDoc({ elements: ["svc"], chains: [["ch-1", "svc"], ["ch-2", "svc"], ["ch-2", "svc"]] });
  doc.chains[0].causes = [{ text: "a", chain: "ch-2" }, { text: "b", chain: "ch-missing" }, { text: "c" }];
  doc.chains[1].causes[0].chain = "ch-2";
  doc.chains[2].causes[0].chain = "ch-2";
  const expected: ResolvedLink[] = [{ chain: 0, cause: 0, provider: 1 }, { chain: 2, cause: 0, provider: 1 }];
  assert.deepEqual(resolvedLinks(doc, indexDocument(doc)), expected);
});

test("edgeJoins takes an edge from the consumer, an ancestor or a descendant of it to the provider or an ancestor of it", () => {
  const index = indexDocument(graphDoc({ elements: ["svc", "svc.api", "svc.api.handler", "db", "db.shard", "pricing"] }));
  const joins = (e: DependencyEdge, c: number, p: number): boolean => edgeJoins(index, e, c, p);
  assert.equal(joins(edge("svc.api", "db.shard"), 1, 4), true);
  assert.equal(joins(edge("svc", "db"), 1, 4), true);
  assert.equal(joins(edge("svc.api.handler", "db"), 1, 4), true);
  assert.equal(joins(edge("svc.api", "db.shard"), 1, 3), false);
  assert.equal(joins(edge("pricing", "db.shard"), 1, 4), false);
  assert.equal(joins(edge("ghost", "db"), 1, 4), false);
  assert.equal(joins(edge("svc", "ghost"), 1, 4), false);
});

test("effectiveCodebases follows every inheritance rule: own, in-scope parent, override, outside element, unresolved id and parent, absent list", () => {
  const doc = graphDoc({ elements: [
    { id: "a", codebase: "cb-a" }, "a.x", "a.x.y", { id: "a.lib", codebase: "cb-b" }, "a.lib.z",
    { id: "a.gw", boundary: "third_party" }, "a.gw.adapter",
    { id: "a.vendor", boundary: "owned_outside", codebase: "cb-b" }, "a.vendor.shim",
    { id: "a.m", codebase: "cb-missing" }, "a.m.n", "ghost.k",
  ] });
  doc.meta.codebases = [{ id: "cb-a", name: "A", repo: "acme/a" }, { id: "cb-b", name: "B", repo: "acme/b" }, { id: "cb-a", name: "A again", repo: "acme/other" }];
  const repos = (): (string | null)[] => effectiveCodebases(doc, indexDocument(doc)).map((c) => (c === undefined ? null : c.repo));
  assert.deepEqual(repos(), ["acme/a", "acme/a", "acme/a", "acme/b", "acme/b", null, null, "acme/b", null, null, null, null]);
  delete doc.meta.codebases;
  assert.deepEqual(repos(), Array.from({ length: 12 }, () => null));
});

test("rootOf gives the depth-1 element a walk ends at, and undefined through an unresolved parent or a parent cycle", () => {
  const doc = graphDoc({ elements: ["svc", "svc.api", "svc.api.h", "ghost.k", "ghost.k.m", { id: "a", parent: "b" }, { id: "b", parent: "a" }] });
  const index = indexDocument(doc);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((e) => rootOf(doc, index, e)), [0, 0, 0, undefined, undefined, undefined, undefined]);
});

test("sameTrimmed compares trimmed text, and triggerRestates needs a non-empty trimmed trigger equal to the text", () => {
  assert.equal(sameTrimmed("  the cause \n", "the cause"), true);
  assert.equal(sameTrimmed("the cause", "a cause"), false);
  const chain = minimalDoc().chains[0];
  assert.equal(triggerRestates(chain, "process crash"), false);
  chain.trigger = "  process crash ";
  assert.equal(triggerRestates(chain, "process crash"), true);
  assert.equal(triggerRestates(chain, "a power cut"), false);
  chain.trigger = "   ";
  assert.equal(triggerRestates(chain, "  "), false);
});
