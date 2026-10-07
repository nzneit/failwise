// tools/eval-report.ts
//
// Turns build/evals/results.json (written after tools/workflows/evals.js) into
// the markdown summary docs/specs/2026-09-07-eval-results.md: one table per
// prompt (model, run, total/max, musts at 2, pass), a stability table, an
// overall table per (prompt, model), and the completeness critic's lists.
//
// Usage: node tools/eval-report.ts [--results build/evals/results.json] [--out docs/specs/2026-09-07-eval-results.md] [--title "Eval results, v1"]
//
// The pass rule (spec §10, evals/rubric.md): a run passes when every `must`
// criterion scores 2 and the total is at least 80% of the maximum; a
// (prompt, model) pair passes when both runs pass and the stability check
// between them passes. This file recomputes totals from the per-criterion
// scores rather than trusting the judge's arithmetic.

import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isEntry } from "./lib/entry.ts";

/** The repository root. Judge text quotes paths absolute under it; `oneLine` strips the prefix. */
const ROOT = join(import.meta.dirname, "..");

/**
 * The repository root where a path ends: at the end of the string, or before
 * whitespace or punctuation. A bare `ROOT` matched anywhere cut the prefix out
 * of a sibling checkout's path too (`<root>-research/x` became `.-research/x`).
 */
const ROOT_AT_BOUNDARY = new RegExp(
  `${ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s.,;:!?)\\]}'"])`,
  "g",
);

/** A rubric criterion; `rubric` is the rubric version that introduced it, 1 when absent. */
export interface Criterion { id: string; must: boolean; prompts: number[]; rubric?: number }

/**
 * The thirteen rubric criteria (plan reference §I). c5 does not apply to prompt 6,
 * c11 applies to prompt 6 only, c12 to prompt 7 only, and c13 to prompts 1 and 6
 * under rubric 2 only.
 */
export const CRITERIA: Criterion[] = [
  { id: "c1-missing-inputs-asked", must: true, prompts: [1, 5, 6, 7] },
  { id: "c2-element-traceability", must: true, prompts: [1, 5, 6, 7] },
  { id: "c3-chain-completeness", must: false, prompts: [1, 5, 6, 7] },
  { id: "c4-rating-rationale-evidence", must: true, prompts: [1, 5, 6, 7] },
  { id: "c5-provisional-rescore", must: true, prompts: [1, 5, 7] },
  { id: "c6-priority-by-script", must: true, prompts: [1, 5, 6, 7] },
  { id: "c7-json-validates", must: true, prompts: [1, 5, 6, 7] },
  { id: "c8-html-renders", must: false, prompts: [1, 5, 6, 7] },
  { id: "c9-provenance-tags", must: true, prompts: [1, 5, 6, 7] },
  { id: "c10-no-invented-elements", must: true, prompts: [1, 5, 6, 7] },
  { id: "c11-prompt6-conversion", must: true, prompts: [6] },
  { id: "c12-prompt7-update", must: true, prompts: [7] },
  { id: "c13-element-typing", must: false, prompts: [1, 6], rubric: 2 },
];

/** Short titles for the four prompts, in the words of spec §10. */
const PROMPT_TITLES: Record<number, string> = {
  1: "design FMEA of a checkout service with a payment gateway and a pricing service",
  5: "seed from postmortems",
  6: "convert a legacy RPN sheet",
  7: "update after an architecture change",
};

/**
 * The parts of `## Scores recorded before …`: scores in
 * `build/evals/results.json` awarded before the rubric carried the user's Task
 * 33 rulings 3, 8 and 9, listed because no run was re-judged when those rulings
 * landed. They are written here beside the prompt titles because they are facts
 * about this one set of runs rather than about the report's shape, and because
 * this document is the v1 acceptance evidence: it must not read as if every
 * score in it were measured against the rubric it ships beside.
 *
 * Each part is gated on its own flag of `staleScoreParts`, so filling one hole
 * takes that part out and leaves the others standing. One predicate over all
 * three would drop a caveat that is still true the moment a neighbouring hole
 * is filled, and acceptance evidence that loses a true caveat fails open. The
 * c1 and c3 parts go finer still: each is built from the runs whose score is
 * still the stale one, so re-judging one run of a part takes that run and its
 * own detail sentence out of the bullet and leaves the rest of the bullet
 * standing. The four parts are `staleScoresC1`, `staleScoresC3`,
 * `STALE_SCORES_RULING9` and `STALE_SCORES_CLOSING`.
 */

/**
 * A run whose `c1-missing-inputs-asked` score predates ruling 3: the sentence
 * saying what its own judgment rests on, and whether its judge says as much in
 * the notes this document prints below. A run's sentence reaches the bullet
 * only while that run's score is still 2.
 */
interface StaleC1Run { prompt: number; model_capability: string; run: number; detail: string; judgeConcurs: boolean }

/** The four runs ruling 3 governs, in the order the c1 bullet names them. The
 * model_capability values are the pre-2026-09-12 labels `opus` and `sonnet`: these
 * runs belong to the archived first sixteen, judged before the axis was renamed,
 * so against a fresh results file the roster matches nothing and its part retires
 * itself — by design. */
const STALE_C1_RUNS: StaleC1Run[] = [
  {
    prompt: 1, model_capability: "opus", run: 2,
    detail: "prompt 1 opus run 2's assumption is not carried into the final message as a question about the scaling limit",
    judgeConcurs: false,
  },
  {
    prompt: 1, model_capability: "sonnet", run: 1,
    detail: "prompt 1 sonnet run 1 records no assumption naming it",
    judgeConcurs: true,
  },
  {
    prompt: 5, model_capability: "opus", run: 2,
    detail: "prompt 5 opus run 2 records the gap at `/elements/5/dependency/limits` as a field value",
    judgeConcurs: true,
  },
  {
    prompt: 5, model_capability: "sonnet", run: 2,
    detail: "prompt 5 sonnet run 2 records no assumption naming it",
    judgeConcurs: true,
  },
];

/**
 * The four prompt-6 runs ruling 8 governs, in the order the c3 bullet names
 * them. A roster the way c1 has one, rather than a scan of whatever prompt-6
 * runs a results file holds: the bullet states a score awarded before the
 * ruling, so a prompt-6 run that is not one of these four is never named by it.
 */
const STALE_C3_RUNS: { prompt: number; model_capability: string; run: number }[] = [
  { prompt: 6, model_capability: "opus", run: 1 },
  { prompt: 6, model_capability: "opus", run: 2 },
  { prompt: 6, model_capability: "sonnet", run: 1 },
  { prompt: 6, model_capability: "sonnet", run: 2 },
];

/** The prompt-6 runs whose judge asks, in as many words, for the carve-out ruling 8 has since given. */
const STALE_C3_CARVE_OUT_ASKED = ["prompt 6 opus run 2", "prompt 6 sonnet run 1"];

/**
 * The runs the critic scored c5 = 1 on, in the order its entry names them
 * (added 2026-09-12 when the sentence quoting them gained its gate, closing the
 * third finding the Task 32 gate left open: the sentence prints only while the
 * current results file still shows those runs holding c5 = 1, so a re-judging
 * takes it out with the scores it was about rather than asserting a verdict the
 * tables no longer show). The labels are the pre-2026-09-12 ones — these runs
 * live in the archived first-sixteen results, and a fresh results file names
 * model capabilities, so the sentence retires itself when none of them is found.
 */
const STALE_C5_RUNS: { prompt: number; model_capability: string; run: number }[] = [
  { prompt: 1, model_capability: "sonnet", run: 2 },
  { prompt: 7, model_capability: "opus", run: 2 },
  { prompt: 7, model_capability: "sonnet", run: 1 },
  { prompt: 7, model_capability: "sonnet", run: 2 },
];

/** A run as one of the STALE_* rosters names it. */
interface RosterKey { prompt: number; model_capability: string; run: number }

/** The three rosters, each with the criterion whose pre-ruling score it names. */
const ROSTERS: { roster: string; criterion: string; keys: RosterKey[] }[] = [
  { roster: "STALE_C1_RUNS", criterion: "c1-missing-inputs-asked", keys: STALE_C1_RUNS },
  { roster: "STALE_C3_RUNS", criterion: "c3-chain-completeness", keys: STALE_C3_RUNS },
  { roster: "STALE_C5_RUNS", criterion: "c5-provisional-rescore", keys: STALE_C5_RUNS },
];

/** `prompt 1 opus run 2`: how a run is named in the stale-score bullets and in `staleScoreParts`. */
function runLabel(r: RosterKey): string {
  return `prompt ${r.prompt} ${r.model_capability} run ${r.run}`;
}

/** `a`, `a and b`, `a, b and c`. */
function andList(items: string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The c1 bullet, over the runs `staleScoreParts` still reports and their own detail sentences alone. */
export function staleScoresC1(runs: string[]): string {
  const entries = STALE_C1_RUNS.filter((r) => runs.includes(runLabel(r)));
  const concurring = entries.filter((r) => r.judgeConcurs).map(runLabel);
  const concur =
    concurring.length === 0
      ? ""
      : concurring.length === 1
        ? ` The judge of ${concurring[0]} says as much in its own notes below.`
        : ` The judges of ${andList(concurring)} say as much in their own notes below.`;
  return `- \`c1-missing-inputs-asked\` (a **must**) on ${andList(runs)}. Each scored 2 under the pre-ruling text. Ruling 3 now states c1's planted-gap clause literally — the pricing service's missing scaling limit has to be an open \`meta.assumptions[]\` entry owned by the user *and* a question in the final message, and a value written into a document field in its place scores 0 — and each of those judgments rests on a reading the amended clause puts at 0 or leaves in doubt: ${andList(entries.map((r) => r.detail))}.${concur}`;
}

/** The c3 bullet, over the prompt-6 runs `staleScoreParts` still reports alone. */
export function staleScoresC3(runs: string[]): string {
  const askers = runs.filter((r) => STALE_C3_CARVE_OUT_ASKED.includes(r));
  const ask =
    askers.length === 0
      ? ""
      : `, and ${andList(askers)} ask${askers.length === 1 ? "s" : ""} in as many words for the prompt-6 carve-out ruling 8 has since given`;
  return `- \`c3-chain-completeness\` (not a must) on ${andList(runs)}. ${runs.length === 1 ? "It scored" : "Each scored"} 0 or 1 because the sheet's one Effect column fills \`effects.end\` while \`effects.local\` and \`effects.next_level\` carry the same declared placeholder naming the sheet, on 4 of 4 rows; ruling 8 now accepts that shape at band 2 where \`meta.history\` records which level the Effect column filled, that the other two were substituted, and on how many rows, and the \`meta.history\` of all four documents records exactly that. ${runs.length === 1 ? "Its judge writes" : "Each of those judges writes"} the same tension into its evidence or its notes: the placeholder is the conversion rule's declared default and \`fixtures/legacy-rpn-sheet.expected.fmea.json\` carries it too, so the band as it then stood was out of reach of a faithful conversion${ask}. Prompt 6's totals understate by 1 or 2 points and no verdict moves.`;
}
/**
 * The ruling-9 part: gated on the prompt-6 runs still carrying a stored `c5`
 * score, the mark of a judgment made under the CRITERIA ruling 9 superseded.
 */
export const STALE_SCORES_RULING9 =
  "Prompt 6's judge notes below quote the applicability as it stood before ruling 9 — three of the four say all nine musts score 2 and give the run's total out of 22 — above tables that read 8 musts and a maximum of 20, because ruling 9 removed c5 from prompt 6 and no run was re-judged; `summarizeRun` ignores the c5 score each of those judges recorded.";

/** The closing paragraph: it is about what the c1 scores decide, so it prints while any of them is still stale. */
export const STALE_SCORES_CLOSING =
  "Because c1 is a must, the stale scores above decide their runs and so their pairs: **no (prompt, model capability) pair may be accepted on the c1 numbers in this document**. The pass count in \"Overall per prompt and model capability\" below is the count under the pre-ruling scores; of the pairs it marks `pass`, those with no run named in the c1 bullet above rest on c1 scores the current rubric produced — prompt 6 carries no planted gap, so ruling 3 does not touch its c1. Re-judging c1 on the runs that bullet names, or a ruling on each, precedes acceptance and is recorded in `docs/specs/2026-09-07-acceptance.md`.";

/** `ruling 9`, `rulings 8 and 9`, `rulings 3, 8 and 9`. */
function rulingList(rulings: number[]): string {
  if (rulings.length === 1) return `ruling ${rulings[0]}`;
  return `rulings ${andList(rulings.map(String))}`;
}

/** The section's heading, naming only the rulings whose parts print. */
function staleScoresHeading(rulings: number[]): string {
  return `## Scores recorded before ${rulingList(rulings)}`;
}

/** The section's opening sentence, naming only the rulings whose parts print. */
function staleScoresIntro(rulings: number[]): string {
  const those = rulings.length === 1 ? "that ruling" : "those rulings";
  return `These scores were awarded before \`skills/fmea-software/evals/rubric.md\` carried the user's Task 33 ${rulingList(rulings)} (2026-09-11), and no run was re-judged when ${those} landed. They are holes in the evidence, not measured results.`;
}

/**
 * An answered critic entry: the bullet to print, and the substring of a
 * `critic.missing[].area` that identifies the entry it answers.
 */
interface StaleCriticEntry { area: string; text: string }

/**
 * The completeness critic's entries in `build/evals/results.json` that the
 * work following it has since answered, listed because the critic was not
 * re-run. It sits beside the stale-score parts for the same reason: this
 * document is the v1 acceptance evidence, and a critic list read as current
 * would put the gate on issues that are closed. Each bullet is gated on the
 * entry it answers, so re-running the critic takes a bullet out with its own
 * entry rather than taking the whole subsection out with the first one. The
 * intro prints while any part of the subsection prints — the half-answered
 * paragraph alone included, which without it would stand under no sentence
 * saying the critic predates the rulings — and the closing paragraph, whose
 * subject is the critic's own pair-tally entry, is gated on that entry.
 */
const STALE_CRITIC_INTRO =
  "The critic below ran before `skills/fmea-software/evals/rubric.md` carried the user's Task 33 rulings 2, 4, 8 and 9 (2026-09-11) and before `tools/eval-report.ts` and `build/evals/results.json` existed. It has not been re-run, so its lists are the state of things at that moment, not now.";

/** The lead-in to the answered bullets: it prints with them, where the intro prints with any part. */
const STALE_CRITIC_ANSWERED_LEAD = "These entries are answered:";

/** One bullet per answered entry, each keyed to the `critic.missing[].area` it answers. */
const STALE_CRITIC_ANSWERED: StaleCriticEntry[] = [
  {
    area: "no substitute defined for c5",
    text: "- **rubric §\"Unattended runs\" — no substitute defined for c5** — answered by ruling 2. The rubric's `Unattended runs` section now carries a third bullet beside c1's: c5's re-scoring clause is met unattended when the final message states that every rating is provisional and names re-scoring by a named person, one rating at a time against the anchors, as the next step, no question required. That substitute meets the re-scoring clause alone: band 2's other clauses — every rating the run authored `review.status: \"provisional\"`, no priority named without the provisional caveat — still apply as written.",
  },
  {
    area: "c5 vs SKILL.md conversion rule",
    text: "- **c5 vs SKILL.md conversion rule (prompt 6)** — answered by ruling 9. c5 no longer applies to prompt 6 anywhere: the rubric's applicability paragraph, its `(must, not prompt 6)` heading, and the `CRITERIA` lists in `tools/eval-report.ts` and `tools/workflows/evals.js`. Prompt 6's maximum is 20 with 8 musts in the tables above, and `summarizeRun` ignores a c5 score on a prompt-6 run.",
  },
  {
    area: "c3-chain-completeness on prompt 6",
    text: "- **c3-chain-completeness on prompt 6 — no carve-out** — answered by ruling 8. Band 2 now accepts, on a converted row, the sheet's Effect text at the one level the column mapping assigns it with a declared placeholder at the other two — the shape the expected fixture and all four runs produce — and equally the same text at all three levels, where `meta.history` records which level the Effect column filled, that the other two were substituted, and on how many rows. The four prompt-6 c3 scores in this document were awarded before that carve-out; the section on pre-ruling scores at the head of this document governs them.",
  },
  {
    area: "Stability metric",
    text: "- **Stability metric — elements[].name vs elements[].id** — answered by ruling 4. The Jaccard is computed over `elements[].id`, trimmed and case-folded, in the rubric, in `tools/eval-stability.ts` and in design §10, and the stability table above was recomputed on that basis: all eight pairs clear the 0.8 floor and the three failures left are on the count bound alone.",
  },
  {
    area: "tools/eval-report.ts and build/evals/results.json do not exist",
    text: "- **tools/eval-report.ts and build/evals/results.json do not exist** — answered. Both exist; this document is generated from that file by `node tools/eval-report.ts`, and `tools/eval-report.test.ts` pins the 80% rule and the must flags. The same fact retires the closing clause of the **Acceptance note** entry, which says the threshold procedure \"cannot be completed while the report generator named in that procedure is missing\". The acceptance note itself is still to be written.",
  },
];

/** The `critic.missing[].area` substring the half-answered paragraph is about. */
const STALE_CRITIC_HALF_ANSWERED_AREA = "c1-missing-inputs-asked (must)";

/** The half-answered paragraph, gated on the entry it is about like the bullets above. */
const STALE_CRITIC_HALF_ANSWERED =
  "One entry is half-answered: **c1-missing-inputs-asked (must) — prompts 1 and 5, applied inconsistently** asks for a ruling on the planted-gap clause, and ruling 3 gives it, but no run was re-judged, so the four scores of 2 the entry names still stand in the tables above. The section on pre-ruling scores at the head of this document is the current statement of them.";

/** The `critic.missing[].area` substring of the pair-tally entry the closing paragraph is about. */
const STALE_CRITIC_PAIR_TALLY_AREA = "Overall pair tally";

/**
 * One (prompt, model capability) pair as the Overall table reads it: its two
 * runs and its stability entry, whether each passes, and whether any of the
 * three is unverified. A missing run or stability entry counts as not passing.
 */
interface PairOutcome {
  r1: RunResult | undefined; r2: RunResult | undefined; s: StabilityResult | undefined;
  p1: boolean; p2: boolean; st: boolean; unver: boolean;
}

/** The outcome of one pair, computed once for the Overall table and for `pairOutcomes`. */
function pairOutcome(results: EvalResults, p: number, c: string): PairOutcome {
  const r1 = runOf(results, p, c, 1);
  const r2 = runOf(results, p, c, 2);
  const s = stabilityFor(results, p, c);
  const rubric = rubricOf(results);
  const p1 = r1 ? summarizeRun(p, r1.scores, rubric).pass : false;
  const p2 = r2 ? summarizeRun(p, r2.scores, rubric).pass : false;
  const st = s ? s.pass : false;
  const unver = (r1?.unverified ?? false) || (r2?.unverified ?? false) || (s?.unverified ?? false);
  return { r1, r2, s, p1, p2, st, unver };
}

/**
 * The Overall table's own arithmetic, returned as data: which (prompt, model
 * capability) pairs the table marks `pass`, and which of those contain a run the
 * c1 roster still names — the split the closing paragraph's second sentence
 * states. Computed by the same rule that renders the table (both runs pass and
 * stability passes; an unverified run or pair is neither) so the paragraph's
 * counts move with the table rather than drifting from it.
 */
function pairOutcomes(results: EvalResults, parts: StaleScoreParts): { total: number; passing: string[]; superseded: string[] } {
  const prompts = [...new Set(results.runs.map((r) => r.prompt))].sort((a, b) => a - b);
  const capabilities = [...new Set(results.runs.map((r) => r.model_capability))].sort();
  const stale = new Set(parts.c1);
  const passing: string[] = [];
  const superseded: string[] = [];
  for (const p of prompts) {
    for (const c of capabilities) {
      const o = pairOutcome(results, p, c);
      if (o.unver || !(o.p1 && o.p2 && o.st)) continue;
      const label = `prompt ${p} ${c}`;
      passing.push(label);
      if ([o.r1, o.r2].some((r) => r !== undefined && stale.has(runLabel(r)))) superseded.push(label);
    }
  }
  return { total: prompts.length * capabilities.length, passing, superseded };
}

/**
 * The closing paragraph reconciling the pair tallies this document carries. Its
 * subject is the critic's own pair-tally entry — "only 2 of 8 (prompt, model)
 * pairs pass" — so it is gated on that entry rather than on the answered
 * bullets, which are about other entries entirely. Within the paragraph, the
 * sentences about that entry and about the stability table hold whatever the
 * scores say and are written out flat; every clause that states what the c1 and
 * c3 scores are holds only while those scores stand, so it is chosen by the same
 * `staleScoreParts` the pre-ruling scores section is built from. A paragraph
 * printed after those runs are re-judged therefore says that they have been,
 * rather than repeating that no re-judging has happened: a caveat that outlives
 * its own truth misleads as much as one that vanishes while still true, and
 * acceptance evidence must do neither.
 */
export function staleCriticClosing(results: EvalResults): string {
  const parts = staleScoreParts(results)
  const sentences = [
    "The pair tallies in this document are not answers to one question: each counts something different.",
    "The critic's first entry says \"only 2 of 8 (prompt, model) pairs pass, and both are prompt 6\": that was computed on the pre-ruling-4 name-basis Jaccard, which failed prompt 1 opus and prompt 5 opus on element wording alone.",
    ...c1TallySentences(results, parts),
    ...archivedWorldSentences(results, parts),
  ];
  if (parts.c3Unverified.length > 0) sentences.push(unverifiedRosterSentence(parts.c3Unverified, "c3", 8, false));
  sentences.push(rejudgingSentence(parts));
  return sentences.join(" ");
}

/** The closing paragraph's sentences on the Overall table's pass count, chosen by how much of the c1 roster still holds its pre-ruling score. */
function c1TallySentences(results: EvalResults, parts: StaleScoreParts): string[] {
  if (parts.c1.length === STALE_C1_RUNS.length) return passCountSentences(results, parts);
  if (parts.c1.length === 0 && parts.c1Unverified.length === 0) {
    return [
      "The Overall table's pass count is the count on current-rubric c1 scores: every c1 score ruling 3 governs has since been re-judged, so no pair the table marks `pass` rests on the superseded reading of c1.",
    ];
  }
  if (parts.c1Unverified.length === 0) {
    // Part of the roster re-judged and part of it not: the table's count is
    // neither tally, and naming a number for it would state a count this
    // document does not show.
    return [neitherTallySentence(parts.c1, "")];
  }
  // Some roster run has no judged c1 score to read (amended 2026-09-29). An
  // empty stale list used to reach the branch above that says every score was
  // re-judged, and an unjudged run's pair was counted among those resting on
  // current-rubric scores. Such a run is neither: it is named as unverified, and
  // its pair is counted in neither tally.
  const sentences: string[] = [];
  if (parts.c1.length > 0) sentences.push(neitherTallySentence(parts.c1, " or among the unverified runs named next"));
  sentences.push(unverifiedRosterSentence(parts.c1Unverified, "c1", 3, true));
  return sentences;
}

/** The pass count and its split, printed while nothing ruling 3 governs has been re-judged. */
function passCountSentences(results: EvalResults, parts: StaleScoreParts): string[] {
  // Nothing ruling 3 governs has been re-judged. The counts below are computed
  // by pairOutcomes — the same arithmetic that renders the Overall table —
  // rather than asserted (amended 2026-09-12, closing the second finding the
  // Task 32 gate left open: the hard-coded 4 and 2 were gated only on this
  // branch, so a hand edit to stability[] or a re-judged must left a false
  // count printed above the table that contradicted it).
  const outcomes = pairOutcomes(results, parts)
  const sentences = [
    `The Overall table marks **${outcomes.passing.length}** of ${outcomes.total} pairs pass${outcomes.passing.length > 0 ? ` — ${andList(outcomes.passing)}` : ""}.`,
  ];
  if (outcomes.passing.length > 0) {
    const resting = outcomes.passing.filter((x) => !outcomes.superseded.includes(x))
    sentences.push(
      `Of those, ${resting.length === 1 ? `${resting[0]} rests` : `${andList(resting)} rest`} on c1 scores the current rubric produced${outcomes.superseded.length > 0 ? `, and ${andList(outcomes.superseded)} on the pre-ruling reading the c1 bullet names` : ""}.`,
    )
  }
  return sentences;
}

/**
 * The sentence for a pass count that is neither tally: `runs` still hold the
 * pre-ruling c1 score. `restClause` extends "the pairs with no run in that
 * list" when unverified runs are named after it.
 */
function neitherTallySentence(runs: string[], restClause: string): string {
  const one = runs.length === 1;
  return `The Overall table's pass count is neither tally: ${andList(runs)} still hold${one ? "s" : ""} the c1 score awarded before ruling 3, so the pair${one ? "" : "s"} ${one ? "that run belongs" : "those runs belong"} to ${one ? "is" : "are"} counted in it on a superseded reading, while the pairs with no run in that list${restClause} rest on c1 scores the current rubric produced.`;
}

/** The stability and c5 sentences, each printed while this file still shows the archived scores it is about. */
function archivedWorldSentences(results: EvalResults, parts: StaleScoreParts): string[] {
  // Both sentences describe the archived world, so both are gated on this file
  // still showing it (amended 2026-09-12, closing the third finding the Task 32
  // gate left open): the stability sentence prints while any pre-ruling score
  // still stands, and the c5 sentence prints only while the runs it names still
  // hold c5 = 1 in this file, so a re-judging takes each out with the scores it
  // was about instead of asserting a verdict the tables no longer show.
  const sentences: string[] = [];
  if (parts.c1.length > 0 || parts.c3.length > 0 || parts.ruling9) {
    sentences.push(
      "The critic's per-pair reasons are read against the stability table above: prompt 1 opus and prompt 5 opus no longer fail stability, and prompt 1 sonnet, prompt 5 sonnet and prompt 7 sonnet still fail it on the count bound rather than on the Jaccard the critic measured.",
    )
  }
  const c5Holding = STALE_C5_RUNS
    .filter((k) => judgedScore(results, k, "c5-provisional-rescore") === 1)
    .map(runLabel);
  if (c5Holding.length > 0) {
    sentences.push(
      `Its c5 verdicts stand — ${andList(c5Holding)} still score${c5Holding.length === 1 ? "s" : ""} c5 = 1 in the tables above.`,
    )
  }
  return sentences;
}

/** The last sentence: whether any pair count in this document is a count after a re-judging on rulings 3 and 8. */
function rejudgingSentence(parts: StaleScoreParts): string {
  const pending = [...(parts.c1.length > 0 ? [3] : []), ...(parts.c3.length > 0 ? [8] : [])];
  // A ruling with a roster run that has no judged score is not re-judged
  // (amended 2026-09-29): an empty `pending` used to print the sentence that
  // every score both rulings govern had been re-judged.
  const unknown = [...(parts.c1Unverified.length > 0 ? [3] : []), ...(parts.c3Unverified.length > 0 ? [8] : [])];
  if (pending.length > 0) {
    return `No pair count in this document is the count after a re-judging on ${rulingList(pending)}: the runs the ${pending.length === 1 ? "bullet" : "bullets"} at the head of this document name${pending.length === 1 ? "s" : ""} still hold their pre-ruling scores.`;
  }
  if (unknown.length === 0) {
    return "Every score rulings 3 and 8 govern has since been re-judged, so the pair counts in this document are counts on the current rubric.";
  }
  return `No pair count in this document is shown to be the count on the current rubric: the runs named above as unverified have no judged score on the ${unknown.length === 1 ? "criterion" : "criteria"} ${rulingList(unknown)} govern${unknown.length === 1 ? "s" : ""}.`;
}

/**
 * The sentence naming roster runs with no judged score on the criterion a ruling
 * governs: missing from the file, unjudged, or judged without that criterion.
 * For c1, whose scores decide pairs, it also says their pairs are counted in
 * neither tally the closing paragraph states.
 */
function unverifiedRosterSentence(runs: string[], criterion: string, ruling: number, tallies: boolean): string {
  const one = runs.length === 1;
  const tally = tallies
    ? `, and the pair${one ? "" : "s"} ${one ? "it belongs" : "they belong"} to ${one ? "is" : "are"} counted neither on the superseded reading nor among the pairs resting on ${criterion} scores the current rubric produced`
    : "";
  return `The run${one ? "" : "s"} ${andList(runs)} ${one ? "is" : "are"} unverified for ${criterion}: this results file holds no judged ${criterion} score for ${one ? "it" : "them"} — missing from the file, never judged, or judged without a ${criterion} entry — so whether ${one ? "it still holds" : "they still hold"} the score awarded before ruling ${ruling} is unknown${tally}.`;
}

export interface RunScore { id: string; score: number; evidence: string }
export interface RunResult {
  prompt: number; model_capability: string; run: number; dir: string;
  scores: RunScore[]; total: number; max: number; musts_at_2: number; notes: string;
  /** True when the judge never returned: the run is unjudged, neither a pass nor a measured failure. */
  unverified?: boolean;
}
export interface StabilityResult {
  prompt: number; model_capability: string;
  jaccard: number; maxRows: number; countDiffs: Record<string, number>; bound: number; pass: boolean;
  /** True when the stability agent never returned: the two runs were never compared. */
  unverified?: boolean;
  /** Of the element ids both runs carry, how many agree on role and boundary (eval-stability.ts). */
  typing?: { shared: number; agreeing: number; pass: boolean };
}
export interface CriticResult { missing: { area: string; detail: string }[]; blocking_candidates: string[] }
/** A judge, stability pair, or critic whose agent never returned (plan reference §C). */
export interface UnverifiedUnit { unit: string; detail: string }
/**
 * One criterion re-judged on a set of runs after the evaluation wrote the file,
 * first on 2026-09-15: which criterion, when, how many runs, by which script,
 * under which model table, why, and how many of its judges never returned.
 */
export interface Rejudging {
  criterion: string; date: string; runs: number; by: string;
  models?: Record<string, string>; reason: string; unverified: number;
}
export interface EvalResults {
  /** The rubric version the runs were judged under (evals/rubric.md); absent means 1. */
  rubric?: number;
  /** The effective model table the judging ran under: model capability -> model name (first in results.json since 2026-09-12). */
  models: Record<string, string>;
  runs: RunResult[]; stability: StabilityResult[]; critic: CriticResult;
  unverified?: UnverifiedUnit[];
  /** The criterion-scoped re-judgings applied since the evaluation ran; absent on a fresh file. */
  rejudged?: Rejudging[];
}

export interface RunSummary { total: number; max: number; mustsAt2: number; mustCount: number; pass: boolean }

/** The criteria a prompt is scored on under a rubric version: those it applies to that the version had introduced. */
export function criteriaFor(prompt: number, rubric = 1): Criterion[] {
  return CRITERIA.filter((c) => c.prompts.includes(prompt) && (c.rubric ?? 1) <= rubric);
}

/** The rubric version a results file was judged under: 1 when it records none. */
function rubricOf(results: EvalResults): number {
  return results.rubric ?? 1;
}

/** Totals from the per-criterion scores; a criterion the judge omitted scores 0. */
export function summarizeRun(prompt: number, scores: RunScore[], rubric = 1): RunSummary {
  const applicable = criteriaFor(prompt, rubric);
  const byId = new Map(scores.map((s) => [s.id, s.score]));
  let total = 0;
  let mustsAt2 = 0;
  let mustCount = 0;
  for (const c of applicable) {
    const score = byId.get(c.id) ?? 0;
    total += score;
    if (c.must) {
      mustCount++;
      if (score === 2) mustsAt2++;
    }
  }
  const max = 2 * applicable.length;
  // total >= 0.8 * max in integer arithmetic: 5 * total >= 4 * max.
  const pass = mustsAt2 === mustCount && 5 * total >= 4 * max;
  return { total, max, mustsAt2, mustCount, pass };
}

function runOf(results: EvalResults, prompt: number, capability: string, run: number): RunResult | undefined {
  return results.runs.find((r) => r.prompt === prompt && r.model_capability === capability && r.run === run);
}

/**
 * A roster run's score on one criterion as a judge returned it, or undefined
 * when there is none to read: the run is missing from this results file, its
 * judge never returned, or its scores carry no entry for that criterion. Every
 * roster reading goes through here, so undefined is always the third state —
 * neither the stale score nor a re-judged one — and never read as either.
 */
function judgedScore(results: EvalResults, k: RosterKey, id: string): number | undefined {
  const run = runOf(results, k.prompt, k.model_capability, k.run);
  if (run === undefined || run.unverified) return undefined;
  return run.scores.find((s) => s.id === id)?.score;
}

/**
 * Which parts of the pre-ruling scores section still describe this results
 * file, named run by run: `c1` and `c3` are the runs each part still covers,
 * in `runLabel` form, and are empty when the part no longer applies at all.
 * `c1Unverified` and `c3Unverified` are the roster runs whose score on that
 * criterion cannot be read at all (amended 2026-09-29): each is in neither the
 * stale list nor the re-judged remainder, so a caller that reads an empty stale
 * list as "re-judged" checks these first.
 */
export interface StaleScoreParts { c1: string[]; c3: string[]; ruling9: boolean; c1Unverified: string[]; c3Unverified: string[] }

/**
 * Each part of the pre-ruling scores section on its own condition: `c1` those
 * of the STALE_C1_RUNS roster that still hold `c1-missing-inputs-asked` at 2,
 * `c3` those of the STALE_C3_RUNS roster that still hold a stored
 * `c3-chain-completeness` below 2 on a run whose judge returned, and
 * `ruling9` while any prompt-6 run's stored scores still carry a `c5` entry, the
 * mark of a judgment made under the CRITERIA ruling 9 superseded. The parts are
 * returned separately rather than ANDed, and each names its own runs rather than
 * reporting one flag over all of them, because re-judging c1 alone would
 * otherwise take the still-true c3 bullet and the still-true ruling-9 sentence
 * out of the document with it, and re-judging one of the four c1 runs would take
 * the caveat on the other three with it. Acceptance evidence that loses a true
 * caveat fails open. A run whose judge never returned is named by neither part:
 * it carries no score, and a missing score read as 0 would state a measured
 * pre-ruling result for a run this document prints as UNVERIFIED. It is named
 * instead in `c1Unverified` or `c3Unverified`, with a run missing from the file
 * and one scored without that criterion.
 */
export function staleScoreParts(results: EvalResults): StaleScoreParts {
  // A run whose judge never returned is named by neither part (amended 2026-09-12,
  // closing the first finding the Task 32 gate left open): it carries no score, and
  // reading its missing c1 as cured would print "every c1 score ruling 3 governs has
  // since been re-judged" above a table printing UNVERIFIED for those very runs — a
  // check that did not run reported as a pass. The c3 filter below already worked
  // this way; c1 now matches it.
  //
  // (amended 2026-09-29: leaving such a run out of `c1` was only half the fix. The
  // closing paragraph read an empty `c1` as cured, so with all four roster runs
  // unjudged it still printed that sentence. A run with no judged score is now
  // returned in its own list, and every reader of an empty stale list checks it.)
  const c1Unverified = STALE_C1_RUNS
    .filter((k) => judgedScore(results, k, "c1-missing-inputs-asked") === undefined)
    .map(runLabel);
  const c1 = STALE_C1_RUNS
    .filter((k) => judgedScore(results, k, "c1-missing-inputs-asked") === 2)
    .map(runLabel);
  const c3Unverified = STALE_C3_RUNS
    .filter((k) => judgedScore(results, k, "c3-chain-completeness") === undefined)
    .map(runLabel);
  const c3 = STALE_C3_RUNS
    .filter((k) => {
      const score = judgedScore(results, k, "c3-chain-completeness");
      return score !== undefined && score < 2;
    })
    .map(runLabel);
  const ruling9 = results.runs.some((r) => r.prompt === 6 && r.scores.some((s) => s.id === "c5-provisional-rescore"));
  return { c1, c3, ruling9, c1Unverified, c3Unverified };
}

/** One roster whose entries name runs this results file does not carry. */
export interface UnreachableRoster { roster: string; criterion: string; entries: number; labels: string[] }

/**
 * Rosters that name no run in this results file.
 *
 * The three STALE_* rosters are hand-written lists of runs, keyed on the
 * `model_capability` labels the first sixteen runs carried (`opus`, `sonnet`).
 * A results file keyed on the capability axis that replaced them (`high`,
 * `medium`) matches none of those entries, and `staleScoreParts` then returns
 * empty lists — which every caller above reads as "those scores have since been
 * re-judged". That reading is sound only when the roster was checked and came
 * back clear. When the roster could not be checked at all, the same empty list
 * means the opposite, and the document would assert a clearance nothing
 * measured: the failure mode the completeness critic named on 2026-09-15, when
 * two runs held the very c1 score the c1 roster exists to flag.
 *
 * So a roster with entries that reaches no run is reported rather than read as
 * clear. A checker that could not run is unverified, never a pass.
 */
export function unreachableRosters(results: EvalResults): UnreachableRoster[] {
  const out: UnreachableRoster[] = [];
  for (const r of ROSTERS) {
    if (r.keys.length === 0) continue;
    const reached = r.keys.filter((k) => runOf(results, k.prompt, k.model_capability, k.run) !== undefined);
    if (reached.length === 0) {
      out.push({
        roster: r.roster,
        criterion: r.criterion,
        entries: r.keys.length,
        labels: [...new Set(r.keys.map((k) => k.model_capability))].sort(),
      });
    }
  }
  return out;
}

/** The runs of one reachable roster that this results file holds no judged score for. */
export interface UnscoredRosterRuns { roster: string; criterion: string; runs: string[] }

/**
 * Runs named by a roster that reaches at least one run, and for which this
 * results file holds no judged score on the roster's criterion: the run is
 * missing, its judge never returned, or its scores carry no entry for it
 * (added 2026-09-29). `unreachableRosters` reports a roster only when it reaches
 * none of its runs, so a roster reached by three runs and unjudged on the fourth
 * passed as checked, and the fourth dropped out of the section at the head of
 * the document with nothing saying why. A roster that reaches no run is left to
 * `unreachableRosters`, which reports it whole.
 */
export function unscoredRosterRuns(results: EvalResults): UnscoredRosterRuns[] {
  const out: UnscoredRosterRuns[] = [];
  for (const r of ROSTERS) {
    if (!r.keys.some((k) => runOf(results, k.prompt, k.model_capability, k.run) !== undefined)) continue;
    const runs = r.keys.filter((k) => judgedScore(results, k, r.criterion) === undefined).map(runLabel);
    if (runs.length > 0) out.push({ roster: r.roster, criterion: r.criterion, runs });
  }
  return out;
}

/** Which parts of the stale-critic subsection still describe this results file. */
export interface StaleCriticParts { answered: string[]; halfAnswered: boolean; pairTally: boolean }

/**
 * The answered-entry bullets whose critic entry is still in
 * `results.critic.missing`, matched on its area text, whether the half-answered
 * c1 entry is still there, and whether the pair-tally entry the closing
 * paragraph reconciles is still there. Re-run the critic and each part goes with
 * the entry it is about rather than every part going with the first one.
 */
export function staleCriticParts(results: EvalResults): StaleCriticParts {
  const areas = results.critic.missing.map((m) => m.area);
  return {
    answered: STALE_CRITIC_ANSWERED.filter((e) => areas.some((a) => a.includes(e.area))).map((e) => e.text),
    halfAnswered: areas.some((a) => a.includes(STALE_CRITIC_HALF_ANSWERED_AREA)),
    pairTally: areas.some((a) => a.includes(STALE_CRITIC_PAIR_TALLY_AREA)),
  };
}

function yesNo(b: boolean): string {
  return b ? "pass" : "FAIL";
}

/**
 * A stability number for the table, always to three decimals, truncated toward
 * zero rather than rounded: a value below a threshold therefore never renders at
 * the threshold, where a rounded Jaccard of 0.7996 would print `0.800` beside its
 * own FAIL. A column that mixes `1` with `0.778` reads as two different
 * measurements, and a Jaccard printed as `1` hides how close it sits to the 0.8
 * floor.
 */
function fmt(n: number): string {
  return (Math.trunc(n * 1000) / 1000).toFixed(3);
}

/**
 * An agent's string as one markdown line, with repository-absolute paths made
 * relative. Every string this document quotes back — a judge's evidence and
 * notes, the critic's entries, an unverified unit's detail — goes through here.
 * Agents routinely return several paragraphs; interpolated raw into a
 * bullet, everything after the first blank line leaves the list and reads as
 * this document's own prose, with no run to attribute it to, and the blank line
 * breaks the bullet list in two. Judges also quote paths as they read them,
 * absolute under this machine's checkout; the generated document is committed
 * and read from wherever the repository sits, so the root prefix comes off and
 * the paths print relative to the repository root. The bare root becomes `.`
 * only where the path ends — at the end of the string, or before whitespace or
 * punctuation — so a sibling checkout such as `<root>-research/x` keeps its own
 * name instead of reading as `.-research/x`.
 */
function oneLine(s: string): string {
  return s.replace(/\s*\n\s*/g, " ").split(`${ROOT}/`).join("").replace(ROOT_AT_BOUNDARY, ".").trim();
}

function stabilityFor(results: EvalResults, prompt: number, capability: string): StabilityResult | undefined {
  return results.stability.find((s) => s.prompt === prompt && s.model_capability === capability);
}

/** The document's title and how its header names the results file. */
interface ReportOptions { title: string; resultsLabel: string }

/** The options the v1 document was generated with, and the CLI's defaults. */
const V1_OPTIONS: ReportOptions = { title: "Eval results, v1", resultsLabel: "build/evals/results.json" };

export function renderReport(results: EvalResults, options: ReportOptions = V1_OPTIONS): string {
  const prompts = [...new Set(results.runs.map((r) => r.prompt))].sort((a, b) => a - b);
  const capabilities = [...new Set(results.runs.map((r) => r.model_capability))].sort();
  return [
    `# ${options.title}`,
    "",
    `Generated by \`node tools/eval-report.ts\` from \`${options.resultsLabel}\`. Scores follow \`skills/fmea-software/evals/rubric.md\`; every criterion is 0 to 2. A run passes when every must scores 2 and the total is at least 80% of the maximum. A (prompt, model capability) pair passes when both runs pass and the stability check passes.`,
    "",
    ...preRulingScoresSection(results),
    ...scoresPerPromptSection(results, prompts),
    ...stabilitySection(results, prompts, capabilities),
    ...overallSection(results, prompts, capabilities),
    ...unverifiedUnitsSection(results),
    ...unevaluatedChecksSection(results),
    ...criticSection(results),
  ].join("\n");
}

/** `## Scores recorded before …`, or no lines when no ruling's scores are stale. */
function preRulingScoresSection(results: EvalResults): string[] {
  // Part by part, each on its own flag, and the c1 and c3 bullets run by run
  // within their part. A section gated on all three at once would drop a caveat
  // that is still true the moment a neighbouring hole is filled, and a bullet
  // gated on all four of its runs would drop it the moment one run is
  // re-judged; acceptance evidence that loses a true caveat fails open.
  const scoreParts = staleScoreParts(results);
  const staleRulings = [
    ...(scoreParts.c1.length > 0 ? [3] : []),
    ...(scoreParts.c3.length > 0 ? [8] : []),
    ...(scoreParts.ruling9 ? [9] : []),
  ];
  if (staleRulings.length === 0) return [];
  const lines: string[] = [];
  const bullets: string[] = [];
  if (scoreParts.c1.length > 0) bullets.push(staleScoresC1(scoreParts.c1));
  if (scoreParts.c3.length > 0) bullets.push(staleScoresC3(scoreParts.c3));
  const blocks: string[][] = [];
  if (bullets.length > 0) blocks.push(bullets);
  if (scoreParts.ruling9) blocks.push([STALE_SCORES_RULING9]);
  if (scoreParts.c1.length > 0) blocks.push([STALE_SCORES_CLOSING]);
  lines.push(staleScoresHeading(staleRulings));
  lines.push("");
  lines.push(staleScoresIntro(staleRulings));
  for (const block of blocks) {
    lines.push("");
    lines.push(...block);
  }
  lines.push("");
  return lines;
}

/** `## Scores per prompt`: one subsection per prompt. */
function scoresPerPromptSection(results: EvalResults, prompts: number[]): string[] {
  const lines: string[] = [];
  lines.push("## Scores per prompt");
  lines.push("");
  for (const p of prompts) lines.push(...promptScores(results, p));
  return lines;
}

/** One prompt's subsection: its table, then the criteria below 2 and the judge notes when there are any. */
function promptScores(results: EvalResults, p: number): string[] {
  const lines: string[] = [];
  lines.push(`### Prompt ${p}: ${PROMPT_TITLES[p] ?? ""}`.trimEnd());
  lines.push("");
  lines.push("| Model capability | Run | Total / max | Musts at 2 | Pass |");
  lines.push("|---|---|---|---|---|");
  const runs = results.runs
    .filter((r) => r.prompt === p)
    .sort((a, b) => a.model_capability.localeCompare(b.model_capability) || a.run - b.run);
  for (const r of runs) {
    const s = summarizeRun(r.prompt, r.scores, rubricOf(results));
    // A run whose judge never returned is not a scored 0: it is a hole in the evidence.
    const verdict = r.unverified ? "UNVERIFIED" : yesNo(s.pass);
    lines.push(`| ${r.model_capability} | ${r.run} | ${s.total} / ${s.max} | ${s.mustsAt2} / ${s.mustCount} | ${verdict} |`);
  }
  lines.push("");
  // Only the criteria this prompt is scored on: results.json still holds a c5
  // score on every prompt-6 run, judged before ruling 9 took c5 out of prompt 6,
  // and summarizeRun ignores it. A criterion the run was not scored on has no
  // business in a list of the criteria it scored below 2.
  const applicable = new Set(criteriaFor(p, rubricOf(results)).map((c) => c.id));
  const belowTwo = runs.flatMap((r) =>
    r.scores
      .filter((sc) => applicable.has(sc.id) && sc.score < 2)
      .map((sc) => `- ${r.model_capability} run ${r.run}, ${sc.id} = ${sc.score}: ${oneLine(sc.evidence)}`),
  );
  if (belowTwo.length > 0) {
    lines.push("Criteria below 2:");
    lines.push("");
    lines.push(...belowTwo);
    lines.push("");
  }
  const noted = runs.filter((r) => (r.notes ?? "").trim() !== "");
  if (noted.length > 0) {
    lines.push("Judge notes:");
    lines.push("");
    lines.push(...noted.map((r) => `- ${r.model_capability} run ${r.run}: ${oneLine(r.notes)}`));
    lines.push("");
  }
  return lines;
}

/** `## Stability between runs`: one row per (prompt, model capability) pair. */
function stabilitySection(results: EvalResults, prompts: number[], capabilities: string[]): string[] {
  // The Typing column appears only when some entry carries typing, so a results
  // file written before eval-stability.ts reported it renders as it always did.
  const typed = results.stability.some((s) => s.typing !== undefined);
  const lines: string[] = [];
  lines.push("## Stability between runs");
  lines.push("");
  lines.push(`| Prompt | Model capability | Jaccard | Max rows | Bound | Count diffs |${typingCell(typed, "Typing")} Pass |`);
  lines.push(`|---|---|---|---|---|---|${typed ? "---|" : ""}---|`);
  for (const p of prompts) {
    for (const m of capabilities) {
      const s = stabilityFor(results, p, m);
      if (!s) {
        lines.push(`| ${p} | ${m} | — | — | — | — |${typingCell(typed, "—")} FAIL (no result) |`);
        continue;
      }
      const diffs = Object.entries(s.countDiffs).map(([k, v]) => `${k}: ${v}`).join(", ");
      const verdict = s.unverified ? "UNVERIFIED" : yesNo(s.pass);
      lines.push(`| ${p} | ${m} | ${fmt(s.jaccard)} | ${s.maxRows} | ${fmt(s.bound)} | ${diffs} |${typingCell(typed, typingText(s))} ${verdict} |`);
    }
  }
  lines.push("");
  return lines;
}

/** The Typing column's cell, with its leading space and closing bar, or nothing when the table has no such column. */
function typingCell(typed: boolean, text: string): string {
  return typed ? ` ${text} |` : "";
}

/** A stability entry's typing as `agreeing/shared pass`, or a dash when the entry carries none. */
function typingText(s: StabilityResult): string {
  return s.typing === undefined ? "—" : `${s.typing.agreeing}/${s.typing.shared} ${yesNo(s.typing.pass)}`;
}

/** `## Overall per prompt and model capability`: one row per pair. */
function overallSection(results: EvalResults, prompts: number[], capabilities: string[]): string[] {
  const lines: string[] = [];
  lines.push("## Overall per prompt and model capability");
  lines.push("");
  lines.push("| Prompt | Model capability | Run 1 | Run 2 | Stability | Pass |");
  lines.push("|---|---|---|---|---|---|");
  for (const p of prompts) {
    for (const m of capabilities) lines.push(overallRow(results, p, m));
  }
  lines.push("");
  return lines;
}

/** One row of the Overall table, from the pair's outcome. */
function overallRow(results: EvalResults, p: number, m: string): string {
  const o = pairOutcome(results, p, m);
  const c1 = o.r1?.unverified ? "UNVERIFIED" : yesNo(o.p1);
  const c2 = o.r2?.unverified ? "UNVERIFIED" : yesNo(o.p2);
  const cs = o.s?.unverified ? "UNVERIFIED" : yesNo(o.st);
  return `| ${p} | ${m} | ${c1} | ${c2} | ${cs} | ${o.unver ? "UNVERIFIED" : yesNo(o.p1 && o.p2 && o.st)} |`;
}

/** `## Unverified units`: every unit whose agent never returned, or `None.` */
function unverifiedUnitsSection(results: EvalResults): string[] {
  const lines: string[] = [];
  lines.push("## Unverified units");
  lines.push("");
  lines.push("Judges, stability pairs, or the critic whose agent never returned after three attempts. Each is a hole in the evidence, never a pass; the acceptance note rules on each one.");
  lines.push("");
  const unverifiedUnits = results.unverified ?? [];
  if (unverifiedUnits.length === 0) lines.push("None.");
  for (const u of unverifiedUnits) lines.push(`- ${oneLine(u.unit)}: ${oneLine(u.detail)}`);
  lines.push("");
  return lines;
}

/** `## Checks that could not be evaluated`, or no lines when every roster was checked. */
function unevaluatedChecksSection(results: EvalResults): string[] {
  const unreachable = unreachableRosters(results);
  const unscored = unscoredRosterRuns(results);
  if (unreachable.length === 0 && unscored.length === 0) return [];
  const lines: string[] = [];
  lines.push("## Checks that could not be evaluated");
  lines.push("");
  if (unreachable.length > 0) {
    lines.push(
      "Pre-ruling score rosters in `tools/eval-report.ts` that name no run in this results file. Each is a hand-written list keyed on the `model_capability` labels of an earlier round, so it matched nothing here and its section above is absent because the check could not run \u2014 not because the check came back clear. A roster in this state states nothing about the scores this document carries; the acceptance note rules on each one.",
    );
    lines.push("");
    for (const r of unreachable) {
      lines.push(
        `- \`${r.roster}\` (${r.criterion}): ${r.entries} entries, all keyed on model capability ${r.labels.map((l) => `\`${l}\``).join(" and ")}, none matching a run in this file.`,
      );
    }
    lines.push("");
  }
  if (unscored.length > 0) {
    lines.push(
      "Runs named by a pre-ruling score roster in `tools/eval-report.ts` that this results file holds no judged score for on the roster's criterion: each is missing from the file, was never judged, or was judged without that criterion. This document's passages on pre-ruling scores leave such a run out because there was no score to check, not because the check came back clear; the acceptance note rules on each one.",
    );
    lines.push("");
    for (const u of unscored) lines.push(`- \`${u.roster}\` (${u.criterion}): ${andList(u.runs)}.`);
    lines.push("");
  }
  return lines;
}

/** `## Completeness critic`: its four subsections in order. */
function criticSection(results: EvalResults): string[] {
  return [
    "## Completeness critic",
    "",
    ...criticPredatesSubsection(results),
    ...criticRanBeforeSubsection(results),
    ...criticMissingSubsection(results),
    ...criticBlockingSubsection(results),
  ];
}

/** `### What the critic's lists predate`, or no lines when none of its parts still applies. */
function criticPredatesSubsection(results: EvalResults): string[] {
  // Each answered-entry bullet prints while results.critic.missing still holds
  // the entry it answers, the half-answered paragraph while its own entry is
  // there, and the closing paragraph while the pair-tally entry it reconciles is
  // there; that paragraph's own clauses about the c1 and c3 scores come from the
  // same scoreParts as the section at the head of the document, so it states
  // what those scores are rather than what they were when it was written. The
  // intro prints while any of them does, so the reader is never left a paragraph
  // about the critic with no sentence saying the critic predates the rulings. One
  // predicate over the lot would retire a part whose entry still stands the
  // moment a neighbouring entry was fixed.
  const criticParts = staleCriticParts(results);
  if (criticParts.answered.length === 0 && !criticParts.halfAnswered && !criticParts.pairTally) return [];
  const lines: string[] = [];
  lines.push("### What the critic's lists predate");
  lines.push("");
  lines.push(STALE_CRITIC_INTRO);
  lines.push("");
  if (criticParts.answered.length > 0) {
    lines.push(STALE_CRITIC_ANSWERED_LEAD);
    lines.push("");
    lines.push(...criticParts.answered);
    lines.push("");
  }
  if (criticParts.halfAnswered) {
    lines.push(STALE_CRITIC_HALF_ANSWERED);
    lines.push("");
  }
  if (criticParts.pairTally) {
    lines.push(staleCriticClosing(results));
    lines.push("");
  }
  return lines;
}

/** `### What the critic ran before`: one paragraph per re-judging, or no lines when there is none. */
function criticRanBeforeSubsection(results: EvalResults): string[] {
  // The critic runs once, inside tools/workflows/evals.js, and a criterion
  // re-judged afterwards is recorded in results.rejudged (added 2026-09-29). The
  // subsection above is keyed to the archived round's critic entries and does not
  // print for a later file, so without this one the critic's lists and the judge
  // notes quoting the old scores stood under tables that no longer carry them.
  // It is gated on the field alone: a fresh evaluation writes results.json
  // without it, which takes the subsection out with the re-judged scores.
  const rejudged = results.rejudged ?? [];
  if (rejudged.length === 0) return [];
  const lines: string[] = [];
  lines.push("### What the critic ran before");
  lines.push("");
  for (const e of rejudged) {
    lines.push(
      `The critic ran before the ${oneLine(e.date)} re-judging of ${oneLine(e.criterion)} by ${oneLine(e.by)} (${e.runs} run${e.runs === 1 ? "" : "s"}, ${e.unverified} unverified), so its entries and any judge note quoting a pre-re-judging score for that criterion describe scores the tables above no longer carry; the acceptance note rules on each entry.`,
    );
    lines.push("");
  }
  return lines;
}

/** `### Missing`: the critic's missing entries, or `None.` */
function criticMissingSubsection(results: EvalResults): string[] {
  const lines: string[] = [];
  lines.push("### Missing");
  lines.push("");
  if (results.critic.missing.length === 0) lines.push("None.");
  for (const m of results.critic.missing) lines.push(`- ${oneLine(m.area)}: ${oneLine(m.detail)}`);
  lines.push("");
  return lines;
}

/** `### Blocking candidates`: the critic's blocking candidates, or `None.` */
function criticBlockingSubsection(results: EvalResults): string[] {
  const lines: string[] = [];
  lines.push("### Blocking candidates");
  lines.push("");
  if (results.critic.blocking_candidates.length === 0) lines.push("None.");
  for (const b of results.critic.blocking_candidates) lines.push(`- ${oneLine(b)}`);
  lines.push("");
  return lines;
}

function fail(code: "USAGE" | "IO_READ", message: string): void {
  // Runs of whitespace collapse to one space, the transformation formatError
  // applies in skills/fmea-software/scripts/lib/codes.ts and eval-stability.ts's
  // own fail(), so a failure is one line (§9) even when the message quotes a V8
  // parse error that embeds the file's text.
  process.stderr.write(`error ${code}: ${message.replace(/\s+/g, " ").trim()}\n`);
}

const NOT_A_RESULTS_FILE = "is not a {models, runs, stability, critic} results file";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** What shapeProblem proves of a results file before its parts are read. */
type ResultsShape = {
  models: unknown;
  runs: unknown[];
  stability: unknown[];
  critic: Record<string, unknown>;
  unverified?: unknown;
  rejudged?: unknown;
  rubric?: unknown;
};

// The top-level shape: runs and stability are lists and critic is an object.
function shapeProblem(v: unknown): string | null {
  if (!isObject(v)) return NOT_A_RESULTS_FILE;
  if (!Array.isArray(v.runs) || !Array.isArray(v.stability)) return NOT_A_RESULTS_FILE;
  if (!isObject(v.critic)) return NOT_A_RESULTS_FILE;
  return null;
}

function modelsProblem(models: unknown): string | null {
  if (!isObject(models)) return "is missing its models table ({ model capability: model name }, first in results.json since 2026-09-12)";
  for (const name of Object.values(models)) {
    if (typeof name !== "string" || name === "") return "has a models table entry that is not a non-empty model name";
  }
  return null;
}

function criticListsProblem(critic: Record<string, unknown>): string | null {
  if (!Array.isArray(critic.missing) || !Array.isArray(critic.blocking_candidates)) return NOT_A_RESULTS_FILE;
  return null;
}

function scoreProblem(s: unknown, i: number, j: number): string | null {
  if (!isObject(s) || typeof s.id !== "string" || typeof s.score !== "number" || typeof s.evidence !== "string") {
    return `has a score that is not {id, score, evidence} at runs[${i}].scores[${j}]`;
  }
  return null;
}

function runProblem(r: unknown, i: number): string | null {
  const at = `at runs[${i}]`;
  if (!isObject(r)) return `has a run that is not an object ${at}`;
  if (typeof r.prompt !== "number" || typeof r.model_capability !== "string" || typeof r.run !== "number") {
    return `has a run with no numeric prompt, string model_capability and numeric run ${at}`;
  }
  if (!Array.isArray(r.scores)) return `has a run with no scores[] ${at}`;
  for (let j = 0; j < r.scores.length; j++) {
    const problem = scoreProblem(r.scores[j], i, j);
    if (problem !== null) return problem;
  }
  if (r.notes !== undefined && typeof r.notes !== "string") return `has a run whose notes is not a string ${at}`;
  return null;
}

function runsProblem(runs: unknown[]): string | null {
  for (let i = 0; i < runs.length; i++) {
    const problem = runProblem(runs[i], i);
    if (problem !== null) return problem;
  }
  return null;
}

function stabilityEntryProblem(s: unknown, i: number): string | null {
  const at = `at stability[${i}]`;
  if (!isObject(s)) return `has a stability entry that is not an object ${at}`;
  if (typeof s.prompt !== "number" || typeof s.model_capability !== "string") {
    return `has a stability entry with no numeric prompt and string model_capability ${at}`;
  }
  if (typeof s.jaccard !== "number" || typeof s.maxRows !== "number" || typeof s.bound !== "number") {
    return `has a stability entry whose jaccard, maxRows and bound are not all numbers ${at}`;
  }
  if (!isObject(s.countDiffs)) return `has a stability entry with no countDiffs object ${at}`;
  if (typeof s.pass !== "boolean") return `has a stability entry whose pass is not a boolean ${at}`;
  if (s.typing !== undefined && !isTyping(s.typing)) return `has a stability entry whose typing is not {shared, agreeing, pass} ${at}`;
  return null;
}

/** A stability entry's typing as eval-stability.ts writes it: two counts and a verdict. */
function isTyping(t: unknown): boolean {
  return isObject(t) && typeof t.shared === "number" && typeof t.agreeing === "number" && typeof t.pass === "boolean";
}

/** The top-level rubric version: absent (rubric 1), or a whole number of at least 1. */
function rubricProblem(rubric: unknown): string | null {
  if (rubric === undefined) return null;
  if (typeof rubric !== "number" || !Number.isInteger(rubric) || rubric < 1) return "has a rubric that is not a positive integer";
  return null;
}

function stabilityProblem(stability: unknown[]): string | null {
  for (let i = 0; i < stability.length; i++) {
    const problem = stabilityEntryProblem(stability[i], i);
    if (problem !== null) return problem;
  }
  return null;
}

function criticEntriesProblem(missing: unknown[], blocking: unknown[]): string | null {
  for (let i = 0; i < missing.length; i++) {
    const m = missing[i];
    if (!isObject(m) || typeof m.area !== "string" || typeof m.detail !== "string") {
      return `has a critic.missing[${i}] that is not {area, detail}`;
    }
  }
  for (let i = 0; i < blocking.length; i++) {
    if (typeof blocking[i] !== "string") {
      return `has a critic.blocking_candidates[${i}] that is not a string`;
    }
  }
  return null;
}

function unverifiedProblem(unverified: unknown): string | null {
  if (unverified === undefined) return null;
  if (!Array.isArray(unverified)) return "has an unverified that is not a list";
  for (let i = 0; i < unverified.length; i++) {
    const u = unverified[i];
    if (!isObject(u) || typeof u.unit !== "string" || typeof u.detail !== "string") {
      return `has an unverified[${i}] that is not {unit, detail}`;
    }
  }
  return null;
}

function rejudgedProblem(rejudged: unknown): string | null {
  if (rejudged === undefined) return null;
  if (!Array.isArray(rejudged)) return "has a rejudged that is not a list";
  for (let i = 0; i < rejudged.length; i++) {
    const e = rejudged[i];
    if (
      !isObject(e) || typeof e.criterion !== "string" || typeof e.date !== "string" || typeof e.runs !== "number" ||
      typeof e.by !== "string" || typeof e.reason !== "string" || typeof e.unverified !== "number"
    ) {
      return `has a rejudged[${i}] that is not {criterion, date, runs, by, reason, unverified}`;
    }
  }
  return null;
}

/**
 * Why the parsed value is not a usable results file, phrased to finish the
 * sentence `<path> …`, or null when it is one. The file is judge output that
 * evals/rubric.md tells a human to hand-edit at the acceptance gate, so every
 * field renderReport later dereferences is proved here: an uncaught TypeError
 * would print a stack trace and exit 1 instead of the one coded line §9 requires.
 * The parts are checked in a fixed order and the first problem is the one
 * reported; the critic lists are proved lists before the runs are read.
 */
function resultsProblem(v: unknown): string | null {
  const shape = shapeProblem(v);
  if (shape !== null) return shape;
  // shapeProblem proved runs and stability are lists and critic an object.
  const results = v as ResultsShape;
  const critic = results.critic;
  return modelsProblem(results.models)
    ?? criticListsProblem(critic)
    ?? runsProblem(results.runs)
    ?? stabilityProblem(results.stability)
    // criticListsProblem proved both critic lists are lists.
    ?? criticEntriesProblem(critic.missing as unknown[], critic.blocking_candidates as unknown[])
    ?? unverifiedProblem(results.unverified)
    ?? rejudgedProblem(results.rejudged)
    ?? rubricProblem(results.rubric);
}

/**
 * How the header names the results file: relative to the repository root when
 * the file is inside it, so the default prints `build/evals/results.json`, and
 * as given otherwise.
 */
function resultsLabel(resultsPath: string): string {
  const rel = relative(ROOT, resolve(resultsPath));
  return rel.startsWith("..") ? resultsPath : rel;
}

function main(argv: string[]): number {
  let resultsPath = join(ROOT, "build", "evals", "results.json");
  let outPath = join(ROOT, "docs", "specs", "2026-09-07-eval-results.md");
  let title = V1_OPTIONS.title;
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === "--results" && value !== undefined) { resultsPath = value; i++; }
    else if (argv[i] === "--out" && value !== undefined) { outPath = value; i++; }
    else if (argv[i] === "--title" && value !== undefined) { title = value; i++; }
    else {
      fail("USAGE", "usage: node tools/eval-report.ts [--results results.json] [--out report.md] [--title text]");
      return 1;
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resultsPath, "utf8"));
  } catch (err) {
    fail("IO_READ", `cannot read ${resultsPath}: ${String(err)}`);
    return 3;
  }
  const problem = resultsProblem(parsed);
  if (problem !== null) {
    fail("IO_READ", `${resultsPath} ${problem}`);
    return 3;
  }
  writeFileSync(outPath, renderReport(parsed as EvalResults, { title, resultsLabel: resultsLabel(resultsPath) }));
  process.stdout.write(`wrote ${outPath}\n`);
  return 0;
}

if (isEntry(import.meta)) process.exit(main(process.argv.slice(2)));
