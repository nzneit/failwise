# fmea-software v1 acceptance note

**Date:** 2026-09-15 (the re-gate; the first gate was 2026-09-11 and this note replaces it)
**Decided by:** the user, with the session
**Artifacts under review:** the plugin as it stood when this note was first committed, on 2026-09-15, in the repository where it was built (kept private as nzneit/failwise-research); the eval results in `docs/specs/2026-09-07-eval-results.md`; the raw judging in `build/evals/results.json` (gitignored).

**What changed since the 2026-09-11 gate.** That gate did not accept v1 and listed five things to do
first. Items 1 to 4 of that list are discharged here: the sixteen runs were repeated on 2026-09-12
under the corrected harness, judged against the rubric as it now stands, the completeness critic was
re-run, and criterion 2 is re-scored below on that evidence. Item 5 — the four rubric thresholds,
deferred from that gate as its own question — was put to the user at this gate and answered; see
"Threshold changes". No score in this note is carried over from the first round.

**The runs this note scores.** Sixteen runs, four prompts × two model capabilities × two runs, made
2026-09-12 03:58–05:50 by `tools/run-eval.sh`. Every run's `models.json` records
`basis: "FMEA_EVAL_MODELS"`, `models: {high: "glm-5.3", medium: "glm-5.3-flash", low: ""}` and
`effort: "high"` — so the *high* capability was filled by glm-5.3 and *medium* by glm-5.3-flash, and
§15 criterion 2 is scored on that evidence by the user's ruling at candidate 11. The judging is a
separate table: `results.json`'s `models` field records `{high: "opus", medium: "sonnet", low:
"haiku"}`, the default, so the sixteen judges and the critic ran on Opus and the mechanical stages on
Sonnet. The two tables can differ and nothing but this paragraph reconciles them.

## Blocking list

Every entry of `critic.blocking_candidates` in `build/evals/results.json`, in the order the critic
listed them, then every entry of that file's top-level `unverified` list. That list is empty this
round: all 26 agents of the judging workflow and all 8 of the re-judging workflow returned, so no
unit is a hole in the evidence.

Where the "Rationale" cell reads *the user selected "Take my recommendations above"*, the ruling is
the user's and the reasoning behind it is the session's recommendation they adopted, not words they
supplied; where it quotes a longer phrase, those are the words of the option the user chose. No
rationale below is attributed to the user that the user did not give.

| # | Source | Blocking candidate | Ruling | Rationale, as the user gave it |
|---|---|---|---|---|
| 1 | critic | Only three of the eight (prompt, model capability) pairs pass — p6/high, p6/medium and p7/high — so design §15 criterion 2 fails on the re-run, and you must rule whether v1 is blocked again or accepted on a narrower claim. | blocks v1 | the user selected "Take my recommendations above", the recommendation being that this item follows arithmetically from the others. After the c1 re-judging of candidate 2 the count is unchanged at three of eight. Criterion 2 is recorded `fail` below and v1 is not accepted. |
| 2 | critic | c1 was scored 0, 1 and 2 on four runs with the same fact pattern, and the two 2s (p1/medium/run2, p5/high/run1) are recorded as passes although no assumption in either names pricing's scaling limit — rule which reading governs and whether those runs are re-judged before any pair is accepted. | fix now — done at this gate | the user selected "Fix now: reconcile, then re-judge", and, when told the reconciliation ran the opposite way from the option's own parenthetical, "Proceed — strengthen and re-judge". See "Threshold changes" for the clause change and the outcome. |
| 3 | critic | Rule whether c1's planted-gap clause is a fair must at all, given that none of the eight prompt-1 and prompt-5 runs named the gap and references/design-inputs.md item 4 asks for scaling limits only for internal dependencies while the fixture leaves pricing's boundary open. | fix now — resolved against the critic's premise | the same ruling as candidate 2. The premise is wrong on the fixture: `checkout-inputs.md` types `pricing` as `service` with parent `none`, the only `external_dependency` in it is `checkout.payment-gateway`, and `design-inputs.md` line 35 makes an internal dependency "any other element that carries one". Item 4 therefore does ask for pricing's scaling limit, so the clause is a fair must and was tightened rather than relaxed. The user was shown this inversion and confirmed the direction before the re-judging ran. |
| 4 | critic | Four pairs fail stability — p1/high, p1/medium, p5/high and p5/medium — every one on the 0.2 count bound alone, so rule whether the bound moves, whether the skill's coverage rule is revised again, or whether the failure stands. | does not block v1 as a threshold question; the four failures stand | the user selected "None — all four stand as written" on the thresholds, and "Take my recommendations above" here, the recommendation being to keep 0.2 and record the four failures as real. They are real: the pairs differ by up to six H rows on identical inputs at the same capability. |
| 5 | critic | The Jaccard half now returns exactly 1.0 in all eight pairs because each prompt's element set is fixed by its input inventory, so rule whether the 0.8 id-basis floor stays as the §3 instability guardrail, is supplemented by a chain-count bound, or is dropped as measuring nothing. | does not block v1; recorded for v1.1 | the user selected "None — all four stand as written" and "Take my recommendations above". The floor stays at 0.8 and is recorded here as measuring nothing on this fixture set: all eight pairs returned exactly 1.000, so every verdict turned on the count bound alone. A chain-count bound is the v1.1 candidate. |
| 6 | critic | The prior gate deferred the four rubric thresholds — the Jaccard floor 0.8, the count fraction 0.2, the 80% rule and each criterion's must flag — to this gate as its own question, and it must be put and answered here, one line each even where the answer is no change. | fix now — done at this gate | the question was put and the user answered "None — all four stand as written". The four values now stand by ruling, not by default. Recorded in "Threshold changes". |
| 7 | critic | p7/medium fails only because the final message says ch-8 "H/384" where the document says M, so rule whether a hand-over prose slip fails a must and whether the report must stop printing an RPN beside a band value that does not order with it. | does not block v1; the failure stands | the user selected "Take my recommendations above", the recommendation being to record the c6 failure as real and narrow, and to file the report's RPN-beside-band display for v1.1. c6's clause is written to catch a priority stated in prose that differs from the document, and that is what happened. |
| 8 | critic | Rule whether c12 band 2 covers any edit to a row outside the stale set or only its ratings and review status, since p7/high/run1 added a trigger to ch-3 and ch-5 and p7/high is one of the three passing pairs. | does not block v1; recorded | the user selected "Take my recommendations above". The edit is a field completion, not a re-rating, so c12 band 2 as written is not tripped; that p7/high passes with it on the record is stated here rather than resolved by re-reading the band. |
| 9 | critic | Rule whether prompt 5 gains a mode-specific criterion, since nothing in the rubric scores the seeding behaviour the prompt exists to test and a run that ignored the three postmortems could still score 20/20. | does not block v1; recorded for v1.1 | the user selected "Take my recommendations above", the recommendation being to record the four rubric-coverage gaps (9, 10, 13, 14) as measured and fix them in v1.1. All four p5 runs did in fact seed from the three incidents; the criterion that would have required it does not exist. |
| 10 | critic | Rule whether c11 must also pin the converted element set, since three of four prompt-6 runs typed the payment gateway as a service with no dependency block against the fixture's external_dependency with strength strong and still scored 20/20. | does not block v1; recorded for v1.1 | the user selected "Take my recommendations above". Both passing prompt-6 pairs rest on a criterion that does not look at the only measured divergence from the answer key. |
| 11 | critic | Rule whether an eval gate run wholly on glm-5.3 and glm-5.3-flash discharges §15 criterion 2 for a plugin whose §14 assumption is that the team runs Claude Code, or whether the sixteen runs must be repeated on the default Anthropic table. | does not block v1 | the user selected "Yes — capability is the axis": "The 2026-09-12 amendment made the axis a model capability explicitly so the same judging covers any provider's lineup. Criterion 2 is scored on this evidence, and the note records which model filled each capability." Recorded in the preamble above. |
| 12 | critic | Rule whether tools/eval-report.ts's opus- and sonnet-keyed stale rosters are rewritten or replaced by a computed check before the results document is regenerated, because as written it will assert that every c1 score ruling 3 governs has been re-judged while two current runs carry that very score. | fix now — done at this gate | the user selected "Take my recommendations above". The critic's specific prediction is wrong — the sentence it quotes sits inside `staleCriticClosing`, which is gated on a critic entry this round does not carry, so it never printed; verified against the generated document. The defect behind it is real: a roster that matches nothing returns the same empty list as a roster that came back clear. `unreachableRosters` now reports any roster that reaches no run, under a new "Checks that could not be evaluated" section, and three tests pin it. |
| 13 | critic | Rule whether c9 should be excluded from prompt 6 the way c5 was, since all four prompt-6 runs satisfy that must with an empty catalog_refs on every chain. | does not block v1; recorded for v1.1 | the user selected "Take my recommendations above". A must satisfied by an empty field in 4 of 16 runs measured nothing on that prompt; both passing prompt-6 pairs carry it. |
| 14 | critic | Rule whether eval coverage is adequate for v1 given that no run in sixteen produced a single L priority row and only two carried post_ratings, leaving the table's L band and c6's post_priority clause untested by the evals. | does not block v1; recorded for v1.1 | the user selected "Take my recommendations above". The priority table's L band and the stability check's L term are untested by this evidence, which is a statement about the evals' reach, not about the skill. |
| 15 | critic | Rule whether the absent launch log matters: two units show three scratch sessions each against one published run, and nothing in build/evals records how many attempts a unit took or why an attempt was discarded. | does not block v1; largely discharged by evidence | the user selected "Take my recommendations above". The session timestamps discharge the selection worry: for both flagged units the *published* run is the *last* session (03:58:30 for p1/high/run1 and 04:39:57 for p1/medium/run1, matching `scratchpad/evals-p1.log` exactly), and the earlier sessions are pre-loop probes — 01:56 is the probe recorded in `scratchpad/probe.log` with `FMEA_EVAL_PUBLISH_ROOT` redirected to `scratchpad/probe`, 03:29 matches the effort-ruling commit `dc96025`. Selection among attempts would show the published run as an earlier session, not the last. A launch log is still the v1.1 fix. |

## Eval scores

From `docs/specs/2026-09-07-eval-results.md`, the "Overall per prompt and model capability" table, as
regenerated after the c1 re-judging.

| Prompt | Model capability | Run 1 | Run 2 | Stability | Pass |
|---|---|---|---|---|---|
| 1 | high | FAIL | FAIL | FAIL | FAIL |
| 1 | medium | FAIL | FAIL | FAIL | FAIL |
| 5 | high | FAIL | FAIL | FAIL | FAIL |
| 5 | medium | FAIL | FAIL | FAIL | FAIL |
| 6 | high | pass | pass | pass | pass |
| 6 | medium | pass | pass | pass | pass |
| 7 | high | pass | pass | pass | pass |
| 7 | medium | FAIL | pass | pass | FAIL |

Pairs passing: 3 of 8.

Seven of the sixteen runs miss the per-run rule. Six miss it on the must `c1-missing-inputs-asked`,
now uniformly 0 across all eight prompt-1 and prompt-5 runs; the seventh, p7/medium run 1, misses it
on the must `c6-priority-by-script`, because its final message states "ch-8 H/384" where the document
carries `{value: "M", rpn: 384}`. Four pairs fail stability, every one on the 0.2 count bound alone;
the Jaccard half returned exactly 1.000 in all eight pairs.

## Threshold changes

**Threshold ruling: none — the four values stand as written, by ruling.** The question the 2026-09-11
gate deferred was put at this gate and the user answered "None — all four stand as written": the
stability Jaccard floor stays **0.8**, the count-difference fraction stays **0.2**, the total rule
stays **80%** of maximum, and every criterion keeps the must flag it had. Unlike at the first gate,
these four values now stand by a ruling rather than by default. No tool constant and no rubric
threshold changed, so no threshold row follows.

| Threshold | Before | After | Reason | Files changed |
|---|---|---|---|---|
| — | — | — | no threshold changed at this gate | none |

**One criterion's text changed, which is not a threshold change and is recorded here for the same
reason.** `c1-missing-inputs-asked` keeps its id, its `(must)` marker and its place in the
applicability counts, so no tool constant and no rubric-sync expectation moved; what changed is the
clause's prose.

| Change | Before | After | Reason | Files changed |
|---|---|---|---|---|
| `c1-missing-inputs-asked` clause | The clause asserted the planted gap without saying why the datum was owed, and its bands left room to read "records no assumption *there*" as "records no assumption at all" — the reading that produced two scores of 2. | The clause states why the gap is askable (item 4 of `references/design-inputs.md` requires the availability SLA and the scaling limits for internal dependencies, and the fixture's `pricing` is one under that file's own rule) and adds that a run recording the gap in neither an assumption nor the final message scores 0 whatever else it recorded, so general diligence does not substitute for this input. | the user's ruling, "Fix now: reconcile, then re-judge", confirmed as "Proceed — strengthen and re-judge" once the inversion was shown | `skills/fmea-software/evals/rubric.md`; `tools/workflows/rejudge-c1.js` (new); `docs/specs/2026-09-07-fmea-software-plan.md` (Task 33 Step 5, the clause-change procedure) |

**Outcome of the re-judging.** `tools/workflows/rejudge-c1.js` re-scored `c1` alone on the eight
prompt-1 and prompt-5 runs, one agent per run, three attempts each, fail-closed per plan reference
§C; all eight returned. **All eight scored 0, and not one named the gap** — so the 0/1/2 spread the
candidate complained of is cured, in the direction of the stricter reading. Three scores moved
(p1/medium/run2 and p5/high/run1 from 2, p5/high/run2 from 1), and two run verdicts moved from `pass`
to `FAIL`; both of their pairs were already failing on stability, so the pair count is unchanged at 3
of 8. No other criterion was re-judged and no run was re-judged whole.

**What the re-judging judges said against the clause they applied.** Two of the eight recorded,
unprompted, that they would have drawn the line elsewhere and scored it as written anyway. One:
"Scoring 0 puts this run level with one that invented 'pricing: 500 rps' as fact, and c1 is a must,
so this single omission fails the run outright despite eleven correctly-formed open assumptions…If
the gate wants partial credit for a run that invents nothing and asks for ten other things, that
belongs in band 1's text, not in a judge's discretion." The other: "`dependency.limits` is the field
design-inputs.md itself designates for this datum…writing 'None stated in the inputs' there is the
document doing what the checklist asks while inventing nothing — nearer in spirit to 'recorded, not
asked' (band 1) than to 'invented as fact' (band 0)…If the line is wrong it should move in the
rubric, not in this score." Both objections are recorded here rather than resolved; the clause stands
as the user ruled it, and whether band 1 should cover the field-value case is a v1.1 question.

## Outstanding distill findings

**No distill finding is open.** The phase 3 checkers' verdicts were reconciled by commit order, which
is what git can settle, with `build/distill-report.md` read only as corroboration (the file is
gitignored and append-only, so a verdict appended later does not clear a bullet committed later).
Every unit's newest verdict in the history is a `pass`, so the harvest numbered no open candidate:

- re-check `SKILL.md`: pass (run `wf_27b654c6-3b4`, commit `915593d`, `build/distill-report.md` line 322)
- re-check `methodology.md`: pass (run `wf_27b654c6-3b4`, commit `915593d`, `build/distill-report.md` line 324)
- re-check `provenance.md`: pass (run `wf_e6f0b287-369`, commit `915593d`, `build/distill-report.md` line 328)
- re-check `quality-and-lint.md`: pass (run `wf_d250ab7b-e4d`, commit `caa1f86`, `build/distill-report.md` line 333)

The last of these is newer than the plan's expected text anticipated: `quality-and-lint.md` was
edited again at `caa1f86` and re-checked there, so its clearing verdict is that commit's and not
`915593d`'s.

**Addendum, 2026-09-30.** The passes above were superseded after this note was written. On
2026-09-29, after the publication edits, the check stage was run again over `provenance.md`,
`methodology.md`, `method-selection.md` and `process-stub.md` (run `wf_a0af1085-bcc`,
`build/distill-report.md` lines 335-360) and failed all four with 25 findings, on text the passes
above had accepted, three of them licensing-class. The user ruled them resolved; commits `11fcd8c`
and `7dd1051` carry the fixes and their twins in `design-inputs.md`, `quality-and-lint.md`,
`SKILL.md` and `licenses/NOTICES.md`. The newest verdict per file, by commit order, is now:
`provenance.md` pass (run `wf_382e443f-62a`, line 403), `process-stub.md` pass (run
`wf_6637975f-4ea`, line 428), `SKILL.md` pass (run `wf_12d2dcc7-246`, line 396);
`methodology.md` (3 findings), `design-inputs.md` (2), `quality-and-lint.md` (6) and
`method-selection.md` (1) fail at run `wf_6637975f-4ea` (lines 423-437) on lines the correction did
not touch, none licensing-class, recorded in that commit's body as open. Criterion 3's evidence
below is therefore the 2026-09-15 state of the files, not the current one: the four files last
listed do not hold a clearing verdict at HEAD, and `design-failure-catalog.md` and
`scales-software.md` were not re-checked in this pass.

Every `licensed-content` finding the checkers ever raised — 21 of them, across
`design-failure-catalog.md` (6), `methodology.md` (9), `design-inputs.md` (2),
`quality-and-lint.md` (2), `process-stub.md` (1) and `provenance.md` (1) — is closed under the rule
the plan sets: for each of those six files the last section in the report reads `-- pass` and carries
no finding of that kind. That is the evidence behind criterion 5's third clause.

## Acceptance criteria

The seven criteria of design §15, each with a verdict and the evidence that supports it.

| # | Criterion (§15) | Verdict | Evidence |
|---|---|---|---|
| 1 | All unit tests in §10 pass under `node --test`. | pass | `node tools/run-tests.ts` at this commit: `## skill:` tests 239, pass 239, fail 0; `## tools:` tests 113, pass 113, fail 0. The tools count is 3 higher than at the first gate: the three tests pinning `unreachableRosters` (candidate 12). |
| 2 | The four eval prompts pass the rubric on both model capabilities, including the stability bounds, at the §10 thresholds or at thresholds this note records as changed. | **fail** | The Overall table above marks 3 of 8 pairs `pass`. Six runs fail the must `c1` and one the must `c6`; four pairs fail the stability count bound. No threshold was changed to make anything pass, and the one clause that changed (`c1`) made the criterion stricter, not looser. **Harness qualification, discharged by measurement this round:** grepping all sixteen `transcript.jsonl` for `expected.fmea.json`, `expected-stale.json`, `evals/rubric.md`, `checkout-service.fmea.json` and `prompts.json` returns zero hits each, so the 2026-09-11 answer-key contamination did not recur; permission denials fell from 33 to 8 across the sixteen runs, none leaving an artifact unproduced; the twenty `~/.claude/projects/-tmp-fmea-eval-*` memory directories are all empty. **Standing qualifications:** the runs were made on glm-5.3 and glm-5.3-flash, which the user ruled discharges the criterion (candidate 11); bare mode is unavailable under this login, so runs load the user's global configuration; `--allowedTools` grants `Read` with no path restriction. |
| 3 | Every sourced statement in every reference file and in `SKILL.md` cites a record id the checker confirmed; every other statement is tagged `skill-authored`. | pass | `build/distill-report.md`: the last section for each of the nine checked files reads `-- pass` (`SKILL.md` 322, `methodology.md` 324, `provenance.md` 328, `quality-and-lint.md` 333, `design-failure-catalog.md` 303, `design-inputs.md` 206, `method-selection.md` 193, `process-stub.md` 213, `scales-software.md` 289), and the outstanding list above is empty. Also checked here: the catalog's 19 content rows across four pipe tables all carry a provenance tag (27 lines begin `|`, and the only untagged ones are the four header and four separator rows). |
| 4 | `provenance.md` lists all 26 sources of the report's §9 bibliography with status, treatment, and tag permissions, and the checker rejects any tag other than `cites:` on sre.google and IEC records. | pass | The bibliography count is 26 and all 26 appear in `references/provenance.md`. The cite-only record set resolves to exactly `C016`–`C025`, `C036`–`C040`, `C051`–`C055`; a `grep` for `(sourced|paraphrased|adapted-from):` against any of those twenty ids over `skills/`, `docs/panels/` and `docs/specs/` returns no match (exit 1). |
| 5 | No AIAG-VDA cell value, no adapted or paraphrased SRE Book or IEC text, and no consuming-application detail anywhere in the plugin. | pass | First clause: the `aiag` sweep over `skills/` and `docs/panels/` returns 64 lines and every one states a fact *about* the handbook or its licensing (e.g. `SKILL.md:108` "No AIAG-VDA handbook cell value of any kind ships, anywhere in this plugin"); no cell value appears. Second clause: the tag sweep above returned no hits. Third clause (D12): `build/distill-report.md` carries no open `licensed-content` finding — all 21 are closed, as recorded above — and Task 28's fixture-fidelity lens reported no fixture naming a consuming application. `docs/evidence/` is deliberately outside both sweeps and is covered by the §12 pre-publication review instead. |
| 6 | The two panel records are committed and each states the default, the three variants, the criteria, and the ruling. | pass | `docs/panels/schema.md`: `## Default` (7), `## Variants` (137) with `### variant: form-first flat rows` (141), `### variant: fully normalized graph` (776) and `### variant: tool-interop-first` (1410), `## Judgement` (2381) with `### Criterion 1` through `### Criterion 5` (2393–2415) and `### Verdict` (2383). `docs/panels/scales.md`: `## Default` (5), `## Variants` (181) with `### variant: the section 7 default` (183), `### variant: countable inputs only` (355) and `### variant: the opposite pole, named by you` (604), `## Judgement` (843) with `### Criterion 1` through `### Criterion 4` (853–875) and `### Verdict` (845), and `## Ruling` (920). schema.md carries its ruling as `### Verdict` under `## Judgement` rather than a `## Ruling` heading. |
| 7 | The repository's `CLAUDE.md` carries D11 and the test command. | pass | `CLAUDE.md:19`, the commit-policy bullet: "**Never add AI attribution to a commit.** No `Co-Authored-By` trailer naming an AI, no "Generated with" line, no session trailer.", extended to any brief given a subagent, with "**Commits stay local.**" beside it. The test command is the `## Before every commit` block at line 6, whose fenced body is `node tools/run-tests.ts` (line 9), with the sentence at line 12 naming the two suites the runner expands. The criterion is met by the runner line, not by "the two `node --test` lines": those were replaced by the shell-agnostic runner at `1cc35ca`. |

## Decision

**v1 is not accepted.** Six of the seven §15 criteria pass; criterion 2 fails, because 3 of the 8
(prompt, model capability) pairs pass and the criterion requires all eight.

This is the verdict the criteria yield on the evidence as the user ruled it, not a separate ruling
the user gave: the user ruled on each blocking candidate and on the thresholds, and criterion 2
follows arithmetically from those rulings. Nothing was softened to reach it — the one rubric change
made at this gate tightened a must.

What stands between here and acceptance is now a much shorter list than at the first gate, and it is
about the skill and the rubric rather than about the harness or the evidence:

1. **Prompts 1 and 5 do not pass, on the must `c1`.** All eight runs failed to ask for the one datum
   the fixture withholds, at both capabilities and in both runs. Either the skill must be changed so
   that a run reaches that question, or band 1 must be widened to cover the run that records the gap
   in `dependency.limits` and invents nothing — the question both re-judging judges raised
   independently, recorded under "Threshold changes". This is the only blocker that decides four of
   the five failing pairs.
2. **p7/medium fails on a prose slip** (`c6`): the final message names a priority the document does
   not carry. Fixing the hand-over text, and the report's habit of printing an RPN beside a band
   value that does not order with it, is a small change.
3. **Four pairs fail the stability count bound**, with chain counts swinging as far as 12 to 18 on
   identical inputs at one capability. The threshold stands by ruling; what has to move is the
   skill's coverage behaviour.

Recorded for v1.1, none of them blocking v1's *evidence* but all of them limits on what these evals
measured: a mode-specific criterion for prompt 5 (candidate 9); c11 pinning the converted element set
(10); c9's applicability to prompt 6 (13); the untested `L` band and `post_priority` clause (14); a
chain-count bound to replace a Jaccard floor that returned 1.000 on all eight pairs (5); a launch log
recording attempts per unit (15); and the three `STALE_*` rosters in `tools/eval-report.ts`, which now
report themselves as unevaluable rather than being rewritten (12).

Deferred by the user at the 2026-09-11 gate and not reopened here:

- **P1** — the licensing review of `docs/panels/` before publication, folded into the §12
  pre-publication review the README states.
- **P2** — the eleven schema descriptions in `skills/fmea-software/schemas/fmea.schema.json` that
  cite `F-WSn-NN` finding ids, and the one citing record C076.
- **Item 16** — a hermetic eval harness with an isolated HOME or a working bare mode. Bare mode is
  unavailable under this login, so runs load the user's global configuration.
- **P9** — the eighteen eval-session scratch project directories under
  `~/.claude/projects/-tmp-fmea-eval-*`, which are outside the repository and the user's own.
