# Flow model Implementation Plan, part B: the evals

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build §8.1 of the flow-model design: rubric 4 with c16 (flows) for prompt 1 only, the flows stability predicate with its tri-state and its `verified` flag, the runs that score it, the results note, and the acceptance note with DF6's board note — ending at the user's gate.

**Architecture:** B1 is an ordinary code-and-prose task: the criterion, its two hand-synced copies and the pins. B2 adds the stability predicate to `tools/eval-stability.ts`, its schema and its brief in the workflow, and the report's column — following the file's own precedent that an added column appears only when an entry carries the field, so a results file written before it renders as it always did. B3 spends model time and writes under `build/evals/flow-model/`, which git ignores and which outlives the session; it then generates the note, appends this round's sentences to the README's evaluation record, writes the acceptance note and stops at the user's gate. Nothing here is pushed.

**Tech Stack:** As part A, plus `tools/run-eval.sh`, the Workflow script `tools/workflows/evals.js`, `tools/eval-report.ts`, `tools/eval-stability.ts`, and the judge/stability/critic agents the workflow dispatches.

**Spec:** `docs/specs/2026-10-12-flow-model-design.md` at commit 798a310 on branch `flow-model`, §8.1, §2 DF6, §11 criteria 5 and 6, and §12. Part A, `docs/plans/2026-10-12-flow-model.md`, must be committed and its acceptance judge run before B1 begins: c16 scores the flows A9's fixture carries and A10's report renders.

## Global Constraints

The Global Constraints of plan A apply unchanged, including its exact values. In addition:

- `FMEA_EVAL_PUBLISH_ROOT` is the absolute path `/home/nn/Projects/failwise/build/evals/flow-model`, because `tools/run-eval.sh` publishes after it changes into a temporary directory. No earlier evidence under `build/evals` is overwritten or deleted.
- A clause, a run or a judge that did not happen is recorded as unverified, never as a pass, in `results.json`, in the note and in the acceptance note. `tools/eval-report.ts` prints `unverified` for a run, a stability pair or a critic whose agent never returned, and the pair is then neither a pass nor a measured failure.
- Model tiering: the runs run at the capability their path names, the judges and the critic at the capability `evals.js` maps to high, and its two mechanical stages at medium; no planning or review agent is dispatched in this plan. Its only top-tier call is the acceptance judge over the branch's §11 evidence, which A16 Step 8 of plan A dispatches if the user asks for one; B3 dispatches no judge of its own. The report of each task names the tier of each phase and the top-tier count.
- The rubric's own maxima and thresholds are exact: prompt 1's maximum is **28** and its pass threshold **23 of 28** (80% of 28 is 22.4, which rounds up); prompt 6 stays at **24** and prompt 7 at **22**; rubric 4's c16 is **not a must**. The flows stability predicate uses the existing **0.8** Jaccard floor (`JACCARD_MIN`).
- Commits stay local and carry no attribution trailer of any kind; nothing is pushed and no pull request is opened by Claude. The pull request body, if one is wanted, is the user's to ask for and opens with `Read the diff: https://revision.city/diffs/nzneit/failwise/compare/main...flow-model`.

## Review Focus

Five conditions the spec implies but no task's own tests name first. Each line gives the behaviour a reasonable person would expect and the task whose tests pin it.

1. **A results file written before `flows` existed.** It renders exactly as it always did, because the column appears only when an entry carries the field — the precedent `tools/eval-report.ts:867-869` sets for the Typing column. B2 pins both directions.
2. **Two runs that both carry no flows.** The predicate is `unverified`, never a silent pass, and the entry is marked `unverified: true` so the note's own machinery names it. B2 pins the tri-state and B3 Step 4 checks the note's unverified list.
3. **One run carrying no flows while the other carries some.** The predicate is `fail` — a run that dropped every flow — and the pair does not pass. B2 pins it.
4. **A malformed `flows` block in a results file.** It is one coded `IO_READ` line naming the entry's index, as a malformed `typing` block already is (`tools/eval-report.test.ts:1052`). B2 pins the message.
5. **An old results file's `stability[]` entry with no `flows` and no `verified`.** It renders exactly as before, with no Flows column, and nothing treats a missing `verified` as a pass: the entry's own `unverified` flag is what `eval-report.ts`'s `unver` computation consumes, and B2 sets it from the tool's `verified` field, so a pair whose flows comparison did not run is listed as unverified rather than read as a measured failure. B2's shape check and B3 Step 4's note reading pin it.

## Decisions for the user at plan review

1. **The round re-runs prompts 1, 6 and 7, and records prompt 5 in `not_rerun`.** c16 applies to prompt 1 alone, but rubric 4 moves the version every pair is tallied under, so the pairs that carry c13 and c14 (prompts 1 and 6) and the update pair (prompt 7) are re-run for current-rubric scores; prompt 5's postmortem-seeded baseline is scored on c1 to c10 only and is out by the same convention that keeps c13 and c14 off it. B3 records the reason for each. If declined, only prompt 1 is re-run and every other pair is named unverified in the acceptance note.
2. **The acceptance note lives at `docs/specs/2026-10-12-flow-model-acceptance.md`.** The spec calls for one ("the acceptance note", §2 DF6) and the repository's precedent is `docs/specs/2026-09-07-acceptance.md`. B3 writes it after the runs and before the user's gate.
3. **The results note lives at `docs/specs/2026-10-12-flow-model-eval-results.md`**, generated by `tools/eval-report.ts`, as the 2026-10-08 and 2026-10-07 notes were. B3 writes it.
4. **The README's evaluation record gains this round's sentences in plan B, not plan A.** A16 moves the README's own version statements to 0.7.0 and leaves the record of the 0.1.0 and 0.6.0 rounds alone; B3 appends what this round ran and scored after the note exists, as the 0.6.0 round's sentences were appended when that round finished. If declined, the README's record stops at 0.6.0 and the acceptance note carries this round's scores alone.

## Assumptions the plan rests on

- `tools/eval-stability.ts`'s JSON output is its entry point's whole contract: `eval-stability.test.ts:306` pins `Object.keys(out)`, and the workflow's stability brief returns those fields verbatim. B2 extends both in the same commit.
- `tools/eval-report.ts`'s `StabilityResult` mirrors `STABILITY_SCHEMA` and treats `typing` as optional, adding its column when any entry carries it. `flows` and `verified` follow that pattern, so `sampleResults()` in `eval-report.test.ts` needs no new field for the existing pins to hold.
- The eval runs read the checkout fixture A9 enriched, so prompt 1's judges see flows in the model answer they compare against, and the "critical flows" input the run reads is the same file c16 is authored from.
- `tools/run-eval.sh` runs exactly one run per invocation — three positional arguments, `<prompt-id> <model-capability> <run-n>` — and publishes it under `$FMEA_EVAL_PUBLISH_ROOT`; the round is twelve invocations of it. `tools/workflows/evals.js` is the roster-driven half: it judges the runs it finds under `args.evalsDir` for `args.prompts` and `args.capabilities` and writes `results.json` there. So a round of three prompts at two capabilities is six pairs and twelve runs, and neither script is edited.

---

### Task B1: Rubric 4 and c16

**Files:**
- Modify: `skills/fmea-software/evals/rubric.md:9` (applicability), `:11` (the version paragraph), `:211-213` (the pass rule), and a new `### c16-flows (prompt 1; rubric 4)` section after c15 at `:198`
- Modify: `tools/eval-report.ts:36-59` (`Criterion`, `CRITERIA` and its doc comment), `:706` (the rubric gate, read but not moved)
- Modify: `tools/workflows/evals.js:141-165` (`RUBRIC`, `CRITERIA` and their comment)
- Test: `tools/eval-report.test.ts:33` (`CRITERIA.length`), `:287-324` (the structural test's maxima strings and `const RUBRIC = 3`)

**Interfaces:**
- Consumes: A9's golden fixture (the expected-flows table's ids and tiers are its flows) and A10's Flows section (c8's list already names it).
- Produces: rubric 4; `CRITERIA` with 16 entries, `c16-flows` last, `{ id: "c16-flows", must: false, prompts: [1], rubric: 4 }` in both copies; prompt 1's maximum 28 with threshold 23 of 28.

- [ ] **Step 1: Write the failing pins**

In `tools/eval-report.test.ts`, change line 33 to `assert.equal(CRITERIA.length, 16);`, and in the structural test at `:287-324` change `assert.match(workflow, /^const RUBRIC = 3$/m);` to `/^const RUBRIC = 4$/m` and update the pinned rubric text:

```ts
  assert.match(rubric, /Under rubric 3, prompt 1 adds c14 and c15 \(maximum 26, 8 musts\) and prompt 6 adds c14 \(maximum 24, 8 musts\); prompt 7 is unchanged \(maximum 22, 9 musts\)\./);
  assert.match(rubric, /Under rubric 4, prompt 1 adds c16 \(maximum 28, 8 musts\); prompts 6 and 7 are unchanged \(maximum 24 and 22, 9 musts\)\./);
  assert.match(rubric, /^\*\*Rubric version\.\*\* This is rubric 4, dated 2026-10-12: it adds c16\./m);
  assert.match(rubric, /a file carrying `rubric: 3` was judged under rubric 3, dated 2026-10-09, which added c14 and c15, and is read without c16/);
  assert.match(rubric, /^### c16-flows \(prompt 1; rubric 4\)$/m);
  assert.match(rubric, /only c3, c8, c13, c14, c15 and c16 are not musts/);
  assert.match(rubric, /23 of 28, since 22\.4 rounds up/);
  assert.match(rubric, /c16 scores prompt 1 at band 2 only, since the postmortem-seeded and conversion prompts read no critical-flows input/);
  assert.deepEqual(CRITERIA.find((c) => c.id === "c16-flows"), { id: "c16-flows", must: false, prompts: [1], rubric: 4 });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tools/eval-report.test.ts`
Expected: FAIL — `CRITERIA.length` is 15, the workflow still reads `const RUBRIC = 3`, and none of the rubric-4 strings is found.

- [ ] **Step 3: Write the criterion and move the numbers**

In `rubric.md`, add after c15:

```
### c16-flows (prompt 1; rubric 4)

The critical flows the inputs name appear in `flows[]`, and the chain-to-flow naming the inputs support appears in `chains[].flows`. Compare against the table for the prompt.

- **2** — Every flow the inputs name is present with its `id`, its `name` and its `value_priority`; every flow a chain names carries `users` with a `population` grounded in the inputs and a non-catalog `sources[]` entry; and the chain-to-flow naming matches the table.
- **1** — The flows are present but incomplete: a flow is missing, or a chain-named flow carries no `users`, or the chain naming is absent or wrong on one chain.
- **0** — No `flows[]` at all.

The criterion is vacuous on a prompt whose inputs name no critical-flow section, so prompt 6 (a converted sheet) and prompt 5 (a postmortem-seeded baseline scored on c1 to c10) are not scored on it: c16 scores prompt 1 at band 2 only, since the postmortem-seeded and conversion prompts read no critical-flows input. Prompt 1 (`checkout-inputs.md`), flows:

| `flows[].id` | What it is | `value_priority` | Named by |
|---|---|---|---|
| `flow-checkout` | A signed-in shopper submits a cart and the service returns a confirmation | `High` | the checkout chain, with `flow-retry` |
| `flow-retry` | A shopper retries a submission after a timeout and the cart is authorized once | `High` | the checkout chain |
| `flow-resume` | A shopper resumes an abandoned session from a saved link | `Medium` | the session chain |
```

The three ids and tiers are the ones A9 wrote into `checkout-service.fmea.json`, so the expected table and the model answer agree; if a later task renames a fixture flow, this table moves with it.

Move the numbers: in the applicability paragraph at `:9`, append `Under rubric 4, prompt 1 adds c16 (maximum 28, 8 musts); prompts 6 and 7 are unchanged (maximum 24 and 22, 9 musts).`; in the version paragraph at `:11`, make it rubric 4 dated 2026-10-12 adding c16, and restate the earlier versions as the historical sentence the test reads; in the pass-rule paragraph at `:211`, add `23 of 28, since 22.4 rounds up` to the rounding list and change "only c3, c8, c13, c14 and c15 are not musts" to "only c3, c8, c13, c14, c15 and c16 are not musts", with `prompt 1 needs 7 of the 12 points among c3, c8, c13, c14, c15 and c16 to reach 23 of 28`.

In `tools/eval-report.ts`, append the criterion to `CRITERIA`, change the doc comment's "The fifteen rubric criteria" to "The sixteen", and extend its c13/c14/c15 sentence with `and c16 to prompt 1 from rubric 4`. Read `:706` (`if (rubricOf(results) >= 3) return …`) and leave it: it suppresses a stale-critic caveat for results judged under rubric 3 or later, which rubric 4 inherits, and c16 changes no note's shape. In `tools/workflows/evals.js`, set `const RUBRIC = 4`, append the criterion in the same words the comment above it extends, and extend that comment's "c13 added by rubric 2, c14 and c15 by rubric 3" with `, c16 by rubric 4`.

- [ ] **Step 4: Run the test and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tools/eval-report.test.ts`
Expected: PASS, including the structural test's parsed `rubric.md` headings and the workflow's `CRITERIA` regex.

- [ ] **Step 5: Check the two copies agree, then run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0. The two `CRITERIA` copies are hand-synced and the structural test is what proves they agree; `tools/workflows/**` is outside fallow's entry list and oxlint's ignore list covers it.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/evals/rubric.md tools/eval-report.ts tools/workflows/evals.js tools/eval-report.test.ts
git commit -F- <<'EOF'
Evals: rubric 4 and c16, the flows criterion for prompt 1 only

Prompt 1's maximum rises to 28 and its pass threshold to 23, because c16
is not a must; prompts 6 and 7 are unchanged, since neither the converted
sheet nor the update pair carries a critical-flows input.
EOF
```

### Task B2: The flows stability predicate

**Files:**
- Modify: `tools/eval-stability.ts:39-46` (the `Stability` interface), `:114-131` (`stability()`), and a new `flows` predicate beside `typing` at `:96-112`
- Modify: `tools/workflows/evals.js:195-215` (`STABILITY_SCHEMA`) and `:315-325` (`stabilityPrompt`)
- Modify: `tools/eval-report.ts:483-490` (`StabilityResult`), `:866-898` (the stability section and its cells), and the results-file shape check beside the typing check
- Modify: `skills/fmea-software/evals/rubric.md:202-205` (the stability paragraphs) and `:220-225` (the threshold table)
- Test: `tools/eval-stability.test.ts:306` (the `Object.keys` pin) and new cases; `tools/eval-report.test.ts:266-284` and a new shape-check case

**Interfaces:**
- Consumes: A9's fixture flows; A1's `Flow.id`.
- Produces:
  - `export type FlowStability = "pass" | "fail" | "unverified"`; `export interface FlowComparison { jaccard: number; pass: FlowStability }`
  - `Stability` gains `flows: FlowComparison` and `verified: boolean`; the JSON the entry point prints gains the two fields after `typing`
  - `StabilityResult` gains `flows?: FlowComparison` and `verified?: boolean`, both optional, so an older results file renders as before; the stability entry's own existing `unverified?: boolean` is set by the workflow from the tool's `verified` field, so a pair whose flows predicate could not run is listed by `eval-report.ts`'s `unver` computation instead of reading as a measured failure
  - the rule: both runs carrying no flow ids → `unverified`; one side carrying none → `fail`; otherwise `JACCARD_MIN` over `flows[].id`, trimmed and case-folded

- [ ] **Step 1: Write the failing tests**

In `tools/eval-stability.test.ts`, extend the `Object.keys` pin at `:306` to `["jaccard", "maxRows", "countDiffs", "bound", "pass", "typing", "flows", "verified"]`, and add:

```ts
test("flows: the id sets agree at the 0.8 floor, one empty side fails, both empty is unverified", () => {
  const withFlows = (ids: string[]): FmeaDocument => ({ ...doc(["a"], ["L"]), flows: ids.map((id) => ({ id, name: id, value_priority: "High" as const })) } as FmeaDocument);
  const both = stability(withFlows(["f1", "f2", "f3", "f4"]), withFlows(["f1", "f2", "f3", "f4"]), VOCAB);
  assert.deepEqual([both.flows, both.verified, both.pass], [{ jaccard: 1, pass: "pass" }, true, true]);
  const three = stability(withFlows(["f1", "f2", "f3", "f4"]), withFlows(["f1", "f2", "f3", "f5"]), VOCAB);
  assert.deepEqual([three.flows.pass, three.pass], ["fail", false]);
  const dropped = stability(withFlows(["f1", "f2"]), withFlows([]), VOCAB);
  assert.deepEqual([dropped.flows.pass, dropped.pass, dropped.verified], ["fail", false, true]);
  const none = stability(withFlows([]), withFlows([]), VOCAB);
  assert.deepEqual([none.flows, none.verified, none.pass], [{ jaccard: 1, pass: "unverified" }, false, false]);
});
```

In `tools/eval-report.test.ts`, add:

```ts
test("the stability table gains a Flows column only when an entry carries flows, and reads the tri-state", () => {
  const r = sampleResults();
  assert.match(renderReport(r), /\| Prompt \| Model capability \| Jaccard \| Max rows \| Bound \| Count diffs \| Pass \|/);
  r.stability[0] = { ...r.stability[0], flows: { jaccard: 1, pass: "pass" }, verified: true };
  r.stability[1] = { ...r.stability[1], flows: { jaccard: 1, pass: "unverified" }, verified: false };
  const md = renderReport(r);
  assert.match(md, /\| Prompt \| Model capability \| Jaccard \| Max rows \| Bound \| Count diffs \| Flows \| Pass \|/);
  assert.match(md, /1\.000 pass/);
  assert.match(md, /unverified/);
});

test("a stability flows that is not {jaccard, pass} is one coded IO_READ line", () => {
  const r = sampleResults();
  r.stability[1] = { ...r.stability[1], flows: { jaccard: "1", pass: "maybe" } } as unknown as (typeof r.stability)[number];
  const run = reportOn(JSON.stringify(r), "eval-report-flows-");
  assert.match(run.stderr, /^error IO_READ: .*has a stability flows that is not \{jaccard, pass\} at stability\[1\]/);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tools/eval-stability.test.ts tools/eval-report.test.ts`
Expected: FAIL — the output's key list lacks `flows` and `verified`, and the report prints no Flows column.

- [ ] **Step 3: Implement the predicate**

In `tools/eval-stability.ts`, add `flowIdSet(doc)` beside `elementIdSet` (the same trim and case-fold over `flows[].id`), a `flowComparison(run1, run2): FlowComparison` that returns `{ jaccard: 1, pass: "unverified" }` when both sets are empty, `{ jaccard: j, pass: "fail" }` when exactly one is empty — computing `j` over the two sets, which is 0 — and `{ jaccard: j, pass: j >= JACCARD_MIN ? "pass" : "fail" }` otherwise. Add the two fields to `Stability`, compute `flows` in `stability()`, and set `pass` to the existing expression AND `flows.pass === "pass"`, and `verified` to `flows.pass !== "unverified"` — so an unverified predicate is a hole in the evidence and never a pass. Keep the returned object's key order `jaccard`, `maxRows`, `countDiffs`, `bound`, `pass`, `typing`, `flows`, `verified`.

In `tools/workflows/evals.js`, extend `STABILITY_SCHEMA` with `flows: { type: 'object', properties: { jaccard: { type: 'number' }, pass: { enum: ['pass', 'fail', 'unverified'] } }, required: ['jaccard', 'pass'] }` and `verified: { type: 'boolean' }`, adding both to `required`; extend `stabilityPrompt`'s field list, its "return those six fields verbatim" sentence and its failure fallback (`flows: { jaccard: 0, pass: 'unverified' }, verified: false`, with a sentence that a comparison that never ran is unverified and not a failure); and in the results assembly where a stability entry is built from the agent's answer, set the entry's `unverified` from the tool's flag — the entry is built at `tools/workflows/evals.js:425` by spreading the measured answer with `unverified: false`, so it becomes `unverified: measured.verified === false` — so an entry whose flows comparison could not run is listed as unverified rather than counted a failure.

In `tools/eval-report.ts`, add `flows` and `verified` to `StabilityResult` as optional fields with the comment the `typing` field carries, and add the conditional column exactly as `typingCell` does it: a `flowed` flag from whether any entry carries `flows`, the header cell `Flows` inserted before `Pass`, and a cell printing `<jaccard> <tri-state>` (three decimals like the Jaccard column, `—` when the entry carries none). Add the shape check beside the typing one, reporting `has a stability flows that is not {jaccard, pass}` at `stability[<i>]`, and a `verified` that must be a boolean when present.

In `rubric.md`, add the third bullet to the stability section: the Jaccard of the flow id sets at the 0.8 floor, reported `pass` / `fail` / `unverified`, where both runs carrying no flows is `unverified` and is named in the acceptance note rather than counted a pass, and one side carrying none is a `fail`. Do not add a second threshold row for the same constant: extend the existing `Jaccard floor 0.8` row at `:222` so its middle cell names both places the floor governs — the element id sets and the flow id sets — and its code cell keeps the one `JACCARD_MIN`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tools/eval-stability.test.ts tools/eval-report.test.ts`
Expected: PASS. The existing typing-column test at `:266-284` still passes, since no entry in its fixture carries `flows`.

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0. `tools/workflows/**` is outside both checkers' reach; the brief's text is checked by the eval-report structural test only where it pins a string.

- [ ] **Step 6: Commit**

```bash
git add tools/eval-stability.ts tools/eval-report.ts tools/workflows/evals.js skills/fmea-software/evals/rubric.md tools/eval-stability.test.ts tools/eval-report.test.ts
git commit -F- <<'EOF'
Evals: the flows stability predicate, tri-state, with a verified flag

Both runs empty is unverified and never a silent pass, one side empty is
a fail, and otherwise the id sets meet the 0.8 floor. The result carries
verified, true only when every predicate ran, and the note gains the
column only when an entry carries it.
EOF
```

### Task B3: The runs, the results note and the acceptance note

**Files:**
- Create (gitignored): `build/evals/flow-model/` — the published round
- Create: `docs/specs/2026-10-12-flow-model-eval-results.md` (generated)
- Create: `docs/specs/2026-10-12-flow-model-acceptance.md`
- Modify: `README.md` (the evaluation record's sentences for this round, after the note exists)

**Interfaces:**
- Consumes: B1's rubric 4; B2's predicate; A9's fixtures; A16's version.
- Produces: the round's evidence, the note, and the acceptance note the user rules on.

- [ ] **Step 1: Confirm the branch is clean and the gates pass**

Run: `git status --short` (expect nothing), `bun tools/run-tests.ts`, `bun tools/check.ts`, `node tools/check-browser.ts`
Expected: all exit 0. The run's evidence is worthless if the tree it ran against is not the tree that is committed.

- [ ] **Step 2: Run the round's twelve runs, one command each**

`tools/run-eval.sh <prompt-id> <model-capability> <run-n>` runs **one** unattended run and publishes it to `$FMEA_EVAL_PUBLISH_ROOT/p<prompt>/<capability>/run<run>`. There is no roster argument and no loop form (a `for` loop is not the same in bash and fish), so the round is twelve commands, each written as its own line with the same `env` prefix — that form is identical in both shells:

```bash
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 1 high 1
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 1 high 2
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 1 medium 1
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 1 medium 2
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 6 high 1
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 6 high 2
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 6 medium 1
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 6 medium 2
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 7 high 1
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 7 high 2
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 7 medium 1
env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/flow-model tools/run-eval.sh 7 medium 2
```

Expected: twelve summary lines, each `p<prompt> <capability> run<n>: model=… basis=… effort=high analysis=present report=present validate_exit=0`, and twelve run directories under that root each holding `analysis.json`, `report.html`, `validate.json`, `transcript.jsonl`, `transcript.json` and `models.json`. A run whose analysis or report is `missing` is recorded as `unverified` in Step 3 and never scored 0. Model time: twelve runs at the capability the table maps, plus the judging in Step 2b.

- [ ] **Step 2b: Judge the round**

`tools/workflows/evals.js` is a Workflow script, not a shell command: it judges the runs it finds and writes `results.json` into `args.evalsDir`. Dispatch it with the Workflow tool and these arguments:

```json
{ "scriptPath": "tools/workflows/evals.js",
  "args": { "root": "/home/nn/Projects/failwise", "prompts": [1, 6, 7], "capabilities": ["high", "medium"], "evalsDir": "build/evals/flow-model" } }
```

Expected: `build/evals/flow-model/results.json`, carrying `models`, `rubric: 4`, `runs`, `stability`, `critic` and `unverified`. Every judge, stability pair and critic the workflow could not get an answer from is in `unverified` and is never counted as a pass; the section below reads that list before it reads any score.

- [ ] **Step 3: Check the round against §8.1 before generating anything**

Read `build/evals/flow-model/results.json` and confirm, recording each as verified or unverified:
- every prompt-1 run produced a `flows[]` matching the c16 expected table at band 2;
- the prompt-1 stability entries carry `flows.pass === "pass"` and `verified: true`, or, where a pair legitimately carries no flows on either side, `flows.pass === "unverified"` with `verified: false`;
- the prompt-7 runs' `expected-stale.json` comparison and c12 band 2 are unchanged;
- `not_rerun` names prompt 5 with its reason, and any other prompt that did not run.
A clause that did not run is written into the note as unverified, never as a pass.

- [ ] **Step 4: Generate the results note**

Run:
```bash
node tools/eval-report.ts --results build/evals/flow-model/results.json --out docs/specs/2026-10-12-flow-model-eval-results.md --title "Eval results, flow model"
```
Expected: the note renders, with the Flows column present in its stability table and its unverified list naming every hole. Read the note whole; a sentence that reads as a pass for an unverified pair is a defect in B2's or the workflow's marking, not in the prose.

- [ ] **Step 4b: The README's evaluation record**

Append this round's sentences to `README.md`'s evaluation record in the shape the 0.6.0 round's take: which prompts ran, at which capability and how many times, which passed, what stayed unverified, and a link to `docs/specs/2026-10-12-flow-model-eval-results.md`. Do not rewrite the sentences about the 0.1.0 and 0.6.0 rounds, and do not touch the version statements A16 moved to 0.7.0.

- [ ] **Step 5: Write the acceptance note**

In `docs/specs/2026-10-12-flow-model-acceptance.md`, record against §11's eight criteria, one paragraph each, stating for every criterion whether it is met, unverified, or not applicable, and naming the evidence: the branch and its commits, the runners' last green run, the browser gate and the comparison, the register rows, the note of B3 Step 4, and the fixture facts. It carries:
- DF6's board note, one paragraph: **only the blast-radius denominator definition moved**; no rating is changed by this design; the mandated re-read may move S; O and D are re-opened for re-read and not for a change of factor.
- the unverified list of §9's and §8's deferrals that this design leaves to later work (the typed broker node, the aggregate, the positional steps marker, the per-flow contract string);
- the pairs this round did not re-run, each with its reason, and that the acceptance decision on them is the user's;
- the spec's own erratum that §11 criterion 7 says "DF3's five readings" while §8.2 lists seven and A15 covers the seven;
- one line naming the tier of every phase in this plan and the top-tier call count (plan A's acceptance judge A16 Step 8, if the user asks for one; none in B3).

- [ ] **Step 6: Serve the note to the user and stop**

Report, in one message: the plan's status, the note's path, the acceptance note's path, the top-level counts (prompts run, pairs passed, pairs unverified, runs unverified), and the four things that are the user's to decide — whether the three revision decisions (the `value_priority` rename, the `max(flow, function)` floor, the worst-single-flow relabel) stand; whether to re-run prompt 5 and the other pairs; whether to merge `flow-model` to `main`; and whether to push. **This plan ends at that gate.** Nothing is pushed, no pull request is opened, and the acceptance note stays uncommitted until the user rules, so the ruling is recorded in a commit the user can read.
