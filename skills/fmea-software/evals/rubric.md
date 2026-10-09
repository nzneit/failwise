# Eval rubric

Scoring guide for the skill evals of design §10. Each of prompts 1, 5, 6, and 7 in `prompts.json` is run twice at each of two model capabilities, high and medium, unattended, by `tools/run-eval.sh`; a judge scores every run against the criteria below, `tools/eval-stability.ts` compares the two runs at each capability, and a completeness critic lists what is missing. (Amended 2026-09-15 by the user's ruling at the acceptance re-gate; the sentence named Opus and Sonnet directly, which design §10 as amended 2026-09-12 replaced with the capability axis — the model filling each capability comes from a table defaulting to high=Opus, medium=Sonnet, low=Haiku and replaced wholesale by `FMEA_EVAL_MODELS` at run time or `args.models` at judging.) The thresholds in this file are the ones the acceptance gate applies (see "Changing a threshold").

## How a run is judged

The judge reads the prompt and its preamble, the run's `inputs/`, `analysis.json`, `report.html`, `validate.json` (the validator's output for `analysis.json`), the final message in `transcript.json` (`result`), and the run's message stream `transcript.jsonl` (one JSON object per line; its assistant `tool_use` blocks are the only record of the commands the run ran — `transcript.json` holds the final message and cost metadata, never a tool call); for prompt 6 also `fixtures/legacy-rpn-sheet.expected.fmea.json`, for prompt 7 also `fixtures/update/expected-stale.json`. Every criterion is scored 0, 1, or 2 with one or two sentences of evidence naming the pointer, file, or transcript text relied on. A criterion marked **must** has to score 2 for the run to pass.

Applicability and maximum: prompts 1 and 5 are scored on c1 to c10 (maximum 20, 8 musts); prompt 6 on c1 to c4 and c6 to c11 (maximum 20, 8 musts); prompt 7 on c1 to c10 and c12 (maximum 22, 9 musts). Under rubric 2, prompts 1 and 6 add c13 (maximum 22, 8 musts). Under rubric 3, prompt 1 adds c14 and c15 (maximum 26, 8 musts) and prompt 6 adds c14 (maximum 24, 8 musts); prompt 7 is unchanged (maximum 22, 9 musts).

**Rubric version.** This is rubric 3, dated 2026-10-09: it adds c14 and c15. A results file written under it carries `rubric: 3` at its top level. A file carrying `rubric: 2` was judged under rubric 2, dated 2026-10-07, which added c13, and is read without c14 and c15, so the element-kinds document regenerates as it was; a file with no such field was judged under rubric 1 and is read without c13, so the v1 document regenerates as it was.

**Unattended runs.** The run cannot ask a question, so the things the skill normally does interactively are judged by their unattended substitutes:

- A missing input counts as *asked for* when it is recorded in `meta.assumptions[]` as an entry with `status: "open"` and `owner: "user"` and the question is also listed in the final message. This is how c1 is judged unattended.
- A re-scoring request counts as *made* when the final message states that every rating is provisional and names re-scoring by a named person, one rating at a time against the anchors, as the next step; no question is required, because the run has no one to ask. That substitute meets band 2 of c5's re-scoring clause alone; the band's other clauses still apply as written, so every rating the run authored still has to carry `review.status: "provisional"`, and a priority named in the final message or the report still has to say it rests on provisional ratings.
- Ratings stay `review.status: "provisional"` because no named person re-scored them. `validate.json` therefore carries one `rating-provisional` warning per rating. Those warnings count against nothing: not against c7 (the validator's `ok` is unaffected by lints) and not against the quality score (warnings are listed only; a blocker zeroes its row).

## Criteria

### c1-missing-inputs-asked (must)

Missing inputs are asked for rather than invented. The prompt 1 and prompt 5 fixtures deliberately leave a gap — `checkout-inputs.md` gives the pricing service's availability SLA and omits its scaling limit — so a run on those prompts has at least one input to ask for, and a run that records no assumption there scores 0.

The gap is one the skill's own checklist asks about (amended 2026-09-15 by the user's ruling at the acceptance re-gate, which reconciled this clause with `references/design-inputs.md` after the first re-judging scored the same fact pattern 0, 1 and 2 across four runs). Item 4 of that file requires the availability SLA and the scaling limits *for every element that is the provider of an edge*, and pricing is one: the fixture types pricing as a `service` owned outside the analysis as the provider of a weak edge, and the only third-party element in it is `checkout.payment-gateway` (amended 2026-10-07 with rubric 2, after that file's item 4 came to name every element carrying a dependency block in place of internal dependencies, and the retired kind `external_dependency` gave way to a role and a boundary; amended 2026-10-09 with rubric 3, after dependencies became edges from a consumer to a provider in a top-level list and that file's item 4 came to name every element that is the provider of an edge). The fixture also states the order store's ceiling in as many words ("no published request ceiling"), so pricing's silence is the planted omission rather than the fixture declining to supply the datum.

Read that clause literally: it is met only by an entry in `meta.assumptions[]` with `owner: "user"` and `status: "open"` naming the missing input, together with the question in the final message, so a run that instead writes a value for that input into a document field, an edge's `limits` included — however reasonable the value, and however plainly the field records it as unstated — scores 0, because a field value is not a question. A run that records the gap in neither an assumption nor the final message scores 0 as well, whatever else it recorded: the score is on this input, not on the run's general diligence, so recording other gaps conscientiously does not substitute for this one. (Second sentence added 2026-09-15 by the same ruling.) Prompts 6 and 7 carry no planted gap: score 2 when the run needed nothing it was not given, and score 1 or 0 only when you can name an input the run stated as fact without having been given it.

- **2** — Every input the run lacked is recorded as an open assumption with owner `user` in `meta.assumptions[]` and listed as a question in the final message, and no value for a missing input appears in the document as a fact.
- **1** — Gaps are recorded in `meta.assumptions[]` or in the final message but not both, or one missing input is invented as fact while the others are recorded.
- **0** — A missing input is invented as fact with no assumption recorded, or the run records no assumption although the inputs have a gap.

For prompt 6, the substitutions the conversion rule of design §5 prescribes (the rationale text `converted from <sheet file name>; no rationale recorded`, `evidence_kind: "estimate"`, the conversion date) are declared defaults, not inventions, as long as `meta.history` records each substitution and on how many rows; they do not lower this score. Under rubric 3 the declared defaults also include the edge the conversion gives each outside item, from the first in-scope item in sheet order and at strength `strong` where the sheet states none, when `meta.history` records it as a substitution in the column mapping and `meta.assumptions[]` holds it as an open assumption owned by `user`; such an edge does not lower this score. (Added 2026-10-09 with rubric 3.)

### c2-element-traceability (must)

Every element traces to a supplied non-catalog source: each `elements[].sources[]` holds at least one entry whose `kind` is not `catalog` and whose `ref` points at something the run was given (a file in `inputs/`, a heading in it, an incident id from a postmortem, the legacy sheet).

In update mode (prompt 7), this criterion applies only to elements the run itself creates. Elements inherited from the stored analysis keep their own source records, which may name documents the run was not given (`update/before.fmea.json`'s five elements cite `architecture-notes-2026-08.md`, which is not one of prompt 7's two inputs); a run is neither expected nor able to re-source them, so they are not scored here. Score only the elements added by this run — for prompt 7 that is `checkout.pricing-cache`, whose source must resolve to `after-architecture.md`. That is the basename under which `tools/run-eval.sh` copies prompt 7's inputs into the run's `inputs/` directory, so it is the only name the run can cite and the `ref` the judge accepts; a `ref` that carries the `update/` prefix names a path the run was not given and is scored as such under this criterion (band 1).

- **2** — Every element has such a source and every such `ref` resolves to a supplied input.
- **1** — Every element has a non-catalog source but at least one `ref` names something not among the inputs (a document the run was not given).
- **0** — Some element has only catalog sources, or none.

### c3-chain-completeness

Each chain carries a failure mode, effects at three levels, causes, and controls.

- **2** — Every chain has a `failure_mode` in the source's or the team's terms, `effects.local`, `effects.next_level`, and `effects.end` that differ from one another and describe the failure at their level, at least one cause, and every control it lists carries a kind, a status, and evidence (with `evidence.kind: "none"` when there is none).
- **1** — At most a quarter of the chains have a placeholder effect (one level repeating another verbatim, or filler such as "n/a" or "see above"), a cause with no content beyond the mode restated, or a control with no evidence entry.
- **0** — More than a quarter of the chains are incomplete in one of those ways, or a chain has no cause.

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

### c6-priority-by-script (must)

Priority is computed by the script, not in prose. That covers `post_priority` as well as `priority`: a row with `post_ratings` carries a `post_priority` and a row without carries none, and the script writes both.

- **2** — `transcript.jsonl` holds a `tool_use` block whose command runs `priority.ts` with `--write` on the document; `validate.json` has no `priority-*` and no `post-priority-presence` error; and no priority value stated in the final message or report differs from the document.
- **1** — The document's priorities are all right — `validate.json` has no `priority-*` and no `post-priority-presence` error — but one or both of band 2's other two clauses fails: `transcript.jsonl` holds no `tool_use` block running `priority.ts` with `--write` (every `chains[].priority` matches the table, so the values were written by hand and happen to agree), or it does hold that block but a priority stated in the final message or the report differs from the document. A `validate.ts` invocation is not evidence for band 2: `validate.ts` recomputes priorities to check them and never writes them.
- **0** — A `priority` is missing or mismatched (a `priority-*` error in `validate.json`), a `post_priority` is missing beside a `post_ratings` or present without one (a `post-priority-presence` error), or priorities are given only in prose.

### c7-json-validates (must)

`validate.json` reports `"ok": true` for `analysis.json`. Lint warnings, `rating-provisional` included, do not affect this criterion.

- **2** — `ok: true`.
- **1** — `analysis.json` exists and parses, but `validate.json` lists errors.
- **0** — `analysis.json` is missing or is not JSON (the validator exits 3).

### c8-html-renders

`report.html` exists and was produced by `render.ts` from the validated document.

- **2** — `report.html` exists, `transcript.jsonl` holds a `tool_use` block whose command runs `render.ts` with `--out report.html`, and it contains the sections in design §9 order (element ids `header`, `ground-rules`, `assumptions`, `reviews`, `structure`, `chains`, `actions`, `lints`, `provenance`) and the `<script type="application/json" id="fmea-data">` block.
- **1** — `report.html` exists but was written some other way, or lacks one of those sections.
- **0** — `report.html` is missing.

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

- **2** — Every S, O, D from the sheet is kept in `ratings` with `review: {status: "authored", by: "J. Legacy", date: "2025-11-30"}`; each rating's `rationale` is the sheet's Justification text or, where that cell is empty (row 2), `converted from legacy-rpn-sheet.csv; no rationale recorded`; each `evidence_kind` is `estimate`; every row carries a script-computed `priority` whose `rpn` is the product of its ratings; the Order Store row's `history[]` records that the sheet's RPN 200 differs from the computed 210; `meta.history` records the column mapping and states which fields were substituted and on how many rows.
- **1** — Every S, O and D from the sheet is kept and no rating is written provisional, but one or more of band 2's other clauses fails (a review field wrong, a rationale not the sheet's Justification text or the prescribed substitute, an `evidence_kind` other than `estimate`, a substitution not recorded, the divergent RPN not noted, a priority not from the script).
- **0** — Any rating from the sheet is changed, dropped, or written provisional.

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

## Stability between the two runs at the same model capability

`tools/eval-stability.ts` compares run 1 and run 2 of a (prompt, model capability) pair and passes when both hold:

- Jaccard similarity of the element id sets is at least **0.8**, where the id set is `elements[].id` after trimming and case-folding. The basis is the id and not `elements[].name` because a name is free text and two runs of one prompt word the same element differently, while the id is the element's structural identity — the schema keeps it stable across versions and the update mode diffs elements by it — so a difference in wording alone is not instability. (The schema's grammar already makes an id lowercase kebab-case; the trim and case-fold guard unvalidated run output.)
- For each value v in the priority table's `vocabulary`, |count_v(run 1) − count_v(run 2)| ≤ **0.2** × max(chain rows in run 1, chain rows in run 2).

Run-to-run instability is one of the three documented failure modes of AI-generated FMEAs (design §3, guardrails); the check exists so a skill that produces a different analysis every time cannot pass on a lucky run.

## Pass rule

A run passes when every **must** criterion scores 2 and the total is at least **80%** of the maximum (16 of 20; 18 of 22, since 17.6 rounds up to the next whole score; 20 of 24, since 19.2 rounds up; 21 of 26, since 20.8 rounds up). A (prompt, model capability) pair passes when both of its runs pass and the stability check between them passes. v1 is accepted on the evals when all eight pairs pass (design §15, criterion 2).

With the criteria as written, only c3, c8, c13, c14 and c15 are not musts. On prompts 5 and 7 a run whose musts all score 2 already totals at least 16 of 20 or 18 of 22. Under rubric 2, on prompts 1 and 6 such a run totals 16 of 22 with the three non-musts at 0 and needs two more points among them. Under rubric 3 the musts total 16, so prompt 1 needs 5 of the 10 points among c3, c8, c13, c14 and c15 to reach 21 of 26, and prompt 6 needs 4 of the 8 among c3, c8, c13 and c14 to reach 20 of 24; the total rule binds there. Each file's maximum comes from `criteriaFor` in `tools/eval-report.ts`.

## Changing a threshold

Thresholds may be adjusted at acceptance. Each one lives in this file **and** in the code that
enforces it; a change is real only when both move together.

| Threshold | Here | In code |
|---|---|---|
| Jaccard floor 0.8 | "Stability between the two runs at the same model capability" | `JACCARD_MIN` in `tools/eval-stability.ts` |
| Count fraction 0.2 | "Stability between the two runs at the same model capability" | `COUNT_BOUND_FRACTION` in `tools/eval-stability.ts` (`stability()` computes the bound as `maxRows * COUNT_BOUND_FRACTION`) |
| Total 80% of maximum | "Pass rule" | `5 * total >= 4 * max` in `summarizeRun` in `tools/eval-report.ts` and in `summarize` in `tools/workflows/evals.js` |
| A criterion's must flag | "Criteria" | the `must` field in `CRITERIA` in `tools/eval-report.ts` and in `CRITERIA` in `tools/workflows/evals.js` |

Change this file first, then every code site in its row, then run `node --test "tools/*.test.ts"` — the
tests that pin the old value (`tools/eval-stability.test.ts` for the floor and the fraction,
`tools/eval-report.test.ts` for the 80% rule and the must flags) fail until their expectations are
updated in the same change — re-run `node tools/eval-stability.ts` on the two `analysis.json` files of
each of the eight (prompt, model capability) pairs and copy each printed object over the matching `stability[]`
entry in `build/evals/results.json` (the report copies stability verdicts out of that file and does not
recompute them), then regenerate the results document with `node tools/eval-report.ts`, which recomputes
every run's total and pass from the judges' per-criterion scores. Record the change in the acceptance
note `docs/specs/2026-09-07-acceptance.md` under `## Threshold changes` with the value before, the value
after, and the reason. A threshold is never changed in the judge's prompt or in the results file alone.
