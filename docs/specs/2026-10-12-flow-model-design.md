# Flow model: design

**Date:** 2026-10-12
**Status:** revised after a five-lens review panel, a focused re-review, two internal-coherence passes, an FMEA-expert persona panel and its confirmation re-review, and a second, independent FMEA-expert persona panel with its synthesis (whose 18-item change list this revision folds in); awaiting user review of this written spec
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

**What this model is not, in safety terms.** The skill is an availability-and-reliability FMEA on a design, and
this addition does not widen it: `Severity` is the technical consequence class of an end effect (access, data,
correctness, latency), **disjoint from harm to people, property or the environment**; no row records a failure
condition, a hazardous event, a safety objective or an integrity requirement, and no DAL/ASIL/SIL is mapped
anywhere. The canon's hazard analyses — F1.5's functional hazard assessment and hazard analysis, F1.8's STPA —
are deliberately **not modelled**, and this design is not a place to add them (§10). `severity`, `Severity` and
`value_priority` in this document are the skill's own vocabulary and carry no safety semantics.

**What the motivating defect actually was.** Issue #2's defect is that the multi-codebase design dropped the
weak-dependency exclusion because strength was "a pairwise structural proxy for a flow-level fact" — whether the
flow crossing an edge still completes without the provider. That exclusion was repaired by **deletion**, not by
this model: strength stays edge-stored and informational (§3), and flow membership is **not a strength input** in
either direction. What this model adds is the named flow the document never had, not a strength derivation
recovered by another route.

## 2. Decisions taken in this design

These are rulings, reached in brainstorming and revised after the review panels. The panels and scripts may not
move them.

| # | Decision | Ruling |
|---|---|---|
| DF1 | Additive | Flows add no rating scale and move no band cut, and they drive no rating except Severity's — and only through its blast-radius denominator (DF3). Occurrence and Detection are not otherwise touched (the scales-version bump re-opens them for re-read, DF6), and priority follows S as it always does. Strength stays edge-stored and informational (M8 of the multi-codebase design is unchanged), and flows are not a strength input (§1). |
| DF2 | Partial by design | A flow always carries `id`, `name` and `value_priority`; its `steps` are best-effort and optional (a linear sequence — branching and fan-out structure is §9's deferral) — and a `steps_partial` flag records that the recorded steps are a prefix, so the flow continues past what is written (the async/broker case, where the team may know "A publishes, B consumes" but not the end-to-end path or every downstream consumer). The flag records **documentation extent only; it never means the flow survives a failure** (the collision with graceful-degradation vocabulary is why it is not named "continues"), and it is **not a defeater of the checks**: it silences the mismatch warning only where a prefix is actually recorded, and a chain-named flow with empty `steps` draws `chain-flow-no-steps` whatever the flag says (§4.4). |
| DF3 | Severity denominator | Severity's blast radius is read over the affected population of the flows a chain names. For that row the flow referent **replaces** the function's users as the population the structural test is read over — the test restated in flow terms, not the function's test unioned with a flow-scoped label: majority is the mode hitting every request of the flow's referent population while it is active, subset is its hitting only those meeting a further condition (or a share stated in an incident record raising the class), internal-only is the flow having no external user. It **never lowers the band**: the radius class is `max(flow class, function class)` — the **floor**, whose second term is *the class this same chain reads with no flow named* (the structural test over the function's requests and users, never a reading of `for_whom` prose) — so a flow whose referent is wider than the function's users can raise S and a flow narrower than them can never deflate it. A flow whose partial prefix does not include the chain's function reads the **subset** class (asserting only what is documented), and that reading **takes precedence over the flow's own class**, so a partial internal-only flow whose recorded prefix excludes the function still reads subset; where a partial prefix and a stated share both apply, the share raises from that subset reading; the floor applies after. A share stated in an incident record raises the class it is measured against — the named flow's, where the flow is the referent — and never lowers it; the floor applies after the raise. The chain carries **one** end effect (the existing rule), so every named flow is read under that same effect and "class" here always means the **radius** class: no per-flow effect classes exist. Where a chain names several flows, the band is read over the single named flow that yields the **highest radius class** — the **worst-single-flow** reading, not a worst-credible one: the named populations are treated as **disjoint**, their union is deliberately **not computed** (the deficit, and its common-cause companion, are declared in §4.2 and §10), and the rationale names **every** named flow, the one that set the band, and the scale that flow carries against the system's population as the inputs name it (or the recorded open assumption that the inputs give no total). A chain that names no flow reads over the function's users exactly as today. A flow a chain names **must** carry `users` and a non-catalog `sources[]` entry (rules `flow-users-required`, `flow-sources-required`), so the denominator is neither silent nor unreviewed: `users.review` carries the same status vocabulary as a rating's, the warning `flow-users-provisional` fires while it is provisional, and the referent population is a required, structured field whose value is a label. This is a **global redefinition** of the blast-radius population — the definition sentence, every anchor row that names a radius class or reads "the function's users", and the reviewer row that restates the top-of-scale anchor (`catastrophic-severity-anchor`), not a footnote — and §6 lists those rows. The band is still chosen by the author against the existing anchors; the flow supplies the population, never a computed rating. Because this changes how the Severity anchor is read, it bumps the scales version (DF6). |
| DF4 | Value priority, not criticality | The tier is the three-level ordinal High/Medium/Low, named `value_priority` — DF4's sentence, carried verbatim in three places: **a flow-value priority label: not a rating, not a criticality analysis, not a safety or hazard analysis, and not a reliability target**. The canon's `criticality` is a term of art with a technical meaning (a severity-derived category or number: MIL-STD-1629A Task 102/103, ECSS, IEC Annex B); this field derives nothing, ranks nothing by recoverability or time, and drives nothing, so it is not named with the canon's word, and the qualifier is not left to a description alone: the sentence stands in the schema description of `flows[].value_priority`, in the `methodology.md` row, and in the report legend, and the legend's copy is asserted by test (§5.3, §8.2), so a later edit cannot drop it silently. The field is used for sort/filter only; the ordinal ruling (median/mode/max licensed, arithmetic not) is the addendum's, `[paraphrased:C192]` Sullivan & Artino, `[paraphrased:C193]` Briand, Morasca & Basili, `[paraphrased:C194]` Stevens. The tier vocabulary is paraphrased from Azure WAF RE:02 (record C201, now admitted `confirmed`, §7), with the three-level shape corroborated by C196/C198 **once they clear the vote protocol**. The three criteria are stated in `design-inputs.md` as **falsifiable one-line tests** (not impact-kind descriptions, which do not discriminate), so two raters converge. |
| DF5 | Shape | Approach 1 of the brainstorm: a flat `flows[]` array with an optional chain→flows reference, seven invariants, four machine lints and three reviewer rules — the traceability warnings, moved from later work now that the authored link needs a falsifier. Typed steps and typed fan-out/broker nodes remain later work (§9). |
| DF6 | Scales version | DF3 is a change to how an anchor reads, so the scales version bumps (`scales version: 1` → `2`); a version gap marks every rated row `scales-version` and re-reads all three factors on the next update, by the existing rule. This is the rule working as written, not a side effect to route around. Because it re-opens O and D as well as S, the acceptance note carries a one-paragraph **board note** recording that **only the blast-radius denominator definition moved** — no rating is changed by this design, the mandated re-read may move S, and O and D are re-opened for re-read, not for a change of factor. |

## 3. Constraints inherited from the research

The design must honour these findings; where the research is silent or disagrees, the design says so rather than
smoothing it.

- **Flows as first-class are a practitioner model, not a standards one.** Azure Well-Architected RE:02/RE:03 is
  the one published reliability model that treats user and system flows as first-class objects (F1.1); no standard
  names a user-valued end-to-end flow (S1). The design hangs the flow concept on Azure (C014, C201) and on the
  skill's own structure, not on a standards construct. Its nearest canon lineage is **operational context as a
  path** — MIL-STD-1629A's mission/phase/mode inventory and ECSS's end-to-end functional paths, with ARP5580's
  co-equal Functional FMEA (F1.2–F1.4) — and `methodology.md` states the flow's own role instead of borrowing the
  canon's vocabulary: a flow is a **use-case grouping of functions** (a row a user-valued journey names), not an
  operational phase or mode, not a function, not a failure condition and not a hazardous event; a chain is the
  failure-mode row, and its end effect may be the loss of the flow. Mission and phase reach a rating only through
  Occurrence's exposure axis, as they do today. Phases and modes are out of scope (§10).
- **`value_priority` is the weakest leg.** A three-level tier vocabulary does exist — NERC CIP-002 grades assets
  High/Medium/Low (C196), FIPS 199 sets three impact levels (C198), both awaiting the vote protocol — but no source
  grades a *flow by its business value*: none supplies the numeric criteria the tiers imply, and no vendor
  *flow-value*-tier taxonomy was citable (S7, reframed by the addendum: the regulator and doctrine taxonomies tier
  on asset and mission-criticality grounds, not flow value). The design adopts the tier as an ordinal,
  non-arithmetic label (F2.1, DF4) and records that it is a priority label, not a measurement. No finding evidences
  that two raters converge on it, so the design does not claim convergence beyond the falsifiable criteria it adds.
- **Safety lineage is not claimed and not followed.** F1.1–F1.4 are the lineage the flow is mapped to; F1.5
  (FHA/HARA) and F1.8 (STPA) are deliberately not modelled, and §1 says so in the document's own words, because
  `Severity` and a High/Medium/Low tier read as safety semantics to a safety reviewer when nothing excludes them.
- **Strength stays edge-stored, and flows do not feed it.** Edge-stored strength is what practice converges on
  (F3.1, F3.15), and no source stores a per-(edge, flow) pair (S2); deriving strength from the flows crossing an
  edge is only a heuristic, and the one test of edge-betweenness-as-criticality needs strong qualification (F3.6,
  `partially unverified`; F3.8; disagreement #3). DF1 therefore keeps strength informational, does not derive it
  from flows, and does not restore the dropped exclusion through a flow route (§1).
- **The denominator already exists; flows name it.** Population-share and affected-user sizing of failure impact
  is established practice (F4.1), and the shipped radii (majority/subset/internal-only) already read over "the
  function's users or requests". A flow with its users gives that measurement the named referent it lacks (the
  issue's motivation), and it does not smuggle a second scale or an Occurrence quantity in: `users` is the referent
  population, `value_priority` is sort/filter only, the "while the mode is active" scoping is kept, and no
  arithmetic is performed. The research does not settle how several named flows compose — F4.1's own practice
  (Google sums the shares of partial outages) points at an aggregate the design deliberately does not compute
  (§4.2, §10) — so the design states the composition rule it does use (replacement with a floor) and leaves the
  aggregate to later work with the assumption it rests on declared. There is no effect-statement grammar anywhere
  (S3); the nearest pattern is Azure's "loss of flow X for users Y" phrasing (F4.3). The design lets a chain name
  the flow it breaks but keeps the effect prose free text.
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
| `value_priority` | enum `["High","Medium","Low"]` | yes | The flow-value priority label, sort/filter only (DF4). The schema description carries the disclaimer sentence verbatim. |
| `sources` | array of `$defs/source` | when a chain names the flow | Where knowledge of the flow came from — the same shape `elements[].sources` uses, `catalog` included, so a `cat-<kind>-<NN>` row may have prompted the flow. The rule `flow-sources-required` requires at least one entry whose `kind` is not `catalog` on any chain-named flow: the denominator must be evidence, and a catalog row alone does not ground a population. |
| `users` | object | when a chain names the flow | The referent population (DF3), in three parts: `population` (required) — a **label**, such as "all shoppers at checkout" or "internal only: the reconciliation operators and the downstream consumers", never a number; `share` (optional) — a **fraction**, the share of the flow's referent population the incident records, naming what it is measured against and raise-only; a bare count is not a share (the count stays in the incident record, and the class rises only where the inputs state the fraction); `selecting_condition` (optional) — the **predicate** the inputs quote (a locale, a retried order, a session at expiry), which selects part of the flow's own population rather than sizing it. Quantity and predicate are separate fields because the raise-only rationale belongs to a share measured over a window and not to a predicate. A population named as one client, tenant or locale is the **population**, not a selecting condition: `scales-software.md`'s rule that a single named client means every request reaches the function through it — majority — survives the flow reading, and a flow whose population *is* that client reads majority. `review` (optional) — the same shape and vocabulary as a rating's `review` (`provisional` / `rescored` / `authored`); while it is absent or `provisional`, the warning `flow-users-provisional` fires and the report says the rows resting on that denominator are provisional. The rule `flow-users-required` enforces presence of `users` on any chain-named flow. |
| `steps` | array of `plainId` | no | The ordered functions the flow passes through, best-effort; a linear sequence (branching and fan-out structure is §9's deferral). Each id references a function in `functions[]` (rule `flow-step-resolves`). |
| `steps_partial` | boolean | no | Default `false`. `true` = the recorded steps are a prefix; the flow continues past what is written (the async/broker boundary). Documentation extent only — never runtime survival, and not a defeater of §4.4's warnings. |

A flow with no `steps` and `steps_partial: false` is a complete flow the team chose not to enumerate; a flow with
`steps_partial: true` is explicitly partial. The distinction is the author's, not a validator's. A flow no chain
names may have no `steps` and no `users`; a flow a chain names should carry `steps`, because a chain-named flow
with empty `steps` draws the `chain-flow-no-steps` warning of §4.4 whatever `steps_partial` says.

An **internal or machine-only flow** is legitimate and does not need an external population: `users.population`
names it ("internal only …"), the structural test reads the internal-only class for it, and the floor of DF3 keeps
the chain's Severity at the function's own reading or above. A population label is never a number — the count
stays in the incident record and only its fraction in `share` — which is what reconciles this field with
`scales-software.md`'s existing rule that a stated share of users in an incident record can raise the radius
class. Because `population` is authored free
text and it moves a band, a chain-named flow's `users` is a reviewable claim: its evidence is `sources[]`, its
status is `users.review.status`, and the reviewer rule `flow-referent-unsourced` (§4.4) fires where the referent,
or the consumer set of a partial flow, is not grounded in what the run collected.

### 4.2 `chains[].flows` — new, optional

An array of flow ids (0..N), the flows this chain breaks. The author names them; nothing is derived from step
membership, so a shared-service chain can name several flows. Absent or empty means the chain names no flow and
DF3 falls back to the function's users. Where several flows are named, DF3 reads the band over the one yielding
the highest radius class and names it, and the chain's Severity `rationale` **enumerates every named flow**, marks
the one that set the band, and states the scale that flow carries against the system's population as the inputs name
it; the rationale must also quote the clause
in `effects.end` or `for_whom` by which the flow's value dies. That prose rule is the reviewer rule
`chain-flow-effect-consistency` (§4.4), which carries the id §3's free-prose limit allows — a machine lint cannot
read it, since the effect prose has no grammar (S3).

**What the multi-flow case deliberately does not do.** The named populations are treated as **disjoint** and their
union is **not computed**, so a chain naming two sub-majority flows rates the higher of the two rather than the
majority they may jointly reach (F4.1's aggregate practice is the counter-evidence, recorded here rather than
smoothed). Two consequences are declared instead of hidden: the reading is named **worst-single-flow**, which is
what it is, and the run writes the disjointness to `meta.assumptions[]` as its own entry, owned by `user`, **with
the ground rules and before any chain row is written** — it is a rule of the model rather than a fact about a row,
so the shipped ordering rule `ground-rules-before-rows` is satisfied by naming it at collection time. Where those
flows **share a provider across steps**, a single cause can break several of them at once (F1.22's coupling and
common-cause territory): the reviewer rule `chain-flow-shared-provider` (§4.4) flags it and the run appends its own
`meta.assumptions[]` entry at row time, exactly as `weak-edges-loss-of-access` does for edges. That row-time write
is the ordering rule's one exemption, stated rather than assumed: `ground-rules-before-rows` governs the ground
rules and the model-level assumptions, while an assumption that can only arise from a written row (this one, and
`weak-edges-loss-of-access`'s) is written before that row's ratings are reported, not before the first row. The §10
out-of-scope list names the coupling factors the run does not model.

### 4.3 Invariants

Seven, added to `INVARIANT_RULES` as kebab-case rule ids reported under the existing `INVARIANT` code:

- `flow-id-unique` — flow ids are unique within the document.
- `chain-flow-resolves` — every id in a chain's `flows[]` resolves to a flow.
- `flow-step-resolves` — every id in a flow's `steps[]` resolves to a function.
- `chain-flows-unique` — a chain's `flows[]` names no flow twice (pointer at each later entry, as the existing
  `dependency-pair-unique` does for repeated edge identities).
- `flow-users-required` — every flow a chain names carries `users` with a `population`.
- `flow-sources-required` — every flow a chain names carries at least one `sources[]` entry whose `kind` is not
  `catalog` (the same shape as `element-source-non-catalog`, and the reason the denominator is evidence).
- `flow-users-review-by-date` — a chain-named flow whose `users.review.status` is `rescored` or `authored` carries
  `by` and `date`, mirroring the rating gate `rating-review-by-date`: the keyword subset cannot make that
  conditional, so the invariant enforces it, and `users.review` is a gate rather than a gesture.

### 4.4 Machine lints and reviewer rules

Four machine lints, added to `lib/lints.ts` `MACHINE_RULES` (warning severity, never blockers) and reported by
`validate.ts`; `quality-and-lint.md` documents them. They give the authored chain→flow link its falsifier without
deriving it:

- `chain-flow-step-mismatch` — a chain names a flow whose recorded `steps` do not include the chain's function.
  `steps_partial: true` silences it **only where a prefix is recorded**: a chain-named partial flow with a
  non-empty prefix that omits the chain's function does not warn (the function may lie past the prefix), but an
  empty prefix cannot silence it — that case is the next rule's.
- `chain-flow-no-steps` — a chain names a flow whose `steps` is empty, whatever `steps_partial` says: a
  chain-named denominator with no functional referent at all. This is the rule the bare boolean cannot defeat.
- `chain-flow-rationale-unnamed` — a chain with a non-empty `flows[]` whose Severity `rationale` names none of the
  named flows (DF3 requires the enumeration; a rationale that names no flow id cannot show which flow set the
  band). The multi-flow effect mismatch itself is a reviewer rule, not a lint, because the effect prose has
  no grammar to falsify (S3).
- `flow-users-provisional` — a chain-named flow whose `users.review` is absent or `provisional`: the denominator is
  not yet re-scored by a named person, so the rows resting on it are provisional (the flow-scoped companion of
  `rating-provisional`).

Three reviewer rules are documented in `quality-and-lint.md` (reviewer kind, the shape of
`weak-edges-loss-of-access`: they record an open assumption rather than blocking):

- `chain-flow-effect-consistency` (warning) — the chosen flow is named in the Severity rationale, the effect
  clause is quoted, and where several flows are named each one's loss is stated as a loss of the chain's **single**
  end effect (DF3: no per-flow effect classes exist), so a chain cannot name flows and describe a single effect and
  call it the aggregate.
- `chain-flow-shared-provider` (warning) — a chain names more than one flow, and their `steps` share a provider
  function or element across steps: a common cause can break them together, so the run records an open assumption
  on coupling (owned by `user`) and rates on the flows as named, exactly as `weak-edges-loss-of-access` does for
  edges.
- `flow-referent-unsourced` (warning) — a chain-named flow whose `users` is not grounded in its `sources[]`, or
  whose downstream consumers are unstated where the flow is partial (`steps_partial` true and the async boundary's
  consumers not named as functions or as an assumption): the run records the gap as an open assumption owned by
  `user`. The second half is a documented **reviewer judgement** and stays one: `steps_partial` is a whole-flow
  boolean that cannot identify an async boundary, so no machine lint can carry it, and §9's typed broker node is
  what would make it checkable.

The count is three reviewer rules; the last two share one shape and are kept apart because one is about coupling
and one about evidence.

## 5. Scripts and update mode

### 5.1 Typed model and schema text (`lib/types.ts`, `fmea.schema.json`, `lib/report-model.ts`)

The type surface must move with the schema: a `Flow` interface (with `sources` reusing the existing source type and
the `users` object, whose `review` reuses the rating-review shape); `flows?: Flow[]` on `FmeaDocument`;
`flows?: string[]` on `Chain`; `StaleReason` gains `"flow-changed"`; the schema `stale.reason` `enum` **and its
ordered description** gain `"flow-changed"`; and `lib/report-model.ts`'s exhaustive
`STALE_REASON_WORDS: Record<StaleReason, string>` gains the human phrase, without which `tsc` fails and the report
prints `undefined`. Three further schema descriptions drift and must move with it: the top-level description
("Five parts are authored … A sixth part, computed" — `flows` is a sixth authored part, the computed part becomes the seventh, and the parenthetical list `(meta, elements, functions, dependencies, chains)` gains `flows`), `stale.flag`'s
text, and `historyEntry.change`'s. By the schema's own convention that each cross-reference, uniqueness or presence-coupling rule is named in
the description of the field it governs, the `flows[].id` description cites `flow-id-unique`, `flows[].steps`
cites `flow-step-resolves`, `chains[].flows` cites both `chain-flow-resolves` and `chain-flows-unique`, the
`flows[].users` description cites `flow-users-required` and states that `review` gates the denominator, and the
`flows[].sources` description cites `flow-sources-required`. The `flows[].value_priority` description carries DF4's
disclaimer as one verbatim sentence (the same sentence the report legend prints and the `methodology.md` row
records). The stale-reason vocabulary is
labelled **"stale reason set v2"** in `quality-and-lint.md` and `SKILL.md`, so a sign-off document quoting the enum
reads the fifth reason as a documented revision.

### 5.2 `validate.ts`

Adds the seven invariants (§4.3) to `INVARIANT_RULES`, and reports the four machine lints (§4.4) that join
`MACHINE_RULES`. No other behavior changes.

### 5.3 `render.ts` and `report-model.ts`

- A **Flows section**: one row per flow — name, `value_priority`, users (`population`, plus `share` and
  `selecting_condition` if present), sources as recorded, steps as the ordered function names, and a
  `steps_partial` marker when set. It gets a TOC (`CONTENTS`) entry, a one-line legend, an explicit empty-state
  ("No flows recorded."), and a fixed row order (High first, then id), which is **presentational only**: the order ranks nothing, sets no
  reliability ranking, and is the tier's only use (DF4). The legend prints
  DF4's disclaimer sentence verbatim, so the exclusions it names — not a rating, not a criticality
  analysis, not a safety or hazard analysis, not a reliability target — are visible where the tier is read; a chain-named flow
  whose `users.review` is absent or `provisional` is marked in the row and named in the legend's provisional note,
  so the reader can see which rows' Severity — and whose priority — rests on an unconfirmed population. Every rendered string is
  escaped; `name` and `users.population` are free text. A partial flow renders an explicit phrase ("a starting
  point only; the recorded steps are a prefix") rather than empty cells that read as broken — the phrase does not
  hardcode "broker", so it reads on any partial flow. The section is placed after the element/dependencies block.
- A **chain annotation**: each chain that names flows lists them ("breaks: checkout"), marks the flow whose band
  was used, and notes the disjointness assumption where more than one flow is named. The existing
  element/dependency/chain tables and the "By top-level element" summary are untouched. The model changes live in
  `report-model.ts` (`ReportModel`), not `render.ts` alone.

### 5.4 Update mode — `flow-changed`

A new stale reason, added to the closed vocabulary (now "stale reason set v2"). Fixed precedence becomes:

`element-changed`, `function-changed`, `flow-changed`, `control-removed`, `scales-version`

The order between `function-changed` and `flow-changed` is cosmetic — both re-read S only — and is fixed here so
the vocabulary has a single order.

- **Triggers:** (a) a chain-named flow's `users` changed between versions — any part of it (`population`, `share`,
  `selecting_condition`), since the whole object feeds the Severity denominator; or (b) a chain's own `flows[]` set
  changed — a re-point moves the denominator, so it is a structural-diff trigger, not an unrecorded authored edit.
  A change to a flow's `name`, `value_priority`, `steps`, `steps_partial`, `sources` or `users.review` marks
  nothing stale: none of them feeds a rating under DF1, and the last two are evidence and status rather than value
  (`users.review` moving to `rescored` clears a provisional warning; it does not re-open a band).
- **Carry-forward:** a `flow-changed` row re-reads **S** (the denominator moved) and the Severity rationale that
  names the chosen flow and quotes the effect clause; **O and D are carried forward**; **priority is recomputed**
  from the re-rated S by `priority.ts` (it is not a carried factor). This is the S-only re-read, distinct from the
  all-three re-read a `scales-version` bump triggers.
- **Add/remove:** adding or removing a flow marks nothing stale by itself. A flow id is diffed byte-for-byte, so a
  rename is a remove-plus-add.

### 5.5 `update-check.ts` and `update-diff.ts`

- **A flow diff.** `update-diff.ts` gains a flow section alongside its edge and element sections: flows added,
  removed, and changed by `users`, **and** chains whose `flows[]` set changed, with `sources` and `users.review`
  reported as informational changes that mark nothing stale. It is deterministic (a by-id diff of `flows[]` plus a
  `users` compare plus a set compare of each chain's `flows[]`). Its reach feeds the checker's `reached` map, so
  `stale-reason` validates a `flow-changed` flag, and its count joins the printed summary.
- **A removed-flow-still-named guard.** Removing a flow a chain still names leaves a dangling reference. Because
  `update-check.ts` runs "the legacy gate and the schema … never the invariants", `chain-flow-resolves` fires only at
  the end of the update, not before it — so the update mode needs its own structural guard, a `removedFlows`
  section analogous to the existing `removedLinks`/`orphans`, that lists each removed flow, the chains naming it,
  and the surviving flows they could be re-pointed to. Like `removedLinks`, an unresolved removed-flow refuses the
  draft with `UPDATE_MISMATCH` under `--check`. `chain-flow-resolves` remains the `validate.ts` backstop. The same
  guard reports a chain-named flow that has lost its last non-catalog source, which `flow-sources-required` would
  otherwise raise only at the end of the update.
- **Precedence, made enforceable.** The checker's `stale-reason` rule **previously accepted only** the reason it computes, and it
  computes `element-changed` (top of the order) but never `function-changed`. Because `flow-changed` sits below
  `function-changed`, the checker would refuse a *correct* draft: a row whose legitimate session reason is
  `function-changed` (a function changed on the same update) that a flow change also reaches. Rule: **the checker
  accepts any reason at or above the reach it computes** (its computed reach is a lower bound on precedence), and
  the both-fire cases — a row reached by an element change and a flow change takes `element-changed`; reached by a
  function change and a flow change takes `function-changed` — are added to the tests.
- **Output.** The flow half prints its own section (flows added / removed / changed, chains re-pointed, evidence
  and status changes, and the removed-flow guard), and the change count joins the summary line that the update
  copies into `meta.history`; a changed flow that no chain names still appears.

## 6. Reference files and provenance

Flows are structure, not a catalog, so no new evidence pack. The provenance lands in the existing files; one
reference file, `methodology.md`, is added to the change set. (The design prepares and requests the register rows
below; the user admits them — §10.)

- **`design-inputs.md` item 1 ("Critical flows")** keeps `[paraphrased:C014]` for the concept; the "what to
  collect" text gains the flow fields as `[skill-authored]` (where each lands in the document JSON), a granularity
  rule ("what counts as one flow: a user-valued journey named once, not a per-step slice"), the rule for an
  internal or machine-only flow (`users.population` names it; no external user is not a defect), the reconciliation
  that a population is a label and a quantity belongs in `share`, and the async recipe ("where the team knows only
  that one service publishes and another consumes, record what is known, name the end population in
  `users.population`, list the consumers that are known as `steps` or as an open assumption owned by `user`, and set
  `steps_partial: true`"). The `value_priority` tier carries `[paraphrased:C201]` and the three criteria as
  **falsifiable one-line tests** (`[paraphrased:C201]`); its disclaimer sentence is `[skill-authored]`.
- **`scales-software.md`** implements DF3 as a **global redefinition** of the blast-radius definition sentence:
  "over the function's users or requests **while the mode is active** — or, where the chain names flows, over the
  affected population of the named flow that yields the highest radius class, read over that flow's referent
  population, never below the class the same chain reads with no flow named (the floor)" — keeping the structural
  test, restating it in flow terms (majority / subset / internal-only read over the flow's population), keeping the
  stated-share-raises-never-lowers clause with its order fixed (the raise lands on the class the share is measured
  against, then the floor), carrying the partial-prefix rule as its own sentence ("where a chain-named flow's
  recorded steps are a prefix and do not include the chain's function, the flow's class is read as subset, and that
  reading takes precedence over the flow's own class"), restating the single-client rule per flow ("a flow whose
  population is one named client reads majority"), and governing every anchor row that names a radius class or reads "the
  function's users" — the rows that name a radius class are **rows 2–10** as shipped (rating 10 is the only one that
  also reads "the function's users"). The file carries a **checked sentence**, in the shape of
  `quality-and-lint.md`'s two id sentences, naming the restated rows, and `quality-and-lint.test.ts` (which already
  reads that reference file) gains the matching assertion: the sentence's row list equals the rows that name a
  radius class, and no anchor row leaves "the function's users" as the unqualified measuring population. It also gains one `[skill-authored]` line that flows move no rating
  except Severity's denominator (mirroring M8), a one-line disambiguation of "mode" (operational mode in "while the
  mode is active" versus the failure mode a chain records), `flow-changed` in the carry-forward enumeration, and
  the DF6 scales-version bump (`scales version: 1` → `2`), with the reason recorded.
- **`quality-and-lint.md`** documents the seven invariants, the four machine lints and the three reviewer rules as
  `[skill-authored]`; it **restates the anchor-reviewer row** `catastrophic-severity-anchor` in referent terms
  ("all or a majority of the reference population — the named flow's where a chain names flows, the function's
  users otherwise"), which the global redefinition of DF3 otherwise leaves contradicting the anchors, and it labels
  the stale-reason vocabulary "stale reason set v2".
- **`methodology.md`** gains mapping rows placing the flow on the canon's operational-context lineage (MIL-STD-1629A
  mission/phase/mode, ECSS end-to-end functional paths, ARP5580 co-equal Functional FMEA — F1.2–F1.4), states the
  flow's **role** (a use-case grouping of functions; not a phase or mode, not a function, not a failure condition,
  not a hazardous event; phases and modes are out of scope), records the **safety boundary** of §1 in the same
  words (F1.5/F1.8 deliberately not modelled; no DAL/ASIL/SIL; `severity` is a technical consequence class), and
  keeps the row carrying DF4's disclaimer sentence verbatim; its
  existing "functional block diagrams → not applicable" and "criticality categories → not applicable" rows are
  reconciled against the shipped behaviour.
- **`SKILL.md`** — procedure rewritten as a per-step list: collect flows in step 1/2; **fill `steps` after step 3**
  (steps reference functions, so the session resolves the ids from the team's prose and the human never transcribes
  opaque ids); name flows on chains in step 4; read the denominator in step 5. The **Update mode section** gains
  the new precedence order and the `flow-changed` trigger/carry-forward. `[skill-authored]`.
- **`provenance.md`** carries the register rows C161–C200 and, once the user lands it, C201.
- **`data/priority-fmea-software-v1.json`** unchanged.

## 7. The Azure flow-criticality record (C201)

The tier needed a record the design did not have. "Each flow carries a High/Medium/Low criticality tier" is finding
F2.1, sourced to Azure WAF RE:02, and no corpus record held it (C014 is RE:03; the run-1 claim ids CT-5–CT-8/CT-32
were never admitted). That record is now **admitted**:

- **C201 — Azure WAF RE:02 "Architecture strategies for identifying and rating flows"**, holding the claim that
  the checklist recommendation defines a three-level flow-criticality scale — High, Medium and Low — set by the
  kind of business impact a flow carries, whose stated purpose is to sort flows by priority and label the critical
  ones (Azure's framing: the skill carries the tier as a presentational priority label and reads nothing into
  "critical"). Drafted from the run-1 notes, then **adversarially verified to `confirmed` by three independent verifiers**
  (each re-fetched the page; each checked the quote character-for-character after whitespace normalisation), and
  adjudicated 3–0 on 2026-10-12. The quote is a join of three **adjacent** list items (the three tiers), which the
  verifiers confirmed is a legitimate join, not the splice that refuted C180. One non-refuting nit was fixed on
  admission: the record's `source_title` follows the C014 convention and carries the page's own H1 with the
  framework and recommendation named. The record sits in the corpus (`docs/evidence/fmea-skill-research-records.json`,
  run `flow-model-c201-2026-10-12`), and the `value_priority` field and its three criteria cite `[paraphrased:C201]`
  once the register row is in `provenance.md` (§10).

C196 and C198 corroborate the three-level vocabulary only if they too clear the vote protocol; until then the
citing sentence labels them single-reader, and neither is cited as corroborating. Azure RE:02 is paraphrase-only:
only the bare tier labels may appear verbatim, never Azure's tier descriptions — the criteria restate the impact
kinds in the skill's own words, never Azure's. That is also why the field is not named with the canon's
`criticality` (DF4).

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
  with ids, names, `value_priority`, users, and the expected chain→flow naming; band 1 — flows present but
  incomplete (missing the chain naming or `users`); band 0 — no flows section. c16 applies to the same prompts as
  c13 and c14 (the design and conversion prompts) minus the conversion prompt: prompt 6's own input
  (`legacy-rpn-sheet.csv`) carries no critical-flows section, so a conversion cannot produce flows, and prompt 5,
  whose postmortem-seeded baseline is scored on c1–c10 only, is out by the same convention that keeps c13 and c14
  off it. Prompt 1's maximum rises 26→28 and its 80%-of-maximum threshold becomes 23/28; prompts 6 and 7 are
  unchanged (24, 22). The code sites: `tools/eval-report.ts` (`CRITERIA` and its count comment),
  `tools/workflows/evals.js` (`RUBRIC`, its hand-synced `CRITERIA`, `STABILITY_SCHEMA`), and
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
  unchanged; `flow-changed` (both the `users`-change and the chain re-point triggers) is covered end-to-end by the
  `update-check` unit tests, and that is stated (the rubric-3 precedent that a new model part need not touch the
  update criterion).

### 8.2 Testing

- `validate.ts` — seven invariant tests (flow-id-unique / chain-flow-resolves / flow-step-resolves /
  chain-flows-unique / flow-users-required / flow-sources-required / flow-users-review-by-date) and four lint tests (chain-flow-step-mismatch /
  chain-flow-no-steps / chain-flow-rationale-unnamed / flow-users-provisional) plus acceptance of `flows[]` and
  `chains[].flows`. `schema.test.ts`'s top-level key-order pin and its derivation assertions move with the added
  `properties.flows` (the `$id` pin does not, since it stays v3), so the derivation fixture must instantiate the
  new optional flow fields (`sources`, `users` with `review`) or the "every constrained schema node is reached"
  assertion fails; the same file asserts the `value_priority` description **contains DF4's disclaimer sentence**,
  and `render.test.ts` asserts the legend prints it verbatim, so the qualifier is pinned in both places.
- `update-check.ts` — flow diff: a chain-named flow's `users` change (each of `population`, `share`,
  `selecting_condition`) → `flow-changed`; a chain's `flows[]` set change → `flow-changed`;
  `name`/`value_priority`/`steps`/`steps_partial`/`sources`/`users.review` change → no stale; flow add/remove → no
  stale; an unresolved removed flow still named → the `removedFlows` guard refusing the draft; a chain-named flow
  that lost its last non-catalog source → the same guard; the precedence both-fire cases (element+flow →
  `element-changed`; function+flow → `function-changed`).
- **One fixture per DF3 reading** — the chain that names no flow (function fallback); a chain-named flow read at
  majority; a chain-named flow read at subset; the **floor** case (a narrower named flow whose chain still reads the
  function's class or higher); and the partial-prefix case (a `steps_partial` flow whose prefix excludes the chain's
  function, read at subset before the floor); the **share-raise** case (a share stated in an incident record raising
  the flow's class before the floor); and the **single-client** case (a flow whose population is one named client,
  read at majority). Each fixture states the band it must produce.
- `render.ts` / `report-model.ts` — Flows section, TOC entry, legend (asserting DF4's sentence verbatim, including
  "not a rating", "not a criticality analysis", "not a safety or hazard analysis" and "not a reliability
  target"), empty-state, partial-flow phrase,
  provisional-denominator marker, chain annotation naming the chosen flow, `steps_partial` marker.
- `eval-stability` — the `flows` predicate, its tri-state (`pass`/`fail`/`unverified`) and the `verified` flag.
- Pins that move: `invariants.test.ts`'s `INVARIANT_RULES` list and `INVARIANT_RULES.length` (32→39); `lib/lints.ts`
  `MACHINE_RULES` and `quality-and-lint.md`'s "fifteen machine lints" (→ nineteen) with its order test; and the
  reference-file wording pins: `scales-software.md`'s checked sentence naming the restated anchor rows (rows 2–10),
  asserted by test in `quality-and-lint.test.ts`'s style, which reads the reference file and fails if a radius-class
  row loses the referent wording or the sentence's row list stops matching the rows that name a radius class;
  `schema.test.ts`'s top-level description pin and derivation assertions; `eval-stability.test.ts`'s `Object.keys`
  pin (the added `flows` and `verified` fields); and the `update-check.ts` header comment (its printed sections gain
  flows/removedFlows).
- Fixtures — `flows[]` in `checkout-service.fmea.json` and the prompt-7 pair; `meta.scales.version` → 2 in every
  fixture document; pinned facts in `render.test.ts`, `validate.test.ts`, `update-check.test.ts` and `evals.js`
  move with them (`prompts.test.ts` moves only if a new fixture file is added, since it pins prompt text, input
  names and fixture existence).

## 9. Later work (not in this design)

Recorded so it is not silently dropped, none of it blocks v1:

- Typed flow steps (function / element / external / broker node), and typed fan-out/broker nodes that model an
  event-driven flow as a branching DAG rather than a line — **now the most important of these**, because the async
  case is the one the model serves worst (§4.4's `flow-referent-unsourced`), so it is taken first.
- Computing the **aggregate** blast radius of several named flows (the union F4.1's practice implies), which the
  design deliberately does not compute (DF3, §4.2); it arrives as a change of its own, with the disjointness
  assumption lifted and its own evidence.
- A positional "steps continue past this step" marker, replacing the whole-flow `steps_partial` boolean where the
  author needs finer grain.
- An optional `outcome`/contract string per flow (the RCM/JA1011 pattern, A-C10), recording what the flow delivers
  to its users.

## 10. Prerequisites and out of scope

**Prerequisites, in order:**

1. Register rows C161–C200 promoted to `main` (the user owns this).
2. The C201 register row landed in `provenance.md` (the user owns this; the record itself is admitted `confirmed`,
   §7).
3. Only then do the reference files cite C161–C200 and C201, and the implementation proceeds.

**Out of scope for this design:** safety and hazard analysis of any kind — failure conditions, hazardous events,
safety objectives, integrity levels (no DAL/ASIL/SIL is mapped), F1.5's FHA/HARA and F1.8's STPA are deliberately
not modelled, and `severity`/`Severity`/`value_priority` carry no safety semantics (§1, §6); **common-cause and
coupling factors** (F1.22) across named flows, which the run records as an open assumption on the chain instead
(§4.2, `chain-flow-shared-provider`); the **aggregate** (union) reading of several named flows' blast radius (§9);
deriving strength from flows; any flow-driven rating change other than the Severity denominator (DF3); mapping a
flow's `value_priority` to a reliability target or an SLO (Azure RE:04-style per-flow targets are not set by this
model); flow inference from traces or observability (flows are authored, normative); operational phases and modes
as document objects; an effect-statement grammar; any licensed content (no AIAG-VDA cell, no IEC paraphrase, no
SRE Book adaptation); a second rating scale for flow priority.

## 11. Acceptance criteria

1. The schema file gains optional `flows[]` (with `minItems: 1`) and `chains[].flows`, and its `$id` stays
   `…:v3`; the seven invariants of §4.3 reject their violations and the four machine lints of §4.4 fire, under the
   `INVARIANT` code and the lint codes respectively, and the three reviewer rules of §4.4 are documented in
   `quality-and-lint.md`.
2. `scales-software.md` states DF3 as the global redefinition — the flow-terms structural test, the
   `max(flow, function)` **floor**, the partial-prefix subset reading, and "while the mode is active" — and bumps
   the scales version to 2; **every** anchor row that names a radius class (rows 2–10) or reads "the function's
   users" is restated, `quality-and-lint.md`'s `catastrophic-severity-anchor` row is restated in referent terms, and
   `scales-software.md`'s checked sentence with its wording pin passes — the pin is the falsifier that keeps the
   restatement from drifting back;
   `design-inputs.md` item 1 names the flow fields, the granularity rule, the internal-only rule, the async recipe
   with its consumer list, and the three `value_priority` criteria as falsifiable tests; `methodology.md` maps the
   flow's role, corrects the lineage to an operational-context **path** (phases and modes out of scope), and
   records the safety boundary in §1's words; no sourced sentence cites a record id that is not in the register.
3. `update-check.ts` computes the flow diff (including chain re-points), guards an unresolved removed-but-named
   flow — and a chain-named flow that lost its last non-catalog source — by refusing the draft, flags
   `flow-changed` on a chain-named flow's `users` change and on a chain's `flows[]` change and nothing on the other
   field changes, and does not refuse a draft whose reason is at or above the reach it computes.
4. The render adds a Flows section (with TOC entry, legend printing the disclaimer verbatim and stating "not a
   rating", "not a criticality analysis", "not a safety or hazard analysis" and "not a reliability target", the
   row order marked presentational, empty-state, provisional-denominator
   marker) and chain annotations naming the chosen flow and noting the disjointness assumption; the checkout
   fixture renders them.
5. Rubric 4's c16 scores prompt 1 at band 2 on both capabilities (it is not a must); the flows stability predicate
   is `pass` across the two runs and the result's `verified` flag is true — or, where **both** runs legitimately
   carry no flows, the predicate is `unverified` and the acceptance note records it as unverified, never as a
   pass. Prompt 1's maximum is 28 and its pass threshold 23/28 in `evals/rubric.md`, `tools/eval-report.ts` and
   `tools/workflows/evals.js`, with prompts 6 and 7 unchanged (24, 22).
6. The `value_priority` field and its criteria cite C201, whose register row is in `provenance.md`; until that row
   is landed no reference file cites the tier, C201 is not cited from an unadmitted record, and C196/C198 are not
   cited as corroborating. A chain-named flow's Severity denominator is provisional-in-the-report until its
   `users.review` is not provisional (or, where the run records no review, until the acceptance note says so), and
   `flow-users-review-by-date` rejects a `users.review` that is not `provisional` and carries no `by`/`date`.
7. DF3's five readings are each covered by a fixture (§8.2), and the multi-flow case writes its disjointness
   assumption into `meta.assumptions[]` as its own entry (owned by `user`, written with the ground rules and before
   any chain row), with `chain-flow-shared-provider` appending the row-specific coupling assumption.

8. `SKILL.md` carries the per-step procedure (flows collected in steps 1 and 2, `steps` filled after step 3, chains
   named in step 4, the denominator read in step 5) and its Update-mode section carries the new precedence order
   with the `flow-changed` triggers and carry-forward; `quality-and-lint.md` and `SKILL.md` both label the
   vocabulary "stale reason set v2"; and the `schema.test.ts`/`render.test.ts` pins on DF4's sentence and on the new
   fields pass.

## 12. Review record

This spec was reviewed on 2026-10-12 in seven passes. A **five-lens panel** (data model/schema/validator, FMEA
method and provenance, report/workflow/evals, update mode, user experience) produced the `$id` no-bump rationale,
the DF3 redefinition and scales-version bump, the enforceable precedence and the `update-diff` flow section, the
tri-state stability predicate, and the enumerated code touchpoints. A **focused re-review** caught the DF3
redefinition needing to be global, c16 scoped to prompt 1, the acceptance-criteria contradiction, and the
criticality criteria re-tag. An **internal-coherence pass** caught DF1's "moves no rating" contradicting DF3, the
"both runs" case, the c16 prompt-5 exclusion, and the chain-named qualifier. An **FMEA-expert persona panel**
(standards/method, software FMEA, facilitation/review board, reliability/SRE) and its synthesis produced the
next revision: the denominator's "while the mode is active" scoping restored, the multi-flow union replaced by
the highest-band rule, the traceability warnings shipped, `users` required on chain-named flows and shaped, the
`criticality` term-of-art disclaimer and falsifiable criteria, the `continues` → `steps_partial` rename, the
`methodology.md` reconciliation, the chain-re-point stale trigger, and the minor bookkeeping items. A **confirmation
re-review** of that pass then caught the `steps`-as-linear correction, the fixtures' `meta.scales.version` moving
to 2 with the bump, the missed code-site pins, and the `flow-undefined` → `chain-flow-resolves` rename. A
**second internal-coherence pass** then re-read the document whole and cleared the cross-section residues the
piecemeal fixes had left before an independent panel saw it. A
**second, independent FMEA-expert persona panel** (standards/method auditor, software FMEA practitioner,
safety/mission-assurance engineer, reliability/criticality analyst) and its synthesis then approved the model
while withholding acceptance, and this revision folds in its eighteen-item list: the DF3 cluster — the composition
rule stated as **replacement with a floor**, the partial-prefix subset reading, the relabel to
**worst-single-flow**, and the aggregate declared rather than computed; the safety boundary (§1, §6); the
denominator's provenance (`flows[].sources[]`, `users.review`, `flow-users-provisional`,
`flow-referent-unsourced`); the common-cause declaration (`chain-flow-shared-provider`, §10); the
`criticality` → `value_priority` rename with both disclaimers; the lint strengthenings
(`chain-flow-rationale-unnamed`, the `steps_partial` non-defeater, the `chain-flow-no-steps` reconciliation); the
lineage correction and the flow's role; internal-only flows, the population/share/selecting_condition split; the
async consumer requirement; the "repaired by deletion" note; the board-note wording; and the §9 deferrals. C201
A **focused re-review of that revision** followed — a standards/method reviewer on the DF3 decidability cases, a
safety/reliability reviewer on the three guards, and a coherence checker walking the panel's eighteen items against
the spec and the repositories' own counts — and closed the seams it found: DF4's sentence stated once and carried
verbatim in its three sites, the anchor rows corrected to 2–10 with a wording pin, the partial-prefix rule named in
the sentence §6 lands in `scales-software.md`, the floor's function term defined as the no-flow structural reading
rather than a reading of `for_whom` prose, "class" disambiguated to the radius class under the chain's single end
effect, the partial-prefix rule given precedence over the flow's own class, the share's order of operations fixed,
the single-client rule reconciled with `selecting_condition`, a seventh invariant (`flow-users-review-by-date`)
turning `users.review` from a gesture into a gate, the disjointness assumption re-homed in `meta.assumptions[]`
with the ordering rule named, the async consumer requirement demoted to a documented reviewer judgement, the sort
order labelled presentational, and the board note corrected. C201 was admitted in the same session (§7), which
dissolved the panel's request to make `value_priority` optional until the tier had a record: the field stays
required, and the register row is the remaining gate (§10, §11 criterion 6).
