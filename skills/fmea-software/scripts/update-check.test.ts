// The structural check of an update: lib/update-diff.ts driven directly, then update-check.ts through runCli.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffUpdate } from "./lib/update-diff.ts";
import type { UpdateDiff } from "./lib/update-diff.ts";
import { legacyIssues } from "./lib/legacy.ts";
import type { Cause, Chain, DependencyEdge, FmeaDocument, StaleReason } from "./lib/types.ts";
import { clone, edge, fixturePath, graphDoc, loadFixture, moveEdgesIntoBlocks, newElement, rating, runCli, withTempDir, writeJson } from "./test-helpers.ts";

const EMPTY: UpdateDiff = { edges: [], elements: [], reached: [], unmarked: [], removedLinks: [], orphans: [], changedProviders: [], order: [] };

/** diffUpdate of `copy` against a clone of it that `edit` changes. */
function changed(copy: FmeaDocument, edit: (draft: FmeaDocument) => void): UpdateDiff {
  const draft = clone(copy);
  edit(draft);
  return diffUpdate(copy, draft);
}

function edgeDoc(): FmeaDocument {
  return graphDoc({ elements: ["a", "b", "c", "d"], edges: [edge("a", "b", "strong", { sla: "99.9%" }), edge("a", "c"), edge("a", "d", "weak", { limits: "10 rps" }), edge("b", "c")] });
}

test("diffUpdate diffs edges by from and to: changed per field, an absent sla against a present one, added in draft order, removed last", () => {
  const diff = changed(edgeDoc(), (d) => {
    d.dependencies = [edge("a", "b", "weak", { sla: "99.9%" }), edge("a", "c", "strong", { sla: "99.95%" }), edge("a", "d", "weak", { limits: "20 rps" }), edge("c", "d")];
  });
  assert.deepEqual(diff.edges, [
    { change: "changed", from: "a", to: "b", fields: ["strength"] },
    { change: "changed", from: "a", to: "c", fields: ["sla"] },
    { change: "changed", from: "a", to: "d", fields: ["limits"] },
    { change: "added", from: "c", to: "d", fields: [] },
    { change: "removed", from: "b", to: "c", fields: [] },
  ]);
});

test("diffUpdate finds no change in a draft equal to the copy, nor in edges carried forward in another order", () => {
  assert.deepEqual(diffUpdate(edgeDoc(), clone(edgeDoc())), EMPTY);
  assert.deepEqual(changed(edgeDoc(), (d) => { d.dependencies.reverse(); }), EMPTY);
});

test("diffUpdate: a boundary change reaches its element's own chains only, and lists their consumer as unmarked", () => {
  const copy = graphDoc({ elements: ["checkout", "pricing"], edges: [edge("checkout", "pricing", "weak")],
    chains: [["ch-1", "checkout"], ["ch-2", "pricing"], ["ch-3", "checkout"]], links: [["ch-3", "ch-2"]] });
  assert.deepEqual(changed(copy, (d) => { d.elements[1].boundary = "owned_outside"; }), {
    ...EMPTY,
    elements: [{ change: "changed", id: "pricing", fields: ["boundary"] }],
    reached: [{ chainId: "ch-2", index: 1, rule: "element pricing boundary changed" }],
    unmarked: [{ chainId: "ch-3", rule: "link /chains/2/causes/0 into ch-2, a row this update marks" }],
    order: ["ch-2"],
  });
});

test("diffUpdate: an element change in two fields names both in its chains' rule, joined as the elements section joins them", () => {
  const copy = graphDoc({ elements: ["checkout", "pricing"], chains: [["ch-1", "checkout"], ["ch-2", "pricing"]] });
  assert.deepEqual(changed(copy, (d) => { d.elements[1].kind = "datastore"; d.elements[1].security_relevant = true; }), {
    ...EMPTY,
    elements: [{ change: "changed", id: "pricing", fields: ["kind", "security_relevant"] }],
    reached: [{ chainId: "ch-2", index: 1, rule: "element pricing kind, security_relevant changed" }],
    order: ["ch-2"],
  });
});

test("diffUpdate: a re-parented consumer marks the provider's chains through the added edge, and its new chain is never reached", () => {
  const copy = graphDoc({ elements: ["checkout", "checkout.api", { id: "gw", boundary: "third_party" }], edges: [edge("checkout.api", "gw")],
    chains: [["ch-1", "gw"], ["ch-2", "checkout.api"]], links: [["ch-2", "ch-1"]] });
  const diff = changed(copy, (d) => {
    d.elements[1] = newElement("api");
    d.functions[1] = { ...d.functions[1], id: "fn-api", element: "api" };
    d.dependencies = [edge("api", "gw")];
    d.chains[1] = { ...d.chains[1], id: "ch-3", function: "fn-api" };
  });
  assert.deepEqual(diff, {
    ...EMPTY,
    edges: [{ change: "added", from: "api", to: "gw", fields: [] }, { change: "removed", from: "checkout.api", to: "gw", fields: [] }],
    elements: [{ change: "added", id: "api", fields: [] }, { change: "removed", id: "checkout.api", fields: [] }],
    reached: [{ chainId: "ch-1", index: 0, rule: "edge api to gw changed" }],
    order: ["ch-1"],
  });
});

test("diffUpdate: a re-parented provider marks nothing, its new chain is never stale, and the link into its removed chain lists the new chain", () => {
  const copy = graphDoc({ elements: ["checkout", { id: "checkout.gw", boundary: "third_party" }], edges: [edge("checkout", "checkout.gw")],
    chains: [["ch-1", "checkout.gw"], ["ch-2", "checkout"]], links: [["ch-2", "ch-1"]] });
  const diff = changed(copy, (d) => {
    d.elements[1] = newElement("gw", { boundary: "third_party" });
    d.functions[1] = { ...d.functions[1], id: "fn-gw", element: "gw" };
    d.dependencies = [edge("checkout", "gw")];
    d.chains[0] = { ...d.chains[0], id: "ch-3", function: "fn-gw" };
  });
  assert.deepEqual(diff, {
    ...EMPTY,
    edges: [{ change: "added", from: "checkout", to: "gw", fields: [] }, { change: "removed", from: "checkout", to: "checkout.gw", fields: [] }],
    elements: [{ change: "added", id: "gw", fields: [] }, { change: "removed", id: "checkout.gw", fields: [] }],
    removedLinks: [{ chainId: "ch-2", index: 1, cause: 0, removed: "ch-1", candidates: ["ch-3"] }],
  });
});

test("diffUpdate: a link into a removed chain lists no candidate that reaches the consumer, directly or through another new chain", () => {
  const copy = graphDoc({ elements: ["checkout", { id: "checkout.gw", boundary: "third_party" }], edges: [edge("checkout", "checkout.gw")],
    chains: [["ch-1", "checkout.gw"], ["ch-2", "checkout"]], links: [["ch-2", "ch-1"]] });
  const diff = changed(copy, (d) => {
    d.elements[1] = newElement("gw", { boundary: "third_party" });
    d.functions[1] = { ...d.functions[1], id: "fn-gw", element: "gw" };
    d.dependencies = [edge("checkout", "gw")];
    const base = { ...d.chains[0], function: "fn-gw" };
    const linked = (id: string, into: string): Chain => ({ ...clone(base), id, causes: [{ ...clone(base.causes[0]), chain: into }] });
    d.chains[0] = { ...clone(base), id: "ch-4" };
    d.chains.push(linked("ch-5", "ch-2"), linked("ch-6", "ch-5"));
  });
  assert.deepEqual(diff.removedLinks, [{ chainId: "ch-2", index: 1, cause: 0, removed: "ch-1", candidates: ["ch-4"] }]);
});

test("diffUpdate: an edge change reaches the chains on to and the links into them from from, an ancestor of from and a descendant of from, and no further", () => {
  const copy = graphDoc({
    elements: ["shop", "shop.api", "shop.api.handler", "shop.store", { id: "gw", boundary: "third_party" }, "gw.auth"],
    edges: [edge("shop.api", "gw", "strong", { sla: "99.9%" })],
    chains: [["ch-1", "gw"], ["ch-2", "gw.auth"], ["ch-3", "shop.api"], ["ch-4", "shop"], ["ch-5", "shop.api.handler"], ["ch-6", "shop.store"], ["ch-7", "shop.api"]],
    links: [["ch-3", "ch-1"], ["ch-4", "ch-1"], ["ch-5", "ch-1"], ["ch-6", "ch-1"], ["ch-7", "ch-2"]],
  });
  assert.deepEqual(changed(copy, (d) => { d.dependencies[0].sla = "99.95%"; }), {
    ...EMPTY,
    edges: [{ change: "changed", from: "shop.api", to: "gw", fields: ["sla"] }],
    reached: [
      { chainId: "ch-1", index: 0, rule: "edge shop.api to gw changed" },
      { chainId: "ch-3", index: 2, rule: "link /chains/2/causes/0 into ch-1 across edge shop.api to gw" },
      { chainId: "ch-4", index: 3, rule: "link /chains/3/causes/0 into ch-1 across edge shop.api to gw" },
      { chainId: "ch-5", index: 4, rule: "link /chains/4/causes/0 into ch-1 across edge shop.api to gw" },
    ],
    unmarked: [
      { chainId: "ch-6", rule: "link /chains/5/causes/0 into ch-1, a row this update marks" },
      { chainId: "ch-7", rule: "link /chains/6/causes/0 into ch-2 on gw.auth, a descendant of gw" },
    ],
    order: ["ch-1", "ch-3", "ch-4", "ch-5"],
  });
});

test("diffUpdate: a re-rated provider marks no consumer, and the consumer's cause is listed with what changed", () => {
  const copy = graphDoc({ elements: ["checkout", { id: "gw", boundary: "third_party" }], edges: [edge("checkout", "gw")],
    chains: [["ch-1", "gw"], ["ch-2", "checkout"]], links: [["ch-2", "ch-1"]] });
  const diff = changed(copy, (d) => { d.chains[0].failure_mode = "times out"; d.chains[0].ratings.O = rating(5); });
  assert.deepEqual(diff, { ...EMPTY, changedProviders: [{ chainId: "ch-2", index: 1, cause: 0, provider: "ch-1", changed: ["failure_mode", "O"] }] });
});

test("diffUpdate orders the stale rows provider before consumer over a three-chain link path, ties by draft index", () => {
  const copy = graphDoc({ elements: ["a", "b", "c", "d"], chains: [["ch-c", "c"], ["ch-b", "b"], ["ch-a", "a"], ["ch-d", "d"]], links: [["ch-c", "ch-b"], ["ch-b", "ch-a"]] });
  const diff = changed(copy, (d) => {
    d.meta.version = 2;
    for (const c of d.chains) c.stale = { flag: true, reason: "function-changed", since_version: 2 };
  });
  assert.deepEqual(diff.reached, []);
  assert.deepEqual(diff.order, ["ch-a", "ch-b", "ch-c", "ch-d"]);
});

test("diffUpdate lists each outside element that is the to of no edge with what left it so, and the re-run after a confirmed removal lists the next", () => {
  const copy = graphDoc({ elements: ["checkout", { id: "platform", boundary: "owned_outside" }, { id: "vendor", boundary: "third_party" }, "checkout.cache", { id: "legacy", boundary: "third_party" }],
    edges: [edge("checkout", "platform"), edge("platform", "vendor")] });
  const first = clone(copy);
  first.dependencies = [edge("platform", "vendor")];
  first.elements[3].boundary = "owned_outside";
  first.elements.push(newElement("ext", { boundary: "third_party" }));
  const tail = [
    { element: "checkout.cache", why: "its boundary changed to owned_outside and no edge names it" },
    { element: "legacy", why: "it had no consumer in the stored copy either" },
    { element: "ext", why: "it is added with no consumer" },
  ];
  assert.deepEqual(diffUpdate(copy, first).orphans, [{ element: "platform", why: "its last edge, from checkout, was removed" }, ...tail]);
  const second = clone(first);
  second.elements = second.elements.filter((e) => e.id !== "platform");
  second.functions = second.functions.filter((f) => f.element !== "platform");
  second.dependencies = [];
  assert.deepEqual(diffUpdate(copy, second).orphans, [{ element: "vendor", why: "its last edge, from platform, went with removed element platform" }, ...tail]);
});

test("diffUpdate: a removed codebase and a cleared or relabelled element mark nothing", () => {
  const copy = graphDoc({ elements: [{ id: "checkout", codebase: "checkout" }, { id: "checkout.auth", codebase: "auth" }], chains: [["ch-1", "checkout.auth"]] });
  copy.meta.codebases = [{ id: "checkout", name: "Checkout", repo: "acme/checkout" }, { id: "auth", name: "Auth", repo: "acme/auth" }];
  assert.deepEqual(changed(copy, (d) => {
    d.meta.codebases = [{ id: "checkout", name: "Checkout", repo: "acme/checkout" }];
    delete d.elements[1].codebase;
    d.elements[1].name = "Auth library";
  }), EMPTY);
});

function chainOf(doc: FmeaDocument, id: string): Chain {
  const c = doc.chains.find((x) => x.id === id);
  assert.ok(c, `no chain ${id}`);
  return c;
}

function edgeOf(doc: FmeaDocument, from: string, to: string): DependencyEdge {
  const e = doc.dependencies.find((x) => x.from === from && x.to === to);
  assert.ok(e, `no edge ${from} to ${to}`);
  return e;
}

/** The copy one version on, with a meta.history entry at that version. */
function bumped(copy: FmeaDocument): FmeaDocument {
  const d = clone(copy);
  d.meta.version = copy.meta.version + 1;
  d.meta.history.push({ version: d.meta.version, date: "2026-10-08", change: "test update" });
  return d;
}

/** checkout consumes the third-party gw; ch-1 on gw, ch-2 on checkout links into ch-1, ch-3 on checkout.api. */
function storedCopy(): FmeaDocument {
  return graphDoc({ elements: ["checkout", "checkout.api", { id: "gw", boundary: "third_party" }], edges: [edge("checkout", "gw")],
    chains: [["ch-1", "gw"], ["ch-2", "checkout"], ["ch-3", "checkout.api"]], links: [["ch-2", "ch-1"]] });
}

/** The draft the rules accept: the gw edge weak, ch-1 and ch-2 flagged element-changed at the draft's version. */
function goodDraft(copy: FmeaDocument): FmeaDocument {
  const d = bumped(copy);
  edgeOf(d, "checkout", "gw").strength = "weak";
  for (const id of ["ch-1", "ch-2"]) chainOf(d, id).stale = { flag: true, reason: "element-changed", since_version: d.meta.version };
  return d;
}

type Run = { status: number; stdout: string; stderr: string };

function runCheck(copy: unknown, draft: unknown, ...flags: string[]): Run {
  return withTempDir((dir) => runCli("update-check.ts", [writeJson(dir, "copy.json", copy), writeJson(dir, "draft.json", draft), ...flags]));
}

/** A change to the stored copy, made before goodDraft is built from it, and a change to that draft. */
type Edit = { copy?: (c: FmeaDocument) => void; edit: (d: FmeaDocument) => void };

/** --check of storedCopy, changed by `e.copy`, against goodDraft of it, changed by `e.edit`. */
function checkEdited(e: Edit): Run {
  const copy = storedCopy();
  e.copy?.(copy);
  const draft = goodDraft(copy);
  e.edit(draft);
  return runCheck(copy, draft, "--check");
}

const NONE = (name: string): string => `${name}:\n  none\n`;

test("update-check.ts prints the diff on the first run and refuses nothing a draft has not yet flagged", () => {
  const copy = storedCopy();
  const draft = bumped(copy);
  edgeOf(draft, "checkout", "gw").strength = "weak";
  const r = runCheck(copy, draft);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout, "edges:\n  changed checkout to gw: strength\n" + NONE("elements") +
    "stale:\n  ch-1: edge checkout to gw changed\n  ch-2: link /chains/1/causes/0 into ch-1 across edge checkout to gw\n" +
    NONE("unmarked") + NONE("links into removed chains") + NONE("outside elements with no consumer") +
    "re-rating order:\n  ch-1, ch-2\n" +
    "update-check: 1 edge change, 0 element changes, 2 stale rows, 0 unmarked rows, 0 links into removed chains, 0 outside elements with no consumer\n");
});

test("update-check.ts --check accepts a draft whose flags the rules reach, and prints the changed-provider section and count", () => {
  const r = runCheck(storedCopy(), goodDraft(storedCopy()), "--check");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.ok(r.stdout.includes(NONE("outside elements with no consumer") + NONE("consumer causes whose linked chain changed") + "re-rating order:\n  ch-1, ch-2\n"), r.stdout);
  assert.ok(r.stdout.endsWith(", 0 outside elements with no consumer, 0 changed providers\n"), r.stdout);
});

test("update-check.ts given one path as both copy and draft prints every section none, and --check refuses it at /meta/version", () => {
  const path = fixturePath("update", "before.fmea.json");
  const r = runCli("update-check.ts", [path, path]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, ["edges", "elements", "stale", "unmarked", "links into removed chains", "outside elements with no consumer", "re-rating order"].map(NONE).join("") +
    "update-check: 0 edge changes, 0 element changes, 0 stale rows, 0 unmarked rows, 0 links into removed chains, 0 outside elements with no consumer\n");
  const c = runCli("update-check.ts", [path, path, "--check"]);
  assert.equal(c.status, 2);
  assert.equal(c.stderr, "error UPDATE_BASELINE: update-baseline: the draft's meta.version 1 is not 2 as the stored copy's meta.version 1 requires at /meta/version\n");
});

const MISMATCHES: (Edit & { name: string; stderr: string })[] = [
  { name: "stale-missing: each reached row with stale.flag false and no clearing entry is refused at its flag",
    edit: (d) => { for (const id of ["ch-1", "ch-2"]) chainOf(d, id).stale = { flag: false }; },
    stderr: "error UPDATE_MISMATCH: stale-missing: chain ch-1 is reached by edge checkout to gw changed but its stale.flag is false at /chains/0/stale/flag\n" +
      "error UPDATE_MISMATCH: stale-missing: chain ch-2 is reached by link /chains/1/causes/0 into ch-1 across edge checkout to gw but its stale.flag is false at /chains/1/stale/flag\n" },
  { name: "stale-reason: a reached row flagged for another reason is refused at its reason",
    edit: (d) => { chainOf(d, "ch-1").stale.reason = "function-changed"; },
    stderr: "error UPDATE_MISMATCH: stale-reason: chain ch-1 is reached by edge checkout to gw changed but its stale.reason is function-changed at /chains/0/stale/reason\n" },
  { name: "stale-since-version: a newly flagged row takes the draft's meta.version",
    edit: (d) => { chainOf(d, "ch-2").stale.since_version = 1; },
    stderr: "error UPDATE_MISMATCH: stale-since-version: chain ch-2 has stale.since_version 1 where 2 is due at /chains/1/stale/since_version\n" },
  { name: "stale-unreached: an element-changed flag new in this version that no rule reaches is refused",
    edit: (d) => { chainOf(d, "ch-3").stale = { flag: true, reason: "element-changed", since_version: 2 }; },
    stderr: "error UPDATE_MISMATCH: stale-unreached: chain ch-3 is newly flagged element-changed but no rule reaches it at /chains/2/stale/reason\n" },
  { name: "stale-since-version: a row flagged before keeps its own since_version when element-changed replaces function-changed",
    copy: (c) => { c.meta.version = 2; chainOf(c, "ch-1").stale = { flag: true, reason: "function-changed", since_version: 2 }; },
    edit: () => undefined,
    stderr: "error UPDATE_MISMATCH: stale-since-version: chain ch-1 has stale.since_version 3 where 2 is due at /chains/0/stale/since_version\n" },
  { name: "stale-since-version: a row flagged before with no since_version keeps none, and the line says absent is due",
    copy: (c) => { chainOf(c, "ch-1").stale = { flag: true, reason: "element-changed" }; },
    edit: () => undefined,
    stderr: "error UPDATE_MISMATCH: stale-since-version: chain ch-1 has stale.since_version 2 where absent is due at /chains/0/stale/since_version\n" },
  { name: "rating-outside-set: a rating changed on a row that is not stale, with no history entry at the draft's version, is refused",
    edit: (d) => { chainOf(d, "ch-3").ratings.O = rating(4); },
    stderr: "error UPDATE_MISMATCH: rating-outside-set: chain ch-3 is not stale but its O moved from 3 to 4 with no history entry at version 2 at /chains/2/ratings/O/value\n" },
  { name: "one line per row per rule: a row with a wrong reason and a wrong since_version gets both lines, in rule order",
    edit: (d) => { chainOf(d, "ch-1").stale = { flag: true, reason: "function-changed", since_version: 1 }; },
    stderr: "error UPDATE_MISMATCH: stale-reason: chain ch-1 is reached by edge checkout to gw changed but its stale.reason is function-changed at /chains/0/stale/reason\n" +
      "error UPDATE_MISMATCH: stale-since-version: chain ch-1 has stale.since_version 1 where 2 is due at /chains/0/stale/since_version\n" },
];

for (const m of MISMATCHES) {
  test(`update-check.ts --check, ${m.name}`, () => {
    const r = checkEdited(m);
    assert.equal(r.status, 2, r.stdout);
    assert.equal(r.stderr, m.stderr);
  });
}

const ACCEPTED: (Edit & { name: string })[] = [
  { name: "a row flagged before, with element-changed in place of function-changed, keeps its own since_version",
    copy: (c) => { c.meta.version = 2; chainOf(c, "ch-1").stale = { flag: true, reason: "function-changed", since_version: 2 }; },
    edit: (d) => { chainOf(d, "ch-1").stale.since_version = 2; } },
  { name: "a reached row cleared in the same session is accepted by its clearing history entry",
    edit: (d) => { const c = chainOf(d, "ch-2"); c.stale = { flag: false }; c.history.push({ version: 2, date: "2026-10-08", change: "stale flag cleared; since_version 2" }); } },
  { name: "a rating changed outside the stale set is accepted with a history entry at the draft's version",
    edit: (d) => { const c = chainOf(d, "ch-3"); c.ratings.O = rating(4); c.history.push({ version: 2, date: "2026-10-08", change: "O re-scored" }); } },
];

for (const a of ACCEPTED) {
  test(`update-check.ts --check accepts ${a.name}`, () => {
    const r = checkEdited(a);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
  });
}

/** The copy one version on with ch-1 removed and ch-4 new on gw; ch-2 still links to ch-1 until an edit changes it. */
function withoutCh1(copy: FmeaDocument): FmeaDocument {
  const d = bumped(copy);
  d.chains = [...d.chains.filter((c) => c.id !== "ch-1"), { ...clone(chainOf(copy, "ch-1")), id: "ch-4" }];
  return d;
}

const LINKS: { name: string; edit: (cause: Cause) => void; status: number; stderr: string }[] = [
  { name: "accepts a link repointed to a chain new in this update",
    edit: (c) => { c.chain = "ch-4"; delete c.cited_o; }, status: 0, stderr: "" },
  { name: "accepts a dropped link", edit: (c) => { delete c.chain; delete c.cited_o; }, status: 0, stderr: "" },
  { name: "link-into-removed: refuses a link repointed to a chain that already existed",
    edit: (c) => { c.chain = "ch-3"; delete c.cited_o; }, status: 2,
    stderr: "error UPDATE_MISMATCH: link-into-removed: cause 0 of chain ch-2 links to ch-3, which is neither dropped nor a chain new in this update at /chains/0/causes/0/chain\n" },
  { name: "link-into-removed: refuses a link left on the removed chain", edit: () => undefined, status: 2,
    stderr: "error UPDATE_MISMATCH: link-into-removed: cause 0 of chain ch-2 links to ch-1, which is neither dropped nor a chain new in this update at /chains/0/causes/0/chain\n" },
];

for (const l of LINKS) {
  test(`update-check.ts --check ${l.name}`, () => {
    const copy = storedCopy();
    const draft = withoutCh1(copy);
    l.edit(chainOf(draft, "ch-2").causes[0]);
    const r = runCheck(copy, draft, "--check");
    assert.equal(r.status, l.status, r.stderr);
    assert.equal(r.stderr, l.stderr);
    assert.ok(r.stdout.includes("links into removed chains:\n  /chains/0/causes/0 into ch-1: repoint to ch-4, or drop\n"), r.stdout);
    assert.ok(r.stdout.includes(", 1 link into a removed chain, "), r.stdout);
  });
}

test("update-check.ts --check link-into-removed: names every cause of one chain left linked into a removed chain, in cause order", () => {
  const copy = storedCopy();
  const consumer = chainOf(copy, "ch-2");
  consumer.causes.push(clone(consumer.causes[0]));
  const draft = withoutCh1(copy);
  const r = runCheck(copy, draft, "--check");
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.stderr,
    "error UPDATE_MISMATCH: link-into-removed: cause 0 of chain ch-2 links to ch-1, which is neither dropped nor a chain new in this update at /chains/0/causes/0/chain\n" +
    "error UPDATE_MISMATCH: link-into-removed: cause 1 of chain ch-2 links to ch-1, which is neither dropped nor a chain new in this update at /chains/0/causes/1/chain\n");
  assert.ok(r.stdout.includes("  /chains/0/causes/1 into ch-1: repoint to ch-4, or drop\n"), r.stdout);
  assert.ok(r.stdout.includes(", 2 links into removed chains, "), r.stdout);
});

function v2(doc: FmeaDocument): FmeaDocument {
  const d = clone(doc);
  moveEdgesIntoBlocks(d);
  return d;
}
const v2Message = (): string => legacyIssues(v2(loadFixture<FmeaDocument>("checkout-service.fmea.json")))[0].message;

const BASELINES: { name: string; copy: () => FmeaDocument; draft: (c: FmeaDocument) => FmeaDocument; flags: string[]; stderr: () => string }[] = [
  { name: "update-baseline: a draft whose meta.id differs is refused at /meta/id", copy: storedCopy,
    draft: (c) => { const d = goodDraft(c); d.meta.id = "fmea-other"; return d; }, flags: ["--check"],
    stderr: () => "error UPDATE_BASELINE: update-baseline: the stored copy has meta.id fmea-min but the draft has fmea-other at /meta/id\n" },
  { name: "update-baseline: under --check the draft's version is exactly one above the copy's", copy: storedCopy,
    draft: (c) => { const d = goodDraft(c); d.meta.version = 1; return d; }, flags: ["--check"],
    stderr: () => "error UPDATE_BASELINE: update-baseline: the draft's meta.version 1 is not 2 as the stored copy's meta.version 1 requires at /meta/version\n" },
  { name: "update-baseline: on the first run a version two apart is refused", copy: storedCopy,
    draft: (c) => { const d = goodDraft(c); d.meta.version = 3; return d; }, flags: [],
    stderr: () => "error UPDATE_BASELINE: update-baseline: the draft's meta.version 3 is not 1 or 2 as the stored copy's meta.version 1 requires at /meta/version\n" },
  { name: "update-baseline: a v2 copy is refused before the schema runs, with the legacy message",
    copy: () => v2(loadFixture<FmeaDocument>("checkout-service.fmea.json")), draft: () => loadFixture<FmeaDocument>("checkout-service.fmea.json"), flags: [],
    stderr: () => `error UPDATE_BASELINE: update-baseline: the stored copy is not a v3 document: ${v2Message()} at /dependencies\n` },
  { name: "format-legacy: a v2 draft is refused with its own code, prefixed the draft",
    copy: () => loadFixture<FmeaDocument>("checkout-service.fmea.json"), draft: (c) => v2(c), flags: [],
    stderr: () => `error DEPENDENCY_LEGACY: format-legacy: the draft: ${v2Message()} at /dependencies\n` },
  { name: "schema: a copy that fails the schema is refused, naming the stored copy",
    copy: () => { const c = storedCopy(); delete (c.meta as Partial<FmeaDocument["meta"]>).scope; return c; }, draft: () => goodDraft(storedCopy()), flags: [],
    stderr: () => "error SCHEMA: schema: the stored copy: missing required property \"scope\" at /meta\n" },
  { name: "schema: a draft that fails the schema is refused, naming the draft", copy: storedCopy,
    draft: (c) => { const d = goodDraft(c); d.chains[0].ratings.S.value = 11; return d; }, flags: [],
    stderr: () => "error SCHEMA: schema: the draft: value 11 is above the maximum 10 at /chains/0/ratings/S/value\n" },
];

for (const b of BASELINES) {
  test(`update-check.ts: ${b.name}`, () => {
    const copy = b.copy();
    const r = runCheck(copy, b.draft(copy), ...b.flags);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, b.stderr());
  });
}

test("update-baseline: on the first run a draft at the copy's own version is accepted", () => {
  const copy = storedCopy();
  const draft = goodDraft(copy);
  draft.meta.version = 1;
  assert.equal(runCheck(copy, draft).status, 0);
});

test("update-check.ts refuses a wrong argument count or extension with USAGE, exit 1, and a missing copy with IO_READ, exit 3", () => {
  withTempDir((dir) => {
    const draft = writeJson(dir, "draft.json", storedCopy());
    assert.deepEqual(runCli("update-check.ts", [draft]), { status: 1, stdout: "", stderr: "error USAGE: expected 2 positional argument(s), got 1\n" });
    assert.deepEqual(runCli("update-check.ts", [`${dir}/copy.txt`, draft]), { status: 1, stdout: "", stderr: "error USAGE: the stored copy must end in .json\n" });
    const r = runCli("update-check.ts", [`${dir}/copy.json`, draft]);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /^error IO_READ: cannot read .*copy\.json: /);
  });
});

test("update-check.ts --check exits 0 on update/before.fmea.json against a draft with the gateway edge weak and expected-stale.json's flags", () => {
  const copy = loadFixture<FmeaDocument>("update", "before.fmea.json");
  const draft = bumped(copy);
  edgeOf(draft, "checkout", "checkout.payment-gateway").strength = "weak";
  const expected = loadFixture<{ stale: Record<string, StaleReason> }>("update", "expected-stale.json");
  for (const [id, reason] of Object.entries(expected.stale)) chainOf(draft, id).stale = { flag: true, reason, since_version: 2 };
  const r = runCheck(copy, draft, "--check");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout, "edges:\n  changed checkout to checkout.payment-gateway: strength\n" + NONE("elements") +
    "stale:\n  ch-1: edge checkout to checkout.payment-gateway changed\n" + NONE("unmarked") + NONE("links into removed chains") +
    NONE("outside elements with no consumer") + NONE("consumer causes whose linked chain changed") + "re-rating order:\n  ch-1, ch-2, ch-4\n" +
    "update-check: 1 edge change, 0 element changes, 1 stale row, 0 unmarked rows, 0 links into removed chains, 0 outside elements with no consumer, 0 changed providers\n");
});
