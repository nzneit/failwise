// The structure of an update, computed from the stored copy and the draft: the edge and element
// changes, the rows they reach, the rows left unmarked, the removed links, the orphans, the re-rated
// providers and the re-rating order. It shares graph.ts's index and parent walk, and imports no CLI.
import { chainElement, edgeJoins, indexDocument, providerIds, resolvedLinks } from "./graph.ts";
import type { DocIndex, ResolvedLink } from "./graph.ts";
import type { Issue } from "./codes.ts";
import { ptr } from "./pointer.ts";
import type { Chain, Element, FmeaDocument, Rating } from "./types.ts";

export type EdgeField = "strength" | "sla" | "limits";
export type ElementField = "kind" | "boundary" | "security_relevant";
export interface EdgeChange { change: "added" | "removed" | "changed"; from: string; to: string; fields: EdgeField[] }
export interface ElementChange { change: "added" | "removed" | "changed"; id: string; fields: ElementField[] }
/** `index` is the row's index in the draft. */
export interface ReachedRow { chainId: string; index: number; rule: string }
export interface UnmarkedRow { chainId: string; rule: string }
/** `index` is the consumer's index in the draft. */
export interface RemovedLink { chainId: string; index: number; cause: number; removed: string; candidates: string[] }
export interface Orphan { element: string; why: string }
/** `index` is the consumer's index in the draft. */
export interface ChangedProvider { chainId: string; index: number; cause: number; provider: string; changed: ("failure_mode" | "O")[] }
export interface UpdateDiff { edges: EdgeChange[]; elements: ElementChange[]; reached: ReachedRow[]; unmarked: UnmarkedRow[]; removedLinks: RemovedLink[]; orphans: Orphan[]; changedProviders: ChangedProvider[]; order: string[] }

interface Pair { copy: FmeaDocument; draft: FmeaDocument; ci: DocIndex; di: DocIndex }
interface Ctx extends Pair { links: ResolvedLink[]; edges: EdgeChange[]; elements: ElementChange[] }
type Change = "added" | "removed" | "changed";

function pair(copy: FmeaDocument, draft: FmeaDocument): Pair {
  return { copy, draft, ci: indexDocument(copy), di: indexDocument(draft) };
}

/** The copy index of draft chain `i`'s id, when draft chain `i` is the first chain with its id. */
function copyRowIndex(p: Pair, i: number): number | undefined {
  const id = p.draft.chains[i].id;
  return p.di.chain.get(id) === i ? p.ci.chain.get(id) : undefined;
}

/** Rows are matched by chain id: a chain the copy lacks is new, never reached, unmarked or ordered. */
function inBoth(p: Pair, i: number): boolean {
  return copyRowIndex(p, i) !== undefined;
}

/** The draft's chain ids the copy lacks, in draft order, first occurrence only. */
function newChainIds(p: Pair): string[] {
  return [...p.di.chain.keys()].filter((id) => !p.ci.chain.has(id));
}

/** The draft chains on element `elementId`, ascending. */
function chainsOn(ctx: Ctx, elementId: string): number[] {
  const el = ctx.di.element.get(elementId);
  if (el === undefined) return [];
  return ctx.draft.chains.flatMap((_, i) => (chainElement(ctx.draft, ctx.di, i) === el ? [i] : []));
}

function firstByKey<T>(items: readonly T[], key: (x: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) if (!map.has(key(item))) map.set(key(item), item);
  return map;
}

/** Added and changed items in draft order, then removed items in copy order; first occurrence wins. */
function diffKeyed<F extends string, T extends { readonly [K in F]?: unknown }>(copy: readonly T[], draft: readonly T[], key: (x: T) => string, fields: readonly F[]): { change: Change; item: T; fields: F[] }[] {
  const before = firstByKey(copy, key);
  const after = firstByKey(draft, key);
  const out: { change: Change; item: T; fields: F[] }[] = [];
  for (const [k, item] of after) {
    const old = before.get(k);
    if (old === undefined) {
      out.push({ change: "added", item, fields: [] });
      continue;
    }
    const differ = fields.filter((f) => old[f] !== item[f]);
    if (differ.length > 0) out.push({ change: "changed", item, fields: differ });
  }
  for (const [k, item] of before) if (!after.has(k)) out.push({ change: "removed", item, fields: [] });
  return out;
}

function diffEdges(copy: FmeaDocument, draft: FmeaDocument): EdgeChange[] {
  return diffKeyed(copy.dependencies, draft.dependencies, (e) => JSON.stringify([e.from, e.to]), ["strength", "sla", "limits"] as const)
    .map(({ change, item, fields }) => ({ change, from: item.from, to: item.to, fields }));
}

function diffElements(copy: FmeaDocument, draft: FmeaDocument): ElementChange[] {
  return diffKeyed(copy.elements, draft.elements, (e) => e.id, ["kind", "boundary", "security_relevant"] as const)
    .map(({ change, item, fields }) => ({ change, id: item.id, fields }));
}

/** The links into a chain on `to` from a chain on `from`, an ancestor or a descendant of it. */
function consumerLinks(ctx: Ctx, e: EdgeChange): ResolvedLink[] {
  const toEl = ctx.di.element.get(e.to);
  if (toEl === undefined) return [];
  return ctx.links.filter((l) => {
    const consumer = chainElement(ctx.draft, ctx.di, l.chain);
    const provider = chainElement(ctx.draft, ctx.di, l.provider);
    return consumer !== undefined && provider === toEl && edgeJoins(ctx.di, e, consumer, provider);
  });
}

function reachedRows(ctx: Ctx): ReachedRow[] {
  const rule = new Map<number, string>();
  const mark = (i: number, text: string): void => { if (inBoth(ctx, i) && !rule.has(i)) rule.set(i, text); };
  for (const el of ctx.elements) if (el.change === "changed") for (const i of chainsOn(ctx, el.id)) mark(i, `element ${el.id} ${el.fields.join(", ")} changed`);
  for (const e of ctx.edges) for (const i of chainsOn(ctx, e.to)) mark(i, `edge ${e.from} to ${e.to} changed`);
  for (const e of ctx.edges) for (const l of consumerLinks(ctx, e)) {
    mark(l.chain, `link /chains/${l.chain}/causes/${l.cause} into ${ctx.draft.chains[l.provider].id} across edge ${e.from} to ${e.to}`);
  }
  return [...rule].sort((a, b) => a[0] - b[0]).map(([index, text]) => ({ chainId: ctx.draft.chains[index].id, index, rule: text }));
}

/** The first changed edge whose `from` shares a lineage with the consumer element and whose `to` is
 *  an ancestor of the provider element. */
function descendantEdge(ctx: Ctx, consumer: number | undefined, provider: number | undefined): EdgeChange | undefined {
  if (consumer === undefined || provider === undefined) return undefined;
  return ctx.edges.find((e) => edgeJoins(ctx.di, e, consumer, provider) && ctx.di.element.get(e.to) !== provider);
}

/** The rule of the first link of the row that qualifies, descendant form before marked form. */
function unmarkedRule(ctx: Ctx, i: number, marked: ReadonlySet<number>): string | undefined {
  for (const l of ctx.links) {
    if (l.chain !== i) continue;
    const head = `link /chains/${l.chain}/causes/${l.cause} into ${ctx.draft.chains[l.provider].id}`;
    const providerEl = chainElement(ctx.draft, ctx.di, l.provider);
    const e = descendantEdge(ctx, chainElement(ctx.draft, ctx.di, l.chain), providerEl);
    if (e !== undefined && providerEl !== undefined) return `${head} on ${ctx.draft.elements[providerEl].id}, a descendant of ${e.to}`;
    if (marked.has(l.provider)) return `${head}, a row this update marks`;
  }
  return undefined;
}

function unmarkedRows(ctx: Ctx, reached: ReachedRow[]): UnmarkedRow[] {
  const marked = new Set(reached.map((r) => r.index));
  const out: UnmarkedRow[] = [];
  ctx.draft.chains.forEach((c, i) => {
    if (!inBoth(ctx, i) || marked.has(i)) return;
    const rule = unmarkedRule(ctx, i, marked);
    if (rule !== undefined) out.push({ chainId: c.id, rule });
  });
  return out;
}

/** Draft chain `target` is reachable from draft chain `start` along the draft's links. */
function reaches(ctx: Ctx, start: number, target: number): boolean {
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const at = queue.shift() ?? start;
    if (at === target) return true;
    for (const l of ctx.links) {
      if (l.chain === at && !seen.has(l.provider)) {
        seen.add(l.provider);
        queue.push(l.provider);
      }
    }
  }
  return false;
}

function removedLinks(ctx: Ctx): RemovedLink[] {
  const fresh = newChainIds(ctx);
  return resolvedLinks(ctx.copy, ctx.ci).flatMap((l) => {
    const chainId = ctx.copy.chains[l.chain].id;
    const removed = ctx.copy.chains[l.provider].id;
    const index = ctx.di.chain.get(chainId);
    if (ctx.di.chain.has(removed) || index === undefined) return [];
    const candidates = fresh.filter((id) => !reaches(ctx, ctx.di.chain.get(id) ?? index, index));
    return [{ chainId, index, cause: l.cause, removed, candidates }];
  });
}

/** Why an outside element is the `to` of no edge in the draft. */
function orphanWhy(ctx: Ctx, el: Element): string {
  const at = ctx.ci.element.get(el.id);
  if (at === undefined) return "it is added with no consumer";
  const last = ctx.copy.dependencies.findLast((e) => e.to === el.id);
  if (last !== undefined) {
    return ctx.di.element.has(last.from)
      ? `its last edge, from ${last.from}, was removed`
      : `its last edge, from ${last.from}, went with removed element ${last.from}`;
  }
  if (ctx.copy.elements[at].boundary !== el.boundary) return `its boundary changed to ${el.boundary} and no edge names it`;
  return "it had no consumer in the stored copy either";
}

function orphans(ctx: Ctx): Orphan[] {
  const providers = providerIds(ctx.draft);
  return ctx.draft.elements
    .filter((el, i) => ctx.di.element.get(el.id) === i && el.boundary !== "in_scope" && !providers.has(el.id))
    .map((el) => ({ element: el.id, why: orphanWhy(ctx, el) }));
}

function sameOccurrence(a: Rating, b: Rating): boolean {
  return a.value === b.value && a.evidence_kind === b.evidence_kind && a.evidence_ref === b.evidence_ref;
}

function changedProviders(ctx: Ctx): ChangedProvider[] {
  return ctx.links.flatMap((l) => {
    const provider = ctx.draft.chains[l.provider];
    const at = ctx.ci.chain.get(provider.id);
    if (at === undefined) return [];
    const before = ctx.copy.chains[at];
    const changed: ChangedProvider["changed"] = [];
    if (provider.failure_mode !== before.failure_mode) changed.push("failure_mode");
    if (!sameOccurrence(provider.ratings.O, before.ratings.O)) changed.push("O");
    if (changed.length === 0) return [];
    return [{ chainId: ctx.draft.chains[l.chain].id, index: l.chain, cause: l.cause, provider: provider.id, changed }];
  });
}

/** The stale rows, provider before consumer over the links among them; ties by draft index. */
function reratingOrder(ctx: Ctx, reached: ReachedRow[]): string[] {
  const stale = new Set(reached.map((r) => r.index));
  ctx.draft.chains.forEach((c, i) => { if (c.stale.flag && inBoth(ctx, i)) stale.add(i); });
  const links = ctx.links.filter((l) => stale.has(l.chain) && stale.has(l.provider));
  const waiting = new Map([...stale].map((i) => [i, links.filter((l) => l.chain === i).length]));
  const order: number[] = [];
  while (waiting.size > 0) {
    const ready = [...waiting].filter(([, n]) => n === 0).map(([i]) => i);
    const next = Math.min(...(ready.length > 0 ? ready : waiting.keys())); // a cycle, which validate.ts refuses: lowest index first
    waiting.delete(next);
    order.push(next);
    for (const l of links) if (l.provider === next && waiting.has(l.chain)) waiting.set(l.chain, (waiting.get(l.chain) ?? 0) - 1);
  }
  return order.map((i) => ctx.draft.chains[i].id);
}

export function diffUpdate(copy: FmeaDocument, draft: FmeaDocument): UpdateDiff {
  const p = pair(copy, draft);
  const ctx: Ctx = { ...p, links: resolvedLinks(draft, p.di), edges: diffEdges(copy, draft), elements: diffElements(copy, draft) };
  const reached = reachedRows(ctx);
  return {
    edges: ctx.edges,
    elements: ctx.elements,
    reached,
    unmarked: unmarkedRows(ctx, reached),
    removedLinks: removedLinks(ctx),
    orphans: orphans(ctx),
    changedProviders: changedProviders(ctx),
    order: reratingOrder(ctx, reached),
  };
}

/** At most one UPDATE_BASELINE issue: a meta.id that differs, failing that a draft version the copy's
 *  version does not allow, which is the copy's version plus one under --check and either on the first run. */
export function baselineIssues(copy: FmeaDocument, draft: FmeaDocument, check: boolean): Issue[] {
  const issue = (message: string, pointer: string): Issue[] => [{ code: "UPDATE_BASELINE", rule: "update-baseline", message, pointer }];
  if (copy.meta.id !== draft.meta.id) return issue(`the stored copy has meta.id ${copy.meta.id} but the draft has ${draft.meta.id}`, ptr("meta", "id"));
  const c = copy.meta.version;
  const v = draft.meta.version;
  const allowed = check ? [c + 1] : [c, c + 1];
  if (allowed.includes(v)) return [];
  return issue(`the draft's meta.version ${v} is not ${check ? c + 1 : `${c} or ${c + 1}`} as the stored copy's meta.version ${c} requires`, ptr("meta", "version"));
}

interface CheckCtx extends Pair { reached: ReadonlyMap<number, string>; removed: readonly RemovedLink[]; fresh: ReadonlySet<string> }
type CheckRule = (ctx: CheckCtx, i: number) => Issue[];

function checkContext(copy: FmeaDocument, draft: FmeaDocument, diff: UpdateDiff): CheckCtx {
  const p = pair(copy, draft);
  return { ...p, reached: new Map(diff.reached.map((r) => [r.index, r.rule])), removed: diff.removedLinks, fresh: new Set(newChainIds(p)) };
}

function mismatch(rule: string, message: string, pointer: string): Issue[] {
  return [{ code: "UPDATE_MISMATCH", rule, message, pointer }];
}

function copyRow(ctx: CheckCtx, i: number): Chain | undefined {
  const at = copyRowIndex(ctx, i);
  return at === undefined ? undefined : ctx.copy.chains[at];
}

/** The draft row carries an entry of its history[] at the draft's meta.version. */
function hasClearingEntry(ctx: CheckCtx, i: number): boolean {
  return ctx.draft.chains[i].history.some((h) => h.version === ctx.draft.meta.version);
}

const staleMissing: CheckRule = (ctx, i) => {
  const rule = ctx.reached.get(i);
  const c = ctx.draft.chains[i];
  if (rule === undefined || c.stale.flag || hasClearingEntry(ctx, i)) return [];
  return mismatch("stale-missing", `chain ${c.id} is reached by ${rule} but its stale.flag is false`, ptr("chains", i, "stale", "flag"));
};

const staleReason: CheckRule = (ctx, i) => {
  const rule = ctx.reached.get(i);
  const c = ctx.draft.chains[i];
  if (rule === undefined || !c.stale.flag || c.stale.reason === "element-changed") return [];
  return mismatch("stale-reason", `chain ${c.id} is reached by ${rule} but its stale.reason is ${c.stale.reason ?? "absent"}`, ptr("chains", i, "stale", "reason"));
};

/** A row flagged in the copy keeps its since_version; a newly flagged row takes the draft's version. */
const staleSinceVersion: CheckRule = (ctx, i) => {
  const c = ctx.draft.chains[i];
  if (!ctx.reached.has(i) || !c.stale.flag) return [];
  const before = copyRow(ctx, i);
  const want = before?.stale.flag === true ? before.stale.since_version : ctx.draft.meta.version;
  const got = c.stale.since_version;
  if (got === want) return [];
  return mismatch("stale-since-version", `chain ${c.id} has stale.since_version ${got ?? "absent"} where ${want ?? "absent"} is due`, ptr("chains", i, "stale", "since_version"));
};

const staleUnreached: CheckRule = (ctx, i) => {
  const c = ctx.draft.chains[i];
  if (ctx.reached.has(i) || !c.stale.flag || c.stale.reason !== "element-changed") return [];
  const before = copyRow(ctx, i);
  if (before?.stale.flag === true && before.stale.reason === "element-changed") return [];
  return mismatch("stale-unreached", `chain ${c.id} is newly flagged element-changed but no rule reaches it`, ptr("chains", i, "stale", "reason"));
};

const ratingOutsideSet: CheckRule = (ctx, i) => {
  const c = ctx.draft.chains[i];
  const before = copyRow(ctx, i);
  if (before === undefined || c.stale.flag || hasClearingEntry(ctx, i)) return [];
  const f = (["S", "O", "D"] as const).find((k) => c.ratings[k].value !== before.ratings[k].value);
  if (f === undefined) return [];
  return mismatch("rating-outside-set", `chain ${c.id} is not stale but its ${f} moved from ${before.ratings[f].value} to ${c.ratings[f].value} with no history entry at version ${ctx.draft.meta.version}`,
    ptr("chains", i, "ratings", f, "value"));
};

/** One issue per cause of the row still linked into a removed chain to a chain that is not new; a
 *  missing cause, or one with no chain, counts as dropped. */
const linkIntoRemoved: CheckRule = (ctx, i) => {
  const c = ctx.draft.chains[i];
  return ctx.removed.filter((r) => r.index === i).flatMap((r) => {
    const target = c.causes.at(r.cause)?.chain;
    if (target === undefined || ctx.fresh.has(target)) return [];
    return mismatch("link-into-removed", `cause ${r.cause} of chain ${c.id} links to ${target}, which is neither dropped nor a chain new in this update`, ptr("chains", i, "causes", r.cause, "chain"));
  });
};

const CHECK_RULES: readonly CheckRule[] = [staleMissing, staleReason, staleSinceVersion, staleUnreached, ratingOutsideSet, linkIntoRemoved];

/** The UPDATE_MISMATCH issues of --check, rows in draft order, one line per row per rule in rule order. */
export function mismatchIssues(copy: FmeaDocument, draft: FmeaDocument, diff: UpdateDiff): Issue[] {
  const ctx = checkContext(copy, draft, diff);
  return draft.chains.flatMap((_, i) => CHECK_RULES.flatMap((rule) => rule(ctx, i)));
}

function section(name: string, items: string[]): string[] {
  return [`${name}:`, ...(items.length > 0 ? items : ["none"]).map((x) => `  ${x}`)];
}

function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function changeLine(change: Change, name: string, fields: readonly string[]): string {
  return change === "changed" ? `changed ${name}: ${fields.join(", ")}` : `${change} ${name}`;
}

function removedLine(r: RemovedLink): string {
  const head = `/chains/${r.index}/causes/${r.cause} into ${r.removed}`;
  return r.candidates.length > 0 ? `${head}: repoint to ${r.candidates.join(", ")}, or drop` : `${head}: drop`;
}

/** The stdout of update-check.ts: one section per part of the diff, then the counts line. */
export function diffLines(diff: UpdateDiff, check: boolean): string[] {
  const providers = check ? section("consumer causes whose linked chain changed", diff.changedProviders.map((p) => `/chains/${p.index}/causes/${p.cause} into ${p.provider}: ${p.changed.join(", ")}`)) : [];
  const counts = [
    counted(diff.edges.length, "edge change", "edge changes"),
    counted(diff.elements.length, "element change", "element changes"),
    counted(diff.reached.length, "stale row", "stale rows"),
    counted(diff.unmarked.length, "unmarked row", "unmarked rows"),
    counted(diff.removedLinks.length, "link into a removed chain", "links into removed chains"),
    counted(diff.orphans.length, "outside element with no consumer", "outside elements with no consumer"),
    ...(check ? [counted(diff.changedProviders.length, "changed provider", "changed providers")] : []),
  ];
  return [
    ...section("edges", diff.edges.map((e) => changeLine(e.change, `${e.from} to ${e.to}`, e.fields))),
    ...section("elements", diff.elements.map((e) => changeLine(e.change, e.id, e.fields))),
    ...section("stale", diff.reached.map((r) => `${r.chainId}: ${r.rule}`)),
    ...section("unmarked", diff.unmarked.map((r) => `${r.chainId}: ${r.rule}`)),
    ...section("links into removed chains", diff.removedLinks.map(removedLine)),
    ...section("outside elements with no consumer", diff.orphans.map((o) => `${o.element}: ${o.why}`)),
    ...providers,
    ...section("re-rating order", diff.order.length > 0 ? [diff.order.join(", ")] : []),
    `update-check: ${counts.join(", ")}`,
  ];
}
