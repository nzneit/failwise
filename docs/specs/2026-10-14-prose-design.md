# Prose: design

**Date:** 2026-10-14
**Status:** approved in conversation section by section; written for review before planning
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

The 0.7.0 round failed every (prompt, capability) pair. Three must criteria account for every scored failure:
c1, the missing scaling limit of the pricing service is not recorded as an open assumption; c5, a priority is
named in the hand-over without the provisional caveat; c11, a rationale substitution is left out of
`meta.history`. The c1 failure has recurred since 0.1.0 in text that predates the flow-model branch.

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
| D4 | Rubric 4 is frozen for all three rounds after the one amendment stage 0 makes (the `not_applicable` flows state the user ruled on 2026-10-13). `rubric.md` is otherwise out of scope: it is the instrument. | §5.2, §4 |
| D5 | The descriptive sections of the references and all frozen text (§4.3) are out of stage 2; the prose checker's ratchet holds them from getting worse. | §7.3 |
| D6 | The two new lints are warnings, not blockers, so a valid document still renders and the c1 reading of rubric 4 is unchanged. | §6.4 |
| D7 | The prose checker is a ratchet against a baseline file, not a set of hard caps, and fails closed. | §7.6 |
| D8 | Fable judges at three gates only; drafting, critique, implementation and eval judging run on Opus and Sonnet. | §9 |
| D9 | The twelve pre-existing inconsistencies the readers found (§11.3) are logged, not fixed on this branch. | §11 |
| D10 | STE is applied as structure plus five vocabulary substitutions. The rest of the STE dictionary is not applied, because it collides with domain terms (§7.5). | §7 |
| D11 | The context-window gate moves from the gitignored round scripts into the tracked harness, each run records its window and compactions, and a run that compacted is unverified. | §5.3 |
| D12 | Stage 1 changes nothing in the prose beyond what §6 names, so its round measures placement, wording and the checks alone. | §6 |

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
| p1/high/run1 | c1 | never engaged: no reasoning touches pricing's limit; searches for "item 4", "checklist" and "scaling limits" return 0 |
| p1/high/run2 | c1 | engaged, misapplied: wrote `"limits": "no rate limit published in the inputs"` into the edge and asked nothing |
| p1/medium/run1 | c1 | engaged, misapplied: "no limit stated, so the capacity rule doesn't apply"; read "an input the analysis needs" as "an input a rating rule consumes" |
| p1/medium/run2 | c1 met | found the gap while filling the edge's `sla` and `limits` slots; wrote the assumption and a placeholder in the field; fails c2 instead |
| p7/high/run1 | c5 | never engaged: zero hits for caveat, "never presented" or hand-over near the final message; the T28 checklist restated the first clause of `SKILL.md:41` and dropped the priority clause |
| p6/high/run2 | c11 | engaged, misapplied: noticed the empty cell, routed it to an open assumption, counted as substitutions only "fields with no column" |
| p6/medium/run2 | c11 | engaged, misapplied: quoted `SKILL.md:71`, asked whether "where one exists" means the column or the cell, wrote "Record substitution.", then enumerated only missing columns |

Three facts from the skill's own text fed the c1 failures: item 4 says scaling limits for every edge provider
"whatever its boundary", while `references/design-inputs.md:44` and the reviewer rule at
`references/quality-and-lint.md:84` say "for internal dependencies", and pricing is outside the boundary; the
schema's descriptions of `sla` and `limits` end "Nothing computes on it."; and no lint checks an edge for a
missing value. The runs recorded the gaps a named rule, a lint or the fixture's own wording raised, fixed every
validator finding, and treated clean validation as done.

## 4. Scope

### 4.1 In scope

- `SKILL.md`: stage 1 inserts (§6), stage 2 restructure (§7.1).
- The procedural sections of the references (§7.2) and the small wording changes of §6.
- `schemas/fmea.schema.json`: the descriptions of `sla`, `limits`, `rationale` and `history.change` (§6.2). No change to validation.
- `scripts/lib/lints.ts` and `scripts/render.ts`: two lints and one printed line (§6.4).
- `tools/run-eval.sh` and a new `tools/eval-context.ts`: the harness changes (§5).
- `tools/workflows/evals.js`, `tools/eval-stability.ts`, `tools/eval-report.ts` and `evals/rubric.md`: the `not_applicable` flows state only (§5.2).
- A new `docs/style.md` and a new `tools/check-prose.ts` with its baseline under `dev/` (§7.4 to §7.6).
- Tests for all of the above.

### 4.2 Out of scope

- `evals/rubric.md` beyond §5.2, and `evals/prompts.json`, whose texts tests pin verbatim.
- The descriptive sections of the references (D5).
- The judge prompts in `tools/workflows/evals.js` and `rejudge.js`.
- The twelve inconsistencies of §11.3, the other skill findings of the 0.7.0 acceptance note (the update summaries' missing inventory controls, the converter's boundary typing of the payment gateway, `cat-dependency-01`'s cause column), and the shape of the report.
- An after round on Claude models (§8.5), which stays an option once stage 2 passes.

### 4.3 Frozen text

Text no stage changes, because a test, a licence, a script or the private audit depends on its exact form:

- every `sourced:` reproduction (the DORA definitions, the Howie tables), the NASA quotation, the licence attribution blocks and their statements of changes, and the register cells on the audit allow-list;
- every anchor row of `references/scales-software.md`: a change bumps the scales version, breaks the test pinned at version 2 and marks every rated row stale;
- the generated region of `references/structure-elements.md` between the `vocabulary:start` and `vocabulary:end` markers, which changes only through its JSON;
- the 61 literals the pinned-literal scan found in tests under `scripts/` and `tools/` (`build/prose/brief.md`, "Pinned literals"), among them: the Scripts block and its command lines, the `### Migrate a v1 document` and `### Migrate a v2 document` headings and the stale-reason precedence line in `SKILL.md`; the validator-id and lint-id sentences and the reviewer rows matched by line prefix in `references/quality-and-lint.md`; `scales version: 2`, the two scale headings and the range sentence in `references/scales-software.md`; the DF4 disclaimer row in `references/methodology.md`; rule 7 of `references/work-tracking.md`, which a test finds as the first column-0 line starting `7. `;
- twin text that two files carry identically on purpose: `SKILL.md:36`, `:62-63`, `:110`, `:117-119` and `:129` against `references/structure-elements.md`, and `SKILL.md:35` against `references/design-inputs.md` and `references/quality-and-lint.md:67`. Stage 2 may shorten the `SKILL.md` copy only by the rule of §7.1, never the reference's copy.

Two pinned literals change by design and their tests with them: the sentence at `references/quality-and-lint.md:25`,
"The machine lints the scripts implement are nineteen:", becomes twenty-one with the two new ids in its list
(§6.4), and the frontmatter description of `SKILL.md` is shortened in stage 2 if §11.2 confirms the limit.

## 5. Stage 0: the harness and the baseline

### 5.1 The user's global instructions stay out of runs

`tools/run-eval.sh` runs the CLI without `--bare` (its 2026-09-11 preflight found `--bare` dropped the skill), so
eleven of the twelve 0.7.0 transcripts quote or apply `~/.claude/CLAUDE.md`, and one run lost its scores to it.
The fix is a `CLAUDE_CONFIG_DIR` per run: a fresh directory holding only what the run needs, with no `CLAUDE.md`,
no memory, no user skills and no plugin other than the one under test, which `--plugin-dir` already supplies. The
plan settles by inspection what the gateway route to `deepseek-flash` needs from the user's settings and copies
only that. A test asserts the directory the harness builds holds no `CLAUDE.md` and no memory, and the round's
pass line (§8.2) asserts no transcript contains any of three sentinel phrases from the user's file: "Never add AI
attribution", "Tier the models" and "Verification fails closed".

### 5.2 The `not_applicable` flows state

The user ruled on 2026-10-13 that the flows stability predicate is not applicable to a prompt whose inputs name
no flows, so a prompt-6 pair can pass stability. `evals/rubric.md:236` gains the state, `tools/eval-stability.ts`
reports it when both runs carry no flows and the prompt's inputs name none, `tools/workflows/evals.js` and
`tools/eval-report.ts` treat it as a pass of that predicate, and their tests follow. This is the only rubric change
on the branch and it lands before the baseline round, so all three rounds judge under the same text (D4).

### 5.3 The context window is recorded and gated

The gitignored round scripts set `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000` and `CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432`
for `deepseek-flash`, whose window the CLI would otherwise take as 200k, and refuse the round unless the CLI
reports the window. Nothing tracked does this, and no run records the window it ran under. The design moves it:

- `tools/run-eval.sh` carries a per-model table of the two settings; a Claude model needs neither and gets neither.
- Before each run the harness runs `claude -p "/autocompact" --model <model> --max-turns 1` and refuses to start unless the reply contains `786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)` and does not contain `capped`.
- After each run a new `tools/eval-context.ts` writes `context.json` beside `invocations.json`: the two settings, the probe's line verbatim, `compactions`, the count of `transcript.jsonl` system lines with `"subtype":"compact_boundary"`, and `peak_context_tokens`, the maximum over assistant lines of `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` in `message.usage`. On the uncapped 0.7.0 round that computation gives 238,429 for p1/medium/run2, the figure recorded on 2026-10-13.
- The judge in `evals.js` reads `context.json`. A run with no `context.json`, or with `compactions` above 0, is unverified and never scored, the rule 2fea11a set for a run with no report. `tools/eval-report.ts` prints the window and the peak per run.

### 5.4 The baseline round

The round of §8.1 on the current text, under the harness above. It passes when every run has `invocations.json`
and `context.json` with zero compactions, no transcript contains a sentinel phrase, no script call is denied for
the `bun` reason, and the prompt-6 stability check reports `not_applicable`. The baseline is recorded, not graded.
It should reproduce the c1 failure on prompts 1 and 5; if it does not, the premise is weaker than §3 says and the
user decides before stage 1 starts.

## 6. Stage 1: behaviour

Each criterion gets the same three-part treatment: the rule stated where the output is written, a "before you
write" list the model runs before the Write, and a machine check the validator reports. Nothing else in the prose
changes (D12). Every new or changed sentence carries its provenance tag.

### 6.1 Wording and placement in `SKILL.md`

**c1, missing limits.**
- Step 2's edge sentence (`SKILL.md:36`, "Write every dependency the inputs classify as an edge…") gains, as its own sentences: a provider whose SLA or scaling limits the inputs do not state gets an open assumption owned by `user` naming the provider and the missing value; nothing is written into `sla` or `limits` for a value the inputs do not state, a placeholder included. `[skill-authored]`
- Step 1 ends with a list headed "Before you write the document:": every input the checklist of design-inputs asks for that the inputs do not supply is an open assumption owned by `user`, status open, and a question in your final message.
- Step 2 ends with a list headed the same way: every edge carries `sla` and `limits` from the inputs, or an open assumption names its provider and the missing value; no field holds a placeholder.
- `references/design-inputs.md:14`, item 4, keeps its cell and gains a second sentence: the source states this for internal dependencies `[paraphrased:C014]`; this skill asks it of every edge provider, inside or outside the boundary `[skill-authored]`. The same skill-authored sentence follows `references/design-inputs.md:44` and is added to the `design-inputs-declared` cell at `references/quality-and-lint.md:84`, so the three places no longer argue both ways.

**c5, the priority caveat.**
- The clause at `SKILL.md:41` is replaced by explicit sentences: when you name a priority in a message, say in the same sentence that it rests on provisional ratings, while any rating under it is provisional. Then name, as the next step, a named person re-scoring each rating against the anchors, one rating at a time.
- Step 7 gains a list headed "Before you send the final message:", and that sentence is its first item, followed by: list every open assumption as a question.

**c11, substitutions.**
- `SKILL.md:71`'s "where one exists" becomes: where the column exists and the cell is filled; an empty cell takes the default and counts as a substitution on that row.
- The Convert section ends with a list headed "Before you write a converted document:": `meta.history` names every column used, every field substituted and on how many rows, an empty cell counted like a missing column; the final message repeats the count.

### 6.2 Schema descriptions

The model reads field descriptions at the point of writing, so they carry the rule too. No validation changes.

- `$defs/dependencyEdge/properties/sla/description` and `…/limits/description`: "Nothing computes on it." is replaced by: when the inputs state none, leave the field out and record an open assumption owned by `user` naming the provider; never write a placeholder.
- `$defs/rating/properties/rationale/description` gains: an empty cell in a sheet that has a rationale column takes this default too, and that row counts as a substitution recorded in `meta.history`.
- `$defs/historyEntry/properties/change/description`: "the fields it substituted with row counts" becomes "the fields it substituted with row counts, empty cells included".

A test asserts each new sentence is present, so a later schema edit cannot drop it silently.

### 6.3 Stage 1 leaves alone

The paragraph shapes, every other sentence, the rubric, and the references outside the three cells named above.
The stage-1 round therefore attributes any change in scores to §6.1, §6.2 and §6.4 together.

### 6.4 The machine checks

Two lints in `scripts/lib/lints.ts`, warnings, reported by `validate.ts` and in the report's lints section like the
nineteen existing ones, and one printed line in `render.ts`.

**`edge-reliability-unstated`** (warning). For each edge in `dependencies[]`, a field among `sla` and `limits` is
unstated when it is absent, empty, or matches the placeholder pattern: case-insensitive, `not stated`,
`none stated`, `no … stated|published|given|known|provided|recorded`, `unknown`, `n/a` or `tbd` as whole words.
The lint fires when at least one field is unstated and no entry of `meta.assumptions[]` with `status: open` and
`owner: user` names the provider, by its element id or its name, case-insensitive. Message:
`edge <from> -> <to>: <field> is not stated and no open assumption names <to>; record the missing value as an open assumption owned by user, or copy it from the inputs`.
An unstated field beside such an assumption does not fire, matching the c1 ruling of 2026-10-13 that a field
beside an open assumption is not scored 0.

**`conversion-substitution-unrecorded`** (warning). Let `r` be the number of chains with at least one rating whose
`rationale` matches `^converted from .+; no rationale recorded$`. The lint fires when `r > 0` and no
`meta.history[]` entry's `change` text contains both the word `rationale` and the integer `r` as digits. Message:
`<r> row(s) carry the default rationale and meta.history records no rationale substitution with that count`.

**The render line.** After a successful render, when `n > 0` ratings are provisional, `render.ts` prints one line
to stdout: `provisional: <n> of <m> ratings are provisional. Every priority you state rests on provisional ratings: say so in the same sentence, and name a person re-scoring each rating against the anchors, one at a time, as the next step.`
`render.ts` is the last script output the model reads before it composes the message.

`references/quality-and-lint.md:25` and its id list become twenty-one with the two ids, and the test that pins
them follows. The two lints get rows in that file's machine-lint table with their severity and `[skill-authored]`.

## 7. Stage 2: readability

### 7.1 The structure pass on `SKILL.md`

- Each step of the spine becomes one lead sentence stating what the step produces, then a vertical list of rules in the order the model acts, one rule per bullet, each starting with the command verb, the rule before its reason, a warning before the step it guards, and the stage-1 "before you write" list closing it.
- The other modes, seed, convert, update and the two migrations, take the same shape. The Scripts section and the Reference files section become tables, with the pinned command lines kept byte for byte as single lines.
- A reason that is not a rule, such as the IEC 60812 clause-order citation and the LLM-rating study in step 5, moves to the reference file that owns its topic with its tags, and `SKILL.md` keeps a one-line pointer. `SKILL.md` is the one file every run loads whole, 46k characters at the skill load in the 0.7.0 round, and this is what shortens it.
- Where `SKILL.md` repeats a reference near-verbatim (§4.3), the reference keeps the full text and `SKILL.md` keeps the short imperative with a pointer. The twin in the reference is not touched.
- Numbering other files cite stays: steps 1 to 7, the migrations' headings, and every heading a test or a script message names.

### 7.2 The sentence pass on the procedural sections of the references

The sections the inventory marked lead-plus-list: in `design-inputs.md`, "Flows, components and dependencies",
"Incident history", "The control inventory", "Ground rules and assumptions", "Contracts and data flows" and "The
non-catalog source rule"; the role, boundary and security tests of `structure-elements.md`; the reviewer-rule
prose of `quality-and-lint.md`; the rules of `work-tracking.md`; the procedure of `method-selection.md`; "Reading
a row" in `design-failure-catalog.md`; "Why severity-first" and "What this file never carries" in
`methodology.md`; and the procedural sections of `scales-software.md` and `provenance.md` the brief's section
tables mark, anchor rows excepted. The full list with line numbers is the brief's "Sections per file".

For each: a sentence over 25 words is split at a clause boundary; the voice is active; one rule per sentence; a
paragraph of more than six sentences becomes a list. Only the five safe substitutions of §7.5 apply. Every stated
uncertainty, every caveat that is content ("stays provisional until", "no standard in the corpus binds", a licence
condition) and every "may" that grants permission stays.

### 7.3 Left alone

The descriptive sections of every reference, the frozen text of §4.3, and `rubric.md` (D5). The prose checker's
ratchet (§7.6) keeps their counts from rising.

### 7.4 Tags

- One tag per sentence, bullet or table cell, as the private checker's rule reads. A bullet carries one tag at its end and may hold several sentences. A bullet that would mix sources is split into two bullets, so no bullet carries a mixed tag.
- A split sentence keeps its tag on each part. A `paraphrased:`, `adapted-from:` or `cites:` sentence is split at a clause boundary only and never reworded on this branch, so the private distill check meets no new claim.
- A changed reference file still goes through the private repository's distill check stage before commit, with the verdict in the commit body, and the restricted-wording audit runs from the private checkout before the user pushes.

### 7.5 Vocabulary

The dictionary scan found the STE substitutions safe in five cases and damaging elsewhere.

| Apply | Do not apply |
|---|---|
| need for require, outside the four `*-required` invariant ids, JSON Schema's `required`, the DORA definitions, NIST's "a required security property" and the licence-obligation sense | check for verify: collides with `--check`, `update-check.ts`, "checker" and the noun "check" |
| do or make for perform, outside the MIL-STD-1629A title and Occurrence anchor row 8 | end or stop for terminate: collides with `effects.end` and "a stopped `apply`" |
| through for via | change for modify: collides with the `*-changed` reasons, `--change-table`, `IO_CHANGED` and `history[].change` |
| more for additional | start for initiate: breaks "initiating event" |
| obey for follow, only where the sense is obey (`SKILL.md:15`, `:156`, `quality-and-lint.md:179`, `:180`, `scales-software.md:133`, `methodology.md:5`, `cat-component-05`) | try for attempt: the skill's "attempt" is a noun; test as a verb: the four verb uses are rewritten, the noun stays; near for close: only `design-failure-catalog.md:66` |

Words the skill uses in more than one sense (record, state, flag, control, review, check, end, change, open, status,
and sixteen more in the brief's "Vocabulary") are not unified on this branch. The style rule asks that no new sense
be introduced and that the schema's word be preferred.

### 7.6 The style rule and the prose checker

**`docs/style.md`**, one page, pointed to from `CONTRIBUTING.md`: the two text classes and how to tell them apart;
the procedural shape of §7.1; the caps, 20 words for an instruction and 25 for a description, six sentences for a
procedural paragraph; rule before reason, warning before the step; the same word for the same thing with the
schema's word preferred; the table of §7.5; the tag rules of §7.4; the frozen-text list of §4.3; and what a change
to a sourced sentence requires.

**`tools/check-prose.ts`**, run by `tools/check.ts` after the three existing checks, over `SKILL.md`,
`references/*.md` and `evals/rubric.md`:

- One measurement basis for every file: tags stripped, a code span one word, parentheticals kept, table cells measured, headings and code fences skipped, the register table and the generated region exempt.
- Three counts per file: sentences, bullets and cells with no tag outside the exempt regions; sentences over 25 words; and occurrences of the filler list, `basically`, `essentially`, `simply`, `actually`, `in order to`, never a modal.
- A baseline file `dev/prose-baseline.json` holds each file's three counts. The check fails when any count rises above its baseline. A test asserts no baseline entry is above the measured count, so lowering the baseline is the only edit that passes, and the baseline cannot drift up.
- It fails closed: a file it cannot read or parse, a file in the baseline that is missing, a file in scope that the baseline lacks, or a run that measures nothing, is a failure. Every run prints the counts per file.
- It is the same command in bash and fish, like the other runners.

## 8. Measurement and acceptance

### 8.1 The round

Prompts 1, 5, 6 and 7, at high and medium, two runs each, 16 runs, on `deepseek-flash` at effort high for both
capabilities as in the 0.7.0 round, judged by `tools/workflows/evals.js` under rubric 4 with `args.prompts` set
to all four, with `rejudge.js` for a disputed criterion as before. Prompt 5 is scored on c1 to c10 and shares the
planted gap with prompt 1; its last result predates the flows table of 23eb1c4. Each round's directory is
`build/evals/prose-<stage>/`, its note `docs/specs/2026-10-14-prose-eval-results-<stage>.md`, generated by
`tools/eval-report.ts`.

### 8.2 Stage 0 passes when

Every run has `invocations.json` and `context.json` with `compactions: 0`; no transcript contains a sentinel
phrase from the user's global file; no script call is denied for the `bun` reason; the prompt-6 stability check
reports `not_applicable`. Recorded, not graded.

### 8.3 Stage 1 passes when

- Every pair that c1, c5 or c11 applies to passes that criterion in both runs: c1 on all four prompts, c5 on prompts 1, 5 and 7, c11 on prompt 6.
- No pair that passed a criterion at baseline fails it after.
- Each run's `validate.json` shows whether the new warnings fired and whether the run resolved them, read in the note.
- On a failure: the failing transcripts go through the analyst-and-skeptic read of the brief's premise phase, the change is revised once, the round runs once more. A second failure goes to the user.

### 8.4 Stage 2 passes when

- No pair scores worse than at stage 1 on any criterion, and stability holds where it held.
- `dev/prose-baseline.json` is lowered to the new counts, with zero over-cap sentences and zero untagged items in `SKILL.md` and the sections of §7.2 outside frozen text.
- The note reports `SKILL.md`'s size at the skill load before and after.

### 8.5 What the rounds cannot separate

Stated in every note: stage 1 measures placement, wording and the checks together (D12); judge variance is bounded
by the pair rule and by rejudging; the model is the one the 0.7.0 round used, so a gain on Flash is not yet a gain
on Claude, and an after round on Opus at high and Sonnet at medium remains an option once stage 2 passes.

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
| Stage 2 drafting | one drafter per `SKILL.md` section and per §7.2 section; one rule-preservation critic per draft listing every rule before and after, flagging any rule lost, added or changed, checking tags | Opus |
| Stage 2 checks | the prose checker and the pinned-literal tests after every file; the private distill check per changed reference | scripts |
| Stage 2 result gate, final acceptance | one judge reads the diff, the results note, §8.4 and the rewritten `SKILL.md` as one document, asking whether a model acting from it would do the right thing in the right order | Fable (3) |
| Eval judging | the existing workflow: Opus judges, Sonnet stability and persist, Opus critic | Opus, Sonnet |

Every report names the tier per phase and the Fable count. Three Fable subagent calls are planned; the controller
runs on Fable throughout.

## 10. Testing

- The two lints: fixtures that fire and do not fire in `scripts/lints.test.ts`, the placeholder pattern, the id-or-name match, the `r` count against chains not ratings, and the output in `validate.test.ts`.
- The render line in `scripts/render.test.ts`: printed when `n > 0`, absent when `n = 0`, exact text.
- The schema sentences of §6.2 in `scripts/schema.test.ts`.
- `tools/eval-context.ts`: a fixture transcript with and without a `compact_boundary` line, the peak computation, a missing transcript fails closed; the unverified rule in `tools/eval-report.test.ts`; the probe gate and the config directory in `tools/run-eval.test.ts`.
- The `not_applicable` state in `tools/eval-stability.test.ts`, `tools/eval-report.test.ts` and the `CRITERIA` sync test.
- `tools/check-prose.ts`: the three counts on a fixture, the exempt regions, the ratchet, every fail-closed case, the baseline-not-above-measured test.
- The pinned-literal tests stay green through stage 2 except the two changed by design (§4.3).
- `node tools/run-tests.ts` and `node tools/check.ts` before every commit. The browser gate and the comparison when the new warnings change the checkout fixture's report, which the plan checks by rendering it.
- Verification fails closed throughout: an unverified run or an unrun check is reported as such in every note.

## 11. Risks, follow-ups and open items

### 11.1 Risks carried

- A warning the runs ignore. If stage 1's round shows the new warnings fired and unresolved, the revision makes them blockers.
- Judge variance masking or faking a gain, bounded by the pair rule and rejudging.
- Twin text and line-number citations in older documents going stale under the stage-2 restructure. The plans and the flow-model acceptance note are historical records and are not rewritten; the spec notes it.
- The private checks are the only verification of reworded sourced text; the branch avoids rewording it (§7.4), and every changed reference file still passes the distill check before commit.

### 11.2 To verify in stage 2

The frontmatter description of `SKILL.md` is 1,183 characters. The brief reports a 1,024-character limit for a
Claude Code skill description. The plan verifies the limit against the Claude Code documentation; if it holds, the
description is shortened in stage 2 and the skill's triggering is checked with the plugin eval or skill-doctor
tooling, since the eval rounds name the skill explicitly and do not measure triggering.

### 11.3 Logged, not fixed on this branch

The readers found these while inventorying; each is a content question for its own change:

- the catalog's 60% at `design-failure-catalog.md:55` against `quality-and-lint.md:103`'s "59 percent";
- `NOTICES.md` saying `adapted-from:C090` appears once in `quality-and-lint.md`, where it appears twice;
- `SKILL.md:109` and `:111` identical;
- `SKILL.md:122` against `:123`;
- the dangling §5.5 reference at `SKILL.md:98`;
- `provenance.md`'s row counts (44 rows described of 64);
- `scales-software.md:129`'s "refused only when its shape fails" against `TABLE_ID_MISMATCH`;
- where the ML or LLM questions live, catalog `component` against a structure-elements `service`;
- `cat-dependency-01`'s cause column restating its own mode (already an agreed follow-up);
- the update summaries' missing inventory controls and the converter's boundary typing (0.7.0 skill findings);
- the differing word-count bases in the inventory, which the checker's single basis replaces;
- the frontmatter description length (§11.2).

## 12. Acceptance criteria

1. Stage 0's harness changes are merged on the branch with tests, and the baseline round meets §8.2.
2. Stage 1's changes are exactly those of §6, every new sentence tagged, the two lints and the render line tested, and the round meets §8.3, or the user has ruled on its failure.
3. Stage 2's rewrite touches only §7.1 and §7.2, keeps every frozen literal of §4.3, lowers the baseline per §8.4, and the round meets §8.4, or the user has ruled on its failure.
4. `docs/style.md` exists and `CONTRIBUTING.md` points to it; `tools/check-prose.ts` runs under `tools/check.ts` and fails closed.
5. Every changed reference file passed the private distill check, with the verdict in the commit body, and the audit passed from the private checkout before the user pushes.
6. Each round has its results note; the acceptance note lists every unverified cell, names the tier per phase and the Fable count, and states §8.5.
7. No commit carries AI attribution, and nothing is pushed by the agent.
