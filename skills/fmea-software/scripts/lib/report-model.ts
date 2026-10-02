// The report model: everything the HTML report shows, derived from the document as plain data.
// No HTML and no escaping here; `render.ts` emits and escapes. Chains are addressed by their
// position in `chains[]`.

import type { Action, Chain, Factor, FmeaDocument, Ratings } from "./types.ts";
import type { PriorityTable } from "./table.ts";
import { vocabularyRank } from "./table.ts";

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

export interface ReportModel {
  tiles: Tiles;
  vocabulary: { value: string; style: RankStyle }[];   // the loaded table's vocabulary in order, for the key
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

export function buildReportModel(doc: FmeaDocument, table: PriorityTable): ReportModel {
  const tiles: Tiles = {
    priorities: priorityCounts(doc, table.vocabulary),
    chainsLine: count(doc.chains.length, "failure chain", "failure chains"),
    ratings: ratingsTile(doc),
    checks: checksTile(doc),
    actions: actionsTile(doc),
    qualityScore: doc.computed ? doc.computed.quality_score : null,
  };
  return { tiles, vocabulary: table.vocabulary.map((value) => ({ value, style: rankStyle(table.vocabulary, value) })) };
}
