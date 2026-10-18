# Prose: design

**Date:** 2026-10-14
**Status:** approved in conversation section by section; revised after two Fable reviews (§13); the user confirmed
the defaults of D13 to D15 on 2026-10-14, before plan A, and D15 again at the stage-0 gate (§11.4)
**Precedes:** implementation (via the writing-plans skill), then one results note per round and an acceptance note
**Branch:** `prose`, stacked on `flow-model` at `97261fc`, in the worktree `.claude/worktrees/prose`
**Evidence:** the flow-model eval round of 2026-10-13 (`docs/specs/2026-10-12-flow-model-eval-results.md`,
`docs/specs/2026-10-12-flow-model-acceptance.md`, both uncommitted on `flow-model` pending the user's rulings),
and the read-only workflow `wf_96244859-898` of 2026-10-14: 12 file readers, a pinned-literal scan, a dictionary
collision scan, 7 transcript analysts, 7 skeptics and 1 synthesis, all Opus, 3.63M subagent tokens. Its brief is
kept gitignored at `build/prose/brief.md` with its raw returns beside it, as the flow-model round kept its rulings
brief; this design carries what the plan needs from it.

---

## 1. Purpose

Make the skill's instructions land in unattended runs, and make the text easier for a person or an agent to read
and maintain. The first is the primary goal and carries the acceptance; the second is the secondary goal and is
checked for regression.

In the 0.7.0 round no (prompt, capability) pair passed: three failed and three were unverified. Three must
criteria account for every c1, c5 and c11 failure: c1, the missing scaling limit of the pricing service is not
recorded as an open assumption; c5, a priority is named in the hand-over without the provisional caveat; c11, a
rationale substitution is left out of `meta.history`. The c1 failure has recurred since 0.1.0 in text that
predates the flow-model branch. A fourth must, c2, also fails two prompt-1 runs (p1/high/run1 and p1/medium/run2
cite repositories the run was not given; ruling 7 of 2026-10-13 keeps that reading strict). c2 is a content
finding outside this design (§4.2), so the (1, medium) pair is not expected to pass the rubric's pair rule after
stage 1; §8.3 measures the three criteria, not the pair.

The brainstorm started from the hypothesis that long sentences and buried rules caused the failures, and that
ASD-STE100 Simplified Technical English was the lever. The workflow's transcript analysis revised that premise
(§3.3): buried rules explain two of six failures; four runs noticed the gap or the substitution and then did the
wrong thing with it; no machine check covers any of the three rules; the one passing run found the gap at the
point of writing, not by recalling the rule. The design therefore has two layers. Stage 1 changes behaviour with
the rule placed where the output is written, scope wording that closes the readings the transcripts showed, and
one machine check per criterion. Stage 2 is the readability pass. The two are measured separately.

## 2. Decisions taken in this design

| Id | Decision | Where |
|---|---|---|
| D1 | Route: rule placement, scope wording and three machine checks, then the readability pass. The user chose this over prose-only on 2026-10-14. | §6, §7 |
| D2 | Branch `prose` stacked on `flow-model`, in its own worktree; it rebases when `flow-model` merges. | header |
| D3 | Three eval rounds, one per stage, on DeepSeek Flash at both capabilities, 16 runs each, prompt 5 included. | §8 |
| D4 | Rubric 4 is frozen for all three rounds after the one amendment stage 0 makes (the `not_applicable` flows state the user ruled on 2026-10-13) and the stage-0 gate's two dated readings of c2 and c11, which add no criterion (§11.4). `rubric.md` is otherwise out of scope: it is the instrument. (amended 2026-10-15: and the c1 reading on a control's evidence, which adds no criterion, §11.5 ruling 2) (amended 2026-10-15 at the second stage-1 gate: and the c1 reading on an action's dates and a control's origin, the c6 reading on a count by priority, and the c11 reading on two more declared defaults with its clause extended to a ground rule and the final message, none adding a criterion, §11.6) (amended 2026-10-15 at the third stage-1 gate: and the c1 readings on `test_result` with a ref that restates an inventory line and on the capacity sentence's open-assumption default, and the c11 reading on the converter's typing as one default, none adding a criterion, §11.7) | §5.2, §4, §11.4, §11.5, §11.6, §11.7 |
| D5 | The descriptive sections of the references and all frozen text (§4.3) are out of stage 2; the prose checker's ratchet holds them from getting worse. | §7.3 |
| D6 | The two new lints are warnings, not blockers, so a valid document still renders, the quality score is untouched and the c1 reading of rubric 4 is unchanged. | §6.4 |
| D7 | The prose checker is a ratchet against a baseline file, not a set of hard caps, and fails closed. | §7.6 |
| D8 | Fable judges at three gates only; drafting, critique, implementation and eval judging run on Opus and Sonnet. | §9 |
| D9 | The pre-existing inconsistencies the readers found (§11.3) are logged, not fixed on this branch. (amended 2026-10-15 at the stage-1 gate: except the §5.5 reference, which plan C fixes on this branch, §11.5 ruling 8) | §11 |
| D10 | STE is applied as structure plus five vocabulary substitutions in skill-authored sentences. The rest of the STE dictionary is not applied, because it collides with domain terms (§7.5). | §7 |
| D11 | The context-window gate moves from the gitignored round scripts into the tracked harness, each run records its window and compactions, and a run that compacted is unverified. | §5.3 |
| D12 | Stage 1 changes nothing in the prose beyond what §6 names, so its round measures placement, wording and the checks alone. | §6 |
| D13 | The two shipped fixtures the c1 lint would fire on are amended to agree with their inputs, rather than the lint narrowed. Confirmed by the user on 2026-10-14, before plan A. (amended 2026-10-14 at plan B2: four fixtures, two of them with regenerated computed blocks) | §6.4 |
| D14 | `evals/rubric.md` is outside the prose checker, because it carries no provenance tags and changes by dated ruling. Confirmed by the user on 2026-10-14, before plan A. | §7.6 |
| D15 | The stricter c5 reading the acceptance note left unruled is not applied; the 2026-10-13 lenient reading stands and every note names the open reading. Confirmed at the stage-0 gate (§11.4, decision 6); the attribution hole the strict reading would close is on the acceptance agenda. (amended 2026-10-17: the user declined the stricter reading, as the flow-model acceptance note records under Decision 5, and 9247dfe writes the lenient reading into rubric 4's c5; the rule that closes the hole stays a follow-up, §11.8 ruling 3) | §8.5, §11.4 |

## 3. Evidence

### 3.1 The text

The skill's instructions are `SKILL.md`, ten reference files and the eval rubric, 56,252 words on the brief's
basis (58,490 by `wc -w`). Measured with `build/prose/prose-metrics.py` (tags stripped, a code span one word,
parentheticals and table cells not measured):

| File | Words | Sentences | Avg words/sentence | Over 25 words | Over 40 words | Semicolons | Rule sentences | Buried rules |
|---|---|---|---|---|---|---|---|---|
| SKILL.md | 7117 | 183 | 35 | 113 | 55 | 68 | 163 | 124 |
| design-failure-catalog.md | 6132 | 91 | 22 | 35 | 5 | 7 | 47 | 14 |
| design-inputs.md | 2023 | 56 | 27 | 25 | 6 | 14 | 41 | 21 |
| methodology.md | 3898 | 60 | 28 | 31 | 9 | 15 | 49 | 17 |
| method-selection.md | 1856 | 57 | 27 | 30 | 5 | 13 | 30 | 11 |
| process-stub.md | 2192 | 69 | 26 | 37 | 10 | 13 | 21 | 13 |
| provenance.md | 5186 | 66 | 27 | 28 | 9 | 24 | 46 | 17 |
| quality-and-lint.md | 8977 | 55 | 30 | 31 | 11 | 11 | 189 | 45 |
| scales-software.md | 7256 | 118 | 40 | 86 | 48 | 67 | 72 | 58 |
| structure-elements.md | 3424 | 89 | 31 | 48 | 18 | 25 | 77 | 42 |
| work-tracking.md | 2350 | 59 | 30 | 37 | 12 | 20 | 31 | 16 |
| rubric.md | 5841 | 130 | 34 | 66 | 44 | 45 | 115 | 50 |
| Total | 56252 | 1033 | | 567 | 232 | 322 | 881 | 428 |

A rule sentence tells the model to do or not do something; a buried rule is one over 40 words or starting after
word 60 of a paragraph over 100 words, a numbered step counting as one paragraph. Hedging is rare: 55 hedge words
in the whole text. The gap from STE is sentence length and compound clauses, not hedging.

### 3.2 Where the three rules sit

| Rule | Location | Sentence words / paragraph words, position |
|---|---|---|
| c1: "Ask for what is missing; a missing input is recorded as an open assumption and never invented." | `SKILL.md:35`, step 1 | 17 / 234, last |
| c1: item 4, SLA and scaling limits for every edge provider | `references/design-inputs.md:14` | table row |
| c5: "a priority is never presented without that caveat while any rating it rests on is provisional" | `SKILL.md:41`, step 7 | 48 / 565, middle; the clause is the sentence's last 16 words |
| c11: the rationale default and "record the substitution in `meta.history`" | `SKILL.md:70`, `:71`, `:74`, Convert | 56, 26 and 30 / 634, middle |

Every run read the governing file once, at the skill load or a single Read, and never again. The governed output
was written 88k to 162k tokens later. Distance does not separate passing from failing: the run that met c1 wrote
its document about 143k tokens after reading `SKILL.md`, the three that failed after 140k to 153k.

### 3.3 Why the runs failed, from the transcripts

| Run | Criterion | Mechanism after the skeptic's review |
|---|---|---|
| p1/high/run1 | c1 | never engaged: no reasoning in the run's own text or thinking touches pricing's limit; searches of that text for "item 4", "checklist" and "scaling limits" return 0 |
| p1/high/run2 | c1 | engaged, misapplied: wrote `"limits": "no rate limit published in the inputs"` into the edge and asked nothing |
| p1/medium/run1 | c1 | engaged, misapplied: "no limit stated, so the capacity rule doesn't apply"; read "an input the analysis needs" as "an input a rating rule consumes" |
| p1/medium/run2 | c1 met | found the gap while filling the edge's `sla` and `limits` slots; wrote the assumption and a placeholder in the field; fails c2 instead |
| p7/high/run1 | c5 | never engaged: zero hits in the run's own text for caveat, "never presented" or hand-over near the final message; the T28 checklist restated the first clause of `SKILL.md:41` and dropped the priority clause |
| p6/high/run2 | c11 | engaged, misapplied: noticed the empty cell, routed it to an open assumption, counted as substitutions only "fields with no column" |
| p6/medium/run2 | c11 | engaged, misapplied: quoted `SKILL.md:71`, asked whether "where one exists" means the column or the cell, wrote "Record substitution.", then enumerated only missing columns |

Three facts from the skill's own text fed the c1 failures. Two places argue both ways: item 4 at
`references/design-inputs.md:14` asks scaling limits of every edge provider "whatever its boundary", and
`references/design-inputs.md:45` restates that extension, while the reviewer rule `design-inputs-declared` at
`references/quality-and-lint.md:84` says "for internal dependencies" alone, and pricing is outside the boundary.
The schema's descriptions of `sla` and `limits` end "Nothing computes on it." No lint checks an edge for a
missing value. The runs recorded the gaps a named rule, a lint or the fixture's own wording raised, fixed every
validator finding, and treated clean validation as done.

## 4. Scope

### 4.1 In scope

- `SKILL.md`: stage 1 inserts (§6), stage 2 restructure (§7.1).
- The procedural sections of the references (§7.2) and the small wording changes of §6.
- `schemas/fmea.schema.json`: the descriptions of `sla`, `limits`, `rationale` and `history.change` (§6.2). No change to validation.
- `scripts/lib/lints.ts` and `scripts/render.ts`: two lints and one printed line (§6.4).
- `tools/run-eval.sh` and a new `tools/eval-context.ts`: the harness changes (§5).
- `tools/workflows/evals.js` and `rejudge.js` in code, not in their judge prompts: the `context.json` gate (§5.3) and the `not_applicable` flag (§5.2); `tools/eval-stability.ts` and `tools/eval-report.ts` for the same; `evals/rubric.md:232` and `:236` for the `not_applicable` state only.
- `docs/specs/2026-09-07-fmea-software-design.md`: three dated inline amendments in the repository's convention: the `MACHINE_RULES` count (18 to 20, the stated sentence to twenty-one), the Convert bullet's "where one exists" clause, and `render.ts`'s stdout line after a successful render.
- The two fixtures of §6.4 and their regenerated `computed` blocks.
- A new `docs/style.md` and a new `tools/check-prose.ts` with its baseline under `dev/` (§7.4 to §7.6).
- Tests for all of the above.

### 4.2 Out of scope

- `evals/rubric.md` beyond §5.2, and `evals/prompts.json`, whose texts tests pin verbatim.
- The judge prompts in `tools/workflows/evals.js` and `rejudge.js`.
- The descriptive sections of the references (D5).
- c2, repository references to repositories the run was not given, a content finding of the 0.7.0 round; the other skill findings of its acceptance note (the update summaries' missing inventory controls, the converter's boundary typing of the payment gateway, `cat-dependency-01`'s cause column); the inconsistencies of §11.3; and the shape of the report.
- An after round on Claude models (§8.5), which stays an option once stage 2 passes.

### 4.3 Frozen text

Text no stage changes, because a test, a licence, a script or the private audit depends on its exact form:

- every `sourced:` reproduction (the DORA definitions, the Howie tables), the NASA quotation, the licence attribution blocks of `references/provenance.md` (MIL-STD-1629A L139, dora.dev L147, Howie L154) and their statements of changes, and the register cells on the audit allow-list;
- every anchor row of `references/scales-software.md`: a change bumps the scales version, breaks the test pinned at version 2 and marks every rated row stale;
- the generated region of `references/structure-elements.md` between the `vocabulary:start` and `vocabulary:end` markers, which changes only through its JSON;
- the first fenced block under `## Scripts` in `SKILL.md`, which `tools/skill-commands.test.ts` reads line by line and requires each command to open with `node ${CLAUDE_SKILL_DIR}/scripts/` at column 0;
- the other pinned literals the scan found, 61 in tests under `scripts/` and `tools/` (`build/prose/brief.md`, "Pinned literals"), among them: the `### Migrate a v1 document` and `### Migrate a v2 document` headings and the stale-reason precedence line in `SKILL.md`; the validator-id and lint-id sentences and the reviewer rows matched by line prefix in `references/quality-and-lint.md`; `scales version: 2`, the two scale headings and the range sentence in `references/scales-software.md`; the DF4 disclaimer row in `references/methodology.md`; rule 7 of `references/work-tracking.md`, which a test finds as the first column-0 line starting `7. `;
- twin text that two files carry identically on purpose: `SKILL.md:36`, `:62-63`, `:110`, `:117-119` and `:129` against `references/structure-elements.md`, and `SKILL.md:35` against `references/design-inputs.md` and `references/quality-and-lint.md:67`. No test compares the twins; stage 2 may shorten the `SKILL.md` copy by the rule of §7.1 and never the words of the reference's copy, whose line form follows its section (ruling 6 of 2026-10-16, §11.8).

Literals that change by design, with their tests: the sentence at `references/quality-and-lint.md:25`, "The
machine lints the scripts implement are nineteen:", becomes twenty-one, with the two new ids appended to
`MACHINE_RULES` and placed before `priority-table-property` in its list, so `scripts/quality-and-lint.test.ts:27`
and `scripts/lints.test.ts:37` change with it (§6.4); the `computed` blocks of the two fixtures of §6.4; and the
frontmatter description of `SKILL.md`, shortened in stage 2 if §11.2 confirms the limit.

## 5. Stage 0: the harness and the baseline

### 5.1 The user's global instructions stay out of runs

`tools/run-eval.sh` runs the CLI without `--bare` (its 2026-09-11 preflight found `--bare` dropped the skill), so
eleven of the twelve 0.7.0 transcripts quote or apply `~/.claude/CLAUDE.md`, and one run lost its scores to it.
The fix is a `CLAUDE_CONFIG_DIR` per run: a fresh, empty directory. Nothing is copied from `~/.claude`: the user's
settings hold no env block and no API key helper, the plugin under test arrives through `--plugin-dir`, and the
gateway route to `deepseek-flash` is the launcher's environment (`ANTHROPIC_BASE_URL` and
`ANTHROPIC_AUTH_TOKEN`), which the fresh directory does not touch; the 0.7.0 runs authenticated with
`apiKeySource: none` through that route. A dated preflight, recorded in a comment above the `CLAUDE_CONFIG_DIR`
line of `run-eval.sh` as the `BARE` preflight is, confirms before the baseline round that a `-p` run under a fresh
directory authenticates through the gateway and lists the skill from `--plugin-dir`. A Claude-model round under
the same harness needs `ANTHROPIC_API_KEY` in the environment or a credentials file copied under the fresh
directory, stated in §8.5.

Two checks prove the fix. The harness test asserts the directory the run is launched with holds no `CLAUDE.md`, no
memory and no skills. The round's pass line (§8.2) reads each transcript's init line: `plugins` holds exactly the
plugin under test, `skills` exactly `failwise:fmea-software`, and `memory_paths.auto` lies under the run's
`CLAUDE_CONFIG_DIR`. A grep of each transcript for the literals `CLAUDE.md` and `~/.claude` is reported as a
secondary, quoting check: it reproduces the 0.7.0 count of eleven leaked runs exactly, but it cannot prove
absence, because the system prompt is not recorded in the transcript.

### 5.2 The `not_applicable` flows state

The user ruled on 2026-10-13 (ruling 4) that on a prompt whose inputs name no flows the flows stability predicate
is not applicable and the pair is judged on the element and count predicates, the state set from a per-prompt flag
the workflow passes. `tools/eval-stability.ts` takes two documents and a table and knows no prompt, so it gains an
argument for the flag; `tools/workflows/evals.js` passes it for prompt 6; with the flag the comparison reports
`not_applicable` whatever the two runs carry, as the ruling reads. `evals/rubric.md:232` ("passes when all three
hold") gains the clause and `:236` gains the state; the `STABILITY_SCHEMA` enum in `evals.js` and `isFlows` in
`tools/eval-report.ts` gain the value, and their tests follow. This is the only rubric change before the baseline
round, so all three rounds judge under the same text (D4); the stage-0 gate's two dated readings of c2 and c11 add
no criterion, and p1/high/run1 is re-judged on c2 under the first (§11.4).

### 5.3 The context window is recorded and gated

The gitignored round scripts set `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000` and `CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432`
for `deepseek-flash`, whose window the CLI would otherwise take as 200k, and refuse the round unless the CLI
reports the window. Nothing tracked does this, and no run records the window it ran under. The design moves it:

- `tools/run-eval.sh` carries a per-model table: model, the two settings, and the text the probe must report. `deepseek-flash` has the row above with `786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)`. A model with no row gets neither setting.
- Before each run the harness runs `claude -p "/autocompact" --model <model> --max-turns 1` under the run's `CLAUDE_CONFIG_DIR` and environment, takes the first line of the reply containing `auto-compact window for`, and refuses to start when that line is absent, contains `capped`, or, for a model with a row, does not contain the row's text.
- After each run a new `tools/eval-context.ts` writes `context.json` beside `invocations.json`: the two settings or their absence, the probe's line verbatim, `compactions`, the count of `transcript.jsonl` system lines with `"subtype":"compact_boundary"`, and `peak_context_tokens`, the maximum over assistant lines whose `parent_tool_use_id` is unset of `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` in `message.usage`, so a subagent's context never counts as the parent's. On the uncapped 0.7.0 round that computation gives 238,429 and 0 compactions for p1/medium/run2, the figures recorded on 2026-10-13, and 2 compactions on the capped p1/medium/run2.
- The same file records, for each of the two new lint ids, the number of `validate.ts` calls in `invocations.json` whose result head carries the id, and whether the run's final `validate.json` carries it. `validate.json` is written by the harness after the run from the final document, so it shows the end state only; `invocations.json` shows whether a warning fired during the run.
- `evals.js` reads `context.json` in code before it dispatches a judge, copies the window, the compactions and the peak into the run's entry in `results.json`, and records a run with no `context.json` or with `compactions` above 0 as unverified with no scores, the rule 2fea11a set for a run with no report. `rejudge.js` applies the same gate. `tools/eval-report.ts` prints the window and the peak per run.

### 5.4 The baseline round

The round of §8.1 on the current text, under the harness above. It passes when it meets §8.2. The baseline is
recorded, not graded. It should reproduce the c1 failure on prompts 1 and 5; if it does not, the premise is weaker
than §3 says and the user decides before stage 1 starts.

## 6. Stage 1: behaviour

Each criterion gets the same three-part treatment: the rule stated where the output is written, a "before you
write" list the model runs before the Write, and a machine check the validator reports. Nothing else in the prose
changes (D12). Every new or changed sentence carries its provenance tag, and every bullet of a new list ends with
`[skill-authored]`, since the private checker's coverage unit is the sentence, the bullet or the table row.

### 6.1 Wording and placement in `SKILL.md`

**c1, missing limits.** The inputs can do three things with a provider's SLA or limits: state a value, state that
there is none, or state nothing. The 0.7.0 runs conflated the last two, and the order store shows why they must
be told apart: `checkout-inputs.md:42` states "no published request ceiling", which rubric 4 reads as a datum
supplied, while pricing's limit is stated nowhere, the planted gap.

- Step 2's edge sentence (`SKILL.md:36`, "Write every dependency the inputs classify as an edge…") gains, as its own sentences: when the inputs do not state a provider's SLA or limits, leave the field out and record an open assumption owned by `user` naming the provider and the field; when the inputs state that there is none, copy their words into the field; never write a placeholder of your own. `[skill-authored]`
- Step 1 ends with a list headed "Before you write the document:": every input the checklist of design-inputs asks for that the inputs do not supply is an open assumption owned by `user`, status open, and a question in your final message.
- Step 2 ends with a list headed the same way: every edge carries `sla` and `limits` from the inputs, or an open assumption names its provider and the missing field; no field holds a placeholder.
- `references/design-inputs.md:14`, item 4, gains a second sentence in its cell: the source states this for internal dependencies, and this skill asks it of every edge provider, inside or outside the boundary. The row's Provenance cell already reads `[paraphrased:C014] [skill-authored]` and does not change. `references/design-inputs.md:45` already carries the extension and is not touched. The `design-inputs-declared` cell at `references/quality-and-lint.md:84` gains the same sentence, and its Provenance cell becomes `[paraphrased:C014] [skill-authored]`, the mixed-row form item 4 already uses.

**c5, the priority caveat.** The clause at `SKILL.md:41` is replaced by explicit sentences in the rubric's own
substitute wording for an unattended run, which never invents a re-scorer, since c5 band 0 scores a run that names
a person the inputs never mention:

- When you name a priority in a message, say in the same sentence that it rests on provisional ratings, while any rating under it is provisional. Say that every rating is provisional and that a named person is to re-score each one against the anchors, one at a time, as the next step. Never name a person the inputs do not name. `[skill-authored]` (amended 2026-10-15 at plan B's round-1b revision, §11.5 rulings 4 and 9: the shipped text is the one the Fable draft gate of 2026-10-15 gated, `build/prose/stage1b-text-gate.md`. Under ruling 9, step 7's two sentences on provisional ratings and the next step are now four, which list the ratings a named person re-scored this run as exceptions: `In your final message, say that every rating this run wrote or rewrote is provisional.`, `` List in that sentence, as exceptions, the ratings this run wrote or rewrote whose `review.status` is now `rescored`. ``, `` Say too that every other rating whose `review.status` is `provisional` is still provisional. `` and `Then give the next step in these words: a named person re-scores each provisional rating against the anchors, one rating at a time.`. Step 7's list carries the same change as two new items and one reworded one: `` That sentence lists, as exceptions, the ratings this run wrote or rewrote whose `review.status` is now `rescored`. ``, `` It also says that every other rating whose `review.status` is `provisional` is still provisional. `` and `It gives the next step in these words: a named person re-scores each provisional rating against the anchors, one rating at a time.`. Each sentence and item ends in `[skill-authored]`.)
- Step 7 gains a list headed "Before you send the final message:", and that rule is its first item, followed by: list every open assumption as a question.
- The update mode has its own hand-over sentences (`SKILL.md:89`, `:101`, `:112`) and none restates the caveat, and the only c5 failure was an update run. The sentence at `SKILL.md:112` gains "and ends with step 7's 'Before you send the final message' list". The seed section (`SKILL.md:48-57`) gains the same pointer, so prompt 5 is reached by placement and not by the render line alone.

**c11, substitutions.**

- `SKILL.md:71`'s "where one exists" becomes: where the column exists and the cell is filled; an empty cell takes the default and counts as a substitution on that row.
- The Convert section ends with a list headed "Before you write a converted document:": `meta.history` names every column used, every field substituted and on how many rows, an empty cell counted like a missing column; the final message repeats the count. (amended 2026-10-15 at plan B's round-1b revision, §11.5 rulings 4 and 9: the shipped text is the one the Fable draft gate of 2026-10-15 gated, `build/prose/stage1b-text-gate.md`. The list's item `` Element-level defaults such as `security_relevant` and `for_whom` are among those fields. `` is now four items, which name the control and effect defaults of ruling 4 and give `for_whom` as a function-level default, as ruling 9 corrects: `` `meta.history` names each element-level default, such as `security_relevant`, and each function-level default, such as `functions[].for_whom`, with its count. ``, `` `controls[].status` set to `existing` and `controls[].evidence.kind` set to `none` are declared defaults, each named with its count in `meta.history`. ``, `` On a sheet with a single effect column, `effects.local` and `effects.next_level` are declared defaults, each named with its count in `meta.history`. `` and `` `meta.history` names `actions[].target_date` and every other field filled or left empty as a declared default, each with its count. ``. Each ends in `[skill-authored]`.) (amended 2026-10-15 at plan B's epilogue, task E3: the shipped text adds the nine seed sentences, the seed list, the two Convert items and the two replacing items of §11.6 rulings 1 to 3, as the Fable draft gate of 2026-10-15 gated them in `build/prose/stage1c-text.md`. The seed section, `### Seed from postmortems`, gains nine sentences after its sentence on a carried-over action's `source_incident` (rulings 1 and 2): `Every action item of a postmortem whose incident has a chain is carried over, a Completed one included, whatever its dates or its control's status.`, `` A carried-over action's `target_date`, and a Completed one's `completed_date`, the postmortem does not state takes the date in `meta.created` as a declared default. ``, `` `meta.history` names each such field with its count of actions, and an open assumption owned by `user` asks for the real dates. ``, `` A control an action item created is `existing` only where the inputs' control inventory lists it, and otherwise `planned`, whatever the action's status. ``, `A change an action item made to an inventory control is a separate control, under the same rule.`, `` Its `evidence.kind` is `observed_incident` for an incident in which it acted, and `test_result` for a test the inputs give for it. ``, `` Otherwise its kind is `estimate`, with the inventory as `ref`, where the inventory lists it, and `none` where it does not. ``, `The incident whose action item created a control is its origin, not its evidence, unless the incident record shows the control acting during it.` and `` Its origin is named by the carried-over action's `source_incident`, not by the control's description. ``. It gains a list before its pointer to step 7's list, headed `Before you write a seeded document:`: `Every action item of a postmortem whose incident has a chain is an action, a Completed one included.`, `` Every carried-over action's `target_date`, and a Completed one's `completed_date`, the postmortem does not state is the date in `meta.created`, named with its count in `meta.history`. ``, `` Each such date field has an open assumption owned by `user` that asks for the real dates. ``, `` No control carries `observed_incident` for an incident it did not act in, nor `test_result` for a test the inputs do not give for it. `` and `` A control an action item created is `existing` only where the inputs' control inventory lists it. ``. The Convert list gains two items after its `actions[].target_date` item (ruling 3): `` Where no column maps it, `evidence_kind` `estimate` is a declared default, named in `meta.history` with its count of rows. `` and `` A `kind` or `boundary` the converter typed from the item text is a declared default, named in `meta.history` with its count of elements. ``. Its last item, `` A line that maps a column to `rationale` does not record a substitution, nor does an open assumption or the final message. ``, is now two (ruling 3): `` Only `meta.history` records a default; mapping a column to `rationale` or any field, an open assumption, a ground rule or the final message does not. `` and `An open assumption another sentence requires is still written beside that record.`. Each sentence and item ends in `[skill-authored]`.) (amended 2026-10-15 at plan C's plan review, decision 7 item (f), written before the stage-2 round: the seed-section and Convert text this note quotes was rewritten at stage 2 by task C4, under §7.2 and C4's ruling that a stage-1 sentence of 25 words or fewer keeps its wording and a longer one is split at a clause boundary only; the quotations stand as the record of E3's text as the draft gate gated it.)

### 6.2 Schema descriptions

The model reads field descriptions at the point of writing, so they carry the rule too. No validation changes.

- `$defs/dependencyEdge/properties/sla/description` and `…/limits/description`: "Nothing computes on it." is replaced by: when the inputs do not state it, leave the field out and record an open assumption owned by `user` naming the provider and the field; when they state that there is none, copy their words; never write a placeholder of your own. (amended 2026-10-14 at plan B1: the shipped text is the gated one, `build/prose/stage1-text.md`, which reads, for `sla`: `The availability or latency commitment, as free text in the source's own terms. When the inputs say nothing about it, leave the field out. Record an open assumption owned by user that names the provider and the field. When the inputs say the provider has none, or publishes none, copy their words. Never write a placeholder such as TBD, unknown or not stated, even one the inputs use.`; and for `limits`: `Scaling or rate limits, as free text in the source's own terms. When the inputs say nothing about them, leave the field out. Record an open assumption owned by user that names the provider and the field. When the inputs say the provider has none, or publishes none, copy their words. Never write a placeholder such as TBD, unknown or not stated, even one the inputs use.`)
- `$defs/rating/properties/rationale/description` gains: an empty cell in a sheet that has a rationale column takes this default too, and that row counts as a substitution recorded in `meta.history`. (amended 2026-10-14 at plan B1: the shipped text is the gated one, `build/prose/stage1-text.md`, which reads: `Why this value against the anchors, in prose; mandatory. For a converted sheet without a rationale column, the declared default 'converted from <sheet file name>; no rationale recorded', with the substitution recorded in meta.history. An empty cell in a sheet with a rationale column, under any heading, takes this default too. Record it in meta.history as a rationale substitution with its row count, each such row included; an open assumption does not record it.`)
- `$defs/historyEntry/properties/change/description`: "the fields it substituted with row counts" becomes "the fields it substituted with row counts, empty cells included". (amended 2026-10-14 at plan B1: the shipped text is the gated one, `build/prose/stage1-text.md`, whose two opening sentences read: `What changed, in prose. In meta.history, a conversion gives its column mapping, its empty-trigger note, and every field it substituted with its count, empty cells and element-level defaults included.`) (amended 2026-10-15 at plan B's round-1b revision, §11.5 rulings 4 and 9: the second of those sentences is now two, as the Fable draft gate of 2026-10-15 split it in `build/prose/stage1b-text-gate.md`, the one-sentence form being 29 words; they read: `In meta.history, a conversion gives its column mapping, its empty-trigger note, and every field it substituted with its count. Empty cells and element-level, function-level, control and effect defaults are among the substitutions it counts.`)

A test asserts each new sentence is present, so a later schema edit cannot drop it silently.

### 6.3 Stage 1 leaves alone

The paragraph shapes, every other sentence, the rubric, and the references outside the two cells named above.
The stage-1 round therefore attributes any change in scores to §6.1, §6.2 and §6.4 together.
(amended 2026-10-15 at the second stage-1 gate, §11.6 rulings 1 and 2: the sentences and list items on an
action's dates and on a control's status and evidence that plan B's epilogue adds to the seed section of
`SKILL.md`, `### Seed from postmortems`, join the stage-1 text, so the round-1c reading attributes a change on
prompt 5 to them together with §6.1, §6.2 and §6.4; every other sentence of the seed section, §6.1's pointer to
step 7's list apart, stays outside.)
(amended 2026-10-15 at plan C's task C0, §11.5 ruling 7: the two sentences that follow the WS3 table in
`quality-and-lint.md` join the stage-1 text after round 1c, which did not measure them; they leave to the machine
lint `edge-reliability-unstated` an edge whose `sla` or `limits` is absent, empty or a placeholder and that no open
`user` assumption records, and keep the rest of the judgement under the reviewer row `design-inputs-declared`, so the
defect is reported once; they are part C's one ruled change to skill text outside §7.1 and §7.2.)

### 6.4 The machine checks

Two lints in `scripts/lib/lints.ts`, warnings, reported by `validate.ts` and in the report's lints section like the
nineteen existing ones, and one printed line in `render.ts`. Both lints are text heuristics at warning severity;
their predicates were checked against the 0.7.0 documents and the shipped fixtures, and the reach stated below is
what that check found.

**`edge-reliability-unstated`** (warning). For each edge in `dependencies[]`, a field among `sla` and `limits` is
unstated when it is absent, empty, or matches the run-placeholder pattern: case-insensitive, whole words,
`not stated`, `none stated`, `not given`, `not provided`, `not documented`, `not recorded`, `not published`,
`unknown`, `n/a`, `tbd`, or any text containing `in the inputs`. A stated absence in the inputs' own words, such as
`no published request ceiling`, does not match. (amended 2026-10-15 at plan B's round-1b revision, §11.5 ruling 5: the pattern also holds `none recorded` and `none published`, and the inputs test is `/in the (design |supplied )?inputs/i`, so a text containing `in the design inputs` or `in the supplied inputs` is unstated as well; nothing else changes, a stated absence in the inputs' own words stays stated and the silencing rule stays per edge. Reach on the prose-0 documents the stage-1 gate named: fires on p5/high/run2 (`none published in the design inputs`); silent on p1/medium/run2, whose `none recorded` now reads as unstated but of whose two open user assumptions naming pricing the one about its repository holds the field word `availability` ("the recorded availability commitment"), so the edge stays silenced, a known gap of the per-edge rule; silent on p5/medium/run1, whose `limits` is a fallback sentence ("Checkout falls back to the last quoted price held in the cart when pricing does not answer.") that neither test matches, a known gap; and silent on p1/medium/run1's copied words `no published request ceiling`, which stay with the judge. No prose-1 document is reached.) The lint fires when at least one field is unstated and no entry of
`meta.assumptions[]` with `status: open` and `owner: user` both names the provider, by its element id or its name,
case-insensitive, and names the field, by containing one of `limit`, `limits`, `ceiling`, `scaling`, `rate`,
`sla`, `availability` or `latency`. Message:
`edge <from> -> <to>: <field> is not stated and no open assumption names <to> and the field; record the missing value as an open assumption owned by user, or copy the inputs' words` (amended 2026-10-14 at plan B1: the shipped message is the gated one: `edge <from> -> <to>: <field> is missing or a placeholder, and no open assumption owned by user names <to> and <field>. Leave <field> out and record that assumption; copy the inputs' words instead only where they say there is none or none is published.`).
An unstated field beside such an assumption does not fire, matching the 2026-10-13 ruling that a field beside an
open assumption is not scored 0. Reach on the 0.7.0 documents: fires on p1/high/run1, p1/high/run2 and
p1/medium/run1, the three c1 failures; silent on p1/medium/run2, whose assumption names pricing and its scaling
limits. A predicate that required the assumption to name only the provider reached none of the three, because
every run carried an unrelated assumption about pricing's repository.

Two shipped fixtures fire today and are amended to agree with their inputs (D13): (amended 2026-10-14 at plan B2:
the predicate applied to every shipped document reaches four, `update/stale-rows.fmea.json` and
`legacy-rpn-sheet.expected.fmea.json` as well, and all four are amended; `update/before-v2-branches.fmea.json` is
refused by the legacy gate before any lint runs) the golden
`evals/fixtures/checkout-service.fmea.json` gains `limits: "no published request ceiling"` on the
`checkout -> checkout.order-store` edge, the inputs' words at `checkout-inputs.md:42`; and the prompt-7 stored
document `evals/fixtures/update/before.fmea.json` gains an open `user` assumption on pricing's scaling limit,
which its own inputs omit. Both get a regenerated `computed` block through `validate.ts --write`, since a stale
block makes `render.ts` refuse. A test asserts that no shipped fixture carries either new warning. The
alternative the user may prefer is to narrow the lint instead.

**`conversion-substitution-unrecorded`** (warning). Let `r` be the number of chains with at least one rating whose
`rationale` matches `^converted from .+; no rationale recorded$`. Split the `change` text of every `meta.history[]`
entry into clauses on `.` and `;`. The lint fires when `r > 0` and no clause contains the word `rationale`
together with one of: `r` as a standalone integer, not adjacent to a letter, `-` or `_` (so a chain id such as
`ch-1` does not count and a date does not count); the number word for `r` from one to ten; or the id or name of
every chain whose rationale carries the default. (amended 2026-10-14 at plan B3: the integer's neighbours also exclude a digit, and the number word matches under the same neighbour rule, so "one-to-one" is not the count one; a colon beside the count, as in "(1:1)", and the pronoun in "no one" still count, two known gaps left as written) (amended 2026-10-15 at plan B's round-1b revision, §11.5 ruling 4: the lint reads four more defaults, each recorded as the rationale is, by a clause that names the field together with the default's count as a standalone integer, its number word from one to ten, or every affected row by its chain id or its element's name, each a whole token. A document is a conversion when any `meta.history[].change` matches `/converted from|column mapping|conversion/i`; a document that is not one, and a conversion of fewer than two chains, are read for the rationale alone. In a conversion of two chains or more: `status`, when every control of every chain has `status: "existing"` and there is at least one control, counted by control, its rows the chains that have a control, named by `status` as a whole word; `evidence.kind`, when every control's `evidence.kind` is `"none"` and there is at least one control, counted by control with the same rows, named by `evidence.kind`, `evidence kind` or `evidence_kind`; `effects.local`, when every chain's `effects.local` is the same text, an empty and an absent one counted as the same, counted by chain, named by `effects.local`, `local effect`, `local` as a whole word, or `effects` together with `local`; and `effects.next_level`, the same, named by `effects.next_level`, `next_level`, `next level` or `next-level`. Every field name matches case-insensitively. Clauses now split on `;` and on a dot that no word character follows, so a dotted name such as `controls[].evidence.kind` stays in one clause, where the split on every dot left no dotted field name whole. Before the split, a rule added at this revision's review, every `;` and `.` inside a quoted span is blanked to a space, so a quoted default text such as `'converted from <sheet>; no local effect recorded'` or `'... no next-level effect recorded'` ends no clause: a quoted span runs from an opening quote to its closing one, matched left to right without nesting, or to the end of the `change` text when it has none, the pairs being straight double quotes, “…”, straight single quotes and ‘…’, and a single quote, straight or curly, opens a span only where no word character precedes it and closes one only where no word character follows it, so an apostrophe, as in `sheet's` or `rows'`, neither opens nor closes one. The rationale's reach on the 0.7.0, prose-0 and prose-1 documents and the shipped fixtures is unchanged by either. One finding per unrecorded default at `/meta/history`, in the order rationale, `status`, `evidence.kind`, `effects.local`, `effects.next_level`, each in the shipped message's form, `<count> <unit>(s) carry the default <field>, and no meta.history clause names <field> with that count or with those rows' chain ids or element names. Keep the default, and add that clause to meta.history, not to an assumption or a row's history.`, the unit `control` for the two control fields and `row` otherwise, so the rationale's text is as shipped. Reach on the prose-1 documents: fires on p6/high/run1 and p6/high/run2 on `status` only and on p6/medium/run2 on `effects.local` and `effects.next_level` only, the defaults the judge found uncounted on the three c11 failures; silent on p6/medium/run1 and on `evals/fixtures/legacy-rpn-sheet.expected.fmea.json`, which counts each default "on 4 of 4 rows". Of the earlier documents, `status` is flagged, uncounted, on prose-0's p6/high/run1 and p6/medium/run1 and the 0.7.0 round's p6/medium/run1, and no effect is flagged on a history that counts it after a quoted default text; the 0.7.0 round's p6/medium/run2, which counts both effects together "on 8 fields", is flagged on both, a known gap left as written.) (amended 2026-10-15 at plan B's epilogue, §11.6 ruling 3: in a conversion of two chains or more the lint reads two more defaults, after `effects.next_level` and in this order. `evidence_kind`, when every S, O and D rating of every chain has `evidence_kind: "estimate"`, counted by row, its rows every chain, named by `/evidence_kind|\bestimate\b/i`, and recorded by the count of rows or by the count of ratings, three times the rows, each as an integer or its number word, the second count being this default's alone; and `typing`, the elements' `kind` and `boundary` typed by the converter, which holds whenever the document has an element, counted by element, its rows the elements, each by its id or its name, named by `/\btyp(e|ed|es|ing)\b|\bboundary\b|\brole\b/i` or by `elements[].kind` as a whole token, `kind` alone, as in `evidence.kind`, naming nothing, and recorded as well, whatever its count, by a clause matching `/elements\[\]\.(kind|boundary)/`, which a column mapped to the element's type holds. The controls' `evidence.kind` is named by `/evidence[. ]kind/i`, the underscore dropped, so the ratings' clause `evidence_kind: estimate on 4 rows` no longer stands in for the controls'. The number words run to twelve for every default, so `twelve ratings` counts. The typing's message is `<n> element(s) carry the default typing, and no meta.history clause names the typing with that count or with every element's id or name. Keep the typing, and add that clause to meta.history, not to an assumption, a ground rule or a row's history.`; the other messages are unchanged, `evidence_kind`'s in the row form. Reach on round 1b's prompt-6 documents: silent on p6/high/run1 (`evidence_kind: estimate on 4 rows`; "All 4 elements take boundary in_scope") and p6/high/run2 (`on 12 ratings`; `elements[].boundary is in_scope on 4 elements`); fires on p6/medium/run2 on both, which it records only in `meta.assumptions[]` and a ground rule; and fires on p6/medium/run1 on the typing alone, whose "each element is typed by the converter from the item text" holds no count and names no element, a known gap left as written, its `twelve ratings` counting. Of the earlier documents, only prose-0's p6/high/run1 gains a finding, the typing, whose one typing clause names checkout-api alone before a `;`. The prose-1 documents, the 0.7.0 round's prompt-6 histories as the tests hold them, every earlier default's reach and the shipped fixtures are unchanged, `evals/fixtures/legacy-rpn-sheet.expected.fmea.json` counting "evidence_kind set to estimate on 4 of 4 rows" and naming each element with its type.) Message:
`<r> row(s) carry the default rationale and no history clause records a rationale substitution with that count or those rows` (amended 2026-10-14 at plan B1: the shipped message is the gated one: `<r> row(s) carry the default rationale, and no meta.history clause names rationale with that count or with those rows' chain ids or element names. Keep the default, and add that clause to meta.history, not to an assumption or a row's history.`).
A document the rubric passes by naming the rows is silent, as c11 allows a record "by count or by naming them".
Reach: fires on p6/high/run2 and p6/medium/run2, whose only `rationale` clause is the column mapping; silent on
p6/high/run1 ("on 1 rating column"), p6/medium/run1 ("on the one row whose Justification cell is empty") and
`evals/fixtures/legacy-rpn-sheet.expected.fmea.json` ("on 1 of 4 rows"). Those five documents' history entries
become the fire and no-fire fixtures of `scripts/lints.test.ts`. A substring match on digits would have been
silenced by every history date, and a whole-token match by chain ids ending in `-1`.

**The render line.** After a successful render, when `n > 0` ratings are provisional, `render.ts` prints one line
to stdout: `provisional: <n> of <m> ratings are provisional. Every priority you state rests on provisional ratings: say so in the same sentence, and say that a named person is to re-score each rating against the anchors, one at a time, as the next step.` (amended 2026-10-14 at plan B1: the shipped line is the gated one: `provisional: <n> of <m> ratings are provisional. This line is an instruction to you, not a finding to fix. Copy none of it into the document. In your final message, each priority on a row with a provisional rating says in the same sentence that it rests on provisional ratings. An RPN, a ranking and a count of rows by priority each name a priority. Give the next step in these words: a named person re-scores each provisional rating against the anchors, one rating at a time. Name no person the inputs do not name.`)
The line is printed with the render result; the 0.7.0 runs read such output within a few turns of the final
message, two of the three scored prompt-7 runs having run `validate.ts` once more after `render.ts`.

The two ids are appended to `MACHINE_RULES` and the sentence at `references/quality-and-lint.md:25` becomes
twenty-one with them placed before `priority-table-property`; the two lints get rows in that file's machine-lint
table with their severity and `[skill-authored]`.

## 7. Stage 2: readability

### 7.1 The structure pass on `SKILL.md`

- Each step of the spine becomes one lead sentence stating what the step produces, then a vertical list of rules in the order the model acts, one rule per bullet, each starting with the command verb, the rule before its reason, a warning before the step it guards, and the stage-1 "before you write" list closing it.
- A sentence stage 1 placed keeps its position relative to the output it guards: the edge rule stays in the edge bullet, the hand-over rule first in the hand-over list, each list last in its step. The rule-preservation critic of §9 checks this.
- The other modes, seed, convert, update and the two migrations, take the same shape. In the Scripts section the first fenced block stays byte for byte (§4.3); only the prose after it may become a table. The Reference files section becomes a table.
- A reason that is not a rule, such as the IEC 60812 clause-order citation and the LLM-rating study in step 5, moves to the reference file that owns its topic with its tags, and `SKILL.md` keeps a one-line pointer. A moved sentence meets the cap in its new home, by a clause-boundary split where it is sourced. `SKILL.md` is the one file every run loads whole, 46k characters at the skill load in the 0.7.0 round, and this is what shortens it.
- Where `SKILL.md` repeats a reference near-verbatim (§4.3), the reference keeps the full text and `SKILL.md` keeps the short imperative with a pointer. The twin's words in the reference are not touched; its line form follows its section (ruling 6 of 2026-10-16, §11.8).
- Numbering other files cite stays: steps 1 to 7, the migrations' headings, and every heading a test or a script message names.

### 7.2 The sentence pass on the procedural sections of the references

The sections, by heading and start line as the brief's "Sections per file" lists them:

- `design-inputs.md`: Flows, components and dependencies L28; Incident history L50; The control inventory L58; Ground rules and assumptions L68; Contracts and data flows L82; The non-catalog source rule L108.
- `structure-elements.md`: The three questions L6; Dependencies L72; Role L81; Conversion from a sheet L98; Migrating a v1 document L109; Migrating a v2 document L134; Runs over several codebases L154. The generated region and the Boundary and Security relevance prose sections stay.
- `quality-and-lint.md`: The skill applies these to itself L264.
- `work-tracking.md`: The three commands L7; The rules L18, keeping rule 7 as the first column-0 line starting `7. `.
- `method-selection.md`: Which incidents seed a chain L20; What a postmortem hands over L42; Learning and action are fenced apart L51; Identifiers a seeded chain carries L60; What incident data may rate, and what may not L67; The threat-model handoff L92; The interface L98; What the handoff does not do L107.
- `design-failure-catalog.md`: Reading a row L7; ML or LLM elements L86; What this catalog does not carry L162.
- `methodology.md`: Why severity-first L136; What this file never carries L149.
- `scales-software.md`: Rules common to the three scales L29; the prose, not the anchor rows, of Severity L39, Occurrence L66 and Detection L91; The review gate L131; Versioning L135.
- `provenance.md`: the preamble L1; Tag syntax L21; Tag-permission rule L28; Refuted records L49; Sources with no license status in evidence L170; Never ships L198. The three licence sections are frozen (§4.3).
- `process-stub.md`: The answer to a PFMEA request L7; Incident data that is not rating evidence L92; Actions carried over from a postmortem L101. The DORA section is left alone for its reproductions.

For each: a sentence over 25 words is split at a clause boundary; the voice is active; one rule per sentence; a
paragraph of more than six sentences becomes a list. Only the five substitutions of §7.5 apply, and only in
skill-authored sentences. Every stated uncertainty, every caveat that is content ("stays provisional until", "no
standard in the corpus binds", a licence condition) and every "may" that grants permission stays.

### 7.3 Left alone

The descriptive sections of every reference, the frozen text of §4.3, and `rubric.md` (D5). The prose checker's
ratchet (§7.6) keeps the references' counts from rising; `rubric.md` is outside the checker (D14).

### 7.4 Tags

- One tag per sentence, per bullet, and per table row in its Provenance column, as the private checker's rule reads; the register is the one exempt table. A bullet carries one tag at its end and may hold several sentences. A bullet that would mix sources is split into two bullets, so no bullet carries a mixed tag.
- A split sentence keeps its tag on each part. A `paraphrased:`, `adapted-from:` or `cites:` sentence is split at a clause boundary only and never reworded on this branch, so the private distill check meets no new claim.
- `SKILL.md` and every changed reference file go through the private repository's distill check stage, its Recheck covering both, after stage 1 and after stage 2, before the commit that lands each, with the verdict in the commit body. The restricted-wording audit runs from the private checkout before the user pushes.

### 7.5 Vocabulary

The dictionary scan found the STE substitutions safe in five cases and damaging elsewhere. They apply to
skill-authored sentences only; a sourced sentence keeps its word, which leaves alone `SKILL.md:15`,
`references/quality-and-lint.md:114` and `:179`, `cat-component-05` at `references/design-failure-catalog.md:84`
and `references/scales-software.md:133`.

| Apply | Do not apply |
|---|---|
| need for require, outside the four `*-required` invariant ids, JSON Schema's `required`, the DORA definitions, NIST's "a required security property" and the licence-obligation sense | check for verify: collides with `--check`, `update-check.ts`, "checker" and the noun "check" |
| do or make for perform, outside the MIL-STD-1629A title and Occurrence anchor row 8 | end or stop for terminate: collides with `effects.end` and "a stopped `apply`" |
| through for via | change for modify: collides with the `*-changed` reasons, `--change-table`, `IO_CHANGED` and `history[].change` |
| more for additional | start for initiate: breaks "initiating event" |
| obey for follow, only where the sense is obey and the sentence is skill-authored (`SKILL.md:156`, `references/methodology.md:5`, `references/quality-and-lint.md:180`) | try for attempt: the skill's "attempt" is a noun; test as a verb: the four verb uses are rewritten, the noun stays; near for close: only `design-failure-catalog.md:66` |

Words the skill uses in more than one sense (record, state, flag, control, review, check, end, change, open, status,
and sixteen more in the brief's "Vocabulary") are not unified on this branch. The style rule asks that no new sense
be introduced and that the schema's word be preferred.

### 7.6 The style rule and the prose checker

**`docs/style.md`**, one page, pointed to from `CONTRIBUTING.md`: the two text classes and how to tell them apart;
the procedural shape of §7.1; the caps, 20 words for an instruction and 25 for a description, six sentences for a
procedural paragraph; rule before reason, warning before the step; the same word for the same thing with the
schema's word preferred; the table of §7.5; the tag rules of §7.4; the frozen-text list of §4.3; and what a change
to a sourced sentence requires.

**`tools/check-prose.ts`**, run by `tools/check.ts` after the three existing checks, over `SKILL.md` and
`references/*.md`. `evals/rubric.md` is outside it (D14): it carries no provenance tags, and it changes by dated
ruling, which a ratchet would block.

- One measurement basis for every file: tags stripped, a code span one word, parentheticals kept, table cells measured for length, headings, frontmatter and code fences skipped, the register table and the generated region exempt.
- Three counts per file: untagged items, where an item is a sentence outside a table, a bullet, or a table row whose Provenance cell is empty, outside the exempt regions; sentences over 25 words; and occurrences of the filler list, `basically`, `essentially`, `simply`, `actually`, `in order to`, never a modal. The counts are printed per heading as well as per file, so §8.4 can be read per section.
- A baseline file `dev/prose-baseline.json` holds each file's three counts. It is first written on the stage-1 text, before the first stage-2 edit, and lowered at the end of stage 2. The check fails when any count rises above its baseline. A test asserts no baseline entry is above the measured count, so lowering the baseline is the only edit that passes, and the baseline cannot drift up.
- It fails closed: the baseline file missing or not JSON, a file it cannot read or parse, a file in the baseline that is missing, a file in scope that the baseline lacks, or a run that measures nothing, is a failure. Every run prints the counts.
- It is the same command in bash and fish, like the other runners.

## 8. Measurement and acceptance

### 8.1 The round

Prompts 1, 5, 6 and 7, at high and medium, two runs each, 16 runs, on `deepseek-flash` at effort high for both
capabilities as in the 0.7.0 round, judged by `tools/workflows/evals.js` under rubric 4 with `args.prompts` set
to all four, with `rejudge.js` for a disputed criterion as before. Prompt 5 is scored on c1 to c10 and shares the
planted gap with prompt 1; its last result predates the flows table of 23eb1c4. Each round's directory is
`build/evals/prose-<stage>/`, its note `docs/specs/2026-10-14-prose-eval-results-<stage>.md`, generated by
`tools/eval-report.ts`. Every note reports, per run, the window and peak from `context.json`, the denied script
calls of any reason from `invocations.json`, and the new lints' fired and final counts.

A run is verified when it was scored (it left `analysis.json` and `report.html`) and its `context.json` records
zero compactions. A run is also unverified when its final message is cut off, as `context.json`'s
`final_message.complete` records it (`complete` not true, or the field absent): the message in `transcript.json`'s
`result`, trailing whitespace trimmed, is complete when it is non-empty, ends with one of `.`, `!`, `?`, `:`, `|`,
`)`, `]`, `"`, `'`, `` ` `` or `*`, or with a line that is a closing code fence, and opens no code fence it does
not close. A cut-off run's cell is re-run once, and a second cut counts as a failure. (amended 2026-10-15 at the
stage-1 gate, §11.5 ruling 1: p5/high/run2 of the stage-1 round ended mid-word at `*(the sh` with stop reason
`end_turn` and no error, and no usage figure could show it, every stream line of the round reporting 0 output
tokens.)
From round 1c of plan B's epilogue, ruled 2026-10-15, `context.json` also records `message_counts`, the pairs of
a number and a priority value that the final message states, each compared with the document's count of rows at
that value before and after action; the note's Harness table prints the result as a Counts column, and a wrong
count is reported and makes no run unverified (§11.6 ruling 4). From the same round the cells run under the
parallel launcher `tools/run-round.ts`, which drops every inherited environment variable whose name starts with
`CLAUDE` from its children and from its smoke call and records the dropped names in `round.json` as
`env_stripped`; the note's Round method line says so, and the sequential rounds of record, prose-0, prose-1 and
prose-1b, inherited those variables (§11.6, carried items).
A pair passes a criterion when both of its runs are verified and each scores 2 on it in
`results.json` `runs[].scores[]`. An unverified run makes every criterion of its pair unverified, and a stage does
not pass until that cell is re-run. The rubric's own pair rule, both runs passing their musts and the 80% total
and stability passing, as `pairOutcome` in `tools/eval-report.ts` computes it, is reported in every note but is
not a stage gate, because c2 and the non-must criteria are outside this branch.

### 8.2 Stage 0 passes when

Every run has `invocations.json` and `context.json` with `compactions: 0`; every transcript's init line shows
`plugins` as exactly the plugin under test, `skills` as exactly `failwise:fmea-software` and `memory_paths.auto`
under the run's `CLAUDE_CONFIG_DIR`; no script call is denied for the `bun` reason, read from `invocations.json`
outcomes; and the prompt-6 stability check reports `not_applicable`. The secondary grep of §5.1 and the denials of
any other reason are reported. Recorded, not graded.

### 8.3 Stage 1 passes when

- Every pair that c1, c5 or c11 applies to passes that criterion by the definition of §8.1: c1 on all four prompts, c5 on prompts 1, 5 and 7, c11 on prompt 6.
- No pair that passed a criterion at baseline, by the same definition, fails it after. (amended 2026-10-15 at the stage-1 gate, §11.5 ruling 3: read over every criterion, a regression on a criterion outside c1, c5 and c11 counts only when the result gate names a mechanism for it in the shipped text or the checks, and is otherwise logged in the note as variance. In the stage-1 round, the c3 drops on (5, high) and (5, medium) were restatement calls the baseline judges did not make on comparable rows, and the drop on (6, medium) was p6/medium/run2 leaving its `effects.local` and `effects.next_level` substitution out of `meta.history`, the omission of ruling 4, with no mechanism in the stage-1 diff named for any of them.)
- The note's per-run table shows, from `context.json`, whether each new warning fired during the run and whether the final document still carries it.
- On a failure: the failing transcripts go through the analyst-and-skeptic read of the brief's premise phase, the change is revised once, the round runs once more. A second failure goes to the user.

### 8.4 Stage 2 passes when

- No pair scores worse than at stage 1 on any criterion, by the definition of §8.1, and stability holds where it held. (amended 2026-10-15 at plan C's plan review, decision 9, written before the stage-2 round: this bullet is read strictly on c1, c5 and c11, where a pair scoring worse than at stage 1 fails; the change is revised once, the round runs once more, and a second failure goes to the user. On every other criterion it takes §8.3's amended reading: a drop counts when the result gate names a mechanism for it in the stage-2 diff, a rule lost, moved or changed, and is otherwise logged in the note as variance.)
- `dev/prose-baseline.json` is lowered to the new counts, and the per-heading counts show zero over-cap sentences and zero untagged items in `SKILL.md` and under the §7.2 headings, frozen text excepted.
- The note reports `SKILL.md`'s size at the skill load before and after.

### 8.5 What the rounds cannot separate

Stated in every note: stage 1 measures placement, wording and the checks together (D12); judge variance is bounded
by the pair rule and by rejudging; the stricter c5 reading the acceptance note left to the user, whether a run
that edits the rationale text of carried-forward rescored ratings "authored" them, is not applied, the 2026-10-13
lenient reading stands, and the open reading is named (D15); the model is the one the 0.7.0 round used, so a gain
on Flash is not yet a gain on Claude. An after round on Opus at high and Sonnet at medium remains an option once
stage 2 passes; under this harness it needs `ANTHROPIC_API_KEY` in the environment or a credentials file under the
fresh `CLAUDE_CONFIG_DIR`, and the per-model table has no row for either, so the probe gate asserts only that the
window line exists and is not capped. (amended 2026-10-17: the c5 reading of D15 is no longer open; the user
declined the stricter reading on that date, as the flow-model acceptance note records under Decision 5, and 9247dfe
writes the lenient reading into rubric 4's c5; the rule that closes the hole stays a follow-up, §11.8 ruling 3)

## 9. Tiers and workflow

Mechanical work and critique run on Opus and Sonnet. Fable judges at three gates, unanchored: each judge gets the
artefacts and the criteria, not the controller's conclusions.

| Phase | Agents | Tier |
|---|---|---|
| Stage 0 implementation | one implementer and one reviewer per change, test-first | Opus |
| Stage 0 gate | the controller: the checks of §8.2 are mechanical | none |
| Stage 1 drafting | one drafter per criterion for the wording, placement, schema text and lint predicate; one skeptic per draft for meaning drift and collisions with rubric 4's readings | Opus |
| Stage 1 draft gate | one judge rules whether the wording closes the readings of §3.3 without opening new ones, before the round | Fable (1) |
| Stage 1 implementation | one implementer per lint and for the render line, test-first, with a reviewer each | Opus |
| Stage 1 result gate | one judge reads the diff, the results note and §8.3 and rules pass, revise or escalate | Fable (2) |
| Stage 2 drafting | one drafter per `SKILL.md` section and per §7.2 section; one rule-preservation critic per draft listing every rule before and after, flagging any rule lost, added, moved from its stage-1 position or changed, checking tags | Opus |
| Stage 2 checks | the prose checker and the pinned-literal tests after every file; the private distill Recheck over `SKILL.md` and each changed reference | scripts |
| Stage 2 result gate, final acceptance | one judge reads the diff, the results note, §8.4 and the rewritten `SKILL.md` as one document, asking whether a model acting from it would do the right thing in the right order | Fable (3) |
| Eval judging | the existing workflow: Opus judges, Sonnet stability, Opus critic | Opus, Sonnet |

Every report names the tier per phase and the Fable count. Three Fable subagent calls are planned; the controller
runs on Fable throughout.

## 10. Testing

- The two lints in `scripts/lints.test.ts`: the five history entries of §6.4 as the c11 fire and no-fire set; for c1, the three 0.7.0 edge-and-assumption shapes that fire, the p1/medium/run2 shape that is silent, the order-store stated absence that is silent, and the provider-only assumption that must not silence; the `MACHINE_RULES` order test at `:37` updated; the output in `scripts/validate.test.ts`.
- The render line in `scripts/render.test.ts`: printed when `n > 0`, absent when `n = 0`, exact text; the two existing empty-stdout assertions are on refused renders and stand.
- The schema sentences of §6.2 in `scripts/schema.test.ts`.
- The two amended fixtures (amended 2026-10-14 at plan B2: four fixtures, two of them with regenerated computed blocks): `checkout-service.fmea.json` and `update/before.fmea.json` re-validated with `--write`; a test asserts no shipped fixture carries either new warning; `scripts/render.test.ts`, `tools/skill-commands.test.ts` and `tools/check-browser.ts` all read the golden and are run after the change.
- `tools/eval-context.ts`: a fixture transcript with and without a `compact_boundary` line, the peak computation with and without subagent lines, the lint fired-and-final counts from a fixture `invocations.json`, a missing transcript fails closed; the unverified rule in `tools/eval-report.test.ts`; the probe gate, the per-model table and the empty config directory in `tools/run-eval.test.ts`, which already stubs `claude` on PATH.
- The `not_applicable` flag in `tools/eval-stability.test.ts`, `tools/eval-report.test.ts` and the `CRITERIA` sync test.
- `tools/check-prose.ts`: the three counts on a fixture, the row rule for tables, the exempt regions, the per-heading output, the ratchet, every fail-closed case, the baseline-not-above-measured test.
- The pinned-literal tests stay green through stage 2 except those §4.3 names as changing by design.
- `node tools/run-tests.ts` and `node tools/check.ts` before every commit. The browser gate and the comparison after stage 1, since the golden's report changes with the order-store edge, and again after any later change to the renderer or the template.
- Verification fails closed throughout: an unverified run or an unrun check is reported as such in every note.

## 11. Risks, follow-ups and open items

### 11.1 Risks carried

- A warning the runs ignore. If stage 1's round shows the new warnings fired and unresolved, the revision makes them blockers, with the pointer moved onto a chain or `qualityScore` taught non-row blockers, since a blocker whose pointer is outside `chains[]` zeroes the score (`scripts/lib/quality.ts:18`).
- Judge variance masking or faking a gain, bounded by the pair rule and rejudging, and the open c5 reading of D15 (amended 2026-10-17: the c5 reading is no longer open; the user declined the stricter reading, and 9247dfe writes the lenient one into rubric 4's c5).
- Twin text and line-number citations in older documents going stale under the stage-2 restructure. The plans and the flow-model acceptance note are historical records and are not rewritten; the spec notes it.
- The private checks are the only verification of reworded sourced text; the branch avoids rewording it (§7.4), and `SKILL.md` and every changed reference file still pass the distill Recheck before commit.
- How an Opus judge reads a fired warning in `validate.json` is untested: the judge prompt names only `rating-provisional` as counting against nothing, and the prompt is out of scope. The stage-1 note reads the c1 and c14 scores of runs whose final document carries a new warning.

### 11.2 To verify in stage 2

The frontmatter description of `SKILL.md` is 1,183 characters. The brief reports a 1,024-character limit for a
Claude Code skill description. The plan verifies the limit against the Claude Code documentation; if it holds, the
description is shortened in stage 2 and the skill's triggering is checked with the plugin eval or skill-doctor
tooling, since the eval rounds name the skill explicitly and do not measure triggering.

### 11.3 Logged, not fixed on this branch

The readers found these while inventorying, and the stage-0 gate added three (§11.4); each is a content question
for its own change:

- the catalog's 60% at `design-failure-catalog.md:55` against `quality-and-lint.md:103`'s "59 percent";
- `NOTICES.md` saying `adapted-from:C090` appears once in `quality-and-lint.md`, where it appears twice;
- `SKILL.md:109` and `:111`, which differ only in their last word;
- `SKILL.md:122` against `:123`;
- the dangling §5.5 reference at `SKILL.md:98`;
- `provenance.md`'s row counts (44 rows described of 64);
- `scales-software.md:129`'s "refused only when its shape fails" against `TABLE_ID_MISMATCH`;
- where the ML or LLM questions live, catalog `component` against a structure-elements `service`;
- `cat-dependency-01`'s cause column restating its own mode (already an agreed follow-up);
- `cat-security-04`'s cause column (`design-failure-catalog.md:114`) restating its own fails-open mode, logged beside `cat-dependency-01`'s at the stage-0 gate;
- the update summaries' missing inventory controls, the converter's boundary typing, and c2's bare repository references (0.7.0 skill findings);
- the update mode editing carried-forward rationales under A. Reviewer's `rescored` stamp (prose-0 p7/medium/run1: ch-2 O and D, ch-4 S and O, and ch-2 D gained a content sentence), the attribution hole the strict c5 reading would close, with the rule "carry note goes in history[], rationale stays byte-identical" as `SKILL.md` text for after stage 2;
- the conversion reading sheet cells without a parsing script (prose-0 p6/medium/run2 read the Pricing Service row's filled Justification as empty);
- the differing word-count bases in the inventory, which the checker's single basis replaces;
- the frontmatter description length (§11.2).

### 11.4 Rulings at the stage-0 gate (2026-10-14)

The baseline round, prose-0, was judged under rubric 4. Its critic named twelve blocking candidates, and two of
plan A's final-review recommendations came to the gate. The user ruled interactively on each one that needed a
ruling: the critic's candidates 1 and 2 are findings, and its candidate 9 is already in §11.3. The decisions follow
in the order the user took them, each with where it lands; plan B's start is the work done before task B1.
Decisions 1 and 2 are dated readings in rubric 4 that add no criterion, so the rubric stays 4 for all
three rounds (D4).

1. c2, repository sources: strict. Ruling 7 of 2026-10-13 goes into rubric 4's c2 as a dated paragraph, and p1/high/run1 is re-judged on c2 alone under it. The skill wording behind such refs (`design-inputs.md:105`, `structure-elements.md:156-158`) is a follow-up decision after stage 2, not stage-1 scope.
2. c11, band 2's substitution clause: the broad reading stands. A dated paragraph in rubric 4's c11 says the clause covers every declared default `fixtures/legacy-rpn-sheet.expected.fmea.json`'s `meta.history` enumerates that the run's conversion applied, element-level ones included, and not the `meta.scales` pin; p6/high/run1 stays at 1, with no re-judge.
3. The payment gateway's boundary on prompt 6: neither side changes now. The rubric keeps `third_party`, and the converter text at `SKILL.md:60-62` stays as §11.3 logs it; if stage 2's rewrite changes the behaviour, c13 and c14 show it, and since both fail at baseline and neither is a must, §8.3 carries no regression risk from it.
4. The stability count predicate: the 0.2 absolute-count bound stays through stages 1 and 2, and the four pairs that fail it stay failed. The acceptance note names (1, high) and (7, medium) as row-count cases and (1, medium) and (5, high) as rating drift. The stability predicate redesign, a share-based or shared-chains predicate, goes on the v1 acceptance agenda, where the rubric, `COUNT_BOUND_FRACTION` and the tests move together.
5. The c3 catalog rows: nothing changes now. `cat-security-04`'s cause column joins `cat-dependency-01`'s in §11.3, and the stage-1 gate revisits both, with the option to fold them into stage 2's reference rewrite.
6. c5's open reading, D15: the lenient reading is confirmed, and p7/medium/run1 keeps its 2, with no re-judge. Its edited rationales are logged in §11.3, and the attribution hole, which the strict c5 reading would close, goes on the acceptance agenda.
7. The Persist phase: dropped from `tools/workflows/evals.js` at plan B's start, with its unverified unit. The controller then writes `build/evals/prose-<stage>/results.json` from the Workflow task's output and checks that it parses and holds the run count; the "1 Sonnet persist" tier line of plans B and C becomes a recorded deviation.
8. The stream-drift flag: recorded and gated at plan B's start. `tools/eval-context.ts` counts `assistant_lines_without_usage`, both workflow files hold a run unverified when that count is not 0 or `assistant_lines` is 0, and the note's harness table gains a `Lines without usage` column; every prose-0 run reads 0, so no baseline verdict moves.
9. What the rounds count as: the prose baseline and the stage comparisons only, not v1 evidence for criterion 2 of the base design's §15, since both capabilities ran `deepseek-flash`. At plan B's start `tools/eval-report.ts` prints, under the note's header, the run model per capability, the judging tiers and the Fable count.
10. Sheet parsing on prompt 6: no script now. §11.3 logs p6/medium/run2's misread Justification cell, and the sheet parser is revisited at acceptance, on three rounds of c11 scores.
11. Go: stage 1 (plan B) starts as planned, with every B1 wording item, c5's included. The acceptance note of stage 1 records that c5's failure did not reproduce at baseline (0 of 4 prompt-7 runs under the lenient reading), so its stage-1 result shows non-regression only; it also records that c1's premise held on 6 of the 8 planted-gap runs, not on (1, high), and c11's mechanism on 2 of 4 under decision 2.

### 11.5 Rulings at the stage-1 gate (2026-10-15)

The stage-1 round, prose-1, was judged under rubric 4 and, as judged, fails §8.3's first clause on five cells over
four pairs (corrected 2026-10-17 from "five pairs", the round note's own count): c1
on (5, high) and (7, medium), c5 on (5, high), and c11 on (6, high) and (6, medium). Its critic raised the
contested readings, the Fable result gate ruled escalate, and the user ruled on each item on 2026-10-15. The
rulings follow, each with where it lands. Round 1b is the second round of §8.3's failure path,
`build/evals/prose-1b/`. Ruling 2 is a dated reading in rubric 4 that adds no criterion, so the rubric stays 4
(D4).

1. p5/high/run2's cut-off final message: the run is unverified, not a failure, since a cut-off final message is a harness event. A cut-off cell is re-run once and a second cut counts as a failure; this lands in §8.1, amended, in the `final_message.complete` check of `tools/eval-context.ts` and in the judging gate of both workflow files. No prose-1 cell is re-run, since round 1b re-measures every cell.
2. c1 and control evidence: band 1 covers control evidence a run invents, written as a dated paragraph in rubric 4's c1. p7/medium/run2 keeps its 1, with no re-judge, and the (7, medium) regression stands, read as run variance, the stage-1 diff touching nothing about control evidence.
3. §8.3's second clause reads over every criterion: a regression on a criterion outside c1, c5 and c11 counts only when the result gate names a mechanism in the shipped text or the checks, and is otherwise logged in the note as variance (§8.3, amended). The c3 drops of prose-1 on (5, high), (5, medium) and (6, medium) are logged as variance.
4. The prompt-6 defaults: the Convert list of `SKILL.md` names `controls[].status`, `controls[].evidence.kind`, `effects.local` and `effects.next_level` among the substituted fields, each with its count, and `conversion-substitution-unrecorded` widens to those four defaults (§6.4, amended at plan B's round-1b revision). c11's broad reading, decision 2 of §11.4, is kept. The singular "that substitution is counted" in `SKILL.md`'s control sentence is a plan C wording item, being outside the stage-1 text.
5. `edge-reliability-unstated`'s placeholder pattern gains `none recorded` and `none published`, and its inputs test matches `in the design inputs` and `in the supplied inputs` as well as `in the inputs` (§6.4, amended). The copied-words case, prose-0's p1/medium/run1 giving pricing the order store's `no published request ceiling`, stays with the judge, since no text test tells it from a stated absence.
6. The harness holds a run unverified when its final message is cut off, through ruling 1's check, which is committed before round 1b.
7. The `design-inputs-declared` reviewer row and `edge-reliability-unstated` both cover a missing SLA or limit. The overlap stays through round 1b, and plan C adds the sentence that splits them, with a dated note in §6.3.
8. The pre-branch findings of B6's distill Recheck are fixed on this branch in plan C, in one commit named as pre-branch: the C201 tier bullets of `design-inputs.md:37-39` take `[skill-authored]`, the register carrying no tier description; the §5.5 cross-reference §11.3 logs at `SKILL.md:98` (line 129 at 4e7860c) points at the shipped design; `quality-and-lint.md:39`'s C063 clause states what the code does (a sheet column converts unmapped); the `value_priority`, decomposition and WS8 sentences take their tags; and the control-kind sentence at `design-inputs.md:64` is reworded. §11.3's entry for the §5.5 reference is then fixed on this branch rather than only logged.
9. Of B6's review minors, the `for_whom` wording, which names a function field as element-level, and the c5 sentence that re-marks ratings a named person re-scored this run fold into the round-1b revision of the gated text. The B6 commit body is left as it is.
10. The parallel launcher for sixteen-run rounds is built while round 1b runs and is used from stage 2; round 1b keeps the sequential method of record.
11. Under §7's sentence caps a code span counts as one word, and plan C's counter implements it. By that count `SKILL.md`'s c11 sentence is 21 words against the cap of 25.

Round 1b, §8.3's "the round runs once more", follows the revision, with the result gate run once more; the stage-1
note of prose-1 is committed as the record of the first round.

### 11.6 Rulings at the second stage-1 gate (2026-10-15)

Round 1b, `build/evals/prose-1b/`, the second round of §8.3's failure path, was judged under rubric 4 and, as
judged, fails §8.3's first clause on three pairs outside the planted gap: c1 on (5, high) and (5, medium), and
c11 on (6, medium). The planted-gap target held on every prompt-1 and prompt-5 run, prompt 5 going from 0 of 4
runs at baseline to 4 of 4; c5 passed on all six pairs; and no target criterion regressed from baseline. The
Fable result gate ruled escalate, and the user ruled on 2026-10-15. The rulings follow, each with where it lands.
Plan B's epilogue, the section headed "Epilogue after the second stage-1 gate (2026-10-15)" in
`docs/plans/2026-10-14-prose-b-behaviour.md`, lands them, re-judges the disputed runs, revises the text once more
and runs round 1c, the stage-1 round of record that part C compares against. Each ruling's rubric text is a dated
reading in rubric 4 that adds no criterion, so the rubric stays 4 (D4).

1. Action dates are c1 inputs. The schema requires `target_date` on every action and its description asks for `completed_date` on a Completed one, and the postmortems give an action item's id, text, owner and status and no date, so a date filled with no declaration is band 1 of c1 as written, and p5/high/run2's 1 stands. The seed section of `SKILL.md` gains the declared-default rule: the run's own date for both fields, counted in `meta.history`, with the real dates asked for as an open assumption owned by `user`. §6.3's scope widens to that text (§6.3, amended; rubric c1's dated paragraph; the seed section at E3 of plan B's epilogue). (corrected 2026-10-15 at E3, after the c1 skeptic: the default is the date in `meta.created`, for a carried-over action's `target_date` and a Completed one's `completed_date`; the date of an action a run proposes is its proposal, outside c1, as rubric c1's scope sentence says.)
2. An incident whose action item created a control is the control's origin, not its evidence, as the seeded-chain sentence of `scales-software.md` already says. A completed action item's control is `existing` where the inputs list it so and `planned` otherwise, and its `evidence.kind` is `none` unless the inputs give a test or an incident in which it acted. Both (5, medium) runs are re-judged on c1 alone, and p1/high/run1's 2 stands, its fallback control having acted in INC-2026-0502. The seed section carries the rule (rubric c1's dated paragraph; `SKILL.md`'s seed section at E3). (corrected 2026-10-15 at E3, after the c1 skeptic: an inventory-listed control with no evidence stated carries `estimate` with the inventory as `ref`, by the control-inventory sentence of `scales-software.md`, the one before its seeded-chain sentence, and `none` only where the inventory does not list it; an incident in which the control acted remains `observed_incident`.)
3. The ratings' `evidence_kind` `estimate` and the elements' `kind` and `boundary` typed by the converter are named in the Convert list, each with its count, and the list's last item becomes generic: no declared default is recorded by a column-mapping line, an open assumption, a ground rule or the final message. `conversion-substitution-unrecorded` widens to both defaults, and rubric c11's clause on a substitution recorded only in `meta.assumptions[]` extends to a ground rule and the final message. p6/medium/run2's 1 stands (rubric c11; `SKILL.md`'s Convert list at E3; §6.4 at E4).
4. c6 stands as written: a count of rows by priority is not a priority value under band 2's third clause, and p1/medium/run1 is re-judged on c6 alone. The harness compares the counts by priority that the final message states with the document's, and the note reports the result, which makes no run unverified (rubric c6's dated paragraph; §8.1, amended; `tools/eval-context.ts` and `tools/eval-report.ts` at E5).

Carried with the rulings: from round 1c the launcher strips every inherited `CLAUDE*` variable from its
children and its smoke call and records the names in `round.json`, the sequential rounds having inherited them
(§8.1, amended); the baseline re-run on CLI 2.1.300 that the result gate named is deferred, stage 2 comparing
against round 1c, which runs on the same CLI; `tools/run-eval.sh` removes its scratch directories on SIGTERM,
SIGINT and SIGHUP as it does on EXIT; the R4 and R5 review minors are fixed in the epilogue; the epilogue
moves two rulings of §11.5, ruling 10's launcher being used from round 1c rather than from stage 2 and ruling
8's pre-branch fixes being made in the epilogue's task E6 rather than in plan C, and D9 and §11.5 rulings 8
and 10 are left as the record of the earlier ruling; round 1b's note is regenerated after the re-judges and
committed again; and the §6.3 split sentence (§11.5 ruling 7), `SKILL.md`'s singular "that substitution"
(§11.5 ruling 4) and the stability predicate, which fails on both prompt-5 pairs under the 0.2 bound without
being a gate, stay with part C. (amended 2026-10-18 after the review of pull request 30: task E6's commit also
changed the seed section's provisional-ratings sentence in `SKILL.md`, adding "until a named person re-scores
each one", for skeptic finding c5-7, as task E6 of plan B names it; §11.5 ruling 8 does not list that change)

Round 1c follows the epilogue's revision, with the result gate run once; its note is committed as the round of
record after the user reads it.

### 11.7 Rulings at the third stage-1 gate (2026-10-15)

Round 1c, `build/evals/prose-1c/`, the stage-1 round of record, ran through `tools/run-round.ts` at
concurrency 4 with every inherited `CLAUDE*` variable stripped, and was judged under rubric 4 with no
unverified unit. It passes §8.3 as amended: c1 scores 2 on all sixteen runs, c5 on the twelve runs of prompts
1, 5 and 7 and c11 on the four prompt-6 runs, so every pair passes the first clause, and the five pairs that
failed at baseline, c1 on (1, medium), (5, high) and (5, medium) and c11 on (6, high) and (6, medium), pass;
four pairs fail a criterion they passed at baseline, c6 on (1, high) and (7, high) and c3 on (5, high) and
(5, medium), with no mechanism in the shipped text or checks, and are logged as variance under the second
clause; neither stage-1 warning reaches a final document. The Fable result gate ruled pass (plan B's sixth
Fable call) and named three scores of 2 as borderline. The user ruled on 2026-10-15 that each stands, with no
re-judge; the readings are two dated paragraphs in rubric 4, one in c1 and one in c11, which add no criterion,
so the rubric stays 4 (D4), and the skill text round 1c measured is unchanged.

1. Where the control inventory lists a control with no evidence, `test_result` on it with a `ref` that restates its inventory line is not an invented input under c1's control-evidence paragraph, the ref being one the inputs give; an incident or action item cited for `observed_incident` stays under the origin reading of ruling 2 of §11.6. The kind label is the matter of the control-inventory sentence of `scales-software.md`, which no criterion reads. p1/medium/run1's 2 stands (rubric c1's paragraph of the third stage-1 gate).
2. The typing the converter does from the item text is one declared default covering `kind` and `boundary`; a `meta.history` clause in the phrase the conversion rule prescribes, with its count of elements and each element's kind and not its boundary, names the default, the fixture's per-element form being the form and not the requirement, and the reading narrows nothing in rubric c11's earlier 2026-10-15 paragraph, which takes the count or every element the default affects. p6/high/run1's 2 stands (rubric c11's paragraph of the third stage-1 gate).
3. The open-assumption default of the scales' capacity sentence, applied on an unstated normal load, is a rating default and not a c1 gap, since no item of the design-inputs checklist asks for the normal load. p1/medium/run2's 2 stands (rubric c1's paragraph of the third stage-1 gate).

Follow-ups after part C, none made at stage 1: three wording changes, each adding a rule that part C's
rule-preservation critics are briefed to reject; the enforcement of a seed sentence the skill already carries;
and fixes to the harness, `tools/eval-context.ts`, which no critic reads. The wording changes: a sentence in
the design-run text restating the control-inventory sentence of `scales-software.md`, that an inventory
control with no evidence stated takes `estimate` with the inventory as ref; the Convert item asking for each
element's kind and boundary named in `meta.history`; the capacity sentence's open-assumption default recording
the unstated load as an open assumption owned by `user`. The enforcement: `SKILL.md`'s seed sentence that a
control the inventory does not list carries `evidence.kind` `none`, which p5/medium/run1 of round 1c did not
follow (it gave the nine controls its carried-over action items created, ten control entries in all,
`estimate` with the origin incident as ref) with no rubric consequence, c1's control-evidence paragraph
reading only `test_result` and `observed_incident`; the clause of the control-inventory sentence of
`scales-software.md` that `none` is written only when the inputs state the evidence is absent or an incident
record shows the control did not catch the mode, which the run quoted, reads against the seed sentence. The
harness fixes: the count check comparing a stated count with the after-action count only when some chain
carries `post_priority`, a chain without one counting at its `priority` after action (round 1c's documents
carry none, so a stated zero matched by absence), searching every value of the vocabulary of the priority
table the document records in `meta.scales.priority_table` and not only the values its chains carry, and
reading counts in words; and `firedCount`, through the calls `validateCallIdsOf` hands it, reading only
`validate.ts` runs whose target is the run's own document (round 1c's one firing of
`conversion-substitution-unrecorded`, on p6/medium/run1, ran on a scratch copy the run altered to see the lint
fire). The round-1c note, `docs/specs/2026-10-14-prose-eval-results-1c.md`, carries a §8.3 reading section
with these rulings and is committed as the round of record after the user reads it.

### 11.8 Rulings at the acceptance (2026-10-16)

Task C8 closed plan C with two stage-2 rounds, prose-2 and its repeat on the same text, prose-2b. The second
round failed §8.4's first bullet again, the second strict failure under the bullet's dated note, and the Fable
final acceptance, plan C's one Fable call, ruled `escalate` with twelve findings. The user then ruled nine items,
one at a time, each with its options and what each costs if wrong. The acceptance note,
`docs/specs/2026-10-14-prose-acceptance.md`, holds the record under "Rulings at acceptance (2026-10-16)"; the
text commit 0a6ffe4 applied rulings 2, 4 and 6.

1. Stage 2 is accepted on the rounds as read, by the user's override of §8.4's first bullet, which stays literally unmet: the two c1 drops, round 2's (5, high) and round 2b's (1, high), are run variance, and the (5, medium) stability failure is the count predicate's weakness. More runs per cell for later DeepSeek rounds go to the follow-ups of ruling 7.
2. The 36-word `[skill-authored]` Update sentence of `SKILL.md`, over the cap with no freezing clause, is split at its "in which case" boundary into two `[skill-authored]` bullets with every word kept, and the baseline's `SKILL.md` long count goes from 6 to 5 (0a6ffe4).
3. D15's lenient reading stands, and p7/high/run2 of round 2b keeps c5 2 and c6 2. The attribution hole is closed by a rule after part C: a carried-forward rating keeps its rating object as stored, its carry-forward reason goes in `meta.history` or the final message, and `update-check.ts` flags a changed rationale under a kept human stamp.
4. R29 is confirmed with the retags on its ground, and R38 takes its recorded alternative, `[skill-authored]` alone on both review-gate bullets (0a6ffe4). R37's deterministic-modifier part, `[skill-authored]` with R29 confirmed, is split at its "or when" boundary with every word kept, the `scales-software.md` long count going from 67 to 66 (0a6ffe4); the five split parts that keep a sourced tag their own words do not carry go to a scoped Recheck after part C.
5. The `update-check.ts` row's content correction stands, and the C0 rule's widening is confirmed in its narrow wording: a statement about a script's observable behaviour that the script's code contradicts may be corrected inside a rewritten section, when verified against the code, logged and named in the commit body.
6. The list markers on the twin lines of `references/structure-elements.md` are the section's form. The twin rule says the words of the reference's copy are never touched and its line form follows its section, in `docs/style.md:90` (0a6ffe4) and in §4.3 here.
7. Every follow-up is recorded in the acceptance note in a recommended order, and none is opened on this branch: first the harness and the gate, then the text rules batched into one round, then §8.5's Claude-model round as that plan's measuring round. The sheet parser of §11.4 decision 10 is closed, not carried.
8. When `flow-model` lands on `main` by squash merge, `main` is merged into `prose`, with no rebase. The user pushes `prose` once the C8 commits are in and opens the pull request after `main` is merged in. (amended 2026-10-17 by the user's ruling, recorded in the acceptance note's ruling 8 and in `docs/specs/2026-10-12-flow-model-acceptance.md`, Decision 3: `flow-model` is merged into `prose` as 2d69eb0, on the notes commit rewritten as 885426d, and one pull request from `prose` to `main`, merged as a merge commit, lands both; the squash merge and the merge of `main` into `prose` do not happen, and every `prose` hash the notes cite stays on `main` under the merge commit)
9. The `flows-section` branch lands on `flow-model` first, merged by the user with the checks run by hand, and reaches `prose` through ruling 8's merge, after the C8 commits; merging it into `prose` directly is the fallback. (amended 2026-10-17: the section reached `flow-model` as 598567e on 2026-10-16 and reaches `prose` through 2d69eb0, the merge of `flow-model` into `prose` that entry 8 as amended records; the fallback was not used)

## 12. Acceptance criteria

1. Stage 0's harness changes are merged on the branch with tests, the dated preflight of §5.1 is recorded, and the baseline round meets §8.2.
2. Stage 1's changes are exactly those of §6, every new sentence and bullet tagged, the two lints and the render line tested against the documents §6.4 names, the two fixtures amended per D13 (amended 2026-10-14 at plan B2: four fixtures, two of them with regenerated computed blocks) or the lint narrowed per the user's ruling, and the round meets §8.3, or the user has ruled on its failure.
3. Stage 2's rewrite touches only §7.1 and §7.2, keeps every frozen literal of §4.3 and every stage-1 placement, lowers the baseline per §8.4, and the round meets §8.4, or the user has ruled on its failure.
4. `docs/style.md` exists and `CONTRIBUTING.md` points to it; `tools/check-prose.ts` runs under `tools/check.ts` and fails closed.
5. `SKILL.md` and every changed reference file passed the private distill Recheck, with the verdict in the commit body, and the audit passed from the private checkout before the user pushes.
6. `docs/specs/2026-09-07-fmea-software-design.md` carries the three dated amendments of §4.1.
7. Each round has its results note; the acceptance note lists every unverified cell, names the tier per phase and the Fable count, and states §8.5.
8. No commit carries AI attribution, and nothing is pushed by the agent.

## 13. Review record

Two Fable reviewers read the first version of this spec on 2026-10-14 (workflow `wf_6e47fb13-046`, read-only,
0.49M tokens), one through the lens "will it work", one through "what will it break". Both returned "revise": 17
findings from the first, 22 from the second, 39 in all, 4 flagged as the user's decision. Every file claim the
fixes rest on was re-checked against the files before this revision.

| Finding | Disposition |
|---|---|
| c1 lint silenced by any assumption mentioning the provider, and firing on the order store's stated absence (A1 of both lenses, A3 of the second) | applied: the field word, the three-way split and the run-placeholder pattern in §6.4 and §6.1; the fixtures amended under D13 |
| c11 lint's digit match defeated by dates and chain ids (A2, B11) | applied: the clause rule of §6.4 with the five verified documents as fixtures |
| tag unit for tables is the row, not the cell (A10, second lens A1) | applied in §6, §7.4 and §7.6 |
| rubric.md has no tags, so the untagged ratchet would block its own amendments (second lens A2) | applied as D14, pending the user |
| c2 also fails two prompt-1 runs (A3) | applied in §1, §4.2, §11.3 |
| design-inputs.md:45 already carries the extension (A4, B5) | applied in §3.3 and §6.1 |
| render line not always last; "name a person" invites an invented re-scorer; the update and seed modes do not reach step 7's list (A5) | applied in §6.1 and §6.4 |
| the pass line defined on no artefact (A6) | applied in §8.1 |
| validate.json shows the end state only (A7) | applied: the counts in `context.json`, §5.3 |
| sentinel phrases weak; the init line is the mechanical check; the gateway is environment (A8, B1, B2) | applied in §5.1, §8.2, §8.5 |
| the probe gate refuses Claude models; the match is on one line; the probe runs under the run's directory (A9, B3) | applied in §5.3 |
| "state none" ambiguous (A11) | applied in §6.1 and §6.2 |
| fixtures' computed blocks and the tests that read the golden (A12, B12, second lens A3) | applied in §4.3, §6.4, §10 |
| blockers outside chains zero the quality score (A13) | applied in §11.1 |
| the open c5 reading is a variance source (A14) | applied as D15, pending the user |
| stage 2 could move a stage-1 placement (A15) | applied in §7.1 and §9 |
| not_applicable needs a per-prompt flag, regardless of what the runs carry (A16, B4) | applied in §5.2 per ruling 4 as the acceptance note records it |
| "failed every pair" and the search wording (A17) | applied in §1 and §3.3 |
| substitutions would reword sourced sentences (B6) | applied in §7.5 |
| the Scripts fenced block is pinned (B7) | applied in §4.3 and §7.1 |
| SKILL.md goes through the distill Recheck (B8) | applied in §7.4, §12 |
| the base design needs its inline amendments (B9) | applied in §4.1, §12 |
| the baseline's first write and per-heading counts; moved sentences (B10) | applied in §7.6 and §7.1 |
| §7.2 sections by heading and line; licence sections excluded (C1) | applied |
| list bullets need tags (C2) | applied in §6 |
| SKILL.md:109 and :111 differ in the last word (C3) | applied in §11.3 |
| evals.js reads context.json in code; rejudge.js gets the gate (C4) | applied in §4.1 and §5.3 |
| denials of any reason reported (C5) | applied in §8.1 and §8.2 |
| subagent lines excluded from the peak (C6) | applied in §5.3 |
| baseline file missing fails closed; frontmatter skipped (C7) | applied in §7.6 |

Not checked by either reviewer and still open: whether `claude -p "/autocompact"` prints the window line in print
mode under a fresh `CLAUDE_CONFIG_DIR` on the gateway route, which the dated preflight of §5.1 settles; the
1,024-character description limit (§11.2); whether the private audit allow-list pins register cells.
