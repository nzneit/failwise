import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { actionRefs, buildItem, DONE_CLOSE, DONE_DECISION, DONE_OTHER, itemKey, splitKey, textHash } from "./lib/tracker/items.ts";
import type { Block, Section, TrackedItem } from "./lib/tracker/provider.ts";
import { clone, minimalDoc, rating } from "./test-helpers.ts";
import type { Action, FmeaDocument, TrackerConfig } from "./lib/types.ts";

const config: TrackerConfig = { provider: "github", project: "o/r", label: "failwise" };

function action(id: string, description: string): Action {
  return { id, description, owner: "A. Owner", status: "Open", target_date: "2026-11-01" };
}

/** minimalDoc with one action on its only row. */
function docWith(description: string): FmeaDocument {
  const doc = minimalDoc();
  doc.chains[0].actions = [action("act-1", description)];
  return doc;
}

const itemOf = (doc: FmeaDocument, cfg: TrackerConfig = config) => buildItem(doc, cfg, actionRefs(doc)[0]);

test("itemKey joins three ids with a slash and splitKey takes them apart", () => {
  assert.equal(itemKey("fmea-min", "ch-1", "act-1"), "fmea-min/ch-1/act-1");
  assert.deepEqual(splitKey("fmea-min/ch-1/act-1"), ["fmea-min", "ch-1", "act-1"]);
  assert.equal(splitKey("fmea-min/ch-1"), null);
  assert.equal(splitKey("a/b c/d"), null);
  assert.deepEqual(splitKey("team:checkout/ch.1_a/act:1-b"), ["team:checkout", "ch.1_a", "act:1-b"]);
  assert.equal(splitKey("a/b/c/d"), null);
  assert.equal(splitKey("a//c"), null);
});

test("textHash is 12 hex characters and ignores how whitespace is laid out", () => {
  assert.match(textHash("Add a  retry\nbudget"), /^[0-9a-f]{12}$/);
  assert.equal(textHash("Add a  retry\nbudget"), textHash("Add a retry budget"));
  assert.notEqual(textHash("Add a retry budget"), textHash("Add a retry budget."));
});

test("actionRefs gives every action its key, its pointer and its row's handoff flag, in document order", () => {
  const doc = docWith("first");
  doc.chains[0].actions.push(action("act-2", "second"));
  const second = clone(doc.chains[0]);
  second.id = "ch-2";
  second.actions = [action("act-1", "third")];
  second.handoff = { to: "threat-model", reason: "adversary", adversary_cause: "x" };
  doc.chains.push(second);
  const refs = actionRefs(doc);
  assert.deepEqual(refs.map((r) => r.key), ["fmea-min/ch-1/act-1", "fmea-min/ch-1/act-2", "fmea-min/ch-2/act-1"]);
  assert.deepEqual(refs.map((r) => r.pointer), ["/chains/0/actions/0", "/chains/0/actions/1", "/chains/1/actions/0"]);
  assert.deepEqual(refs.map((r) => r.handoff), [false, false, true]);
  assert.equal(refs[2].action.description, "third");
});

test("the title is the description with whitespace collapsed when it is 100 code points or fewer", () => {
  assert.equal(itemOf(docWith("  Add a  retry\n budget ")).content.title, "Add a retry budget");
  const exact = "x".repeat(100);
  assert.equal(itemOf(docWith(exact)).content.title, exact);
});

test("a longer title is cut at the last space before the 100th code point and ends in an ellipsis", () => {
  const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
  const title = itemOf(docWith(words)).content.title;
  assert.ok(title.endsWith("…"));
  const body = title.slice(0, -1);
  assert.ok(Array.from(body).length < 100);
  assert.ok(words.startsWith(body));
  assert.equal(words[body.length], " ");
  assert.ok(!body.endsWith(" "));
});

test("a description with no space in its first 100 code points is cut at 100", () => {
  const long = "\u{1F600}".repeat(120);
  const title = itemOf(docWith(long)).content.title;
  assert.equal(title, "\u{1F600}".repeat(100) + "…");
});

test("a description that is only whitespace gives the title <chain id>/<action id>", () => {
  assert.equal(itemOf(docWith(" \n\t ")).content.title, "ch-1/act-1");
});

test("the origin carries the analysis name, the ids, and <record_url>#row-<chain id> only when record_url is set", () => {
  const doc = docWith("do it");
  assert.deepEqual(itemOf(doc).content.origin, { analysis: "Minimal", version: 1, chain: "ch-1", action: "act-1" });
  const withUrl = itemOf(doc, { ...config, record_url: "https://example.org/report.html" }).content.origin;
  assert.deepEqual(withUrl, { analysis: "Minimal", version: 1, chain: "ch-1", action: "act-1", url: "https://example.org/report.html#row-ch-1" });
});

test("the item carries the key, the text hash, the label and the target date", () => {
  const item = itemOf(docWith("Add a  retry budget"));
  assert.equal(item.key, "fmea-min/ch-1/act-1");
  assert.equal(item.text, textHash("Add a retry budget"));
  assert.equal(item.label, "failwise");
  assert.equal(item.due, "2026-11-01");
});

test("origin.version is the analysis's meta.version", () => {
  const doc = docWith("do it");
  doc.meta.version = 7;
  assert.equal(itemOf(doc).content.origin.version, 7);
});

const FIXTURE = join(import.meta.dirname, "..", "evals", "fixtures", "checkout-service.fmea.json");
const fixture = (): FmeaDocument => JSON.parse(readFileSync(FIXTURE, "utf8")) as FmeaDocument;

/** The item of the action `actionId` on the chain `chainId` of `doc`. */
function itemAt(doc: FmeaDocument, chainId: string, actionId: string): TrackedItem {
  const ref = actionRefs(doc).find((r) => r.chain.id === chainId && r.action.id === actionId);
  assert.ok(ref, `${chainId}/${actionId}`);
  return buildItem(doc, config, ref);
}

const fixtureItem = (doc: FmeaDocument = fixture()): TrackedItem => itemAt(doc, "ch-2", "act-1");

function sectionOf(item: TrackedItem, heading: string): Section {
  const found = item.content.sections.find((s) => s.heading === heading);
  assert.ok(found, heading);
  return found;
}

/** The fact or list block labelled `label` in the section, or undefined. */
function blockOf(item: TrackedItem, heading: string, label: string): Block | undefined {
  return sectionOf(item, heading).blocks.find((b) => b.kind !== "text" && b.label === label);
}

function factOf(item: TrackedItem, heading: string, label: string): string | undefined {
  const b = blockOf(item, heading, label);
  return b?.kind === "fact" ? b.value : undefined;
}

function listOf(item: TrackedItem, heading: string, label: string): string[] | undefined {
  const b = blockOf(item, heading, label);
  return b?.kind === "list" ? b.items : undefined;
}

const labelsOf = (item: TrackedItem, heading: string): string[] =>
  sectionOf(item, heading).blocks.map((b) => (b.kind === "text" ? `text:${b.text}` : b.label));

// The item has six sections: the five the builder holds, in this order, and the reference each
// renderer writes from the origin.
const HEADINGS = ["Where", "The failure", "Priority", "This action", "Done when"];

test("the builder's sections are the five before the reference, in order, with the exact headings", () => {
  assert.deepEqual(fixtureItem().content.sections.map((s) => s.heading), HEADINGS);
  assert.deepEqual(itemOf(docWith("do it")).content.sections.map((s) => s.heading), HEADINGS);
});

test("Where on the fixture: the element with kind and boundary, the function, two conditions and for whom", () => {
  const item = fixtureItem();
  assert.deepEqual(labelsOf(item, "Where"), ["Element", "Function", "Conditions", "For whom"]);
  assert.equal(factOf(item, "Where", "Element"), "Checkout service (service, in scope)");
  assert.equal(factOf(item, "Where", "Function"), "Turn a submitted cart into a confirmed order exactly once");
  assert.deepEqual(listOf(item, "Where", "Conditions"), ["under promotion traffic", "while a dependency is degraded"]);
  assert.equal(factOf(item, "Where", "For whom"), "signed-in shoppers");
});

test("Where appends security-relevant when the flag is set, prints enum ids with spaces, and leaves out empty conditions", () => {
  const doc = docWith("do it");
  doc.elements[0] = { ...doc.elements[0], kind: "event_stream", boundary: "third_party", security_relevant: true };
  const item = itemOf(doc);
  assert.equal(factOf(item, "Where", "Element"), "Service (event stream, third party, security-relevant)");
  assert.deepEqual(labelsOf(item, "Where"), ["Element", "Function", "For whom"]);
  doc.elements[0].boundary = "owned_outside";
  assert.equal(factOf(itemOf(doc), "Where", "Element"), "Service (event stream, owned outside, security-relevant)");
});

test("Where prints the id when the function or the element is missing, leaves out the dependent blocks, and has no element id to print without the function", () => {
  const noElement = docWith("do it");
  noElement.functions[0].element = "gone";
  noElement.functions[0].conditions = ["c"];
  const a = itemOf(noElement);
  assert.deepEqual(labelsOf(a, "Where"), ["Element", "Function", "Conditions", "For whom"]);
  assert.equal(factOf(a, "Where", "Element"), "gone");
  const noFunction = docWith("do it");
  noFunction.chains[0].function = "fn-gone";
  const b = itemOf(noFunction);
  assert.deepEqual(labelsOf(b, "Where"), ["Function"]);
  assert.equal(factOf(b, "Where", "Function"), "fn-gone");
});

test("The failure on the fixture: mode, trigger, three effects, causes with origins and two controls", () => {
  const item = fixtureItem();
  const chain = fixture().chains.find((c) => c.id === "ch-2");
  assert.ok(chain);
  assert.deepEqual(labelsOf(item, "The failure"), ["Failure mode", "Trigger", "Local effect", "Next-level effect", "End effect", "Causes", "Controls"]);
  assert.equal(factOf(item, "The failure", "Failure mode"), chain.failure_mode);
  assert.equal(factOf(item, "The failure", "Trigger"), chain.trigger);
  assert.equal(factOf(item, "The failure", "Local effect"), chain.effects.local);
  assert.equal(factOf(item, "The failure", "Next-level effect"), chain.effects.next_level);
  assert.equal(factOf(item, "The failure", "End effect"), chain.effects.end);
  assert.deepEqual(listOf(item, "The failure", "Causes"), [`${chain.causes[0].text} (origin: design)`, `${chain.causes[1].text} (origin: code)`]);
  assert.deepEqual(listOf(item, "The failure", "Controls"), [
    "prevention, existing: Idempotency keys on submissions, deduplicating a retried cart (evidence: test result, idempotency contract suite)",
    "compensating, existing: Fallback to the last quoted price held in the cart when pricing does not answer (evidence: test result, pricing-fallback integration suite)",
  ]);
});

test("The failure: no trigger, the four cause suffixes, the three control evidence forms and the no-control text", () => {
  const doc = docWith("do it");
  doc.chains[0].causes = [
    { text: "a", origin: "specification", adversarial: true },
    { text: "b", adversarial: true },
    { text: "c" },
    { text: "d", origin: "code", adversarial: false },
  ];
  const bare = itemOf(doc);
  assert.deepEqual(labelsOf(bare, "The failure"), ["Failure mode", "Local effect", "Next-level effect", "End effect", "Causes", "text:The chain records no control."]);
  assert.deepEqual(listOf(bare, "The failure", "Causes"), ["a (origin: specification, adversarial)", "b (adversarial)", "c", "d (origin: code)"]);
  doc.chains[0].controls = [
    { kind: "detection", description: "alert", status: "planned", evidence: { kind: "observed_incident", ref: "INC-1" } },
    { kind: "prevention", description: "guard", status: "existing", evidence: { kind: "estimate" } },
    { kind: "compensating", description: "fallback", status: "existing", evidence: { kind: "none" } },
  ];
  const controlled = itemOf(doc);
  assert.deepEqual(listOf(controlled, "The failure", "Controls"), [
    "detection, planned: alert (evidence: observed incident, INC-1)",
    "prevention, existing: guard (evidence: estimate)",
    "compensating, existing: fallback (no evidence)",
  ]);
  assert.ok(!labelsOf(controlled, "The failure").includes("text:The chain records no control."));
});

test("Priority: the chain priority, the table and the three ratings with rationale, evidence and review", () => {
  const item = fixtureItem();
  const chain = fixture().chains.find((c) => c.id === "ch-2");
  assert.ok(chain);
  assert.deepEqual(labelsOf(item, "Priority"), ["Chain priority", "Table", "S 10", "O 8", "D 4"]);
  assert.equal(factOf(item, "Priority", "Chain priority"), "H (S 10, O 8, D 4), resting on provisional ratings");
  assert.equal(factOf(item, "Priority", "Table"), "priority-fmea-software-v1");
  assert.equal(factOf(item, "Priority", "S 10"), `${chain.ratings.S.rationale} (evidence: estimate; provisional)`);
  assert.equal(factOf(item, "Priority", "O 8"), `${chain.ratings.O.rationale} (evidence: estimate; provisional)`);
  assert.equal(factOf(item, "Priority", "D 4"), `${chain.ratings.D.rationale} (evidence: estimate; provisional)`);
});

test("the chain priority says it rests on provisional ratings when any of the three is provisional, and not otherwise", () => {
  const doc = docWith("do it");
  assert.equal(factOf(itemOf(doc), "Priority", "Chain priority"), "M (S 8, O 3, D 4)");
  doc.chains[0].ratings.O = rating(3, "provisional");
  assert.equal(factOf(itemOf(doc), "Priority", "Chain priority"), "M (S 8, O 3, D 4), resting on provisional ratings");
});

test("Priority: the re-scored by X on D, the bare re-scored, and the authored forms, with an evidence ref", () => {
  const doc = docWith("do it");
  doc.chains[0].ratings.S = { value: 8, rationale: "r", evidence_kind: "test_result", evidence_ref: "suite-1", review: { status: "rescored", by: "A", date: "2026-09-03" } };
  doc.chains[0].ratings.O = { value: 3, rationale: "r", evidence_kind: "observed_incident", review: { status: "rescored" } };
  doc.chains[0].ratings.D = { value: 4, rationale: "r", evidence_kind: "estimate", review: { status: "authored", by: "B" } };
  const item = itemOf(doc);
  assert.equal(factOf(item, "Priority", "S 8"), "r (evidence: test result, suite-1; re-scored by A on 2026-09-03)");
  assert.equal(factOf(item, "Priority", "O 3"), "r (evidence: observed incident; re-scored)");
  assert.equal(factOf(item, "Priority", "D 4"), "r (evidence: estimate; authored by B)");
  doc.chains[0].ratings.D.review = { status: "authored", date: "2026-09-04" };
  assert.equal(factOf(itemOf(doc), "Priority", "D 4"), "r (evidence: estimate; authored on 2026-09-04)");
});

test("This action: owner, target date and status, with no optional block on a bare chain", () => {
  const item = itemOf(docWith("do it"));
  assert.deepEqual(labelsOf(item, "This action"), ["Owner", "Target date", "Status when created"]);
  assert.equal(factOf(item, "This action", "Owner"), "A. Owner");
  assert.equal(factOf(item, "This action", "Target date"), "2026-11-01");
  assert.equal(factOf(item, "This action", "Status when created"), "Open");
});

test("This action: the other actions on the chain, in document order, only when there is another", () => {
  const doc = docWith("first");
  doc.chains[0].actions.push({ ...action("act-2", "second"), status: "Decision pending" }, { ...action("act-3", "third"), status: "Completed" });
  const second = buildItem(doc, config, actionRefs(doc)[1]);
  assert.deepEqual(listOf(second, "This action", "Other actions on this chain"), ["act-1: Open", "act-3: Completed"]);
  assert.equal(listOf(itemOf(docWith("alone")), "This action", "Other actions on this chain"), undefined);
});

test("This action: the handoff, the stale flag in its three forms, and the source incident", () => {
  const doc = docWith("do it");
  const chain = doc.chains[0];
  chain.handoff = { to: "threat-model", reason: "an adversary can drive it", adversary_cause: "x" };
  chain.stale = { flag: true, reason: "element-changed", since_version: 3 };
  chain.source_incident = "INC-chain";
  chain.actions[0].source_incident = "INC-action";
  const full = itemOf(doc);
  assert.deepEqual(labelsOf(full, "This action"), ["Owner", "Target date", "Status when created", "Threat-model handoff", "Stale", "Source incident"]);
  assert.equal(factOf(full, "This action", "Threat-model handoff"), "an adversary can drive it");
  assert.equal(factOf(full, "This action", "Stale"), "element-changed since version 3");
  assert.equal(factOf(full, "This action", "Source incident"), "INC-action");
  chain.stale = { flag: true };
  delete chain.actions[0].source_incident;
  assert.equal(factOf(itemOf(doc), "This action", "Stale"), "flagged");
  assert.equal(factOf(itemOf(doc), "This action", "Source incident"), "INC-chain");
  chain.stale = { flag: true, reason: "control-removed" };
  assert.equal(factOf(itemOf(doc), "This action", "Stale"), "control-removed");
  chain.stale = { flag: false, reason: "control-removed" };
  delete chain.source_incident;
  delete chain.handoff;
  assert.deepEqual(labelsOf(itemOf(doc), "This action"), ["Owner", "Target date", "Status when created"]);
});

test("Done when: the decision passage on a Decision pending action, the other passage on an Open one, the close passage second", () => {
  assert.deepEqual(sectionOf(fixtureItem(), "Done when").blocks, [{ kind: "text", text: DONE_DECISION }, { kind: "text", text: DONE_CLOSE }]);
  assert.deepEqual(sectionOf(itemOf(docWith("do it")), "Done when").blocks, [{ kind: "text", text: DONE_OTHER }, { kind: "text", text: DONE_CLOSE }]);
  assert.equal(DONE_DECISION, "This action is a decision. It is done when the decision is recorded where the action says. Then close this item.");
  assert.equal(DONE_OTHER, "Carry out the action above, then close this item.");
  assert.equal(DONE_CLOSE, "A close as done proposes Completed in the analysis. A close as not done proposes Not Implemented. A person confirms each proposal. After a Completed, the chain can be rated again.");
});

test("every text block is a done passage or the no-control sentence, so analysis text never enters a text block", () => {
  const allowed = new Set([DONE_DECISION, DONE_OTHER, DONE_CLOSE, "The chain records no control."]);
  const doc = fixture();
  const items = [...actionRefs(doc).map((ref) => buildItem(doc, config, ref)), itemOf(docWith("do it"))];
  let seen = 0;
  for (const item of items) for (const section of item.content.sections) for (const block of section.blocks) {
    if (block.kind !== "text") continue;
    seen += 1;
    assert.ok(allowed.has(block.text), block.text);
  }
  assert.ok(seen >= items.length * 2);
});
