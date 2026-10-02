// The report model: everything the HTML report shows, derived from the document as plain data.
// No HTML and no escaping here; `render.ts` emits and escapes. Chains are addressed by their
// position in `chains[]`.

import type { Action, Chain, Factor, FmeaDocument, Ratings, Severity } from "./types.ts";
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
  findings: PlacedFinding[];       // row findings pointing into this chain, without rule "rating-provisional", in §5.8 order
}

export type GroupLocation =
  | { kind: "row"; chainId: string; labels: { text: string; raw: boolean }[] }   // labels empty = the row alone
  | { kind: "unknown-row"; pointer: string }
  | { kind: "document"; pointer: string };

// The findings that share severity, rule and message, with every place they point to (§5.6).
export interface CheckGroup { severity: Severity; rule: string; message: string; count: number; locations: GroupLocation[] }

// One action of the document with its chain's id, for the Actions section (§5.2).
export interface ActionRow { chainId: string; action: Action; open: boolean }

export interface ReportModel {
  tiles: Tiles;
  vocabulary: { value: string; style: RankStyle }[];   // the loaded table's vocabulary in order, for the key
  rows: RowModel[];                                    // the index order of sortChains
  groups: CheckGroup[];                                // blocker groups first, then by first finding
  actions: ActionRow[];                                // open first, then by target date, ties in document order (§5.2)
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
export function ratingBlocks(chain: Chain): Ratings[] {
  return chain.post_ratings ? [chain.ratings, chain.post_ratings] : [chain.ratings];
}

export function provisionalCount(chain: Chain): number {
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

// The rows in the index order. A row's findings are found by its chain's position in
// `doc.chains` (object identity), never by its id.
function buildRows(doc: FmeaDocument, table: PriorityTable, located: Located[]): RowModel[] {
  return sortChains(doc, table).map((chain) => {
    const index = doc.chains.indexOf(chain);
    const own = located.filter((l) => l.index === index).map((l) => l.finding);
    const fn = doc.functions.find((f) => f.id === chain.function);
    const shown = own.filter((f) => f.rule !== "rating-provisional");
    return {
      chain,
      element: fn?.element ?? "",
      statement: fn?.statement ?? "",
      style: rankStyle(table.vocabulary, chain.priority.value),
      postStyle: chain.post_priority ? rankStyle(table.vocabulary, chain.post_priority.value) : null,
      marks: rowMarks(chain, own),
      findings: [...shown.filter((f) => f.severity === "blocker"), ...shown.filter((f) => f.severity !== "blocker")],
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
  return {
    tiles,
    vocabulary: table.vocabulary.map((value) => ({ value, style: rankStyle(table.vocabulary, value) })),
    rows: buildRows(doc, table, located),
    groups: groupFindings(located),
    actions: orderActions(doc),
  };
}
