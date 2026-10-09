import type { Issue } from "./codes.ts";
import type { Chain, DependencyEdge, Element, FmeaDocument, Factor, Fn, Priority, Ratings } from "./types.ts";
import type { PriorityTable } from "./table.ts";
import { computePriority } from "./table.ts";
import { ptr } from "./pointer.ts";
import { indexDocument, providerIds, resolvedLinks } from "./graph.ts";
import type { DocIndex, ResolvedLink } from "./graph.ts";

export const INVARIANT_RULES: readonly string[] = [
  "element-id-unique",
  "function-id-unique",
  "chain-id-unique",
  "action-id-unique",
  "function-element-resolves",
  "chain-function-resolves",
  "element-parent-resolves",
  "element-parent-matches-id",
  "element-source-non-catalog",
  "element-dependency-required",
  "element-security-rationale-required",
  "codebase-id-unique",
  "element-codebase-resolves",
  "dependency-from-resolves",
  "dependency-to-resolves",
  "dependency-self",
  "dependency-pair-unique",
  "cause-chain-resolves",
  "cause-chain-self",
  "cause-chain-cycle",
  "rating-review-by-date",
  "post-ratings-without-completed",
  "post-priority-presence",
  "handoff-without-adversarial",
  "adversarial-without-handoff",
  "handoff-cause-mismatch",
  "stale-without-reason",
  "stale-version-ahead",
  "priority-table-mismatch",
  "priority-row-table-mismatch",
  "priority-value-mismatch",
  "priority-rpn-mismatch",
];

const FACTORS: Factor[] = ["S", "O", "D"];

function invariant(rule: string, message: string, pointer: string): Issue {
  return { code: "INVARIANT", rule, message, pointer };
}

function expectedParent(id: string): string | null {
  const cut = id.lastIndexOf(".");
  return cut === -1 ? null : id.slice(0, cut);
}

function duplicates(values: string[], rule: string, pointerFor: (i: number) => string, what: string): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (let i = 0; i < values.length; i++) {
    if (seen.has(values[i])) out.push(invariant(rule, `${what} id ${values[i]} is used more than once`, pointerFor(i)));
    else seen.add(values[i]);
  }
  return out;
}

function actionIdIssues(chains: Chain[]): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < chains.length; i++) {
    const seen = new Set<string>();
    for (let j = 0; j < chains[i].actions.length; j++) {
      const id = chains[i].actions[j].id;
      if (seen.has(id)) out.push(invariant("action-id-unique", `action id ${id} is used more than once on chain ${chains[i].id}`, ptr("chains", i, "actions", j, "id")));
      else seen.add(id);
    }
  }
  return out;
}

function functionElementIssues(functions: Fn[], elementIds: Set<string>): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < functions.length; i++) {
    if (!elementIds.has(functions[i].element)) {
      out.push(invariant("function-element-resolves", `element ${functions[i].element} does not exist`, ptr("functions", i, "element")));
    }
  }
  return out;
}

function chainFunctionIssues(chains: Chain[], functionIds: Set<string>): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < chains.length; i++) {
    if (!functionIds.has(chains[i].function)) {
      out.push(invariant("chain-function-resolves", `function ${chains[i].function} does not exist`, ptr("chains", i, "function")));
    }
  }
  return out;
}

function parentResolvesIssues(elements: Element[], elementIds: Set<string>): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < elements.length; i++) {
    const parent = elements[i].parent;
    if (parent !== null && !elementIds.has(parent)) {
      out.push(invariant("element-parent-resolves", `parent ${parent} does not exist`, ptr("elements", i, "parent")));
    }
  }
  return out;
}

function parentMatchesIdIssues(elements: Element[]): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < elements.length; i++) {
    const want = expectedParent(elements[i].id);
    if (elements[i].parent !== want) {
      out.push(invariant("element-parent-matches-id", `parent must be ${want === null ? "null" : want} for id ${elements[i].id}`, ptr("elements", i, "parent")));
    }
  }
  return out;
}

function sourceIssues(elements: Element[]): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < elements.length; i++) {
    if (!elements[i].sources.some((s) => s.kind !== "catalog")) {
      out.push(invariant("element-source-non-catalog", `element ${elements[i].id} needs at least one source whose kind is not catalog`, ptr("elements", i, "sources")));
    }
  }
  return out;
}

function dependencyIssues(elements: Element[], providers: ReadonlySet<string>): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].boundary !== "in_scope" && !providers.has(elements[i].id)) {
      out.push(invariant("element-dependency-required", `element ${elements[i].id} has boundary ${elements[i].boundary} and no edge depends on it`, ptr("elements", i, "boundary")));
    }
  }
  return out;
}

function securityRationaleIssues(elements: Element[]): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].security_relevant === true && (elements[i].security_rationale ?? "").trim() === "") {
      out.push(invariant("element-security-rationale-required", `element ${elements[i].id} is security-relevant and needs a security_rationale`, ptr("elements", i, "security_rationale")));
    }
  }
  return out;
}

function codebaseIssues(elements: Element[], codebaseIds: Set<string>): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < elements.length; i++) {
    const id = elements[i].codebase;
    if (id !== undefined && !codebaseIds.has(id)) {
      out.push(invariant("element-codebase-resolves", `codebase ${id} names no entry of meta.codebases`, ptr("elements", i, "codebase")));
    }
  }
  return out;
}

// dependency-from-resolves, dependency-to-resolves and dependency-self, which share the loop over edges.
function edgeIssues(edges: DependencyEdge[], elements: ReadonlyMap<string, number>): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < edges.length; i++) {
    const { from, to } = edges[i];
    if (!elements.has(from)) out.push(invariant("dependency-from-resolves", `element ${from} does not exist`, ptr("dependencies", i, "from")));
    if (!elements.has(to)) out.push(invariant("dependency-to-resolves", `element ${to} does not exist`, ptr("dependencies", i, "to")));
    if (from === to) out.push(invariant("dependency-self", `edge from ${from} to ${to} has the same element at both ends`, ptr("dependencies", i, "to")));
  }
  return out;
}

function pairIssues(edges: DependencyEdge[]): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (let i = 0; i < edges.length; i++) {
    const { from, to } = edges[i];
    const key = JSON.stringify([from, to]);
    if (seen.has(key)) out.push(invariant("dependency-pair-unique", `edge from ${from} to ${to} is listed more than once`, ptr("dependencies", i)));
    else seen.add(key);
  }
  return out;
}

// cause-chain-resolves and cause-chain-self, which share the loop over causes.
function causeLinkIssues(chains: Chain[], chainIndex: ReadonlyMap<string, number>): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < chains.length; i++) {
    for (let j = 0; j < chains[i].causes.length; j++) {
      const id = chains[i].causes[j].chain;
      if (id === undefined) continue;
      const at = chainIndex.get(id);
      if (at === undefined) out.push(invariant("cause-chain-resolves", `chain ${id} does not exist`, ptr("chains", i, "causes", j, "chain")));
      else if (at === i) out.push(invariant("cause-chain-self", `cause ${j} links to its own chain ${id}`, ptr("chains", i, "causes", j, "chain")));
    }
  }
  return out;
}

type Adjacency = number[][];

function adjacency(size: number, links: ResolvedLink[], reversed: boolean): Adjacency {
  const out: Adjacency = Array.from({ length: size }, () => []);
  for (const l of links) {
    if (reversed) out[l.provider].push(l.chain);
    else out[l.chain].push(l.provider);
  }
  return out;
}

// Each node once, in the order its depth-first visit finishes, with an explicit stack.
function finishOrder(graph: Adjacency): number[] {
  const seen = Array.from({ length: graph.length }, () => false);
  const order: number[] = [];
  for (let root = 0; root < graph.length; root++) {
    if (seen[root]) continue;
    seen[root] = true;
    const stack: [number, number][] = [[root, 0]];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const next = graph[top[0]][top[1]++];
      if (next === undefined) { order.push(top[0]); stack.pop(); }
      else if (!seen[next]) { seen[next] = true; stack.push([next, 0]); }
    }
  }
  return order;
}

// The component of each chain: the reversed graph walked in reverse finishing order.
function components(size: number, links: ResolvedLink[]): number[] {
  const reversed = adjacency(size, links, true);
  const comp = Array.from({ length: size }, () => -1);
  const order = finishOrder(adjacency(size, links, false));
  let count = 0;
  for (let k = order.length - 1; k >= 0; k--) {
    if (comp[order[k]] !== -1) continue;
    const stack = [order[k]];
    comp[order[k]] = count;
    for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
      for (const next of reversed[node]) if (comp[next] === -1) { comp[next] = count; stack.push(next); }
    }
    count++;
  }
  return comp;
}

function cycleIssues(doc: FmeaDocument, index: DocIndex): Issue[] {
  const links = resolvedLinks(doc, index);
  const comp = components(doc.chains.length, links);
  const reported = new Set<number>();
  const out: Issue[] = [];
  for (const l of links) {
    const c = comp[l.chain];
    if (c !== comp[l.provider] || reported.has(c)) continue;
    reported.add(c);
    const through = doc.chains.filter((_, k) => comp[k] === c).map((ch) => ch.id).join(", ");
    out.push(invariant("cause-chain-cycle", `cause ${l.cause} of chain ${doc.chains[l.chain].id} is on a cycle of links through chains ${through}`, ptr("chains", l.chain, "causes", l.cause, "chain")));
  }
  return out;
}

// rating-review-by-date over one ratings block of chain `chainIdx`; `key` names the block.
function reviewIssues(ratings: Ratings, chainIdx: number, key: "ratings" | "post_ratings"): Issue[] {
  const out: Issue[] = [];
  for (const f of FACTORS) {
    const review = ratings[f].review;
    if (review.status !== "provisional" && (!review.by || !review.date)) {
      out.push(invariant("rating-review-by-date", `a ${review.status} review needs by and date`, ptr("chains", chainIdx, key, f, "review")));
    }
  }
  return out;
}

// rating-review-by-date over every chain: its ratings, then its post_ratings when it has them.
function ratingReviewIssues(chains: Chain[]): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < chains.length; i++) {
    out.push(...reviewIssues(chains[i].ratings, i, "ratings"));
    const post = chains[i].post_ratings;
    if (post) out.push(...reviewIssues(post, i, "post_ratings"));
  }
  return out;
}

// post-ratings-without-completed and post-priority-presence, which share the loop over chains.
function postRatingsIssues(chains: Chain[]): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    if (c.post_ratings && !c.actions.some((a) => a.status === "Completed")) {
      out.push(invariant("post-ratings-without-completed", "post_ratings needs at least one action with status Completed on the same chain", ptr("chains", i, "post_ratings")));
    }
    if ((c.post_priority !== undefined) !== (c.post_ratings !== undefined)) {
      out.push(invariant("post-priority-presence", "post_priority is present exactly when post_ratings is present", ptr("chains", i, "post_priority")));
    }
  }
  return out;
}

// The three handoff rules, which share the loop over chains.
function handoffIssues(chains: Chain[]): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    const adversarial = c.causes.filter((cause) => cause.adversarial === true);
    const handoff = c.handoff;
    if (handoff && adversarial.length === 0) {
      out.push(invariant("handoff-without-adversarial", "a handoff needs at least one cause marked adversarial", ptr("chains", i, "handoff")));
    }
    if (!handoff && adversarial.length > 0) {
      out.push(invariant("adversarial-without-handoff", "a chain with an adversarial cause needs a handoff", ptr("chains", i, "causes")));
    }
    if (handoff && adversarial.length > 0 && !adversarial.some((cause) => cause.text === handoff.adversary_cause)) {
      out.push(invariant("handoff-cause-mismatch", "adversary_cause must equal the text of an adversarial cause on the same chain", ptr("chains", i, "handoff", "adversary_cause")));
    }
  }
  return out;
}

// stale-without-reason and stale-version-ahead, which share the loop over chains.
function staleIssues(chains: Chain[], version: number): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < chains.length; i++) {
    const stale = chains[i].stale;
    if (stale.flag && stale.reason === undefined) {
      out.push(invariant("stale-without-reason", "a stale row needs a reason", ptr("chains", i, "stale")));
    }
    if (stale.since_version !== undefined && stale.since_version > version) {
      out.push(invariant("stale-version-ahead", `since_version ${stale.since_version} is ahead of meta.version ${version}`, ptr("chains", i, "stale", "since_version")));
    }
  }
  return out;
}

// Every invariant issue of `doc`. The helpers run in the order of INVARIANT_RULES; a helper that
// checks several rules reports them record by record.
export function checkInvariants(doc: FmeaDocument): Issue[] {
  const elements = doc.elements;
  const functions = doc.functions;
  const chains = doc.chains;
  const elementIds = new Set(elements.map((e) => e.id));
  const functionIds = new Set(functions.map((f) => f.id));
  const index = indexDocument(doc);
  const codebaseIds = (doc.meta.codebases ?? []).map((c) => c.id);

  return [
    ...duplicates(elements.map((e) => e.id), "element-id-unique", (i) => ptr("elements", i, "id"), "element"),
    ...duplicates(functions.map((f) => f.id), "function-id-unique", (i) => ptr("functions", i, "id"), "function"),
    ...duplicates(chains.map((c) => c.id), "chain-id-unique", (i) => ptr("chains", i, "id"), "chain"),
    ...actionIdIssues(chains),
    ...functionElementIssues(functions, elementIds),
    ...chainFunctionIssues(chains, functionIds),
    ...parentResolvesIssues(elements, elementIds),
    ...parentMatchesIdIssues(elements),
    ...sourceIssues(elements),
    ...dependencyIssues(elements, providerIds(doc)),
    ...securityRationaleIssues(elements),
    ...duplicates(codebaseIds, "codebase-id-unique", (i) => ptr("meta", "codebases", i, "id"), "codebase"),
    ...codebaseIssues(elements, new Set(codebaseIds)),
    ...edgeIssues(doc.dependencies, index.element),
    ...pairIssues(doc.dependencies),
    ...causeLinkIssues(chains, index.chain),
    ...cycleIssues(doc, index),
    ...ratingReviewIssues(chains),
    ...postRatingsIssues(chains),
    ...handoffIssues(chains),
    ...staleIssues(chains, doc.meta.version),
  ];
}

// The three mismatch rules over one stored priority block and the block the table gives for the
// ratings beside it. `key` is the chain property being checked, so the same three rules report at
// /chains/<i>/priority and at /chains/<i>/post_priority.
function priorityMismatches(stored: Priority, want: Priority, i: number, key: "priority" | "post_priority"): Issue[] {
  const out: Issue[] = [];
  if (stored.table !== want.table) {
    out.push({ code: "PRIORITY_MISMATCH", rule: "priority-row-table-mismatch", message: `row table is ${stored.table} but the loaded table id is ${want.table}`, pointer: ptr("chains", i, key, "table") });
  }
  if (stored.value !== want.value) {
    out.push({ code: "PRIORITY_MISMATCH", rule: "priority-value-mismatch", message: `stored priority ${stored.value} but the table gives ${want.value}`, pointer: ptr("chains", i, key, "value") });
  }
  if (stored.rpn !== want.rpn) {
    out.push({ code: "PRIORITY_MISMATCH", rule: "priority-rpn-mismatch", message: `stored rpn ${stored.rpn} but S times O times D is ${want.rpn}`, pointer: ptr("chains", i, key, "rpn") });
  }
  return out;
}

export function checkPriorities(doc: FmeaDocument, table: PriorityTable): Issue[] {
  const declared = doc.meta.scales.priority_table;
  if (declared !== table.id) {
    return [{
      code: "TABLE_ID_MISMATCH",
      rule: "priority-table-mismatch",
      message: `meta.scales.priority_table is ${declared} but the loaded table id is ${table.id}`,
      pointer: ptr("meta", "scales", "priority_table"),
    }];
  }
  const out: Issue[] = [];
  for (let i = 0; i < doc.chains.length; i++) {
    const chain = doc.chains[i];
    out.push(...priorityMismatches(chain.priority, computePriority(table, chain.ratings), i, "priority"));
    const post = chain.post_ratings;
    if (post !== undefined && chain.post_priority !== undefined) {
      out.push(...priorityMismatches(chain.post_priority, computePriority(table, post), i, "post_priority"));
    }
  }
  return out;
}
