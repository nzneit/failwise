import type { Issue } from "./codes.ts";
import type { Chain, Element, FmeaDocument, Factor, Fn, Priority, Ratings } from "./types.ts";
import type { PriorityTable } from "./table.ts";
import { computePriority } from "./table.ts";
import { ptr } from "./pointer.ts";

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

function dependencyIssues(elements: Element[]): Issue[] {
  const out: Issue[] = [];
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].kind === "external_dependency" && elements[i].dependency === undefined) {
      out.push(invariant("element-dependency-required", `element ${elements[i].id} is an external_dependency and needs a dependency block`, ptr("elements", i, "dependency")));
    }
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
// checks several rules reports them chain by chain.
export function checkInvariants(doc: FmeaDocument): Issue[] {
  const elements = doc.elements;
  const functions = doc.functions;
  const chains = doc.chains;
  const elementIds = new Set(elements.map((e) => e.id));
  const functionIds = new Set(functions.map((f) => f.id));

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
    ...dependencyIssues(elements),
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
