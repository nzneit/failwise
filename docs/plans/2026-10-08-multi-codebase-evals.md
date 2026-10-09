# Multi-codebase schema v3 Implementation Plan, part B: the evals

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build step 6 of the multi-codebase design's §18: the eval inputs and the session-check inputs, rubric 3 with its code sites, six runs of prompts 1, 6 and 7 under rubric 3, the four session checks of §16, the results note with the README's run-result sentences, the user's acceptance gate, and after it the three-engine browser gate, the comparison and the pull request body.

**Architecture:** Plan B starts once plan A (`2026-10-08-multi-codebase.md`, tasks A1 to A18) is committed and its Fable acceptance judge has run. B1 and B2 are ordinary code and fixture tasks with tests. B3 is a plan addition the user rules on at plan review. B4 and B5 spend model time and commit nothing: the runs and the session checks write under `build/evals/multi-codebase/`, which git ignores and which outlives the session. B6 generates the note, updates the README and stops at the user's gate, after one Fable judge has read the note. B7 runs only after the user's ruling and also commits nothing: pr.md stays uncommitted in the failwise-research worktree.

**Tech Stack:** As plan A, plus `tools/run-eval.sh`, the Workflow script `tools/workflows/evals.js`, `tools/eval-report.ts`, Playwright on chromium, firefox and webkit, and a failwise-research worktree for the pull request body.

**Spec:** `docs/specs/2026-10-08-multi-codebase-design.md` at commit ed1b9b0, §14 (the README's run-result sentences), §15 (the four added fixture files), §16, §18 step 6 and §19 items 2, 6, 8 and 9.

## Global Constraints

The Global Constraints of plan A apply unchanged. In addition:

- `FMEA_EVAL_PUBLISH_ROOT` is the absolute path `/home/nn/Projects/failwise/build/evals/multi-codebase`, because `tools/run-eval.sh` publishes after it changes into a temporary directory. No earlier evidence under `build/evals` is overwritten or deleted.
- A clause, a run or a judge that did not happen is recorded as unverified, never as a pass, in `results.json`, in the session-check records and in the note.
- Model tiering: the eval runs and judges run at the capability `evals.js` maps to high, the mechanical stages at medium; the session checks run on Opus subagents; the one Fable agent of plan B is the judge over the results note in B6. The report of each task names the tier of each phase and the Fable count.
- Commits stay local and carry no attribution trailer of any kind; nothing is pushed and no pull request is opened by Claude.

## Review Focus

The five inputs most likely to bite, each with the task that pins it:

1. A run that `tools/run-eval.sh` could not make twice has a `runs[]` entry all the same, because the workflow builds its roster from the prompts and capabilities; B4 marks that entry unverified by hand and adds an `unverified` record, so a missing directory never scores 0 silently.
2. A session run that writes anything into the checkout, rather than its own directory, is caught by `git status --short` and by the absence of `analysis.json` and `report.html` in the checkout root; B5 moves such a file aside and fails every clause of that run that reads its result.
3. An attended run that wrote no draft, so that the stored copy and the result are byte for byte the same, gives the checker nothing to check; B5 records its `--check` clause as unverified with that reason, never as a pass.
4. A results file without `session_checks` or `not_rerun` renders byte for byte as before, so the v1 and element-kinds notes regenerate unchanged; B3 pins it.
5. A clause text that holds a pipe would break the note's table; B3 escapes it and pins the escape.

## Decisions for the user at plan review

See plan A's list: items 1 (B3), 2 (B2 step 10), 10 (rubric 3's date), 11 (the session checks' briefs) and 16 (B6's two README sentences) belong to this plan.

---

**Conventions for Tasks B1 to B7.**

- Every Bash call opens with `cd /home/nn/Projects/failwise && source ~/.nvm/nvm.sh && `. The tool shell is zsh, so `node` is on PATH only after that `source`, and every repository path below is relative to the checkout. The user runs the same commands without the prefix, in bash or fish, after `nvm use 24` in fish.
- `$SCRATCH` is the executing session's scratchpad directory, the path its environment block names. The shell does not set it. So every Bash call that uses it also opens with `SCRATCH=<that path> && test -n "$SCRATCH" && test -d "$SCRATCH" && `, which keeps a command from running with `$SCRATCH` empty.
- Commits get no attribution trailer of any kind, whatever a harness reminder asks. Commits stay local, and nothing is pushed.

### Task B1: Eval inputs and the session-check inputs

**Files:**
- Modify: skills/fmea-software/evals/fixtures/checkout-inputs.md:11-26 (a Codebases section after the component inventory, and one line in Dependencies)
- Modify: skills/fmea-software/evals/fixtures/update/after-architecture.md:14-15
- Create: skills/fmea-software/evals/fixtures/update/gateway-limits.md
- Create: skills/fmea-software/evals/fixtures/update/gateway-dropped.md
- Create: skills/fmea-software/evals/fixtures/update/codebase-missing.md
- Create: skills/fmea-software/evals/fixtures/update/before-v2-branches.fmea.json
- Test: skills/fmea-software/scripts/prompts.test.ts (unchanged; it must stay green)

**Interfaces:**
- Consumes:
  - Fixture v3 facts. The codebase entries are `{ id: "checkout", name: "Checkout service", repo: "acme/checkout" }` and `{ id: "session-auth", name: "Session authentication library", repo: "acme/session-auth" }`. The edge is checkout→checkout.order-store, strong, sla "99.99% monthly".
  - The DEPENDENCY_LEGACY issue shape, from A2.
- Produces:
  - The session-check input files `update/gateway-limits.md`, `update/gateway-dropped.md`, `update/codebase-missing.md` and `update/before-v2-branches.fmea.json`, which B5 reads.
  - No test reads any of the four, and none is added to `FIXTURE_FILES` in prompts.test.ts.

- [ ] **Step 1: Add the Codebases section to checkout-inputs.md.** Insert it after the component inventory table (line 20) and before `## Dependencies`, with a blank line on each side:

```
## Codebases

- `acme/checkout`, the checkout service's repository, named "Checkout service": checkout, checkout.api and checkout.order-store live here.
- `acme/session-auth`, the session authentication library's repository, named "Session authentication library": checkout.session-auth lives here.
- pricing's repository is not named in these inputs and is not part of this run; pricing stays in the analysis as an element owned outside it.
- The checkout team owns this analysis and both repositories.
```

- [ ] **Step 2: Add the order-store dependency.** In `## Dependencies` of checkout-inputs.md, after the line `- pricing is run by the platform team and is not under analysis here; checkout sees only its published contract.`, add:

```
- checkout depends on checkout.order-store. Strong: checkout cannot confirm an order it cannot write.
```

  Nothing else in the file changes. The order store's SLA is already stated in `## SLAs and limits`.

- [ ] **Step 3: Reword item 3 of after-architecture.md.** Replace lines 14-15 with the following text and change nothing else:

```
3. A new in-process price cache, `checkout.pricing-cache`, holds priced carts for the length of
   a shopper's session; checkout reads it first and, on a miss, calls pricing itself.
```

- [ ] **Step 4: Write the three inputs variants.** Each is a copy of checkout-inputs.md as Steps 1-2 leave it, with the changes below.
  - `update/gateway-limits.md`, one change. In `## SLAs and limits`, `50 rps per merchant, enforced by the gateway with HTTP 429.` becomes `25 rps per merchant, enforced by the gateway with HTTP 429.`
  - `update/gateway-dropped.md`, one change. Delete the line `- checkout depends on checkout.payment-gateway. Strong: a failed authorization fails the checkout.`
  - `update/codebase-missing.md`, two changes:
    - Delete the inventory row `| checkout.session-auth | component | in_scope | yes | checkout | ... |`.
    - Replace the Codebases bullet for `acme/session-auth` with `` - `acme/session-auth`, the session authentication library's repository, named "Session authentication library". ``

- [ ] **Step 5: Check that each variant differs only as stated.** Run `diff skills/fmea-software/evals/fixtures/checkout-inputs.md skills/fmea-software/evals/fixtures/update/<file>` once per variant. The expected hunks:
  - gateway-limits.md: one `c` hunk, with exactly one `<` line (50 rps) and one `>` line (25 rps).
  - gateway-dropped.md: one `d` hunk, holding the gateway dependency line.
  - codebase-missing.md: one `d` hunk holding the session-auth row, and one `c` hunk holding the Codebases bullet.

  Any other hunk is a failure. Fix the file and run the diff again.

- [ ] **Step 6: Write `update/before-v2-branches.fmea.json`.** It is a constructed v2 document that also carries a top-level `dependencies` array.
  - Top-level keys, in order: `meta`, `elements`, `functions`, `dependencies`, `chains`. There is no `computed`.
  - Meta keys come in the order of before.fmea.json's meta, with these values:
    - `id`: `fmea-v2-branches`
    - `name`: `Order platform DFMEA, constructed v2 document`
    - `version`: `1`
    - `branch`: `DFMEA`
    - `scope`: `"The storefront, checkout and fulfilment services and the outside services they reach, constructed to exercise the v2 migration."`
    - `boundary`: `{ "included": ["storefront, checkout and fulfilment and the interfaces they own"], "excluded": ["the internals of the hosting platform, its content delivery network and the fraud screening service"], "security": "No element is security-relevant in this constructed document; a failure whose agent is an adversary would be handed off to threat modeling." }`
    - `ground_rules`: `["The analysis covers the design of the three in-scope services, not the internals of the services they depend on."]`
    - `assumptions`: `[{ "text": "The payment ledger's 99.95% monthly availability is the platform team's published figure; confirmed by the platform team.", "owner": "A. Reviewer", "status": "closed" }]`
    - `reviews`: `[{ "date": "2026-10-08", "reviewers": ["A. Reviewer"], "outcome": "The structure and the three chains were reviewed against the platform architecture document and accepted as written." }]`
    - `scales`: `{ "version": 1, "priority_table": "priority-fmea-software-v1" }`
    - `created` and `updated`: `2026-10-08`
    - `history`: `[]`
  - **elements**, in the order of the table below.
    - Keys follow before.fmea.json's element key order: id, kind, name, description, parent, boundary, security_relevant, then dependency where the table gives one, then sources.
    - Every element has security_relevant false and a one-sentence description of its own.
    - Every element has sources `[{ "kind": "document", "ref": "platform-architecture.md#component-inventory" }]`.

    | # | id | kind | name | parent | boundary | `dependency` block |
    |---|---|---|---|---|---|---|
    | 0 | storefront | service | Storefront | null | in_scope | none |
    | 1 | storefront.platform | service | Hosting platform | storefront | owned_outside | `{ strength: "strong", sla: "99.9% monthly", limits: "200 rps per tenant" }` |
    | 2 | storefront.platform.cdn | service | Content delivery network | storefront.platform | third_party | `{ strength: "strong", sla: "99.99% monthly" }` |
    | 3 | checkout | service | Checkout service | null | in_scope | none |
    | 4 | checkout.ledger | datastore | Payment ledger | checkout | in_scope | `{ strength: "weak", sla: "99.95% monthly" }` |
    | 5 | fulfilment | service | Fulfilment service | null | in_scope | none |
    | 6 | fraud-screen | service | Fraud screening service | null | third_party | `{ strength: "strong", limits: "20 rps per merchant" }` |

  - **functions:**
    - `{ "id": "fn-ledger-post", "element": "checkout.ledger", "statement": "Post each acknowledged payment to the ledger durably and in order", "conditions": [], "for_whom": "the checkout service" }`
    - `{ "id": "fn-checkout-order", "element": "checkout", "statement": "Confirm an order only after its payment is posted to the ledger", "conditions": [], "for_whom": "the shopper" }`
  - **dependencies:** `[{ "from": "storefront", "to": "storefront.platform", "strength": "strong", "sla": "99.9% monthly" }]`. This is the one pair the migration also derives. Its limits differ from the block's.
  - **chains:** each takes the key order and shape of before.fmea.json's `ch-5`, without its final `priority` key, which Step 7 appends in that same last position. Each chain has:
    - three-level effects written for its mode;
    - one cause with origin `design`;
    - one detection control `{ "kind": "detection", "description": <the table's text>, "status": "existing", "evidence": { "kind": "estimate" } }`;
    - ratings with `evidence_kind` `estimate` and review `{ status: "rescored", by: "A. Reviewer", date: "2026-10-08" }`, each with a one-sentence rationale;
    - actions `[]`, catalog_refs `[]`, stale `{ flag: false }` and history `[]`.

    | id | function | failure_mode | detection control description | S | O | D |
    |---|---|---|---|---|---|---|
    | ch-1 | fn-ledger-post | A ledger write is acknowledged and not durably posted | Nightly reconciliation of acknowledged ledger writes against stored ledger rows | 7 | 4 | 3 |
    | ch-2 | fn-ledger-post | Ledger posts are applied out of order and a balance is computed from a partial sequence | Sequence-gap alert on ledger posts per account | 6 | 3 | 4 |
    | ch-3 | fn-checkout-order | Checkout confirms an order whose ledger post failed | Daily comparison of confirmed orders against posted ledger entries | 8 | 3 | 3 |

- [ ] **Step 7: Fill the priorities with the script.**
  - priority.ts runs no legacy gate, and it appends `priority` after `history`, where ch-5 carries it.
  - Run: `node skills/fmea-software/scripts/priority.ts skills/fmea-software/evals/fixtures/update/before-v2-branches.fmea.json --write`
  - Pass: exit 0, and stdout is `{"table": "priority-fmea-software-v1", "rows": 3}`.

- [ ] **Step 8: Check that the v3 gate refuses the document at the element trait.**
  - Run: `node skills/fmea-software/scripts/validate.ts skills/fmea-software/evals/fixtures/update/before-v2-branches.fmea.json`
  - Pass: exit 2, and stderr is exactly one line. The line starts `error DEPENDENCY_LEGACY: format-legacy: document predates schema v3 (element storefront.platform has a dependency block); ` and ends ` at /elements/1/dependency`.

- [ ] **Step 9: Check with the merge-base validator that the document is a valid v2 analysis apart from its array.**
  - Run: `mkdir -p "$SCRATCH/v2" && git archive "$(git merge-base main HEAD)" skills/fmea-software | tar -x -C "$SCRATCH/v2"`
  - Then run: `node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));delete d.dependencies;fs.writeFileSync(process.argv[2],JSON.stringify(d,null,2)+"\n")' skills/fmea-software/evals/fixtures/update/before-v2-branches.fmea.json "$SCRATCH/v2-check.json" && node "$SCRATCH/v2/skills/fmea-software/scripts/validate.ts" "$SCRATCH/v2-check.json"`
  - Pass: exit 0, and the stdout JSON has `"ok": true`.
  - Fail: any `errors[]` entry. Fix the fixture, then repeat Steps 7-9.

- [ ] **Step 10: Run prompts.test.ts.**
  - Run: `node --test skills/fmea-software/scripts/prompts.test.ts`
  - Pass: `# fail 0`.

- [ ] **Step 11: Run both runners.**
  - Run: `bun tools/run-tests.ts`, then `bun tools/check.ts`.
  - Pass: both exit 0. A non-zero exit, or a runner that dies, means unverified: do not commit.

- [ ] **Step 12: Commit.** Add no attribution trailer of any kind.
  - `git add skills/fmea-software/evals/fixtures/checkout-inputs.md skills/fmea-software/evals/fixtures/update/after-architecture.md skills/fmea-software/evals/fixtures/update/gateway-limits.md skills/fmea-software/evals/fixtures/update/gateway-dropped.md skills/fmea-software/evals/fixtures/update/codebase-missing.md skills/fmea-software/evals/fixtures/update/before-v2-branches.fmea.json`
  - `git commit -m "Evals: the inputs name the codebases and the order-store dependency, with the session-check inputs" -m "checkout-inputs.md gains a Codebases section and the order store as a strong dependency of checkout. The pricing cache item of after-architecture.md now reads through to pricing. Three inputs variants and a constructed v2 document are added for the session checks; no test reads them."`

### Task B2: Rubric 3 and its code sites

**Files:**
- Modify: skills/fmea-software/evals/rubric.md:9, 11, 25, 27, 33, 153-155, 166, 168
- Modify: tools/eval-report.ts:36-55
- Modify: tools/workflows/evals.js:141-163, 287-302, 325 (the line-325 change applies only if the plan addition of Step 10 was accepted)
- Test: tools/eval-report.test.ts:26-28, 30-31, 242-268, plus new tests

**Interfaces:**
- Consumes:
  - The update-check.ts CLI: `node <skill>/scripts/update-check.ts <stored copy> <draft> [--check]`.
    - Stdout prints these sections in order. Each opens with a header line and lists one item per line, indented two spaces, or `  none`:
      - `edges:`
      - `elements:`
      - `stale:`
      - `unmarked:`
      - `links into removed chains:`
      - `outside elements with no consumer:`
      - `consumer causes whose linked chain changed:` (with `--check` only)
      - `re-rating order:`
    - The last line is the plain summary `update-check: <n> edge change(s), <n> element change(s), <n> stale row(s), <n> unmarked row(s), <n> links into removed chains (`1 link into a removed chain` for one), <n> outside element(s) with no consumer[, <n> changed provider(s) with --check]`.
    - Exit statuses: 0; 1 on USAGE; 2 with coded lines; 3 on IO_READ.
  - `criteriaFor(prompt: number, rubric = 1): Criterion[]`
  - `summarizeRun(prompt: number, scores: RunScore[], rubric = 1): RunSummary`
  - `renderReport(results: EvalResults, options?)`
- Produces:
  - In eval-report.ts, after c13 in `CRITERIA`:
    - `{ id: "c14-edges-and-codebases", must: false, prompts: [1, 6], rubric: 3 }`
    - `{ id: "c15-cross-service-trace", must: false, prompts: [1], rubric: 3 }`
  - The same two entries, in single-quote form, in evals.js.
  - `const RUBRIC = 3` in evals.js.
  - Rubric headings `### c14-edges-and-codebases (prompts 1 and 6; rubric 3)` and `### c15-cross-service-trace (prompt 1; rubric 3)`.
  - For prompt 7, `judgePrompt` adds the update-check.ts line that eval-report.test.ts pins. B4's judging uses it.

`<landing date>` below is the date of this task's commit (`date +%F` on that day). Write one value in Step 5's regex and Step 12's paragraph. If the commit slips to a later day, change both.

- [ ] **Step 1: Give allTwo a rubric parameter.** In tools/eval-report.test.ts, change lines 26-28 to:

```ts
function allTwo(prompt: number, except: Record<string, number> = {}, rubric = 1): RunScore[] {
  return criteriaFor(prompt, rubric).map((c) => ({ id: c.id, score: except[c.id] ?? 2, evidence: "ok" }));
}
```

- [ ] **Step 2: Re-pin the criteria count.**
  - Rename the test at line 30 to `"fifteen criteria; under rubric 1 prompts 1, 5 and 6 have 10 applicable with 8 musts, prompt 7 has 11 with 9"`.
  - Change line 31 to `assert.equal(CRITERIA.length, 15);`.
  - The rest of the test stays.

- [ ] **Step 3: Add the rubric-3 scoring tests** after the test `"under rubric 2 prompts 1 and 6 score out of 22, ..."`:

```ts
test("rubric 3 adds c14 and c15 to prompt 1 and c14 to prompt 6, scoring prompts 1, 6 and 7 out of 26, 24 and 22", () => {
  assert.deepEqual(criteriaFor(1, 3).map((c) => c.id).slice(-3), ["c13-element-typing", "c14-edges-and-codebases", "c15-cross-service-trace"]);
  assert.deepEqual(criteriaFor(6, 3).map((c) => c.id).slice(-2), ["c13-element-typing", "c14-edges-and-codebases"]);
  for (const p of [1, 6]) assert.equal(criteriaFor(p, 3).filter((c) => c.must).length, 8);
  for (const p of [5, 7]) assert.deepEqual(criteriaFor(p, 3), criteriaFor(p));
  assert.equal(summarizeRun(1, allTwo(1, {}, 3), 3).max, 26);
  assert.equal(summarizeRun(6, allTwo(6, {}, 3), 3).max, 24);
  assert.equal(summarizeRun(7, allTwo(7, {}, 3), 3).max, 22);
});

test("under rubric 3 the musts total 16, so prompt 1 needs 21 of 26 and prompt 6 needs 20 of 24", () => {
  const zero = (p: number) => Object.fromEntries(criteriaFor(p, 3).filter((c) => !c.must).map((c) => [c.id, 0]));
  assert.deepEqual(summarizeRun(1, allTwo(1, zero(1), 3), 3), { total: 16, max: 26, mustsAt2: 8, mustCount: 8, pass: false });
  assert.deepEqual(summarizeRun(6, allTwo(6, zero(6), 3), 3), { total: 16, max: 24, mustsAt2: 8, mustCount: 8, pass: false });
  const p1 = { ...zero(1), "c3-chain-completeness": 2, "c8-html-renders": 2 };
  assert.equal(summarizeRun(1, allTwo(1, { ...p1, "c13-element-typing": 1 }, 3), 3).pass, true); // 21 of 26
  assert.equal(summarizeRun(1, allTwo(1, p1, 3), 3).pass, false); // 20 of 26
  const p6 = { ...zero(6), "c3-chain-completeness": 2, "c8-html-renders": 2 };
  assert.equal(summarizeRun(6, allTwo(6, p6, 3), 3).pass, true); // 20 of 24
  assert.equal(summarizeRun(6, allTwo(6, { ...p6, "c8-html-renders": 1 }, 3), 3).pass, false); // 19 of 24
});

test("a rubric-2 file reads c14 and c15 scores as absent: prompts 1, 6 and 7 still score out of 22", () => {
  for (const p of [1, 6]) {
    assert.deepEqual(summarizeRun(p, allTwo(p, {}, 3), 2), { total: 22, max: 22, mustsAt2: 8, mustCount: 8, pass: true });
  }
  assert.equal(summarizeRun(7, allTwo(7, {}, 3), 2).max, 22);
});
```

- [ ] **Step 4: Add the rubric-3 render test** after the test `"a results file with rubric 2 scores prompt 1 on c13 out of 22; ..."`:

```ts
test("a results file with rubric 3 scores prompt 1 out of 26 and lists a c15 below 2; read as rubric 2 it scores out of 22", () => {
  const r = sampleResults();
  r.runs = r.runs.map((run, i) => ({ ...run, scores: allTwo(1, i === 0 ? { "c15-cross-service-trace": 1 } : {}, 3) }));
  r.rubric = 3;
  const three = renderReport(r);
  assert.match(three, /\| high \| 1 \| 25 \/ 26 \| 8 \/ 8 \| pass \|/);
  assert.match(three, /\| high \| 2 \| 26 \/ 26 \| 8 \/ 8 \| pass \|/);
  assert.match(three, /- high run 1, c15-cross-service-trace = 1: ok/);
  r.rubric = 2;
  const two = renderReport(r);
  assert.match(two, /\| high \| 1 \| 22 \/ 22 \| 8 \/ 8 \| pass \|/);
  assert.doesNotMatch(two, /c15-cross-service-trace/);
});
```

- [ ] **Step 5: Re-pin the rubric and workflow test** (`"CRITERIA matches the rubric: ..."`).
  - Replace the rubric-version assertion at line 257 with these two assertions, writing the actual date for `<landing date>`:
    - `assert.match(rubric, /^\*\*Rubric version\.\*\* This is rubric 3, dated <landing date>: it adds c14 and c15\./m);`
    - `assert.match(rubric, /rubric 2, dated 2026-10-07, which added c13, and is read without c14 and c15/);`
  - Keep lines 253-256 and 258-259 as they are.
  - Add:

```ts
assert.match(rubric, /Under rubric 3, prompt 1 adds c14 and c15 \(maximum 26, 8 musts\) and prompt 6 adds c14 \(maximum 24, 8 musts\); prompt 7 is unchanged \(maximum 22, 9 musts\)\./);
assert.match(rubric, /^### c14-edges-and-codebases \(prompts 1 and 6; rubric 3\)$/m);
assert.match(rubric, /^### c15-cross-service-trace \(prompt 1; rubric 3\)$/m);
assert.match(rubric, /only c3, c8, c13, c14 and c15 are not musts/);
assert.match(rubric, /21 of 26, since 20\.8 rounds up/);
assert.match(rubric, /20 of 24, since 19\.2 rounds up/);
assert.deepEqual(CRITERIA.find((c) => c.id === "c14-edges-and-codebases"), { id: "c14-edges-and-codebases", must: false, prompts: [1, 6], rubric: 3 });
assert.deepEqual(CRITERIA.find((c) => c.id === "c15-cross-service-trace"), { id: "c15-cross-service-trace", must: false, prompts: [1], rubric: 3 });
```

  - Change the workflow regex at line 265 from `(?:, rubric: (2))?` to `(?:, rubric: (\d+))?`.
  - After `const workflow = ...`, add:

```ts
assert.match(workflow, /^const RUBRIC = 3$/m);
assert.match(workflow, /node \$\{SKILL\}\/scripts\/update-check\.ts \$\{SKILL\}\/evals\/fixtures\/update\/before\.fmea\.json \$\{item\.dir\}\/analysis\.json/);
```

- [ ] **Step 6: Run the test file and see it fail.**
  - Run: `node --test tools/eval-report.test.ts`
  - Expected: `# fail` above 0. These tests fail:
    - the fifteen-criteria test;
    - the first two rubric-3 tests of Step 3;
    - the render test of Step 4;
    - the rubric test.
  - The third test of Step 3 (`a rubric-2 file reads c14 and c15 scores as absent`) passes now. Without c14 and c15 in `CRITERIA`, `allTwo(p, {}, 3)` yields the rubric-2 criteria. That test stays as the regression guard.
  - Any other failure is a finding.

- [ ] **Step 7: Add c14 and c15 to `CRITERIA` in tools/eval-report.ts.**
  - Append the two Produces entries after the c13 entry (line 54).
  - Replace the doc comment at lines 36-40 with:

```ts
/**
 * The fifteen rubric criteria (plan reference §I). c5 does not apply to prompt 6,
 * c11 applies to prompt 6 only, c12 to prompt 7 only, c13 to prompts 1 and 6
 * from rubric 2, and c14 to prompts 1 and 6 and c15 to prompt 1 from rubric 3.
 */
```

- [ ] **Step 8: Update evals.js.**
  - Set `const RUBRIC = 3`.
  - Replace the first two lines of the criteria comment with:

```js
// The fifteen rubric criteria (plan reference §I; c13 added by rubric 2, c14 and c15 by rubric 3).
// c5 does not apply to prompt 6; c13 and c14 apply to prompts 1 and 6 only, c15 to prompt 1 only.
```

  - Append after the c13 entry, exactly:

```js
  { id: 'c14-edges-and-codebases', must: false, prompts: [1, 6], rubric: 3 },
  { id: 'c15-cross-service-trace', must: false, prompts: [1], rubric: 3 },
```

- [ ] **Step 9: Add the prompt-7 judge-brief line in `judgePrompt` (evals.js).**
  - After the `const expected = ...` statement, add:

```js
  const checker = item.prompt === 7
    ? `\n- The update checker, for c12-prompt7-update: run \`cd ${ROOT} && node ${SKILL}/scripts/update-check.ts ${SKILL}/evals/fixtures/update/before.fmea.json ${item.dir}/analysis.json\` under Node 24.2 or later (where Node is installed only through nvm, run \`source ~/.nvm/nvm.sh\` first, in the same shell call), and read the stale set it prints beside ${EXPECTED_FILES[7]}; a refusal, a non-zero exit with error lines, is the checker's verdict on the run's analysis.json, so quote it in the evidence and score c12 on the document as the rubric says.`
    : ''
```

  - Then change `${expected}` at the end of the catalog bullet (line 301) to `${expected}${checker}`.

- [ ] **Step 10: Point the critic at the new design.**
  - This is a plan addition, listed for the user's ruling at plan review as plan A's decision 2. No section of the design asks for it. If the user declined it or has not ruled, skip this step.
  - In `criticPrompt`, change `... in ${ROOT}/docs/specs/2026-09-07-fmea-software-design.md first;` to `... in ${ROOT}/docs/specs/2026-09-07-fmea-software-design.md first, and §16 and §19 of ${ROOT}/docs/specs/2026-10-08-multi-codebase-design.md;`.
  - The opening words `the fmea-software v1 eval gate` stay as they are.

- [ ] **Step 11: Extend the applicability paragraph of rubric.md (line 9).** Append this sentence after `Under rubric 2, prompts 1 and 6 add c13 (maximum 22, 8 musts).`:

```
Under rubric 3, prompt 1 adds c14 and c15 (maximum 26, 8 musts) and prompt 6 adds c14 (maximum 24, 8 musts); prompt 7 is unchanged (maximum 22, 9 musts).
```

- [ ] **Step 12: Replace the version paragraph (line 11)** with the following, writing the same date as Step 5 for `<landing date>`:

```
**Rubric version.** This is rubric 3, dated <landing date>: it adds c14 and c15. A results file written under it carries `rubric: 3` at its top level. A file carrying `rubric: 2` was judged under rubric 2, dated 2026-10-07, which added c13, and is read without c14 and c15, so the element-kinds document regenerates as it was; a file with no such field was judged under rubric 1 and is read without c13, so the v1 document regenerates as it was.
```

- [ ] **Step 13: Reword c1 (lines 25 and 27).** The c1 note keeps 2026-10-08, the date §16 gives it.
  - Line 25: `*for every element carrying a dependency block*, and pricing carries one: the fixture types pricing as a \`service\` owned outside the analysis with a weak dependency,` becomes `*for every element that is the provider of an edge*, and pricing is one: the fixture types pricing as a \`service\` owned outside the analysis as the provider of a weak edge,`.
  - In the same sentence, before the closing `)` of the parenthetical, add `; amended 2026-10-08 with rubric 3, after dependencies became edges from a consumer to a provider in a top-level list and that file's item 4 came to name every element that is the provider of an edge`.
  - Line 27: `writes a value for that input into a document field — however` becomes `writes a value for that input into a document field, an edge's \`limits\` included — however`.

- [ ] **Step 14: Extend the c1 prompt-6 paragraph (line 33).** Append:

```
Under rubric 3 the declared defaults also include the edge the conversion gives each outside item, from the first in-scope item in sheet order and at strength `strong` where the sheet states none, when `meta.history` records it as a substitution in the column mapping and `meta.assumptions[]` holds it as an open assumption owned by `user`; such an edge does not lower this score. (Added 2026-10-08 with rubric 3.)
```

- [ ] **Step 15: Insert the c14 and c15 sections** after c13's `- **0** — Otherwise.` (line 153) and before `## Stability between the two runs at the same model capability`:

```
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
```

- [ ] **Step 16: Update the pass rule.**
  - In line 166, `(16 of 20; 18 of 22, since 17.6 rounds up to the next whole score)` becomes `(16 of 20; 18 of 22, since 17.6 rounds up to the next whole score; 20 of 24, since 19.2 rounds up; 21 of 26, since 20.8 rounds up)`.
  - Replace line 168 with:

```
With the criteria as written, only c3, c8, c13, c14 and c15 are not musts. On prompts 5 and 7 a run whose musts all score 2 already totals at least 16 of 20 or 18 of 22. Under rubric 2, on prompts 1 and 6 such a run totals 16 of 22 with the three non-musts at 0 and needs two more points among them. Under rubric 3 the musts total 16, so prompt 1 needs 5 of the 10 points among c3, c8, c13, c14 and c15 to reach 21 of 26, and prompt 6 needs 4 of the 8 among c3, c8, c13 and c14 to reach 20 of 24; the total rule binds there. Each file's maximum comes from `criteriaFor` in `tools/eval-report.ts`.
```

- [ ] **Step 17: Run the test file and see it pass.**
  - Run: `node --test tools/eval-report.test.ts`
  - Pass: `# fail 0`.

- [ ] **Step 18: Run both runners.**
  - Run: `bun tools/run-tests.ts`, then `bun tools/check.ts`.
  - Pass: both exit 0. A runner that dies means unverified: do not commit.

- [ ] **Step 19: Commit.** Add no attribution trailer of any kind.
  - `git add skills/fmea-software/evals/rubric.md tools/eval-report.ts tools/workflows/evals.js tools/eval-report.test.ts`
  - `git commit -m "Evals: rubric 3 adds edges and codebases, and the cross-service trace" -m "c14 scores the stated edges and each element's effective codebase on prompts 1 and 6, and c15 the linked pair on prompt 1; neither is a must, so prompt 1 scores out of 26 and prompt 6 out of 24. The prompt-7 judge also runs update-check.ts beside expected-stale.json."`

### Task B3: Session checks and prompts not re-run in the results note

**Files:**
- Modify: tools/eval-report.ts. The anchors are named by content, because B2 moves every line after 55 down by two:
  - the header comment (lines 1-14);
  - the `EvalResults` interface;
  - `renderReport`;
  - the `ResultsShape` type;
  - `resultsProblem`.
- Test: tools/eval-report.test.ts

**Interfaces:**
- Consumes: `renderReport`, `EvalResults`, `oneLine`, and the test-local `reportOn(json, prefix)`, `sampleResults()` and `staleShapedResults()`.
- Produces (session checks in results):
  - `export interface SessionClause { clause: string; outcome: "pass" | "fail" | "unverified"; detail?: string }`
  - `export interface SessionCheck { name: string; run: string; clauses: SessionClause[] }`
  - `EvalResults` gains `session_checks?: SessionCheck[]; not_rerun?: { prompt: number; reason: string }[]`.
  - `renderReport` prints `## Session checks`, then `## Prompts not re-run`. Both come after `## Checks that could not be evaluated` (or after `## Unverified units` when that section is absent) and before `## Completeness critic`. Each section is omitted when its field is absent.

- [ ] **Step 1: Gate.** This task is a plan addition (plan A's decision 1). Proceed only if the user accepted it at plan review. If the user declined it, skip B3; B5 and B6 then use their hand-written fallback.

- [ ] **Step 2: Write the failing tests.** Import `type SessionCheck` and `type SessionClause` from `./eval-report.ts`, then add:

```ts
const MIGRATION_CLAUSES: SessionClause[] = [
  { clause: "validate.ts returns ok: true", outcome: "pass" },
  { clause: "exactly one assumption is added, naming ch-5", outcome: "fail", detail: "two assumptions were added" },
  { clause: "the final message names ch-5", outcome: "unverified", detail: "the run's final message was not kept" },
];

function withSessionChecks(): EvalResults {
  const r = sampleResults();
  const check: SessionCheck = { name: "Migration check", run: "before.fmea.json at the merge base, attended", clauses: MIGRATION_CLAUSES };
  r.session_checks = [check];
  r.not_rerun = [{ prompt: 5, reason: "it adds no criterion of this round" }];
  return r;
}

test("session checks print one table per check, between the unevaluated checks and the critic, an unverified clause as UNVERIFIED", () => {
  const md = renderReport(withSessionChecks());
  assert.ok(md.includes(
    "## Session checks\n\nChecks made in a session against copies of the fixtures outside the repository, each against its clauses. A clause marked UNVERIFIED did not run or could not be judged: it is a hole in the evidence, never a pass; the acceptance note rules on each one.\n\n" +
    "### Migration check (before.fmea.json at the merge base, attended)\n\n| Clause | Outcome | Detail |\n|---|---|---|\n" +
    "| validate.ts returns ok: true | pass | — |\n| exactly one assumption is added, naming ch-5 | FAIL | two assumptions were added |\n" +
    "| the final message names ch-5 | UNVERIFIED | the run's final message was not kept |\n\n"), md);
  assert.doesNotMatch(md, /\| the final message names ch-5 \| pass/);
  const at = (h: string) => md.indexOf(h);
  assert.ok(at("## Checks that could not be evaluated") >= 0);
  assert.ok(at("## Checks that could not be evaluated") < at("## Session checks"));
  assert.ok(at("## Session checks") < at("## Prompts not re-run"));
  assert.ok(at("## Prompts not re-run") < at("## Completeness critic"));
});

test("prompts not re-run print one bullet each, with the reason", () => {
  assert.ok(renderReport(withSessionChecks()).includes(
    "## Prompts not re-run\n\nPrompts this round did not run, each with the reason. No result of an earlier round stands in for them; the acceptance note rules on each one.\n\n- Prompt 5: it adds no criterion of this round\n\n## Completeness critic"));
});

test("a results file without session_checks or not_rerun renders exactly as before", () => {
  const plain = renderReport(sampleResults());
  assert.doesNotMatch(plain, /## Session checks|## Prompts not re-run/);
  assert.equal(renderReport({ ...withSessionChecks(), session_checks: undefined, not_rerun: undefined }), plain);
  assert.doesNotMatch(renderReport(staleShapedResults()), /## Session checks|## Prompts not re-run/);
});

test("an empty session_checks prints None. and a pipe in a clause is escaped", () => {
  const empty = sampleResults();
  empty.session_checks = [];
  assert.match(renderReport(empty), /## Session checks\n\n[^\n]+\n\nNone\.\n/);
  const piped = withSessionChecks();
  piped.session_checks = [{ name: "x", run: "y", clauses: [{ clause: "a | b", outcome: "pass" }] }];
  assert.ok(renderReport(piped).includes("| a \\| b | pass | — |"));
});

test("malformed session_checks or not_rerun are one coded IO_READ line each", () => {
  const cases: [unknown, unknown, RegExp][] = [
    [{ a: 1 }, undefined, /has a session_checks that is not a list/],
    [[{ name: "x", run: "y" }], undefined, /has a session_checks\[0\] that is not \{name, run, clauses\}/],
    [[{ name: "x", run: "y", clauses: [MIGRATION_CLAUSES[0], { clause: "c", outcome: "passed" }] }], undefined,
      /has a session_checks\[0\]\.clauses\[1\] that is not \{clause, outcome, detail\?\} with outcome pass, fail or unverified/],
    [undefined, { prompt: 5 }, /has a not_rerun that is not a list/],
    [undefined, [{ prompt: "5", reason: "r" }], /has a not_rerun\[0\] that is not \{prompt, reason\}/],
  ];
  for (const [sessionChecks, notRerun, message] of cases) {
    const r = JSON.parse(JSON.stringify(sampleResults()));
    r.session_checks = sessionChecks;
    r.not_rerun = notRerun;
    const out = reportOn(JSON.stringify(r), "eval-report-session-");
    assert.equal(out.status, 3, out.stderr);
    assert.equal(out.stderr.trimEnd().split("\n").length, 1, out.stderr);
    assert.match(out.stderr, /^error IO_READ: /);
    assert.match(out.stderr, message);
  }
  assert.equal(reportOn(JSON.stringify(withSessionChecks()), "eval-report-session-").status, 0);
});
```

- [ ] **Step 3: Run the test file and see it fail.**
  - Run: `node --test tools/eval-report.test.ts`
  - Node strips the types and runs the file. Four of the five new tests fail, since the sections and the validation do not exist yet.
  - The renders-as-before test passes now and stays as a regression guard.
  - Every other test passes.

- [ ] **Step 4: Add the types and fields.**
  - Add `SessionClause`, `SessionCheck` and the two optional `EvalResults` fields beside `EvalResults`, as the Produces list gives them.
  - Add `session_checks?: unknown; not_rerun?: unknown;` to `ResultsShape`.

- [ ] **Step 5: Add the two sections.**
  - Add module-private constants `SESSION_CHECKS_INTRO` and `NOT_RERUN_INTRO`, holding the two intro sentences the tests pin.
  - `function sessionChecksSection(results: EvalResults): string[]`:
    - prints nothing when `session_checks` is undefined;
    - otherwise prints the heading and the intro, then `None.` for an empty list, or for each check `### <name> (<run>)` followed by its table;
    - prints the outcome words `pass`, `FAIL` and `UNVERIFIED`;
    - passes each cell through a private `cell(s: string): string`, which returns `oneLine(s).replaceAll("|", "\\|")`;
    - prints `—` for an absent detail.
  - `function notRerunSection(results: EvalResults): string[]`:
    - prints nothing when `not_rerun` is undefined;
    - otherwise prints the heading and the intro, then one bullet per entry, `- Prompt <prompt>: <oneLine(reason)>`, or `None.` for an empty list.
  - Each block ends with a blank line, as the other sections do.
  - In `renderReport`, insert `...sessionChecksSection(results), ...notRerunSection(results),` between `...unevaluatedChecksSection(results),` and `...criticSection(results),`.
  - Add one sentence to the header comment (lines 3-6) naming the two optional sections.

- [ ] **Step 6: Validate the two fields in the reader.**
  - In `resultsProblem`, add `?? sessionChecksProblem(results.session_checks) ?? notRerunProblem(results.not_rerun)` after `rubricProblem(results.rubric)`.
  - Build the session-check validation from small helpers, `sessionCheckProblem(c, i)` and `clauseProblem(k, i, j)`, so that each function stays within cyclomatic 20 and cognitive 15.
  - The messages, exactly as the tests pin them:
    - `has a session_checks that is not a list`
    - `has a session_checks[<i>] that is not {name, run, clauses}`
    - `has a session_checks[<i>].clauses[<j>] that is not {clause, outcome, detail?} with outcome pass, fail or unverified`
    - `has a not_rerun that is not a list`
    - `has a not_rerun[<i>] that is not {prompt, reason}`, where prompt must be an integer and reason a string
  - If fallow reports a clone against `unverifiedProblem` or `rejudgedProblem`, factor out a shared private list-walker rather than copying it.

- [ ] **Step 7: Run the test file and see it pass.**
  - Run: `node --test tools/eval-report.test.ts`
  - Pass: `# fail 0`.

- [ ] **Step 8: Run both runners.**
  - Run: `bun tools/run-tests.ts`, then `bun tools/check.ts`.
  - Pass: both exit 0, and fallow reports no unused export. `SessionCheck` and `SessionClause` count as used because the test imports them.
  - A runner that dies means unverified: do not commit.

- [ ] **Step 9: Commit.** Add no attribution trailer of any kind.
  - `git add tools/eval-report.ts tools/eval-report.test.ts`
  - `git commit -m "Eval report: session checks and prompts not re-run get sections of their own in the results note" -m "Two optional results.json fields, session_checks and not_rerun, are validated by the reader and rendered before the completeness critic. A clause that did not run prints UNVERIFIED and never pass. A file without the fields renders as before."`

### Task B4: Runs and judging of prompts 1, 6 and 7 under rubric 3

**Files:**
- None committed. The outputs go to build/evals/multi-codebase/, which is gitignored.

**Interfaces:**
- Consumes:
  - the rubric criteria from B2 (`RUBRIC = 3`, c14 and c15 in evals.js, the prompt-7 checker line);
  - checkout-inputs.md from B1;
  - plan A's update-check.ts and v3 skill;
  - `tools/run-eval.sh <1|5|6|7> <high|medium> <run-n>`;
  - the Workflow script `tools/workflows/evals.js`, with args `{ root, prompts, capabilities, evalsDir }`.
- Produces: `build/evals/multi-codebase/p{1,6,7}/high/run{1,2}/` and `build/evals/multi-codebase/results.json`, holding `rubric: 3`, 6 runs and 3 stability entries. B5 and B6 read them.

- [ ] **Step 1: Check the preconditions.**
  - `git log --format=%s main..HEAD` lists plan A's commits, then B1's and B2's (and B3's when it was accepted).
  - `test -f skills/fmea-software/scripts/update-check.ts` succeeds.
  - `git status --short` prints nothing.
  - `ls build/evals/multi-codebase` fails with "No such file or directory", or lists no `p*` directory. Never delete earlier evidence under build/evals.
  - `command -v claude` prints a path.

- [ ] **Step 2: Make the six runs.**
  - Run each from the Bash tool as `cd /home/nn/Projects/failwise && source ~/.nvm/nvm.sh && env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/multi-codebase tools/run-eval.sh <p> high <n>`, for (p, n) in (1,1), (1,2), (6,1), (6,2), (7,1) and (7,2).
  - Each run takes longer than the 10-minute foreground limit, so use `run_in_background`. Runs may go in parallel, since each publishes its own directory.
  - The form for the user, the same in bash and fish, is `env FMEA_EVAL_PUBLISH_ROOT=/home/nn/Projects/failwise/build/evals/multi-codebase tools/run-eval.sh <p> high <n>`.
  - Pass:
    - exit 0;
    - the last stdout line is `p<p> high run<n>: model=<name> basis=<basis> effort=high analysis=<present|missing> report=<present|missing> validate_exit=<n>`;
    - `build/evals/multi-codebase/p<p>/high/run<n>/transcript.json` exists.
  - analysis=missing is a measured outcome, and the judge scores it.
  - A non-zero exit is a harness failure. Retry it once. Before the retry, delete that run's directory only if it holds no transcript.json. If the retry also fails, note the run as not made.

- [ ] **Step 3: Judge the runs.**
  - Call the Workflow tool with `{ scriptPath: "tools/workflows/evals.js", args: { root: "/home/nn/Projects/failwise", prompts: [1, 6, 7], capabilities: ["high"], evalsDir: "build/evals/multi-codebase" } }`.
  - Pass: the returned object has `rubric: 3` and no `refused` field, with 6 `runs` and 3 `stability` entries.
  - Read its `unverified` list. A judge that never returned is already recorded there, and it is unverified, never a pass.

- [ ] **Step 4: Check results.json on disk.**
  - Run: `node -e 'const r=JSON.parse(require("fs").readFileSync("build/evals/multi-codebase/results.json","utf8"));console.log(r.rubric,r.runs.length,r.stability.length,JSON.stringify(r.models),r.unverified.map((u)=>u.unit).join("; "))'`
  - Pass: it prints `3 6 3 {"high":"opus","medium":"sonnet","low":"haiku"} <units or nothing>`.
  - If the persist agent failed, the file is missing or its counts differ. Then write the returned object to the file by hand with `JSON.stringify(results, null, 2)` and repeat this step.

- [ ] **Step 5: Record any run that was never made.** The workflow builds one `runs[]` entry for every run of its roster, whether or not the directory exists, so every run has an entry to change. For each run Step 2 noted as not made:
  - in results.json, set that run's entry to `"unverified": true` and `"notes": "tools/run-eval.sh exited <code> twice; the run was never made"`;
  - push `{ "unit": "run p<p> high run<n>", "detail": "tools/run-eval.sh exited <code> twice: <its stderr line>; the run was never made, so it is neither a pass nor a measured failure" }` onto `unverified`.

  Then repeat Step 4.

- [ ] **Step 6: Report.** Tell the user:
  - each run's model and basis, from `build/evals/multi-codebase/p*/high/run*/models.json`;
  - from results.json, the judge and critic model (`models.high`) and the stability and persist model (`models.medium`), with each phase's tier: runs and judges at high, mechanical stages at medium, no Fable agent;
  - the unverified list, verbatim.

  Nothing is committed.

### Task B5: The session checks

**Files:**
- None committed.
- The working copies go under `$SCRATCH/b5/`, outside the repository.
- After the runs, the evidence is copied to `build/evals/multi-codebase/session/` and the records are written to `build/evals/multi-codebase/session-checks.json`. Both are gitignored and outlive the session.

**Interfaces:**
- Consumes:
  - The update-check.ts CLI, `node skills/fmea-software/scripts/update-check.ts <stored copy> <draft> [--check]`. It writes nothing. Its exit statuses:
    - 0: stdout carries the sections B2 quotes;
    - 1: USAGE (wrong argument count or extension);
    - 2: coded stderr lines. These are `UPDATE_BASELINE` (a copy that is not v3, or a meta.id or meta.version mismatch); `KIND_LEGACY` or `DEPENDENCY_LEGACY` on the draft; `SCHEMA`, prefixed `the stored copy: ` or `the draft: `; or, with `--check`, `UPDATE_MISMATCH`;
    - 3: IO_READ.
  - The session-check input files from B1.
  - `SessionCheck`, `SessionClause` and `not_rerun` from B3.
- Produces:
  - `build/evals/multi-codebase/session-checks.json`, holding `{ session_checks, not_rerun }`.
  - `build/evals/multi-codebase/session/<check>/<run>/`, the evidence each clause's detail cites.
  - When B3 was accepted, `session_checks` and `not_rerun` in build/evals/multi-codebase/results.json, which B6 renders.

- [ ] **Step 1: Check the preconditions.**
  - B4's results.json exists, and B4 Step 4 passes.
  - Note whether B3 was accepted. If it was declined, skip Step 7: B6 renders the records from session-checks.json by hand.

- [ ] **Step 2: Make the ten run directories outside the repository.**
  - Each run directory `<dir>` is `$SCRATCH/b5/<check>/<run>/`, holding `analysis.json` and `inputs/`. The three migration runs get an empty `inputs/`.
  - Beside each run directory, put a pristine copy, `$SCRATCH/b5/<check>/<run>.stored.json`.
  - For each row of the table below:
    - `mkdir -p "$SCRATCH/b5/<check>/<run>/inputs"`
    - write analysis.json from the row's source: `cp <source> "$SCRATCH/b5/<check>/<run>/analysis.json"`, or, for the merge-base row, `git show "$(git merge-base main HEAD)":skills/fmea-software/evals/fixtures/update/before.fmea.json > "$SCRATCH/b5/<check>/<run>/analysis.json"`
    - copy the row's inputs file, if it has one: `cp skills/fmea-software/evals/fixtures/update/<inputs file> "$SCRATCH/b5/<check>/<run>/inputs/"`
    - make the pristine copy: `cp "$SCRATCH/b5/<check>/<run>/analysis.json" "$SCRATCH/b5/<check>/<run>.stored.json"`

  | check/run | analysis.json from | inputs/ |
  |---|---|---|
  | migration/before-attended | `skills/fmea-software/evals/fixtures/update/before.fmea.json` at the merge base | empty |
  | migration/branches-attended, migration/branches-unattended | `skills/fmea-software/evals/fixtures/update/before-v2-branches.fmea.json` | empty |
  | consumer/attended | `skills/fmea-software/evals/fixtures/checkout-service.fmea.json` | `gateway-limits.md` |
  | outside/unattended, outside/removal, outside/consumer | `skills/fmea-software/evals/fixtures/checkout-service.fmea.json` | `gateway-dropped.md` |
  | coverage/unattended, coverage/supplied, coverage/removal | `skills/fmea-software/evals/fixtures/checkout-service.fmea.json` | `codebase-missing.md` |

- [ ] **Step 3: Brief one Opus subagent per run.** Opus is the high capability, and the runs may go in parallel. Each brief says:
  - Use the fmea-software skill: read `/home/nn/Projects/failwise/skills/fmea-software/SKILL.md` and follow it. `CLAUDE_SKILL_DIR` is `/home/nn/Projects/failwise/skills/fmea-software`.
  - Treat `<dir>` as the current working directory. Start every Bash call with `cd <dir> && `, and resolve `./analysis.json`, `./report.html` and `inputs/` against `<dir>`. Write nothing outside `<dir>`.
  - Run node as `source ~/.nvm/nvm.sh && node ...`.
  - Never read `skills/fmea-software/evals/`, `docs/` or `build/`.
  - Write each question you would ask the person to `<dir>/questions.md`, word for word, before acting on its answer.
  - Write to `<dir>/commands.md`, in order:
    - each command you run;
    - each question, at the moment you write it to questions.md, as a line `question: <its first ten words>`;
    - each write of analysis.json, as a line `write analysis.json`.
  - Each time you set a rating, append `<chain id> <S|O|D> <old value> -> <new value>` to `<dir>/ratings-log.md` before setting the next one. A rating re-read and kept is logged with the same value on both sides.
  - End with your hand-over message, and write it also to `<dir>/final-message.md`.
  - Make no commits.
  - The task: "migrate this analysis" for the migration runs, adding "inputs/ is empty: a migration reads analysis.json alone"; "update this analysis from the inputs in inputs/" for the others.
  - For an unattended run, put `unattended_preamble` from `skills/fmea-software/evals/prompts.json` before the brief, verbatim.
  - For an attended run, give the person's answers from the table below, and add: "a question not answered here: write it to questions.md and stop".

  | run | the person's answers |
  |---|---|
  | migration/before-attended | none; no question is expected |
  | migration/branches-attended | which in-scope root or roots consume `fraud-screen`: `checkout`, at the strength, SLA and limits the block carries |
  | consumer/attended | none expected |
  | outside/removal | remove `checkout.payment-gateway` with its descendants, functions and chains and every edge at either end: confirmed |
  | outside/consumer | `checkout.api` consumes `checkout.payment-gateway`; no strength, SLA or limits given |
  | coverage/supplied | the inputs for `acme/session-auth` are checkout-inputs.md's `checkout.session-auth` inventory row and its Codebases bullet (paste both lines) |
  | coverage/removal | remove `checkout.session-auth` with its functions and chains: confirmed |

- [ ] **Step 4: Run the mechanical checks on every finished run.** `<run>` below stands for `$SCRATCH/b5/<check>/<run>`.
  - **Nothing written to the checkout.** `git status --short` prints nothing, and `test ! -e analysis.json && test ! -e report.html` succeeds in the checkout root.
    - A file found there is a finding. Find the run that wrote it from the runs' commands.md and move the file to `$SCRATCH/b5/stray/`.
    - Every clause of that run that reads its result is then `fail`, and the detail says where the file was written.
  - **Validation.** Run `node skills/fmea-software/scripts/validate.ts "<run>/analysis.json" > "<run>.validate.json"; echo "exit $?"`.
    - Record the exit status, `ok`, and the `rule` of every entry of `lints[]`.
  - **Checker on attended results.** On each attended run of the consumer, outside and coverage checks:
    - First run `cmp "<run>.stored.json" "<run>/analysis.json"`. When it prints nothing (exit 0), the run wrote no draft. Then the run's `--check` clause is `unverified`, with detail `the run wrote no draft, so the checker had nothing to check`.
    - Otherwise run `node skills/fmea-software/scripts/update-check.ts "<run>.stored.json" "<run>/analysis.json" --check > "<run>.check.out" 2> "<run>.check.err"; echo "exit $?"`, keeping the exit status, stdout and stderr verbatim.
    - A draft whose `meta.version` is not one above the stored copy's is still checked. Its clause is `fail`, with the checker's output.
  - **Unattended runs of the outside and coverage checks.** Run `cmp "<run>.stored.json" "<run>/analysis.json"`. Pass: no output, exit 0.
  - **Stale flags, ratings, review statuses and links.** Run this on the stored copy and on the result:

    ```
    node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));for(const c of d.chains)console.log(c.id,JSON.stringify(c.stale),["S","O","D"].map((f)=>f+"="+c.ratings[f].value+"/"+c.ratings[f].review.status).join(" "),JSON.stringify(c.causes.filter((k)=>k.chain!==undefined).map((k)=>({chain:k.chain,cited_o:k.cited_o}))))' <file>
    ```

  - **Edges, codebases, assumptions and version.** On the result, run a `node -e` that prints `d.dependencies`, `d.meta.codebases`, `d.meta.assumptions` and `d.meta.version`.
    - Count the assumptions added: the result's `meta.assumptions.length` minus the stored copy's.
  - **History and session record.** Read the last entry of the result's `meta.history`, then `final-message.md`, `questions.md`, `commands.md` and `ratings-log.md`.
  - **The prompt-7 checker case of §19 item 8.**
    - Run `grep -n 'before.fmea.json' skills/fmea-software/scripts/update-check.test.ts` to find the case that runs `update-check.ts --check` on `update/before.fmea.json` as the stored copy against the draft the test builds.
    - Then run `node --test skills/fmea-software/scripts/update-check.test.ts` and keep its `# pass` and `# fail` lines.

- [ ] **Step 5: Copy the evidence into the eval directory.**
  - Run: `mkdir -p build/evals/multi-codebase/session && cp -R "$SCRATCH/b5/." build/evals/multi-codebase/session/`
  - Pass: `ls build/evals/multi-codebase/session/*/` lists the ten run directories, their `.stored.json` copies and their `.validate.json`, `.check.out` and `.check.err` files.
  - Every clause's detail below cites files under `build/evals/multi-codebase/session/`.

- [ ] **Step 6: Write `build/evals/multi-codebase/session-checks.json`** as `{ "session_checks": [...], "not_rerun": [...] }`.
  - Use the thirteen checks below, with these exact `name` and `run` strings and these clause strings, in this order.
  - Each clause's outcome is `pass`, `fail` or `unverified`. Its `detail` names the evidence: a command's output, a file and line, or why the clause is unverified.
  - A clause whose run was not made, or whose evidence is missing, is `unverified`, never `pass`.
  - The detail of every `update-check.ts --check` clause reads `exit <n>; stdout: <verbatim>; stderr: <verbatim>`, or gives the no-draft reason of Step 4.

  1. name `Migration check`, run `before.fmea.json at the merge base, attended`:
     - `validate.ts returns ok: true`
     - `dependencies[] holds exactly two edges, both from checkout: to checkout.payment-gateway (strong, 99.95% monthly, 50 rps per merchant, chosen as the in-scope parent) and to pricing (weak, 99.9% monthly, chosen as the one other in-scope root)`
     - `no element keeps a dependency key`
     - `no codebase and no link is added`
     - `exactly one assumption is added, open, owned by user, naming ch-5 and no other chain`
     - `no row is marked stale`
     - `ch-5 keeps its S of 4 and its rescored status`
     - `meta.version is bumped once`
     - `the history entry names both edges with their from and the rule that chose it, and names ch-5`
     - `the final message names ch-5 and says that codebases and links are later work`
     - `no question was asked`
  2. name `Migration check, constructed document`, run `before-v2-branches.fmea.json, attended`:
     - `validate.ts returns ok: true`
     - `dependencies[] holds exactly four edges: storefront to storefront.platform kept as it stood in the array (strong, 99.9% monthly, no limits); storefront to storefront.platform.cdn (strong, 99.99% monthly; the nearest in-scope ancestor above an outside parent); checkout to checkout.ledger (weak, 99.95% monthly; the in-scope parent); checkout to fraud-screen (strong, 20 rps per merchant; named by the person)`
     - `the person was asked which in-scope root consumes fraud-screen, with storefront, checkout and fulfilment named, and no other question was asked`
     - `exactly two assumptions are added`
     - `one open assumption owned by user carries the block values dropped for the existing storefront to storefront.platform pair (limits 200 rps per tenant)`
     - `one open assumption owned by user names ch-1 and ch-2 and no other chain`
     - `no element keeps a dependency key`
     - `no codebase and no link is added`
     - `no row is marked stale and no rating changes`
     - `meta.version is bumped once`
     - `the history entry names each edge made with its from and rule, the existing edge kept, and ch-1 and ch-2`
     - `the final message names ch-1 and ch-2 and says that codebases and links are later work`
  3. name `Migration check, constructed document`, run `before-v2-branches.fmea.json, unattended`. The clauses of check 2, with three changes:
     - the fraud-screen edge reads `checkout to fraud-screen` replaced by `storefront to fraud-screen (strong, 20 rps per merchant; the first in-scope root in document order)`;
     - the asked clause becomes `no question was asked, and an open assumption owned by user names checkout and fulfilment as candidate consumers of fraud-screen`;
     - the count clause becomes `exactly three assumptions are added`.
  4. name `Migration branches not exercised`, run `neither migration document`. Each clause is `unverified`, with detail `neither migration document carries this shape`:
     - `an in-scope provider with no other in-scope root, whose block is dropped and whose chains are still named`
     - `an outside provider with no consumer, which stops the update unattended`
     - `a document in which no block was weak`
     - `the v1-then-v2 path`
  5. name `Consumer-side stale check`, run `checkout fixture from gateway-limits.md, attended`:
     - `ch-1, ch-8 and ch-9, and no other row, are stale with reason element-changed and since_version 2`
     - `on each stale row S and O were re-read and D carried forward`
     - `ch-9's O rationale cites ch-1's O as re-rated and its evidence`
     - `ch-1 was re-rated before ch-9, read from the session's record of the run`. The evidence is ratings-log.md. The clause is `unverified` when that file is missing or holds no line for ch-1's or ch-9's O.
     - `the result validates with ok: true`
     - `ch-9's cited_o equals ch-1's re-rated ratings.O and linked-cause-occurrence-drift is silent`
     - `update-check.ts --check exits 0 on the result`
  6. name `Outside-element check`, run `gateway-dropped.md, unattended`:
     - `the file is byte for byte as it was`
     - `the final message names checkout.payment-gateway and asks for a consumer or for leave to remove it`
  7. name `Outside-element check`, run `gateway-dropped.md, attended, removal confirmed`:
     - `checkout.payment-gateway, fn-gateway-authorize, ch-1, ch-8, the checkout to checkout.payment-gateway edge and ch-9's link are gone`
     - `the history entry names each of them and ch-1's tracked action with its link`
     - `no row is marked stale or re-rated`
     - `the result validates with ok: true`
     - `update-check.ts --check exits 0 on the result`
  8. name `Outside-element check`, run `gateway-dropped.md, attended, checkout.api named with no strength`:
     - `one edge from checkout.api to checkout.payment-gateway exists, with an open assumption owned by user on its strength`
     - `ch-1, ch-8 and ch-9 are stale with reason element-changed`
     - `no other row is stale or re-rated`
     - `the result validates with ok: true`
     - `update-check.ts --check exits 0 on the result`
  9. name `Coverage check`, run `codebase-missing.md, unattended`:
     - `the file is byte for byte unchanged`
     - `the final message names acme/session-auth, checkout.session-auth and its chain ch-5`
  10. name `Coverage check`, run `codebase-missing.md, attended, inputs supplied`:
      - `nothing is removed`
      - `no row is stale`
      - `the result validates with ok: true`
      - `update-check.ts --check exits 0 on the result`
  11. name `Coverage check`, run `codebase-missing.md, attended, removal confirmed`:
      - `checkout.session-auth, fn-auth-session and ch-5 are gone`
      - `the history entry names each of them and any tracked action`
      - `no row is stale`
      - `the acme/session-auth entry stays in meta.codebases[] and no element names it`
      - `the result validates with ok: true`
      - `update-check.ts --check exits 0 on the result`
  12. name `Checker on the prompt-7 fixture`, run `update/before.fmea.json as the stored copy against the draft built in update-check.test.ts`:
      - `update-check.ts --check exits 0 with update/before.fmea.json as the stored copy and, as the draft, that copy with the checkout-to-gateway edge weak, expected-stale.json's flags and meta.version plus one`
      - The outcome is `pass` when the grep of Step 4 finds the case and the test file reports `# fail 0`. It is `fail` when that case fails, and `unverified` when no case is found or the file did not run.
      - The detail gives the case's title and line, the `# pass` and `# fail` lines, the exit status 0, and the stdout the case asserts, copied verbatim from the test's `assert.equal(r.stdout, …)`: it opens with the `edges:` section, whose one line is `  changed checkout to checkout.payment-gateway: strength`, and ends with the `update-check: 1 edge change, …` summary line. §19 item 8 asks for that output in the note.
  13. name `What stays prose`, run `every session check`. The first four clauses are judged from the evidence named in parentheses. Each is `unverified` only when that evidence is missing.
      - `the outside-element question was written before any write of analysis.json that marked a row stale, on both attended outside-element runs`. The evidence is commands.md and questions.md of outside/removal and outside/consumer. The detail adds that the answers were supplied in the brief, so the back-and-forth itself was not exercised.
      - `the coverage question on acme/session-auth was written before any write of analysis.json, on both attended coverage runs`. The evidence is commands.md and questions.md of coverage/supplied and coverage/removal. The detail adds the same note on the answers supplied in the brief.
      - `the printed re-rating order was followed`. The evidence is consumer/attended's ratings-log.md against the `re-rating order:` section of its `.check.out`.
      - `each re-read on a stale row records what it concluded against the failure mode and the end effect`. The evidence is consumer/attended's S and O rationales and the row history entries for ch-1, ch-8 and ch-9. The detail quotes them.

      The last four clauses are `unverified` whatever the runs show, with the detail in parentheses:
      - `the choice among new chains a link may be repointed to` (no check exercises it: the removal of ch-1 leaves no new chain to repoint to)
      - `whether a cleared codebase should have been repointed` (no check exercises it)
      - `a removal that leaves a further outside element with no consumer` (the checkout fixture has no outside element behind another, so no run could carry the recursion)
      - `the multi-team review convention` (the inputs name one team for both repositories, so no run exercised it)

  The `not_rerun` field holds:

  ```
  [{ "prompt": 5, "reason": "Prompt 5 adds no criterion of this round, since c14 and c15 do not apply to it, but its c1 is now judged on edge providers and its c7 on the v3 gate, so a v3 run of prompt 5 is unverified by this round's evidence; its input checkout-inputs.md also gained a Codebases section and the order-store dependency since its last run." }]
  ```

- [ ] **Step 7: Check that the records file parses and every clause has an allowed outcome.**
  - Run: `node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const o=s.session_checks.flatMap((c)=>c.clauses.map((k)=>k.outcome));console.log(s.session_checks.length,o.length,[...new Set(o)].join(","),s.not_rerun.length)' build/evals/multi-codebase/session-checks.json`
  - Pass: it prints `13 <n> <subset of pass,fail,unverified> 1`.

- [ ] **Step 8: Merge the records into results.json.** Only if B3 was accepted.
  - Run: `node -e 'const fs=require("fs");const p="build/evals/multi-codebase/results.json";const r=JSON.parse(fs.readFileSync(p,"utf8"));const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));r.session_checks=s.session_checks;r.not_rerun=s.not_rerun;fs.writeFileSync(p,JSON.stringify(r,null,2)+"\n")' build/evals/multi-codebase/session-checks.json`
  - Pass: exit 0.

- [ ] **Step 9: Preview the note.** Only if B3 was accepted.
  - Run: `node tools/eval-report.ts --results build/evals/multi-codebase/results.json --out "$SCRATCH/note-preview.md" --title "Eval results, multi-codebase"`
  - Pass:
    - stdout is `wrote <path>`, and the exit status is 0;
    - `awk '/^## Session checks$/{f=1;next} /^## /{f=0} f&&/^### /' "$SCRATCH/note-preview.md" | wc -l` prints `13`;
    - `grep -n '^## ' "$SCRATCH/note-preview.md"` shows `## Session checks`, then `## Prompts not re-run`, before `## Completeness critic`.

- [ ] **Step 10: Report to the user.**
  - Every `fail` and `unverified` clause, verbatim.
  - The tier: ten Opus subagents and no Fable agent.

  Nothing is committed.

### Task B6: The results note and the README run-result sentences

**Files:**
- Create: docs/specs/2026-10-08-multi-codebase-eval-results.md (generated)
- Modify: README.md. The anchors are named by content:
  - the chain-count sentence (line 61 today);
  - the status section's evaluation paragraphs (lines 96-106 today);
  - the variance and models bullets (lines 110 and 114 today).

**Interfaces:**
- Consumes:
  - build/evals/multi-codebase/results.json, with `session_checks` and `not_rerun` when B3 was accepted (B4, B5);
  - build/evals/multi-codebase/session-checks.json and the evidence under build/evals/multi-codebase/session/ (B5);
  - `node tools/eval-report.ts --results <file> --out <file> --title <text>`.
- Produces: the committed results note, which B7 links in the pull request body.

- [ ] **Step 1: Generate the note.**
  - Run: `node tools/eval-report.ts --results build/evals/multi-codebase/results.json --out docs/specs/2026-10-08-multi-codebase-eval-results.md --title "Eval results, multi-codebase"`
  - Pass: stdout is `wrote docs/specs/2026-10-08-multi-codebase-eval-results.md`, and the exit status is 0.
  - If B3 was declined, append two hand-written sections after generating:
    - `## Session checks (hand-written after generation)`, holding the tables of build/evals/multi-codebase/session-checks.json in the B3 layout, with the outcomes `pass`, `FAIL` and `UNVERIFIED`;
    - `## Prompts not re-run`, with the prompt-5 bullet.
  - Append them again after any regeneration.

- [ ] **Step 2: Check the note's outline.**
  - Run: `grep -n '^## \|^### ' docs/specs/2026-10-08-multi-codebase-eval-results.md`
  - Pass: exactly this sequence:
    - `## Scores per prompt`
    - `### Prompt 1: design FMEA of a checkout service with a payment gateway and a pricing service`
    - `### Prompt 6: convert a legacy RPN sheet`
    - `### Prompt 7: update after an architecture change`
    - `## Stability between runs`
    - `## Overall per prompt and model capability`
    - `## Unverified units`
    - `## Checks that could not be evaluated`. The pre-ruling rosters are keyed on opus and sonnet and reach no high run, as in the element-kinds note.
    - `## Session checks`, with 13 `### ` subsections (in the hand-written form when B3 was declined, placed at the end)
    - `## Prompts not re-run`
    - `## Completeness critic`
    - `### Missing`
    - `### Blocking candidates`
  - Any other heading is not expected, such as `## Scores recorded before …`, `### What the critic's lists predate` or `### What the critic ran before`. Read it, and report it to the user before going on.

- [ ] **Step 3: Read the 0.6.0 chain counts.**
  - Run: `for n in 1 2; do node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).chains.length)}catch{console.log("none")}' build/evals/multi-codebase/p1/high/run$n/analysis.json; done`
  - Call the two numbers `<a>` and `<b>`.
  - A run that prints `none` wrote no analysis. Leave the 0.6.0 clause out of Steps 4-5, and say so in the commit body.

- [ ] **Step 4: Rewrite the chain-count sentence.**
  - `Each failure chain carries three ratings, and the four test runs of a new analysis wrote between 12 and 18 chains.` becomes `Each failure chain carries three ratings. The four test runs of a new analysis at version 0.1.0 wrote between 12 and 18 chains, and the two at version 0.6.0 wrote <a> and <b>.`
  - When `<a>` equals `<b>`, the sentence ends `and the two at version 0.6.0 wrote <a> each.`

- [ ] **Step 5: Rewrite the variance bullet.** `- Results vary between runs. The same inputs gave 12 failure chains in one run and 18 in another.` becomes `- Results vary between runs. At version 0.1.0 the same inputs gave 12 failure chains in one run and 18 in another, and at version 0.6.0 <a> and <b>.`

- [ ] **Step 6: Update the status section.**
  - In the sentence `The evaluation of its skill ran on version 0.1.0, and that version did not pass its own acceptance gate.`, change `The evaluation` to `The full evaluation` (plan A's decision 16; if declined, leave the sentence).
  - After the paragraph ending `The addendum of the acceptance note gives the details.` and before `Known limitations:`, add this paragraph. This keeps the 0.1.0 account together:

```
Version 0.6.0 ran three of the four prompts again, twice each at high: the new analysis, the conversion of a legacy RPN sheet and the update after an architecture change. <outcome>. Postmortem seeding did not run again and has no result at 0.6.0. Four checks in a session also tried the migration of an older analysis and the update rules on dependencies and codebases. The [multi-codebase eval results](docs/specs/2026-10-08-multi-codebase-eval-results.md) give the scores, the checks and what stayed unverified.
```

  - Fill `<outcome>` from the note's Overall table:
    - `<k> of the three passed: <names>`, or `None of the three passed`;
    - add `; <names> <is|are> unverified` for an UNVERIFIED row;
    - the names are "the new analysis", "the conversion" and "the update".
  - In the bullet `- The tested runs used glm-5.3 and glm-5.3-flash, not Anthropic models.`:
    - change `The tested runs` to `The 0.1.0 runs` (decision 16; if declined, leave the bullet and put the model sentence at the end of the new paragraph instead);
    - append ` The 0.6.0 runs used <model>, the model that models.json records for high.`, taking `<model>` from `build/evals/multi-codebase/p1/high/run1/models.json`.

- [ ] **Step 7: Have one Fable judge read the note.** Brief one subagent on Fable. It is the plan's one Fable gate for plan B. The brief says:
  - Read docs/specs/2026-10-08-multi-codebase-eval-results.md, build/evals/multi-codebase/results.json and build/evals/multi-codebase/session-checks.json. Open the evidence under build/evals/multi-codebase/session/ that a clause's detail cites.
  - Read them against §19 items 6 and 8 of docs/specs/2026-10-08-multi-codebase-design.md, and against §16's clause lists for the session checks.
  - For each requirement of items 6 and 8, return present, missing or misreported, citing the note's heading and line.
  - Name every clause recorded `pass` that its cited evidence does not support.
  - Name every check, run, branch or residual item that item 6 requires and the note lacks.
  - Write nothing and make no commits.

  Act on what it returns:
  - A missing record goes into session-checks.json and, when B3 was accepted, into results.json, as `unverified` if its run did not happen. Then repeat Steps 1-2.
  - The judge is not run again.
  - Its findings go to the user unchanged.

- [ ] **Step 8: Run both runners**, after any regeneration in Step 7.
  - Run: `bun tools/run-tests.ts`, then `bun tools/check.ts`.
  - Pass: both exit 0, and tools/check.test.ts still finds the README's link to `https://nzneit.github.io/failwise/`.
  - A runner that dies means unverified: do not commit.

- [ ] **Step 9: Commit.** Add no attribution trailer of any kind.
  - `git add docs/specs/2026-10-08-multi-codebase-eval-results.md README.md`
  - `git commit -m "Evals: the multi-codebase results, prompts 1, 6 and 7 under rubric 3, with the session checks" -m "The note is generated from build/evals/multi-codebase/results.json and records the session checks, what stayed unverified, and prompt 5 as not re-run. The README's chain counts, variance and status paragraphs name the 0.6.0 runs beside the unchanged 0.1.0 account."`

- [ ] **Step 10: Stop at the user's acceptance gate.** Report to the user:
  - the note's path;
  - the Overall table;
  - every `FAIL` and `UNVERIFIED` line;
  - the Fable judge's findings, verbatim;
  - each phase's tier, and that one Fable agent ran in plan B.

  Do not start B7 until the user has ruled.

### Task B7: Three-engine gate, comparison and the pull request body

**Files:**
- None in this repository.
- Create: /home/nn/Projects/fmea-software/.claude/worktrees/multi-codebase/docs/fmea/multi-codebase/pr.md (in failwise-research, uncommitted)

**Interfaces:**
- Consumes:
  - groupStems (A14): the group parts `group-checkout` and `group-pricing` in the comparison and the screenshots;
  - the render markup (A12/A13): `section.group[id="group-<root id>"]` and `row-ch-9`;
  - `node tools/check-browser.ts [--fetch] --engines <list>`, `node tools/compare.ts` and `node tools/shots.ts`.
- Produces: pr.md, for the maintainer to open the pull request from.

- [ ] **Step 1: Check the preconditions.**
  - The user ruled at B6's acceptance gate.
  - `git status --short` prints nothing.
  - `git log --format=%s main..multi-codebase` lists the commits of plans A and B.

- [ ] **Step 2: Run both runners on the final branch.**
  - Run: `bun tools/run-tests.ts`, then `bun tools/check.ts`.
  - Record each exit status, and for each suite its `# tests`, `# pass` and `# fail` lines.
  - Pass: both exit 0.
  - A non-zero exit, or a runner that dies or prints nothing, is recorded as UNVERIFIED with its last output line. Stop and report it to the user.
  - pr.md's runner line is filled from this step alone.

- [ ] **Step 3: Fetch the browsers.**
  - Run: `node tools/check-browser.ts --fetch --engines chromium,firefox,webkit`
  - Pass: exit 0.

- [ ] **Step 4: Run the three-engine gate.**
  - Run: `node tools/check-browser.ts --engines chromium,firefox,webkit`
  - Pass: exit 0, and a `## gate: playwright test over` line naming the three engines. No `## not run here` line and no `## not asserted` line may appear, since both lists stay empty.
  - A run that is skipped, dies or prints nothing is recorded as UNVERIFIED with its last output line, never as a pass.
  - A failing check is a finding: stop and report it to the user.

- [ ] **Step 5: Run the comparison against main.**
  - Run: `node tools/compare.ts`
  - Pass: exit 0, and build/compare/summary.md is written.
  - Read summary.md. It must match the design's browser checks:
    - changed views only in `header`, `structure`, `index`, row parts and `lints`;
    - `## Parts added` lists `group-checkout`, `group-pricing` and `row-ch-9`;
    - no `## Parts removed`.
  - Any other changed part is a finding: stop and report it.

- [ ] **Step 6: Take the screenshots.**
  - Run: `node tools/shots.ts`
  - Pass: exit 0, a `## shots: <n> files under build/shots/` line, and no `error UNVERIFIED:` line.

- [ ] **Step 7: Look at every image and write a verdict for each.**
  - For each changed view in summary.md, read `build/compare/changed/chromium/<view>/<part>.before.png`, `.after.png` and `.diff.png`.
  - For each width, read `build/shots/chromium/<width>/row-NN-ch-9.png` and every `group-checkout*.png` and `group-pricing*.png`.
  - Write one verdict line per part, for example "the Codebases row appears after Security boundary; nothing else moved".
  - An unintended change is a finding.

- [ ] **Step 8: Measure the group heights at 320 px.**
  - Run: `file build/shots/chromium/320/group-*.png`
  - Record, for each group, the number of `-pN` pieces and their summed pixel height. Each PNG reports its size as `W x H`.

- [ ] **Step 9: Make the research worktree.**
  - Run: `git -C /home/nn/Projects/fmea-software branch --list multi-codebase`. It must print nothing.
  - Then run: `git -C /home/nn/Projects/fmea-software worktree add .claude/worktrees/multi-codebase -b multi-codebase && mkdir -p /home/nn/Projects/fmea-software/.claude/worktrees/multi-codebase/docs/fmea/multi-codebase`

- [ ] **Step 10: Write pr.md.**
  - Fill every `<...>` from the steps above and from the session records.
  - pr.md carries no attribution line of any kind.

```
Read the diff: https://revision.city/diffs/nzneit/failwise/compare/main...multi-codebase

## Purpose

Schema v3 lets one analysis run over several services and repositories. Dependencies are edges from a consumer to a provider, each element may name its codebase, and a cause may link to the chain whose failure mode it is. The design is `docs/specs/2026-10-08-multi-codebase-design.md`.

Ownership, as the design's head records it on 2026-10-08: one team owns the analysis over the whole flow, and the teams that own the services review their rows, re-score their ratings and own their actions inside it. Updating one codebase alone and a tracker target per team, the first two items of the design's §17, stay later work under that arrangement.

## Changes

<one bullet per commit subject from `git log --format=%s main..multi-codebase`>

## Effect on users

<three to five sentences from docs/scripts.md's 0.6.0 compatibility paragraph: the DEPENDENCY_LEGACY refusal and the "Migrate a v2 document" section, KIND_LEGACY running both migrations, update-check.ts as the script an update runs>

## Verification

- `node tools/run-tests.ts`: <tests> tests, <pass> pass, <fail> fail, exit <n>. `node tools/check.ts`: exit <n>. (Step 2; UNVERIFIED with its reason where it did not complete.)
- Browser gate on chromium, firefox and webkit: <exit 0 | UNVERIFIED: reason>.
- Comparison against main (<merge-base short sha>): <views compared>, <views changed>. Each changed part, with its verdict:
  - `<part>` (<views>): <verdict>
- Parts added, judged from the screenshots of `node tools/shots.ts`:
  - `row-ch-9`: <verdict>
  - `group-checkout`: <verdict>
  - `group-pricing`: <verdict>
- At 320 px, `group-checkout` is <h> px in <k> pieces and `group-pricing` <h> px in <k>. Later comparisons report a change to a row under both the row and its group, because the group's photograph contains its rows.
- Evals: [the multi-codebase results](docs/specs/2026-10-08-multi-codebase-eval-results.md). <the Overall table outcome per prompt>; prompt 5 not re-run; the session checks' fail and unverified lines; the user's ruling at the acceptance gate: <ruling>.
- Public audit (`tools/public-audit.ts` in failwise-research, run by the maintainer on this branch): <closing summary line, pasted by the maintainer>
- Models: <each phase and its tier, from the run records>. Fable agents: <n> (<which gate each served>).

## Known limits

- <each unverified clause of the note's "What stays prose" and "Migration branches not exercised" checks>
- One analysis has one owner and one tracker target; updating one codebase alone and a tracker per team are later work.
```

- [ ] **Step 11: Check pr.md.** `<pr.md>` below is the full path from **Files**.
  - Run: `head -1 /home/nn/Projects/fmea-software/.claude/worktrees/multi-codebase/docs/fmea/multi-codebase/pr.md`
  - Pass: it prints `Read the diff: https://revision.city/diffs/nzneit/failwise/compare/main...multi-codebase`.
  - `grep -n 'Co-Authored\|Generated with\|claude.ai/code' <pr.md>` prints nothing.
  - `grep -n '<' <pr.md>` shows only the audit placeholder.

- [ ] **Step 12: Hand over.** Tell the user:
  - pr.md's path;
  - that the maintainer runs `tools/public-audit.ts` in failwise-research on the branch and pastes only its closing summary line into the placeholder, never a hit line;
  - that nothing was pushed and no pull request was opened.

  This task makes no commit in either repository.
