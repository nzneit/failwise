# Flow model: design

**Date:** 2026-10-12
**Status:** revised after a five-lens review panel, a focused re-review, an internal-coherence pass, an FMEA-expert persona panel and its confirmation re-review; awaiting user review of this written spec
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
**additive in what it computes** — it adds no rating scale and moves no band cut — but it does change how one
existing anchor is read: the Severity blast-radius denominator (DF3), and a re-read denominator can move a rating
across a band. It does not change how Occurrence or Detection are computed (priority follows S as it always
does), and it does not change how dependency strength is stored or used.

The model is scoped to the architecture-phase design-side run (the skill's phase); a flow's end-user population is
a coarse referent, not a unit-level figure.

The motivating defect is the one issue #2 records: the multi-codebase design dropped the weak-dependency exclusion
because strength was "a pairwise structural proxy for a flow-level fact" — whether the flow crossing an edge still
completes without the provider. This design makes the flow itself a named thing the document holds, rather than a
fact reconstructed from edges or from free text.

## 2. Decisions taken in this design

These are rulings, reached in brainstorming and revised after the review panels. The panels and scripts may not
move them.

| # | Decision | Ruling |
|---|---|---|
| DF1 | Additive | Flows add no rating scale and move no band cut, and they drive no rating except Severity's — and only through its blast-radius denominator (DF3). Occurrence and Detection are not otherwise touched (the scales-version bump re-opens them for re-read, DF6), and priority follows S as it always does. Strength stays edge-stored and informational (M8 of the multi-codebase design is unchanged). |
| DF2 | Partial by design | A flow always carries `id`, `name` and `criticality`; its `steps` are best-effort and optional (a linear sequence — branching and fan-out structure is §9's deferral) — and a `steps_partial` flag records that the recorded steps are a prefix, so the flow continues past what is written (the async/broker case, where the team may know "A publishes, B consumes" but not the end-to-end path or every downstream consumer). The flag records **documentation extent only; it never means the flow survives a failure** (the collision with graceful-degradation vocabulary is why it is not named "continues"). |
| DF3 | Severity denominator | Severity's blast radius is read over the affected population of the flow a chain names; where a chain names several flows, the band is read over the named flow that yields the **highest band**, and that flow is named in the rating's rationale. A chain that names no flow reads over the function's users, exactly as today. The affected population is read **while the mode is active** over the flow's `users.population`, which is the **referent** population the flow serves — never a count, never the affected figure — with the existing structural test and the rule that a stated share can raise the class and never lower it. A flow a chain names **must** carry `users` (rule `flow-users-required`), so a named denominator is never silent — the referent population is a required, structured field whose value is a label. Reading the band over the single highest-band flow is the worst-credible reading, and the chosen flow is named in the rationale so the board can see the basis. This is a **global redefinition** of the blast-radius population — the definition sentence and every anchor row that reads "the function's users", for the stated-share reading and the structural test, not a footnote. The band is still chosen by the author against the existing anchors; the flow supplies the population, never a computed rating. Because this changes how the Severity anchor is read, it bumps the scales version (DF6). |
| DF4 | Criticality tier | `criticality` is the three-level ordinal tier High/Medium/Low — a **flow-value priority label, not a criticality analysis**. The canon's criticality is a severity-derived category or number (MIL-STD-1629A Task 102, ECSS); this field derives nothing and drives nothing, and the disclaimer is carried in the schema description, a `methodology.md` row, and the report legend. It is used for sort/filter only; the ordinal ruling (median/mode/max licensed, arithmetic not) is the addendum's, `[paraphrased:C192]` Sullivan & Artino, `[paraphrased:C193]` Briand, Morasca & Basili, `[paraphrased:C194]` Stevens. The tier is paraphrased from Azure WAF RE:02 (record C201, §7, not yet admitted), with the three-level vocabulary corroborated by C196/C198 **once they clear the vote protocol**. The three criteria are stated in `design-inputs.md` as **falsifiable one-line tests** (not impact-kind descriptions, which do not discriminate), so two raters converge. |
| DF5 | Shape | Approach 1 of the brainstorm: a flat `flows[]` array with an optional chain→flows reference, five reference invariants, and two machine lints — the traceability warnings, moved from later work now that the authored link needs a falsifier. Typed steps and typed fan-out/broker nodes remain later work (§9). |
| DF6 | Scales version | DF3 is a change to how an anchor reads, so the scales version bumps (`scales version: 1` → `2`); a version gap marks every rated row `scales-version` and re-reads all three factors on the next update, by the existing rule. This is the rule working as written, not a side effect to route around. Because it re-opens O and D as well as S, the acceptance note carries a one-paragraph **board note** recording that no risk changed and only the Severity denominator definition moved. |

## 3. Constraints inherited from the research

The design must honour these findings; where the research is silent or disagrees, the design says so rather than
smoothing it.

- **Flows as first-class are a practitioner model, not a standards one.** Azure Well-Architected RE:02/RE:03 is
  the one published reliability model that treats user and system flows as first-class objects (F1.1); no standard
  names a user-valued end-to-end flow (S1). The design hangs the flow concept on Azure (C014, C201) and on the
  skill's own structure, not on a standards construct. Its nearest canon lineage is the operational-context object
  — MIL-STD-1629A mission/phase/mode, ECSS end-to-end functional paths, and ARP5580's co-equal Functional FMEA
  (F1.2–F1.4) — and `methodology.md` maps it (DF4, §6).
- **Criticality is the weakest leg.** A three-level tier vocabulary does exist — NERC CIP-002 grades assets
  High/Medium/Low (C196), FIPS 199 sets three impact levels (C198), both awaiting the vote protocol — but no source
  grades a *flow by its business value*: none supplies the numeric criteria the tiers imply, and no vendor
  *flow-value*-tier taxonomy was citable (S7, reframed by the addendum: the regulator and doctrine taxonomies tier
  on asset and mission-criticality grounds, not flow value). The design adopts the tier as an ordinal,
  non-arithmetic label (F2.1, DF4) and records that it is a priority label, not a measurement. No finding evidences
  that two raters converge on it, so the design does not claim convergence beyond the falsifiable criteria it adds.
- **Strength stays edge-stored.** Edge-stored strength is what practice converges on (F3.1, F3.15), and no source
  stores a per-(edge, flow) pair (S2); deriving strength from the flows crossing an edge is only a heuristic, and
  the one test of edge-betweenness-as-criticality needs strong qualification (F3.6, `partially unverified`; F3.8;
  disagreement #3). DF1 therefore keeps strength informational and does not derive it from flows.
- **The denominator already exists; flows name it.** Population-share and affected-user sizing of failure impact
  is established practice (F4.1), and the shipped radii (majority/subset/internal-only) already read over "the
  function's users or requests". A flow with its users gives that measurement the named referent it lacks (the
  issue's motivation), and it does not smuggle a second scale or an Occurrence quantity in: `users` is the referent
  population, `criticality` is sort/filter only, the "while the mode is active" scoping is kept, and no arithmetic
  is performed. There is no effect-statement grammar anywhere (S3); the nearest pattern is Azure's "loss of flow X
  for users Y" phrasing (F4.3). The design lets a chain name the flow it breaks but keeps the effect prose free
  text.
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
| `criticality` | enum `["High","Medium","Low"]` | yes | The flow-value priority label, sort/filter only (DF4). The schema description states it is not a criticality analysis. |
| `users` | object | when a chain names the flow | `population` (required) — the **referent** population the flow serves, a label such as "all shoppers at checkout", never a count or a share; `share` (optional) — a stated share or the selecting condition quoted from the inputs. The rule `flow-users-required` enforces presence on any chain-named flow. |
| `steps` | array of `plainId` | no | The ordered functions the flow passes through, best-effort; a linear sequence (branching and fan-out structure is §9's deferral). Each id references a function in `functions[]` (rule `flow-step-resolves`). |
| `steps_partial` | boolean | no | Default `false`. `true` = the recorded steps are a prefix; the flow continues past what is written (the async/broker boundary). Documentation extent only — never runtime survival. |

A flow with no `steps` and `steps_partial: false` is a complete flow the team chose not to enumerate; a flow with
`steps_partial: true` is explicitly partial. The distinction is the author's, not a validator's. A flow no chain names may have no `steps`; a flow a chain names for DF3 should carry `steps`, because a chain-named flow with empty `steps` draws the `chain-flow-no-steps` warning of §4.4.

### 4.2 `chains[].flows` — new, optional

An array of flow ids (0..N), the flows this chain breaks. The author names them; nothing is derived from step
membership, so a shared-service chain can name several flows. Absent or empty means the chain names no flow and
DF3 falls back to the function's users. Where several flows are named, DF3 reads the band over the one yielding
the highest band and names it. The chain's Severity rationale must name the chosen flow and quote the clause in
`effects.end` or `for_whom` by which the flow's value dies (the consistency rule between the flow link and the
effect prose).

### 4.3 Invariants

Five, added to `INVARIANT_RULES` as kebab-case rule ids reported under the existing `INVARIANT` code:

- `flow-id-unique` — flow ids are unique within the document.
- `chain-flow-resolves` — every id in a chain's `flows[]` resolves to a flow.
- `flow-step-resolves` — every id in a flow's `steps[]` resolves to a function.
- `chain-flows-unique` — a chain's `flows[]` names no flow twice (pointer at each later entry, as the existing
  `dependency-pair-unique` does for repeated edge identities).
- `flow-users-required` — every flow a chain names carries `users`.

### 4.4 Warnings (the traceability checks, now shipped)

Two machine lints, added to `lib/lints.ts` `MACHINE_RULES` (warning severity, never blockers) and reported by
`validate.ts`; `quality-and-lint.md` documents them. They give the authored chain→flow link its falsifier without
deriving it:

- `chain-flow-step-mismatch` — a chain names a flow whose `steps` are non-empty and complete (`steps_partial`
  false) and do not include the chain's function; a partial flow's recorded prefix may legitimately omit it, so
  the lint does not fire when `steps_partial` is true.
- `chain-flow-no-steps` — a chain names a flow whose `steps` is empty (a chain-named denominator with no
  functional referent).

## 5. Scripts and update mode

### 5.1 Typed model and schema text (`lib/types.ts`, `fmea.schema.json`, `lib/report-model.ts`)

The type surface must move with the schema: a `Flow` interface (with the `users` object); `flows?: Flow[]` on
`FmeaDocument`; `flows?: string[]` on `Chain`; `StaleReason` gains `"flow-changed"`; the schema `stale.reason`
`enum` **and its ordered description** gain `"flow-changed"`; and `lib/report-model.ts`'s exhaustive
`STALE_REASON_WORDS: Record<StaleReason, string>` gains the human phrase, without which `tsc` fails and the report
prints `undefined`. Three further schema descriptions drift and must move with it: the top-level description
("Five parts are authored … A sixth part, computed" — `flows` is a sixth authored part, the computed part becomes the seventh, and the parenthetical list `(meta, elements, functions, dependencies, chains)` gains `flows`), `stale.flag`'s
text, and `historyEntry.change`'s. By the schema's own convention that each cross-reference, uniqueness or presence-coupling rule is named in
the description of the field it governs, the `flows[].id` description cites `flow-id-unique`, `flows[].steps`
cites `flow-step-resolves`, `chains[].flows` cites both `chain-flow-resolves` and `chain-flows-unique`, and the
`flows[].users` description cites `flow-users-required`. The stale-reason vocabulary is labelled **"stale reason set
v2"** in `quality-and-lint.md` and `SKILL.md`, so a sign-off document quoting the enum reads the fifth reason as a
documented revision.

### 5.2 `validate.ts`

Adds the five invariants (§4.3) to `INVARIANT_RULES`, and reports the two machine lints (§4.4) that join
`MACHINE_RULES`. No other behavior changes.

### 5.3 `render.ts` and `report-model.ts`

- A **Flows section**: one row per flow — name, criticality, users (`population`, and `share` if present), steps
  as the ordered function names, and a `steps_partial` marker when set. It gets a TOC (`CONTENTS`) entry, a
  one-line legend for the criticality tier and the `steps_partial` marker, an explicit empty-state ("No flows
  recorded."), and a fixed row order (by criticality rank, High first, then id). The criticality legend states plainly that it
  is a **priority label, not a rating and not a criticality analysis**. Every rendered string is escaped; `name`
  and `users.population` are free text. A partial flow renders an explicit phrase ("a starting point only; the
  recorded steps are a prefix") rather than empty cells that read as broken — the phrase does not hardcode
  "broker", so it reads on any partial flow. The section is placed after the element/dependencies block.
- A **chain annotation**: each chain that names flows lists them ("breaks: checkout"), and marks the flow whose
  band was used. The existing element/dependency/chain tables and the "By top-level element" summary are untouched.
  The model changes live in `report-model.ts` (`ReportModel`), not `render.ts` alone.

### 5.4 Update mode — `flow-changed`

A new stale reason, added to the closed vocabulary (now "stale reason set v2"). Fixed precedence becomes:

`element-changed`, `function-changed`, `flow-changed`, `control-removed`, `scales-version`

The order between `function-changed` and `flow-changed` is cosmetic — both re-read S only — and is fixed here so
the vocabulary has a single order.

- **Triggers:** (a) a chain-named flow changed its `users` (`population` or `share`) between versions — the field
  that feeds the Severity denominator; or (b) a chain's own `flows[]` set changed — a re-point moves the
  denominator, so it is a structural-diff trigger, not an unrecorded authored edit. A change to a flow's `name`,
  `criticality`, `steps`, or `steps_partial` marks nothing stale, because none feeds a rating under DF1.
- **Carry-forward:** a `flow-changed` row re-reads **S** (the denominator moved) and the Severity rationale that
  names the chosen flow and quotes the effect clause; **O and D are carried forward**; **priority is recomputed**
  from the re-rated S by `priority.ts` (it is not a carried factor). This is the S-only re-read, distinct from the
  all-three re-read a `scales-version` bump triggers.
- **Add/remove:** adding or removing a flow marks nothing stale by itself. A flow id is diffed byte-for-byte, so a
  rename is a remove-plus-add.

### 5.5 `update-check.ts` and `update-diff.ts`

- **A flow diff.** `update-diff.ts` gains a flow section alongside its edge and element sections: flows added,
  removed, and changed by `users`, **and** chains whose `flows[]` set changed. It is deterministic (a by-id diff of
  `flows[]` plus a `users` compare plus a set compare of each chain's `flows[]`). Its reach feeds the checker's
  `reached` map, so `stale-reason` validates a `flow-changed` flag, and its count joins the printed summary.
- **A removed-flow-still-named guard.** Removing a flow a chain still names leaves a dangling reference. Because
  `update-check.ts` runs "the legacy gate and the schema … never the invariants", `chain-flow-resolves` fires only at
  the end of the update, not before it — so the update mode needs its own structural guard, a `removedFlows`
  section analogous to the existing `removedLinks`/`orphans`, that lists each removed flow, the chains naming it,
  and the surviving flows they could be re-pointed to. Like `removedLinks`, an unresolved removed-flow refuses the
  draft with `UPDATE_MISMATCH` under `--check`. `chain-flow-resolves` remains the `validate.ts` backstop.
- **Precedence, made enforceable.** The checker's `stale-reason` rule **previously accepted only** the reason it computes, and it
  computes `element-changed` (top of the order) but never `function-changed`. Because `flow-changed` sits below
  `function-changed`, the checker would refuse a *correct* draft: a row whose legitimate session reason is
  `function-changed` (a function changed on the same update) that a flow change also reaches. Rule: **the checker
  accepts any reason at or above the reach it computes** (its computed reach is a lower bound on precedence), and
  the both-fire cases — a row reached by an element change and a flow change takes `element-changed`; reached by a
  function change and a flow change takes `function-changed` — are added to the tests.
- **Output.** The flow half prints its own section (flows added / removed / changed, chains re-pointed, and the
  removed-flow guard), and the change count joins the summary line that the update copies into `meta.history`; a
  changed flow that no chain names still appears.

## 6. Reference files and provenance

Flows are structure, not a catalog, so no new evidence pack. The provenance lands in the existing files; one
reference file, `methodology.md`, is added to the change set. (The design prepares and requests the register rows
below; the user admits them — §10.)

- **`design-inputs.md` item 1 ("Critical flows")** keeps `[paraphrased:C014]` for the concept; the "what to
  collect" text gains the flow fields as `[skill-authored]` (where each lands in the document JSON), a granularity
  rule ("what counts as one flow: a user-valued journey named once, not a per-step slice"), and the async recipe
  ("where the team knows only that one service publishes and another consumes, record what is known, name the end
  population in `users.population`, and set `steps_partial: true`"). The `criticality` tier carries `[paraphrased:C201]`
  (once C201 is admitted) and the three criteria as **falsifiable one-line tests** (`[paraphrased:C201]`).
- **`scales-software.md`** implements DF3 as a **global redefinition** of the blast-radius definition sentence:
  "over the function's users or requests **while the mode is active** — or, where the chain names flows, over the
  affected population of the named flow that yields the highest band, read over that flow's referent population"
  — keeping the structural test and the
  stated-share-raises-never-lowers clause, and governing every anchor row that reads "the function's users". It
  also gains one `[skill-authored]` line that flows move no rating except Severity's denominator (mirroring M8),
  `flow-changed` in the carry-forward enumeration, and the DF6 scales-version bump (`scales version: 1` → `2`),
  with the reason recorded.
- **`methodology.md`** gains mapping rows placing the flow on the canon's operational-context lineage (MIL-STD-1629A
  mission/phase/mode, ECSS end-to-end functional paths, ARP5580 co-equal Functional FMEA — F1.2–F1.4) and a row
  stating that `criticality` is a flow-value priority label and not a criticality analysis; its existing
  "functional block diagrams → not applicable" and "criticality categories → not applicable" rows are reconciled
  against the shipped behaviour.
- **`quality-and-lint.md`** documents the five invariants and the two warnings as `[skill-authored]`, and labels
  the stale-reason vocabulary "stale reason set v2".
- **`SKILL.md`** — procedure rewritten as a per-step list: collect flows in step 1/2; **fill `steps` after step 3**
  (steps reference functions, so the session resolves the ids from the team's prose and the human never transcribes
  opaque ids); name flows on chains in step 4; read the denominator in step 5. The **Update mode section** gains
  the new precedence order and the `flow-changed` trigger/carry-forward. `[skill-authored]`.
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
  addendum's C192–C200 have not yet cleared. The `criticality` field and its three criteria then carry
  `[paraphrased:C201]`.

C196 and C198 corroborate the three-level vocabulary only if they too clear the vote protocol; until then the
citing sentence labels them single-reader, and neither is cited as corroborating. Azure RE:02 is paraphrase-only:
only the bare tier labels may appear verbatim, never Azure's tier descriptions — the criteria restate the impact
kinds in the skill's own words, never Azure's.

## 8. Evals and testing

### 8.1 Evals

- **Fixture identity.** The "## Critical flows" prose lives in `checkout-inputs.md` (and the three `update/*.md`),
  an **inputs** file read by prompts 1 and 5; it stays there (it is the run's input, and removing it would make
  c16 unscorable). The `flows[]` array is **added to the document fixture** (`checkout-service.fmea.json`); the
  prompt-7 update pair gains a flows section in `before.fmea.json`, and the prose change that moves a named flow's
  `users` is carried by `after-architecture.md`, the pair's sole "after". Because DF6 bumps the scales version to
  2, every fixture document's `meta.scales.version` moves to 2 in the same change — otherwise the prompt-7 update
  would mark every rated row `scales-version` and `expected-stale.json` would not stay unchanged.
- **Rubric → version 4**, adding **c16** (flows) for **prompt 1 only**, **not a must**, with bands 2/1/0 and an
  expected-flows table authored alongside the fixture: band 2 — the flows the critical-flows input names appear
  with ids, names, criticality, users, and the expected chain→flow naming; band 1 — flows present but incomplete
  (missing the chain naming or `users`); band 0 — no flows section. c16 applies to the same prompts as c13 and c14
  (the design and conversion prompts) minus the conversion prompt: prompt 6's own input (`legacy-rpn-sheet.csv`)
  carries no critical-flows section, so a conversion cannot produce flows, and prompt 5, whose postmortem-seeded
  baseline is scored on c1–c10 only, is out by the same convention that keeps c13 and c14 off it. Prompt 1's
  maximum rises 26→28 and its 80%-of-maximum threshold becomes 23/28; prompts 6 and 7 are unchanged (24, 22). The
  code sites: `tools/eval-report.ts` (`CRITERIA` and its count comment), `tools/workflows/evals.js` (`RUBRIC`, its
  hand-synced `CRITERIA`, `STABILITY_SCHEMA`), and `tools/eval-report.test.ts` (the `CRITERIA.length` and
  `const RUBRIC = 3` pins; the workflow-copy regex already accepts any rubric number), with `evals/rubric.md`'s
  applicability/version/pass-rule paragraphs.
- **Flows stability predicate — tri-state.** `tools/eval-stability.ts` gains a `flows` comparison (Jaccard over
  `flows[].id` at the 0.8 floor) reported as `pass` / `fail` / `unverified`: both runs empty → `unverified` (never
  a silent pass; listed in the acceptance note); one side empty → `fail` (a run that dropped every flow); else the
  Jaccard. The result carries a top-level `verified` flag that is true only when every predicate actually ran. The
  plumbing: the `Stability` interface and `pass` expression, an id-set helper, `eval-stability.test.ts` pins,
  `STABILITY_SCHEMA.required` and the stability judge brief in `evals.js`, and `eval-report.ts`'s stability table.
- **Prompt 7.** No new rubric criterion. The flow-users change is placed on an **already-stale** chain so the
  stale-reason label is masked by the higher-precedence reason and `expected-stale.json`/c12 band 2 stay
  unchanged; `flow-changed` (both the `users`-change and the chain re-point triggers) is covered end-to-end by the
  `update-check` unit tests, and that is stated (the rubric-3 precedent that a new model part need not touch the
  update criterion).

### 8.2 Testing

- `validate.ts` — five invariant tests (flow-id-unique / chain-flow-resolves / flow-step-resolves /
  chain-flows-unique / flow-users-required) and two lint tests (chain-flow-step-mismatch / chain-flow-no-steps) plus acceptance of
  `flows[]` and `chains[].flows`. `schema.test.ts`'s top-level key-order pin and its derivation assertions move
  with the added `properties.flows` (the `$id` pin does not, since it stays v3), so the derivation fixture must
  instantiate the new optional flow fields (`users`, `steps`) or the "every constrained schema node is reached"
  assertion fails.
- `update-check.ts` — flow diff: a chain-named flow's `users` change → `flow-changed`; a chain's `flows[]` set
  change → `flow-changed`; `name`/`criticality`/`steps`/`steps_partial` change → no stale; flow add/remove → no
  stale; an unresolved removed flow still named → the `removedFlows` guard refusing the draft; the precedence
  both-fire cases (element+flow → `element-changed`; function+flow → `function-changed`).
- `render.ts` / `report-model.ts` — Flows section, TOC entry, legend (including "priority label, not a rating"),
  empty-state, partial-flow phrase, chain annotation naming the chosen flow, `steps_partial` marker.
- `eval-stability` — the `flows` predicate, its tri-state (`pass`/`fail`/`unverified`) and the `verified` flag.
- Pins that move: `invariants.test.ts`'s `INVARIANT_RULES.length` (32→37); `lib/lints.ts` `MACHINE_RULES` and
  `quality-and-lint.md`'s "fifteen machine lints" (→ seventeen) with its order test; `schema.test.ts`'s top-level
  description pin and derivation assertions; `eval-stability.test.ts`'s `Object.keys` pin (the added `flows` and
  `verified` fields); and the `update-check.ts` header comment (its printed sections gain flows/removedFlows).
- Fixtures — `flows[]` in `checkout-service.fmea.json` and the prompt-7 pair; `meta.scales.version` → 2 in every
  fixture document; pinned facts in `render.test.ts`, `validate.test.ts`, `update-check.test.ts` and `evals.js`
  move with them (`prompts.test.ts` moves only if a new fixture file is added, since it pins prompt text, input
  names and fixture existence).

## 9. Later work (not in this design)

Recorded so it is not silently dropped, none of it blocks v1:

- Typed flow steps (function / element / external / broker node), and typed fan-out/broker nodes that model an
  event-driven flow as a branching DAG rather than a line.
- A positional "steps continue past this step" marker, replacing the whole-flow `steps_partial` boolean where the
  author needs finer grain.

## 10. Prerequisites and out of scope

**Prerequisites, in order:**

1. Register rows C161–C200 promoted to `main` (the user owns this).
2. C201 drafted, adversarially verified to `confirmed`, and admitted to the corpus and register by the user.
3. Only then do the reference files cite C161–C200 and C201, and the implementation proceeds.

**Out of scope for this design:** deriving strength from flows; any flow-driven rating change other than the
Severity denominator (DF3); mapping a flow's criticality to a reliability target or an SLO (Azure RE:04-style
per-flow targets are not set by this model); flow inference from traces or observability (flows are authored,
normative); an effect-statement grammar; any licensed content (no AIAG-VDA cell, no IEC paraphrase, no SRE Book
adaptation); a second rating scale for flow criticality.

## 11. Acceptance criteria

1. The schema file gains optional `flows[]` (with `minItems: 1`) and `chains[].flows`, and its `$id` stays
   `…:v3`; the five invariants of §4.3 reject their violations and the two warnings of §4.4 fire, under the
   `INVARIANT` code and the lint codes respectively.
2. `scales-software.md` states DF3 as the global redefinition (with "while the mode is active") and bumps the
   scales version to 2; `design-inputs.md` item 1 names the flow fields, the granularity rule, the async recipe and
   the three criticality criteria as falsifiable tests; `methodology.md` maps the flow and reconciles its two
   rows; no sourced sentence cites a record id that is not in the register.
3. `update-check.ts` computes the flow diff (including chain re-points), guards an unresolved removed-but-named
   flow by refusing the draft, flags `flow-changed` on a chain-named flow's `users` change and on a chain's
   `flows[]` change and nothing on the other field changes, and does not refuse a draft whose reason is at or above
   the reach it computes.
4. The render adds a Flows section (with TOC entry, legend stating "priority label, not a rating", empty-state)
   and chain annotations naming the chosen flow; the checkout fixture renders them.
5. Rubric 4's c16 scores prompt 1 at band 2 on both capabilities (it is not a must); the flows stability predicate is
   `pass` across the two runs and the result's `verified` flag is true — or, where **both** runs legitimately
   carry no flows, the predicate is `unverified` and the acceptance note records it as unverified, never as a
   pass.
6. The criticality field cites C201 once C201 is admitted (`confirmed`); until then no reference file cites the
   tier, and C196/C198 are not cited as corroborating.

## 12. Review record

This spec was reviewed on 2026-10-12 in five passes. A **five-lens panel** (data model/schema/validator, FMEA
method and provenance, report/workflow/evals, update mode, user experience) produced the `$id` no-bump rationale,
the DF3 redefinition and scales-version bump, the enforceable precedence and the `update-diff` flow section, the
tri-state stability predicate, and the enumerated code touchpoints. A **focused re-review** caught the DF3
redefinition needing to be global, c16 scoped to prompt 1, the acceptance-criteria contradiction, and the
criticality criteria re-tag. An **internal-coherence pass** caught DF1's "moves no rating" contradicting DF3, the
"both runs" case, the c16 prompt-5 exclusion, and the chain-named qualifier. An **FMEA-expert persona panel**
(standards/method, software FMEA, facilitation/review board, reliability/SRE) and its synthesis produced the
final revision: the denominator's "while the mode is active" scoping restored, the multi-flow union replaced by
the highest-band rule, the traceability warnings shipped, `users` required on chain-named flows and shaped, the
`criticality` term-of-art disclaimer and falsifiable criteria, the `continues` → `steps_partial` rename, the
`methodology.md` reconciliation, the chain-re-point stale trigger, and the minor bookkeeping items. A **confirmation
re-review** of that pass then caught the `steps`-as-linear correction, the fixtures' `meta.scales.version` moving
to 2 with the bump, the missed code-site pins, and the `flow-undefined` → `chain-flow-resolves` rename.
