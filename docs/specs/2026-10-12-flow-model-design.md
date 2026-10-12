# Flow model: design

**Date:** 2026-10-12
**Status:** revised after a five-lens review panel; awaiting user review of this written spec
**Precedes:** implementation (via the writing-plans skill), then the acceptance note
**Research:** nzneit/failwise-research issue #2, archived at `docs/research/2026-10-flow-model/` in the private
repository. The canonical artifact is `20-findings-consolidated.md` (66 findings F1.1–F6.5, 21 silences, 12
disagreements); the DF4 measurement ruling and the tier vocabulary come from the 2026-10-11 addendum
`notes/31-addendum-tiers-and-attribution.md`. This design cites findings by id; record ids `Cnnn` resolve through
the register in `skills/fmea-software/references/provenance.md`.

---

## 1. Purpose

Give the failwise analysis document a first-class flow model: the critical user and system flows as a named,
structured part of the document, so that a chain can name the flow(s) it breaks, and Severity's blast radius can
be read over a flow's users instead of the free prose of `functions[].for_whom` and `effects.end`. The model is
**additive in what it computes** — it adds no rating scale and changes no band — but it does change how one
existing anchor is read: the Severity blast-radius denominator (DF3). It does not change how Occurrence,
Detection or priority are computed, and it does not change how dependency strength is stored or used.

The motivating defect is the one issue #2 records: the multi-codebase design dropped the weak-dependency exclusion
because strength was "a pairwise structural proxy for a flow-level fact" — whether the flow crossing an edge still
completes without the provider. This design makes the flow itself a named thing the document holds, rather than a
fact reconstructed from edges or from free text.

## 2. Decisions taken in this design

These are rulings, reached in brainstorming and revised after the review panel. The panels and scripts may not
move them.

| # | Decision | Ruling |
|---|---|---|
| DF1 | Additive | Flows add no rating scale and move no band; they do not drive O, D or priority. Strength stays edge-stored and informational (M8 of the multi-codebase design is unchanged). The one place flows touch a rating is the Severity blast-radius denominator, and only as a named referent (DF3). |
| DF2 | Partial by design | A flow always carries `id`, `name` and `criticality`; its `steps` are best-effort and optional, and a `continues` flag records that the flow continues past what is written (the async/broker case, where the team may know "A publishes, B consumes" but not the end-to-end path or every downstream consumer). |
| DF3 | Severity denominator | Severity's blast radius is read over the users of the flows a chain names. A chain that names no flow, or whose named flows record no `users`, reads over the function's users, exactly as today. Where a chain names several flows, the band is read over the whole the named flows jointly serve, and that population is named in the rating's rationale. The band is still chosen by the author against the existing majority/subset/internal-only anchors; the flow supplies the population, never a computed rating. Because this changes how the Severity anchor is read, it bumps the scales version (DF6). |
| DF4 | Criticality tier | `criticality` is the three-level ordinal tier High/Medium/Low, used for sort/filter only (the measurement ruling: ordinal, so median/mode/max are licensed and arithmetic is not). Paraphrased from Azure WAF RE:02 (record C201, §7, not yet admitted), with the three-level vocabulary corroborated by the mission-tier records C196/C198. Three one-line `[skill-authored]` criteria (paraphrasing the Azure impact kinds of F2.1) make the tier assignable by two people without a consensus meeting. |
| DF5 | Shape | Approach 1 of the brainstorm: a flat `flows[]` array with an optional chain→flows reference and four reference invariants. Approach 3 (typed steps and traceability lints) is recorded as later work (§9). |
| DF6 | Scales version | DF3 is a change to how an anchor reads, so the scales version bumps (`scales version: 1` → `2`); a version gap marks every rated row `scales-version` and re-reads all three factors on the next update, by the existing rule. This is the rule working as written, not a side effect to route around. |

## 3. Constraints inherited from the research

The design must honour these findings; where the research is silent or disagrees, the design says so rather than
smoothing it.

- **Flows as first-class are a practitioner model, not a standards one.** Azure Well-Architected RE:02/RE:03 is
  the one published reliability model that treats user and system flows as first-class objects (F1.1); no standard
  names a user-valued end-to-end flow (S1). The design hangs the flow concept on Azure (C014, C201) and on the
  skill's own structure, not on a standards construct.
- **Criticality is the weakest leg.** A three-level tier vocabulary does exist — NERC CIP-002 grades assets
  High/Medium/Low (C196), FIPS 199 sets three impact levels (C198) — but no source grades a *flow by its business
  value*: none supplies the numeric criteria M's tiers imply, and no vendor *journey*-tier taxonomy was citable
  (the original S7, scoped to vendor journey tiers, stands). The design adopts the tier as an ordinal,
  non-arithmetic label (F2.1, DF4) and records that it is a priority label, not a measurement.
- **Strength stays edge-stored.** Edge-stored strength is what practice converges on (F3.1, F3.15), and no source
  stores a per-(edge, flow) pair (S2); deriving strength from the flows crossing an edge is only a heuristic, and
  the one test of edge-betweenness-as-criticality needs strong qualification (F3.6, `partially unverified`; F3.8;
  disagreement #3). DF1 therefore keeps strength informational and does not derive it from flows.
- **The denominator already exists; flows name it.** Population-share and affected-user sizing of failure impact
  is established practice (F4.1), and the shipped bands (majority/subset/internal-only) already read over "the
  function's users or requests". A flow with its users gives that measurement the named referent it lacks (the
  issue's motivation), and it does not smuggle in a second scale: `users` is free text, `criticality` is
  sort/filter only, and no arithmetic is performed. There is no effect-statement grammar anywhere (S3); the
  nearest pattern is Azure's "loss of flow X for users Y" phrasing (F4.3). The design lets a chain name the flow
  it breaks but keeps the effect prose free text.
- **Update mode has prior art.** Versioned flow definitions with instance binding are the update-mode precedent
  (F5.1); the existing carry-forward machinery shows the shape a flow-aware rule takes (F5.4). The design adds a
  dedicated `flow-changed` stale reason (§5).
- **Evals.** The checkout fixture already carries "Critical flows" as prose nothing consumes (F6.1); a rubric
  criterion follows the c13/c14/c15 machinery, and a flows stability predicate needs stable flow ids first
  (F6.2, F6.3).

## 4. Data model

The schema file (`skills/fmea-software/schemas/fmea.schema.json`) gains a top-level optional `flows` array and an
optional `flows` array on each chain. Its `$id` **stays** `urn:fmea-software:schema:fmea:v3`: the change is
additive and every v3 document still validates, and the governing data-contract rule bumps the `$id` only when an
older document stops validating (element-kinds D10, multi-codebase M5). No document carries a schema version —
`validate.ts` loads the shipped schema by a fixed path (`lib/schema.ts` `SCHEMA_PATH`), and old-document detection
is structural (`lib/legacy.ts`, `KIND_LEGACY`/`DEPENDENCY_LEGACY` by id-prefix and missing key) — so a bump would
mark nothing and mislead no reader.

### 4.1 `flows[]` — new, optional, top-level

Absent in pre-change documents (no old document breaks); present when the team authors flows. It carries
`minItems: 1`, like `meta.codebases[]`, so that "absent" is the one way to say "no flows". One analysis document
may carry many flows (S21 leaves the count open, and the additive ruling needs no bound).

Each flow:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | `plainId` | yes | Opaque identifier, unique within the document (rule `flow-id-unique`). Stable across versions and diffed byte-for-byte, like element and function ids. |
| `name` | `nonEmptyString` | yes | The flow's name. |
| `criticality` | enum `["High","Medium","Low"]` | yes | Ordinal tier, sort/filter only (DF4), assigned against three one-line criteria in `design-inputs.md`. |
| `users` | `nonEmptyString` | no | The population the flow serves. This is the Severity denominator when present (DF3). |
| `steps` | array of `plainId` | no | The ordered functions the flow passes through, best-effort. Each id references a function in `functions[]` (rule `flow-step-resolves`). Not typed nodes — that is §9's deferral. |
| `continues` | boolean | no | Default `false`. `true` = the recorded steps are a prefix; the flow continues past what is written (the async/broker boundary). |

A flow with no `steps` and no `continues` is a complete flow the team chose not to enumerate; a flow with
`continues: true` is explicitly partial. The distinction is the author's, not a validator's.

### 4.2 `chains[].flows` — new, optional

An array of flow ids (0..N), the flows this chain breaks. The author names them; nothing is derived from step
membership, so a shared-service chain can name several flows, and a chain can name a flow even when its own
function is not on that flow's (partial) steps. Absent or empty means the chain names no flow and DF3 falls back
to the function's users. Where several flows are named, the DF3 population is the whole they jointly serve.

### 4.3 Invariants

Four, added to `INVARIANT_RULES` as kebab-case rule ids reported under the existing `INVARIANT` code:

- `flow-id-unique` — flow ids are unique within the document.
- `flow-undefined` — every id in a chain's `flows[]` resolves to a flow.
- `flow-step-resolves` — every id in a flow's `steps[]` resolves to a function.
- `chain-flows-unique` — a chain's `flows[]` names no flow twice (pointer at each later entry, as the existing
  `dependency-pair-unique` does for repeated edge identities).

These are join-and-resolve checks; the traceability lints (chain-names-flow-whose-steps-exclude-its-function,
flow-with-no-steps-and-no-users) are deferred (§9).

## 5. Scripts and update mode

### 5.1 Typed model (`lib/types.ts`)

The type surface must move with the schema: a `Flow` interface; `flows?: Flow[]` on `FmeaDocument`; `flows?: string[]`
on `Chain`; `StaleReason` gains `"flow-changed"`; the schema `stale.reason` `enum` **and its ordered description**
gain `"flow-changed"`; and `lib/report-model.ts`'s exhaustive `STALE_REASON_WORDS: Record<StaleReason, string>`
gains the human phrase, without which `tsc` fails and the report prints `undefined`.

### 5.2 `validate.ts`

Adds the four invariants (§4.3). No other behavior changes.

### 5.3 `render.ts` and `report-model.ts`

- A **Flows section**: one row per flow — name, criticality, users (if present), steps as the ordered function
  names, and a "continues" marker when set. It gets a TOC (`CONTENTS`) entry, a one-line legend for the
  criticality tier and the `continues` marker, an explicit empty-state ("No flows recorded."), and a fixed row
  order (by criticality rank then id). Every rendered string is escaped; `name` and `users` are free text. A
  partial flow renders an explicit phrase ("a starting point only; the flow continues past the broker") rather
  than empty cells that read as broken.
- A **chain annotation**: each chain that names flows lists them ("breaks: checkout"). The existing
  element/dependency/chain tables and the "By top-level element" summary are untouched. The model changes live in
  `report-model.ts` (`ReportModel`), not `render.ts` alone.

### 5.4 Update mode — `flow-changed`

A new stale reason, added to the closed vocabulary. Fixed precedence becomes:

`element-changed`, `function-changed`, `flow-changed`, `control-removed`, `scales-version`

The order between `function-changed` and `flow-changed` is cosmetic — both re-read S only — and is fixed here so
the vocabulary has a single order.

- **Trigger:** a flow a chain names changed its `users` between versions — the one flow field that feeds a rating
  (the Severity denominator). A `users` presence transition (absent → present, or present → absent) counts as a
  change. A change to `name`, `criticality`, `steps`, or `continues` marks nothing stale, because none feeds a
  rating under DF1.
- **Carry-forward:** a `flow-changed` row re-reads **S** (the denominator moved) and the Severity rating's
  rationale that names the flow and its population; **O and D are carried forward**; **priority is recomputed**
  from the re-rated S by `priority.ts` (it is not a carried factor).
- **Add/remove:** adding or removing a flow marks nothing stale by itself. A flow id is diffed byte-for-byte, so a
  rename is a remove-plus-add. A change to *which* flows a chain names is an authored edit the session makes in
  step 4, which re-scores S there; it is not a structural-diff trigger.

### 5.5 `update-check.ts` and `update-diff.ts`

- **A flow diff.** `update-diff.ts` gains a flow section alongside its edge and element sections: flows added,
  removed, and changed by `users`. It is deterministic (a by-id diff of `flows[]` plus a `users` field compare).
- **A removed-flow-still-named guard.** Removing a flow a chain still names leaves a dangling reference. Because
  `update-check.ts` runs "the legacy gate and the schema … never the invariants", `flow-undefined` fires only at
  the end of the update, not before it — so the update mode needs its own structural guard, a `removedFlows`
  section analogous to the existing `removedLinks`/`orphans`, that lists each removed flow, the chains naming it,
  and the surviving flows they could be re-pointed to. The person re-points or confirms the removal before
  proceeding. `flow-undefined` remains the `validate.ts` backstop.
- **Precedence, made enforceable.** The checker's `stale-reason` rule accepts only the reason it computes, and it
  computes `element-changed` (top of the order) but never `function-changed`. Inserting `flow-changed` below
  `function-changed` would let the checker refuse a *correct* draft: a row whose legitimate session reason is
  `function-changed` (a function changed on the same update) that a flow change also reaches. Rule: **the checker
  accepts any reason at or above the reach it computes** (its computed reach is a lower bound on precedence), and
  the both-fire cases — a row reached by an element change and a flow change takes `element-changed`; reached by a
  function change and a flow change takes `function-changed` — are added to the tests.
- **Output.** The flow half prints its own section (flows added / removed / changed, and the removed-flow guard),
  and the change count joins the summary line that the update copies into `meta.history`; a changed flow that no
  chain names still appears.
- **A recorded gap.** A chain-side `flows[]` re-point (§5.4) is prose-only: the checker marks nothing, and a test
  pins that deliberate gap.

## 6. Reference files and provenance

Flows are structure, not a catalog, so no new reference file and no new evidence pack. The provenance lands in the
existing files. (The design prepares and requests the register rows below; the user admits them — §10.)

- **`design-inputs.md` item 1 ("Critical flows")** keeps `[paraphrased:C014]` for the concept; the "what to
  collect" text gains the flow fields as `[skill-authored]` (where each lands in the document JSON). The
  `criticality` tier carries `[paraphrased:C201]` (once C201 is admitted) and three one-line `[skill-authored]`
  criteria paraphrasing Azure's impact kinds (F2.1) so two raters converge.
- **`scales-software.md`** gains one `[skill-authored]` sentence implementing DF3 (including the multi-flow union
  rule), one `[skill-authored]` line that flows move no rating (mirroring M8), and the DF6 scales-version bump
  (`scales version: 1` → `2`), with the reason recorded.
- **`quality-and-lint.md`** documents the four invariants as `[skill-authored]`.
- **`SKILL.md`** — procedure rewritten as a per-step list: collect flows in step 1/2; **fill `steps` only after
  step 3** (steps reference functions, so the session resolves the ids from the team's prose and the human never
  transcribes opaque ids); name flows on chains in step 4; read the denominator in step 5. The **Update mode
  section** gains the new precedence order and the `flow-changed` trigger/carry-forward. `[skill-authored]`.
- **`provenance.md`** carries the register rows C161–C200 and, once admitted, C201.
- **`data/priority-fmea-software-v1.json`** unchanged.

## 7. The criticality record (C201)

The tier itself needs a record the design does not yet have. "Each flow carries a High/Medium/Low criticality
tier" is finding F2.1, sourced to Azure WAF RE:02, and no corpus record holds it (C014 is RE:03; the run-1 claim
ids CT-5–CT-8/CT-32 were never admitted). Before any reference file cites the tier, one record is added:

- **C201 — Azure WAF RE:02 "Identify and rate user and system flows"**, holding the claim that flows are
  identified and rated by a High/Medium/Low criticality tier, with the tier names quoted. Drafted from the
  existing run-1 notes, then **adversarially verified to `confirmed` via the vote protocol** (re-fetch,
  character-for-character quote check) — the same bar C161–C191 cleared, not the lighter registration bar the
  addendum's C192–C200 have not yet cleared. The `criticality` field then carries `[paraphrased:C201]`.

C196 and C198 corroborate the three-level vocabulary only if they too clear the vote protocol; until then the
citing sentence labels them single-reader. Azure RE:02 is paraphrase-only: only the bare tier labels may appear
verbatim, never Azure's tier descriptions.

## 8. Evals and testing

### 8.1 Evals

- **Fixture identity.** The "## Critical flows" prose lives in `checkout-inputs.md` (and the three `update/*.md`),
  an **inputs** file read by prompts 1 and 5; it stays there (it is the run's input, and removing it would make
  c16 unscorable). The `flows[]` array is **added to the document fixture** (`checkout-service.fmea.json`) and to
  the update before/after pair.
- **Rubric → version 4**, adding **c16** (flows) for prompts 1 and 6, **not a must**, with bands 2/1/0 and an
  expected-flows table authored alongside the fixture: band 2 — the flows the critical-flows input names appear
  with ids, names, criticality, and the expected chain→flow naming; band 1 — flows present but incomplete (missing
  the chain naming or a criticality); band 0 — no flows section. Maxima rise 26→28 (prompt 1) and 24→26 (prompt 6);
  the 80%-of-maximum thresholds become 23/28 and 21/26. The code sites: `tools/eval-report.ts` (`CRITERIA` and its
  count comment), `tools/workflows/evals.js` (`RUBRIC`, its hand-synced `CRITERIA`, `STABILITY_SCHEMA`), and
  `tools/eval-report.test.ts` (the `CRITERIA.length` and `const RUBRIC = 3` pins; the workflow-copy regex already
  accepts any rubric number), with `evals/rubric.md`'s applicability/version/pass-rule paragraphs.
- **Flows stability predicate — tri-state.** `tools/eval-stability.ts` gains a `flows` comparison (Jaccard over
  `flows[].id` at the 0.8 floor) reported as `pass` / `fail` / `unverified`: both runs empty → `unverified` (never
  a silent pass; listed in the acceptance note); one side empty → `fail` (a run that dropped every flow); else the
  Jaccard. The result carries a top-level `verified` flag that is true only when every predicate actually ran. The
  plumbing: the `Stability` interface and `pass` expression, an id-set helper, `eval-stability.test.ts` pins,
  `STABILITY_SCHEMA.required` and the stability judge brief in `evals.js`, and `eval-report.ts`'s stability table.
- **Prompt 7.** No new rubric criterion. The flow-users change is placed on an **already-stale** chain so the
  stale-reason label is masked by the higher-precedence reason and `expected-stale.json`/c12 band 2 stay
  unchanged; `flow-changed` is covered end-to-end by the `update-check` unit tests, and that is stated (the same
  spirit as the rubric-3 precedent that a new model part need not touch the update criterion).

### 8.2 Testing

- `validate.ts` — four invariant tests (unique / undefined / step-resolves / chain-flows-unique) plus acceptance
  of `flows[]` and `chains[].flows`; `schema.test.ts`'s top-level key-order and node-count pins move with the
  added `properties.flows` (the `$id` pin does not, since it stays v3).
- `update-check.ts` — flow diff: `users` change → `flow-changed`; `users` present→absent / absent→present →
  `flow-changed`; `name`/`criticality`/`steps`/`continues` change → no stale; flow add/remove → no stale; removed
  flow still named → the `removedFlows` guard; the precedence both-fire cases (element+flow → `element-changed`;
  function+flow → `function-changed`); a chain-side `flows[]` re-point → the deliberately-unmarked gap (pinned).
- `render.ts` / `report-model.ts` — Flows section, TOC entry, legend, empty-state, partial-flow phrase, chain
  annotation, `continues` marker.
- `eval-stability` — the `flows` predicate and its tri-state (`pass`/`fail`/`unverified`) and `verified` flag.
- Fixtures — `flows[]` in `checkout-service.fmea.json` and the update pair; pinned facts in `render.test.ts`,
  `validate.test.ts`, `update-check.test.ts`, `prompts.test.ts`, `evals.js` move with them.

## 9. Later work (Approach 3, not in this design)

Recorded so it is not silently dropped, none of it blocks v1:

- Typed flow steps (function / element / external / broker node).
- A positional "continues beyond this step" marker, replacing the whole-flow `continues` boolean where the
  author needs finer grain.
- Traceability lints: a chain names a flow whose steps do not include the chain's function → warning; a flow with
  no steps and no users → warning.

## 10. Prerequisites and out of scope

**Prerequisites, in order:**

1. Register rows C161–C200 promoted to `main` (the user owns this).
2. C201 drafted, adversarially verified to `confirmed`, and admitted to the corpus and register by the user.
3. Only then do the reference files cite C161–C200 and C201, and the implementation proceeds.

**Out of scope for this design:** deriving strength from flows; any flow-driven change to O, D or priority; flow
inference from traces or observability (flows are authored, normative); an effect-statement grammar; any licensed
content (no AIAG-VDA cell, no IEC paraphrase, no SRE Book adaptation); a second rating scale for flow criticality.

## 11. Acceptance criteria

1. The schema file gains optional `flows[]` (with `minItems: 1`) and `chains[].flows`, and its `$id` stays
   `…:v3`; the four invariants of §4.3 reject their violations under the `INVARIANT` code.
2. `scales-software.md` states DF3 and bumps the scales version to 2; `design-inputs.md` item 1 names the flow
   fields and the three criticality criteria, each with its provenance tag; no sourced sentence cites a record id
   that is not in the register.
3. `update-check.ts` computes the flow diff, guards a removed-but-named flow, flags `flow-changed` on a named
   flow's `users` change (presence transitions included) and nothing on the other field changes, and does not
   refuse a draft whose reason is at or above the reach it computes.
4. The render adds a Flows section (with TOC entry, legend, empty-state) and chain annotations; the checkout
   fixture renders them.
5. Rubric 4 with c16 passes prompts 1 and 6 on both capabilities at the §8.1 thresholds; the flows stability
   predicate is `pass` (or explicitly `unverified` and recorded) across the two runs, and `verified` is true.
6. The criticality field cites C201 once C201 is admitted (`confirmed`); until then no reference file cites the
   tier.

## 12. Review record

This spec was reviewed on 2026-10-12 by a five-lens panel — the data model/schema/validator, FMEA method and
provenance, the report/workflow/evals, the update mode, and user experience — and revised to fold in the findings:
the `$id` rationale corrected to no-bump, the DF3 multi-flow rule and the scales-version bump, the enforceable
precedence and the `update-diff` flow section, the tri-state stability predicate, the fixture identity, the c16
definition, and the enumerated code touchpoints.
