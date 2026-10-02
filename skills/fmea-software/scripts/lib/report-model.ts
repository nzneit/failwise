// The report model: everything the HTML report shows, derived from the document as plain data.
// No HTML and no escaping here; `render.ts` emits and escapes. Chains are addressed by their
// position in `chains[]`.

import type { Action, Chain, Factor, FmeaDocument, Ratings, Severity, Stale, StaleReason } from "./types.ts";
import type { PriorityTable } from "./table.ts";
import { vocabularyRank } from "./table.ts";
import { chainIndex } from "./pointer.ts";

const FACTORS: Factor[] = ["S", "O", "D"];

export type RankStyle = "top" | "mid" | "low";

export interface PriorityCount { value: string; style: RankStyle; count: number }

export interface Tiles {
  priorities: PriorityCount[];                                     // vocabulary order, zeros included; then any out-of-vocabulary value, in order of first appearance, style "low"
  chainsLine: string;                                              // "8 failure chains" | "1 failure chain" | "0 failure chains"
  ratings: { provisional: number; total: number; line: string };   // line: "provisional, in 3 rows" | "provisional, in 1 row" | "all reviewed"
  checks: { blockers: string; warnings: string; alert: boolean };  // "1 blocker", "10 warnings"; alert when the blocker count is above 0
  actions: { headline: string; of: string | null; line: string | null };
  //   open actions exist:        { headline: "8 open", of: "of 9", line: "next due 2026-10-09" }
  //   actions exist, none open:  { headline: "0 open", of: "of 2", line: "all closed" }
  //   no action in the document: { headline: "none",   of: null,   line: null }
  qualityScore: number | null;                                     // doc.computed.quality_score; null when the document has no computed block
}

// Where a finding points: into a row (its chain's id and a label for the spot within the row,
// null for the row as a whole; `raw` when the label is the rest of the pointer as it stands), at a
// chain index with no chain (§5.5), or outside `chains[]`.
export type Where =
  | { kind: "row"; chainId: string; label: string | null; raw: boolean }
  | { kind: "unknown-row"; pointer: string }
  | { kind: "document"; pointer: string };

export interface PlacedFinding { severity: Severity; rule: string; message: string; where: Where }

export type RowMark = "stale" | "handoff" | "provisional" | "blocker";

// One row of the index, in the index order (§5.7, §5.8).
export interface RowModel {
  chain: Chain;
  element: string;                 // the element id of the chain's function; "" when the function is missing
  statement: string;               // the function's statement; "" when the function is missing
  style: RankStyle;                // the badge style of chain.priority.value
  postStyle: RankStyle | null;     // the badge style of chain.post_priority.value; null without post_priority
  marks: RowMark[];                // §5.7 order: stale, handoff, provisional, blocker
  findings: PlacedFinding[];       // row findings pointing into this chain, without warnings of rule "rating-provisional", in §5.8 order
  actionsCell: { text: string; due: string | null };   // "1 open" | "1 open of 2" | "all 2 closed" | "none"; due = earliest open target date
  trigger: string | null;          // the trimmed trigger, when it gets its own part (§5.3); else null
  triggerCauses: number[];         // indexes into chain.causes of every cause whose trimmed text equals the trimmed trigger
  staleNotice: string | null;      // null when stale.flag is false
}

export type GroupLocation =
  | { kind: "row"; chainId: string; labels: { text: string; raw: boolean }[] }   // labels empty = the row alone
  | { kind: "unknown-row"; pointer: string }
  | { kind: "document"; pointer: string };

// The findings that share severity, rule and message, with every place they point to (§5.6).
export interface CheckGroup { severity: Severity; rule: string; message: string; count: number; locations: GroupLocation[] }

// One action of the document with its chain's id, for the Actions section (§5.2).
export interface ActionRow { chainId: string; action: Action; open: boolean }

// The items of the "Needs attention" block (§4.1); an item with nothing to list is null.
export interface Attention {
  blockers: { label: string; lines: PlacedFinding[] } | null;
  stale: { label: string; rows: { chainId: string; reason: string | null }[] } | null;
  provisional: { label: string; rows: { chainId: string; factors: string[] }[] } | null;   // factors: "S", "O", "D", "post-action S", ...
  handoffs: { label: string; rows: { chainId: string; failureMode: string }[] } | null;
  nextActions: ActionRow[];                                        // at most three; empty means the item is left out
}

export interface ReportModel {
  tiles: Tiles;
  vocabulary: { value: string; style: RankStyle }[];   // the loaded table's vocabulary in order, for the key
  rows: RowModel[];                                    // the index order of sortChains
  groups: CheckGroup[];                                // blocker groups first, then by first finding
  actions: ActionRow[];                                // open first, then by target date, ties in document order (§5.2)
  attention: Attention;
}

// "1 row", "0 rows": the singular only for exactly one (§4).
function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

// A badge's style by the value's rank in the loaded vocabulary: the first value is "top", the last
// and any value outside the vocabulary are "low", everything between is "mid" (§4.7). A
// one-value vocabulary is "top".
function rankStyle(vocabulary: string[], value: string): RankStyle {
  const i = vocabulary.indexOf(value);
  if (i === 0) return "top";
  if (i === -1 || i === vocabulary.length - 1) return "low";
  return "mid";
}

// An action is open until it is completed or recorded as not implemented (§5.1).
function isOpen(action: Action): boolean {
  return action.status !== "Completed" && action.status !== "Not Implemented";
}

// The rating blocks a row carries: `ratings` always, and `post_ratings` once the row has been
// re-scored after a completed action. Both count, for the header's provisional line and for the
// row's provisional mark alike, so a post-action priority is never shown without the caveat that
// the ratings under it are unreviewed (§5 step 5, §9).
function ratingBlocks(chain: Chain): Ratings[] {
  return chain.post_ratings ? [chain.ratings, chain.post_ratings] : [chain.ratings];
}

function provisionalCount(chain: Chain): number {
  let n = 0;
  for (const ratings of ratingBlocks(chain)) {
    for (const f of FACTORS) if (ratings[f].review.status === "provisional") n++;
  }
  return n;
}

export function sortChains(doc: FmeaDocument, table: PriorityTable): Chain[] {
  return [...doc.chains].sort((a, b) => {
    const rank = vocabularyRank(table, a.priority.value) - vocabularyRank(table, b.priority.value);
    if (rank !== 0) return rank;
    const sev = b.ratings.S.value - a.ratings.S.value;
    if (sev !== 0) return sev;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function priorityCounts(doc: FmeaDocument, vocabulary: string[]): PriorityCount[] {
  const counts = new Map<string, number>(vocabulary.map((v) => [v, 0]));
  for (const chain of doc.chains) counts.set(chain.priority.value, (counts.get(chain.priority.value) ?? 0) + 1);
  return [...counts].map(([value, n]) => ({ value, style: rankStyle(vocabulary, value), count: n }));
}

function ratingsTile(doc: FmeaDocument): Tiles["ratings"] {
  let provisional = 0;
  let total = 0;
  let rows = 0;
  for (const chain of doc.chains) {
    const n = provisionalCount(chain);
    provisional += n;
    total += ratingBlocks(chain).length * FACTORS.length;
    if (n > 0) rows++;
  }
  const line = provisional === 0 ? "all reviewed" : "provisional, in " + count(rows, "row", "rows");
  return { provisional, total, line };
}

function checksTile(doc: FmeaDocument): Tiles["checks"] {
  const lints = doc.computed?.lints ?? [];
  const blockers = lints.filter((l) => l.severity === "blocker").length;
  const warnings = lints.filter((l) => l.severity === "warning").length;
  return { blockers: count(blockers, "blocker", "blockers"), warnings: count(warnings, "warning", "warnings"), alert: blockers > 0 };
}

function actionsTile(doc: FmeaDocument): Tiles["actions"] {
  const all = doc.chains.flatMap((chain) => chain.actions);
  if (all.length === 0) return { headline: "none", of: null, line: null };
  const due = all.filter(isOpen).map((a) => a.target_date).sort();
  const line = due.length === 0 ? "all closed" : "next due " + due[0];
  return { headline: `${due.length} open`, of: `of ${all.length}`, line };
}

// A placed finding and, for a row finding, its chain's position in `doc.chains` (never its id:
// two chains may share one).
interface Located { index: number | null; finding: PlacedFinding }

const RATING_LABEL = /^\/(ratings|post_ratings)\/([SOD])$/;
const ACTION_LABEL = /^\/actions\/(0|[1-9][0-9]*)$/;

// The spot within a row that `rest`, the pointer after `/chains/<i>`, names (§5.8).
function rowLabel(chain: Chain, rest: string): { label: string | null; raw: boolean } {
  if (rest === "") return { label: null, raw: false };
  const rated = RATING_LABEL.exec(rest);
  if (rated) return { label: rated[1] === "ratings" ? rated[2] : `post-action ${rated[2]}`, raw: false };
  const acted = ACTION_LABEL.exec(rest);
  const act = acted ? chain.actions[Number(acted[1])] : undefined;
  if (act) return { label: act.id, raw: false };
  return { label: rest, raw: true };
}

// Every finding of `computed.lints`, in that order, placed by its chain index (§5.5).
function placeFindings(doc: FmeaDocument): Located[] {
  return (doc.computed?.lints ?? []).map(({ severity, rule, message, pointer }) => {
    const i = chainIndex(pointer);
    const chain = i === null ? undefined : doc.chains[i];
    if (i === null || chain === undefined) {
      return { index: null, finding: { severity, rule, message, where: { kind: i === null ? "document" : "unknown-row", pointer } } };
    }
    const where: Where = { kind: "row", chainId: chain.id, ...rowLabel(chain, pointer.slice(`/chains/${i}`.length)) };
    return { index: i, finding: { severity, rule, message, where } };
  });
}

const LABEL_ORDER = ["S", "O", "D", "post-action S", "post-action O", "post-action D"];

function labelRank(text: string): number {
  const i = LABEL_ORDER.indexOf(text);
  return i === -1 ? LABEL_ORDER.length : i;
}

type RowLocation = Extract<GroupLocation, { kind: "row" }>;

// A group's locations: its rows by chain position, in order of first appearance, each with its
// labels in factor order; then the unknown rows; then the document pointers (§5.6).
function groupLocations(members: Located[]): GroupLocation[] {
  const rows = new Map<number, RowLocation>();
  const unknown: GroupLocation[] = [];
  const documents: GroupLocation[] = [];
  for (const { index, finding: { where } } of members) {
    if (where.kind !== "row") (where.kind === "unknown-row" ? unknown : documents).push({ ...where });
    else if (index !== null) {
      const row = rows.get(index) ?? { kind: "row", chainId: where.chainId, labels: [] };
      rows.set(index, row);
      if (where.label !== null) row.labels.push({ text: where.label, raw: where.raw });
    }
  }
  for (const row of rows.values()) row.labels.sort((a, b) => labelRank(a.text) - labelRank(b.text));
  return [...rows.values(), ...unknown, ...documents];
}

function groupFindings(located: Located[]): CheckGroup[] {
  const groups = new Map<string, Located[]>();
  for (const entry of located) {
    const { severity, rule, message } = entry.finding;
    const key = JSON.stringify([severity, rule, message]);
    const members = groups.get(key);
    if (members) members.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.values()]
    .map((members): CheckGroup => {
      const { severity, rule, message } = members[0].finding;
      return { severity, rule, message, count: members.length, locations: groupLocations(members) };
    })
    .sort((a, b) => Number(b.severity === "blocker") - Number(a.severity === "blocker"));
}

// A row's marks, in the order of §5.7. `own` is every finding that points into the row.
function rowMarks(chain: Chain, own: PlacedFinding[]): RowMark[] {
  const marks: RowMark[] = [];
  if (chain.stale.flag) marks.push("stale");
  if (chain.handoff) marks.push("handoff");
  if (provisionalCount(chain) > 0) marks.push("provisional");
  if (own.some((f) => f.severity === "blocker")) marks.push("blocker");
  return marks;
}

// The index Actions cell (§4.2): O open of T, and the earliest target date among the open ones.
function actionsCell(chain: Chain): RowModel["actionsCell"] {
  const total = chain.actions.length;
  const due = chain.actions.filter(isOpen).map((a) => a.target_date).sort();
  const open = due.length;
  let text: string;
  if (total === 0) text = "none";
  else if (open === 0) text = `all ${total} closed`;
  else if (open === total) text = `${open} open`;
  else text = `${open} open of ${total}`;
  return { text, due: open === 0 ? null : due[0] };
}

// The trigger rule (§5.3): a trigger that restates causes marks them and gets no part of its own;
// one that restates none is shown alone, trimmed; an empty one is no trigger.
function triggerMatch(chain: Chain): { trigger: string | null; triggerCauses: number[] } {
  const trigger = chain.trigger?.trim() ?? "";
  if (trigger === "") return { trigger: null, triggerCauses: [] };
  const triggerCauses: number[] = [];
  chain.causes.forEach((cause, i) => { if (cause.text.trim() === trigger) triggerCauses.push(i); });
  return { trigger: triggerCauses.length === 0 ? trigger : null, triggerCauses };
}

const STALE_REASON_WORDS: Record<StaleReason, string> = {
  "element-changed": "its element changed",
  "function-changed": "its function changed",
  "control-removed": "a control it relied on was removed",
  "scales-version": "the scales changed",
};

// A stale row's reason in words; null without a reason.
function staleReasonWords(stale: Stale): string | null {
  return stale.reason ? STALE_REASON_WORDS[stale.reason] : null;
}

// "Stale since version 2: its element changed.", "Stale since version 2.", "Stale."; null for a
// row that is not stale.
function staleNotice(stale: Stale): string | null {
  if (!stale.flag) return null;
  const since = stale.since_version === undefined ? "" : ` since version ${stale.since_version}`;
  const words = staleReasonWords(stale);
  return `Stale${since}${words === null ? "." : `: ${words}.`}`;
}

// The rows in the index order. A row's findings are found by its chain's position in
// `doc.chains` (object identity), never by its id.
function buildRows(doc: FmeaDocument, table: PriorityTable, located: Located[]): RowModel[] {
  return sortChains(doc, table).map((chain) => {
    const index = doc.chains.indexOf(chain);
    const own = located.filter((l) => l.index === index).map((l) => l.finding);
    const fn = doc.functions.find((f) => f.id === chain.function);
    const shown = own.filter((f) => !(f.rule === "rating-provisional" && f.severity === "warning"));
    return {
      chain,
      element: fn?.element ?? "",
      statement: fn?.statement ?? "",
      style: rankStyle(table.vocabulary, chain.priority.value),
      postStyle: chain.post_priority ? rankStyle(table.vocabulary, chain.post_priority.value) : null,
      marks: rowMarks(chain, own),
      findings: [...shown.filter((f) => f.severity === "blocker"), ...shown.filter((f) => f.severity !== "blocker")],
      actionsCell: actionsCell(chain),
      ...triggerMatch(chain),
      staleNotice: staleNotice(chain.stale),
    };
  });
}

// Every action in document order (chain position, then action position), then sorted open
// before closed and by target date; the sort is stable, so ties keep document order (§5.1, §5.2).
function orderActions(doc: FmeaDocument): ActionRow[] {
  const rows = doc.chains.flatMap((chain) => chain.actions.map((action) => ({ chainId: chain.id, action, open: isOpen(action) })));
  return rows.sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    return a.action.target_date < b.action.target_date ? -1 : a.action.target_date > b.action.target_date ? 1 : 0;
  });
}

// The rows marked stale, in the index order, each with its reason in words.
function staleItem(rows: RowModel[]): Attention["stale"] {
  const marked = rows.filter((row) => row.marks.includes("stale"));
  if (marked.length === 0) return null;
  return {
    label: count(marked.length, "row", "rows") + " due to be rated again",
    rows: marked.map((row) => ({ chainId: row.chain.id, reason: staleReasonWords(row.chain.stale) })),
  };
}

// The rows handed off to threat modelling, in the index order, each with its failure mode.
function handoffItem(rows: RowModel[]): Attention["handoffs"] {
  const marked = rows.filter((row) => row.marks.includes("handoff"));
  if (marked.length === 0) return null;
  return {
    label: count(marked.length, "row", "rows") + " passed to threat modelling",
    rows: marked.map((row) => ({ chainId: row.chain.id, failureMode: row.chain.failure_mode })),
  };
}

// A row's provisional factors: S, O, D of the ratings, then those of the post-action ratings.
function provisionalFactors(chain: Chain): string[] {
  const factors: string[] = FACTORS.filter((f) => chain.ratings[f].review.status === "provisional");
  const post = chain.post_ratings;
  if (post) for (const f of FACTORS) if (post[f].review.status === "provisional") factors.push(`post-action ${f}`);
  return factors;
}

// The rows with a provisional rating, in the index order. The label counts ratings, not rows.
function provisionalItem(rows: RowModel[], ratings: number): Attention["provisional"] {
  const marked = rows.filter((row) => row.marks.includes("provisional"));
  if (marked.length === 0) return null;
  return {
    label: count(ratings, "rating", "ratings") + " not yet reviewed",
    rows: marked.map((row) => ({ chainId: row.chain.id, factors: provisionalFactors(row.chain) })),
  };
}

// The blocker item's label, by the blocker-label table (§4.1).
function blockerLabel(rows: number, documentBlocker: boolean): string {
  if (rows === 0) return documentBlocker ? "The document fails an automated check" : "An automated check fails";
  const n = count(rows, "row", "rows");
  if (documentBlocker) return `${n} and the document fail an automated check`;
  return `${n} ${rows === 1 ? "fails" : "fail"} an automated check`;
}

// Every blocker: each row's in the index order, then those at a chain index with no chain, then
// those outside `chains[]`, the last two in `computed.lints` order.
function blockerItem(rows: RowModel[], located: Located[]): Attention["blockers"] {
  const elsewhere = located.map((l) => l.finding).filter((f) => f.severity === "blocker");
  const documents = elsewhere.filter((f) => f.where.kind === "document");
  const lines = [
    ...rows.flatMap((row) => row.findings.filter((f) => f.severity === "blocker")),
    ...elsewhere.filter((f) => f.where.kind === "unknown-row"),
    ...documents,
  ];
  if (lines.length === 0) return null;
  const marked = rows.filter((row) => row.marks.includes("blocker")).length;
  return { label: blockerLabel(marked, documents.length > 0), lines };
}

// The "Needs attention" items, all derived by row position from the index rows (§4.1).
function buildAttention(rows: RowModel[], actions: ActionRow[], provisionalRatings: number, located: Located[]): Attention {
  return {
    blockers: blockerItem(rows, located),
    stale: staleItem(rows),
    provisional: provisionalItem(rows, provisionalRatings),
    handoffs: handoffItem(rows),
    nextActions: actions.filter((a) => a.open).slice(0, 3),
  };
}

export function buildReportModel(doc: FmeaDocument, table: PriorityTable): ReportModel {
  const tiles: Tiles = {
    priorities: priorityCounts(doc, table.vocabulary),
    chainsLine: count(doc.chains.length, "failure chain", "failure chains"),
    ratings: ratingsTile(doc),
    checks: checksTile(doc),
    actions: actionsTile(doc),
    qualityScore: doc.computed ? doc.computed.quality_score : null,
  };
  const located = placeFindings(doc);
  const rows = buildRows(doc, table, located);
  const actions = orderActions(doc);
  return {
    tiles,
    vocabulary: table.vocabulary.map((value) => ({ value, style: rankStyle(table.vocabulary, value) })),
    rows,
    groups: groupFindings(located),
    actions,
    attention: buildAttention(rows, actions, tiles.ratings.provisional, located),
  };
}
