# Eval rubric

Scoring guide for the skill evals of design §10. Each of prompts 1, 5, 6, and 7 in `prompts.json` is run twice at each of two model capabilities, high and medium, unattended, by `tools/run-eval.sh`; a judge scores every run against the criteria below, `tools/eval-stability.ts` compares the two runs at each capability, and a completeness critic lists what is missing. (Amended 2026-09-15 by the user's ruling at the acceptance re-gate; the sentence named Opus and Sonnet directly, which design §10 as amended 2026-09-12 replaced with the capability axis — the model filling each capability comes from a table defaulting to high=Opus, medium=Sonnet, low=Haiku and replaced wholesale by `FMEA_EVAL_MODELS` at run time or `args.models` at judging.) The thresholds in this file are the ones the acceptance gate applies (see "Changing a threshold").

## How a run is judged

The judge reads the prompt and its preamble, the run's `inputs/`, `analysis.json`, `report.html`, `validate.json` (the validator's output for `analysis.json`), the final message in `transcript.json` (`result`), and the run's message stream `transcript.jsonl` (one JSON object per line; its assistant `tool_use` blocks are the only record of the commands the run ran — `transcript.json` holds the final message and cost metadata, never a tool call), whose calls of the skill's scripts the judge reads from `invocations.json`, the record `tools/eval-invocations.ts` extracts from `transcript.jsonl` with each call's line, command and outcome, and a call whose outcome is `denied` was refused by the permission check, never ran, and is not evidence that a script ran (amended 2026-10-13 by the user's ruling at the flow-model round, after a grep of `transcript.jsonl` for the script names was measured at 0.56 to 1.45 MB per run, almost all of it file reads and thinking, and nine of that round's script calls were denied); for prompt 6 also `fixtures/legacy-rpn-sheet.expected.fmea.json`, for prompt 7 also `fixtures/update/expected-stale.json`. Every criterion is scored 0, 1, or 2 with one or two sentences of evidence naming the pointer, file, or transcript text relied on. A criterion marked **must** has to score 2 for the run to pass. A run whose `analysis.json` or `report.html` is missing is not scored: the judge returns no scores and names the missing file and the reason the run's final message gives, and the round records the run unverified, never 0, because every criterion reads one of the two and a row of zeros would measure only the absence (amended 2026-10-13 by the user's ruling at the flow-model round, which brought this file into line with the flow-model eval plan; before it, a missing `analysis.json` scored 0 on every criterion that reads it).

Applicability and maximum: prompts 1 and 5 are scored on c1 to c10 (maximum 20, 8 musts); prompt 6 on c1 to c4 and c6 to c11 (maximum 20, 8 musts); prompt 7 on c1 to c10 and c12 (maximum 22, 9 musts). Under rubric 2, prompts 1 and 6 add c13 (maximum 22, 8 musts). Under rubric 3, prompt 1 adds c14 and c15 (maximum 26, 8 musts) and prompt 6 adds c14 (maximum 24, 8 musts); prompt 7 is unchanged (maximum 22, 9 musts). Under rubric 4, prompt 1 adds c16 (maximum 28, 8 musts); prompts 6 and 7 are unchanged (prompt 6 maximum 24, 8 musts; prompt 7 maximum 22, 9 musts).

**Rubric version.** This is rubric 4, dated 2026-10-12: it adds c16. A results file written under it carries `rubric: 4` at its top level; a file carrying `rubric: 3` was judged under rubric 3, dated 2026-10-09, which added c14 and c15, and is read without c16; a file carrying `rubric: 2` was judged under rubric 2, dated 2026-10-07, which added c13, and is read without c14, c15 and c16, so the element-kinds document regenerates as it was; a file with no such field was judged under rubric 1 and is read without c13, so the v1 document regenerates as it was.

**Unattended runs.** The run cannot ask a question, so the things the skill normally does interactively are judged by their unattended substitutes:

- A missing input counts as *asked for* when it is recorded in `meta.assumptions[]` as an entry with `status: "open"` and `owner: "user"` and the question is also listed in the final message. This is how c1 is judged unattended.
- A re-scoring request counts as *made* when the final message states that every rating is provisional and names re-scoring by a named person, one rating at a time against the anchors, as the next step; no question is required, because the run has no one to ask. That substitute meets band 2 of c5's re-scoring clause alone; the band's other clauses still apply as written, so every rating the run authored still has to carry `review.status: "provisional"`, and a priority named in the final message or the report still has to say it rests on provisional ratings.
- Ratings stay `review.status: "provisional"` because no named person re-scored them. `validate.json` therefore carries one `rating-provisional` warning per rating. Those warnings count against nothing: not against c7 (the validator's `ok` is unaffected by lints) and not against the quality score (warnings are listed only; a blocker zeroes its row).

## Criteria

### c1-missing-inputs-asked (must)

Missing inputs are asked for rather than invented. The prompt 1 and prompt 5 fixtures deliberately leave a gap — `checkout-inputs.md` gives the pricing service's availability SLA and omits its scaling limit — so a run on those prompts has at least one input to ask for, and a run that records no assumption there scores 0.

The gap is one the skill's own checklist asks about (amended 2026-09-15 by the user's ruling at the acceptance re-gate, which reconciled this clause with `references/design-inputs.md` after the first re-judging scored the same fact pattern 0, 1 and 2 across four runs). Item 4 of that file requires the availability SLA and the scaling limits *for every element that is the provider of an edge*, and pricing is one: the fixture types pricing as a `service` owned outside the analysis as the provider of a weak edge, and the only third-party element in it is `checkout.payment-gateway` (amended 2026-10-07 with rubric 2, after that file's item 4 came to name every element carrying a dependency block in place of internal dependencies, and the retired kind `external_dependency` gave way to a role and a boundary; amended 2026-10-09 with rubric 3, after dependencies became edges from a consumer to a provider in a top-level list and that file's item 4 came to name every element that is the provider of an edge). The fixture also states the order store's ceiling in as many words ("no published request ceiling"), so pricing's silence is the planted omission rather than the fixture declining to supply the datum.

Read that clause literally: it is met only by an entry in `meta.assumptions[]` with `owner: "user"` and `status: "open"` naming the missing input, together with the question in the final message, so a run that instead writes a value for that input into a document field, an edge's `limits` included — however reasonable the value, and however plainly the field records it as unstated — scores 0, because a field value is not a question. A run that records the gap in neither an assumption nor the final message scores 0 as well, whatever else it recorded: the score is on this input, not on the run's general diligence, so recording other gaps conscientiously does not substitute for this one. (Second sentence added 2026-09-15 by the same ruling.) The 0 for a field value is for a run that writes the field instead of that entry and that question: in a run that records both, a field that says in words that the input is unstated, such as an edge's `limits` holding "not stated in the inputs", states no fact and does not lower the score, while in a run with no such entry a field value still scores 0, whatever the field says. (Third sentence added 2026-10-13, after the flow-model round was judged under rubric 4, by the user's ruling on that round: the earlier cases behind "however plainly" each wrote the field with no entry, the round produced the first run that wrote both, and the round's c1 scores already match this reading, so none changes.) Prompts 6 and 7 carry no planted gap: score 2 when the run needed nothing it was not given, and score 1 or 0 only when you can name an input the run stated as fact without having been given it.

- **2** — Every input the run lacked is recorded as an open assumption with owner `user` in `meta.assumptions[]` and listed as a question in the final message, and no value for a missing input appears in the document as a fact.
- **1** — Gaps are recorded in `meta.assumptions[]` or in the final message but not both, or one missing input is invented as fact while the others are recorded.
- **0** — A missing input is invented as fact with no assumption recorded, or the run records no assumption although the inputs have a gap.

For prompt 6, the substitutions the conversion rule of design §5 prescribes (the rationale text `converted from <sheet file name>; no rationale recorded`, `evidence_kind: "estimate"`, the conversion date) are declared defaults, not inventions, as long as `meta.history` records each substitution and on how many rows; they do not lower this score. Under rubric 3 the declared defaults also include the edge the conversion gives each outside item, from the first in-scope item in sheet order and at strength `strong` where the sheet states none, when `meta.history` records it as a substitution in the column mapping and `meta.assumptions[]` holds it as an open assumption owned by `user`; such an edge does not lower this score. (Added 2026-10-09 with rubric 3.)

Band 1's "one missing input is invented as fact while the others are recorded" covers the evidence of a control. A control whose entry in the document gives `evidence.kind` `test_result` or `observed_incident` with a `ref` the inputs do not give for that control, where the inputs list the control with no evidence or with evidence of another kind, is an input invented as fact under this criterion: c4's evidence clause reads only a rating's `evidence_kind`, c3 asks only that a control carry an evidence entry, and no other criterion reads whether a control's evidence is one the inputs give. (Added 2026-10-15 by the user's ruling at the prose stage-1 gate, after the judge of the prose stage-1 round scored p7/medium/run2 at 1 on this reading: the run gave its `fingerprint binding check on every session token` control `evidence.kind` `test_result` with the `ref` `session verifier unit suite`, which the stored analysis, `update/before.fmea.json`, gives as the evidence of the signature-verification control, and `after-architecture.md` lists the fingerprint check with no evidence. The score stands, with no re-judge; the paragraph reads band 1 and adds no criterion, so this stays rubric 4.)

The same clause of band 1 covers an action's dates and the origin of a seeded run's controls. An action's `target_date` or `completed_date` that the inputs do not state is a missing input: prompt 5's three postmortems, `fixtures/postmortems/*.md`, give an action item's id, text, owner and status only, and the schema requires `target_date` on every action and its description asks for `completed_date` on a Completed one. A date declared as the run's default, in a `meta.history` clause or in an open assumption owned by `user` that asks for the real date, is not an invented input; a date filled with no declaration anywhere, no `meta.history` clause, no `meta.assumptions[]` entry and nothing in the final message, is an input invented as fact, band 1 ("one missing input is invented as fact while the others are recorded"). The control-evidence paragraph above reads a seeded run's controls by the seeded-chain sentence of `references/scales-software.md`, under its Detection anchors: a control that acted in the incident carries `observed_incident`, one that existed and did not catch the mode carries `none`, and one added after the incident is planned until the inventory lists it as existing. An incident whose action item created a control is that control's origin and not its evidence: `observed_incident` with that incident's id on such a control is a `ref` the inputs do not give for it (band 1), where `observed_incident` on a control that acted in the incident the inputs describe is a `ref` the inputs give. A completed action item makes its control `existing` only where the inputs list it so. This reading covers the actions the inputs give, a postmortem's action items carried over; the `target_date` of an action a run proposes is the run's proposal, which no criterion reads as an input. (Added 2026-10-15 by the user's ruling at the second prose stage-1 gate. On action dates: p5/high/run2 of the prose stage-1b round filled `target_date` on every action and `completed_date` on its two Completed ones, 2026-03-28 on INC-2026-0314's AI-4 and 2026-06-28 on INC-2026-0621's AI-1, and declared none of them, where the round's three other prompt-5 runs declared theirs; its 1 stands, with no re-judge. The seed section's date rule, which plan B's epilogue adds to `SKILL.md`, asks for both the `meta.history` clause and the open assumption, and the judge reads either as a declaration: the round's p5/medium/run2 declared its dates in an open assumption and in the final message, with no `meta.history` clause, and scored 2. On control origin: the round's (5, medium) pair scored 2 on run1 and 1 on run2 under the control-evidence paragraph above, run1 having given the rate-shaping control from INC-2026-0314's AI-4 and the quote-age control from INC-2026-0502's AI-1 `observed_incident` with those incidents, and run2 the rate-shaping control with INC-2026-0314; both runs are re-judged on c1 alone under this paragraph. p1/high/run1's fallback-to-last-quoted-price control carries `observed_incident` INC-2026-0502, the incident in which that control acted (`checkout-inputs.md`: "stale prices served from the cart's last quoted price"), and its 2 stands. The scope sentence was added the same day at plan B's epilogue, task E3, after the c1 skeptic showed that without it the paragraph read over the run-proposed actions of every prompt-1 run of round 1b. The paragraph reads band 1 and adds no criterion, so this stays rubric 4.)

Two readings from the third stage-1 gate, one of the control-evidence paragraph above and one of band 2's "every input the run lacked". First, where the inputs' control inventory lists a control with no evidence, `test_result` on that control with a `ref` that restates its inventory line, the line itself or the suite, pipeline or check the line names, does not meet the control-evidence paragraph's test, the ref being one the inputs give for that control; this reading covers `test_result` on an inventory-listed control only, and an incident or an action item cited as the ref of `observed_incident` stays under the paragraph directly above, on an action's dates and a control's origin. The kind label is then the matter of the control-inventory sentence of `references/scales-software.md`, under its Detection anchors (a control listed in the team's control inventory with no evidence stated takes `evidence.kind: estimate` with the inventory as its reference), which no criterion reads, and the score is not lowered. Second, the open-assumption default of the capacity sentence in the Occurrence section of `references/scales-software.md`, applied because the normal load is not stated, is a rating default and not a gap this criterion reads, since no item of the checklist in `references/design-inputs.md` asks for the normal load; applying it invents no value. (Added 2026-10-15 by the user's ruling at the third prose stage-1 gate, after the Fable result gate of round 1c named both scores as borderline. p1/medium/run1 of the prose stage-1c round gave its contract-test control on `checkout.api`, which `checkout-inputs.md` lists with no evidence, `test_result` with the ref "the storefront pipeline's contract-test suite for checkout.api", a restatement of the inventory's line "Contract tests on checkout.api, run in the storefront's pipeline.", where the fifteen other prompt-1 runs of rounds 0, 1, 1b and 1c gave that control `estimate` with the inventory as ref; and p1/medium/run2's O rationale on its gateway rate-limit chain applied the open-assumption default to the gateway's unstated normal load with no assumption and no question, the checklist having no normal-load item. Both 2s stand, with no re-judge; the readings read bands 1 and 2 and add no criterion, so this stays rubric 4. A design-run sentence restating the control-inventory sentence, and a scales sentence that records the unstated load as an open assumption owned by `user`, are follow-ups after part C, prose design §11.7.)

### c2-element-traceability (must)

Every element traces to a supplied non-catalog source: each `elements[].sources[]` holds at least one entry whose `kind` is not `catalog` and whose `ref` points at something the run was given (a file in `inputs/`, a heading in it, an incident id from a postmortem, the legacy sheet).

In update mode (prompt 7), this criterion applies only to elements the run itself creates. Elements inherited from the stored analysis keep their own source records, which may name documents the run was not given (`update/before.fmea.json`'s five elements cite `architecture-notes-2026-08.md`, which is not one of prompt 7's two inputs); a run is neither expected nor able to re-source them, so they are not scored here. Score only the elements added by this run — for prompt 7 that is `checkout.pricing-cache`, whose source must resolve to `after-architecture.md`. That is the basename under which `tools/run-eval.sh` copies prompt 7's inputs into the run's `inputs/` directory, so it is the only name the run can cite and the `ref` the judge accepts; a `ref` that carries the `update/` prefix names a path the run was not given and is scored as such under this criterion (band 1).

- **2** — Every element has such a source and every such `ref` resolves to a supplied input.
- **1** — Every element has a non-catalog source but at least one `ref` names something not among the inputs (a document the run was not given).
- **0** — Some element has only catalog sources, or none.

A `repo` ref resolves to a supplied input only when the run read that repository, that is, when the run was given a path to it or files from it. A repository the inputs name but the run was not given, as `checkout-inputs.md`'s Codebases section names `acme/checkout` and `acme/session-auth`, belongs in `meta.codebases[]` and is not a supplied input for a source ref, so an element's `repo` ref to such a repository, beside its other refs or alone, names something not among the inputs and is scored as such under this criterion (band 1). (Added 2026-10-14 by the user's ruling at the prose stage-0 gate, which writes ruling 7 of 2026-10-13 into this criterion after the judges of the prose stage-0 round split on this pattern, one scoring 2 and five scoring 1, because the ruling was not in this text; the paragraph reads band 1 and adds no criterion, so this stays rubric 4, and that round's p1/high/run1 is re-judged on c2 alone under it.)

### c3-chain-completeness

Each chain carries a failure mode, effects at three levels, causes, and controls.

- **2** — Every chain has a `failure_mode` in the source's or the team's terms, `effects.local`, `effects.next_level`, and `effects.end` that differ from one another and describe the failure at their level, at least one cause, and every control it lists carries a kind, a status, and evidence (with `evidence.kind: "none"` when there is none).
- **1** — At most a quarter of the chains have a placeholder effect (one level repeating another verbatim, or filler such as "n/a" or "see above"), a cause with no content beyond the mode restated, or a control with no evidence entry.
- **0** — More than a quarter of the chains are incomplete in one of those ways, or a chain has no cause.

A chain counts toward the quarter as having a cause with no content beyond the mode restated when no cause it lists says anything its `failure_mode` does not already say, in the mode's words or in others. A cause that repeats the mode's own because-clause or one of its branches restates it, and so does a cause saying that the recorded availability SLA is not met or the recorded scaling limit is reached when the mode is that the element is unavailable or slow: the figure from the inputs, the request that fails and a consequence the chain's effects already record add no content, and a cause filled in from a row of `references/design-failure-catalog.md` is counted like any other, since that file's rows are to be rewritten for the element and nothing in it enters an analysis unrewritten. A cause that names a driver or a mechanism the mode does not state has content of its own however thin it is, so a borderline chain is not counted: a promotion that pushes traffic past the recorded limit, a write burst past the store's capacity, and an idempotency key recorded only after the authorization returns are content under a mode that does not already name them, while an error path that returns allow on a timeout or an internal error, under a mode in which the verifier admits a request when it errors, is the mode in other words. (Added 2026-10-13 by the user's ruling on c3, after the flow-model round was judged under rubric 4: that round's four prompt-1 judges counted causes that restate the mode three different ways, one of them exempting a cause filled in from the catalog, and those four runs are re-judged on c3 alone.)

For prompt 6 the legacy sheet carries a single Effect column, and the conversion rule of design §5 has nothing to split it into three levels with. Band 2 therefore accepts, on a converted row, either the sheet's Effect text at the one level the column mapping assigns it — `effects.end` in `fixtures/legacy-rpn-sheet.expected.fmea.json` — with the other two levels carrying a declared placeholder that names the sheet as not recording them, or the same text at all three levels, provided in either case that `meta.history` records which level the Effect column filled, that the other two were substituted, and on how many rows. That is the sheet's own shape carried over faithfully, not a placeholder in band 1's sense: the substituted levels are not counted as one level repeating another verbatim, and neither shape lowers this score.

### c4-rating-rationale-evidence (must)

Every rating carries a rationale and an evidence kind. A rating is each of `S`, `O`, `D` under `ratings` and, where present, `post_ratings`.

- **2** — Every rating has a non-empty `rationale` that refers to the row's own facts (its effect, exposure, or control layer, in the vocabulary of `scales-software.md`) and an `evidence_kind` consistent with what the row cites: `observed_incident` only where an incident is named, `test_result` only where a test or measurement is named, `estimate` otherwise.
- **1** — Every rating has both fields, but at least one rationale is generic (it would fit any row) or one evidence kind claims an incident or test the row does not cite.
- **0** — Any rating lacks a rationale or an evidence kind (the validator also rejects this).

### c5-provisional-rescore (must, not prompt 6)

Ratings are presented as provisional, the user is asked to re-score them, and priority is never presented as final while ratings are provisional. This criterion does not apply to prompt 6: the conversion rule of design §5 keeps the sheet's own ratings `authored` and never re-rates, so a converted document holds no rating the run authored to present as provisional, and c11 scores what the conversion did with the sheet's ratings instead.

- **2** — Every rating the run authored has `review.status: "provisional"` (prompt 7 leaves untouched rows as they were); the final message asks the user to re-score each rating against the anchors, one rating at a time; and wherever the final message or the report names a priority, it says the priority rests on provisional ratings.
- **1** — Ratings are provisional, but the final message either omits the re-scoring request or presents a priority or ranking as final.
- **0** — The run marks a rating it authored `rescored` or `authored`, or names a person as re-scorer whom the inputs never mention.

One statement anywhere in the final message that its priorities are not final until the ratings are re-scored covers every priority the message names, whether or not it shares a sentence with one, and so meets band 2's third clause for the message. A step that re-runs `priority.ts --write` after the re-scoring, named as what follows it ("then `priority.ts --write`"), is such a statement; a record that `priority.ts --write` has already run is not. The report's own provisional marking, its sentence that the priority of provisional rows is not final until a named reviewer re-scores them and the mark on each provisional row, covers every priority the report names, a count of rows by priority with no caveat beside it included, and it does not cover the final message. A final message that names a priority, a bare priority level beside a chain's ratings included, and whose only caveat covers the ratings alone, saying they are provisional and are to be re-scored but not that the priority rests on them, fails the clause, and band 1 counts that priority as presented as final. (Added 2026-10-13 by the user's ruling, after the flow-model round was judged under rubric 4, whose three prompt-7 judges gave this criterion 2, 1 and 2, scores that no one reading of the clause gives; the paragraph reads band 2's third clause and adds no criterion, so this stays rubric 4, and the runs it affects are re-judged on c5 alone.)

A rating the run carries forward from an earlier re-score, its value and its review status unchanged, is the reviewer's rating and not one the run authored, whatever the run writes into its rationale; a prefix such as "Carried forward from the last re-score:" neither makes it authored nor lowers the score. (Added 2026-10-17 by the user's ruling on the reading the flow-model round left open, in which prompt 7 high run 1 prefixed the rationales of four re-scored ratings; the run fails c5 under either reading, so no score is re-judged; the paragraph reads band 0's first clause and adds no criterion, so this stays rubric 4.)

### c6-priority-by-script (must)

Priority is computed by the script, not in prose. That covers `post_priority` as well as `priority`: a row with `post_ratings` carries a `post_priority` and a row without carries none, and the script writes both. A `tool_use` block the permission check denied never ran and is not a block that runs `priority.ts` (amended 2026-10-13 with the reading paragraph above).

- **2** — `transcript.jsonl` holds a `tool_use` block whose command runs `priority.ts` with `--write` on the document; `validate.json` has no `priority-*` and no `post-priority-presence` error; and no priority value stated in the final message or report differs from the document.
- **1** — The document's priorities are all right — `validate.json` has no `priority-*` and no `post-priority-presence` error — but one or both of band 2's other two clauses fails: `transcript.jsonl` holds no `tool_use` block running `priority.ts` with `--write` (every `chains[].priority` matches the table, so the values were written by hand and happen to agree), or it does hold that block but a priority stated in the final message or the report differs from the document. A `validate.ts` invocation is not evidence for band 2: `validate.ts` recomputes priorities to check them and never writes them.
- **0** — A `priority` is missing or mismatched (a `priority-*` error in `validate.json`), a `post_priority` is missing beside a `post_ratings` or present without one (a `post-priority-presence` error), or priorities are given only in prose.

Band 2's third clause, "no priority value stated in the final message or report differs from the document", reads a row's `priority` or `post_priority` value, an RPN or a ranking that the final message or the report gives for a row. A count of rows by priority that the final message states, such as "8 H and 6 M", is not a priority value under that clause: a wrong count is a defect the harness reports, from round 1c, in the Counts column of the note's Harness table, which `tools/eval-report.ts` prints from the `message_counts` that `tools/eval-context.ts` records, and it does not move this score. (Added 2026-10-15 by the user's ruling at the second prose stage-1 gate, after the judge of the prose stage-1b round scored p1/medium/run1 at 1 for its final message's "8 H and 6 M" against the document's 9 H and 5 M, every per-row priority value and RPN in the message matching the document; the run is re-judged on c6 alone under this paragraph. The paragraph reads band 2's third clause and adds no criterion, so this stays rubric 4.)

### c7-json-validates (must)

`validate.json` reports `"ok": true` for `analysis.json`. Lint warnings, `rating-provisional` included, do not affect this criterion.

- **2** — `ok: true`.
- **1** — `analysis.json` exists and parses, but `validate.json` lists errors.
- **0** — `analysis.json` is not JSON (the validator exits 3). A missing `analysis.json` is not scored (amended 2026-10-13; see the reading paragraph above).

### c8-html-renders

`report.html` exists and was produced by `render.ts` from the validated document. A `tool_use` block the permission check denied never ran and is not a block that runs `render.ts` (amended 2026-10-13 with the reading paragraph above).

- **2** — `report.html` exists, `transcript.jsonl` holds a `tool_use` block whose command runs `render.ts` with `--out report.html`, and it contains the sections in design §9 order (element ids `header`, `ground-rules`, `assumptions`, `reviews`, `structure`, `flows`, `chains`, `actions`, `lints`, `provenance`) and the `<script type="application/json" id="fmea-data">` block.
- **1** — `report.html` exists but was written some other way, or lacks one of those sections.
- **0** — No case: a run whose `report.html` is missing is not scored (amended 2026-10-13; see the reading paragraph above).

### c9-provenance-tags (must)

Every `chains[].catalog_refs[]` entry carries a provenance tag that matches the catalog.

- **2** — Every entry has an `id` that is a row id in `references/design-failure-catalog.md` and a `provenance` equal to that row's tag. A document with no catalog references scores 2 with a note saying so.
- **1** — Every entry has both fields, but at least one tag differs from the catalog row's tag.
- **0** — An entry lacks a tag, or names a row id not in the catalog.

### c10-no-invented-elements (must)

No element the prompt or the inputs never mentioned.

- **2** — Every element names a system, service, dependency, interface, store, or component the prompt or an input file mentions.
- **1** — One element is a decomposition of something the inputs name (a sub-component of a named service), its description says which, and it is recorded as an assumption.
- **0** — Any element has no basis in the prompt or the inputs.

### c11-prompt6-conversion (must, prompt 6 only)

The converted document keeps the sheet and records what the conversion did. Compare against `fixtures/legacy-rpn-sheet.expected.fmea.json`.

- **2** — Every S, O, D from the sheet is kept in `ratings` with `review: {status: "authored", by: "J. Legacy", date: "2025-11-30"}`; each rating's `rationale` is the sheet's Justification text or, where that cell is empty (row 2), the template `converted from <sheet file name>; no rationale recorded`, filled in as `converted from legacy-rpn-sheet.csv; no rationale recorded`; each `evidence_kind` is `estimate`; every row carries a script-computed `priority` whose `rpn` is the product of its ratings; the Order Store row's `history[]` records that the sheet's RPN 200 differs from the computed 210; `meta.history` records the column mapping and states which fields were substituted and on how many rows.
- **1** — Every S, O and D from the sheet is kept and no rating is written provisional, but one or more of band 2's other clauses fails (a review field wrong, a rationale not the sheet's Justification text or the prescribed substitute, an `evidence_kind` other than `estimate`, a substitution not recorded, the divergent RPN not noted, a priority not from the script).
- **0** — Any rating from the sheet is changed, dropped, or written provisional.

In the template, `<sheet file name>` is the name the run was given the sheet under, with or without its directory, so for a run given the sheet as `inputs/legacy-rpn-sheet.csv` the prescribed substitute is `converted from inputs/legacy-rpn-sheet.csv; no rationale recorded` or `converted from legacy-rpn-sheet.csv; no rationale recorded`, and any other rationale on a row whose Justification cell is empty is a rationale not the sheet's Justification text or the prescribed substitute (band 1). The rationale substitution is recorded only when `meta.history` itself names it and the rows it covers, by count or by naming them; a column mapping of Justification to `rationale`, an open entry in `meta.assumptions[]`, the final message and that row's own `history[]` do not stand in for it, so a substitution recorded only in `meta.assumptions[]`, in `meta.ground_rules[]` or in the final message, and not in `meta.history`, is a substitution not recorded (band 1). (Amended 2026-10-13, after the flow-model round was judged under rubric 4, by the user's ruling on that round: band 2 quoted only the filled-in text, which SKILL.md, the design and the schema give as a template, and the round's runs wrote the substitute with and without the `inputs/` directory and recorded the substitution in `meta.history`, in `meta.assumptions[]` and not in `meta.history`, or nowhere.)

Band 2's "states which fields were substituted and on how many rows" covers every declared default that `fixtures/legacy-rpn-sheet.expected.fmea.json`'s `meta.history` enumerates that the run's conversion applied: a field of a sheet row's chain or ratings, of a function, of an element or of an edge that the conversion fills, or leaves empty, where the sheet carries no content for it, element-level ones such as `security_relevant` and `functions[].for_whom` included. One of those defaults recorded only in `meta.assumptions[]` is a substitution not recorded (band 1). A document-level declaration such as the `meta.scales` pin is not one of them and is outside the clause. (Added 2026-10-14 by the user's ruling at the prose stage-0 gate: the critic of the prose stage-0 round questioned the broad reading that round's judge gave this clause on p6/high/run1, and the ruling keeps it; the paragraph reads band 2 and adds no criterion, so this stays rubric 4, and no run is re-judged under it.)

The declared defaults that `fixtures/legacy-rpn-sheet.expected.fmea.json`'s `meta.history` enumerates, which the 2026-10-14 paragraph above brings under band 2's substitution clause, include the ratings' `evidence_kind` `estimate`, counted by row, and the elements' `kind` and `boundary`, typed by the converter from the item text and counted by element. `meta.history` names each of them with its count or with every row or element it affects, as that file's history does ("evidence_kind set to estimate on 4 of 4 rows"; "elements typed by the converter from the item text", each element named with its type), and one recorded only in an open assumption, in a ground rule or in the final message is a substitution not recorded (band 1). (Added 2026-10-15 by the user's ruling at the second prose stage-1 gate, which on the same date extended the clause "so a substitution recorded only in `meta.assumptions[]`" of the paragraph that opens "In the template" to `meta.ground_rules[]` and the final message: p6/medium/run2 of the prose stage-1b round recorded both defaults in `meta.assumptions[]`, the typing in a ground rule as well, and scored 1, the round's three other prompt-6 runs having named both in `meta.history`. The 1 stands, with no re-judge; the paragraph reads band 2 and adds no criterion, so this stays rubric 4.)

Under the paragraph above, the typing the converter does from the item text is one declared default covering an element's `kind` and `boundary` together: `SKILL.md`'s conversion rule records each typing decision in the column mapping as "typed by the converter from the item text", and its Convert list asks that the default be named in `meta.history` with its count of elements. A `meta.history` clause that says the elements are typed by the converter from the item text, with the count of elements and each element's `kind`, names that default as band 2's substitution clause asks, whether or not it names each element's boundary; the fixture's history, which names each element's kind and boundary, is the form the paragraph above cites and not a requirement that the boundary be named element by element. The reading narrows nothing in the paragraph above: a clause in those words that gives the count of elements, or covers every element, still names the default, as that paragraph read, among the three other prompt-6 runs it credits, the clause "each element is typed by the converter from the item text" of p6/medium/run1 of the prose stage-1b round. (Added 2026-10-15 by the user's ruling at the third prose stage-1 gate, after the Fable result gate of round 1c named the score as borderline: p6/high/run1 of the prose stage-1c round wrote "the 4 elements are typed by the converter from the item text", each element with its kind, named no element's boundary in `meta.history`, and held an open assumption owned by `user` that each element's boundary and role are the converter's reading of the item text; `conversion-substitution-unrecorded` was silent. The 2 stands, with no re-judge; the reading reads band 2 and adds no criterion, so this stays rubric 4. A Convert item asking for each element's kind and boundary named is a follow-up after part C, prose design §11.7.)

### c12-prompt7-update (must, prompt 7 only)

The update flags what changed and nothing else. Compare against `fixtures/update/expected-stale.json`.

- **2** — The set of chains with `stale.flag: true` is exactly the expected set (`ch-1` with reason `element-changed`, `ch-2` with reason `function-changed`, `ch-4` with reason `control-removed`), each carrying that reason; `ch-3` and `ch-5` are neither flagged nor re-rated (their `ratings` and review status are unchanged from `before.fmea.json`); `meta.version` is 2; and `meta.history` has a new entry summarizing the update.
- **1** — The stale set is correct and no unchanged row was re-rated, but a reason is wrong, `meta.version` was not bumped, or `meta.history` was not appended.
- **0** — The stale set differs from the expected set, or an unchanged row was re-rated.

### c13-element-typing (prompts 1 and 6; rubric 2)

Every element carries the role, boundary and security flag the inputs support, by the tests in `references/structure-elements.md`. Compare against the table for the prompt.

Prompt 1 (`checkout-inputs.md`):

| Element | Role | Boundary | `security_relevant` |
|---|---|---|---|
| `checkout` | `service` | `in_scope` | false |
| `checkout.api` | `interface` | `in_scope` | false |
| `checkout.payment-gateway` | `service` | `third_party` | false |
| `checkout.order-store` | `datastore` | `in_scope` | false |
| `checkout.session-auth` | `component` | `in_scope` | true |
| `pricing` | `service` | `owned_outside` | false |

Prompt 6 (`legacy-rpn-sheet.csv`, typed by the converter from the item text):

| Element | Role | Boundary | `security_relevant` |
|---|---|---|---|
| `checkout-api` | `interface` | `in_scope` | false |
| `payment-gateway` | `service` | `third_party` | false |
| `order-store` | `datastore` | `in_scope` | false |
| `pricing-service` | `service` | `in_scope` | false |

- **2** — Every element's role, boundary and flag match the table.
- **1** — Every role matches, and the boundary or the flag differs on at most one element.
- **0** — Otherwise.

### c14-edges-and-codebases (prompts 1 and 6; rubric 3)

Every dependency the inputs state is an edge in `dependencies[]`, and every codebase the inputs name is in `meta.codebases[]` with the elements the inputs place in it. An element's effective codebase is its own `codebase` when it sets one; otherwise, when the element and its parent are both `in_scope`, its parent's effective codebase; otherwise none, as `references/structure-elements.md` states under "Runs over several codebases". Compare against the tables for the prompt.

- **2** — Every dependency the inputs state is an edge with the stated `from`, `to` and `strength`; every codebase the inputs name is in `meta.codebases[]`; every in-scope element the inputs place in a codebase has that codebase as its effective codebase, whether set on it or inherited; and an `owned_outside` or `third_party` element has a codebase only when the inputs place it in a named repository.
- **1** — Every stated edge is present with its stated ends, and exactly one of these differs: one edge's strength, one codebase entry missing or extra (such as an entry for pricing, whose repository the inputs do not name, so it is an open assumption and not an entry), or one element's effective codebase. A redundant `codebase` equal to the inherited one is not a difference.
- **0** — Otherwise, two or more differences included.

The codebase clauses are vacuous on a prompt whose inputs name no codebase, as c9 is with no catalog refs, so prompt 6 is scored on its edge alone. On prompt 6 the conversion's declared default counts as a stated edge: from `checkout-api` to `payment-gateway`, strength `strong`, recorded as a declared default in the column mapping of `meta.history` and as an open assumption owned by `user`; missing, or with another `from`, it scores 0, and present with another strength, or without its recorded default, it scores 1. Any other edge, one that neither the inputs nor the conversion rule prescribe, is neither required nor penalised here; a strength the inputs do not state is an invented value under c1 unless it is recorded as an open assumption.

Prompt 1 (`checkout-inputs.md`), edges:

| From | To | Strength |
|---|---|---|
| `checkout` | `checkout.payment-gateway` | `strong` |
| `checkout` | `pricing` | `weak` |
| `checkout` | `checkout.order-store` | `strong` |

Prompt 1, codebases: `meta.codebases[]` holds exactly two entries, with `repo` `acme/checkout` and `acme/session-auth`, and each element's effective codebase is:

| Element | Effective codebase (`repo`) | Set or inherited |
|---|---|---|
| `checkout` | `acme/checkout` | set |
| `checkout.api` | `acme/checkout` | inherited from `checkout` |
| `checkout.order-store` | `acme/checkout` | inherited from `checkout` |
| `checkout.session-auth` | `acme/session-auth` | set |
| `checkout.payment-gateway` | none | — |
| `pricing` | none | — |

Prompt 6 (`legacy-rpn-sheet.csv`), edges:

| From | To | Strength |
|---|---|---|
| `checkout-api` | `payment-gateway` | `strong`, the declared default |

### c15-cross-service-trace (prompt 1; rubric 3)

A failure that crosses from a provider to its consumer is recorded as a link: a cause on the consumer's chain names, in `causes[].chain`, the provider's chain whose failure mode it is.

- **2** — At least one cause on a chain whose element is `checkout` or one of its `in_scope` descendants (`checkout.api`, `checkout.order-store` or `checkout.session-auth`, and not `checkout.payment-gateway`, which is `third_party`) links to a chain on `checkout.payment-gateway` or on `pricing`, and that provider chain's `effects.next_level` states the consumer chain's failure mode, in the words of its `failure_mode` or a plain paraphrase of it, as the reviewer row `linked-pair-next-level` of `references/quality-and-lint.md` requires.
- **1** — Such a link exists and the provider chain's `effects.next_level` does not state the consumer's failure mode.
- **0** — No such link.

Judgeable from the document alone; the inputs give the textbook pair, a failed authorization failing the checkout. A run that links but records no `cited_o` carries the `linked-cause-occurrence-drift` warning and loses no score here.

### c16-flows (prompt 1; rubric 4)

The critical flows the inputs name appear in `flows[]`, and the chain-to-flow naming the inputs support appears in `chains[].flows`. Compare against the table and the chain-naming conditions for the prompt.

- **2** — Every flow the inputs name is present with its `id`, its `name` and its `value_priority`; every flow a chain names carries `users` with a `population` grounded in the inputs and a non-catalog `sources[]` entry; and the chain naming meets every condition below the table.
- **1** — The flows are present but incomplete: a flow is missing, or a chain-named flow carries no `users`, or the chain naming is absent or fails a condition below the table.
- **0** — No `flows[]` at all.

The criterion is vacuous on a prompt whose inputs name no critical-flow section, so prompt 6 is not scored on it: its converted sheet, `legacy-rpn-sheet.csv`, carries none. Prompt 5 reads `checkout-inputs.md` and its critical flows, but its postmortem-seeded baseline is scored on c1 to c10 only, the convention that keeps c13 and c14 off it, so c16 scores prompt 1 alone. Prompt 1 (`checkout-inputs.md`), flows, each with the `id` and `value_priority` the inputs state for it:

| `flows[].id` | What it is | `value_priority` |
|---|---|---|
| `flow-checkout` | A signed-in shopper submits a cart and the service returns a confirmation | `High` |
| `flow-retry` | A shopper retries a submission after a timeout and the cart is authorized once | `High` |
| `flow-resume` | A shopper resumes an abandoned session from a saved link | `Medium` |

The chain naming meets the table when all three conditions hold:

- at least one chain names both `flow-checkout` and `flow-retry`: a failure on the submission path that a retried submission meets as well, such as a degraded payment gateway;
- at least one chain names `flow-resume`: a failure in resuming a session from a saved link, such as on the session token;
- no chain names a flow whose journey its end effect does not break.

A chain that names no flow is not a defect here. (Amended 2026-10-13, before any run was judged under rubric 4: the table's last column named "the checkout chain" and "the session chain", which a run with ten or more chains cannot map to one chain, and the inputs now state each flow's `id` and `value_priority`, which they did not when rubric 4 was written, so the round's first prompt-1 runs had to mint their own ids.)

## Stability between the two runs at the same model capability

`tools/eval-stability.ts` compares run 1 and run 2 of a (prompt, model capability) pair and passes when all three hold, or, on a prompt whose inputs name no flows, when the first two hold and the third is reported `not_applicable`:

- Jaccard similarity of the element id sets is at least **0.8**, where the id set is `elements[].id` after trimming and case-folding. The basis is the id and not `elements[].name` because a name is free text and two runs of one prompt word the same element differently, while the id is the element's structural identity — the schema keeps it stable across versions and the update mode diffs elements by it — so a difference in wording alone is not instability. (The schema's grammar already makes an id lowercase kebab-case; the trim and case-fold guard unvalidated run output.)
- For each value v in the priority table's `vocabulary`, |count_v(run 1) − count_v(run 2)| ≤ **0.2** × max(chain rows in run 1, chain rows in run 2).
- Jaccard similarity of the flow id sets is at least **0.8**, where the id set is `flows[].id` after trimming and case-folding, reported `pass` / `fail` / `unverified`: both runs carrying no flows is `unverified` and is named in the acceptance note rather than counted a pass, and one side carrying none is a `fail`; on a prompt whose inputs name no flows (prompt 6), the judging workflow passes `--flows-not-applicable` and the predicate is reported `not_applicable` whatever the two runs carry, so the pair is judged on the element and count predicates (ruling 4 of 2026-10-13, amended 2026-10-14 before the prose rounds; this stays rubric 4).

Run-to-run instability is one of the three documented failure modes of AI-generated FMEAs (design §3, guardrails); the check exists so a skill that produces a different analysis every time cannot pass on a lucky run.

## Pass rule

A run passes when every **must** criterion scores 2 and the total is at least **80%** of the maximum (16 of 20; 18 of 22, since 17.6 rounds up to the next whole score; 20 of 24, since 19.2 rounds up; 21 of 26, since 20.8 rounds up; 23 of 28, since 22.4 rounds up). A (prompt, model capability) pair passes when both of its runs pass and the stability check between them passes. v1 is accepted on the evals when all eight pairs pass (design §15, criterion 2).

With the criteria as written, only c3, c8, c13, c14, c15 and c16 are not musts. On prompts 5 and 7 a run whose musts all score 2 already totals at least 16 of 20 or 18 of 22. Under rubric 2, on prompts 1 and 6 such a run totals 16 of 22 with the three non-musts at 0 and needs two more points among them. Under rubric 3 the musts total 16, so prompt 1 needs 5 of the 10 points among c3, c8, c13, c14 and c15 to reach 21 of 26, and prompt 6 needs 4 of the 8 among c3, c8, c13 and c14 to reach 20 of 24; the total rule binds there. Under rubric 4 prompt 1 needs 7 of the 12 points among c3, c8, c13, c14, c15 and c16 to reach 23 of 28; prompts 6 and 7 are unchanged. Each file's maximum comes from `criteriaFor` in `tools/eval-report.ts`.

## Changing a threshold

Thresholds may be adjusted at acceptance. Each one lives in this file **and** in the code that
enforces it; a change is real only when both move together.

| Threshold | Here | In code |
|---|---|---|
| Jaccard floor 0.8 | "Stability between the two runs at the same model capability" — the element id sets and the flow id sets | `JACCARD_MIN` in `tools/eval-stability.ts` |
| Count fraction 0.2 | "Stability between the two runs at the same model capability" | `COUNT_BOUND_FRACTION` in `tools/eval-stability.ts` (`stability()` computes the bound as `maxRows * COUNT_BOUND_FRACTION`) |
| Total 80% of maximum | "Pass rule" | `5 * total >= 4 * max` in `summarizeRun` in `tools/eval-report.ts` and in `summarize` in `tools/workflows/evals.js` |
| A criterion's must flag | "Criteria" | the `must` field in `CRITERIA` in `tools/eval-report.ts`, in `CRITERIA` in `tools/workflows/evals.js` and in `CRITERIA` in `tools/workflows/rejudge.js` |

Change this file first, then every code site in its row, then run `node --test "tools/*.test.ts"` — the
tests that pin the old value (`tools/eval-stability.test.ts` for the floor and the fraction,
`tools/eval-report.test.ts` for the 80% rule and the must flags) fail until their expectations are
updated in the same change — re-run `node tools/eval-stability.ts` on the two `analysis.json` files of
each (prompt, model capability) pair of the round, with `--flows-not-applicable` for each prompt in
`FLOWS_NOT_APPLICABLE_PROMPTS` in `tools/workflows/evals.js` (prompt 6), and merge each printed object
into the matching `stability[]` entry of the round's own `results.json`
(`build/evals/<round>/results.json`; the v1 round's is `build/evals/results.json`): the printed fields
replace the entry's, the entry keeps its `prompt` and `model_capability`, and its `unverified` is set
to `verified !== true`, as `tools/workflows/evals.js` sets it. The report copies stability verdicts out
of that file and does not recompute them: it finds an entry by `prompt` and `model_capability`, and
prints `UNVERIFIED` from `unverified`. Then regenerate the round's results document with
`node tools/eval-report.ts --results <that file> --out <the round's results document> --title <its title>`
(their defaults are the v1 round's file, document and title), which recomputes every run's total and
pass from the judges' per-criterion scores. Record the change in the acceptance
note `docs/specs/2026-09-07-acceptance.md` under `## Threshold changes` with the value before, the value
after, and the reason. A threshold is never changed in the judge's prompt or in the results file alone.
