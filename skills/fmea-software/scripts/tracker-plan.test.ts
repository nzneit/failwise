import { test } from "node:test";
import assert from "node:assert/strict";
import { computePlan } from "./lib/tracker/plan.ts";
import { textHash } from "./lib/tracker/items.ts";
import { clone, minimalDoc } from "./test-helpers.ts";
import type { RemoteItem, Target } from "./lib/tracker/provider.ts";
import type { Action, ActionStatus, FmeaDocument, TrackerLink } from "./lib/types.ts";

const target: Target = { provider: "github", host: "github.com", project: "o/r", label: "failwise", visibility: "private", write_gap_ms: 1000 };

const KEY1 = "fmea-min/ch-1/act-1";
const KEY2 = "fmea-min/ch-1/act-2";

function act(id: string, status: ActionStatus = "Open", description = `do ${id}`): Action {
  return { id, description, owner: "A. Owner", status, target_date: "2026-11-01" };
}

/** minimalDoc with a tracker configuration and these actions on its only row. */
function docWith(...actions: Action[]): FmeaDocument {
  const doc = minimalDoc();
  doc.meta.tracker = { provider: "github", project: "o/r", label: "failwise" };
  doc.chains[0].actions = actions;
  return doc;
}

const url = (n: number) => `https://github.com/o/r/issues/${n}`;

/** Item number n of the listing, marked with the key and text hash given, or unmarked when key is null. */
function remote(n: number, key: string | null, text = "000000000000"): RemoteItem {
  return {
    link: { provider: "github", id: `I_${n}`, key: `o/r#${n}`, url: url(n) },
    marker: key === null ? null : { key, text },
  };
}

function linkTo(n: number): TrackerLink {
  return { provider: "github", id: `I_${n}`, key: `o/r#${n}`, url: url(n), linked: "2026-10-01" };
}

function linked(a: Action, n: number): Action {
  return { ...a, tracker: linkTo(n) };
}

test("an action with a link is linked, and its item in the listing is claimed, not offered again", () => {
  const plan = computePlan(docWith(linked(act("act-1"), 1)), target, [remote(1, KEY1)]);
  assert.equal(plan.actions.length, 1);
  const [a] = plan.actions;
  assert.equal(a.outcome, "linked");
  assert.deepEqual(a.link, { provider: "github", id: "I_1", key: "o/r#1", url: url(1) });
  assert.equal(a.item, undefined);
  assert.deepEqual(plan.findings, []);
});

test("an open action with no link and no item of ours is create, and carries its content", () => {
  const doc = docWith(act("act-1", "Open", "Add a retry budget"));
  const plan = computePlan(doc, target, []);
  const [a] = plan.actions;
  assert.equal(a.key, KEY1);
  assert.equal(a.pointer, "/chains/0/actions/0");
  assert.equal(a.outcome, "create");
  assert.equal(a.handoff, false);
  assert.equal(a.link, undefined);
  assert.equal(a.item?.title, "Add a retry budget");
  assert.equal(a.item?.action, "Add a retry budget");
  assert.equal(a.item?.facts.length, 7);
  assert.deepEqual(a.item?.origin, { analysis: "Minimal", chain: "ch-1", action: "act-1" });
  const full = plan.items.get(KEY1);
  assert.equal(full?.key, KEY1);
  assert.equal(full?.text, textHash("Add a retry budget"));
  assert.deepEqual(full?.content, a.item);
});

test("each of the three open statuses is create; Completed and Not Implemented are skip", () => {
  const statuses: ActionStatus[] = ["Open", "Decision pending", "Implementation pending", "Completed", "Not Implemented"];
  const doc = docWith(...statuses.map((s, i) => act(`act-${i + 1}`, s)));
  const plan = computePlan(doc, target, []);
  assert.deepEqual(plan.actions.map((a) => a.outcome), ["create", "create", "create", "skip", "skip"]);
  assert.deepEqual([...plan.items.keys()], [KEY1, KEY2, "fmea-min/ch-1/act-3"]);
  assert.equal(plan.actions[3].item, undefined);
});

test("an action with no link and one item of ours is adopt, whatever its status", () => {
  const statuses: ActionStatus[] = ["Open", "Completed", "Not Implemented"];
  const doc = docWith(...statuses.map((s, i) => act(`act-${i + 1}`, s)));
  const listing = statuses.map((_, i) => remote(i + 1, `fmea-min/ch-1/act-${i + 1}`, textHash(`do act-${i + 1}`)));
  const plan = computePlan(doc, target, listing);
  assert.deepEqual(plan.actions.map((a) => a.outcome), ["adopt", "adopt", "adopt"]);
  assert.deepEqual(plan.actions[1].link, listing[1].link);
  assert.equal(plan.actions[1].text_changed, false);
  assert.equal(plan.actions[0].item, undefined);
  assert.equal(plan.items.size, 0);
  assert.deepEqual(plan.findings, []);
});

test("adopt says text_changed when the marker's hash is not the action's", () => {
  const doc = docWith(act("act-1", "Open", "the new words"));
  const plan = computePlan(doc, target, [remote(1, KEY1, textHash("the old words"))]);
  assert.equal(plan.actions[0].outcome, "adopt");
  assert.equal(plan.actions[0].text_changed, true);
});

test("two items of ours with one key block the action and give one duplicate finding with both urls", () => {
  const plan = computePlan(docWith(act("act-1")), target, [remote(1, KEY1), remote(2, KEY1)]);
  assert.equal(plan.actions[0].outcome, "blocked");
  assert.equal(plan.actions[0].link, undefined);
  assert.deepEqual(plan.findings, [{ kind: "duplicate", key: KEY1, urls: [url(1), url(2)] }]);
});

test("a duplicate whose key has no unlinked action is reported once, as duplicate, not also as orphan", () => {
  const plan = computePlan(docWith(act("act-1")), target, [remote(1, KEY2), remote(2, KEY2), remote(3, KEY2)]);
  assert.equal(plan.actions[0].outcome, "create");
  assert.deepEqual(plan.findings, [{ kind: "duplicate", key: KEY2, urls: [url(1), url(2), url(3)] }]);
});

test("an item of ours whose key has no unlinked action is an orphan", () => {
  const doc = docWith(linked(act("act-1"), 1));
  const plan = computePlan(doc, target, [remote(1, KEY1), remote(2, KEY1), remote(3, "fmea-min/ch-9/act-1")]);
  assert.equal(plan.actions[0].outcome, "linked");
  assert.deepEqual(plan.findings, [
    { kind: "orphan", key: KEY1, urls: [url(2)] },
    { kind: "orphan", key: "fmea-min/ch-9/act-1", urls: [url(3)] },
  ]);
});

test("an item marked for another analysis is counted in other_analyses and gives no finding", () => {
  const plan = computePlan(docWith(act("act-1")), target, [remote(1, "other-fmea/ch-1/act-1"), remote(2, "other-fmea/ch-1/act-1")]);
  assert.equal(plan.actions[0].outcome, "create");
  assert.equal(plan.counts.other_analyses, 2);
  assert.deepEqual(plan.findings, []);
});

test("an unclaimed item with no readable marker is unmarked", () => {
  const plan = computePlan(docWith(act("act-1")), target, [remote(1, null), remote(2, "not a key")]);
  assert.equal(plan.actions[0].outcome, "create");
  assert.deepEqual(plan.findings, [
    { kind: "unmarked", urls: [url(1)] },
    { kind: "unmarked", urls: [url(2)] },
  ]);
  assert.equal(plan.counts.other_analyses, 0);
});

test("a claimed item whose marker key differs, or is unreadable, is link-mismatch", () => {
  const doc = docWith(linked(act("act-1"), 1), linked(act("act-2"), 2), linked(act("act-3"), 3));
  const listing = [remote(1, "copied-fmea/ch-1/act-1"), remote(2, null), remote(3, "fmea-min/ch-1/act-3")];
  const plan = computePlan(doc, target, listing);
  assert.deepEqual(plan.actions.map((a) => a.outcome), ["linked", "linked", "linked"]);
  assert.deepEqual(plan.findings, [
    { kind: "link-mismatch", key: KEY1, urls: [url(1)] },
    { kind: "link-mismatch", key: KEY2, urls: [url(2)] },
  ]);
});

test("two actions that link to one item give link-shared", () => {
  const doc = docWith(linked(act("act-1"), 1), linked(act("act-2"), 1));
  const plan = computePlan(doc, target, []);
  assert.deepEqual(plan.actions.map((a) => a.outcome), ["linked", "linked"]);
  assert.deepEqual(plan.findings, [{ kind: "link-shared", urls: [url(1)] }]);
});

test("counts hold the number of actions per outcome", () => {
  const doc = docWith(
    linked(act("act-1"), 1),
    act("act-2"),
    act("act-3", "Decision pending"),
    act("act-4", "Completed"),
    act("act-5"),
    act("act-6"),
  );
  const listing = [remote(1, KEY1), remote(5, "fmea-min/ch-1/act-5"), remote(6, "fmea-min/ch-1/act-6"), remote(7, "fmea-min/ch-1/act-6"), remote(8, "x/y/z")];
  const plan = computePlan(doc, target, listing);
  assert.deepEqual(plan.counts, { linked: 1, create: 2, adopt: 1, skip: 1, blocked: 1, other_analyses: 1 });
});

/** A document with a linked action, two creates and an adoption, with a finding in its listing. */
function digestCase(): { doc: FmeaDocument; listing: RemoteItem[] } {
  const doc = docWith(linked(act("act-1"), 1), act("act-2"), act("act-3"), act("act-4"));
  const listing = [remote(1, KEY1), remote(4, "fmea-min/ch-1/act-4"), remote(9, null)];
  return { doc, listing };
}

test("the digest is 64 hex characters and is stable for the same inputs", () => {
  const { doc, listing } = digestCase();
  const plan = computePlan(doc, target, listing);
  assert.match(plan.digest, /^[0-9a-f]{64}$/);
  assert.equal(computePlan(clone(doc), { ...target }, clone(listing)).digest, plan.digest);
});

test("the digest changes with the label, the visibility, a create's text, a create added and an adoption's item id", () => {
  const { doc, listing } = digestCase();
  const base = computePlan(doc, target, listing).digest;

  assert.notEqual(computePlan(doc, { ...target, label: "other" }, listing).digest, base);
  assert.notEqual(computePlan(doc, { ...target, visibility: "public" }, listing).digest, base);

  const reworded = clone(doc);
  reworded.chains[0].actions[1].description = "do act-2 differently";
  assert.notEqual(computePlan(reworded, target, listing).digest, base);

  const added = clone(doc);
  added.chains[0].actions.push(act("act-5"));
  assert.notEqual(computePlan(added, target, listing).digest, base);

  const moved = clone(listing);
  moved[1].link.id = "I_40";
  assert.notEqual(computePlan(doc, target, moved).digest, base);
});

test("the digest does not change when a linked action or a finding changes", () => {
  const { doc, listing } = digestCase();
  const base = computePlan(doc, target, listing).digest;

  const relinked = clone(doc);
  relinked.chains[0].actions[0].description = "reworded, but already linked";
  relinked.chains[0].actions[0].tracker = linkTo(11);
  assert.equal(computePlan(relinked, target, listing).digest, base);

  const moreFindings = [...clone(listing), remote(10, null), remote(12, "fmea-min/ch-9/act-9")];
  const plan = computePlan(doc, target, moreFindings);
  assert.equal(plan.findings.length, 3);
  assert.equal(plan.digest, base);
});
