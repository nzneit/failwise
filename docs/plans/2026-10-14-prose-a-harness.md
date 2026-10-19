# Prose Implementation Plan, part A: the harness and the baseline round (stage 0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an unattended eval run isolated, measured and gated: the user's `~/.claude` stays out of every run, each run records the context window it ran under and whether it compacted, a compacted or unrecorded run is unverified at judging, the prompt-6 flows predicate is `not_applicable`, and the baseline round of the current text is recorded under that harness.

**Architecture:** Four changes to the tracked harness, each test-first, then one round. `tools/eval-stability.ts` gains the `not_applicable` state and a flag, which `tools/workflows/evals.js` passes for prompt 6 (A1). `tools/run-eval.sh` gains a fresh `CLAUDE_CONFIG_DIR` per run with a dated preflight (A2), a per-model window table and the `/autocompact` probe gate (A3), and a call to the new `tools/eval-context.ts`, which writes `context.json` from the transcript through a parser shared with `tools/eval-invocations.ts` (A4). The judging workflows gate on `context.json` in code and `tools/eval-report.ts` prints what it records (A5). A6 runs the 16-run baseline round and writes its note. Parts B and C, `2026-10-14-prose-b-behaviour.md` and `2026-10-14-prose-c-readability.md`, are stages 1 and 2 of the same spec; each ends at a user gate.

**Tech Stack:** Bash for `tools/run-eval.sh` (run end to end by its test with a stubbed `claude` first on PATH), TypeScript run directly by Node 24.2 or later (`node:test`, `node:assert/strict`), plain JavaScript Workflow scripts under `tools/workflows/` (no filesystem access, no tests), the dev checkers `tsc`, `oxlint` and `fallow` through `tools/check.ts`.

**Spec:** `docs/specs/2026-10-14-prose-design.md` at commit 7506ffe on branch `prose` (worktree `/home/nn/Projects/failwise/.claude/worktrees/prose`, stacked on `flow-model` at 97261fc). The plan argues from the spec and quotes it as §N; executors read both. All paths in this plan are relative to the worktree root unless written absolute; the main checkout's gitignored trees (`/home/nn/Projects/failwise/build/`, `/home/nn/Projects/failwise/.superpowers/`) are always written absolute and are read only. Sections 5 and 8.2 of the spec are this plan's scope; D11 (the window gate moves into the tracked harness) and D4 (rubric 4 frozen after the one `not_applicable` amendment) are the decisions it implements.

## How to read this plan

- Tasks A1 to A6 run in order on branch `prose`. Task ids are the only names used across tasks; each task's **Interfaces** block names what it consumes from earlier tasks and what later tasks rely on, with exact signatures.
- The three plan files are committed on `prose` before A1 begins, so the clean-tree checks hold. The plan files are not edited during execution; progress, the gate verdicts and every deviation are tracked in the controller's ledger.
- Line numbers in **Files** blocks are those of commit 7506ffe. Earlier tasks shift them, so every edit also quotes the anchor text to find.
- The implementing agent's Bash tool runs zsh and, in a worktree session, refuses `source` (and `.`), `PATH=` prefixes and `cd` into another checkout. Run the suites as `bun tools/run-tests.ts` and `bun tools/check.ts` (both find Node 24 through nvm); run a single TypeScript tool with nvm's node by absolute path, `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/<name>.ts …`; run every script that needs the gateway key as `bash /home/nn/Projects/failwise/.claude/worktrees/prose/.superpowers/sdd/2026-10-14-prose/<script>.sh …`, where the script loads the key itself. None of these is a user-facing command; the shipped documents keep the forms `CLAUDE.md` prescribes.
- A Workflow script cannot be checked with `node --check` (its top-level `return` is a syntax error outside the harness). The compile check this plan uses, verified on both scripts at 7506ffe, is:
  ```
  /home/nn/.nvm/versions/node/v24.17.0/bin/node -e "const fs=require('fs');const src=fs.readFileSync(process.argv[1],'utf8').replace(/^export /m,'');new (Object.getPrototypeOf(async function(){}).constructor)('args','agent','pipeline','parallel','phase','log',src);console.log('parsed')" <absolute path of the script>
  ```
  Expected output: `parsed`, exit 0. A syntax error is reported two lines below the file's own line, because the constructor adds a two-line header.
- A step that says "watch it fail" names the failure it expects. A test that passes before the change is a regression pin and is named as such.
- No task in this plan changes the renderer, the template or the golden fixture, so no task runs the browser checks.
- Model tiering (§9): A1 to A5 run on Opus, one Opus implementer and one Opus reviewer per task, test-first. A6's gate is the controller's: the checks of §8.2 are mechanical. The judging in A6 runs the existing `evals.js` tiers, Opus judges and critic, Sonnet context, stability and persist. **No Fable subagent runs in this plan.** The report of each task names the tier of each phase and the Fable count.

## Global Constraints

Every task's requirements include this section.

- Runtime: Node 24.2 or later. Before every commit `bun tools/run-tests.ts` and `bun tools/check.ts` both exit 0. A runner that dies or is skipped counts as unverified, never as a pass.
- No dependency and no lockfile in the root `package.json`. Checkers live only in `dev/package.json`; nothing in this plan adds one.
- Every user-facing command behaves the same in bash and fish: no unquoted glob, no `source ~/.nvm/nvm.sh`, no `for` loop in a documented command. A round is one `env … tools/run-eval.sh` line per run inside a script, or one such line typed on its own.
- No AI attribution in any commit: no `Co-Authored-By` naming an AI, no "Generated with" line, no session trailer. Commits stay local; nothing is pushed by Claude. Every brief to a subagent that commits must say so.
- Verification fails closed: a run with no `context.json`, a `context.json` with `compactions` above 0, a transcript line that is not JSON, a missing probe line, a judge that returned nothing, a preflight that dies, each is recorded as unverified and never as a pass or a 0.
- `tools/` imports nothing from `skills/fmea-software/scripts/` (the skill stays self-contained); shared helpers for `tools/*.ts` live in `tools/lib/`, as `host.ts` does.
- The DeepSeek key is never printed, never written under the repository or its scratch trees, and never typed at the Bash tool: a script reads it from the login keyring, `secret-tool search --all service goose`, the `secret = ` line parsed as JSON and its `DEEPSEEK_API_KEY` taken, exactly as `/home/nn/Projects/failwise/.superpowers/sdd/2026-10-12-flow-model/run-one.sh:6-7` does, and refuses before any model call when the result is empty. Nothing searches the machine for a key by any other route.
- Exact values this plan ships, quoted from the spec:
  - the flows state: `not_applicable`, set from a per-prompt flag the workflow passes, for prompt **6** only (§5.2, ruling 4 of 2026-10-13); the rubric stays **4**.
  - the per-model table row for `deepseek-flash`: `CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432`, `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000`, probe text `786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)` (§5.3). A model with no row gets **neither** setting, whatever the launcher's environment carries.
  - the probe: `claude -p "/autocompact" --model <model> --max-turns 1` under the run's `CLAUDE_CONFIG_DIR` and environment, stdout and stderr together; the gate reads the first line containing `auto-compact window for`, case-insensitive, and refuses when that line is absent, contains `capped`, or, for a model with a row, does not contain the row's text (§5.3).
  - `context.json` fields (§5.3): the two settings or their absence, the probe line verbatim, `compactions` = the count of transcript system lines with `"subtype":"compact_boundary"`, `peak_context_tokens` = the maximum over assistant lines whose `parent_tool_use_id` is unset of `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. Measured on the 0.7.0 transcripts on 2026-10-14: p1/medium/run2 of the uncapped round gives **238,429** and **0** compactions over 115 top-level assistant lines; p1/medium/run2 of the capped round gives **2** compactions and **164,409** over 126 top-level lines, 33 subagent lines left out.
  - the two lint ids `context.json` counts, from part B: `edge-reliability-unstated` and `conversion-substitution-unrecorded` (§6.4); in this plan their counts are 0.
  - the §8.2 pass line, per run: `invocations.json` and `context.json` present with `compactions: 0`; isolation read from the transcript's init line as decision 6 defines it; no script call denied for the `bun` reason; the prompt-6 stability entries `not_applicable`. The secondary leak grep and the denials of any other reason are reported, not gated.
  - the round (§8.1): prompts **1, 5, 6, 7** at **high** and **medium**, two runs each, **16** runs, `FMEA_EVAL_MODELS='high=deepseek-flash,medium=deepseek-flash'`, effort high; round directory `build/evals/prose-0/`; note `docs/specs/2026-10-14-prose-eval-results-0.md`.
  - the sections every round's note carries by hand after `tools/eval-report.ts` generates it, re-appended after every regeneration: `## What this round cannot separate` (the §8.5 text of A6 Step 5, verbatim in every stage's note), `## Secondary leak grep`, `## Bundled skills` and, from part B on, `## Warnings the final documents carry`. A note served without them is incomplete.
- Test style: top-level `test("<sentence naming the rule first>", () => {...})` from `node:test`, `import assert from "node:assert/strict"`, no describe blocks. Tests for `tools/x.ts` live flat in `tools/x.test.ts`; `tools/run-tests.ts` finds every `*.test.ts` under `tools/` by itself.
- fallow (`.fallowrc.json`): entries are `skills/fmea-software/scripts/*.ts`, `tools/*.ts` and `dev/browser/*.ts` with `includeEntryExports: true`, so a new `tools/*.ts` file exports a value only when another file imports it in the same task; `tools/workflows/**` is ignored. Duplicates threshold 0.01, so a copied helper fails the gate; health maxCyclomatic 20, maxCognitive 15, `complexity-cyclomatic` and `complexity-cognitive` at error. Build each multi-output function from small private helpers.
- tsc: strict, noEmit, module nodenext, `allowImportingTsExtensions` (imports carry `.ts`), `erasableSyntaxOnly` (no enum, no parameter properties), `verbatimModuleSyntax` (type-only imports use `import type`).
- Coded failure lines: every tool failure is one stderr line `error <CODE>: <message>` with whitespace runs collapsed, as `tools/eval-invocations.ts`'s `refuse` and `tools/eval-stability.ts`'s `fail` print them; exit 1 for USAGE and 3 for IO_READ.
- Commit subject style: `<Area>: <lower-case clause>` or a plain sentence, no trailing period, no `(#NN)`. The body is prose wrapped near 72 columns, written through `git commit -F- <<'EOF'`.

## Review Focus

Five conditions the spec implies but no task's own tests name first. Each line gives the behaviour a reasonable person would expect and the task whose tests pin it.

1. **A transcript with no init line** (a CLI release that changes the stream). `context.json` records `init.present: false`; the Harness table prints `no (no init line)` under Isolated, and A6 Step 5 reads that run as not isolated and unverified, never as isolated by default. A4 pins `init.present`; A5 pins the cell.
2. **A launcher environment that already carries the window settings** for a model with no table row. The harness unsets both before the probe and the run, so the table is the only source; the stub's recorded environment shows neither. A3 pins it.
3. **A probe reply on stderr, or in another case, or with text but no window line.** The harness reads stdout and stderr together, matches `auto-compact window for` case-insensitively, and prints the reply on stderr before it refuses, because the trap removes the work directory. A3 pins the stderr variant and the text-without-line variant.
4. **A results file from before this change** (`build/evals/flow-model/results.json`). It renders exactly as before: no Harness section, the Flows column's old tri-state accepted, no new IO_READ line. A1 and A5 pin both directions.
5. **A run whose `tools/eval-context.ts` fails** (a transcript line that is not JSON, or no `autocompact.txt`). No `context.json` is written, the summary line says `context=missing`, and at judging the run is unverified with no scores and no judge call. A4 pins the exit and the absence. The gate itself lives in `evals.js` and `rejudge.js`, which have no tests: A5's sync-test pin holds the predicate's text in both files, and A6 Step 4 is its first live run.

## Decisions for the user at plan review

1. **The context gate fetches `context.json` through a Sonnet agent and reads it in code.** A Workflow script has no filesystem access (`tools/workflows/evals.js:10-11`, `:126-128`), so "reads `context.json` in code" (§5.3) is implemented as one medium-tier agent per run that returns the file's text verbatim (`{ exists, text }`), which the script parses with `JSON.parse` and checks field by field; a missing file, text that is not JSON, or a field missing or of the wrong type gates the run as unverified with a detail naming it, and `tools/eval-report.ts` reads the real file in code and prints a disagreement line when the copied values differ from it, so a fabricated or abridged copy cannot pass. Default: as written. Rejected alternatives: an agent returning four parsed fields (nothing in code would then read the file), and passing every run's context through `args` (a session script before every judging).
2. **Lint counts come from the full tool result in `transcript.jsonl`, not from `result_head`.** `result_head` is the first 400 characters of a call's result (`tools/eval-invocations.ts:56`, `RESULT_HEAD_CHARS`, applied at `:164`), and the two new lints are the last entries of `MACHINE_RULES`, so on a document with 17 lints their text sits past that head. A4 scans the `tool_result` blocks of the `validate.ts` calls `invocations.json` lists, those that ran and those that exited non-zero, since `validate.ts` prints its lints on exit 2 too. Default: as written.
3. **The summary line of `tools/run-eval.sh` gains `invocations=<present|missing> context=<present|missing>`**, so the operator sees at once which runs can be judged; the five pinned regexes in `tools/run-eval.test.ts` move with it. Default: add both.
4. **Three plan files, one per stage, each ending at a user gate**, after the precedent of `2026-10-12-flow-model.md` and `2026-10-12-flow-model-evals.md`. Part C's prose tasks are specified by section and procedure, because their text is stage 2's drafting work. Default: three files.
5. **`eval-report.ts` reads each run's `context.json` from `runs[].dir` for the Harness table's isolation, denial and lint columns**, and prints the window, compactions and peak from the copy in `results.json`. Default: as written; the alternative copies the whole file into `results.json` through the Sonnet agent.
6. **What "exactly the plugin under test" and "exactly `failwise:fmea-software`" mean (§5.1, §8.2).** The CLI's init line lists plugins the CLI itself bundles (at 2.1.296: `cc-plugin-agents-md@builtin`, `cc-plugin-telemetry@builtin`, `cc-plugin-plugin-authoring@builtin`, present in every 0.7.0 transcript) and may list skills the CLI bundles under no namespace; neither comes from `~/.claude`. A run is isolated when the plugins whose `source` does not end in `@builtin` are exactly `failwise`, the namespaced skills are exactly `failwise:fmea-software`, every unnamespaced skill is in the bundled set the preflight records from a probe without `--plugin-dir`, and `memory_paths.auto` lies under the run's `CLAUDE_CONFIG_DIR`. The first three and the last are printed by the Harness table; the bundled-set check is A6 Step 5's. Default: this reading.
7. **The transcript parser is shared through a new `tools/lib/transcript.ts`.** `tools/eval-context.ts` needs the line parser, the block and result helpers and the `refuse` printer of `tools/eval-invocations.ts`; a copy fails fallow's duplicates gate, and importing one CLI from another is the worse shape. Default: the shared module, with `eval-invocations.test.ts` as the regression pin.

## Assumptions the plan rests on

- `claude -p "/autocompact"` prints its window line in print mode under a fresh `CLAUDE_CONFIG_DIR` on the gateway route, and a `-p` run starts under a fresh, empty `CLAUDE_CONFIG_DIR` and authenticates through `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`. The dated preflight of A2 Step 6 settles both before A3's gate is relied on; if either fails, A2 stops and reports, and nothing is seeded into the directory on a guess.
- The transcript's init line carries `claude_code_version`, `plugins[]` (objects with `name`, `path`, `source`, `version`), `skills[]` (strings, namespaced as `<plugin>:<skill>` or bare) and `memory_paths.auto` (a path), as the 0.7.0 transcripts of CLI 2.1.296 do; assistant lines carry `parent_tool_use_id` and `message.usage` with `input_tokens`, `cache_read_input_tokens` and `cache_creation_input_tokens`; a compaction is a `system` line with `subtype: "compact_boundary"`. A4 Step 6 runs the tool on two real transcripts and stops on any figure that differs.
- `tools/workflows/evals.js` has not changed since commit 2fea11a, so its line numbers hold at 7506ffe (checked by the scouting of 2026-10-14).
- The key is in the login keyring under the `goose` service, as the flow-model round's `launch-round.sh:7` and `run-one.sh:6` read it; `~/.config/failwise/deepseek.env` does not exist. `python3` and `secret-tool` are on PATH.

---

### Task A1: The `not_applicable` flows state

**Files:**
- Modify: `tools/eval-stability.ts:16-17` (usage comment), `:44` (`FlowStability`), `:151-158` (`flowComparison`), `:160` (`stability`), `:181-182` (`pass`, `verified`), `:267-282` (`main` argv loop and usage text)
- Modify: `tools/eval-stability.test.ts:70-80` (the flows test), `:120-139` (CLI test), new tests beside them
- Modify: `skills/fmea-software/evals/rubric.md:232`, `:236`
- Modify: `tools/workflows/evals.js:218` (the `flows.pass` enum), `:324-334` (`stabilityPrompt`)
- Modify: `tools/eval-report.ts:493` (comment), `:1221-1224` (`isFlows`)
- Modify: `tools/eval-report.test.ts:287-296` (the Flows column test), `:305-355` (the CRITERIA sync test)

**Interfaces:**
- Consumes: nothing from this plan.
- Produces: `export type FlowStability = "pass" | "fail" | "unverified" | "not_applicable"`; `export function stability(run1: FmeaDocument, run2: FmeaDocument, vocabulary: string[], flowsNotApplicable = false): Stability`; the CLI flag `--flows-not-applicable` (boolean, no value); in `evals.js` the constant `const FLOWS_NOT_APPLICABLE_PROMPTS = [6]` and the enum value `'not_applicable'` in `STABILITY_SCHEMA`. A5's Harness table reads `stability[].flows.pass` as this four-state string.

- [ ] **Step 1: Write the failing unit test**

In `tools/eval-stability.test.ts`, after the test at line 70 ("flows: the id sets agree at the 0.8 floor, one empty side fails, both empty is unverified"):

```ts
test("flows not applicable: the predicate reports not_applicable whatever the runs carry, the pair stays verified, and pass is the element and count predicates alone", () => {
  const one = { ...doc(["a"], ["L"]), flows: [{ id: "f1" }] };
  const none = { ...doc(["a"], ["L"]), flows: [] };
  const mixed = stability(one, none, VOCAB, true);
  assert.deepEqual([mixed.flows, mixed.verified, mixed.pass], [{ jaccard: 0, pass: "not_applicable" }, true, true]);
  const empty = stability(none, none, VOCAB, true);
  assert.deepEqual([empty.flows, empty.verified, empty.pass], [{ jaccard: 1, pass: "not_applicable" }, true, true]);
  const unstable = stability(doc(["a"], ["H"]), doc(["b"], ["H"]), VOCAB, true);
  assert.deepEqual([unstable.flows.pass, unstable.verified, unstable.pass], ["not_applicable", true, false]);
  const applicable = stability(one, none, VOCAB);
  assert.deepEqual([applicable.flows.pass, applicable.verified, applicable.pass], ["fail", true, false]);
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `bun tools/run-tests.ts`
Expected: the `tools` suite fails on the new test: `stability` ignores a fourth argument today, so `mixed.flows.pass` is `"fail"`, not `"not_applicable"`. (`bun tools/check.ts` reports `Expected 3 arguments, but got 4` from `tsc`.)

- [ ] **Step 3: Implement the state in `tools/eval-stability.ts`**

- `FlowStability` (line 44) gains `| "not_applicable"`, and the comment above `FlowComparison` (lines 46-50) gains one sentence: `not_applicable` means the prompt's inputs name no flows and the predicate was set aside by the caller's flag, so the pair is judged on the other two predicates.
- `flowComparison(run1, run2, notApplicable: boolean): FlowComparison`: when `notApplicable` is true, return `{ jaccard: j, pass: "not_applicable" }` with `j` the Jaccard the function already computes (1 for two empty sets), before the two emptiness checks.
- `stability(run1, run2, vocabulary, flowsNotApplicable = false)` passes the flag through; line 181 becomes `const pass = j >= JACCARD_MIN && Object.values(countDiffs).every((d) => d <= bound) && (flows.pass === "pass" || flows.pass === "not_applicable");`; line 182's `verified: flows.pass !== "unverified"` stays.
- `main`: a new branch `else if (argv[i] === "--flows-not-applicable") { flowsNotApplicable = true; }` before the `startsWith("--")` check; the usage string at line 281 and the header comment at line 16 become `usage: node tools/eval-stability.ts <run1.json> <run2.json> [--table-file path] [--flows-not-applicable]`; the call at line 296 passes the flag.

- [ ] **Step 4: Run the unit test to watch it pass**

Run: `bun tools/run-tests.ts`
Expected: PASS, including the regression pins at lines 70-80 (the applicable tri-state unchanged) and line 323 (`Object.keys(out)` unchanged).

- [ ] **Step 5: Write the failing CLI test and make it pass**

Extract the fixture of the test at line 120 into a helper both CLI tests call:

```ts
function cliFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "eval-stability-cli-"));
  writeFileSync(join(dir, "run1.json"), JSON.stringify(doc(["checkout", "checkout.pricing"], ["H", "M"])));
  writeFileSync(join(dir, "run2.json"), JSON.stringify(doc(["Checkout", "checkout.Pricing"], ["H", "L"])));
  writeFileSync(join(dir, "table.json"), JSON.stringify({ id: "t", vocabulary: VOCAB }));
  return dir;
}
```

The test at line 120 keeps its assertions and calls `cliFixture()` inside its own `try`/`finally` with `rmSync`. The new test:

```ts
test("CLI --flows-not-applicable reports the flows predicate not_applicable and keeps the other two", () => {
  const dir = cliFixture();
  try {
    const r = spawnSync(process.execPath, [join(import.meta.dirname, "eval-stability.ts"), join(dir, "run1.json"), join(dir, "run2.json"), "--table-file", join(dir, "table.json"), "--flows-not-applicable"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { jaccard: 1, maxRows: 2, countDiffs: { H: 0, M: 1, L: 1 }, bound: 0.4, pass: false, typing: { shared: 2, agreeing: 0, pass: false }, flows: { jaccard: 1, pass: "not_applicable" }, verified: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

Also extend the test at line 180 ("CLI exits 3 on JSON that is not a document … 1 on a flag misuse") with one assertion: `--flows-not-applicable` followed by a value, such as `--flows-not-applicable yes`, exits 1 with `error USAGE: usage: node tools/eval-stability.ts <run1.json> <run2.json> [--table-file path] [--flows-not-applicable]` on stderr, because `yes` is a third positional.

Run: `bun tools/run-tests.ts`. Expected: PASS.

- [ ] **Step 6: Write the failing pins in the CRITERIA sync test**

In `tools/eval-report.test.ts`, inside the test at line 305 ("CRITERIA matches the rubric: same ids in the same order, same must flags"): after the rubric pin at line 339 (`/\(Amended 2026-10-13, before any run was judged under rubric 4:/`), two rubric pins; after the `const RUBRIC = 4` pin at line 344, three workflow pins:

```ts
  assert.match(rubric, /passes when all three hold, or, on a prompt whose inputs name no flows, when the first two hold and the third is reported `not_applicable`:/);
  assert.match(rubric, /on a prompt whose inputs name no flows \(prompt 6\), the judging workflow passes `--flows-not-applicable`/);
```
```ts
  assert.match(workflow, /^const FLOWS_NOT_APPLICABLE_PROMPTS = \[6\]$/m);
  assert.match(workflow, /pass: \{ enum: \['pass', 'fail', 'unverified', 'not_applicable'\] \}/);
  assert.match(workflow, /node tools\/eval-stability\.ts \$\{a\} \$\{b\}\$\{FLOWS_NOT_APPLICABLE_PROMPTS\.includes\(pair\.prompt\) \? ' --flows-not-applicable' : ''\}/);
```

Run: `bun tools/run-tests.ts`. Expected: FAIL on the first rubric match (`The input did not match the regular expression`). They pass after Steps 7 and 8.

- [ ] **Step 7: Amend rubric 4's stability section**

`skills/fmea-software/evals/rubric.md:232` becomes:

> `tools/eval-stability.ts` compares run 1 and run 2 of a (prompt, model capability) pair and passes when all three hold, or, on a prompt whose inputs name no flows, when the first two hold and the third is reported `not_applicable`:

and line 236 gains, after `and one side carrying none is a `fail``, before the final period:

> ; on a prompt whose inputs name no flows (prompt 6), the judging workflow passes `--flows-not-applicable` and the predicate is reported `not_applicable` whatever the two runs carry, so the pair is judged on the element and count predicates (ruling 4 of 2026-10-13, amended 2026-10-14 before the prose rounds; this stays rubric 4)

- [ ] **Step 8: Pass the flag from `tools/workflows/evals.js`**

- Line 218: `pass: { enum: ['pass', 'fail', 'unverified', 'not_applicable'] }`.
- Above `stabilityPrompt` (line 324): `// Ruling 4 of 2026-10-13: on a prompt whose inputs name no flows the flows predicate is not applicable and the pair is judged on the element and count predicates; the flag is per prompt, whatever the runs carry.` and `const FLOWS_NOT_APPLICABLE_PROMPTS = [6]`.
- In `stabilityPrompt`, the command line (line 329) becomes `cd ${ROOT} && node tools/eval-stability.ts ${a} ${b}${FLOWS_NOT_APPLICABLE_PROMPTS.includes(pair.prompt) ? ' --flows-not-applicable' : ''}`.
- Line 333's sentence `flows is {jaccard, pass}: … and one side carrying none is a fail; verified is false exactly when flows is unverified.` gains, before `verified is false`: `on prompt 6 the command carries --flows-not-applicable and flows.pass is not_applicable, which is verified and does not fail the pair;`.
- The header comment (lines 1-31) gains one sentence naming the flag and the ruling.

Run: the compile check of "How to read this plan" on `/home/nn/Projects/failwise/.claude/worktrees/prose/tools/workflows/evals.js`. Expected: `parsed`. Then `bun tools/run-tests.ts`. Expected: the sync test's five pins pass.

- [ ] **Step 9: Accept the state in `tools/eval-report.ts` and pin it**

Test first, in `tools/eval-report.test.ts` inside the test at line 287 ("the stability table gains a Flows column only when an entry carries flows, and reads the tri-state"), after the existing assertions (`r` is in scope; `sampleResults()` gives `stability[1]` a Jaccard of 0.6, 7 max rows, bound 1.4 and count diffs H 2, M 0, L 2):

```ts
  r.stability[1] = { ...r.stability[1], flows: { jaccard: 1, pass: "not_applicable" }, verified: true, pass: true, unverified: false };
  const applicable = renderReport(r);
  assert.match(applicable, /\| 1 \| medium \| 0\.600 \| 7 \| 1\.400 \| H: 2, M: 0, L: 2 \| 1\.000 not_applicable \| pass \|/);
  const run = reportOn(JSON.stringify(r), "eval-report-not-applicable-");
  assert.equal(run.status, 0, run.stderr);
```

Run `bun tools/run-tests.ts`; expected: the `renderReport` match passes already (a regression pin: the renderer prints any flows string) and `assert.equal(run.status, 0)` fails, because the CLI's `resultsProblem` exits 3 with `error IO_READ: … has a stability flows that is not {jaccard, pass} at stability[1]`. Then `isFlows` (lines 1222-1224) accepts `f.pass === "not_applicable"`, and the comment at line 493 reads `tri-state plus not_applicable: pass, fail, unverified or not_applicable (eval-stability.ts)`. Run again; expected: PASS, with the test at line 298 (`"maybe"` refused) still passing.

- [ ] **Step 10: Run both runners and commit**

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0.

```bash
git add tools/eval-stability.ts tools/eval-stability.test.ts skills/fmea-software/evals/rubric.md tools/workflows/evals.js tools/eval-report.ts tools/eval-report.test.ts
git commit -F- <<'EOF'
Evals: the flows stability predicate is not_applicable on a prompt whose inputs name no flows

Ruling 4 of 2026-10-13: on prompt 6 the pair is judged on the element and
count predicates. tools/eval-stability.ts takes --flows-not-applicable,
evals.js passes it for prompt 6, rubric 4's stability section says so
(rubric stays 4), eval-report.ts prints the state, and the CRITERIA sync
test pins the constant, the enum, the command and the rubric clause.
EOF
```

---

### Task A2: A fresh `CLAUDE_CONFIG_DIR` per run, with its dated preflight

**Files:**
- Modify: `tools/run-eval.sh:1-62` (header), `:213-219` (`CONFIG=""` beside `WORK=""` and `PLUGIN=""`, and `cleanup()`), after `:221` (the `CONFIG` mktemp, then the comment block and `export CLAUDE_CONFIG_DIR`; line 77, `# preflight 2026-09-11: …`, is the model for the dated line and is not changed)
- Modify: `tools/run-eval.test.ts:62-70` (`Sandbox`), `:78-114` (`sandbox` and the stub), new test beside line 148
- Modify: `CONTRIBUTING.md:167-169` (the last paragraph of `## Evals`)
- Create (gitignored): `.superpowers/sdd/2026-10-14-prose/preflight.sh`

**Interfaces:**
- Consumes: nothing from this plan.
- Produces: the shell variable `CONFIG` (the run's `CLAUDE_CONFIG_DIR`, a sibling of `WORK` and `PLUGIN` under `$TMPDIR`), exported as `CLAUDE_CONFIG_DIR` before the probe (A3) and the run; the `Sandbox` fields `configFile` and `configListFile` A3 and A4 reuse; the stub records `CLAUDE_CONFIG_DIR` and `ls -A` of it; the preflight's report, `.superpowers/sdd/2026-10-14-prose/preflight/report.txt`, whose `bundled_skills` line A6 Step 5 reads.

- [ ] **Step 1: Extend the stub and write the failing test**

In `sandbox()`, add `configFile = join(dir, "config.txt")` and `configListFile = join(dir, "config-list.txt")` to the `Sandbox` interface and return value, and two stub lines after `` `pwd > '${cwdFile}'` ``, written as plain double-quoted JavaScript strings with the paths concatenated in (a bash `${…}` inside a template literal is a JavaScript syntax error; the strings reach bash unexpanded):

```ts
    "printf '%s\\n' \"${CLAUDE_CONFIG_DIR:-}\" > '" + configFile + "'",
    "if [ -n \"${CLAUDE_CONFIG_DIR:-}\" ]; then ls -A \"$CLAUDE_CONFIG_DIR\" > '" + configListFile + "'; fi",
```

New test after line 190:

```ts
test("the run gets a fresh, empty CLAUDE_CONFIG_DIR under its own TMPDIR, never ~/.claude, and the trap clears it", { skip: SKIP }, () => {
  const s = sandbox();
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "medium", "1"], { cwd: ROOT, env: { ...s.env, CLAUDE_CONFIG_DIR: join(homedir(), ".claude") }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const configDir = readFileSync(s.configFile, "utf8").trim();
    assert.ok(configDir.startsWith(s.tmp + sep), `CLAUDE_CONFIG_DIR is not under the run's TMPDIR: ${configDir}`);
    assert.ok(!configDir.startsWith(join(homedir(), ".claude")), `CLAUDE_CONFIG_DIR is the user's own: ${configDir}`);
    assert.ok(!configDir.startsWith(ROOT + sep), `CLAUDE_CONFIG_DIR is inside the repository: ${configDir}`);
    assert.equal(readFileSync(s.configListFile, "utf8"), "", "the harness put files into CLAUDE_CONFIG_DIR before the launch: it copies nothing in (what the CLI itself leaves there after a probe is the preflight's record)");
    assert.ok(!existsSync(configDir), `the config directory survived the run: ${configDir}`);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});
```

`homedir` is imported from `node:os` beside `tmpdir`.

- [ ] **Step 2: Run it to watch it fail**

Run: `bun tools/run-tests.ts`
Expected: FAIL at the first `assert.ok`: `CLAUDE_CONFIG_DIR is not under the run's TMPDIR: /home/<user>/.claude` (the launcher's value reaches the stub unchanged today).

- [ ] **Step 3: Make the directory in `tools/run-eval.sh`**

- `CONFIG=""` beside `WORK=""` and `PLUGIN=""`; `cleanup()` gains `if [ -n "$CONFIG" ]; then rm -rf "$CONFIG"; fi`; after the `PLUGIN` mktemp (line 221): `CONFIG="$(mktemp -d "${TMPDIR:-/tmp}/fmea-config-p${PID}-${MODEL_CAPABILITY}-run${RUN}-XXXXXX")"`.
- Immediately after it, this block, whose last comment line is the dated preflight record Step 6 fills in, in the form of line 77:

```bash
# The user's own ~/.claude stays out of the run: CLAUDE_CONFIG_DIR is a fresh,
# empty directory made for this run (prose design 2026-10-14 §5.1). Nothing is
# copied into it. The plugin under test arrives through --plugin-dir, and the
# gateway route is the launcher's ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN,
# which this directory does not touch; a Claude-model run needs
# ANTHROPIC_API_KEY in the environment instead. In the 0.7.0 round, run
# without this, eleven of twelve transcripts quoted or applied ~/.claude/CLAUDE.md.
# The CLI still lists the plugins it bundles (source *@builtin) and the skills
# it bundles under no namespace; neither comes from ~/.claude.
# preflight YYYY-MM-DD: <finding>
export CLAUDE_CONFIG_DIR="$CONFIG"
```

- The header comment (lines 1-62) gains one sentence after the `--plugin-dir` paragraph: the run's `CLAUDE_CONFIG_DIR` is a fresh directory under `$TMPDIR`, removed by the trap.

- [ ] **Step 4: Run the test to watch it pass**

Run: `bun tools/run-tests.ts`
Expected: PASS, and the first test's `readdirSync(s.tmp).filter((n) => n.startsWith("fmea-"))` still deep-equals `[]` (the config directory is removed too).

- [ ] **Step 5: The contributor document, then both runners**

`CONTRIBUTING.md:167-169`: keep the paragraph's first sentence ("Sixteen unattended runs and their judging spend real model time and money.") and replace the rest with: `Each run gets a fresh, empty `CLAUDE_CONFIG_DIR` under `$TMPDIR`, which the run removes when it ends, so the runner's `~/.claude` (its CLAUDE.md, memory, skills, settings and login) stays out of the run. A run on the default Anthropic table therefore needs `ANTHROPIC_API_KEY` in the environment; a model behind a gateway needs `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`. A run still grants Read with no path restriction, so run it from a machine and with keys you are content to expose.` Lines 155-166 stay as they are.

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0.

- [ ] **Step 6: The dated preflight (needs the gateway and the key; no commit before it is recorded)**

Write the untracked `.superpowers/sdd/2026-10-14-prose/preflight.sh` (the folder is ignored by `.gitignore:6`), `#!/usr/bin/env bash` with `set -euo pipefail`, which:

1. Reads the key as the Global Constraints say (the `secret-tool` line of `/home/nn/Projects/failwise/.superpowers/sdd/2026-10-12-flow-model/run-one.sh:6-7`), refuses with `NO KEY: refusing` and exit 1 when empty, and never prints it. Exports `ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"` and `ANTHROPIC_AUTH_TOKEN="$KEY"`. Puts the newest nvm Node first on PATH as `run-one.sh:22-25` does.
2. Makes a scratch directory `SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/fmea-preflight-XXXXXX")"` removed by an EXIT trap, and a report directory `.superpowers/sdd/2026-10-14-prose/preflight/` (kept) with `report.txt`.
3. Builds a filtered plugin copy under `$SCRATCH/plugin` with the five lines of `tools/run-eval.sh:241-245` (copy `.claude-plugin` and `skills/fmea-software`, remove `evals`, delete `*.test.ts`), rooted at the worktree.
4. Probe 1, under `CLAUDE_CONFIG_DIR="$SCRATCH/config1"` (made empty): `claude -p "Reply with the single word ok." --model deepseek-flash --max-turns 1 --plugin-dir "$SCRATCH/plugin" --add-dir "$SCRATCH/plugin" --output-format stream-json --verbose > "$SCRATCH/probe1.jsonl" 2> "$SCRATCH/probe1.err" || echo "probe1_exit=$?" >> report.txt`; then `ls -A "$SCRATCH/config1"` into the report, and a Python reader (`python3 -I - "$SCRATCH/probe1.jsonl" "$SCRATCH/config1" <<'PY' … PY`) that prints into the report: the CLI version; the names of the plugins whose `source` does not end in `@builtin`; the `@builtin` plugin names; the namespaced skills; the unnamespaced skills, sorted; `memory_paths.auto` and whether it starts with the config directory; `apiKeySource`; and the last line's `result`. A missing init line or a missing result line is printed as `MISSING` and makes the script exit 2 at the end.
5. Probe 2, under `CLAUDE_CONFIG_DIR="$SCRATCH/config2"`, the same command without `--plugin-dir` and `--add-dir`, read the same way: its unnamespaced skills are the bundled set, printed as `bundled_skills: <sorted, comma-separated>`, and its non-builtin plugins must be none.
6. Probe 3, under `CLAUDE_CONFIG_DIR="$SCRATCH/config3"` with `CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000` exported: `claude -p "/autocompact" --model deepseek-flash --max-turns 1 > "$SCRATCH/probe3.txt" 2>&1 || echo "probe3_exit=$?" >> report.txt`; then `grep -i -m1 "auto-compact window for" "$SCRATCH/probe3.txt" >> report.txt || echo "window_line: MISSING" >> report.txt`; then `ls -A "$SCRATCH/config3" >> report.txt`, what the CLI itself leaves in a fresh directory after a probe, which the dated comment names (the harness copies nothing in; the CLI's own state files are not `CLAUDE.md`, memory or skills).
7. Exits 0 only when probe 1 listed non-builtin plugins `failwise` alone and namespaced skills `failwise:fmea-software` alone, memory under its config directory, a result containing `ok`, probe 2 listed no non-builtin plugin, and probe 3's line contains `786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)` and not `capped`; otherwise exits 2 after writing the report.

Run: `bash /home/nn/Projects/failwise/.claude/worktrees/prose/.superpowers/sdd/2026-10-14-prose/preflight.sh`, then read `report.txt`. Expected: exit 0 and the report's lines. Record the finding in the comment line above `export CLAUDE_CONFIG_DIR`, dated, in the form `# preflight 2026-10-NN (CLI x.y.z): a -p run under a fresh CLAUDE_CONFIG_DIR authenticated through the gateway (apiKeySource none), listed the non-builtin plugin failwise and the namespaced skill failwise:fmea-software alone beside the CLI's builtin plugins and bundled skills, and /autocompact reported the 786.4k window, leaving <files, or nothing> in the fresh directory; CLAUDE_CONFIG_DIR kept per run`. If the script exits non-zero: record exactly what `report.txt` says in that comment, do not commit, and stop; the user decides. Nothing is seeded into the directory on a guess, and no other key source is tried.

- [ ] **Step 7: Commit**

```bash
git add tools/run-eval.sh tools/run-eval.test.ts CONTRIBUTING.md
git commit -F- <<'EOF'
Evals: each run gets a fresh, empty CLAUDE_CONFIG_DIR

The user's ~/.claude reached eleven of the twelve 0.7.0 runs. The harness
now makes a fresh directory per run, exports it as CLAUDE_CONFIG_DIR before
the run and removes it after; the test asserts the directory is under the
run's TMPDIR, empty at launch and gone afterwards. Preflight recorded in the
comment above the export; CONTRIBUTING.md's Evals section says what a run
needs in its environment.
EOF
```

---

### Task A3: The per-model window table and the `/autocompact` probe gate

**Files:**
- Modify: `tools/run-eval.sh` after the `export CLAUDE_CONFIG_DIR` line of A2 (the table), and before `cd "$WORK"` (line 264 at 7506ffe; the probe)
- Modify: `tools/run-eval.test.ts` `sandbox` and the stub; new tests

**Interfaces:**
- Consumes: A2's `CONFIG` and the `export CLAUDE_CONFIG_DIR` line; the `Sandbox`.
- Produces: the shell variables `WINDOW_EXPECT` (the row's probe text or empty) and `WINDOW_LINE` (the probe line, possibly empty); the file `$WORK/autocompact.txt` holding the probe's whole reply (stdout and stderr), which A4 reads and the run publishes; the exported settings `CLAUDE_CODE_AUTO_COMPACT_WINDOW` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS` for a model with a row, both unset otherwise; the stub environment variables `FMEA_STUB_AUTOCOMPACT` (unset: the stub prints the default line; set, even empty: the stub prints exactly that) and `FMEA_STUB_AUTOCOMPACT_STREAM` (`stderr` to print it there); the `Sandbox` field `envFile`, where the stub records the two settings as `NAME=value` lines on the run invocation.

- [ ] **Step 1: Extend the stub**

The stub starts by telling the probe from the run: when `"$2" = "/autocompact"` it prints `${FMEA_STUB_AUTOCOMPACT-Auto-compact window for stub: 786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)}` (the `-` form: unset gives the default, set-but-empty gives nothing) to stdout, or to stderr when `FMEA_STUB_AUTOCOMPACT_STREAM` is `stderr`, and exits 0 without touching the record files. Otherwise it records as today and also writes `envFile` with two lines, `CLAUDE_CODE_AUTO_COMPACT_WINDOW=${CLAUDE_CODE_AUTO_COMPACT_WINDOW:-}` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS=${CLAUDE_CODE_MAX_CONTEXT_TOKENS:-}`. `sandbox()` gains `envFile = join(dir, "env.txt")`. Every stub line carrying a bash `${…}` is a double-quoted JavaScript string with the paths concatenated in, as A2 Step 1 writes them.

- [ ] **Step 2: Write the failing tests**

```ts
test("a model with no table row runs with neither window setting, whatever the launcher carries, and the probe's reply is published", { skip: SKIP }, () => {
  const s = sandbox();
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: { ...s.env, CLAUDE_CODE_AUTO_COMPACT_WINDOW: "1", CLAUDE_CODE_MAX_CONTEXT_TOKENS: "2" }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readFileSync(s.envFile, "utf8").split("\n").filter((l) => l !== ""), ["CLAUDE_CODE_AUTO_COMPACT_WINDOW=", "CLAUDE_CODE_MAX_CONTEXT_TOKENS="]);
    assert.equal(readFileSync(join(s.publish, "p1", "high", "run1", "autocompact.txt"), "utf8"), "Auto-compact window for stub: 786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)\n");
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("deepseek-flash gets the 786.4k window settings and runs only when the probe reports that window", { skip: SKIP }, () => {
  const s = sandbox(undefined, "high=deepseek-flash,medium=deepseek-flash");
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "medium", "1"], { cwd: ROOT, env: s.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readFileSync(s.envFile, "utf8").split("\n").filter((l) => l !== ""), ["CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432", "CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000"]);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("the probe gate refuses before any model call, printing the reply: no window line, a capped window, or another window than the row's", { skip: SKIP }, () => {
  const cases: [string, string | undefined, RegExp, string | null][] = [
    ["", "high=deepseek-flash", /^error: the CLI reported no auto-compact window line; its reply follows$/m, null],
    ["API Error: 401 authentication failed", "high=deepseek-flash", /^error: the CLI reported no auto-compact window line; its reply follows$/m, "API Error: 401 authentication failed"],
    ["Auto-compact window for deepseek-flash: 200k tokens (capped at the model's window)", "high=deepseek-flash", /^error: the CLI caps the auto-compact window: Auto-compact window for deepseek-flash: 200k tokens \(capped at the model's window\)$/m, null],
    ["Auto-compact window for deepseek-flash: 160k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)", "high=deepseek-flash", /^error: the CLI did not report the window the table expects for deepseek-flash, 786\.4k tokens \(from CLAUDE_CODE_AUTO_COMPACT_WINDOW\): Auto-compact window for deepseek-flash: 160k tokens \(from CLAUDE_CODE_AUTO_COMPACT_WINDOW\)$/m, null],
    ["", undefined, /^error: the CLI reported no auto-compact window line; its reply follows$/m, null],
  ];
  for (const [line, models, want, reply] of cases) {
    const s = sandbox(undefined, models);
    try {
      const r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: { ...s.env, FMEA_STUB_AUTOCOMPACT: line }, encoding: "utf8" });
      assert.equal(r.status, 1, r.stderr);
      assert.match(r.stderr, want);
      if (reply !== null) assert.ok(r.stderr.includes(reply), `the probe's reply was not printed: ${r.stderr}`);
      assert.ok(!existsSync(s.argvFile), "the run was launched although the probe gate refused");
      assert.deepEqual(readdirSync(s.tmp).filter((n) => n.startsWith("fmea-")), []);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  }
});

test("the probe line is read from stderr as well as stdout, and case-insensitively", { skip: SKIP }, () => {
  const s = sandbox(undefined, "high=deepseek-flash");
  try {
    const r = spawnSync("bash", [SCRIPT, "1", "high", "1"], { cwd: ROOT, env: { ...s.env, FMEA_STUB_AUTOCOMPACT: "AUTO-COMPACT WINDOW FOR deepseek-flash: 786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)", FMEA_STUB_AUTOCOMPACT_STREAM: "stderr" }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});
```

The fifth case of the gate test (a model with no row, `opus`, and an empty reply) pins that the "no line" refusal applies to every model: the gate asserts the line exists and is not capped even where no text is expected (§8.5). (`sandbox(undefined, undefined)` is the default table.)

- [ ] **Step 3: Run them to watch them fail**

Run: `bun tools/run-tests.ts`
Expected: the first fails on `envFile` not existing (the stub does not write it before Step 1 lands) or, once it does, on `CLAUDE_CODE_AUTO_COMPACT_WINDOW=1`; the second on an empty value; the gate test on `r.status` being 0. The stderr test asserts status 0, which holds today: it is a regression pin for Step 4.

- [ ] **Step 4: Implement the table and the probe in `tools/run-eval.sh`**

After `export CLAUDE_CONFIG_DIR="$CONFIG"`:

```bash
# The context window per model (prose design 2026-10-14 §5.3). The CLI does not
# know a gateway model and takes a 200k window for it, which caps
# CLAUDE_CODE_AUTO_COMPACT_WINDOW: 13 of the capped round's 16 runs compacted
# near 167k on 2026-10-13. A model with a row gets its two settings and the
# text its probe must report; a model with no row gets neither setting, so the
# launcher's environment never decides the window.
unset CLAUDE_CODE_AUTO_COMPACT_WINDOW CLAUDE_CODE_MAX_CONTEXT_TOKENS
WINDOW_EXPECT=""
case "$MODEL_NAME" in
  deepseek-flash)
    export CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432
    export CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000
    WINDOW_EXPECT="786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)"
    ;;
esac
```

Before `cd "$WORK"`, the probe, run under the run's directory and environment, its whole reply kept beside the run and printed before any refusal, because the EXIT trap removes `$WORK`:

```bash
set +e
claude -p "/autocompact" --model "$MODEL_NAME" --max-turns 1 > "$WORK/autocompact.txt" 2>&1
set -e
WINDOW_LINE="$(grep -i -m1 "auto-compact window for" "$WORK/autocompact.txt" || true)"
if [ -z "$WINDOW_LINE" ]; then
  { echo "error: the CLI reported no auto-compact window line; its reply follows"; sed -n '1,20p' "$WORK/autocompact.txt"; } >&2
  exit 1
fi
case "$WINDOW_LINE" in
  *capped*) echo "error: the CLI caps the auto-compact window: $WINDOW_LINE" >&2; exit 1 ;;
esac
if [ -n "$WINDOW_EXPECT" ]; then
  case "$WINDOW_LINE" in
    *"$WINDOW_EXPECT"*) ;;
    *) echo "error: the CLI did not report the window the table expects for $MODEL_NAME, $WINDOW_EXPECT: $WINDOW_LINE" >&2; exit 1 ;;
  esac
fi
```

The header comment gains a paragraph naming the table, the probe and `autocompact.txt`. (`$WORK/autocompact.txt` is published with the run by the existing `cp -R "$WORK/." "$RUN_DIR/"`.)

- [ ] **Step 5: Run the tests to watch them pass**

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0, every earlier `run-eval.test.ts` case still green (the default stub line satisfies the gate for every model).

- [ ] **Step 6: Commit**

```bash
git add tools/run-eval.sh tools/run-eval.test.ts
git commit -F- <<'EOF'
Evals: the harness sets the context window per model and refuses a run the CLI would cap

The gitignored round script set CLAUDE_CODE_MAX_CONTEXT_TOKENS and the
auto-compact window for deepseek-flash and probed /autocompact before a round.
That moves into tools/run-eval.sh: a per-model table, the probe before every
run under the run's own CLAUDE_CONFIG_DIR, its reply kept as autocompact.txt
and printed on a refusal, and a refusal when the line is absent, capped, or
not the row's window.
EOF
```

---

### Task A4: `tools/eval-context.ts` writes `context.json`, and the harness calls it

**Files:**
- Create: `tools/lib/transcript.ts`
- Create: `tools/eval-context.ts`
- Create: `tools/eval-context.test.ts`
- Modify: `tools/eval-invocations.ts:73-86` (`Block`, `Message`, `blocksOf`, `resultText`), `:107-117` (`parseLine`), `:192-196` (`refuse`): moved to the shared module and imported back
- Modify: `tools/run-eval.sh:1-14` (header summary line), after the `eval-invocations.ts` call (lines 307-316), the summary line (line 324)
- Modify: `tools/run-eval.test.ts` (the five summary-line regexes at lines 153, 197, 219, 243 and 327 at 7506ffe, shifted by A2 and A3; the first test's published-file assertions)

**Interfaces:**
- Consumes: A3's `$WORK/autocompact.txt` and `CONFIG`; `tools/eval-invocations.ts`'s `invocations.json` shape (`{ scripts, calls: [{ line, tool_use_id, scripts, command, outcome, result_head }] }`).
- Produces:
  - `tools/lib/transcript.ts`: `export type Block = { type?: unknown; id?: unknown; name?: unknown; input?: unknown; tool_use_id?: unknown; content?: unknown; is_error?: unknown }`; `export type Message = { type?: unknown; subtype?: unknown; tool_use_id?: unknown; parent_tool_use_id?: unknown; claude_code_version?: unknown; plugins?: unknown; skills?: unknown; memory_paths?: { auto?: unknown }; message?: { content?: unknown; usage?: unknown } }`; `export function blocksOf(m: Message): Block[]`; `export function resultText(content: unknown): string`; `export function parseLine(line: string, n: number): Message | null` (throws `line ${n} is not JSON`); `export function refuse(code: "USAGE" | "IO_READ", message: string): 1 | 3`. `tools/eval-invocations.ts` imports all six and keeps its behaviour; `tools/eval-invocations.test.ts` is the regression pin.
  - the CLI `node tools/eval-context.ts <run-dir> --config-dir <path> [--lint <id>]...`, exit 0 and `<run-dir>/context.json` written, 1 on USAGE, 3 on IO_READ (nothing written); `main` roots nothing on `import.meta.dirname`, it reads the run directory it is given.
  - `export interface EvalContext` and `export interface TranscriptFacts` below; `export function extractContext(text: string, options: { configDir: string; lintIds: string[]; validateCallIds: string[] }): TranscriptFacts` (the fields computed from the transcript alone) and `export function contextFor(runDir: string, options: { configDir: string; lintIds: string[]; env: Record<string, string | undefined> }): EvalContext`, which throws an `Error` whose message the CLI prints as its IO_READ line. A5 reads `context.json` by these field names.

```ts
export interface EvalContext {
  config_dir: string;
  cli_version: string | null;                // the init line's claude_code_version
  settings: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: string | null; CLAUDE_CODE_MAX_CONTEXT_TOKENS: string | null };
  window_line: string;                       // the first line of autocompact.txt containing "auto-compact window for", case-insensitive, verbatim
  compactions: number;                       // system lines with subtype compact_boundary
  peak_context_tokens: number;               // max over top-level assistant lines of input + cache_read + cache_creation
  assistant_lines: number;                   // top-level assistant lines counted
  init: {
    present: boolean;
    plugins: { name: string; source: string }[];     // every plugin of the init line, builtin ones included
    skills_namespaced: string[];                      // the skills whose name holds ":"
    skills_unnamespaced: string[];                    // the rest, sorted
    memory_auto: string | null;
    memory_under_config_dir: boolean;
  };
  leak_grep: { "CLAUDE.md": number; "~/.claude": number };   // transcript lines containing each literal
  invocations: "present" | "missing";
  denied: { bun: number; other: number };    // invocations.json calls with outcome denied, split on whether the command holds the word bun
  lints: { id: string; fired: number | null; final: boolean | null }[];
}
export interface TranscriptFacts {
  cli_version: string | null; compactions: number; peak_context_tokens: number; assistant_lines: number;
  init: EvalContext["init"]; leak_grep: EvalContext["leak_grep"]; lint_fired: Record<string, number>;
}
```

- [ ] **Step 1: Move the parser into `tools/lib/transcript.ts`**

Create the module with the six exports above, the four helpers' bodies moved verbatim from `tools/eval-invocations.ts` (`Block` and `Message` widened as the Interfaces say), and `refuse` moved from lines 192-196. `tools/eval-invocations.ts` imports them from `./lib/transcript.ts`. Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0 (`eval-invocations.test.ts` unchanged and green; fallow sees each export imported).

- [ ] **Step 2: Write the failing tests**

`tools/eval-context.test.ts`, with helpers in the style of `tools/eval-invocations.test.ts:13-30`: `initLine(plugins: { name: string; source: string }[], skills: string[], memoryAuto: string, version = "2.1.296"): string`, `assistantLine(usage: { input: number; cacheRead: number; cacheCreation: number }, parentToolUseId?: string, block?: unknown): string`, `compactLine(): string` (`{"type":"system","subtype":"compact_boundary"}` with a `compact_metadata` object), `toolResultLine(id: string, text: string, isError = false): string`, and a `runDir(files: Record<string, string>): string` that writes a temp directory. `const CLI = join(import.meta.dirname, "eval-context.ts")`. Tests, each a `test(...)`:

```ts
test("compactions counts compact_boundary system lines: 0 without, 2 with", ...);
  // extractContext over [initLine, assistantLine(...)] gives compactions 0; with two compactLine() entries gives 2
test("peak_context_tokens is the largest input plus cache_read plus cache_creation over top-level assistant lines, and a subagent line never counts", ...);
  // lines: assistant {input 1000, cacheRead 200000, cacheCreation 37429} -> 238429; assistant with parent_tool_use_id "toolu_1" and usage 900000 is ignored; assistant_lines is 2 of 3
test("init records the CLI version, every plugin with its source, the namespaced and the unnamespaced skills, and whether memory_paths.auto lies under the config dir; a stream with no init line is present false", ...);
  // initLine([{ name: "failwise", source: "failwise@inline" }, { name: "cc-plugin-telemetry", source: "cc-plugin-telemetry@builtin" }], ["failwise:fmea-software", "deep-research", "design"], "/tmp/cfg/projects/x/memory/") with configDir "/tmp/cfg"
  //   -> { present: true, plugins: [both, in order], skills_namespaced: ["failwise:fmea-software"], skills_unnamespaced: ["deep-research", "design"], memory_auto: "/tmp/cfg/projects/x/memory/", memory_under_config_dir: true }, cli_version "2.1.296"
  // memory under /home/u/.claude -> memory_under_config_dir false; no init line -> { present: false, plugins: [], skills_namespaced: [], skills_unnamespaced: [], memory_auto: null, memory_under_config_dir: false }, cli_version null
test("leak_grep counts the transcript lines holding CLAUDE.md and ~/.claude", ...);
  // a text block mentioning "~/.claude/CLAUDE.md" counts once for each literal; an unrelated line counts for neither
test("lints fired counts the validate.ts calls whose full tool result carries the rule id, past the 400-character head", ...);
  // validateCallIds ["toolu_a", "toolu_b"]; toolResultLine("toolu_a", "{...400 characters of other lints...}\"rule\": \"edge-reliability-unstated\"") counts; toolResultLine("toolu_b", "{\"ok\":true,\"lints\":[]}") does not; a result for an id outside validateCallIds is ignored -> fired 1
test("a line that is not JSON refuses the whole stream, naming the line", ...);
  // assert.throws(() => extractContext("{}\nnot json\n", ...), /line 2 is not JSON/)
test("contextFor assembles the file from the run directory: settings from the environment, the probe line from autocompact.txt, denials and lint counts from invocations.json over the validate.ts calls that ran or errored, final from validate.json", ...);
  // runDir with transcript.jsonl (init + a tool result for toolu_a carrying the id + a tool result for toolu_c with isError true whose text is "Exit code 2\n{\"ok\": false, ... \"rule\": \"edge-reliability-unstated\" ...}"), autocompact.txt ("something\nAuto-compact window for x: 786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)\n"), invocations.json ({ scripts: ["validate.ts"], calls: [ {.. outcome "ran", scripts ["validate.ts"], tool_use_id "toolu_a" ..}, {.. outcome "error", scripts ["validate.ts"], tool_use_id "toolu_c" ..}, {.. outcome "denied", command "bun /p/validate.ts a.json" ..}, {.. outcome "denied", command "node /p/validate.ts a.json" ..} ] }), validate.json ({ ok: true, errors: [], lints: [{ rule: "edge-reliability-unstated", ... }], quality_score: 100 })
  // env { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "786432" } and no CLAUDE_CODE_MAX_CONTEXT_TOKENS -> settings { "786432", null }; window_line the second line verbatim; invocations "present"; denied { bun: 1, other: 1 }; lints [{ id: "edge-reliability-unstated", fired: 2, final: true }, { id: "conversion-substitution-unrecorded", fired: 0, final: false }]
test("a missing invocations.json gives invocations missing, denied zeros and fired null; a missing or unparsable validate.json gives final null", ...);
test("a missing transcript.jsonl or autocompact.txt, or a probe reply with no window line, is one coded IO_READ line and no context.json", ...);
  // contextFor throws /cannot read .*transcript\.jsonl/, /cannot read .*autocompact\.txt/, /autocompact\.txt holds no line containing "auto-compact window for"/
test("the CLI writes context.json into the run directory and prints nothing; it refuses USAGE without --config-dir and IO_READ on a missing transcript, writing nothing", ...);
  // spawnSync(process.execPath, [CLI, dir, "--config-dir", "/tmp/cfg", "--lint", "edge-reliability-unstated"]) -> status 0, stdout "", context.json parses with compactions 0 and lints length 1
  // [CLI, dir] -> status 1, stderr /^error USAGE: usage: node tools\/eval-context\.ts <run-dir> --config-dir <path> \[--lint <id>\]\.\.\.$/m
  // dir without transcript -> status 3, stderr /^error IO_READ: cannot read .*transcript\.jsonl/, no context.json
```

- [ ] **Step 3: Run them to watch them fail**

Run: `bun tools/run-tests.ts`. Expected: the tools suite fails with `Cannot find module '…/tools/eval-context.ts'`.

- [ ] **Step 4: Implement `tools/eval-context.ts`**

Header comment in the form of `tools/eval-invocations.ts:1-31`: what the file records and why (§5.3: the window and compactions are the verification basis of a run; the lint counts show whether a warning fired during the run and whether the final document still carries it; `validate.json` shows the end state only, and `validate.ts` prints its lints on exit 2 as well, so a call that errored counts), the usage line, the exit codes, and that `tools/` imports nothing from `skills/`. It imports `parseLine`, `blocksOf`, `resultText`, `refuse` and `type Message` from `./lib/transcript.ts` and copies none of them. `extractContext` makes one pass: the init line is the first `system` line with `subtype === "init"`; a compaction is a `system` line with `subtype === "compact_boundary"`; a top-level assistant line has `parent_tool_use_id` null or undefined; the two leak counts are per line; the `tool_result` texts for the ids in `validateCallIds` are joined by `resultText`. `contextFor` reads `transcript.jsonl` and `autocompact.txt` (both required), `invocations.json` and `validate.json` (both optional, as the interface says), takes `validateCallIds` as the ids of calls whose `scripts` includes `"validate.ts"` and whose `outcome` is `"ran"` or `"error"`, and `fired` as the number of those whose result text contains `"rule": "<id>"`; `final` is `lints.some((l) => l.rule === id)` over `validate.json`'s `lints` when it parses to an object with a `lints` array, else null. `main(argv)` parses `<run-dir>`, `--config-dir <path>` (required) and repeated `--lint <id>`, writes `JSON.stringify(context, null, 2) + "\n"` to `<run-dir>/context.json`, prints nothing, and returns 0. Entry through `if (isEntry(import.meta)) process.exit(main(process.argv.slice(2)));`.

- [ ] **Step 5: Run them to watch them pass**

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0 (fallow: `extractContext` and `contextFor` are imported by the test).

- [ ] **Step 6: Check the tool on the 0.7.0 transcripts**

Copy `/home/nn/Projects/failwise/build/evals/flow-model/p1/medium/run2` and `/home/nn/Projects/failwise/build/evals/flow-model.capped/p1/medium/run2` (the main checkout's gitignored tree) into two new directories under the scratchpad with `cp -R`, by absolute path. With the Write tool put an `autocompact.txt` in each copy holding the line `Auto-compact window for deepseek-flash: 786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)`. Run `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/eval-context.ts <copy> --config-dir /tmp/none --lint edge-reliability-unstated --lint conversion-substitution-unrecorded` on each. Expected: the uncapped copy's `context.json` shows `compactions` 0, `peak_context_tokens` 238429, `assistant_lines` 115, `init.present` true, `cli_version` "2.1.296", three plugins with `@builtin` sources among its `init.plugins`; the capped copy shows `compactions` 2, `peak_context_tokens` 164409, `assistant_lines` 126. If any figure differs, stop and report it; do not adjust the tool or the fixtures to match. Record the figures in the commit body.

- [ ] **Step 7: Call it from the harness and extend the summary line**

In `tools/run-eval.sh`, after the `eval-invocations.ts` block (line 316):

```bash
# The run's context record (prose design 2026-10-14 §5.3): the window it ran
# under, its compactions and peak, the init line's isolation facts, the denied
# calls and the new lints' counts. A run with no context.json is unverified at
# judging, never scored.
set +e
node "$ROOT/tools/eval-context.ts" "$WORK" --config-dir "$CONFIG" --lint edge-reliability-unstated --lint conversion-substitution-unrecorded 2> context.stderr
CONTEXT_EXIT=$?
set -e
[ "$CONTEXT_EXIT" -eq 0 ] || echo "p$PID $MODEL_CAPABILITY run$RUN: tools/eval-context.ts exited $CONTEXT_EXIT (see context.stderr)" >&2
```

and the summary line gains ` invocations=$INVOCATIONS context=$CONTEXT` after `validate_exit=$VALIDATE_EXIT`, with `INVOCATIONS=missing; [ -f invocations.json ] && INVOCATIONS=present` and `CONTEXT=missing; [ -f context.json ] && CONTEXT=present` beside the `ANALYSIS` and `REPORT` lines; the header's summary-line description (line 14) gains both fields. In `tools/run-eval.test.ts`, the five regexes ending `validate_exit=\d+$` become `validate_exit=\d+ invocations=present context=present$`, and the first test (line 148) asserts `context.json` is published beside `invocations.json` and parses with `init.present === false` (the stub's stream holds no init line) and `compactions === 0`.

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add tools/lib/transcript.ts tools/eval-invocations.ts tools/eval-context.ts tools/eval-context.test.ts tools/run-eval.sh tools/run-eval.test.ts
git commit -F- <<'EOF'
Evals: each run records its context in context.json

tools/eval-context.ts reads the run's transcript, probe reply, invocations
and validate.json and writes the window settings, the probe line, the
compaction count, the peak context over top-level assistant lines, the init
line's isolation facts, the leak counts, the denials and, for the two lints
part B adds, how often each fired during the run and whether the final
document carries it. The transcript parser moves to tools/lib/transcript.ts,
shared with eval-invocations.ts. The harness calls it after
eval-invocations.ts and the summary line says whether invocations.json and
context.json exist. Checked on the 0.7.0 transcripts: <figures>.
EOF
```

---

### Task A5: The context gate in the judging workflows, and the Harness section of the note

**Files:**
- Modify: `tools/workflows/evals.js:1-40` (header, its model-capability paragraph at `:33-40` included), `:45-50` (`meta.phases`, inside `export const meta` at `:42-51`), `:57-64` (the model-table comment), `:102-121` (the `args.models` check), after `:196` (a `CONTEXT_SCHEMA`), `:298` (beside `judgePrompt`, a `contextPrompt`), `:364-422` (the Judge pipeline)
- Modify: `tools/workflows/rejudge.js:1-57` (header, its model-capability paragraph included), `:96-121` (the model table check), `:298-318` (`judge`)
- Modify: `tools/eval-report.ts:479-485` (`RunResult`), `:770-784` (`renderReport` sections), `:1176-1189` (`runProblem`), a new `harnessSection`
- Modify: `tools/eval-report.test.ts` (new tests beside line 207; the sync test at `:343-355`)

**Interfaces:**
- Consumes: A4's `EvalContext` field names; A1's four-state `flows.pass`.
- Produces: in `results.json`, `runs[].context: { window: string; compactions: number; peak_context_tokens: number } | null` (null when `context.json` was unread); the unverified unit `context p<prompt> <capability> run<n>`; in the note, a `## Harness` section with one row per run; the gate predicate, spelled the same in both workflow files, `!ctx || ctx.present !== true || ctx.compactions !== 0`. `rejudge.js` returns an `unverified` entry of the same unit name for a gated run.

The Harness table, one row per run of `results.runs` in prompt, capability, run order, columns `| Prompt | Model capability | Run | Window | Compactions | Peak context | Isolated | Unnamespaced skills | Denied (bun / other) | <lint id> fired / final | … |` with one lint column per id in the first readable `context.json`, in its order:
- Window, Compactions and Peak come from `results.json`'s `runs[].context`: the Window cell prints `context.window` after its first `: `, or the whole string when it holds no `: `; Peak prints the integer with thousands separators; a run whose `context` is null, or absent while another run has one, prints `UNVERIFIED` in these three cells.
- The other cells come from `${r.dir}/context.json`, read with `readFileSync` in try/catch: Isolated is `no (no init line)` when `init.present` is not true, and no other field of `init` is read. Otherwise it is `yes` when the plugins of `init.plugins` whose `source` does not end in `@builtin` are exactly `["failwise"]`, `init.skills_namespaced` deep-equals `["failwise:fmea-software"]` and `init.memory_under_config_dir` is true. Otherwise it is `no (<reasons>)`, the reasons joined by `; ` in this order, only those that apply: `plugins: <non-builtin names joined by ", " or none>`, `skills: <namespaced names joined by ", " or none>`, `memory outside the config dir` (never the memory path itself). Unnamespaced skills prints the count. Denied prints `<bun> / <other>`, or `missing` when `invocations` is `"missing"`. A lint cell prints `<fired> / <final>` with `fired` the integer or `—` when null and `final` `yes`, `no` or `—` when null. The file is read at `join(resolve(ROOT, r.dir), "context.json")`, so a relative `dir` resolves against the repository root. A `context.json` that cannot be read or parsed prints `—` in every one of these cells and one line under the table, `- p<prompt> <capability> run <n>: context.json unreadable at <relative(ROOT, dir)>`. When the run's `context` is non-null and the file is missing, or the file's `compactions` or `peak_context_tokens` differ from the copied values, one more line under the table, `- p<prompt> <capability> run <n>: results.json context disagrees with context.json (<field>: <copied> vs <file>)` or `(file missing)`; A6 Step 5 reads that run as unverified.
- The section prints only when some run entry has a `context` key; a file without one renders exactly as before.

- [ ] **Step 1: Write the failing report tests**

```ts
test("a run that carries context prints the Harness table with its window, compactions and peak, reads isolation, denials and lint counts from its context.json, and marks the gaps", () => {
  const r = sampleResults();
  // four absolute temp run directories: A holds a full context.json (compactions 0, peak_context_tokens 238429, init.present true, plugins [{failwise, failwise@inline}, {cc-plugin-telemetry, cc-plugin-telemetry@builtin}], skills_namespaced ["failwise:fmea-software"], skills_unnamespaced ["deep-research"], memory_under_config_dir true, invocations "present", denied { bun: 0, other: 1 }, lints [{ id: "edge-reliability-unstated", fired: 2, final: true }, { id: "conversion-substitution-unrecorded", fired: 0, final: false }]);
  // B holds compactions 2 (the copy below says 1), init { present: false, plugins: [], skills_namespaced: [], skills_unnamespaced: [], memory_auto: null, memory_under_config_dir: false }, lints with fired null and final null, invocations "missing"; C holds no file while its copied context is non-null; D holds a full file like A while its run entry has no context key
  r.runs[0] = { ...r.runs[0], dir: A, context: { window: "Auto-compact window for deepseek-flash: 786.4k tokens (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)", compactions: 0, peak_context_tokens: 238429 } };
  r.runs[1] = { ...r.runs[1], dir: B, context: { window: "x: 200k tokens", compactions: 1, peak_context_tokens: 170039 } };
  r.runs[2] = { ...r.runs[2], dir: C, context: { window: "x: 200k tokens", compactions: 0, peak_context_tokens: 1 } };
  r.runs[3] = { ...r.runs[3], dir: D };
  const md = renderReport(r);
  assert.match(md, /^## Harness$/m);
  assert.match(md, /\| Prompt \| Model capability \| Run \| Window \| Compactions \| Peak context \| Isolated \| Unnamespaced skills \| Denied \(bun \/ other\) \| edge-reliability-unstated fired \/ final \| conversion-substitution-unrecorded fired \/ final \|/);
  assert.match(md, /\| 1 \| high \| 1 \| 786\.4k tokens \(from CLAUDE_CODE_AUTO_COMPACT_WINDOW\) \| 0 \| 238,429 \| yes \| 1 \| 0 \/ 1 \| 2 \/ yes \| 0 \/ no \|/);
  assert.match(md, /\| 1 \| high \| 2 \| 200k tokens \| 1 \| 170,039 \| no \(no init line\) \| 0 \| missing \| — \/ — \| — \/ — \|/);
  assert.match(md, /^- p1 high run 2: results\.json context disagrees with context\.json \(compactions: 1 vs 2\)$/m);
  assert.match(md, /\| 1 \| medium \| 1 \| 200k tokens \| 0 \| 1 \| — \| — \| — \| — \| — \|/);
  assert.match(md, /^- p1 medium run 1: context\.json unreadable at [^/].*$/m);   // a repository-relative path, never /home
  assert.match(md, /^- p1 medium run 1: results\.json context disagrees with context\.json \(file missing\)$/m);
  assert.match(md, /\| 1 \| medium \| 2 \| UNVERIFIED \| UNVERIFIED \| UNVERIFIED \| yes \| 1 \| 0 \/ 1 \| 2 \/ yes \| 0 \/ no \|/);   // no context key while another run has one; the file still read
  assert.ok(!md.includes("run 2: results.json context disagrees"), "a run with no context key is never a disagreement");
});
test("a results file whose runs carry no context field renders exactly as before, with no Harness section", () => {
  assert.ok(!renderReport(sampleResults()).includes("## Harness"));
});
test("a run context that is not {window, compactions, peak_context_tokens} or null is one coded IO_READ line naming the run", () => {
  // r.runs[0].context = { window: 1 } -> reportOn(...) stderr /^error IO_READ: .*has a run context that is not \{window, compactions, peak_context_tokens\} at runs\[0\]/
});
```

In the sync test at `tools/eval-report.test.ts:343-355`, after the rejudge.js read: `for (const script of [workflow, rejudge]) assert.ok(script.includes("!ctx || ctx.present !== true || ctx.compactions !== 0"), "the context gate predicate");` (`rejudge` is the text the test already reads from `tools/workflows/rejudge.js` at line 351).

- [ ] **Step 2: Run them to watch them fail**

Run: `bun tools/run-tests.ts`. Expected: FAIL: `## Harness` absent; the IO_READ test fails because `runProblem` accepts any `context`; the sync pin fails on both scripts; the second test (no `context` key, no Harness section) passes already (a regression pin).

- [ ] **Step 3: Implement in `tools/eval-report.ts`**

- `RunResult` gains `context?: { window: string; compactions: number; peak_context_tokens: number } | null`, documented: absent on a file written before 2026-10-14, null when the judging could not read the run's `context.json`.
- `runProblem` checks it after `notes`: present and not null means an object with a string `window`, an integer `compactions` and an integer `peak_context_tokens`, else `has a run context that is not {window, compactions, peak_context_tokens} ${at}`.
- `harnessSection(results: EvalResults): string[]`, placed in `renderReport` after `overallSection` and before `unverifiedUnitsSection`; returns `[]` when no run has a `context` key. Small private helpers (`contextFileOf(dir)` returning `join(resolve(ROOT, dir), "context.json")`, `isolationText(ctx)`, `lintCell(entry)`, `harnessRow(r, ctx, lintIds)`, `disagreementLine(r, ctx)`), each under the complexity caps; the unreadable and disagreement lines use `relative(ROOT, dir)` (`relative` and `resolve` are imported at line 20, `ROOT` defined at line 25).

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: the report tests pass, the sync pin still fails; the test at line 1298 ("a results file without session_checks or not_rerun renders exactly as before") still passes.

- [ ] **Step 4: The gate in `tools/workflows/evals.js`**

- `CONTEXT_SCHEMA = { type: 'object', properties: { exists: { type: 'boolean' }, text: { type: 'string' } }, required: ['exists', 'text'] }`.
- `contextPrompt(item)` returns: `Read ${item.dir}/context.json with the Read tool. If the file does not exist, return exists false and text "". Otherwise return exists true and, as text, the file's whole content exactly as read: byte for byte, no reformatting, no summarising, no truncation. Return nothing else and change nothing.`
- `parseContext(reply)`, in code: null when `reply` is null (the agent returned nothing); `{ present: false }` when `reply.exists !== true`; otherwise `JSON.parse(reply.text)` in a try, returning `{ present: false, problem: 'text is not JSON' }` on a throw, `{ present: false, problem: \`${field} missing or not an integer\` }` when `compactions` or `peak_context_tokens` is not an integer or `window_line` is not a string, else `{ present: true, compactions, peak_context_tokens, window_line }`. The reading is in code; the agent only fetches.
- `meta.phases` gains `{ title: 'Context', detail: 'one Sonnet agent per run reads context.json; a run with no file or with compactions above 0 is unverified before any judge is called' }` before `Judge`.
- The `args.models` check (lines 114-116) gains, after the loop over `MODEL_CAPABILITIES`: `if (!('medium' in argsModels)) problems.push('the table names no model for the medium model capability the context, stability and persist agents run at')`, so a caller's `{ high: … }` table can no longer leave those agents on an unnamed model.
- The Judge pipeline gains a first stage, `(_prev, item) => tryAgent(contextPrompt(item), { label: \`context p${item.prompt} ${item.model_capability} run${item.run}\`, phase: 'Context', model: MODELS_BY_CAPABILITY.medium, schema: CONTEXT_SCHEMA })`; the judge stage becomes `(reply, item) => { const ctx = parseContext(reply); return gated(ctx) ? { ctx, judged: null } : tryAgent(judgePrompt(item), …).then((judged) => ({ ctx, judged })) }`, where `function gated(ctx) { return !ctx || ctx.present !== true || ctx.compactions !== 0 }` (that string, verbatim, is what the sync test pins); the third stage takes `({ ctx, judged }, item)`, computes `context = ctx && ctx.present ? { window: ctx.window_line, compactions: ctx.compactions, peak_context_tokens: ctx.peak_context_tokens } : null`, and, before the existing `if (!judged)` branch, when `gated(ctx)`: pushes `{ unit: \`context ${key}\`, detail: <one of> 'the context agent returned nothing on three attempts; context.json was not read, so the run is unverified and no judge was called' | 'the run has no context.json; it is unverified and no judge was called' | \`the run's context.json could not be read in code (${ctx.problem}); it is unverified and no judge was called\` | \`the run compacted ${ctx.compactions} time(s) under the window ${ctx.window_line}; a compacted run is unverified (prose design §5.3) and no judge was called\` }` onto `unverified`, logs it, and returns `{ ...item, context, scores: [], total: 0, max: 2 * criteriaFor(item.prompt).length, musts_at_2: 0, notes: detail, pass: false, unverified: true }`. Every other return of the stage spreads `context` into the entry.
- The header comment gains the rule and names `context.json` among the files the workflow reads; its model-capability paragraph (`:33-40`) reads `judging and the critic at high, the three mechanical stages (reading a run's context.json, running a command, writing a file) at medium`; the model-table comment at `:57-64` adds, to the list of what refuses, a table that names no model for the medium capability, which the context, stability and persist agents run at whatever capabilities the run judges.

Verify: the compile check of "How to read this plan" on the file. Expected: `parsed`.

- [ ] **Step 5: The same gate in `tools/workflows/rejudge.js`**

In `judge(item)`, before the `tryAgent(judgePrompt(item), …)` call: the same context agent (medium capability, `CONTEXT_SCHEMA`, `parseContext` and `gated` copied into the file, as its `CRITERIA` table is copied, with the same comment that workflow scripts cannot import), `const ctx = parseContext(reply)`, and, when `gated(ctx)`, `return { unverified: { unit: \`context ${runKey(item)}\`, detail } }` with the four details of Step 4. After line 113, `if (!('medium' in argsModels)) problems.push('the table names no model for the medium model capability the context gate runs at')`; the comment at lines 96-99 and the header paragraph at lines 54-57 say the table must name high (the judge) and medium (the context gate), and no longer "exactly as in rejudge-c1.js". `meta.phases` gains the Context phase. Verify with the compile check on `/home/nn/Projects/failwise/.claude/worktrees/prose/tools/workflows/rejudge.js`. Then `bun tools/run-tests.ts`: the sync pin passes.

- [ ] **Step 6: Commit**

```bash
git add tools/workflows/evals.js tools/workflows/rejudge.js tools/eval-report.ts tools/eval-report.test.ts
git commit -F- <<'EOF'
Evals: a run with no context.json or with a compaction is unverified before any judge runs

evals.js and rejudge.js read each run's context.json through one Sonnet agent
and decide in code: no file or compactions above 0 means no judge call, no
scores, an unverified unit, as 2fea11a set for a run with no report. The three
window fields are copied into results.json, eval-report.ts prints a Harness
table from them and from each run's context.json, and both tables must now
name the medium capability the agents run at.
EOF
```

---

### Task A6: The baseline round and its note

**Files:**
- Create (gitignored): `.superpowers/sdd/2026-10-14-prose/run-round.sh`, `build/evals/prose-0/`
- Create: `docs/specs/2026-10-14-prose-eval-results-0.md` (generated, then appended by hand)

**Interfaces:**
- Consumes: A1 to A5 as merged on `prose`; the preflight report of A2 Step 6 (`bundled_skills`).
- Produces: the baseline evidence parts B and C compare against: `build/evals/prose-0/results.json` with `runs[].context` and the prompt-6 `not_applicable` entries, and the note. Part B's §8.3 clause "no pair that passed a criterion at baseline fails it after" reads this file. The round script and the re-run procedure of Step 5 are what B7 and C8 reuse, with their stage number.

- [ ] **Step 1: Confirm the branch is clean and the gates pass**

Run: `git status --short` (expect nothing), `bun tools/run-tests.ts`, `bun tools/check.ts`. Expected: all exit 0. The round's evidence is worthless if the tree it ran against is not the tree that is committed. Record `git rev-parse HEAD`.

- [ ] **Step 2: Write the round script (untracked, under the ignored `.superpowers/`)**

`.superpowers/sdd/2026-10-14-prose/run-round.sh`, modelled on `/home/nn/Projects/failwise/.superpowers/sdd/2026-10-12-flow-model/run-round.sh` (the main checkout's gitignored tree, read only), holding in this order:

1. `#!/usr/bin/env bash`, a header comment (the prose rounds, sixteen runs, the key from the keyring), `set -euo pipefail`.
2. Arguments: `[[ "${1:-}" =~ ^[0-9][a-z]?$ ]] || { echo "usage: bash run-round.sh <stage> [<prompt> <capability> <run>]" >&2; exit 1; }`, `STAGE="$1"`; then either exactly one argument (the whole round) or exactly four (one cell); any other count refuses with the usage line.
3. The key, as the Global Constraints say: `KEY="$(secret-tool search --all service goose 2>/dev/null | sed -n 's/^secret = //p' | python3 -c "import sys,json; print(json.load(sys.stdin).get('DEEPSEEK_API_KEY',''))")"`, `[ -z "$KEY" ] && { echo "NO KEY: refusing" >&2; exit 1; }`, never echoed.
4. `cd /home/nn/Projects/failwise/.claude/worktrees/prose`; `export ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"`, `export ANTHROPIC_AUTH_TOKEN="$KEY"`, `export FMEA_EVAL_MODELS="high=deepseek-flash,medium=deepseek-flash"`; a comment that the window exports and the `/autocompact` gate now live in `tools/run-eval.sh` (A3).
5. The nvm block of the flow-model script (the newest `$HOME/.nvm/versions/node/*/bin` first on PATH), then `command -v node` and `command -v claude`, each refusing with exit 1 when missing, and both printed.
6. The smoke test of the flow-model script: `claude -p "Reply with the single word ok." --model deepseek-flash --max-turns 1 2>&1 | tail -5`, accepted on `*ok*|*OK*`, otherwise exit 1.
7. `ROOT_OUT="/home/nn/Projects/failwise/.claude/worktrees/prose/build/evals/prose-$STAGE"`. With four arguments: `env FMEA_EVAL_PUBLISH_ROOT="$ROOT_OUT" tools/run-eval.sh "$2" "$3" "$4"` and exit with its status. With one: the sixteen lines `env FMEA_EVAL_PUBLISH_ROOT="$ROOT_OUT" tools/run-eval.sh <p> <cap> <n>` for p in 1, 5, 6, 7, cap in high and medium, n in 1 and 2, in that order.
8. A closing `echo` and `find "$ROOT_OUT" -name transcript.json -printf '%h\n' | sort`.

Under `set -e` a run that `tools/run-eval.sh` refuses (exit 1, nothing published) stops the round, as the deleted round-level gate did; fix the cause, then run the remaining cells one by one with the four-argument form. Re-running the whole script stops at the first cell already published (`already holds a transcript`).

- [ ] **Step 3: Run the round**

Run, in the background, with the log under the script's own folder:
```
bash /home/nn/Projects/failwise/.claude/worktrees/prose/.superpowers/sdd/2026-10-14-prose/run-round.sh 0 > /home/nn/Projects/failwise/.claude/worktrees/prose/.superpowers/sdd/2026-10-14-prose/round-0.log 2>&1
```
A sixteen-run round takes over an hour; a foreground Bash call is capped at ten minutes. Wait with Monitor for the process to exit, or for sixteen lines matching `^p[1567] (high|medium) run[12]: model=` (the `: claude exited` and `: tools/… exited` stderr lines share the prefix and must not be counted). Expected: sixteen summary lines `p<prompt> <capability> run<n>: model=deepseek-flash basis=FMEA_EVAL_MODELS effort=high analysis=present report=present validate_exit=0 invocations=present context=present`. A run whose `analysis`, `report`, `invocations` or `context` is `missing` is recorded, not re-run here, and is unverified in Step 5. Model time: sixteen runs on DeepSeek Flash.

- [ ] **Step 4: Judge the round**

Dispatch with the Workflow tool:

```json
{ "scriptPath": "tools/workflows/evals.js",
  "args": { "root": "/home/nn/Projects/failwise/.claude/worktrees/prose", "prompts": [1, 5, 6, 7], "capabilities": ["high", "medium"], "evalsDir": "build/evals/prose-0" } }
```

Expected: `build/evals/prose-0/results.json` with `rubric: 4`, sixteen `runs[]` entries each carrying `context`, eight `stability[]` entries of which the two prompt-6 ones carry `flows.pass: "not_applicable"`, and `unverified` listing every unit the workflow could not get an answer from. Tiers: 16 Sonnet context agents, up to 16 Opus judges, 8 Sonnet stability, 1 Opus critic, 1 Sonnet persist; 0 Fable. If the persist agent fails, write `results.json` by hand from the returned object, byte for byte.

- [ ] **Step 5: Generate the note, append its hand-written sections, and check the round against §8.2**

Run:
```
/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/eval-report.ts --results build/evals/prose-0/results.json --out docs/specs/2026-10-14-prose-eval-results-0.md --title "Eval results, prose stage 0 (baseline)"
```
Expected: `wrote docs/specs/2026-10-14-prose-eval-results-0.md`, exit 0. Exit 3 with one `error IO_READ:` line means an unreadable or malformed `results.json`; exit 1 with `error USAGE:` a bad argument. On either, no note is written, the step stops and the stage is unverified.

Then append, by hand, these sections, and append them again after every regeneration of the note (a re-run, a re-judge merge):

1. `## What this round cannot separate`, the §8.5 text, verbatim in every stage's note: `Stage 1 measures placement, wording and the checks together (D12); judge variance is bounded by the pair rule and by rejudging; the stricter c5 reading the acceptance note left to the user, whether a run that edits the rationale text of carried-forward rescored ratings "authored" them, is not applied, the 2026-10-13 lenient reading stands, and that reading is open (D15); the model is the one the 0.7.0 round used, deepseek-flash, so a gain on Flash is not yet a gain on Claude. Prompt 7's stored input, update/before.fmea.json, gains an open user assumption on pricing's scaling limit at stage 1 (part B, B2), so a prompt-7 change from this baseline on c1 or c5 cannot be separated from that input change. Prompt 6's answer key, legacy-rpn-sheet.expected.fmea.json, which only the judge reads (the run's plugin copy has no evals/ tree), gains an open user assumption on payment-gateway's availability SLA and scaling limit at stage 1 (part B, B2), so a prompt-6 change from this baseline on c1 cannot be separated from that answer-key change.`
2. `## Secondary leak grep`: one line per run, `p<prompt> <capability> run<n>: CLAUDE.md <count>, ~/.claude <count>`, from each `context.json`'s `leak_grep`, and the sentence that the grep reproduces the 0.7.0 count only as a quoting check and cannot prove absence.
3. `## Bundled skills`: for each run, whether its `init.skills_unnamespaced` is a subset of the preflight report's `bundled_skills` (A2 Step 6), computed with a `python3 -I` script over the sixteen files; one line per run, `yes` or the names outside the set.

Read the note's Harness table and the lines under it and record, per run, verified or unverified (a `results.json context disagrees with context.json` line makes its run unverified: the judging read a copy the file does not bear out): `invocations.json` and `context.json` present with `compactions` 0 (a Denied cell reading `missing` means `invocations.json` is absent: the run fails that clause, and the bun clause is unverified, never read as 0; cross-check the note's unverified units, where the judge already records such a run with c6 and c8 left out); Isolated `yes` and the bundled-skills line `yes`; Denied bun 0 (denials of other reasons are reported, not gated); and the two prompt-6 stability rows `not_applicable`. A run that fails any clause makes its pair unverified; the stage does not pass until that cell is re-run:

- delete `build/evals/prose-0/p<p>/<cap>/run<n>` and run `bash /home/nn/Projects/failwise/.claude/worktrees/prose/.superpowers/sdd/2026-10-14-prose/run-round.sh 0 <p> <cap> <n>`;
- copy both run directories of the pair, `build/evals/prose-0/p<p>/<cap>/run1` and `run2`, into `build/evals/prose-0-rerun/p<p>/<cap>/` (`evals.js` judges both runs of every pair in its roster and its stability stage reads both);
- judge with `evals.js` and `args.prompts: [<p>]`, `args.capabilities: ["<cap>"]`, `evalsDir: "build/evals/prose-0-rerun"`;
- merge by hand into `build/evals/prose-0/results.json`: replace the pair's two `runs[]` entries and its `stability[]` entry with the re-run file's, setting each merged `runs[].dir` back to the `prose-0` path (eval-report.ts reads `context.json` from `dir`); remove the round's `unverified[]` entries naming the pair or its runs and append the re-run file's; keep the round's `critic` and record the re-run critic's entries in the note;
- regenerate the note and re-append the three sections.

A single disputed criterion, one whose reading the user rules on with a dated rubric paragraph, goes through `rejudge.js` instead, as part B's B7 Step 3 spells out; nothing is re-rolled whose text did not move.

- [ ] **Step 6: Read the premise**

From `results.json`, the c1 scores of the eight prompt-1 and prompt-5 runs. §5.4: the baseline should reproduce the c1 failure (a score below 2) on prompts 1 and 5. Record the eight scores and the per-pair verdicts by §8.1's definition (both runs verified and both at 2) in the message of Step 7. Nothing is graded.

- [ ] **Step 7: Serve the baseline to the user and stop**

Report in one message: the commit the round ran at; the note's path and that its three appended sections are present; the §8.2 outcome per clause with the unverified cells, if any; the c1 scores and whether the premise held; the tier of every phase and that no Fable subagent ran. **This plan ends at that gate.** The user decides whether stage 1 (part B) starts, and, if the premise did not hold, what changes first. The note is committed only after the user has read it:

```bash
git add docs/specs/2026-10-14-prose-eval-results-0.md
git commit -F- <<'EOF'
Evals: the prose baseline round of the current text under the isolated, gated harness

Sixteen runs, prompts 1, 5, 6 and 7 at high and medium on deepseek-flash,
judged under rubric 4. Recorded, not graded; the c1 reading is the premise
of stage 1.
EOF
```
