# Prose Implementation Plan, part B: behaviour (stage 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three rules the 0.7.0 round failed, c1 (a missing scaling limit recorded as an open assumption), c5 (a priority never named without its provisional caveat) and c11 (a rationale substitution recorded in `meta.history`), land in an unattended run: each rule stated where the output is written, a "before you write" list the model runs before the Write, and one machine check per rule, then a 16-run round that measures them.

**Architecture:** The wording is drafted and gated first (B1: Opus skeptics, one Fable draft gate), because every later task lands text or code that the gate may revise. The two lints follow, test-first, each with the registry that pins it, and the c1 lint lands in the same commit as the four shipped fixtures it reaches (B2, B3). The render line (B4) and the schema descriptions (B5) carry the rules to the points where `render.ts` and the model's field writing meet. B6 lands the gated wording in `SKILL.md` and the two reference cells and passes the private distill Recheck over every reference file stage 1 changed. B7 runs the round, writes its note, and ends at the Fable result gate and the user's gate. Stage 1 changes nothing in the prose beyond §6 (D12).

**Tech Stack:** TypeScript run directly by Node 24.2 or later (`node:test`, `node:assert/strict`), the plugin's own scripts under `skills/fmea-software/scripts/`, Playwright through `tools/check-browser.ts` and `tools/compare.ts`, the dev checkers through `tools/check.ts`, the Workflow tool for the drafting and judging phases, the private repository's `tools/workflows/distill.js` for the Recheck.

**Spec:** `docs/specs/2026-10-14-prose-design.md` at commit 7506ffe on branch `prose` (worktree `/home/nn/Projects/failwise/.claude/worktrees/prose`). Sections 6, 8.3 and 9 of the spec are this plan's scope, with §4.3 (frozen text), §10 (testing) and §11.1 (the revision rule). Part A (`2026-10-14-prose-a-harness.md`) has run and its baseline round is recorded; part C follows this plan's gate. Part A's "How to read this plan" and Global Constraints apply here unchanged: the Bash tool's limits, the Workflow compile check, the keyring rule, the appended note sections.

## How to read this plan

- Tasks B1 to B7 run in order on branch `prose`, after part A's gate. Task ids are the only names used across tasks; each task's **Interfaces** block names what it consumes and produces, with exact signatures.
- Line numbers in **Files** blocks are those of commit 7506ffe, except where a task says a part-A task moved them. Every edit also quotes the anchor text to find. The 0.7.0 round's documents are read from the main checkout's gitignored tree, `/home/nn/Projects/failwise/build/evals/flow-model/p<n>/<cap>/run<k>/analysis.json`, by absolute path.
- **The gated text supersedes every string this plan quotes.** Where B1's gated text (`build/prose/stage1-text.md`) differs from a string quoted here (S1 to S6, the four lists, the two cells, the four schema descriptions, the two lint messages, the render line), the gated string replaces the quoted one everywhere the plan quotes it: in the test, in the implementation, in B4's amendment to the base design and in the commit bodies. The task writes its failing test against the gated string, lists each replacement in its report, and, where a message, the render line or a description changed, B1 Step 4 adds a dated inline note to the spec (§6.2 at `:249-253`; §6.4 at `:275` for the c1 message, `:296` for the c11 message and `:305` for the render line, each note placed beside the line's opening words) pointing at the gated file. B1 never changes a lint id, a pattern, a pointer or a predicate of §6.4.
- B2 changes the golden fixture's rendered bytes (the order-store edge gains a `limits` cell), and B4 changes `render.ts`; both commits run the browser gate and the comparison and read every changed view in `build/compare/summary.md`. No other task touches the renderer or the template.
- The private distill Recheck runs once for stage 1, in B6, over `SKILL.md` and every reference file part B changes, B2's and B3's `quality-and-lint.md` count sentence and rows included, before B6's commit, with the verdict in that commit body (§7.4, §12.5); B2 and B3 commit without one, their reference changes being `[skill-authored]` registry text that B6's check covers.
- Model tiering (§9): B1's skeptics run on Opus and its gate is **Fable (1)**; B2 to B6 are one Opus implementer and one Opus reviewer each, test-first; B6's Recheck is Opus; B7's judging runs the existing `evals.js` tiers and its result gate is **Fable (2)**. Two Fable gates are planned; a gate re-run on `revise` is one more Fable call and is counted. Every report names the tier of each phase and the Fable calls actually made, per gate.

## Global Constraints

The Global Constraints of part A apply unchanged. In addition:

- Provenance: every new or changed sentence in `SKILL.md` and `references/` ends in a tag from `references/provenance.md`'s vocabulary; every new sentence here is `[skill-authored]`, every bullet of a new list ends with `[skill-authored]`, and a changed sourced sentence is not reworded.
- Frozen text (§4.3) stays byte for byte: the first fenced block under `## Scripts`, the `### Migrate a v1 document` and `### Migrate a v2 document` headings, the stale-reason precedence line (`SKILL.md:92`), every anchor row of `scales-software.md`, the generated region of `structure-elements.md`, the licence blocks of `provenance.md`, rule 7 of `work-tracking.md`, and every other literal the tests pin. `bun tools/run-tests.ts` is the check.
- Exact values this plan ships, quoted from the spec, which B1 may not change:
  - lint ids, both `warning`: `edge-reliability-unstated`, `conversion-substitution-unrecorded` (§6.4); appended to `MACHINE_RULES` in that order; `MACHINE_RULES` **18 → 20**; `references/quality-and-lint.md:25` "The machine lints the scripts implement are **nineteen**:" → **twenty-one**, the two ids placed before `priority-table-property`.
  - the c1 lint's run-placeholder pattern, case-insensitive, whole words: `not stated`, `none stated`, `not given`, `not provided`, `not documented`, `not recorded`, `not published`, `unknown`, `n/a`, `tbd`, or any text containing `in the inputs`; a field is unstated when absent, empty or matching it. A silencing assumption has `status: "open"` and `owner: "user"`, names the provider by its element id or its name as a whole token, case-insensitive (a full stop that ends the sentence after the id counts as a boundary; a dot that continues a dotted id does not), and contains one of `limit`, `limits`, `ceiling`, `scaling`, `rate`, `sla`, `availability`, `latency` as a whole word, case-insensitive. The predicate is per edge: one such assumption silences every unstated field of that provider's edge.
  - the c1 lint's pointer `/dependencies/<i>`; one finding per unstated field, `sla` before `limits`.
  - the c11 default pattern: `^converted from .+; no rationale recorded$` on a rating's `rationale`; `r` = the number of chains with at least one such rating; clauses = every `meta.history[].change` split on `.` and `;`; a recording clause contains `rationale` (case-insensitive) together with `r` as a standalone integer (not adjacent to a letter, a digit, `-` or `_`), the number word for `r` from one to ten, or, for every chain carrying the default, its id or the name of the element its function belongs to (`chain.function` → `functions[].element` → `elements[].name`; a chain has no name field of its own), each as a whole token; the lint fires when `r > 0` and no clause records. Pointer `/meta/history`.
  - the fixtures amended (D13 extended, decision 1 below): `evals/fixtures/checkout-service.fmea.json` (order-store edge gains `"limits": "no published request ceiling"`), `evals/fixtures/update/before.fmea.json` and `evals/fixtures/update/stale-rows.fmea.json` (an open `user` assumption on pricing's scaling limit), `evals/fixtures/legacy-rpn-sheet.expected.fmea.json` (an open `user` assumption on payment-gateway's SLA and limits); the two with a `computed` block are regenerated with `validate.ts --write`. The golden still yields **17** lints and a score of **89**, and its ratings tile still reads **11 of 30**.
  - the round (§8.1, §8.3): prompts 1, 5, 6, 7 at high and medium, two runs each, on `deepseek-flash`; `build/evals/prose-1/`; note `docs/specs/2026-10-14-prose-eval-results-1.md`; a pair passes a criterion when both runs are verified and each scores 2; c1 on all four prompts, c5 on prompts 1, 5 and 7, c11 on prompt 6; no pair that passed a criterion at baseline fails it after.
- Draft values this plan quotes, which B1's gated text supersedes: the c1 message `edge <from> -> <to>: <field> is not stated and no open assumption names <to> and the field; record the missing value as an open assumption owned by user, or copy the inputs' words`; the c11 message `<r> row(s) carry the default rationale and no history clause records a rationale substitution with that count or those rows`; the render line `provisional: <n> of <m> ratings are provisional. Every priority you state rests on provisional ratings: say so in the same sentence, and say that a named person is to re-score each rating against the anchors, one at a time, as the next step.`, printed to stdout after a successful render when `n > 0`, nothing when `n = 0`; the four schema descriptions of B5.
- Test style, fallow, tsc, coded lines and commit style as in part A. Tests that need `MACHINE_RULES` live under `skills/fmea-software/scripts/`; builders come from `scripts/test-helpers.ts` (`graphDoc`, `edge`, `newElement`, `minimalDoc`, `rating`, `loadFixture`, `runCli`, `withTempDir`); an `Assumption` and a `HistoryEntry` are written as object literals (`{ text, owner, status }`, `{ version, date, change }`).

## Review Focus

Five conditions the spec implies but no task's own tests name first. Each line gives the behaviour a reasonable person would expect and the task whose tests pin it.

1. **A provider whose id is a prefix of another id** (`pricing` beside `checkout.pricing-cache`, prompt 7's new element). An assumption naming `pricing` and its limits must not silence the cache's edge, and one naming `checkout.pricing-cache` must not silence pricing's: the provider match is a whole token. B2 pins both directions, and pins that the id at the end of a sentence still counts.
2. **A document with no edges, or no history** (`minimalDoc()`). Both lints are silent; `documentedDoc()` (`lints.test.ts:30-35`, `minimalDoc` plus one ground rule and one open assumption, no edges) stays lint-free, so the pin at `lints.test.ts:64` holds, and B2's new test pins `runLints(readingDoc())` to `[]`. B2 and B3 pin it.
3. **The default rationale written with the `inputs/` prefix** (`converted from inputs/legacy-rpn-sheet.csv; no rationale recorded`, as the 0.7.0 runs wrote it and rubric c11 accepts). It counts as the default. B3 pins it.
4. **A chain with `post_ratings`.** The render line's `m` counts both rating blocks, as the report's tile does; the golden, with one such chain, prints `11 of 30`. B4 pins it through the golden.
5. **A stored document that gains an assumption** (`before.fmea.json`). The update mode's diff and stale rules read no assumption, so `update-check.test.ts` stays green and `expected-stale.json` is untouched. B2 runs the whole suite after the amendment and pins the edge literals at `validate.test.ts:104-105`. The input change itself is named in every note's "cannot separate" section (part A, A6 Step 5).

## Decisions for the user at plan review

1. **Four fixtures are amended, not two.** Applying §6.4's predicate to every shipped document (checked by script on 2026-10-14) finds the lint firing on the golden (order store), `update/before.fmea.json` (pricing), `update/stale-rows.fmea.json` (pricing) and `legacy-rpn-sheet.expected.fmea.json` (payment-gateway's `sla` and `limits`, which the sheet states nowhere); `update/before-v2-branches.fmea.json` would fire too but is refused by the legacy gate before any lint runs, so it is left alone and the no-warning test runs the two rules directly over `validate.test.ts`'s `ANALYSIS_FIXTURES`. D13's rule, agree with the inputs rather than narrow the lint, is applied to all four. Default: amend all four. The spec's sentences that say two fixtures (`:56` D13, `:282` "Two shipped fixtures fire today", `:469` "The two amended fixtures", `:514` acceptance criterion 2) get dated inline notes in B2.
2. **The field words match as whole words.** §6.4 says "containing one of"; a substring match would let `generate` or `translate` silence an edge. The predicate check of 2026-10-14 gives the same reach on the 0.7.0 documents either way. Default: whole words.
3. **The expected conversion fixture gains an open assumption**, which prompt-6 judges compare runs against for c11. c11's bands read ratings, priorities and `meta.history`, not assumptions; c1 for prompt 6 scores 2 when a run "needed nothing it was not given". The new SKILL.md rule asks a converter to record the sheet's silence on the edge's SLA and limits, and the lint warns when it does not. Default: amend, read the prompt-6 c1 scores in B7's note, and name the answer-key change in every note's "cannot separate" section (part A, A6 Step 5).
4. **The proposed sentences in B1 are the draft the skeptics and the Fable gate rule on.** The gated text is what B6 lands; it is kept at `build/prose/stage1-text.md` (gitignored) and quoted in B6's commit body. Default: as written.
5. **The c1 lint's pointer is the edge, `/dependencies/<i>`**, since the unstated field may be absent. Default: the edge.
6. **One file the spec does not name moves with the render line.** The render row of `docs/scripts.md:15` describes what `render.ts` does, so B4 gives it one sentence: `When ratings are still provisional, it prints one line saying how many, and that every priority rests on them.` The eval run cannot read the file (`tools/run-eval.sh:242-243` copies only `.claude-plugin` and `skills/fmea-software`), so D12 holds. Default: add it; if declined, B4 leaves `docs/scripts.md` as it is.
7. **B2 and B3 commit `quality-and-lint.md`'s count sentence and lint rows before a Recheck.** §7.4 asks for the Recheck before the commit that lands each changed reference file; B6's Recheck covers those `[skill-authored]` registry lines and its commit body says so. Default: defer to B6. Alternative: a Recheck over `quality-and-lint.md` in each of B2 and B3 (two more Opus checker calls).

## Assumptions the plan rests on

- `tools/workflows/distill.js` in `/home/nn/Projects/fmea-software` takes `args: { stage: "check", root: "<absolute worktree path>", files: [<base names>] }` and re-checks `SKILL.md` and the named reference files in that tree with one Opus checker each; no writer runs and nothing under `root` is edited (its `stage check` branch, `distill.js:668-702`). Each checker appends one section to the private repository's `build/distill-report.md`; the verdict is the returned `files[].pass` and `unverified`, not that report. `work-tracking.md` is not among its targets.
- Part A's `context.json`, gate, round script and re-run procedure are in place, so B7's round is judged under the same harness as the baseline.

---

### Task B1: The stage-1 wording, its skeptics and the Fable draft gate

**Files:**
- Create (gitignored): `build/prose/stage1-text.md` (the gated text)
- Modify, only when a message, the render line or a description changes: `docs/specs/2026-10-14-prose-design.md:249-253`, `:275`, `:296`, `:305` (dated inline notes)

**Interfaces:**
- Consumes: part A's baseline note (the c1, c5 and c11 scores and the judges' evidence per run).
- Produces: the gated text that B2 to B6 land verbatim: the sentences S1 to S6 and the four lists (steps 1, 2 and 7, and Convert) below, the two cell sentences, the four schema descriptions, the two lint messages and the render line, each possibly revised by the gate.

The draft, each sentence tagged `[skill-authored]` (the tags are part of the text):

- **c1, `SKILL.md:36`**, three sentences inserted immediately after the edge sentence (`…an element outside the boundary needs at least one consumer. [skill-authored]`):
  - S1: `When the inputs do not state a provider's SLA or limits, leave that field out and record an open assumption owned by `user` that names the provider and the field. [skill-authored]`
  - S2: `When the inputs state that the provider has none, copy their words into the field. [skill-authored]`
  - S3: `Never write a placeholder of your own into `sla` or `limits`. [skill-authored]`
- **Step 1's list**, appended to item 1 (line 35) as indented continuation lines (three spaces, so markdown keeps them inside the numbered item):
  ```
     Before you write the document: [skill-authored]
     - Every input the checklist of [design-inputs](references/design-inputs.md) asks for and the inputs do not supply is an open assumption owned by `user` with status open, and a question in your final message. [skill-authored]
  ```
- **Step 2's list**, appended to item 2 (line 36) the same way:
  ```
     Before you write the document: [skill-authored]
     - Every edge carries `sla` and `limits` from the inputs, or an open assumption owned by `user` names its provider and the missing field. [skill-authored]
     - No field holds a placeholder. [skill-authored]
  ```
- **c5, `SKILL.md:41`**, replacing the sentence `The hand-over message states that every rating the skill wrote is provisional and names, as the next step, a named person re-scoring each rating against the anchors, one rating at a time; a priority is never presented without that caveat while any rating it rests on is provisional. [skill-authored]` with:
  - S4: `In the hand-over message, say that every rating the skill wrote is provisional, and name re-scoring of each rating against the anchors, one rating at a time, by a named person as the next step. [skill-authored]`
  - S5: `Never name a person the inputs do not name. [skill-authored]`
  - S6: `When you name a priority in a message, say in the same sentence that it rests on provisional ratings, while any rating under it is provisional. [skill-authored]`
- **Step 7's list**, appended to item 7 (line 41), the whole c5 rule as its opening items:
  ```
     Before you send the final message: [skill-authored]
     - Every priority the message names says, in the same sentence, that it rests on provisional ratings. [skill-authored]
     - The message says that every rating is provisional and names re-scoring by a named person, one rating at a time against the anchors, as the next step. [skill-authored]
     - The message names no person the inputs do not name. [skill-authored]
     - Every open assumption is listed as a question. [skill-authored]
  ```
- **Update mode, `SKILL.md:112`**: the sentence gains, before its final period, `, and ends with step 7's "Before you send the final message" list`.
- **Seed section**, a new line after line 57: `The hand-over of a seeded run ends with step 7's "Before you send the final message" list. [skill-authored]`
- **c11, `SKILL.md:71`**, replaced by two sentences: ``` `rationale` is the sheet's rationale or justification column, under whatever heading, where the column exists and the cell is filled. [skill-authored] An empty cell, or no such column, takes the text `converted from <sheet file name>; no rationale recorded` and counts as a substitution on that row. [skill-authored] ```
- **Convert's list**, appended after line 78 (a plain list, the section being prose lines):
  ```
  Before you write a converted document: [skill-authored]
  - `meta.history` names every column used, every field substituted and on how many rows, an empty cell counted like a missing column. [skill-authored]
  - The final message repeats the count. [skill-authored]
  ```
- **`references/design-inputs.md:14`**, item 4's cell gains a second sentence: `The source states this for internal dependencies; this skill asks it of every edge provider, inside or outside the boundary.` The Provenance cell stays `[paraphrased:C014] [skill-authored]`.
- **`references/quality-and-lint.md:84`**, the `design-inputs-declared` Rule cell gains the same sentence; its Provenance cell becomes `[paraphrased:C014] [skill-authored]`.
- **The four schema descriptions** of B5 Step 2, **the two lint messages** and **the render line** as the Global Constraints quote them.

- [ ] **Step 1: Dispatch the skeptics (Workflow, Opus)**

One Workflow with three parallel Opus agents, one per criterion, each given: the draft above for its criterion; `skills/fmea-software/evals/rubric.md` lines 13-17 (the Unattended bullets) and its section for the criterion with the 2026-10-13 ruling paragraph; the spec's §3.3 row for that criterion's failures; and `SKILL.md` lines 35-41 and 59-78 as they stand. Each is asked to refute the draft: a sentence a run could read in the failing way of §3.3; a sentence that opens a new reading rubric 4 scores 0 or 1 (for c5: any wording that invites naming a re-scorer the inputs never mention; for c1: any wording that lets a placeholder count as a value, or that reads the order store's stated absence as a gap); a sentence over 25 words (in this draft S1 is 30 words, step 1's list item 31, S4 35, S6 26 and step 7's second item 27; each is a finding unless split); a collision with a word the skill uses in another sense; a sentence that restates a frozen literal. Schema: `{ findings: [{ sentence, defect, change }], pass: boolean }`. Default to a finding when uncertain.

- [ ] **Step 2: Apply the findings**

The controller applies every finding it accepts, records each rejection with a reason, and writes the revised draft to `build/prose/stage1-text.md` with the findings and dispositions below it.

- [ ] **Step 3: The Fable draft gate (Agent, session model, unanchored)**

One agent on the session model, given the revised draft, the same rubric sections, §3.3 and §6.1 of the spec, and `SKILL.md` lines 35-41, 48-57 and 59-78, and asked one question: does this wording close the readings of §3.3 (never engaged; "no limit stated, so the capacity rule doesn't apply"; a placeholder written instead of an assumption; a priority named without the caveat; an empty cell not counted as a substitution) without opening a reading rubric 4 scores below 2? It receives no skeptic finding and no controller conclusion. Schema: `{ verdict: "pass" | "revise", findings: [{ sentence, defect, change }] }`. On `revise`, apply, re-run the gate once; a second `revise` goes to the user with the findings.

- [ ] **Step 4: Propagate and report**

If the skeptics or the gate changed a lint message, the render line or a schema description: change it in `build/prose/stage1-text.md`, add the dated inline note to the spec at the line that quotes it (`:249-253` for §6.2, `:275` for the c1 message, `:296` for the c11 message, `:305` for the render line) saying the shipped text is the gated one, and record each change in the ledger; B2 to B5 then write their tests against the gated string. Record in the ledger: the gated text, the skeptics' findings with dispositions, the gate's verdict, the tiers (3 Opus skeptics; Fable gate calls actually made: 1, or 2 if Step 3 re-ran it). Commit the spec notes alone when any were added (`Spec: the stage-1 gate's revisions to the quoted text`); nothing else tracked changed.

---

### Task B2: The c1 lint `edge-reliability-unstated` and the fixtures it reaches

**Files:**
- Modify: `skills/fmea-software/scripts/lib/lints.ts:1` (imports), after `:208` (a helper block), `:454-467` (the new entry before `];`)
- Modify: `skills/fmea-software/scripts/lints.test.ts:38-57` (the order literal), new tests
- Modify: `skills/fmea-software/references/quality-and-lint.md:25` (the count sentence), after `:243` (a table row)
- Modify: `skills/fmea-software/scripts/quality-and-lint.test.ts:26-30`
- Modify: `skills/fmea-software/evals/fixtures/checkout-service.fmea.json:257-262` (the order-store edge) and its `computed` block; `evals/fixtures/update/before.fmea.json:22-28` and its `computed`; `evals/fixtures/update/stale-rows.fmea.json` (`meta.assumptions`); `evals/fixtures/legacy-rpn-sheet.expected.fmea.json` (`meta.assumptions`)
- Modify: `skills/fmea-software/scripts/validate.test.ts:8` (imports), `:57` (the golden's third edge literal), new test
- Modify: `skills/fmea-software/scripts/render.test.ts:1260` (the order-store row of the Dependencies table literal)
- Modify: `docs/specs/2026-10-14-prose-design.md:56`, `:282`, `:469`, `:514` (dated notes on the fixture count)

**Interfaces:**
- Consumes: B1's gated c1 message (the predicate itself is the spec's).
- Produces: the `MachineRule` entry `{ id: "edge-reliability-unstated", severity: "warning", check }` at index 18 of `MACHINE_RULES`; the private helpers `unstatedField(value: string | undefined): boolean`, `wholeToken(text: string, token: string): boolean` (the token regex-escaped, case-insensitive, bounded by `(?<![\w.-])` before and `(?![\w-]|\.\w)` after, so a sentence-ending full stop counts as a boundary and a dot that continues a dotted id does not), `namesProvider(text: string, element: { id: string; name?: string }): boolean`, `namesField(text: string): boolean`, `silenced(doc: FmeaDocument, element: { id: string; name?: string }): boolean` (per edge: one qualifying assumption silences every unstated field of the edge), `edgeReliabilityLints(doc: FmeaDocument, index: number, edge: DependencyEdge): Lint[]`; the amended fixtures B4 and B7 read.

- [ ] **Step 1: Write the failing tests**

In `scripts/lints.test.ts`, with a local builder:

```ts
const UNSTATED = "edge-reliability-unstated";
const PRICING = { id: "pricing", name: "Pricing service", boundary: "owned_outside" as const };
const SLA = "99.9% monthly availability";
function pricingDoc(extra: { sla?: string; limits?: string }, assumptions: Assumption[]): FmeaDocument {
  const doc = graphDoc({ elements: ["checkout", PRICING], edges: [edge("checkout", "pricing", "weak", extra)] });
  doc.meta.assumptions = assumptions;
  return doc;
}
const open = (text: string, owner = "user", status: AssumptionStatus = "open"): Assumption => ({ text, owner, status });
const FIRES = "edge checkout -> pricing: limits is not stated and no open assumption names pricing and the field; record the missing value as an open assumption owned by user, or copy the inputs' words";
```

(`Assumption` and `AssumptionStatus` come from `./lib/types.ts` as type imports; `FIRES` is the gated message.) Tests, each a `test(...)`, named by the shape they pin, with the 0.7.0 texts verbatim:

- "edge-reliability-unstated fires on p1/high/run1's shape: no limits and assumptions that name pricing without a field": `fired(pricingDoc({ sla: SLA }, [open("pricing's repository is not named in the inputs, so pricing carries no codebase entry and is analysed from its published contract alone."), open("The pricing service returns a quote valid for the shopper's session, but no maximum age for a quote held in the cart is stated in the inputs; chk-03 treats the held price as unbounded in age and reads the occurrence gate accordingly. Where the platform team states a maximum age, chk-03's O is to be re-scored.")]), UNSTATED)` deep-equals `[{ rule: UNSTATED, severity: "warning", pointer: "/dependencies/0", message: FIRES }]`.
- "…p1/high/run2's shape: a placeholder naming the inputs is unstated": `{ sla: SLA, limits: "no rate limit published in the inputs" }` with `open("pricing's repository is not named in the inputs; pricing stays in the analysis as an element owned outside the run and no repository source is recorded for it.")` → one finding, FIRES.
- "…p1/medium/run1's shape": `{ sla: SLA }` with `open("pricing's repository is not named in the inputs. The run therefore covers acme/checkout and acme/session-auth only, and pricing is analysed as an element owned outside the boundary (owned_outside) with no codebase recorded for it.")` → one finding.
- "…is silent on p1/medium/run2's shape: a placeholder beside an assumption naming the provider and its limits": `{ sla: SLA, limits: "not stated in the inputs" }` with `open("The pricing service's 99.9% monthly availability is stated but its scaling limits are not, so no chain rates a capacity mode on pricing and no chain gives it a limits value on its edge.")` → `[]`.
- "…is silent on the inputs' stated absence, the order store's words": `{ sla: "99.99% monthly", limits: "no published request ceiling" }`, no assumptions → `[]`.
- "…is silent on the golden's assumption, which names the provider and a ceiling": `{ sla: "99.9% monthly" }` with `open("The pricing service's request ceiling is not documented in the supplied inputs; the Occurrence rating for pricing-related rows rests on exposure reasoning rather than on a stated limit.")` → `[]`.
- "…an assumption that is closed, or owned by someone else, does not silence": the same text with `status: "closed"`, and again with owner `"A. Reviewer"` → one finding each.
- "…both fields unstated give two findings, sla first, on the same pointer": `{ limits: "TBD" }` (no sla) → two findings whose messages start `edge checkout -> pricing: sla is not stated` and `edge checkout -> pricing: limits is not stated`.
- "…the run-placeholder pattern matches whole words, case-insensitively, and an empty string": with `pricingDoc({ sla: SLA, limits: v }, [])` for each `v` of `"Unknown"`, `"n/a"`, `"tbd"`, `"None stated"`, `"not documented"`, `""` → exactly one finding, FIRES; for `v` of `"50 rps per merchant"` and `"99.9% monthly"` → `[]`.
- "…the provider is matched as a whole token by id or name, so pricing does not stand in for checkout.pricing-cache, and one assumption silences every field of its edge": a doc with elements `checkout`, `PRICING` and `{ id: "checkout.pricing-cache", name: "Pricing cache" }`, edges `checkout -> pricing` `{ sla: SLA }` (limits unstated) and `checkout -> checkout.pricing-cache` (no sla, no limits). With the one assumption `open("pricing's scaling limits are not stated in the inputs.")` → findings only on `/dependencies/1`, two of them. With the one assumption `open("checkout.pricing-cache's sla is not stated in the inputs.")` → exactly one finding, on `/dependencies/0`, message FIRES (the cache's two findings go, since any field word names the field and the predicate is per edge; pricing's edge stays, since `pricing` inside `checkout.pricing-cache` follows a dot and is not a whole token). With both assumptions → `[]`.
- "…the provider id at the end of a sentence still counts, and a dot that continues a dotted id does not": `{ sla: SLA }` with `open("No scaling limit is stated for pricing.")` → `[]`; with `open("No scaling limit is stated for the Pricing service.")` → `[]`; with `open("No scaling limit is stated for pricing.cache.")` → exactly one finding, FIRES (the `\.\w` lookahead rejects `pricing` before `.cache`, so the provider is not named; a lookahead of `(?![\w-])` alone would silence it).
- "…a field word matches as a whole word, so a substring does not silence": `{ sla: SLA }` with `open("pricing's configuration is to be separately reviewed")` (`separately` holds `rate` as a substring, `configuration` holds no field word) → one finding; with `open("pricing's rate limit is not stated")` → `[]`.
- "…minimalDoc and readingDoc stay silent": `fired(minimalDoc(), UNSTATED)` and `runLints(readingDoc())` deep-equal `[]` (regression pin).
- The order test at lines 38-57 gains `["edge-reliability-unstated", "warning"],` after the `flow-users-provisional` pair.

In `scripts/validate.test.ts`:

- Line 8 becomes `import { MACHINE_RULES, runLints } from "./lib/lints.ts";` and the new test runs the two rules directly, so the schema short-circuit of `lib/validation.ts:25` cannot hide a fixture: "no shipped analysis fixture carries edge-reliability-unstated or conversion-substitution-unrecorded": `const PROSE_RULES = ["edge-reliability-unstated", "conversion-substitution-unrecorded"]; assert.ok(MACHINE_RULES.some((r) => r.id === PROSE_RULES[0]), "the c1 rule is registered"); for (const name of ANALYSIS_FIXTURES) assert.deepEqual(runLints(loadFixture<FmeaDocument>(name), MACHINE_RULES.filter((r) => PROSE_RULES.includes(r.id))), [], name);` (the c11 id joins `MACHINE_RULES` in B3 and needs no change here).
- Line 57's literal gains `limits: "no published request ceiling"`.

In `scripts/render.test.ts:1260`, in the test "the Dependencies table lists every edge in order, an absent SLA or limits as an empty cell, and escapes ids", the order-store row's last cell `<td></td>` becomes `<td>no published request ceiling</td>`; the pricing row at line 1259 and the escaped row at line 1264 keep their empty cells, so the test's name stands.

In `scripts/quality-and-lint.test.ts:26-30`: the opening string becomes `"The machine lints the scripts implement are twenty:"`, the count 20, the test name "…names twenty machine lints…".

- [ ] **Step 2: Run them to watch them fail**

Run: `bun tools/run-tests.ts`. Expected: `MACHINE_RULES has no rule edge-reliability-unstated` from `ruleById`; the order test's deepEqual; the no-warning test's `the c1 rule is registered`; the golden edge literal at `validate.test.ts:57` and the Dependencies-table literal at `render.test.ts:1257`; the quality-and-lint opening-line assertion.

- [ ] **Step 3: Implement the lint**

In `lib/lints.ts`: add `DependencyEdge` to the type import on line 1; after `rationaleUnnamedLint` (line 208) the helper block: `const PLACEHOLDER = /\b(?:not stated|none stated|not given|not provided|not documented|not recorded|not published|unknown|n\/a|tbd)\b/i`, `const FIELD_WORD = /\b(?:limits?|ceiling|scaling|rate|sla|availability|latency)\b/i`, `unstatedField(value)` (undefined, empty after trim, `/in the inputs/i`, or `PLACEHOLDER`), `wholeToken(text, token)` building `(?<![\w.-])<escaped>(?![\w-]|\.\w)` case-insensitive with a comment that the lookahead accepts a full stop that ends a sentence and rejects a dot that continues a dotted id, `namesProvider(text, element)` over the element's id and name, `namesField(text)`, `silenced(doc, element)` = some `meta.assumptions` entry with `status === "open" && owner === "user" && namesProvider && namesField` (per edge, not per field: the field word may name either field), and `edgeReliabilityLints(doc, index, edge)` returning one `lint(...)` per unstated field in the order `["sla", "limits"]` with `pointer: ptr("dependencies", index)` and the gated message, the provider resolved as `doc.elements.find((e) => e.id === edge.to) ?? { id: edge.to }`. The `MACHINE_RULES` entry, after `flow-users-provisional`: a comment (`// A provider whose SLA or limits the inputs do not state is recorded as an open assumption, never as a placeholder; the gap the 0.7.0 round missed on prompt 1.`), `id: "edge-reliability-unstated"`, `severity: "warning"`, `check(doc) { return doc.dependencies.flatMap((edge, i) => edgeReliabilityLints(doc, i, edge)); }`.

Run: `bun tools/run-tests.ts`. Expected: the lint tests pass; the no-warning test fails at its first fixture, `checkout-service.fmea.json` (the order store's `limits` finding at `/dependencies/2`; its pricing edge is silenced by the golden's own open assumption), and by the predicate the other three fire as well (pricing's `limits` at `/dependencies/1` on `update/before.fmea.json` and `update/stale-rows.fmea.json`, both fields at `/dependencies/0` on the expected fixture); `render.test.ts:1255` and `validate.test.ts:57` still fail on the fixture.

- [ ] **Step 4: Amend the four fixtures**

- `checkout-service.fmea.json`, the `checkout -> checkout.order-store` edge (lines 257-262): add `"limits": "no published request ceiling"` after `"sla": "99.99% monthly"`.
- `update/before.fmea.json` and `update/stale-rows.fmea.json`, `meta.assumptions`: append `{ "text": "The inputs give pricing's availability as 99.9% monthly but do not state its scaling limit, so the edge to pricing carries no limits value; the platform team is to supply it.", "owner": "user", "status": "open" }` (it names `pricing` and `scaling limit`; it does not say the inputs state an absence).
- `legacy-rpn-sheet.expected.fmea.json`, `meta.assumptions`: append `{ "text": "The sheet does not state payment-gateway's availability SLA or its scaling limit, so its edge carries neither; both need the sheet author's confirmation.", "owner": "user", "status": "open" }` (it must not contain `checkout-api`: `validate.test.ts:92-100` filters assumptions naming both ends and expects exactly one).
- Regenerate the two `computed` blocks: `/home/nn/.nvm/versions/node/v24.17.0/bin/node skills/fmea-software/scripts/validate.ts skills/fmea-software/evals/fixtures/checkout-service.fmea.json --write` and the same for `update/before.fmea.json`. Expected: exit 0, `computed.lints` unchanged in count (17 and 1), `validated_at` moved.

- [ ] **Step 5: The registry and the spec notes**

`references/quality-and-lint.md:25`: `nineteen` → `twenty`, and `` `edge-reliability-unstated` `` inserted after `` `flow-users-provisional` `` and before `` and `priority-table-property` ``. After line 243 (the `flow-users-provisional` row), the row:

```
| `edge-reliability-unstated` | An edge whose `sla` or `limits` is absent, empty or a run-written placeholder is flagged at `/dependencies/<i>`, one finding per field, unless an open assumption owned by `user` names the provider and the field. | warning | none | machine | [skill-authored] |
```

In `docs/specs/2026-10-14-prose-design.md`, dated inline notes in the form `(amended 2026-10-NN at plan B2: …)`: after `:282`'s "Two shipped fixtures fire today and are amended to agree with their inputs (D13):", `the predicate applied to every shipped document reaches four, update/stale-rows.fmea.json and legacy-rpn-sheet.expected.fmea.json as well, and all four are amended; update/before-v2-branches.fmea.json is refused by the legacy gate before any lint runs`; at `:56` (D13), `:469` ("The two amended fixtures") and `:514` (acceptance criterion 2), `four fixtures, two of them with regenerated computed blocks`.

- [ ] **Step 6: Run the tests to watch them pass**

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0, including `lints.test.ts:591-599` (the golden's 17 lints), every `validate.test.ts` pin of 17 and 89, `render.test.ts:830` (`11 <small>of 30</small>`) and `:1255`, `update-check.test.ts` whole, and `tools/skill-commands.test.ts`.

- [ ] **Step 7: Browser checks**

Run: `node tools/check-browser.ts` and `node tools/compare.ts --base HEAD` (nvm's node by absolute path). Expected: the gate exits 0; the comparison reports changed views only in the `structure` part (its Dependencies table, the `checkout → checkout.order-store` row's Limits cell), at every width and in print; read `build/compare/summary.md` and every changed view. A change in any other part is a finding.

- [ ] **Step 8: Commit**

```bash
git add skills/fmea-software/scripts/lib/lints.ts skills/fmea-software/scripts/lints.test.ts skills/fmea-software/scripts/validate.test.ts skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/quality-and-lint.test.ts skills/fmea-software/references/quality-and-lint.md skills/fmea-software/evals/fixtures/checkout-service.fmea.json skills/fmea-software/evals/fixtures/update/before.fmea.json skills/fmea-software/evals/fixtures/update/stale-rows.fmea.json skills/fmea-software/evals/fixtures/legacy-rpn-sheet.expected.fmea.json docs/specs/2026-10-14-prose-design.md
git commit -F- <<'EOF'
Lints: edge-reliability-unstated flags an edge whose SLA or limits the inputs do not state and no assumption records

A warning, one per field, silent beside an open assumption owned by user that
names the provider and the field, and silent on a stated absence in the inputs'
words. Fires on the three c1 failures of the 0.7.0 round and not on the run
that met c1. The four shipped fixtures it reached now agree with their inputs;
the golden's report gains the order store's limits cell (browser gate and
comparison read). The registry's count sentence and row are re-checked by the
stage-1 distill Recheck in B6.
EOF
```

---

### Task B3: The c11 lint `conversion-substitution-unrecorded`

**Files:**
- Modify: `skills/fmea-software/scripts/lib/lints.ts` (a helper block after B2's, the entry before `];`)
- Modify: `skills/fmea-software/scripts/lints.test.ts` (order literal, new tests)
- Modify: `skills/fmea-software/references/quality-and-lint.md:25` and the row after B2's
- Modify: `skills/fmea-software/scripts/quality-and-lint.test.ts:26-30`
- Modify: `docs/specs/2026-09-07-fmea-software-design.md:227` (the `MACHINE_RULES` count amendment)

**Interfaces:**
- Consumes: B2's entry at index 18 and its private helper `wholeToken(text, token)`; B1's gated c11 message.
- Produces: the entry `{ id: "conversion-substitution-unrecorded", severity: "warning", check }` at index 19; helpers `DEFAULT_RATIONALE = /^converted from .+; no rationale recorded$/`, `NUMBER_WORDS`, `defaultRows(doc): { id: string; name: string | undefined }[]` (each default-carrying chain's id and the name of its function's element), `historyClauses(doc): string[]`, `recordsSubstitution(clause: string, r: number, rows: { id: string; name: string | undefined }[]): boolean`, `substitutionLint(doc): Lint[]`; `MACHINE_RULES.length === 20`.

- [ ] **Step 1: Write the failing tests**

A local builder `convertedDoc(defaultChainIds: string[], changes: string[]): FmeaDocument`: `minimalDoc()` extended so that chains `ch-1` to `ch-4` each have their own element and function (`newElement("checkout-api", { name: "Checkout API" })`, `newElement("payment-gateway", { name: "Payment Gateway", boundary: "third_party" })`, `newElement("order-store", { name: "Order Store" })`, `newElement("pricing-service", { name: "Pricing Service" })` with functions `fn-1` to `fn-4`, one per element), each chain's S rationale set to `converted from legacy-rpn-sheet.csv; no rationale recorded` when its id is in `defaultChainIds`, and `meta.history` holding one `{ version: 1, date: "2026-10-13", change }` per string. `const UNRECORDED = "conversion-substitution-unrecorded"` and `const MESSAGE = (r: number) => \`${r} row(s) carry the default rationale and no history clause records a rationale substitution with that count or those rows\`` (the gated message).

The five entries of §6.4, copied verbatim from the documents named (long strings; each test names its source):

- "conversion-substitution-unrecorded is silent on p6/high/run1's history, which counts the substitution on 1 rating column" — the `change` of `/home/nn/Projects/failwise/build/evals/flow-model/p6/high/run1/analysis.json` `meta.history[0]`, whose decisive clause is `no rationale recorded' on 1 rating column (the Payment Gateway row, whose Justification cell is empty), the other 3 rows carrying the sheet's Justification text`; one default chain → `[]`.
- "…fires on p6/high/run2's history, whose only rationale clause is the column mapping" — `…/p6/high/run2/analysis.json`, one entry; one default chain → `[{ rule: UNRECORDED, severity: "warning", pointer: "/meta/history", message: MESSAGE(1) }]`.
- "…is silent on p6/medium/run1's history, which says the one row" — `…/p6/medium/run1/…`, decisive clause `no rationale recorded' on the one row whose Justification cell is empty, and the sheet's Justification text on the other three` → `[]`.
- "…fires on p6/medium/run2's two history entries" — both entries of `…/p6/medium/run2/…` → one finding.
- "…is silent on the shipped expected conversion, which records 1 of 4 rows" — `loadFixture<FmeaDocument>("legacy-rpn-sheet.expected.fmea.json")` run through `fired(doc, UNRECORDED)` → `[]` (its ch-2 carries the default).
- "…a date, a chain id ending in -1, a longer number, an underscore and a letter are not the count: digits adjacent to a letter, a digit, - or _ do not count": with `convertedDoc(["ch-2"], [change])` (r = 1; ch-2 and Payment Gateway are never named), each of these fires, one assertion each: `"rationale mapped on 2026-10-13 from row ch-1"`, `"rationale defaulted on 10 rows"`, `"rationale defaulted on row_1"`, `"rationale defaulted on v1"`; and `convertedDoc(["ch-1"], ["ratings.rationale substituted with the default on 1 row"])` → silent.
- "…the number word, or every default row named by its id or its element's name, records it; a clause boundary separates the count from the word": `convertedDoc(["ch-1", "ch-2"], ["rationale defaulted on two rows"])` silent; `["rationale defaulted on ch-1 and ch-2"]` silent; `convertedDoc(["ch-2"], ["rationale defaulted on the Payment Gateway row"])` silent; `convertedDoc(["ch-1", "ch-2"], ["rationale defaulted on the Payment Gateway row"])` fires (one of two rows named); `["rationale defaulted on ch-1"]` fires; `["rationale substituted. 2 rows took the default"]` fires (different clauses); `["rationale defaulted on 3 rows"]` fires (wrong count).
- "…the inputs/ prefix on the default still counts, and a rationale that is not the default never does": a chain with `converted from inputs/legacy-rpn-sheet.csv; no rationale recorded` and no history → fires with MESSAGE(1); a chain with rationale `the sheet's own words` → `[]`.
- "…minimalDoc stays silent" → `[]`.
- The order literal gains `["conversion-substitution-unrecorded", "warning"],` last.

`quality-and-lint.test.ts:26-30`: opening `"The machine lints the scripts implement are twenty-one:"`, count 21, name "…names twenty-one machine lints…".

- [ ] **Step 2: Run them to watch them fail**

Run: `bun tools/run-tests.ts`. Expected: `MACHINE_RULES has no rule conversion-substitution-unrecorded`; the order and opening-line pins.

- [ ] **Step 3: Implement the lint and the registry**

`lib/lints.ts`: `DEFAULT_RATIONALE`, `NUMBER_WORDS = ["one", …, "ten"]`, `defaultRows(doc)` (chains with any of S, O, D matching, each with the name of `elements[]` entry its function's `element` names, undefined when unresolved), `historyClauses(doc)` (every `meta.history[].change` split on `/[.;]/`), `recordsSubstitution(clause, r, rows)` (`/rationale/i.test(clause)` and one of: `new RegExp(\`(?<![\\w-])${r}(?![\\w-])\`)`, `r <= 10 && new RegExp(\`\\b${NUMBER_WORDS[r - 1]}\\b\`, "i")`, or every row named by `wholeToken(clause, row.id)` or, when `row.name` is defined, `wholeToken(clause, row.name)`), `substitutionLint(doc)` returning `[]` when `r === 0` or some clause records, else one `lint("conversion-substitution-unrecorded", "warning", ptr("meta", "history"), MESSAGE)`. The entry after B2's, with a comment (`// A conversion's declared default is a substitution only when meta.history itself says so, by count or by row: the clause rubric c11 reads.`). `quality-and-lint.md:25`: `twenty` → `twenty-one`, the id inserted after `` `edge-reliability-unstated` ``. The row after B2's:

```
| `conversion-substitution-unrecorded` | A document whose ratings carry the default rationale on r rows is flagged at `/meta/history` unless a clause of `meta.history[].change` names `rationale` together with r, its number word, or every such row by its id or its element's name. | warning | none | machine | [skill-authored] |
```

`docs/specs/2026-09-07-fmea-software-design.md:227`, after the flow-model amendment's closing `)`: `(amended 2026-10-NN by the prose design, `2026-10-14-prose-design.md` §6.4: two machine lints, `edge-reliability-unstated` and `conversion-substitution-unrecorded`, join `MACHINE_RULES`, whose count rises 18 to 20 and brings the count `quality-and-lint.md` states to twenty-one.)`

- [ ] **Step 4: Run them to watch them pass, then commit**

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0 (the golden still 17: it has no default rationale; the no-warning test of B2 now covers both ids).

```bash
git add skills/fmea-software/scripts/lib/lints.ts skills/fmea-software/scripts/lints.test.ts skills/fmea-software/scripts/quality-and-lint.test.ts skills/fmea-software/references/quality-and-lint.md docs/specs/2026-09-07-fmea-software-design.md
git commit -F- <<'EOF'
Lints: conversion-substitution-unrecorded flags a default rationale that meta.history does not count

A warning on a document whose ratings carry the default rationale on r rows
while no clause of meta.history names rationale with r, its number word or
every such row by id or element name. The five history entries of the 0.7.0
round and the shipped expected conversion are its fixtures: fires on the two
runs c11 failed. MACHINE_RULES is twenty; the base design carries the dated
amendment; the registry text is re-checked by the stage-1 Recheck in B6.
EOF
```

---

### Task B4: The render line

**Files:**
- Modify: `skills/fmea-software/scripts/render.ts:517-518` (`renderHtml` takes the model), `:564-567` (`main`'s success path)
- Modify: `skills/fmea-software/scripts/render.test.ts:830-838`, `:1433-1448`
- Modify: `docs/specs/2026-09-07-fmea-software-design.md:231` (the `render.ts` paragraph's amendment), `docs/scripts.md:15` (the render row; decision 6)

**Interfaces:**
- Consumes: `buildReportModel(doc, table).tiles.ratings` (`{ provisional, total, line }`); B1's gated render line.
- Produces: `export function renderHtml(doc: FmeaDocument, table: PriorityTable, template: string, vocabulary: Vocabulary, model: ReportModel = buildReportModel(doc, table)): string`; the private `provisionalLine(n: number, m: number): string`.

- [ ] **Step 1: Write the failing tests**

In `render.test.ts`, the test at line 830 ("the CLI writes the report and exits 0") gains `assert.equal(r.stdout, "provisional: 11 of 30 ratings are provisional. Every priority you state rests on provisional ratings: say so in the same sentence, and say that a named person is to re-score each rating against the anchors, one at a time, as the next step.\n");` (the gated line). The test at line 1433 (the `minimalDocOn` render, n = 0) gains `assert.equal(r.stdout, "");`. The two refused-render pins at lines 932 and 950 stand as they are.

- [ ] **Step 2: Run them to watch them fail**

Run: `bun tools/run-tests.ts`. Expected: the first fails with `''` against the line; the line-1433 assertion passes already (a regression pin).

- [ ] **Step 3: Implement**

`main` builds `const model = buildReportModel(doc, table)` once, passes it to `renderHtml` as the fifth argument, and after `writeFileAtomic(...)` writes `provisionalLine(model.tiles.ratings.provisional, model.tiles.ratings.total)` to `process.stdout` when `provisional > 0`, then returns 0. `renderHtml`'s default argument keeps every other caller as it is. A comment above `provisionalLine` names §6.4: the line is read within a few turns of the final message, where the hand-over is written.

- [ ] **Step 4: Run them to watch them pass; the browser checks; the documents**

Run: `bun tools/run-tests.ts`, `bun tools/check.ts`, `node tools/check-browser.ts` and `node tools/compare.ts --base HEAD` (nvm's node by absolute path). Expected: the gate exits 0 and the two reports are byte for byte the same (the HTML is unchanged). In `docs/specs/2026-09-07-fmea-software-design.md:231`, after the 2026-10-02 amendment: `(amended 2026-10-NN by the prose design, `2026-10-14-prose-design.md` §6.4: after a successful render, when n > 0 of the m ratings are provisional, one line on stdout, "<the gated render line>"; nothing on stdout when n is 0.)`. In `docs/scripts.md:15`, the render row gains one sentence: `When ratings are still provisional, it prints one line saying how many, and that every priority rests on them.`

- [ ] **Step 5: Commit**

```bash
git add skills/fmea-software/scripts/render.ts skills/fmea-software/scripts/render.test.ts docs/specs/2026-09-07-fmea-software-design.md docs/scripts.md
git commit -F- <<'EOF'
Render: one stdout line after a successful render names the provisional count and the hand-over rule

Printed when at least one rating is provisional, nothing otherwise; the
rendered HTML is unchanged (browser gate green, comparison byte for byte the
same).
EOF
```

---

### Task B5: The schema descriptions

**Files:**
- Modify: `skills/fmea-software/schemas/fmea.schema.json:295`, `:299`, `:631`, `:97`
- Modify: `skills/fmea-software/scripts/schema.test.ts` (a new test beside line 390)

**Interfaces:**
- Consumes: B1's gated descriptions.
- Produces: the four description strings a later schema edit cannot drop silently.

- [ ] **Step 1: Write the failing test**

```ts
test("the sla, limits, rationale and history.change descriptions carry the stage-1 rules", () => {
  const schema = loadSchema();
  const defs = schema.$defs as Record<string, SchemaNode>;
  const props = (def: string): Record<string, SchemaNode> => defs[def].properties as Record<string, SchemaNode>;
  const text = (node: SchemaNode): string => String(node.description);
  for (const field of ["sla", "limits"]) {
    assert.ok(text(props("dependencyEdge")[field]).includes("leave the field out and record an open assumption owned by user that names the provider and the field"), field);
    assert.ok(text(props("dependencyEdge")[field]).includes("never write a placeholder of your own"), field);
    assert.ok(!text(props("dependencyEdge")[field]).includes("Nothing computes on it."), field);
  }
  assert.ok(text(props("rating").rationale).endsWith("An empty cell in a sheet that has a rationale column takes this default too, and that row counts as a substitution recorded in meta.history."));
  assert.ok(text(props("historyEntry").change).includes("the fields it substituted with row counts, empty cells included, and its empty-trigger note"));
});
```

- [ ] **Step 2: Run it to watch it fail; implement; run again**

Run: `bun tools/run-tests.ts`; expected FAIL on the first `includes`. Then (the gated text; the draft is):

- line 295: `The availability or latency commitment, as free text in the source's own terms. When the inputs do not state it, leave the field out and record an open assumption owned by user that names the provider and the field; when they state that there is none, copy their words; never write a placeholder of your own.`
- line 299: `Scaling or rate limits, as free text in the source's own terms. When the inputs do not state them, leave the field out and record an open assumption owned by user that names the provider and the field; when they state that there are none, copy their words; never write a placeholder of your own.`
- line 631: the existing text plus ` An empty cell in a sheet that has a rationale column takes this default too, and that row counts as a substitution recorded in meta.history.`
- line 97: `the fields it substituted with row counts` → `the fields it substituted with row counts, empty cells included`.

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0 (the drift test at `schema.test.ts:735` and the golden validation are unaffected: no keyword changed).

- [ ] **Step 3: Commit**

```bash
git add skills/fmea-software/schemas/fmea.schema.json skills/fmea-software/scripts/schema.test.ts
git commit -F- <<'EOF'
Schema: the sla, limits, rationale and history.change descriptions carry the stage-1 rules

The model reads a field's description at the point of writing. No validation
changes; a test pins each sentence.
EOF
```

---

### Task B6: The wording in `SKILL.md` and the two reference cells, with the distill Recheck

**Files:**
- Modify: `skills/fmea-software/SKILL.md:35`, `:36`, `:41`, `:57` (a line after it), `:71`, `:78` (lines after it), `:112`
- Modify: `skills/fmea-software/references/design-inputs.md:14`
- Modify: `skills/fmea-software/references/quality-and-lint.md:84`
- Modify: `docs/specs/2026-09-07-fmea-software-design.md:141` (the Convert bullet's amendment)

**Interfaces:**
- Consumes: B1's gated text at `build/prose/stage1-text.md`.
- Produces: the stage-1 text part C restructures; its placements, which part C's critic preserves: the edge rule after the edge sentence of step 2, the "before you write" list last in steps 1, 2 and 7 and in Convert, S4 to S6 in step 7 at the hand-over sentence's position.

- [ ] **Step 1: Land the gated text**

Apply B1's gated text at the anchors B1 names: S1 to S3 after the edge sentence on line 36; step 1's and step 2's lists as indented continuation lines after lines 35 and 36; S4 to S6 in place of the caveat sentence on line 41 and step 7's list after it; the seed pointer after line 57; the two sentences in place of line 71; Convert's list after line 78; the clause in line 112 before its final period; the two cells. Nothing else in the prose changes (D12). Then, in `docs/specs/2026-09-07-fmea-software-design.md:141`, after the `rationale` clause's `no rationale recorded``: `(amended 2026-10-NN by the prose design, `2026-10-14-prose-design.md` §6.1: the clause read "where one exists"; SKILL.md now reads "where the column exists and the cell is filled", an empty cell taking the default and counting as a substitution on that row)`.

- [ ] **Step 2: The pinned literals**

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0: `tools/skill-commands.test.ts` (the Scripts block and the two migration headings), `update-check.test.ts:274` (the stale-reason line), `quality-and-lint.test.ts` (line 25's ids; the row tests), and `prompts.test.ts` unchanged.

- [ ] **Step 3: The private distill Recheck over every reference file stage 1 changed**

Dispatch with the Workflow tool:

```json
{ "scriptPath": "/home/nn/Projects/fmea-software/tools/workflows/distill.js",
  "args": { "stage": "check", "root": "/home/nn/Projects/failwise/.claude/worktrees/prose", "files": ["SKILL.md", "design-inputs.md", "quality-and-lint.md"] } }
```

The `quality-and-lint.md` check covers B2's and B3's changes (the count sentence and the two lint rows), which no earlier commit rechecked, and this task's `design-inputs-declared` cell. Expected: a return `{ stage: "check", files: [{ path, pass, outstanding }…], unverified: [] }` with `pass: true` for all three (3 Opus checkers, 0 Fable). On a finding: fix the text, re-run; an unverified unit is not a pass and the commit waits.

- [ ] **Step 4: Commit, with the verdict and the gated text in the body**

```bash
git add skills/fmea-software/SKILL.md skills/fmea-software/references/design-inputs.md skills/fmea-software/references/quality-and-lint.md docs/specs/2026-09-07-fmea-software-design.md
git commit -F- <<'EOF'
Skill: the c1, c5 and c11 rules stated where the output is written, with their before-you-write lists

Stage 1 of the prose design (§6.1): the three-way edge rule after the edge
sentence, the priority caveat in the rubric's own substitute wording, the empty
cell counted as a substitution, and a list at the end of steps 1, 2 and 7 and
of Convert. Item 4 of design-inputs.md and the design-inputs-declared row say
the extension to every edge provider. Draft gated by one Fable judge after
three Opus skeptics (B1). Distill Recheck <date>, <workflow id>: SKILL.md pass,
design-inputs.md pass, quality-and-lint.md pass (the count sentence and the
two lint rows of B2 and B3, and the design-inputs-declared cell).
EOF
```

---

### Task B7: The stage-1 round, its note and the Fable result gate

**Files:**
- Create (gitignored): `build/evals/prose-1/`; only if Step 5 runs, `build/evals/prose-1b/`
- Create: `docs/specs/2026-10-14-prose-eval-results-1.md` (generated, then appended by hand); only if Step 5 runs, `docs/specs/2026-10-14-prose-eval-results-1b.md`

**Interfaces:**
- Consumes: B2 to B6 as merged; part A's round script, re-run procedure and appended-section texts; the baseline `results.json`.
- Produces: the stage-1 evidence and the verdict part C starts from; the stage-1 round of record, `prose-1`, or `prose-1b` when Step 5 ran.

- [ ] **Step 1: Clean tree and gates**

Run: `git status --short` (expect nothing), `bun tools/run-tests.ts`, `bun tools/check.ts`, `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/check-browser.ts`. Expected: all exit 0. Record `git rev-parse HEAD`.

- [ ] **Step 2: Run and judge the round, generate the note, append its sections**

Run in the background, as A6 Step 3 does, `bash …/run-round.sh 1 > …/round-1.log 2>&1`, waiting with Monitor for the process to exit or for sixteen `: model=` lines. Expected: sixteen summary lines ending `invocations=present context=present`. Then the Workflow tool with `evals.js`, `evalsDir: "build/evals/prose-1"`, and the other args as in A6 Step 4 (`root`, `prompts: [1, 5, 6, 7]`, `capabilities: ["high", "medium"]`). Then:
```
/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/eval-report.ts --results build/evals/prose-1/results.json --out docs/specs/2026-10-14-prose-eval-results-1.md --title "Eval results, prose stage 1"
```
Expected: `wrote docs/specs/2026-10-14-prose-eval-results-1.md`, exit 0; on exit 3 or 1 no note is written and the stage is unverified. Append the sections of A6 Step 5 verbatim (`## What this round cannot separate`, `## Secondary leak grep`, `## Bundled skills`) and a fourth, `## Warnings the final documents carry`: its first line says it is written by hand and is lost when `eval-report.ts` runs again; then one row per run whose `context.json` has a `lints[]` entry with `final: true`: run, warning id, the run's `c1-missing-inputs-asked` score, its `c14-edges-and-codebases` score on prompts 1 and 6 (`not scored` on prompts 5 and 7, where c14 does not apply, `evals/rubric.md:9`), and whether the judge's `evidence` cites the warning or `validate.json` as a reason for a score below 2 (§11.1: the judge prompt names only `rating-provisional` as counting against nothing). When no final document carries one, the section says `None.`. Re-append all four after any regeneration.

- [ ] **Step 3: Read the round against §8.3**

From `results.json` and the note, per pair and criterion by §8.1's definition: c1 on the eight pairs, c5 on the six pairs of prompts 1, 5 and 7, c11 on the two prompt-6 pairs; every pair that passed a criterion at baseline (`build/evals/prose-0/results.json`) still passes it; the Harness table's lint columns show, per run, whether each new warning fired during the run and whether the final document still carries it; the prompt-6 c1 scores (decision 3); the warnings table of Step 2. An unverified cell is re-run and merged by A6 Step 5's procedure with `run-round.sh 1 <p> <cap> <n>` and `evalsDir: "build/evals/prose-1-rerun"`, and the note is regenerated and re-appended. A disputed criterion, one whose reading the user rules on with a dated paragraph in `evals/rubric.md` as 0f64c18 did, is re-judged on the runs that ruling touches with:

```json
{ "scriptPath": "tools/workflows/rejudge.js",
  "args": { "root": "/home/nn/Projects/failwise/.claude/worktrees/prose", "evalsDir": "build/evals/prose-1", "criterion": "<one id of its CRITERIA table, lines 74-89>", "runs": [{ "prompt": <1|5|6|7>, "model_capability": "<high|medium>", "run": <1|2> }] } }
```

(each run entry exactly those three keys; the criterion must apply to the prompt), and merged by hand as its header describes. The controller lists contested readings (from the critic's `blocking_candidates` or a judge's evidence) as questions in Step 6's message; nothing is re-rolled whose text did not move.

- [ ] **Step 4: The Fable result gate (Agent, session model, unanchored)**

One agent on the session model, given: `git diff <A6's commit>..HEAD -- skills/ docs/specs/2026-09-07-fmea-software-design.md`, the note with its four appended sections, `build/evals/prose-1/results.json`, the baseline note, and §8.3 of the spec; asked to rule `pass`, `revise` or `escalate` with findings, reading the transcripts of any failing run under `build/evals/prose-1/` itself. It receives no controller conclusion. Schema: `{ verdict, findings: [{ run, criterion, mechanism, change }] }`. Each gate run is recorded in the ledger.

- [ ] **Step 5: On a failure, one revision and one more round; a second failure goes to the user**

On `revise`: the failing transcripts go through an Opus analyst-and-skeptic read (one analyst and one skeptic per failing run, the mechanism and the refutation, as the brief's premise phase did), and the change is revised once. If the Harness table shows a new warning fired during a run and the run's final document still carries it, on any run of the round, the revision makes that lint a `blocker` (§11.1, reversing D6, named in the commit body and in Step 6's report): either the pointer moves onto a chain (for `edge-reliability-unstated`, the chains whose function's element is the edge's consumer; for `conversion-substitution-unrecorded`, the default-rationale rows) or `qualityScore` is taught that a blocker outside `chains[]` does not zero the score, with its doc comment at `quality.ts:4-11` and the renderer's `SCORE_NOTE` (`render.ts:478`) amended; then every pinned literal moves (`lints.test.ts`'s order pairs, the `severity: "warning"` expectations, the two registry rows' severity column), the no-warning test re-runs, and the browser gate and comparison re-run if the renderer changed. If wording moved, B1's gate re-runs on the revised sentence under B1's own one-revise rule. The round runs once more, Steps 2 and 3 repeated with stage `1b` in place of `1` in every command, directory and path: in the background, `bash …/run-round.sh 1b > …/round-1b.log 2>&1`, waited for with Monitor (Step 2's sixteen summary lines); `evals.js` with `evalsDir: "build/evals/prose-1b"` and the other args as in A6 Step 4 (`root`, `prompts: [1, 5, 6, 7]`, `capabilities: ["high", "medium"]`); `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/eval-report.ts --results build/evals/prose-1b/results.json --out docs/specs/2026-10-14-prose-eval-results-1b.md --title "Eval results, prose stage 1, second round"` with Step 2's Expected and its unverified rule; the four sections appended; Step 3's reading repeated on `prose-1b`, where an unverified cell is deleted under `build/evals/prose-1b/`, re-run with `run-round.sh 1b <p> <cap> <n>`, judged in `build/evals/prose-1b-rerun` and merged into `build/evals/prose-1b/results.json`, and a re-judge uses `rejudge.js` with `evalsDir: "build/evals/prose-1b"` (nothing under `build/evals/prose-1/` is deleted or re-judged); and Step 4's result gate run once more on `prose-1b` (the same named gate, run again). A second failure, or `escalate`, stops here with the findings. `prose-1b` is then the stage-1 round of record part C compares against.

- [ ] **Step 6: Serve the result to the user and stop**

Report in one message: the commit, every note's path and that its four appended sections are present, the per-criterion pair table, the baseline comparison, the warnings' fired and final counts and the c1 and c14 scores of the runs whose final document carries one, the gate's verdict and findings, the tiers (Opus judges and critic, Sonnet context, stability and persist, Opus analysts and skeptics if any) and the Fable calls actually made per gate, from the ledger (B1's gate with any re-run; this gate with its re-run on `prose-1b` if one ran). **This plan ends at that gate.** The notes are committed only after the user has read them:

```bash
git add docs/specs/2026-10-14-prose-eval-results-1.md
git commit -F- <<'EOF'
Evals: the prose stage-1 round, placement, wording and the two lints

Sixteen runs on deepseek-flash under rubric 4 and the stage-0 harness, judged
against §8.3 of the prose design; the baseline of stage 0 is the comparison.
EOF
```

(with `docs/specs/2026-10-14-prose-eval-results-1b.md` added when it exists).
