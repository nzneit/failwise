import { test } from "node:test";
import assert from "node:assert/strict";
import { actionRefs, buildItem, itemKey, splitKey, textHash } from "./lib/tracker/items.ts";
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

test("the facts are seven, in the order of §7, with the causes joined by '; '", () => {
  const doc = docWith("do it");
  doc.chains[0].causes.push({ text: "disk full" });
  const { facts } = itemOf(doc).content;
  assert.deepEqual(facts, [
    { label: "Failure mode", value: "stops serving" },
    { label: "End effect", value: "users cannot check out" },
    { label: "Causes", value: "process crash; disk full" },
    { label: "Row priority", value: "M (S 8, O 3, D 4)" },
    { label: "Owner", value: "A. Owner" },
    { label: "Target date", value: "2026-11-01" },
    { label: "Status when created", value: "Open" },
  ]);
  assert.equal(itemOf(doc).content.action, "do it");
});

test("the priority fact says it rests on provisional ratings when any of the three is provisional", () => {
  const doc = docWith("do it");
  doc.chains[0].ratings.O = rating(3, "provisional");
  const value = itemOf(doc).content.facts[3].value;
  assert.equal(value, "M (S 8, O 3, D 4), resting on provisional ratings");
});

test("the origin carries the analysis name, the ids, and <record_url>#row-<chain id> only when record_url is set", () => {
  const doc = docWith("do it");
  assert.deepEqual(itemOf(doc).content.origin, { analysis: "Minimal", chain: "ch-1", action: "act-1" });
  const withUrl = itemOf(doc, { ...config, record_url: "https://example.org/report.html" }).content.origin;
  assert.deepEqual(withUrl, { analysis: "Minimal", chain: "ch-1", action: "act-1", url: "https://example.org/report.html#row-ch-1" });
});

test("the item carries the key, the text hash, the label and the target date", () => {
  const item = itemOf(docWith("Add a  retry budget"));
  assert.equal(item.key, "fmea-min/ch-1/act-1");
  assert.equal(item.text, textHash("Add a retry budget"));
  assert.equal(item.label, "failwise");
  assert.equal(item.due, "2026-11-01");
});
