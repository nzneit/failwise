# Flow model: design

**Date:** 2026-10-12
**Status:** written after brainstorming; awaiting user review of this written spec
**Precedes:** implementation (via the writing-plans skill), then the acceptance note
**Research:** nzneit/failwise-research issue #2, archived at `docs/research/2026-10-flow-model/` in the private
repository; the canonical artifact is `20-findings-consolidated.md` (66 findings F1.1–F6.5, 21 silences, 12
disagreements). This design cites findings by id; record ids `Cnnn` resolve through the register in
`skills/fmea-software/references/provenance.md`.

---

## 1. Purpose

Give the failwise analysis document a first-class flow model: the critical user and system flows as a named,
structured part of the document, so that a chain can name the flow(s) it breaks, and Severity's blast radius can
be read over a flow's users instead of the free prose of `functions[].for_whom` and `effects.end`. The model is
**additive** — it does not change how Severity, Occurrence, Detection or priority are computed, and it does not
change how dependency strength is stored or used.

The motivating defect is the one issue #2 records: the multi-codebase design dropped the weak-dependency exclusion
because strength was "a pairwise structural proxy for a flow-level fact" — whether the flow crossing an edge still
completes without the provider. This design makes the flow itself a named thing the document holds, rather than a
fact reconstructed from edges or from free text.

## 2. Decisions taken in this design

These are rulings, reached in brainstorming. The panels and scripts may not move them.

| # | Decision | Ruling |
|---|---|---|
| DF1 | Additive | Flows do not drive S, O, D or priority. Strength stays edge-stored and informational (M8 of the multi-codebase design is unchanged). The one place flows touch a rating is the Severity blast-radius denominator, and only as a named referent (DF3). |
| DF2 | Partial by design | A flow always carries `id`, `name` and `criticality`; its `steps` are best-effort and optional, and a `continues` flag records that the flow continues past what is written (the async/broker case, where the team may know "A publishes, B consumes" but not the end-to-end path or every downstream consumer). |
| DF3 | Severity denominator | Severity's blast radius is read over the users of the flows a chain names. A chain that names no flow, or whose named flows record no `users`, reads over the function's users, exactly as today. The band is still chosen by the author against the existing majority/subset/internal-only anchors; the flow supplies the population, never a computed rating. |
| DF4 | Criticality tier | `criticality` is the three-level ordinal tier High/Medium/Low, used for sort/filter only (the measurement ruling: ordinal, so median/mode/max are licensed and arithmetic is not). Provenance: paraphrased from Azure WAF RE:02 (record C201, §7), with the three-level vocabulary corroborated by the mission-tier records C196/C198. |
| DF5 | Shape | Approach 1 of the brainstorm: a flat `flows[]` array with an optional chain→flows reference and three reference-resolves invariants. Approach 3 (typed steps and traceability lints) is recorded as later work (§9). |

## 3. Constraints inherited from the research

The design must honour these findings; where the research is silent or disagrees, the design says so rather than
smoothing it.

- **Flows as first-class are a practitioner model, not a standards one.** Azure Well-Architected RE:02/RE:03 is
  the one published reliability model that treats user and system flows as first-class objects (F1.1); no standard
  names a user-valued end-to-end flow (S1). The design therefore hangs the flow concept on Azure (C014, C201) and
  on the skill's own structure, not on a standards construct.
- **Criticality is the weakest leg.** Azure High/Medium/Low carries no numeric criteria (S6, S7), and no vendor
  taxonomy supports a graded scale; the one academic business-value scale grades a process instance, not a flow.
  The design adopts the tier as an ordinal, non-arithmetic label (F2.1, DF4) and records that it is a priority
  label, not a measurement.
- **Strength stays edge-stored.** Edge-stored strength is what practice converges on (F3.1, F3.15); deriving
  strength from the flows crossing an edge is only a heuristic, and the one test of edge-betweenness-as-criticality
  needs strong qualification (F3.6, F3.8, disagreement #3). DF1 therefore keeps strength informational and does not
  derive it from flows.
- **The denominator already exists; flows name it.** Population-share and affected-user sizing of failure impact
  is established practice (F4.1), and the shipped bands (majority/subset/internal-only) already read over "the
  function's users or requests". A flow with its users gives that measurement the named referent it lacks (the
  issue's motivation). There is no effect-statement grammar anywhere (S3); the nearest pattern is Azure's
  "loss of flow X for users Y" phrasing (F4.3). The design lets a chain name the flow it breaks but keeps the
  effect prose free text.
- **Update mode has prior art.** Versioned flow definitions with instance binding are the update-mode precedent
  (F5.1); the existing carry-forward machinery shows the shape a flow-aware rule takes (F5.4). The design adds a
  dedicated `flow-changed` stale reason (§5).
- **Evals.** The checkout fixture already carries "Critical flows" as prose nothing consumes (F6.1); a rubric
  criterion follows the c13/c14/c15 machinery, and a flows stability predicate needs stable flow ids first
  (F6.2, F6.3).

## 4. Data model

Schema `$id` moves `urn:fmea-software:schema:fmea:v3` → `v4`. The change is purely additive and optional, so a
v3 document still validates against v4 (no old document breaks); the id bumps because the top-level schema sets
`additionalProperties: false`, so a flows-bearing document would not validate against the v3 schema — the document
must declare v4 for the validator to read its `flows[]`. This is the same data-contract lockstep as the
element-kinds and multi-codebase bumps.

### 4.1 `flows[]` — new, optional, top-level

Absent in pre-v4 documents (no old document breaks); present when the team authors flows. One analysis document
may carry many flows (S21 leaves the count open, and the additive ruling needs no bound).

Each flow:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | `plainId` | yes | Opaque identifier, unique within the document (invariant `flow-id-unique`). Stable across versions and diffed byte-for-byte, like element and function ids. |
| `name` | `nonEmptyString` | yes | The flow's name. |
| `criticality` | enum `["High","Medium","Low"]` | yes | Ordinal tier, sort/filter only (DF4). |
| `users` | `nonEmptyString` | no | The population the flow serves. This is the Severity denominator when present (DF3). |
| `steps` | array of `plainId` | no | The ordered functions the flow passes through, best-effort. Each id references a function in `functions[]` (invariant `flow-step-resolves`). Not typed nodes — that is §9's deferral. |
| `continues` | boolean | no | Default `false`. `true` = the recorded steps are a prefix; the flow continues past what is written (the async/broker boundary). |

A flow with no `steps` and no `continues` is a complete flow the team simply chose not to enumerate; a flow with
`continues: true` is explicitly partial. The distinction is the author's, not a validator's.

### 4.2 `chains[].flows` — new, optional

An array of flow ids (0..N), the flows this chain breaks. The author names them; nothing is derived from step
membership, so a shared-service chain can name several flows, and a chain can name a flow even when its own
function is not on that flow's (partial) steps. Absent or empty means the chain names no flow and DF3 falls back
to the function's users.

### 4.3 Invariants

Three, all "a reference resolves" checks, none of them the traceability lints deferred to §9:

- `FLOW_ID_UNIQUE` — flow ids are unique within the document.
- `FLOW_UNDEFINED` — every id in a chain's `flows[]` resolves to a flow.
- `FLOW_STEP_RESOLVES` — every id in a flow's `steps[]` resolves to a function.

## 5. Scripts and update mode

### 5.1 `validate.ts`

Adds the three invariants (§4.3) as error codes in the existing pattern. No other behavior changes.

### 5.2 `priority.ts`

Unchanged. Flows do not feed S/O/D or the priority table; `criticality` is ordinal and used for sort/filter only,
which is the report's job.

### 5.3 `render.ts`

Two additive touches:

- A **Flows section** (after the functions/dependencies block): one row per flow — name, criticality, users (if
  present), steps as the ordered function names, and a "continues" marker when set.
- A **chain annotation**: each chain that names flows lists them ("breaks: checkout"). The existing
  element/dependency/chain tables and the "By top-level element" summary are untouched.

### 5.4 Update mode — `flow-changed`

A new stale reason, added to the closed vocabulary. Fixed precedence becomes:

`element-changed`, `function-changed`, `flow-changed`, `control-removed`, `scales-version`

(the earlier reasons re-read more factors, so they win).

- **Trigger:** a flow a chain names changed its `users` between versions — the one flow field that feeds a rating
  (the Severity denominator). A change to `name`, `criticality`, `steps`, or `continues` marks nothing stale,
  because none feeds a rating under DF1.
- **Carry-forward:** a `flow-changed` row re-reads **S** (the denominator moved) and the Severity rating's
  rationale that names the flow; O, D and priority are carried forward unchanged.
- **Add/remove:** adding or removing a flow marks nothing stale by itself (the edge-change asymmetry precedent).
  A flow id is diffed byte-for-byte, so a rename is a remove-plus-add. A change to *which* flows a chain names
  (its own `flows[]` field) is an authored edit the session makes in step 4, which re-scores S there; it is not a
  structural-diff trigger for `update-check.ts`.

### 5.5 `update-check.ts`

Extended to compute the flow half deterministically: diff `flows[]` by id, diff `users` on each surviving flow,
and flag the chains that name a changed flow. Same contract as today — read-only, refuses a draft whose flags
disagree. Removing a flow that a chain still names leaves a dangling reference, caught by `FLOW_UNDEFINED`; the
update asks the person to re-point or confirm the removal before proceeding, consistent with the existing
removed-element and uncovered-codebase guards.

## 6. Reference files and provenance

Flows are structure, not a catalog, so no new reference file and no new evidence pack. The provenance lands in the
existing files.

- **`design-inputs.md` item 1 ("Critical flows")** keeps `[paraphrased:C014]` for the concept; the "what to
  collect" text gains the flow fields as `[skill-authored]` (where each lands in the document JSON), except the
  `criticality` tier, which carries `[paraphrased:C201]` once C201 is admitted.
- **`scales-software.md`** gains one `[skill-authored]` sentence implementing DF3, and one `[skill-authored]` line
  that flows move no rating (mirroring M8).
- **`quality-and-lint.md`** documents the three invariants as `[skill-authored]`.
- **`SKILL.md`** gains procedure only: collect flows in step 1/2, name flows on chains in step 4, read the
  denominator in step 4/5. `[skill-authored]`.
- **`provenance.md`** carries the register rows C161–C200 and, once admitted, C201.
- **`data/priority-fmea-software-v1.json`** unchanged.

## 7. The criticality record (C201)

The tier itself needs a record the design does not yet have. "Each flow carries a High/Medium/Low criticality
tier" is finding F2.1, sourced to Azure WAF RE:02, and no corpus record holds it (C014 is RE:03; the run-1 claim
ids CT-5–CT-8/CT-32 were never admitted). Before any reference file cites the tier, one record is added:

- **C201 — Azure WAF RE:02 "Identify and rate user and system flows"**, holding the claim that flows are
  identified and rated by a High/Medium/Low criticality tier, with the tier names quoted. Drafted from the
  existing run-1 notes, then adversarially verified (re-fetch, character-for-character quote check) and admitted
  exactly as C161–C200 were. The `criticality` field then carries `[paraphrased:C201]`, and C196/C198 corroborate
  the three-level vocabulary.

## 8. Evals and testing

### 8.1 Evals

- The checkout fixture's "## Critical flows" prose becomes a real `flows[]` section.
- **Rubric → version 4**, adding **c16** (flows) for prompts 1 and 6, **not a must**. Maxima rise 26→28 (prompt 1)
  and 24→26 (prompt 6); the 80%-of-maximum rule and the acceptance note record the change, through the c13/c14/c15
  machinery. Exact numbers are pinned at implementation.
- **Flows stability predicate:** the two-run stability check gains a third comparison — Jaccard over `flows[].id`
  at the same 0.8 floor. It rides on the id-stability guarantee of §5.4. If a run produces no flows, the predicate
  is skipped (the same shape as the element check's empty case).
- **Prompt 7:** no new rubric criterion (the rubric-3 precedent). Its fixture gains one flow-users change in the
  before/after pair, and its judge brief gains one line to run `update-check.ts` and read the `flow-changed`
  flags — the same pattern the multi-codebase design used for `dependency-changed`.

### 8.2 Testing

- `validate.ts` — three invariant tests + v4 acceptance of `flows[]` and `chains[].flows`.
- `update-check.ts` — flow diff: `users` change → `flow-changed`; `name`/`criticality`/`steps`/`continues` change
  → no stale; flow add/remove → no stale; removed flow still named → the dangling guard.
- `render.ts` — Flows section, chain annotation, `continues` marker.
- `eval-stability` — the flow-id Jaccard predicate.
- Fixtures — checkout gains flows; the update before/after pair gains a flow-users change.

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
2. C201 drafted, adversarially verified, and admitted to the corpus and register.
3. Only then do the reference files cite C161–C200 and C201, and the implementation proceeds.

**Out of scope for this design:** deriving strength from flows; any flow-driven change to O, D or priority; flow
inference from traces or observability (flows are authored, normative); an effect-statement grammar; any licensed
content (no AIAG-VDA cell, no IEC paraphrase, no SRE Book adaptation); a second rating scale for flow criticality.

## 11. Acceptance criteria

1. Schema v4 validates documents carrying `flows[]` and `chains[].flows`, and rejects the three invariant
   violations of §4.3.
2. `scales-software.md` states DF3, and `design-inputs.md` item 1 names the flow fields, each with its provenance
   tag; no sourced sentence cites a record id that is not in the register.
3. `update-check.ts` flags `flow-changed` on a named flow's `users` change and nothing on the other field changes,
   and refuses a draft whose flags disagree.
4. The render adds a Flows section and chain annotations; the checkout fixture renders them.
5. Rubric 4 with c16 passes prompts 1 and 6 on both capabilities at the §8.1 thresholds, and the flows stability
   predicate holds across the two runs.
6. The criticality field cites C201 once C201 is admitted; until then no reference file cites the tier.
