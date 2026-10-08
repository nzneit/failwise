// The plan: an outcome for each action, the findings about the marked items, and the digest that
// binds what `apply` carries out to what a person saw (§6.1, §6.2). Pure: no tracker, no network.

import { createHash } from "node:crypto";
import type { ActionStatus, FmeaDocument, TrackerConfig, TrackerLink } from "../types.ts";
import { actionRefs, buildItem, splitKey, textHash } from "./items.ts";
import type { ActionRef } from "./items.ts";
import type { ItemContent, Link, RemoteItem, Target, TrackedItem } from "./provider.ts";

export type Outcome = "linked" | "create" | "adopt" | "skip" | "blocked";
export type FindingKind = "duplicate" | "orphan" | "unmarked" | "link-mismatch" | "link-shared";
export interface PlannedAction { key: string; pointer: string; outcome: Outcome; handoff: boolean; link?: Link; text_changed?: boolean; item?: ItemContent }
export interface PlanFinding { kind: FindingKind; key?: string; urls: string[] }
export interface PlanCounts { linked: number; create: number; adopt: number; skip: number; blocked: number; other_analyses: number }
export interface Plan { actions: PlannedAction[]; findings: PlanFinding[]; counts: PlanCounts; digest: string; items: Map<string, TrackedItem> }

const OPEN: ReadonlySet<ActionStatus> = new Set<ActionStatus>(["Open", "Decision pending", "Implementation pending"]);

/** The listing sorted into the four groups of §6.1 step 2. `ours` maps a marker key to its items. */
interface Groups { claimed: Map<string, RemoteItem>; ours: Map<string, RemoteItem[]>; other: number; unmarked: RemoteItem[] }

function toLink(t: TrackerLink): Link {
  return { provider: t.provider, id: t.id, key: t.key, url: t.url };
}

/** The item's marker key when it is three plain ids, else null: the marker is not readable. */
function readableKey(item: RemoteItem): string | null {
  const key = item.marker?.key;
  return key !== undefined && splitKey(key) !== null ? key : null;
}

function groupListing(metaId: string, refs: ActionRef[], marked: RemoteItem[]): Groups {
  const linkedIds = new Set(refs.flatMap((r) => (r.action.tracker ? [r.action.tracker.id] : [])));
  const groups: Groups = { claimed: new Map(), ours: new Map(), other: 0, unmarked: [] };
  for (const item of marked) {
    const key = readableKey(item);
    if (linkedIds.has(item.link.id)) groups.claimed.set(item.link.id, item);
    else if (key === null) groups.unmarked.push(item);
    else if (key.split("/")[0] !== metaId) groups.other += 1;
    else groups.ours.set(key, [...(groups.ours.get(key) ?? []), item]);
  }
  return groups;
}

function planAction(doc: FmeaDocument, config: TrackerConfig, ref: ActionRef, ours: Map<string, RemoteItem[]>): { planned: PlannedAction; item?: TrackedItem } {
  const base = { key: ref.key, pointer: ref.pointer, handoff: ref.handoff };
  if (ref.action.tracker) return { planned: { ...base, outcome: "linked", link: toLink(ref.action.tracker) } };
  const found = ours.get(ref.key) ?? [];
  if (found.length > 1) return { planned: { ...base, outcome: "blocked" } };
  if (found.length === 1) {
    const text_changed = found[0].marker?.text !== textHash(ref.action.description);
    return { planned: { ...base, outcome: "adopt", link: found[0].link, text_changed } };
  }
  if (!OPEN.has(ref.action.status)) return { planned: { ...base, outcome: "skip" } };
  const item = buildItem(doc, config, ref);
  return { planned: { ...base, outcome: "create", item: item.content }, item };
}

/** Duplicates and orphans among the items of ours: a key held by two or more items is one duplicate. */
function oursFindings(ours: Map<string, RemoteItem[]>, unlinkedKeys: Set<string>): PlanFinding[] {
  const findings: PlanFinding[] = [];
  for (const [key, items] of ours) {
    const urls = items.map((i) => i.link.url);
    if (items.length > 1) findings.push({ kind: "duplicate", key, urls });
    else if (!unlinkedKeys.has(key)) findings.push({ kind: "orphan", key, urls });
  }
  return findings;
}

/** A claimed item whose marker key is not the key of an action that links to it. */
function mismatchFindings(refs: ActionRef[], claimed: Map<string, RemoteItem>): PlanFinding[] {
  const findings: PlanFinding[] = [];
  for (const ref of refs) {
    const item = ref.action.tracker ? claimed.get(ref.action.tracker.id) : undefined;
    if (item && readableKey(item) !== ref.key) findings.push({ kind: "link-mismatch", key: ref.key, urls: [item.link.url] });
  }
  return findings;
}

/** One finding per tracker id that two or more actions link to. */
function sharedFindings(refs: ActionRef[]): PlanFinding[] {
  const byId = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  for (const { action } of refs) {
    if (!action.tracker) continue;
    const { id, url } = action.tracker;
    byId.set(id, (byId.get(id) ?? new Set()).add(url));
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...byId].filter(([id]) => (counts.get(id) ?? 0) > 1).map(([, urls]) => ({ kind: "link-shared", urls: [...urls] }));
}

function countOutcomes(actions: PlannedAction[], other: number): PlanCounts {
  const counts: PlanCounts = { linked: 0, create: 0, adopt: 0, skip: 0, blocked: 0, other_analyses: other };
  for (const a of actions) counts[a.outcome] += 1;
  return counts;
}

const byKey = (a: { key: string }, b: { key: string }): number => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** SHA-256 of the target, every create with its content and every adopt with its item id, as arrays. */
function digestOf(target: Target, actions: PlannedAction[], items: Map<string, TrackedItem>): string {
  const creates = [...items.values()].sort(byKey).map(({ key, content }) => {
    const { origin } = content;
    return [key, content.title, content.action, JSON.stringify(content.sections),
      [origin.analysis, origin.version, origin.chain, origin.action, origin.url ?? null]];
  });
  const adopts = actions
    .flatMap((a) => (a.outcome === "adopt" && a.link ? [{ key: a.key, id: a.link.id }] : []))
    .sort(byKey)
    .map((a) => [a.key, a.id]);
  const value = [[target.provider, target.host, target.project, target.label, target.visibility, target.type ?? null, target.parent ?? null], creates, adopts];
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** The plan for a document against a target, given every item the tracker lists with the label. */
export function computePlan(doc: FmeaDocument, target: Target, marked: RemoteItem[]): Plan {
  const config = doc.meta.tracker;
  if (config === undefined) throw new Error("computePlan needs meta.tracker");
  const refs = actionRefs(doc);
  const groups = groupListing(doc.meta.id, refs, marked);
  const actions: PlannedAction[] = [];
  const items = new Map<string, TrackedItem>();
  for (const ref of refs) {
    const { planned, item } = planAction(doc, config, ref, groups.ours);
    actions.push(planned);
    if (item) items.set(ref.key, item);
  }
  const unlinkedKeys = new Set(refs.filter((r) => !r.action.tracker).map((r) => r.key));
  const findings = [
    ...oursFindings(groups.ours, unlinkedKeys),
    ...groups.unmarked.map((i): PlanFinding => ({ kind: "unmarked", urls: [i.link.url] })),
    ...mismatchFindings(refs, groups.claimed),
    ...sharedFindings(refs),
  ];
  return { actions, findings, counts: countOutcomes(actions, groups.other), digest: digestOf(target, actions, items), items };
}
