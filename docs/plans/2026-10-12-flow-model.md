# Flow model Implementation Plan, part A: the format, the rules, the report, the update mode and the prose

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the fmea-software analysis document the flow model the design fixes: an optional top-level `flows[]` and an optional `chains[].flows`, seven invariants, four machine lints and three reviewer rules, the Severity blast-radius denominator read over a named flow's population (`max(flow class, function class)`), a Flows section and a chain annotation in the report, a `flow-changed` stale reason with a flow diff and its guards in the update mode, and the reference prose that teaches all of it.

**Architecture:** The schema change lands with the type surface and the stale-reason word map in one commit (A1), because `tsc` refuses a `StaleReason` member without a `STALE_REASON_WORDS` key. The rules follow (A2, A3) and then the reference prose that documents them (A4 to A8): each reference file is its own task because each carries its own provenance tags and its own checked sentence. The fixtures gain `flows[]` and the scales-version bump (A9) before the report renders them (A10, A11). The update mode follows the same order: the diff (A12), its guards (A13), then the corrected acceptance rule (A14). A15 and A16 close the model: the DF3 reading fixtures and the shipped docs and version. Part B, `2026-10-12-flow-model-evals.md`, holds §8.1, the evals, which spend model time and end at a user gate.

**Tech Stack:** TypeScript run directly by Node 24.2 or later (`node:test`, `node:assert/strict`), the plugin's own scripts under `skills/fmea-software/scripts/`, a JSON Schema subset interpreted by `lib/schema.ts`, Playwright through `tools/check-browser.ts`, `tools/compare.ts` and `tools/shots.ts`, and the dev checkers `tsc`, `oxlint` and `fallow` through `tools/check.ts`.

**Spec:** `docs/specs/2026-10-12-flow-model-design.md` at commit 798a310 on branch `flow-model` (all paths in this plan are relative to the failwise checkout, `/home/nn/Projects/failwise`). The plan argues from the spec and quotes it as §N; executors read both. The main design, `docs/specs/2026-09-07-fmea-software-design.md`, describes what exists today. The register rows C161–C201 this design cites are already in `skills/fmea-software/references/provenance.md` on this branch (commits 509536a, c6f3cfc, 92e8ebc), so §10's three prerequisites are met and no task here lands a register row.

## How to read this plan

- Tasks A1 to A16 run in order on branch `flow-model`. Task ids are the only names used across tasks; each task's **Interfaces** block names what it consumes from earlier tasks and what later tasks rely on, with exact signatures.
- Both plan files are committed on `flow-model` before A1 begins, so the clean-tree checks hold. The plan files are not edited during execution; progress is tracked in the controller's ledger, so every clean-tree check means exactly that.
- Line numbers in **Files** blocks are those of commit 798a310. Earlier tasks shift them, so every edit also quotes the anchor text to find.
- Commands written with `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node ...` are for the implementing agent's shell, which may have no Node on PATH. The two runners also run as `bun tools/run-tests.ts` and `bun tools/check.ts`, which find Node 24 through nvm. None of these is a user-facing command; the shipped documents keep the forms `CLAUDE.md` prescribes.
- A step that says "watch it fail" names the failure it expects. A test that passes before the change is a regression pin and is named as such.
- A task that changes the renderer or a module the renderer imports runs a browser check before its commit: A9 to A11 change the rendered bytes of the checkout fixture, so their commits run `node tools/check-browser.ts` and `node tools/compare.ts --base HEAD` and read every changed view in `build/compare/summary.md`. A1 changes a module the renderer imports but only its stale-reason word map, which no rendered byte of the checkout fixture uses (the fixture carries no stale row), so its commit runs `node tools/compare.ts --base HEAD` and expects the two reports to be byte for byte the same. A2, A3 and A12 to A15 change no rendered byte and run neither: A2 and A3 add rules that fire on no row of the checkout fixture, which carries no flows, and the report prints the fixture's stored `computed` block rather than recomputing it; A12 to A14 are `update-diff.ts` and its rules, which `render.ts` does not import; A4 to A8 are the reference prose and `SKILL.md`; A15 is tests and `test-helpers.ts`. A16 regenerates the golden fixture's `computed`, so its commit runs the gate. A change you did not intend is a finding.
- Model tiering: task drafting, implementation and per-task critique run on the strongest available coding model or one tier below it. One acceptance judge over the branch at the end of A16 runs on the strongest available model and is the only top-tier call in this plan. A run report names each phase's tier and the number of top-tier agents.

## Global Constraints

Every task's requirements include this section.

- Runtime: Node 24.2 or later. Before every commit `node tools/run-tests.ts` and `node tools/check.ts` both exit 0. The first runs both suites under `node --test`, with the file lists built by the script, and exits 1 when a suite has no test file or a folder cannot be listed. The second runs `tsc`, `oxlint` and `fallow`, and exits 1 on any finding or a missing tool. A runner that dies or is skipped counts as unverified, never as a pass.
- Browser checks: `node tools/check-browser.ts` and `node tools/compare.ts` run before every commit that changes `skills/fmea-software/assets/report-template.html` or the renderer. `EXPECTED_FAILURES` and `NOT_ASSERTED` in `dev/browser/matrix.ts` stay empty. Read `build/compare/summary.md` and every changed view; a change you did not intend is a finding.
- No dependency and no lockfile in the root `package.json`. Checkers live only in `dev/package.json`.
- Every user-facing command behaves the same in bash and fish, with no unquoted glob and no `source ~/.nvm/nvm.sh` line documented as a user command.
- No AI attribution in any commit or pull request: no `Co-Authored-By` naming an AI, no "Generated with" line, no session trailer. Commits stay local; nothing is pushed by Claude. Every brief to a subagent that commits must say so.
- Provenance: every sentence in `skills/fmea-software/references/` and `SKILL.md` ends in a tag from `references/provenance.md`'s five-tag vocabulary (`sourced:C###`, `paraphrased:C###`, `adapted-from:C###`, `cites:C###`, `skill-authored`). A wholly new sentence is `[skill-authored]`; a changed sentence keeps its existing tags. Nothing from the private repository enters `skills/` beyond what the tags allow.
- Never ship licensed table content: no AIAG-VDA cell values and no adapted Google SRE Book text. C201 (Azure WAF RE:02) is `proprietary-paraphrase-only`: only the bare tier labels `High`, `Medium` and `Low` may appear, never Azure's tier descriptions, and no sentence may be a paraphrase of Azure's wording beyond the three bare labels.
- Nothing specific to a consuming application enters the plugin.
- Exact values this plan ships, quoted from the spec:
  - the schema `$id` **stays** `urn:fmea-software:schema:fmea:v3` (§4); the change is additive.
  - `meta.scales.version` **1 → 2** and `skills/fmea-software/references/scales-software.md:3` **`scales version: 1` → `scales version: 2`** (DF6).
  - `INVARIANT_RULES` **32 → 39**; `MACHINE_RULES` **14 → 18** and `quality-and-lint.md`'s "The machine lints the scripts implement are **fifteen**" → **nineteen** (the eighteen rules plus `priority-table-property`).
  - the seven invariant ids: `flow-id-unique`, `chain-flow-resolves`, `flow-step-resolves`, `chain-flows-unique`, `flow-users-required`, `flow-sources-required`, `flow-users-review-by-date` (§4.3).
  - the four lint ids: `chain-flow-step-mismatch`, `chain-flow-no-steps`, `chain-flow-rationale-unnamed`, `flow-users-provisional` (§4.4).
  - the three reviewer-rule ids: `chain-flow-effect-consistency`, `chain-flow-shared-provider`, `flow-referent-unsourced` (§4.4).
  - the stale reason order, one order, everywhere: `element-changed`, `function-changed`, `flow-changed`, `control-removed`, `scales-version` (§5.4).
  - DF4's sentence, byte for byte, in its three sites: `a flow-value priority label: not a rating, not a criticality analysis, not a safety or hazard analysis, and not a reliability target`
  - the radius floor: the class is `max(flow class, function class)`, whose second term is *the class this same chain reads with no flow named* (§2 DF3).
  - the anchor rows that name a radius class are **ratings 2 to 10** in `scales-software.md`'s Severity table; rating 1 names no radius class (§6).
- Test style: top-level `test("<sentence naming the rule id first>", () => {...})` from `node:test`, `import assert from "node:assert/strict"`, and no describe blocks. Builders and loaders come from `scripts/test-helpers.ts`. Tests for `lib/x.ts` live flat in `scripts/x.test.ts`. Tests that need `INVARIANT_RULES` or `MACHINE_RULES` live under `skills/fmea-software/scripts/`. Nothing under `tools/` imports from `skills/fmea-software/scripts/`.
- Ordering contracts: `errors[]` comes in `INVARIANT_RULES` order, then `checkPriorities`; lints come in `MACHINE_RULES` order, then each rule's document order, then `tablePropertyLints`; ids compare byte for byte and a duplicate resolves to its first occurrence in document order.
- fallow (`.fallowrc.json`): entry files are `skills/fmea-software/scripts/*.ts` (which takes in `test-helpers.ts` and every `*.test.ts`), `tools/*.ts` and `dev/browser/*.ts`; `includeEntryExports` is true, so an entry file exports a value only when another file imports it in the same task and keeps it module-private until then; duplicates threshold 0.01 with minTokens 50, minLines 5; health maxCyclomatic 20, maxCognitive 15; `complexity-cyclomatic` and `complexity-cognitive` are at error and `complexity-crap` is off; `failOnParseError` is true. Build each new multi-output function from small private helpers.
- tsc: strict, noEmit, module nodenext, `allowImportingTsExtensions` (imports carry `.ts`), `erasableSyntaxOnly` (no enum, no parameter properties), `verbatimModuleSyntax` (type-only imports use `import type`).
- Escaping: every new string the report prints passes through `escapeHtml` (render.ts `e()`). The renderer only escapes and emits; derivation lives in `report-model.ts`.
- Commit subject style: `<Area>: <lower-case clause>` or a plain sentence, with no trailing period and no `(#NN)`. The body is prose wrapped near 72 columns; where a step gives `-m`, the implementer writes the body through `git commit -F- <<'EOF'`.
- Line/pointer conventions: an issue prints as `error <CODE>: <rule>: <message> at <pointer>`; a lint prints as `<severity> <rule>: <message>` with no pointer.

## Review Focus

Five input classes or failure conditions the spec implies but no task's own tests name first. Each line gives the behaviour a reasonable person would expect and the task whose tests pin it.

1. **`"flows": []`.** A person who wants no flows will delete the key; writing an empty array is refused at `/flows` with `array has 0 item(s), fewer than the minimum 1`, because `minItems: 1` is what makes "absent" the one way to say "no flows" (§4.1). A1 pins the message.
2. **An unnamed flow with neither `users` nor `steps`.** A flow no chain names may carry only `id`, `name` and `value_priority` and must validate with no `INVARIANT` line and no lint; a chain-named flow with neither draws the two rules instead. A2 and A3 pin both directions: `flow-users-required` must key on *a chain naming the flow*, not on the flow's presence.
3. **A chain-named flow with `steps: []` and `steps_partial: true`.** Exactly one finding, `chain-flow-no-steps`; the bare boolean may not defeat it (§2 DF2), and the defect is reported once, not twice by `chain-flow-step-mismatch` as well. A3 pins the single finding and its pointer.
4. **A Severity rationale that names the flow by its human name.** `chain-flow-rationale-unnamed` fires: the rule reads flow **ids** in the rationale's prose, so `checkout` satisfies it and "the checkout journey" does not. A3 pins both.
5. **A `users.share` written as a number, or a bare count in `population`.** `share` is a string because it names what the fraction is measured against; `5000` or `0.4` is refused at `/flows/0/users/share` with `expected type string, got number`, and a count that reaches `population` passes the schema and is caught by the reviewer rule `flow-referent-unsourced` instead (§4.1). A1 pins the schema refusal; A4 pins that the reviewer row exists and records an open assumption; A15 pins that a document carrying such a population still validates, and nothing machine-checks the judgement half, which the acceptance note records. It is named here rather than left silent because a run that writes a count into `population` gets no refusal at all.

## Decisions for the user at plan review

The spec left these open, or this plan departs from its letter. Each states the plan's answer and is reversible in one sentence if the user rules the other way.

1. **The band-setting flow is the first entry of `chains[].flows`.** §5.3 requires the chain annotation to mark "the flow whose band was used", but the tool cannot read the Severity rationale (S3: no effect-statement grammar) and cannot compute a radius class. The plan makes the authored choice machine-readable positionally — the first id in `chains[].flows` is the one the rationale names as having set the band — the same way `dependency-pair-unique` and first-occurrence id resolution make authored choices readable. A1's `chains[].flows` description states it, A11 marks it, and A11's test pins both orders (first entry and a later entry). If declined, the annotation marks every named flow and says which was used in the rationale's words, and A11 changes only.
2. **A chain-named flow with empty `steps` draws `chain-flow-no-steps` alone.** §4.4 reads both ways — "an empty prefix cannot silence it — that case is the next rule's" — and the plan reads it as the dedicated rule's case, one finding, on `quality-and-lint.md`'s own "the defect is reported once" convention. A3 pins it. If declined, `chain-flow-step-mismatch` fires there too and A3 adds the second expected finding.
3. **The DP4 sentence's lead-in is lower-case in all three sites.** The pinned string is `a flow-value priority label: not a rating, not a criticality analysis, not a safety or hazard analysis, and not a reliability target`, so each site embeds it mid-sentence ("Priority here is a flow-value priority label: …") rather than capitalising it. A1, A7 and A10 pin the byte-identical string in its three sites. If declined, the pinned string is capitalised and the three sites change together.
4. **`value_priority` stays required on every flow.** §7's C201 admission dissolved the panel's "optional until the tier has a record" request (the register row is on this branch). A1 keeps it in `required`. If declined, A1 removes it from `required` and the schema description says why.
5. **The machine lints carry no fault code.** §11 criterion 1 says the lints fire "under the … lint codes respectively", but `Lint` has no `code` field and every existing lint prints as `<severity> <rule>: <message>` (A3 follows the machinery, not the sentence). If declined, `codes.ts` gains a lint code and `CODES` grows its own pin test, which is a change of its own.
6. **Four files the spec does not name move with the change.** `evals/rubric.md`'s c8 criterion lists the report's section ids in order, so the Flows section's id joins that list (A10); `docs/scripts.md`'s `update-check.ts` paragraph describes the printed sections and the stale reasons, so it gains the flow sections (A16); `README.md`'s lines that enumerate the document's parts or the report's sections gain flows where the list is closed (A16); and the main design `docs/specs/2026-09-07-fmea-software-design.md` gains dated amendment notes for the parts this design changes, as the element-kinds and multi-codebase designs did (A16). If declined, A10 leaves rubric.md's c8 list as it is and the criterion reads a report with a section it does not name, and A16 shrinks to the version bump.
7. **The plugin version moves 0.6.0 → 0.7.0.** §11 states no version, but the document format gains an authored part and the scales version bumps, so a released 0.7.0 is what tells a reader their stored analysis predates the flows. A16 changes `PLUGIN_VERSION` and `.claude-plugin/plugin.json` together. If the user renumbers at landing, only A16's two literals and its two doc lines change.

## Assumptions the plan rests on

- The register rows for C161–C201 are in `provenance.md` on `flow-model` and the pre-push audit passes with that branch checked out. No task adds a register row; if the branch is rebased or the rows are moved, every task that cites C161–C201 must be re-checked against the register.
- `minimalDoc()`'s chain is `ch-1` on `fn-1` with `effects.end` "users cannot check out", `ratings` S 8 / O 3 / D 4, priority M, `stale: { flag: false }` and `history: []`. A2, A3 and A14's pinned messages and pointers rely on those defaults.
- `graphDoc(spec)` builds a document from `minimalDoc`, and `GraphSpec` is `{ elements: (string | (Partial<Element> & { id: string }))[]; edges?: DependencyEdge[]; chains?: [chainId: string, elementId: string][]; links?: [consumer: string, provider: string][] }` as `test-helpers.ts:273-278` declares it (`elements` is required; a chain is a `[chain id, element id]` pair). A12 to A14 extend its spec type with flows; they do not change the documents existing callers build.
- The checkout fixture's `functions[]` already carry ids for the checkout, pricing, payment-gateway and order-store functions, so A9's `steps[]` name existing ids and no function is invented.
- A9's regenerated `computed` blocks record the `PLUGIN_VERSION` of the commit that writes them (0.6.0 until A16, 0.7.0 after). A16 regenerates the golden fixture's `computed` block again after the bump, so the shipped fixture never records a version the manifest does not.
- `quality-and-lint.md`'s two id sentences are pinned one line each by `idsOf(opening)`, which finds the single line starting with the opener. A4's three new sentences each start with a unique opener, so the helper keeps working; A5's scales-software.md sentence does the same in a second file read by the same test file.
- The anchors of the edits in A5 to A8 are the lines quoted in each task, at commit 798a310. A5's blast-radius paragraph is one long physical line (`scales-software.md:43`), so its edits are inside that line.

---

### Task A1: The schema, the type surface and the stale-reason word map

**Files:**
- Modify: skills/fmea-software/schemas/fmea.schema.json:5, 35-41, 295-320 (after `$defs/codebase`), 813-834, 856-943
- Modify: skills/fmea-software/scripts/lib/types.ts:14, 54-58, 61
- Modify: skills/fmea-software/scripts/lib/report-model.ts:308-314
- Test: skills/fmea-software/scripts/schema.test.ts:265-274, 386-387, 572-599, 664-697, 699-759
- Test: skills/fmea-software/scripts/report-model.test.ts:344-357
- Test: skills/fmea-software/scripts/codes.test.ts:386-393

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `"$id"` unchanged: `urn:fmea-software:schema:fmea:v3`; root `"required"` unchanged: `["meta", "elements", "functions", "dependencies", "chains"]`; `properties` in the order `meta`, `elements`, `functions`, `dependencies`, `chains`, `flows`, `computed`, where `flows` is `{ "type": "array", "description": …, "minItems": 1, "items": { "$ref": "#/$defs/flow" } }`
  - `$defs.flow` and `$defs.flowUsers`, placed after `$defs.codebase`, with the shapes and descriptions Step 3 gives
  - `$defs.chain.properties.flows`: `{ "type": "array", "description": …, "items": { "$ref": "#/$defs/plainId" } }`, inserted after `function`, and **not** in `$defs.chain.required`
  - `$defs.stale.properties.reason.enum` gains `"flow-changed"` third, and its `description`'s order sentence names all five in order
  - types.ts: `export type ValuePriority = "High" | "Medium" | "Low"`, `export interface FlowUsers { population: string; share?: string; selecting_condition?: string; review?: RatingReview }`, `export interface Flow { id: string; name: string; value_priority: ValuePriority; sources?: Source[]; users?: FlowUsers; steps?: string[]; steps_partial?: boolean }`, `export type StaleReason = "element-changed" | "function-changed" | "flow-changed" | "control-removed" | "scales-version"`, `Chain.flows?: string[]`, `FmeaDocument { meta; elements; functions; dependencies: DependencyEdge[]; chains; flows?: Flow[]; computed? }`
  - `report-model.ts`: `STALE_REASON_WORDS` gains `"flow-changed": "a flow it names changed"`
  - `codes.test.ts` `TYPE_NAMES` gains `"ValuePriority"`, `"FlowUsers"`, `"Flow"`

- [ ] **Step 1: Write the failing schema and type tests**

In `schema.test.ts`, replace the pin at line 267-268 with the six-part version, and extend it with the two refusals that carry `flows`:

```ts
test("the top level is six authored parts in order, with flows optional between chains and computed", () => {
  const schema = loadSchema();
  assert.deepEqual(schema.required, ["meta", "elements", "functions", "dependencies", "chains"]);
  assert.deepEqual(Object.keys(schema.properties as object), ["meta", "elements", "functions", "dependencies", "chains", "flows", "computed"]);
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  doc.flows = [];
  const issues = checkSchema(doc);
  assert.deepEqual(issues.map((i) => i.pointer), ["/flows"]);
  assert.equal(issues[0].message, "array has 0 item(s), fewer than the minimum 1");
});
```

After it, add the flow shape cases:

```ts
test("a flow carries id, name and value_priority, rejects an undeclared key, and takes users, steps and steps_partial", () => {
  const schema = loadSchema();
  const flow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: "flow-checkout", name: "Checkout submission", value_priority: "High", ...over });
  const withFlows = (f: Record<string, unknown>): Record<string, unknown> => {
    const doc = minimalDoc() as unknown as Record<string, unknown>;
    doc.flows = [f];
    return doc;
  };
  assert.deepEqual(checkSchema(withFlows(flow())), []);
  assert.deepEqual(
    checkSchema(withFlows(flow({ value_priority: "Critical" }))).map((i) => [i.pointer, i.message]),
    [["/flows/0/value_priority", 'value "Critical" is not one of "High", "Medium", "Low"']],
  );
  assert.deepEqual(checkSchema(withFlows(flow({ steps: ["fn-1"], steps_partial: true, users: { population: "all shoppers at checkout", share: "a majority of checkouts in the incident", selecting_condition: "a locale", review: { status: "provisional" } }, sources: [{ kind: "document", ref: "checkout-inputs.md" }] }))), []);
  assert.deepEqual(checkSchema(withFlows(flow({ users: { population: "all shoppers" }, extra: 1 }))).map((i) => i.message), ['unexpected property "extra"']);
  assert.deepEqual(checkSchema(withFlows(flow({ value_priority: "High", users: { share: 0.4 } }))).map((i) => [i.pointer, i.message]), [["/flows/0/users/share", "expected type string, got number"]]);
  assert.deepEqual(checkSchema(withFlows({ id: "flow-x", name: "X" })).map((i) => i.message), ['missing required property "value_priority"']);
});

test("chains[].flows is an array of ids and is optional on every chain", () => {
  const schema = loadSchema();
  const withChainFlows = (flows: unknown): Record<string, unknown> => {
    const doc = minimalDoc() as unknown as Record<string, unknown>;
    (doc.chains as Record<string, unknown>[])[0].flows = flows;
    return doc;
  };
  assert.deepEqual(checkSchema(withChainFlows(["flow-checkout"])), []);
  assert.deepEqual(checkSchema(withChainFlows([])), []);
  assert.deepEqual(checkSchema(withChainFlows("flow-checkout")).map((i) => [i.pointer, i.message]), [["/chains/0/flows", "expected type array, got string"]]);
});
```

Change the description pin at line 386-387 to `assert.ok(text(schema).includes("Six parts are authored (meta, elements, functions, dependencies, chains, flows)"));`, keep `assert.ok(!text(schema).includes("fifth part"));`, and add:

```ts
  assert.ok(text(schema).includes("a flow-value priority label: not a rating, not a criticality analysis, not a safety or hazard analysis, and not a reliability target"));
```

In `derivationDoc()` (line 572), instantiate every new constrained node — `flows`, `flows[0].sources`, `flows[0].users` and `flows[0].users.review` — with one call each:

```ts
  (doc as unknown as Record<string, unknown>).flows = [
    { id: "flow-1", name: "Derived flow", value_priority: "Low", steps: ["fn-1"], steps_partial: true,
      sources: [{ kind: "interview", ref: "the operations lead" }],
      users: { population: "internal only: operators", review: { status: "rescored", by: "R. Viewer", date: "2026-09-07" } } },
  ];
  doc.chains[0].flows = ["flow-1"];
```

In `report-model.test.ts`, change the test at line 344 to five reasons and add the fifth case in the same document order:

```ts
test("stale notice: the five reasons in words", () => {
  const model = modelOf(docOf(
    { stale: { flag: true, reason: "element-changed", since_version: 2 } },
    { stale: { flag: true, reason: "function-changed", since_version: 3 } },
    { stale: { flag: true, reason: "flow-changed", since_version: 2 } },
    { stale: { flag: true, reason: "control-removed", since_version: 2 } },
    { stale: { flag: true, reason: "scales-version", since_version: 2 } },
  ));
  assert.deepEqual(model.rows.map((r) => r.staleNotice), [
    "Stale since version 2: its element changed.",
    "Stale since version 3: its function changed.",
    "Stale since version 2: a flow it names changed.",
    "Stale since version 2: a control it relied on was removed.",
    "Stale since version 2: the scales changed.",
  ]);
});
```

In `codes.test.ts`, add `"ValuePriority", "FlowUsers", "Flow"` to `TYPE_NAMES` beside `"Source"`. The presence-only test then requires the three exports to exist.

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/schema.test.ts`
Expected: FAIL — `assert.deepEqual` over the top-level key list shows `flows` missing, and `checkSchema` reports `unexpected property "flows"`. `report-model.test.ts` and `codes.test.ts` fail on the missing fifth reason and the three missing exports.

- [ ] **Step 3: Write the schema, the types and the word**

In `fmea.schema.json`, add to `properties` after `chains` and before `computed`:

```json
    "flows": {
      "type": "array",
      "description": "The critical user and system flows this analysis follows: a use-case grouping of functions that a user-valued journey names. Absent when the run authors none, which is the only way to say so. A flow carries no rating; where a chain names one, it supplies the Severity blast-radius population, as references/scales-software.md states. Flows are structure and not a catalog.",
      "minItems": 1,
      "items": {
        "$ref": "#/$defs/flow"
      }
    },
```

Add `$defs.flow` and `$defs.flowUsers` after `$defs.codebase` (line 320):

```json
    "flow": {
      "title": "Flow",
      "description": "One critical user or system flow. It is not an operational phase or mode, not a function, not a failure condition and not a hazardous event; references/methodology.md states its role. A flow is not a rating and drives none.",
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "name", "value_priority"],
      "properties": {
        "id": {
          "$ref": "#/$defs/plainId",
          "description": "Opaque identifier, unique in the document (invariant flow-id-unique) and compared byte for byte like an element or function id, so a rename is a removal and an addition."
        },
        "name": {
          "$ref": "#/$defs/nonEmptyString",
          "description": "The flow's name, as the inputs give it."
        },
        "value_priority": {
          "enum": ["High", "Medium", "Low"],
          "description": "The flow's value-priority tier. It is a flow-value priority label: not a rating, not a criticality analysis, not a safety or hazard analysis, and not a reliability target. Used for sort and filter only; the report's row order is presentational and ranks nothing."
        },
        "sources": {
          "type": "array",
          "description": "Where knowledge of the flow came from, in the shape elements[].sources uses. Any flow a chain names carries at least one entry whose kind is not catalog (invariant flow-sources-required): the Severity denominator must be evidence, and a catalog row alone does not ground a population.",
          "items": {
            "$ref": "#/$defs/source"
          }
        },
        "users": {
          "$ref": "#/$defs/flowUsers",
          "description": "The referent population the Severity blast radius is read over. Required of any flow a chain names (invariant flow-users-required); absent on a flow no chain names."
        },
        "steps": {
          "type": "array",
          "description": "The functions the flow passes through, in order, best effort; a linear sequence, and each id resolves to a function (invariant flow-step-resolves).",
          "items": {
            "$ref": "#/$defs/plainId"
          }
        },
        "steps_partial": {
          "type": "boolean",
          "description": "true while the recorded steps are a prefix and the flow continues past what is written. It records documentation extent only, never that the flow survives a failure, and it silences the mismatch warning only where a prefix is actually recorded."
        }
      }
    },
    "flowUsers": {
      "title": "Flow referent population",
      "description": "The population a flow's Severity blast radius is read over. Free text that moves a band, so it is a reviewable claim: its evidence is the flow's sources[], its status is review.status, and the reviewer rule flow-referent-unsourced fires where it is not grounded in what the run collected.",
      "type": "object",
      "additionalProperties": false,
      "required": ["population"],
      "properties": {
        "population": {
          "$ref": "#/$defs/nonEmptyString",
          "description": "A label, never a number: for example all shoppers at checkout, or internal only: the reconciliation operators. A count stays in the incident record and only its fraction in share. A population named as one client, tenant or locale is this field, not selecting_condition, and a flow whose population is one named client reads the majority radius."
        },
        "share": {
          "$ref": "#/$defs/nonEmptyString",
          "description": "A fraction an incident record states, naming what it is measured against. It raises the radius class and never lowers it; a bare count is not a share."
        },
        "selecting_condition": {
          "$ref": "#/$defs/nonEmptyString",
          "description": "The predicate the inputs quote, which selects part of this flow's own population rather than sizing it: a locale, a retried order, a session at expiry."
        },
        "review": {
          "$ref": "#/$defs/ratingReview",
          "description": "The same status vocabulary a rating's review uses. rescored and authored require by and date (invariant flow-users-review-by-date), so this field gates the denominator rather than gesturing at it; while the whole object is absent, or its status is provisional, the lint flow-users-provisional fires and the report marks the rows resting on this denominator provisional."
        }
      }
    },
```

In `$defs.chain.properties`, insert after `function`:

```json
        "flows": {
          "type": "array",
          "description": "The flows this chain breaks, in the author's order; the first is the one the Severity rationale names as having set the band. Each id resolves to a flow (invariant chain-flow-resolves) and no flow is named twice (invariant chain-flows-unique). Absent or empty means the chain names no flow and Severity's blast radius falls back to the function's users.",
          "items": {
            "$ref": "#/$defs/plainId"
          }
        },
```

In `$defs.stale.properties.reason`, add `"flow-changed"` third in the `enum` (after `"function-changed"`) and change the description to name all five in order: `"Present when flag is true (invariant stale-without-reason): the first rule that fired, in the order element-changed, function-changed, flow-changed, control-removed, scales-version."`

Fix the root description (line 5): `Five parts are authored (meta, elements, functions, dependencies, chains)` becomes `Six parts are authored (meta, elements, functions, dependencies, chains, flows)`, the clause about chains ends `, and flows are the critical user and system flows a chain may name`, and `A sixth part, computed` becomes `A seventh part, computed`.

Two further descriptions drift with the same change, as §5.1 names. `$defs.stale.properties.flag`'s text becomes `true while the row's ratings predate a change to its element, its function, a flow it names, its control inventory or the scales.` And `$defs.historyEntry.properties.change`'s text names flows where it lists what an update's summary covers: `… an update's summary of the elements, functions and flows added, removed or changed and the rows marked stale …`. `schema.test.ts` pins the top-level description and the key order; these two are prose the acceptance judge reads.

In `types.ts`, change line 14 to the five-member `StaleReason`, add `export type ValuePriority = "High" | "Medium" | "Low";` beside `SourceKind`, add `export interface FlowUsers { population: string; share?: string; selecting_condition?: string; review?: RatingReview }` and the `Flow` interface beside `Chain`, add `flows?: string[]` to `Chain`, and `flows?: Flow[]` to `FmeaDocument` between `chains` and `computed`. Do not add a runtime export to `types.ts`: `codes.test.ts` asserts the module loads with `Object.keys(mod)` empty.

In `report-model.ts`, add the fifth entry to `STALE_REASON_WORDS` between `"function-changed"` and `"control-removed"`: `"flow-changed": "a flow it names changed",`.

Leave `render.ts:28` and `:40` as they are: "The design or the scales changed after the row was rated" and its sibling already read true for a flow change ("the design"), and `render.test.ts:93` pins them.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/schema.test.ts skills/fmea-software/scripts/report-model.test.ts skills/fmea-software/scripts/codes.test.ts`
Expected: PASS, except the derivation test if the drift floors need moving — which Step 5 does.

- [ ] **Step 5: Move the drift floors to the measured values**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/schema.test.ts 2>&1 | grep 'expected at least'`
Read the two measured totals from that message and set the floors at `schema.test.ts:743` and `:759` following the file's own convention, which its comment at lines 715-758 states (`derived` floor is the measured total less 56; the `minLength` floor is the measured total). The schema gains `$defs/flow` and `$defs/flowUsers` with one `required` list, one `enum`, one `format`-free `minLength`-bearing `$ref` chain and two array `items`, so both totals rise; write the measured values, not a guess.

- [ ] **Step 6: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0; `run-tests.ts` reports `# fail 0` for both suites. `check.ts` is what proves the `StaleReason` member and the `STALE_REASON_WORDS` key moved together.

- [ ] **Step 7: Browser comparison over the renderer's import graph**

Run: `node tools/compare.ts --base HEAD`
Expected: exit 0, and the summary says the two reports are byte for byte the same — this task changes a module `render.ts` imports but no rendered byte of the checkout fixture, which carries no stale row.

- [ ] **Step 8: Commit**

```bash
git add skills/fmea-software/schemas/fmea.schema.json skills/fmea-software/scripts/lib/types.ts skills/fmea-software/scripts/lib/report-model.ts skills/fmea-software/scripts/schema.test.ts skills/fmea-software/scripts/report-model.test.ts skills/fmea-software/scripts/codes.test.ts
git commit -F- <<'EOF'
Schema: the flow model's format, the type surface and the fifth stale reason

flows[] and chains[].flows are optional, so every v3 document still
validates and $id stays v3. StaleReason and STALE_REASON_WORDS move
together, which is what makes the type check fail rather than the
report print undefined.
EOF
```

### Task A2: The seven invariants

**Files:**
- Modify: skills/fmea-software/scripts/lib/invariants.ts:9-42 (the rule list), 337-368 (`checkInvariants`), 46-63 (helpers)
- Modify: skills/fmea-software/scripts/lib/graph.ts (not modified; see Step 3 for why the flow index stays in `invariants.ts`)
- No change: skills/fmea-software/scripts/validate.ts, which calls `checkInvariants` and `runLints` and so picks the new rules up through `INVARIANT_RULES` and `MACHINE_RULES` with no edit of its own
- Modify: skills/fmea-software/references/quality-and-lint.md:24
- Test: skills/fmea-software/scripts/invariants.test.ts:36-49, and the new cases after line 143
- Test: skills/fmea-software/scripts/quality-and-lint.test.ts (green, unchanged — it is the falsifier)

**Interfaces:**
- Consumes: `Flow`, `FlowUsers` and `Chain.flows` from A1; `INVARIANT_RULES`'s shape and the `invariant(rule, message, pointer)` helper.
- Produces: `INVARIANT_RULES` with 39 entries, the seven flow ids inserted after `element-codebase-resolves` in this order — `flow-id-unique`, `chain-flow-resolves`, `flow-step-resolves`, `chain-flows-unique`, `flow-users-required`, `flow-sources-required`, `flow-users-review-by-date` — and `checkInvariants` emitting them in that order.

- [ ] **Step 1: Write the failing tests**

In `invariants.test.ts`, extend the order pin at line 36-49 with the seven ids after `"element-codebase-resolves"` and change `assert.equal(INVARIANT_RULES.length, 32)` to `39`. Add the seven cases:

```ts
test("flow-id-unique flags the second flow with the same id", () => {
  const doc = minimalDoc();
  doc.flows = [
    { id: "flow-1", name: "One", value_priority: "High" },
    { id: "flow-1", name: "One again", value_priority: "Low" },
  ];
  assert.deepEqual(found(checkInvariants(doc), "flow-id-unique"), [["/flows/1/id", "flow id flow-1 is used more than once"]]);
});

test("chain-flow-resolves flags a chain naming a flow that does not exist", () => {
  const doc = minimalDoc();
  doc.chains[0].flows = ["flow-ghost"];
  assert.deepEqual(found(checkInvariants(doc), "chain-flow-resolves"), [["/chains/0/flows/0", "flow flow-ghost does not exist"]]);
});

test("flow-step-resolves flags a flow step that is not a function", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High", steps: ["fn-1", "fn-ghost"] }];
  assert.deepEqual(found(checkInvariants(doc), "flow-step-resolves"), [["/flows/0/steps/1", "function fn-ghost does not exist"]]);
});

test("chain-flows-unique flags the second naming of the same flow on one chain", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High" }];
  doc.chains[0].flows = ["flow-1", "flow-1"];
  assert.deepEqual(found(checkInvariants(doc), "chain-flows-unique"), [["/chains/0/flows/1", "flow flow-1 is named more than once by chain ch-1"]]);
});

test("flow-users-required fires on a chain-named flow without users and accepts one no chain names", () => {
  const doc = minimalDoc();
  doc.flows = [
    { id: "flow-1", name: "One", value_priority: "High" },
    { id: "flow-2", name: "Two", value_priority: "Low" },
  ];
  doc.chains[0].flows = ["flow-1"];
  assert.deepEqual(found(checkInvariants(doc), "flow-users-required"), [["/flows/0/users", "flow flow-1 is named by chain ch-1 and needs users with a population"]]);
  doc.flows[0].users = { population: "   " };
  assert.deepEqual(found(checkInvariants(doc), "flow-users-required"), [["/flows/0/users/population", "flow flow-1 is named by chain ch-1 and needs users with a population"]]);
  doc.flows[0].users = { population: "all shoppers at checkout" };
  assert.deepEqual(only(checkInvariants(doc), "flow-users-required"), []);
});

test("flow-sources-required wants one non-catalog source on a chain-named flow", () => {
  const doc = minimalDoc();
  doc.flows = [
    { id: "flow-1", name: "One", value_priority: "High", users: { population: "all shoppers" }, sources: [{ kind: "catalog", ref: "cat-service-01" }] },
    { id: "flow-2", name: "Two", value_priority: "Low", sources: [{ kind: "catalog", ref: "cat-service-01" }] },
  ];
  doc.chains[0].flows = ["flow-1"];
  assert.deepEqual(found(checkInvariants(doc), "flow-sources-required"), [["/flows/0/sources", "flow flow-1 is named by chain ch-1 and needs a source whose kind is not catalog"]]);
  assert.deepEqual(only(checkInvariants(doc), "flow-sources-required").filter((i) => i.pointer.startsWith("/flows/1")), []);
});

test("flow-users-review-by-date wants by and date on a chain-named flow's rescored or authored review", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High", users: { population: "all shoppers", review: { status: "rescored" } } }];
  doc.chains[0].flows = ["flow-1"];
  assert.deepEqual(found(checkInvariants(doc), "flow-users-review-by-date"), [["/flows/0/users/review", "flow flow-1 has status rescored and needs by and date"]]);
  doc.flows[0].users!.review = { status: "provisional" };
  assert.deepEqual(only(checkInvariants(doc), "flow-users-review-by-date"), []);
  doc.flows[0].users!.review = { status: "authored", by: "T. Tester", date: "2026-10-12" };
  assert.deepEqual(only(checkInvariants(doc), "flow-users-review-by-date"), []);
});
```

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/invariants.test.ts`
Expected: FAIL — the order pin reports the thirty-two-entry list, and each new case reports `[]` where a finding is expected.

- [ ] **Step 3: Implement the seven rules**

In `invariants.ts`, insert the seven ids into `INVARIANT_RULES` after `"element-codebase-resolves"`, in the order above. Add three private helpers beside `duplicates` and `securityRationaleIssues`, and one array entry in `checkInvariants` after the codebase group and before the dependency group:

```ts
function flowIdIssues(flows: Flow[]): Issue[] {
  return duplicates(flows.map((f) => f.id), "flow-id-unique", (i) => ptr("flows", i, "id"), "flow");
}

/** The flow ids a chain names, resolved to their first occurrence. */
function namedFlowIds(chains: Chain[], flows: Flow[]): Map<number, { chain: Chain; index: number; flow: Flow }[]> {
  const at = new Map(flows.map((f, i) => [f.id, i]));
  return new Map(chains.flatMap((chain, ci) => {
    const named = (chain.flows ?? []).flatMap((id) => {
      const index = at.get(id);
      return index === undefined ? [] : [{ chain, index: ci, flow: flows[index] }];
    });
    return named.length === 0 ? [] : [[ci, named] as const];
  }));
}
```

The seven rules, in the order the list gives them: `flow-id-unique` uses `duplicates`; `chain-flow-resolves` walks `chains[].flows` against the flow index and points at `/chains/<i>/flows/<j>`; `flow-step-resolves` walks `flows[].steps` against the function index and points at `/flows/<i>/steps/<j>`; `chain-flows-unique` reports each later repeat within one chain's `flows[]` (the `duplicates` shape, over `chain.flows ?? []`, pointing at the later entry); `flow-users-required` fires on a chain-named flow with no `users`, or with a `population` that is absent or blank after `trim()`, pointing at `/flows/<i>/users` for the absent object and `/flows/<i>/users/population` for the blank one; `flow-sources-required` fires on a chain-named flow with no `sources[]` entry whose `kind` is not `catalog`, pointing at `/flows/<i>/sources`; `flow-users-review-by-date` mirrors `rating-review-by-date` over `users.review`, pointing at `/flows/<i>/users/review`.

The a chain-named-flow test is the set `namedFlowIds` returns, so a flow no chain names is checked by none of the last three rules. Build the map once near `indexDocument` at the top of `checkInvariants` and pass it to each helper; do not add flow data to `lib/graph.ts`, whose `DocIndex` serves the lints, the report and the checker and would then need every caller to move.

Update `quality-and-lint.md:24`, the one line beginning `The validator ids a row may name are exactly`, by inserting the seven new ids after `` `element-codebase-resolves` `` in the list, in the same order. `quality-and-lint.test.ts` compares that line with `INVARIANT_RULES` and is the falsifier.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/invariants.test.ts skills/fmea-software/scripts/quality-and-lint.test.ts skills/fmea-software/scripts/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0. `check.ts` reports the new functions under fallow's complexity limits; if `chainFlowIssues` trips `maxCyclomatic`, split the resolution walk out into its own private helper.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/scripts/lib/invariants.ts skills/fmea-software/scripts/invariants.test.ts skills/fmea-software/references/quality-and-lint.md
git commit -F- <<'EOF'
Rules: the seven flow invariants

flow-id-unique, chain-flow-resolves, flow-step-resolves,
chain-flows-unique, flow-users-required, flow-sources-required and
flow-users-review-by-date, which turns users.review from a gesture into
a gate. The reference's validator-id sentence moves with the list it
names.
EOF
```

### Task A3: The four machine lints

**Files:**
- Modify: skills/fmea-software/scripts/lib/lints.ts:153-363 (`MACHINE_RULES`), and the private helpers beside it
- Modify: skills/fmea-software/references/quality-and-lint.md:25 (the count sentence) and the machine-lint group's last row at :239
- Test: skills/fmea-software/scripts/lints.test.ts:33-50 (the rule-order pin), :583-591 (the golden fixture's lint total), and the new cases at the end
- Test: skills/fmea-software/scripts/quality-and-lint.test.ts:22-27 — three things move to nineteen: the `idsOf("The machine lints the scripts implement are fifteen:")` opener string (the reference line it finds becomes "… are nineteen:"), its `assert.equal(ids.length, 15)`, and its test name `names fifteen machine lints`. Leave one of the three behind and the lookup finds no line and asserts on an empty list.

**Interfaces:**
- Consumes: A1's `Flow` and `Chain.flows`; A2's reading of "a chain names the flow"; `MACHINE_RULES`'s `MachineRule` shape and the `lint(rule, severity, pointer, message)` helper.
- Produces: `MACHINE_RULES` with 18 entries, the four flow lints appended in this order — `chain-flow-step-mismatch`, `chain-flow-no-steps`, `chain-flow-rationale-unnamed`, `flow-users-provisional` — all `severity: "warning"`.

- [ ] **Step 1: Write the failing tests**

In `lints.test.ts`, extend the order pin at line 33-50 with the four `["<id>", "warning"]` pairs, and add the cases:

```ts
test("chain-flow-step-mismatch fires when a flow's steps omit the chain's function, unless a prefix is recorded", () => {
  const doc = minimalDoc();
  doc.functions.push({ id: "fn-2", element: "svc", statement: "settle an authorization", conditions: [], for_whom: "clients" });
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High", steps: ["fn-2"] }];
  doc.chains[0].flows = ["flow-1"];
  assert.deepEqual(fired(doc, "chain-flow-step-mismatch"), [["/chains/0/flows/0", "chain ch-1 names flow flow-1, whose steps do not include function fn-1"]]);
  doc.flows[0].steps_partial = true;
  assert.deepEqual(fired(doc, "chain-flow-step-mismatch"), []);
  doc.flows[0].steps = [];
  assert.deepEqual(fired(doc, "chain-flow-step-mismatch"), []);
});

test("chain-flow-no-steps fires on a chain-named flow with empty steps whatever steps_partial says", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High" }];
  doc.chains[0].flows = ["flow-1"];
  const expected = [["/chains/0/flows/0", "chain ch-1 names flow flow-1, which records no steps"]];
  assert.deepEqual(fired(doc, "chain-flow-no-steps"), expected);
  doc.flows[0].steps = [];
  doc.flows[0].steps_partial = true;
  assert.deepEqual(fired(doc, "chain-flow-no-steps"), expected);
  assert.deepEqual(fired(doc, "chain-flow-step-mismatch"), []);
});

test("chain-flow-rationale-unnamed reads ids out of the Severity rationale", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "Checkout submission", value_priority: "High" }];
  doc.chains[0].flows = ["flow-1"];
  assert.deepEqual(fired(doc, "chain-flow-rationale-unnamed"), [["/chains/0/ratings/S", "chain ch-1 names flow flow-1 and its Severity rationale names no flow id"]]);
  doc.chains[0].ratings.S.rationale = "the checkout journey dies, so S is 8";
  assert.deepEqual(fired(doc, "chain-flow-rationale-unnamed"), [["/chains/0/ratings/S", "chain ch-1 names flow flow-1 and its Severity rationale names no flow id"]]);
  doc.chains[0].ratings.S.rationale = "flow-1 dies at majority radius, so S is 8";
  assert.deepEqual(fired(doc, "chain-flow-rationale-unnamed"), []);
});

test("flow-users-provisional fires while a chain-named flow's users.review is absent or provisional", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High", users: { population: "all shoppers" } }];
  doc.chains[0].flows = ["flow-1"];
  const expected = [["/flows/0/users/review", "flow flow-1 is named by chain ch-1 and its population is not yet re-scored by a named person"]];
  assert.deepEqual(fired(doc, "flow-users-provisional"), expected);
  doc.flows[0].users!.review = { status: "provisional" };
  assert.deepEqual(fired(doc, "flow-users-provisional"), expected);
  doc.flows[0].users!.review = { status: "rescored", by: "R. Viewer", date: "2026-10-12" };
  assert.deepEqual(fired(doc, "flow-users-provisional"), []);
});
```

In `quality-and-lint.md`, the line beginning `The machine lints the scripts implement are fifteen:` gains the four new ids after `` `linked-cause-occurrence-drift` `` and before `` `priority-table-property` ``, and its `fifteen` becomes `nineteen`. Extend the last machine row of the group at `:239` with the four rows in `MACHINE_RULES` order, each in the `| Id | Rule | Severity | Records | Enforcement | Provenance |` shape, `warning`, `none`, `machine`, `[skill-authored]`, stating the rule the same way the tests above read it.

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/lints.test.ts skills/fmea-software/scripts/quality-and-lint.test.ts`
Expected: FAIL — the order pin lists fourteen rules and the count pin reports a 15-id list where 19 is expected.

- [ ] **Step 3: Implement the four lints**

Append four entries to `MACHINE_RULES`, each built on a shared private resolver that returns, per chain index, the flows it names with their indices (the reading A2 fixed: a chain naming a flow that does not exist is `chain-flow-resolves`' case and no lint's). The four checks:

- `chain-flow-step-mismatch` — for each chain and each named flow with a non-empty `steps`, flag at `/chains/<i>/flows/<j>` when the chain's function is not in `steps` and `steps_partial` is not `true`. An empty `steps` is not this rule's case.
- `chain-flow-no-steps` — for each chain and each named flow whose `steps` is absent or empty, flag at `/chains/<i>/flows/<j>` whatever `steps_partial` says.
- `chain-flow-rationale-unnamed` — for each chain with a non-empty `flows[]`, flag at `/chains/<i>/ratings/S` when the chain's `ratings.S.rationale` contains none of the named flow ids as a whole token (split on the id grammar `^[A-Za-z0-9][A-Za-z0-9._:-]*$`, so `flow-1` matches in `flow-1 dies` and does not match inside `myflow-1x`).
- `flow-users-provisional` — for each chain-named flow whose `users.review` is absent or whose `status` is `provisional`, flag at `/flows/<i>/users/review`, one finding per flow even when several chains name it.

Give each lint its own comment line stating the defect in one sentence, as the existing fourteen do, and keep each `check(doc)` under the fallow complexity limits by delegating the walk to the shared resolver.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/lints.test.ts skills/fmea-software/scripts/quality-and-lint.test.ts`
Expected: PASS. `lints.test.ts:583-591` still expects the golden fixture's total of 14 lints — the fixture carries no flows until A9, which moves that pin.

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/scripts/lib/lints.ts skills/fmea-software/scripts/lints.test.ts skills/fmea-software/references/quality-and-lint.md
git commit -F- <<'EOF'
Rules: the four flow lints, and the lint count they move to nineteen

The authored chain-to-flow link has a falsifier without deriving the
link: a mismatch warning a prefix can silence, the no-steps case the
prefix cannot, the rationale that must name the flows it ranks, and the
denominator that is not yet re-scored.
EOF
```

### Task A4: quality-and-lint.md — the reviewer rules, the anchor restatement and the stale-reason sentence

**Files:**
- Modify: skills/fmea-software/references/quality-and-lint.md:99 (`catastrophic-severity-anchor`), 206-264 (the third table group and the file's closing sentences)
- Test: skills/fmea-software/scripts/quality-and-lint.test.ts (three added tests, and the file's lead comment gains a clause)

**Interfaces:**
- Consumes: A1's `StaleReason` order and the schema's `reason` enum order; A3's lint ids.
- Produces: `quality-and-lint.md` carrying (a) the three reviewer rows `chain-flow-effect-consistency`, `chain-flow-shared-provider` and `flow-referent-unsourced` in the reviewer group after `linked-pair-severity`, (b) the restated `catastrophic-severity-anchor` row, and (c) the one line the new test reads, its ids backticked as the file's other id sentences are: ``The stale reason set v2 is `element-changed`, `function-changed`, `flow-changed`, `control-removed` and `scales-version`, in that order.``

- [ ] **Step 1: Write the failing tests**

Add to `quality-and-lint.test.ts`, after the two existing tests, reading the schema beside the reference. The file must gain `import { loadSchema } from "./lib/schema.ts";` — it imports only `readFileSync`, `join`, `INVARIANT_RULES`, `MACHINE_RULES` and `SKILL_ROOT` today, so without it the file fails to load before any assertion runs and the expected failure of Step 2 is not the failure observed:

```ts
test("quality-and-lint.md names the stale reason set v2 in the order the schema's enum gives", () => {
  const enumOrder = (((loadSchema().$defs as Record<string, Record<string, unknown>>).stale as Record<string, Record<string, unknown>>).properties.reason as { enum: string[] }).enum;
  assert.deepEqual(idsOf("The stale reason set v2 is"), enumOrder);
  assert.deepEqual(enumOrder, ["element-changed", "function-changed", "flow-changed", "control-removed", "scales-version"]);
});

test("quality-and-lint.md documents the three reviewer rules this revision adds, under their ids", () => {
  const rows = reference.split("\n").filter((l) => /^\| `[a-z0-9-]+` \|/.test(l));
  for (const id of ["chain-flow-effect-consistency", "chain-flow-shared-provider", "flow-referent-unsourced"]) {
    assert.ok(rows.some((r) => r.startsWith(`| \`${id}\` |`) && r.includes("| reviewer |")), `${id} is documented as a reviewer row`);
  }
  assert.ok(rows.find((r) => r.startsWith("| `flow-referent-unsourced` |"))!.includes("open assumption"), "the unsourced rule records an open assumption");
});

test("the top-of-scale anchor row measures over the reference population, not the function's users alone", () => {
  const row = reference.split("\n").find((l) => l.startsWith("| `catastrophic-severity-anchor` |"));
  assert.ok(row, "the anchor row exists");
  assert.ok(row!.includes("the named flow's, where a chain names flows, the function's users otherwise"), "the anchor row is restated in referent terms");
  assert.ok(row!.includes("[adapted-from:C030]"), "the row keeps its provenance tag");
});
```

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/quality-and-lint.test.ts`
Expected: FAIL — `idsOf("The stale reason set v2 is")` reports no such line, `chain-flow-effect-consistency` is not documented, and the anchor row lacks the referent clause.

- [ ] **Step 3: Write the three pieces**

Replace the `catastrophic-severity-anchor` row (`quality-and-lint.md:99`) with the same rule and guidance, restated in referent terms, keeping `blocker | C030 | reviewer | [adapted-from:C030]`:

```
| `catastrophic-severity-anchor` | The top-of-scale severity anchor, adapted from Yuan et al.'s catastrophic-failure definition, is loss of normal access for all or a majority of the reference population — the named flow's, where a chain names flows, the function's users otherwise — or loss of all or a majority of user data; a degraded-but-functional state does not qualify, and the anchor is assessed with the system's existing availability mechanisms in place. | blocker | C030 | reviewer | [adapted-from:C030] |
```

Add the three reviewer rows after `linked-pair-severity` (`:248`), in the shape that row uses (`warning`, `none`, `reviewer`, `[skill-authored]`), each stating its rule in one sentence:

- `chain-flow-effect-consistency` — the chosen flow is named in the Severity rationale, the effect clause is quoted, and where several flows are named each one's loss is stated as a loss of the chain's single end effect, so a chain cannot describe one aggregate while naming several flows.
- `chain-flow-shared-provider` — a chain names more than one flow and their `steps` share a provider function or element across steps, so the run records an open assumption on coupling in `meta.assumptions[]`, owned by `user`, at row time, and rates on the flows as named, exactly as `weak-edges-loss-of-access` does for edges.
- `flow-referent-unsourced` — a chain-named flow whose `users` is not grounded in its `sources[]`, or whose downstream consumers are unstated where the flow is partial, so the run records the gap as an open assumption owned by `user`; the second half is a reviewer judgement and stays one, because `steps_partial` is a whole-flow boolean that cannot identify an async boundary.

Add the one line the first new test reads, in the file's own voice, immediately before the `## Invariants, lints and reviewer rules outside the seven lists` section or at its end:

```
The stale reason set v2 is `element-changed`, `function-changed`, `flow-changed`, `control-removed` and `scales-version`, in that order; a fifth reason joins the set here because a chain may now name flows and a change to a named flow's population moves the Severity denominator. [skill-authored]
```

Change the file's lead comment (`quality-and-lint.test.ts:1`) from "Pins the two id sentences" to "Pins the three id sentences and the two rule groups of references/quality-and-lint.md to the code they list", since the file now pins three sentences.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/quality-and-lint.test.ts`
Expected: PASS.

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/references/quality-and-lint.md skills/fmea-software/scripts/quality-and-lint.test.ts
git commit -F- <<'EOF'
Reference: the flow reviewer rules, the anchor restated in referent terms

The three reviewer rows record an open assumption rather than blocking,
as weak-edges-loss-of-access does; the top-of-scale anchor measures over
the reference population; and the stale reason set is named v2 in one
sentence the schema's enum is checked against.
EOF
```

### Task A5: scales-software.md — the DF3 redefinition, the version bump and its checked sentence

**Files:**
- Modify: skills/fmea-software/references/scales-software.md:3 (`scales version: 1`), 43 (the blast-radius paragraph), 45 (the band sentence), 47, 51-60 (the anchor rows), 110-132 (the Lints and Versioning sections)
- Test: skills/fmea-software/scripts/quality-and-lint.test.ts (a second reference file read, two added tests)

**Interfaces:**
- Consumes: A1's `users.population`/`share`/`selecting_condition` shape; A2's `flow-*` invariant ids; A3's lint ids; A1's stale-reason order.
- Produces: `scales version: 2` at `:3`; the DF3 definition paragraph restating the structural test in flow terms with the floor, the partial-prefix sentence, the single-client sentence per flow and the order of operations; every anchor row that names a radius class (ratings 2–10) and the one that reads "the function's users" (rating 10) carrying the referent wording; and the checked sentence `The anchor rows that name a radius class are 2 to 10 and each was restated in referent terms; rating 1 names no radius class.` whose row list the new test compares with the table.

- [ ] **Step 1: Write the failing tests**

In `quality-and-lint.test.ts`, add a second module-scope read beside `reference`:

```ts
const scales = readFileSync(join(SKILL_ROOT, "references", "scales-software.md"), "utf8");
```

and the two tests:

```ts
test("scales-software.md declares the scales version this revision bumps, once", () => {
  assert.match(scales, /^scales version: 2$/m);
  assert.equal(scales.split("\n").filter((l) => /^scales version: /.test(l)).length, 1);
});

test("scales-software.md restates every anchor row that names a radius class, and its checked sentence lists exactly those rows", () => {
  // Scoped to the Severity table: Occurrence and Detection carry anchor tables of the same shape,
  // and two of their rows read "at majority or subset radius" and "internal-only radius".
  const severity = scales.slice(scales.indexOf("## Severity, 1 to 10"), scales.indexOf("## Occurrence, 1 to 10"));
  const rows = [...severity.matchAll(/^\| (\d+) \| ([^|]*)\|/gm)].map((m) => ({ rating: Number(m[1]), anchor: m[2] }));
  assert.equal(rows.length, 10, "the Severity anchor table has ten rows");
  const radius = rows.filter((r) => /majority|subset|internal.only/i.test(r.anchor)).map((r) => r.rating);
  assert.deepEqual(radius, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const sentence = scales.split("\n").find((l) => l.startsWith("The anchor rows that name a radius class are"));
  assert.ok(sentence, "the checked sentence exists");
  const range = sentence!.match(/^The anchor rows that name a radius class are (\d+) to (\d+)/);
  assert.ok(range, "the sentence states its row range up front");
  const [lo, hi] = [Number(range![1]), Number(range![2])];
  assert.deepEqual(Array.from({ length: hi - lo + 1 }, (_, i) => hi - i), radius);
  const tenth = rows.find((r) => r.rating === 10)!;
  assert.ok(tenth.anchor.includes("the reference population"), "rating 10's population is restated in referent terms");
});
```

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/quality-and-lint.test.ts`
Expected: FAIL — `scales version: 2` is not found, the checked sentence does not exist, and rating 10's anchor still reads "the function's users" unqualified.

- [ ] **Step 3: Rewrite the definition and the rows**

Change `:3` to `scales version: 2`.

Rewrite `:43` (the one physical line) so that it (a) keeps the structural test and the "while the mode is active" scoping, (b) states the flow reading, (c) states the floor, (d) carries the partial-prefix sentence, (e) keeps the stated-share clause with its order fixed, and (f) restates the single-client rule per flow. The paragraph is the design's §6 sentence, expanded to the file's register; the two sentences the new tests read are, byte for byte:

```
When a chain names flows, the radius is read over the affected population of the named flow that yields the highest radius class, never below the class the same chain reads with no flow named: the class is max(flow class, function class), the floor. [skill-authored] Where a chain-named flow's recorded steps are a prefix and do not include the chain's function, the flow's class is read as subset, and that reading takes precedence over the flow's own class. [skill-authored]
```

and

```
The anchor rows that name a radius class are 2 to 10 and each was restated in referent terms; rating 1 names no radius class. [skill-authored]
```

Place the checked sentence at the end of the `## Severity, 1 to 10` section's prose, after the anchor table's lead-in paragraph, where `quality-and-lint.md`'s two id sentences sit in their own file.

Restate each anchor row from 10 to 2 so that its radius reads over the reference population — "the reference population, the named flow's where a chain names flows and the function's users otherwise" — keeping each row's rating, its class, its recovery qualifier, its evidence cell and its provenance tags exactly as they are. Rating 10's "all or a majority of the function's users" becomes "all or a majority of the reference population". Rating 1 names no radius class and does not change.

Add, as `[skill-authored]` one-liners where they belong: in `## Rules common to the three scales`, that flows move no rating except Severity's blast-radius denominator, mirroring the M8 line about strength; in the same section, the one-line disambiguation that "mode" in "while the mode is active" is the operational mode and the failure mode a chain records is a different thing; in `## Versioning` (`:133`), that the bump to 2 is DF3's re-read of the Severity anchor and that `flow-changed` joins the update mode's carry-forward enumeration.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/quality-and-lint.test.ts`
Expected: PASS.

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0. `priority.test.ts:87` and `:104` assert `doc.meta.scales.version, 1` on documents the tests build themselves, so they are unaffected; `priority.test.ts:33` sets version 3 by hand and stays.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/references/scales-software.md skills/fmea-software/scripts/quality-and-lint.test.ts
git commit -F- <<'EOF'
Reference: the Severity denominator read over a named flow, at scales version 2

The definition sentence keeps the structural test and restates it in
flow terms, with the max(flow, function) floor, the partial-prefix
reading and the share's order of operations; every anchor row that names
a radius class is restated in referent terms, and a checked sentence
with a pin keeps the restatement from drifting back.
EOF
```

### Task A6: design-inputs.md — item 1, the flow fields and the tier's criteria

**Files:**
- Modify: skills/fmea-software/references/design-inputs.md:11 (item 1's row) and 26-37 (the `## Flows, components and dependencies` section)
- Test: skills/fmea-software/scripts/prompts.test.ts and validate.test.ts (green; no test reads this file today)

**Interfaces:**
- Consumes: A1's `flows[]` shape; A5's DF3 reading; the register row for C201 at `provenance.md:128`, which is what licenses `[paraphrased:C201]` here (A7 cites the same row later; neither task depends on the other).
- Produces: the collection recipe the session follows, which §6 fixes in five parts and A9's fixture must be consistent with.

- [ ] **Step 1: Run the pin that must stay green**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/prompts.test.ts`
Expected: PASS. This is a regression pin: item numbers in this file do not move, because `evals/rubric.md` cites "item 4" in c14's codebase clauses.

- [ ] **Step 2: Edit item 1's row**

`design-inputs.md:11` keeps its id, its input name and `[paraphrased:C014]`. Its `What to collect` cell gains, after the existing sentence, a `[skill-authored]` clause naming where each flow field lands in the document: `name`, `value_priority`, `users.population` and `users.share` and `users.selecting_condition`, `sources`, `steps`, `steps_partial`, and that a chain names the flows it breaks in `chains[].flows`.

- [ ] **Step 3: Write the section's new prose**

Under `## Flows, components and dependencies` (`:28`), add the five parts §6 fixes, each sentence `[skill-authored]` except the tier:

1. the granularity rule — what counts as one flow: a user-valued journey named once, not a per-step slice;
2. the internal or machine-only rule — `users.population` names it ("internal only: …") and no external user is not a defect, because the structural test reads the internal-only class for it;
3. the reconciliation that a population is a label and a quantity belongs in `share`, with the count staying in the incident record and only its fraction in `share`;
4. the async recipe — where the team knows only that one service publishes and another consumes, record what is known, name the end population in `users.population`, list the consumers that are known as `steps` or as an open assumption owned by `user`, and set `steps_partial: true`;
5. the `value_priority` tier, its name carrying `[paraphrased:C201]`, with the three criteria as falsifiable one-line tests, each also carrying `[paraphrased:C201]` as §6 fixes, and the disclaimer sentence `[skill-authored]`.

The three criteria, one line each, worded as tests a second rater can apply to one flow without reading the first rater's answer:

- **High** — losing this flow stops the business serving its external users at all: no path inside the flow delivers the outcome, and no existing evidenced control or stated procedure restores it inside the flow's own budget.
- **Medium** — losing this flow degrades it while a stated alternative path still delivers the outcome, and restoring the flow needs a person.
- **Low** — losing this flow is absorbed: it reaches no external user, or an existing evidenced control keeps the outcome delivered.

Where the tier's own disclaimers belong: after the criteria, the pinned sentence `a flow-value priority label: not a rating, not a criticality analysis, not a safety or hazard analysis, and not a reliability target`, as `[skill-authored]`, and one sentence that the criteria measure business impact and not safety, because `Severity` is a technical consequence class.

- [ ] **Step 4: Check the tags and the licensed-content rule**

Run: `grep -c 'skill-authored\]' skills/fmea-software/references/design-inputs.md` and `grep -n 'Azure\|Medium\|Low\|High' skills/fmea-software/references/design-inputs.md`
Expected: every new sentence ends in a tag; the only occurrences of the tier labels are the three criteria headings, and no Azure tier description appears.

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/references/design-inputs.md
git commit -F- <<'EOF'
Reference: what the run collects for a flow, and the value-priority criteria

Item 1 keeps its concept and gains the flow fields, the granularity and
internal-only rules, the async recipe with its consumer list, and three
falsifiable tier tests whose vocabulary is paraphrased from C201 while
the wording is the skill's own.
EOF
```

### Task A7: methodology.md — the lineage, the flow's role and the safety boundary

**Files:**
- Modify: skills/fmea-software/references/methodology.md:84-116 (the transfer-status table), and the row carrying the DF4 sentence
- Test: skills/fmea-software/scripts/quality-and-lint.test.ts (a third file read and one added test)

**Interfaces:**
- Consumes: A1's `flows[]` shape; A6's tier criteria; the register row for C201 at `provenance.md:128`.
- Produces: the mapping rows naming MIL-STD-1629A's mission/phase/mode inventory, ECSS's end-to-end functional paths and ARP5580's co-equal Functional FMEA, the flow's role, the safety boundary in §1's words, and the row carrying DF4's sentence verbatim.

- [ ] **Step 1: Write the failing test**

In `quality-and-lint.test.ts`, add a third module-scope read and the test:

```ts
test("DF4's sentence stands verbatim in the row that disclaims the canon's criticality", () => {
  const methodology = readFileSync(join(SKILL_ROOT, "references", "methodology.md"), "utf8");
  const row = methodology.split("\n").find((l) => l.startsWith("| A flow's value-priority tier |"));
  assert.ok(row, "the row exists");
  assert.ok(row!.includes("a flow-value priority label: not a rating, not a criticality analysis, not a safety or hazard analysis, and not a reliability target"));
  assert.ok(row!.includes("[paraphrased:C201]"), "the tier's vocabulary is cited to C201");
  assert.ok(row!.includes("[skill-authored]"), "the disclaimer is the skill's own words");
});
```

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/quality-and-lint.test.ts`
Expected: FAIL — no row starts with `| A flow's value-priority tier |`.

- [ ] **Step 3: Write the rows**

In the transfer-status table, add the new row the test reads, in the table's `| Classical rule | Status | What v1 does with it | Provenance |` shape:

```
| A flow's value-priority tier | not applicable to the canon | The tier is a flow-value priority label: not a rating, not a criticality analysis, not a safety or hazard analysis, and not a reliability target; the canon's criticality categories and IEC's criticality matrix derive a category from severity and rank it by recoverability, while this field derives nothing and ranks nothing | [paraphrased:C201] [skill-authored] |
```

Add a second row placing the flow on the operational-context lineage, and keep the quotation of the canon's own vocabulary out of the skill's text:

```
| Operational context as a named path | adapted | A flow is a use-case grouping of functions that a user-valued journey names: not a phase or a mode, not a function, not a failure condition and not a hazardous event. The nearest canon lineage is the operational context as a path — MIL-STD-1629A's mission, phase and mode inventory and ECSS's end-to-end functional paths, with ARP5580's co-equal Functional FMEA. Mission and phase reach a rating only through Occurrence's exposure axis, as they do today, and phases and modes are out of scope as document objects | [paraphrased:C106] [paraphrased:C129] [skill-authored] |
```

Reconcile the two existing `not applicable` rows the design names: `| Functional block diagrams as a step of their own |` (`:87`) and `| Criticality categories keyed to redundancy or single-point failure |` (`:109`). Each gains one `[skill-authored]` clause naming what now stands in its place — the structure tree with a function statement per element, and the flow's value-priority tier plus `causes`/`controls` for redundancy and single-point failure respectively — and neither row's Status changes.

Add the safety boundary in §1's words to the prose of the section that states what the skill models, as `[skill-authored]`: `Severity` is the technical consequence class of an end effect, disjoint from harm to people, property or the environment; no row records a failure condition, a hazardous event, a safety objective or an integrity requirement; no DAL, ASIL or SIL is mapped anywhere; F1.5's functional hazard assessment and F1.8's STPA are deliberately not modelled.

- [ ] **Step 4: Check the provenance tags against the register**

Run: `grep -n 'C201\|C106\|C129' skills/fmea-software/references/methodology.md`
Expected: every id cited has a register row covering it in `provenance.md` (`C106` and `C129` are already cited in this file; `C201` is row `provenance.md:128`).

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/references/methodology.md skills/fmea-software/scripts/quality-and-lint.test.ts
git commit -F- <<'EOF'
Reference: the flow's lineage, role and safety boundary, and the tier's disclaimer

The flow maps onto operational context as a path and not onto the canon's
criticality; the value-priority row carries DF4's sentence verbatim; and
the two not-applicable rows name what stands in their place.
EOF
```

### Task A8: SKILL.md — the per-step procedure and the update mode

**Files:**
- Modify: skills/fmea-software/SKILL.md:35-41 (steps 1, 2, 4, 5), 80-107 (the update-mode section)
- Test: skills/fmea-software/scripts/skill-commands.test.ts and prompts.test.ts (green)

**Interfaces:**
- Consumes: A5's DF3 reading and DF6 bump; A4's stale-reason set; A6's recipe; A7's role statement; and §5.4 and §5.5 as the spec states them, since this task documents the update mode the spec fixes and A12 to A14 implement that checker afterwards.
- Produces: the procedure the session runs, and the update mode's precedence order naming five reasons.

- [ ] **Step 1: Run the pins that must stay green**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/skill-commands.test.ts skills/fmea-software/scripts/prompts.test.ts`
Expected: PASS. `skill-commands.test.ts` pins the command forms the file documents, so every sentence added here that names a script command must use the shipped form.

- [ ] **Step 2: Edit the spine**

In step 1 (`Plan`), add the collection of flows to the inputs pass, as `[skill-authored]`: collect the critical user and system flows against `design-inputs.md` item 1, and record each assumption the collection leaves. In step 2 (`Structure`), add that flows are written to `flows[]` with `id`, `name` and `value_priority` as they are collected, and that a chain names the flows it breaks in `chains[].flows` at step 4. In step 3 (`Function`), add that each flow's `steps` are filled **after** this step, because `steps` reference functions and the session resolves the ids from the team's prose so the human never transcribes opaque ids. In step 4 (`Failure`), add that the chain names its flows, with the first entry being the flow whose class set the band, that the Severity rationale enumerates every named flow and quotes the effect clause, and that a chain naming several flows has its disjointness assumption written into `meta.assumptions[]`, owned by `user`, with the ground rules and before any chain row. In step 5 (`Rate`), add that the Severity blast radius is read over a named flow's referent population as `scales-software.md` states, that a chain-named flow needs `users`, a non-catalog `sources[]` entry and a `users.review` status, and that the provisional warning is what tells the person which rows rest on an unconfirmed population. Beside the existing `Dependency strength moves no rating` sentence in the same step, add one `[skill-authored]` clause stating what the motivating defect actually was: the weak-dependency exclusion was repaired by deletion, strength stays edge-stored and informational, and flow membership is not a strength input in either direction.

- [ ] **Step 3: Edit the update mode**

In `### Update after a change`, change the precedence sentence (`:92`) to the five reasons in order, and label the vocabulary in the same breath: `reason` records the first that applies in the order of the stale reason set v2 — `element-changed`, `function-changed`, `flow-changed`, `control-removed`, `scales-version` — so `SKILL.md` names the set as `quality-and-lint.md` does (A4). Then add the `flow-changed` rules as `[skill-authored]` in the section's voice: the two triggers (a chain-named flow's `users` changed in any of `population`, `share` or `selecting_condition`; a chain's own `flows[]` set changed, so a re-point is a structural-diff trigger), what marks nothing stale (`name`, `value_priority`, `steps`, `steps_partial`, `sources`, `users.review`), the S-only re-read with O and D carried forward and priority recomputed, that adding or removing a flow marks nothing by itself, and that the checker's `removedFlows` list is the guard for a flow a chain still names. Name the sections the summary copies as §5.5 fixes them — the flows added, removed and changed, the chains re-pointed, the evidence and status changes, and the removed-flow guard — since A12 and A13 add them to the checker's output afterwards, and the section names come from the spec, not from them.

- [ ] **Step 4: Check the file's shape**

Run: `grep -n 'flow-changed\|stale reason set v2' skills/fmea-software/SKILL.md` and `grep -c 'skill-authored\]' skills/fmea-software/SKILL.md`
Expected: the precedence line and the new trigger sentences name `flow-changed`, the set is labelled `stale reason set v2`, and every added sentence carries a tag.

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/SKILL.md
git commit -F- <<'EOF'
Skill: the flow model in the spine and the update mode

Flows are collected in steps 1 and 2, their steps filled after step 3,
the flows a chain breaks named in step 4 and the denominator read in
step 5; the update mode gains flow-changed, its two triggers and its
S-only re-read.
EOF
```

### Task A9: The fixtures — flows in the golden and prompt-7 documents, and the scales-version bump

**Files:**
- Modify: skills/fmea-software/evals/fixtures/checkout-service.fmea.json (add `flows[]` and `chains[].flows`, `meta.scales.version` 1 → 2, regenerate `computed`)
- Modify: skills/fmea-software/evals/fixtures/legacy-rpn-sheet.expected.fmea.json (`meta.scales.version` 1 → 2)
- Modify: skills/fmea-software/evals/fixtures/update/before.fmea.json (add `flows[]` and the one `chains[].flows`, `meta.scales.version` 1 → 2, regenerate `computed`)
- Modify: skills/fmea-software/evals/fixtures/update/before-v2-branches.fmea.json (`meta.scales.version` 1 → 2)
- Modify: skills/fmea-software/evals/fixtures/update/after-architecture.md (the prose change that moves a named flow's `users`)
- Test: skills/fmea-software/scripts/validate.test.ts:275, :298, lints.test.ts:583-591, render.test.ts, update-check.test.ts (moved pins)

**Interfaces:**
- Consumes: A1's shape; A6's granularity, internal-only and async rules; the three flows in `checkout-inputs.md:5-9`.
- Produces: the golden fixture's `flows[]` (three flows, at least one named by a chain, at least one chain naming two) and the prompt-7 pair's flows, which A10, A11 and B1 read.

- [ ] **Step 1: Add the flows to the golden fixture**

In `checkout-service.fmea.json`, add a top-level `flows` array between `chains` and `computed`, holding the three flows `checkout-inputs.md:5-9` names, one `flows[]` entry each: `flow-checkout` (High), `flow-retry` (High) and `flow-resume` (Medium). Each carries `sources` reproducing the input the flow came from, `users.population` as a label drawn from the inputs, and `steps` naming the function ids the fixture already carries, in the order the input gives them: `flow-checkout` is `["fn-checkout-order", "fn-pricing-quote", "fn-gateway-authorize", "fn-store-persist"]` (the input's prices it, authorizes payment, writes the order), `flow-retry` is `["fn-checkout-order", "fn-gateway-authorize"]`, and `flow-resume` is `["fn-auth-session"]`. Invent no function for a step; the six functions `fn-checkout-order`, `fn-api-accept`, `fn-gateway-authorize`, `fn-store-persist`, `fn-auth-session` and `fn-pricing-quote` are the fixture's whole set. Leave `users.review` off every flow, so the shipped fixture shows the provisional-denominator path.

- [ ] **Step 2: Name the flows on the chains**

Set `chains[].flows` on the two chains the three inputs name. `ch-9` — `fn-checkout-order`, "Checkout returns a retryable error to the storefront and the cart is not confirmed" — names `["flow-checkout", "flow-retry"]`: two flows on one chain, the multi-flow case the annotation and the disjointness note must render, with the first entry the band-setting one. `ch-5` — `fn-auth-session`, "A session token that this component did not issue for the current session is accepted" — names `["flow-resume"]`. Every other chain omits the key. Extend the two chains' `ratings.S.rationale` so each names its flow ids as whole tokens and quotes the effect clause, or `chain-flow-rationale-unnamed` fires on the shipped fixture. Add the multi-flow case's disjointness assumption to `meta.assumptions[]` as its own entry, owned by `user` and open, naming `ch-9` and its two flows, since §11 criterion 7 reads it there and no tool can write it.

- [ ] **Step 3: Bump the scales version and regenerate**

Set `meta.scales.version` to `2` in `checkout-service.fmea.json`, `legacy-rpn-sheet.expected.fmea.json`, `update/before.fmea.json` and `update/before-v2-branches.fmea.json`. `update/stale-rows.fmea.json` already reads 2. Run these two commands, not a loop (a `for … do … done` is not the same in bash and fish):

```bash
node skills/fmea-software/scripts/validate.ts skills/fmea-software/evals/fixtures/checkout-service.fmea.json --write
node skills/fmea-software/scripts/validate.ts skills/fmea-software/evals/fixtures/update/before.fmea.json --write
```

- [ ] **Step 4: Move the prompt-7 pair**

In `update/before.fmea.json`, add the same three flows in the shape the pair's inputs support and name one on the chain whose element the after-prose changes the population of; keep that chain's `stale` block as it is. In `update/after-architecture.md`, add the sentence that moves that flow's `users.population`, under `## What changed`, in the file's voice and its numbered style. The chain the flow is named on must be one `expected-stale.json` already lists (`ch-1`, `ch-2` or `ch-4`), so the higher-precedence reason masks `flow-changed` and `expected-stale.json` stays unchanged.

- [ ] **Step 5: Run the suite, read the moved pins, and move them**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/`
Expected: FAIL, listing the pins the enriched fixture moves. Each failure names the fixture fact that changed, so move the pin to the measured value:
- `validate.test.ts:275` and `:298` — the top-level key lists gain `"flows"` between `"chains"` and `"computed"`, and the `:298` literal gains the key in the same place;
- `validate.test.ts`'s `computed.lints.length` for the golden (line 282, 14 → 17) and `lints.test.ts:583-591`'s golden total (14 → 17, and its `lints.filter((l) => l.severity === "blocker").length` stays `1`): the three `flow-users-provisional` findings are warnings, one per chain-named flow. `computed.quality_score` at `validate.test.ts:281` **stays 89** — `lib/quality.ts` counts only blocker lints, so a warning moves no share — and A9 must not rewrite that pin;
- `render.test.ts`'s pinned fixture facts that name a chain the flows moved (the chain index rows and any Severity rationale string it pins), and `render.test.ts:274` and `:1159`, which pin `<dt>Scales version</dt><dd>1</dd>` and become `2`;
- `update-check.test.ts` for anything it pins about `before.fmea.json`'s scales version.
If a failure is not one of these and its cause is not the fixture, stop: it is a real defect in A1 to A8, not a pin.

- [ ] **Step 6: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0.

- [ ] **Step 7: Browser gate and comparison**

Run: `node tools/check-browser.ts` then `node tools/compare.ts --base HEAD`
Expected: the gate exits 0; the comparison writes changed views for the header (the scales version) and reports them, and every changed view is a change this task intended.

- [ ] **Step 8: Commit**

```bash
git add skills/fmea-software/evals/fixtures
git commit -F- <<'EOF'
Fixtures: the three critical flows in the golden and prompt-7 documents, at scales version 2

The document fixture carries the flows the checkout input names, one
chain naming two of them, and both the before-document and the after
prose move a named flow's population on a chain the stale set already
reaches. Every document fixture's scales version moves with DF6, so the
update pair does not mark every rated row stale.
EOF
```

### Task A10: The Flows section in the report

**Files:**
- Modify: skills/fmea-software/scripts/lib/report-model.ts (the `ReportModel` interface at :98-115, `buildReportModel` at :531, and a private `flowRows` helper)
- Modify: skills/fmea-software/scripts/render.ts:21 (the `SLOTS` list), :46-49 (`CONTENTS`), :203-210 (beside `dependenciesHtml`, the new `flowsHtml`), :454-471 (the slot values), :27 (the key-text map if the row's mark needs a tooltip)
- Modify: skills/fmea-software/assets/report-template.html:170-173 (a whole `<section id="flows"><h2>Flows</h2><!--@flows--></section>` between the structure and chains sections, because every section id and heading lives in the template and a slot value supplies only its content)
- Modify: skills/fmea-software/evals/rubric.md:91 (c8's section-id list)
- Test: skills/fmea-software/scripts/render.test.ts:52-57 (`FREE_TEXT_KEYS`), :173-182 (the section-id order), :400-406 (the TOC), and new cases
- Test: skills/fmea-software/scripts/report-model.test.ts (the new model fields)

**Interfaces:**
- Consumes: A1's `Flow`; A9's golden fixture; §2 DF4's sentence, which A1 wrote into the schema description and A6 and A7 repeat (it is the string the legend prints verbatim); A3's `flow-users-provisional` reading.
- Produces:
  - `export interface FlowRow { id: string; name: string; valuePriority: ValuePriority; population: string | null; share: string | null; selectingCondition: string | null; sources: Source[]; steps: string[]; partial: boolean; provisional: boolean; namedByChain: boolean }`
  - `ReportModel.flows: FlowRow[]`, in the fixed order High first, then id (presentational only)
  - `render.ts`: `SLOTS` gains `"flows"` between `"structure"` and `"chains"`; `CONTENTS` gains `["flows", "Flows"]` between `["structure", "Structure"]` and `["chains", "Failure chains"]`; `flowsHtml(model.flows)` renders the section

- [ ] **Step 1: Write the failing tests**

The render test file has no `htmlOf`; every test in it renders with `renderHtml(doc, table, template, vocabulary)`. Use that, and its `sectionOf(html, id, next)` helper for a section's markup.

In `render.test.ts`, add the free-text keys and the section id, and the new cases:

```ts
// in FREE_TEXT_KEYS
"population", "share", "selecting_condition",
```

```ts
// in the section-id test's ids array, between "structure" and "chains"
"flows",
```

```ts
test("the Flows section prints one row per flow, High first then by id, with the legend's disclaimer verbatim", () => {
  const html = renderHtml(golden(), table, template, vocabulary);
  const section = html.slice(html.indexOf('id="flows"'), html.indexOf('id="chains"'));
  assert.ok(section.includes("a flow-value priority label: not a rating, not a criticality analysis, not a safety or hazard analysis, and not a reliability target"), "the legend prints DF4's sentence verbatim");
  const ids = [...section.matchAll(/<code>(flow-[a-z-]+)<\/code>/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["flow-checkout", "flow-retry", "flow-resume"], "High flows first, then by id");
  assert.ok(section.includes("a starting point only; the recorded steps are a prefix") === false, "the golden fixture's flows are not partial");
});

test("the Flows section has its empty state, and a partial flow renders its phrase", () => {
  const doc = minimalDoc();
  assert.ok(renderHtml(doc, table, template, vocabulary).includes('<p class="empty">No flows recorded.</p>'));
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "Low", steps: ["fn-1"], steps_partial: true, users: { population: "internal only: operators", review: { status: "rescored", by: "R. Viewer", date: "2026-10-12" } } }];
  assert.ok(renderHtml(doc, table, template, vocabulary).includes("a starting point only; the recorded steps are a prefix"));
});

test("a chain-named flow whose population is not re-scored is marked, and the legend says so", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High", users: { population: "all shoppers" } }];
  doc.chains[0].flows = ["flow-1"];
  const html = renderHtml(doc, table, template, vocabulary);
  assert.ok(html.includes('<span class="mark mark-provisional"'), "the flow row carries the provisional mark");
  assert.ok(html.includes("whose population has not been re-scored"), "the legend names the provisional note");
});
```

In `report-model.test.ts`, add:

```ts
test("model.flows is in the presentational order and marks the provisional and chain-named flows", () => {
  const doc = docOf(/* three chains */);
  doc.flows = [
    { id: "flow-b", name: "B", value_priority: "Low" },
    { id: "flow-a", name: "A", value_priority: "High", users: { population: "all shoppers", review: { status: "provisional" } } },
    { id: "flow-c", name: "C", value_priority: "High", users: { population: "internal only: operators", review: { status: "rescored", by: "R. Viewer", date: "2026-10-12" } } },
  ];
  doc.chains[0].flows = ["flow-a"];
  const model = modelOf(doc);
  assert.deepEqual(model.flows.map((f) => f.id), ["flow-a", "flow-c", "flow-b"]);
  assert.deepEqual(model.flows.map((f) => [f.provisional, f.namedByChain]), [[true, true], [false, false], [false, false]]);
});
```

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/report-model.test.ts`
Expected: FAIL — `model.flows` is undefined, `id="flows"` is missing from the report, and the section-id order test reports the missing id.

- [ ] **Step 3: Build the model field**

In `report-model.ts`, add `FlowRow` and `flows: FlowRow[]` to `ReportModel`, and a private `flowRows(doc: FmeaDocument): FlowRow[]` that maps `doc.flows ?? []` to `FlowRow`s (function names for `steps`, resolved through the function index; `partial` from `steps_partial === true`; `provisional` when any chain names the flow and its `users.review` is absent or `provisional`; `namedByChain` when any chain names it), then sorts by `valuePriority` (High, Medium, Low) and then by `id`, a presentational order the interface comment states ranks nothing. Wire it into `buildReportModel`'s returned object.

- [ ] **Step 4: Render the section**

In `render.ts`, add `"flows"` to `SLOTS` and `["flows", "Flows"]` to `CONTENTS` at the places above, add the slot value `flows: flowsHtml(model.flows)`, and add the whole section block `<section id="flows"><h2>Flows</h2><!--@flows--></section>` to the template between its structure and chains sections — the heading and the id belong in the template, as every other section's do. `flowsHtml` follows `dependenciesHtml`'s shape: a caption constant, a framed table with `aria-labelledby`, one row per flow (`id` in a `<code>`, as the index rows print a chain id, then `name`, `value_priority`, population with `share` and `selecting_condition` when present, sources, the ordered step function names, a `steps_partial` marker, and the provisional mark), the phrase `a starting point only; the recorded steps are a prefix` for a partial flow instead of empty cells, the empty state `<p class="empty">No flows recorded.</p>`, and the legend printing DF4's sentence verbatim plus the clause `whose population has not been re-scored` for the provisional note. Every printed string goes through `e()`.

Add `flows` to `evals/rubric.md`'s c8 section-id list (`:91`), between `structure` and `chains`, since the criterion names the report's sections in order.

- [ ] **Step 5: Run the suite and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/report-model.test.ts`
Expected: PASS.

- [ ] **Step 6: Run both runners, the browser gate and the comparison**

Run: `bun tools/run-tests.ts`, `bun tools/check.ts`, `node tools/check-browser.ts`, `node tools/compare.ts --base HEAD`
Expected: all exit 0 (the comparison exits 0 with changed views to read); read every changed view and confirm the new section is the only intended change.

- [ ] **Step 7: Commit**

```bash
git add skills/fmea-software/scripts/lib/report-model.ts skills/fmea-software/scripts/render.ts skills/fmea-software/assets/report-template.html skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/report-model.test.ts skills/fmea-software/evals/rubric.md
git commit -F- <<'EOF'
Report: the Flows section, its legend and its provisional marker

One row per flow with its population, sources and steps; High first then
by id, a presentational order that ranks nothing; the legend prints
DF4's sentence verbatim, and a chain-named flow whose population is not
re-scored is marked and named.
EOF
```

### Task A11: The chain annotation

**Files:**
- Modify: skills/fmea-software/scripts/lib/report-model.ts (the chain `RowModel` at :51-66, the row builder, and `FlowRow`'s consumers)
- Modify: skills/fmea-software/scripts/render.ts (`indexRowHtml` at :259 and `rowHeaderHtml` at :282, or the chain table's row renderer; the anchor the tests slice on is `<article class="row" id="row-${…}">` at :379, plus a caption constant)
- Test: skills/fmea-software/scripts/render.test.ts (new cases), skills/fmea-software/scripts/report-model.test.ts (the new row fields)

**Interfaces:**
- Consumes: A10's `FlowRow` and `ReportModel.flows`; A1's positional rule that the first entry of `chains[].flows` is the band-setting flow.
- Produces: `RowModel.flows: string[]` and `RowModel.chosenFlow: string | null` and `RowModel.disjoint: boolean`; the rendered annotation `breaks: <id>, <id>` with the chosen flow marked, and the disjointness note where a chain names more than one flow.

- [ ] **Step 1: Write the failing tests**

`render.test.ts` carries the helper for this: `rowSection(html, id)`, which returns one chain row's `<article class="row" id="row-<id>">…</article>`.

In `report-model.test.ts`:

```ts
test("a chain that names flows carries them, the first as the one whose band was used, and the disjointness flag", () => {
  const doc = minimalDoc();
  doc.flows = [
    { id: "flow-1", name: "One", value_priority: "High", users: { population: "all shoppers" } },
    { id: "flow-2", name: "Two", value_priority: "Low", users: { population: "internal only: operators" } },
  ];
  doc.chains[0].flows = ["flow-1", "flow-2"];
  const [row] = modelOf(doc).rows;
  assert.deepEqual([row.flows, row.chosenFlow, row.disjoint], [["flow-1", "flow-2"], "flow-1", true]);
});
```

In `render.test.ts`, using the golden fixture (whose checkout chain names two flows):

```ts
test("the chain annotation names every flow it breaks, marks the one whose band was used, and notes the disjointness assumption", () => {
  const html = renderHtml(golden(), table, template, vocabulary);
  const row = rowSection(html, "ch-9");
  assert.ok(row.includes("breaks:"), "the row names the flows");
  assert.ok(row.includes("<code>flow-checkout</code>"), "the first named flow is printed");
  assert.ok(row.includes("<code>flow-retry</code>"), "the second named flow is printed");
  assert.ok(row.includes("whose band was used"), "the chosen flow is marked");
  assert.ok(row.includes("treated as disjoint") && row.includes("their union is not computed"), "the disjointness note is printed");
});

test("a chain naming one flow prints no disjointness note, and a chain naming none prints no annotation", () => {
  const html = renderHtml(golden(), table, template, vocabulary);
  const single = rowSection(html, "ch-5");
  assert.ok(single.includes("breaks:") && single.includes("<code>flow-resume</code>"), "the single named flow is still annotated");
  assert.ok(!single.includes("treated as disjoint"), "one named flow prints no disjointness note");
  assert.ok(!renderHtml(minimalDoc(), table, template, vocabulary).includes("breaks:"));
});
```

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/report-model.test.ts`
Expected: FAIL — `row.flows` is undefined and the annotation strings are absent from the report.

- [ ] **Step 3: Carry the fields and render the annotation**

In `report-model.ts`, add the three fields to `RowModel` and set them from `chain.flows ?? []`: `chosenFlow` is the first id that resolves to a flow (null when the chain names none), and `disjoint` is `flows.length > 1`. In `render.ts`, print in the chain row, after the failure mode and before the ratings, `breaks: <a list of the flow ids as <code>>` with the chosen one marked (a `<span class="mark">chosen</span>` beside it, or the row's existing mark channel), and, where `disjoint`, one sentence in the row: `The named flows are treated as disjoint and their union is not computed; the band is the highest of the single flows' classes.` Do not print the annotation at all for a chain that names no flow.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/report-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Run both runners, the browser gate and the comparison**

Run: `bun tools/run-tests.ts`, `bun tools/check.ts`, `node tools/check-browser.ts`, `node tools/compare.ts --base HEAD`
Expected: all exit 0; the changed views are the chain rows the annotation touches.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/scripts/lib/report-model.ts skills/fmea-software/scripts/render.ts skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/report-model.test.ts
git commit -F- <<'EOF'
Report: the chain names the flows it breaks, and marks the one that set the band

The first entry of chains[].flows is the flow the Severity rationale
names as having set the band, so the annotation can mark it without
reading prose; a chain naming more than one flow says its named
populations are treated as disjoint.
EOF
```

### Task A12: The flow diff in the update mode

**Files:**
- Modify: skills/fmea-software/scripts/lib/update-diff.ts:10-22 (the `UpdateDiff` shape), 55-110 (the keyed diff engine and `reachedRows`), 227-243 (`diffUpdate`), 339-379 (`diffLines`)
- Modify: skills/fmea-software/scripts/update-check.ts:1-10 (the header comment)
- Modify: skills/fmea-software/references/data-model docs only if a task names them; otherwise unchanged
- Test: skills/fmea-software/scripts/update-check.test.ts (new cases)

**Interfaces:**
- Consumes: A1's `Flow` and `Chain.flows`; the existing `diffKeyed` engine and `firstByKey`.
- Produces:
  - `export type FlowChange = { change: "added" | "removed" | "changed"; id: string; fields: FlowField[] }` with `export type FlowField = "users" | "name" | "value_priority" | "steps" | "steps_partial" | "sources" | "users.review"`
  - `UpdateDiff` gains `flows: FlowChange[]` and `repointed: { chainId: string; index: number; from: string[]; to: string[] }[]`
  - `ReachedRow` gains `reason: StaleReason`, the lowest-precedence-bar reason a reach justifies; this task sets it and A14's acceptance rule reads it
  - `reachedRows` marks a chain whose `flows[]` set changed, and a chain naming a flow whose `users` changed, with the reach text the checker prints
  - `diffLines` prints a `flows:` section and a `chains re-pointed` list, and the counts line gains them

- [ ] **Step 1: Write the failing tests**

In `update-check.test.ts`:

```ts
test("diffUpdate: a chain-named flow's users change reaches its chain as flow-changed and marks nothing else", () => {
  const copy = flowDoc();
  const seen = changed(copy, (d) => { flowOf(d, "flow-1").users = { population: "internal only: operators" }; });
  assert.deepEqual(seen.reached.map((r) => [r.chainId, r.rule, r.reason]), [["ch-1", "flow flow-1 changed users", "flow-changed"]]);
  assert.deepEqual(seen.flows, [{ change: "changed", id: "flow-1", fields: ["users"] }]);
});

test("diffUpdate: a chain's flows set change reaches it as flow-changed, and a name or a tier change marks nothing", () => {
  const copy = flowDoc();
  const repointed = changed(copy, (d) => { chainOf(d, "ch-1").flows = ["flow-2"]; });
  assert.deepEqual(repointed.reached.map((r) => [r.chainId, r.rule, r.reason]), [["ch-1", "chain ch-1 names flow-2 in place of flow-1", "flow-changed"]]);
  assert.deepEqual(repointed.repointed, [{ chainId: "ch-1", index: 0, from: ["flow-1"], to: ["flow-2"] }]);
  assert.deepEqual(changed(copy, (d) => { flowOf(d, "flow-1").name = "Checkout submission again"; flowOf(d, "flow-1").value_priority = "Low"; }).reached, []);
});

test("update-check.ts prints the flows section, calls a name change informational, and counts the chain re-points", () => {
  const copy = flowDoc();
  const renamed = runCheck(copy, changed(copy, (d) => { flowOf(d, "flow-1").name = "Checkout submission again"; }));
  assert.equal(renamed.status, 0, renamed.stderr);
  assert.ok(renamed.stdout.includes("flows:\n  changed flow-1: name\n"), renamed.stdout);
  assert.ok(renamed.stdout.includes("stale:\n  none"), "a name change marks nothing stale");
  const repointed = runCheck(copy, changed(copy, (d) => { chainOf(d, "ch-1").flows = ["flow-2"]; }));
  assert.ok(repointed.stdout.includes("chains re-pointed:\n  ch-1: flow-1 to flow-2\n"), repointed.stdout);
  // The counts line ends with the last count, so match its tail rather than a substring with a trailing comma.
  assert.ok(/update-check: [^\n]*, 1 chain re-pointed\n$/.test(repointed.stdout), repointed.stdout);
});
```

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/update-check.test.ts`
Expected: FAIL — `seen.flows` is undefined, `reached` reports no `reason` field, and the printed sections are absent.

- [ ] **Step 3: Extend the diff**

Add `flowDoc()` to the test file's helpers (a `graphDoc` document with two flows, one named by `ch-1`) and a `flowOf` accessor beside the file's existing `chainOf`. `EMPTY` at line 10 is typed `UpdateDiff`, so it gains `flows: []` and `repointed: []` in the same commit or `tsc` refuses the file, and `diffUpdate`'s returned object literal gains both keys. In `update-diff.ts`:

- diff `flows` with the existing `diffKeyed` engine keyed on `id`, giving it value comparisons rather than the engine's `!==` (a clone makes every object distinct, so `!==` would report every flow with `users` as changed): `users` is compared by a `sameReferent(a, b)` helper over the three value parts only — `population`, `share` and `selecting_condition` — and a change to any of them is the reach that marks `flow-changed`; the `review` block is compared by a `sameReview(a, b)` helper over `status`, `by` and `date` and is reported as an informational change that **marks nothing stale**, exactly as §5.4 requires (a `users.review` moving to `rescored` clears a provisional warning and does not re-open a band), as are `name`, `value_priority`, `steps`, `steps_partial` and `sources`;
- add `flows` to `UpdateDiff`, and `repointed` computed as a set compare of each chain's `flows[]` between copy and draft (draft order, one entry per chain whose set differs);
- in `reachedRows`, mark each chain whose `flows[]` set changed with the reach text `chain <id> names <new> in place of <old>` and each chain naming a flow whose `users` changed with `flow <id> changed users`, both classified as `flow-changed` through the `reason` field this task adds to `ReachedRow` — set to `"element-changed"` for the existing reaches and `"flow-changed"` for these two, and left for A14's acceptance rule to read;
- in `diffLines`, add a `flows:` section (added / removed / changed by id, with the changed fields) and a `chains re-pointed:` section, and add `counted(diff.flows.length, "flow change", "flow changes")` and `counted(diff.repointed.length, "chain re-pointed", "chains re-pointed")` to the counts line;
- extend the `update-check.ts` header comment to name the flows section, the chain re-points and the removed-flow guard of A13.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/update-check.test.ts`
Expected: PASS.

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/scripts/lib/update-diff.ts skills/fmea-software/scripts/update-check.ts skills/fmea-software/scripts/update-check.test.ts
git commit -F- <<'EOF'
Update mode: the flow diff, the chain re-points and their own section

A chain-named flow's users change and a chain's flows set change reach
that chain with flow-changed; a name, a tier, sources, steps and a
review status are reported as informational and mark nothing.
EOF
```

### Task A13: The removed-flow guards

**Files:**
- Modify: skills/fmea-software/scripts/lib/update-diff.ts (`removedFlows`, and `baselineIssues` or `mismatchIssues` depending on which refuses)
- Modify: skills/fmea-software/scripts/lib/update-diff.ts:339-379 (`diffLines`, the guard's section)
- Test: skills/fmea-software/scripts/update-check.test.ts (new cases)

**Interfaces:**
- Consumes: A12's `flows` diff and `repointed`.
- Produces: `export interface RemovedFlow { flow: string; chains: string[]; candidates: string[] }`; `UpdateDiff.removedFlows: RemovedFlow[]`; a `removedFlows` printed section; and an `UPDATE_MISMATCH` refusal under `--check` for a removed flow a chain still names and for a chain-named flow that has lost its last non-catalog source.

- [ ] **Step 1: Write the failing tests**

```ts
test("a removed flow a chain still names is refused and listed with the flows to re-point to", () => {
  const copy = flowDoc();
  const draft = changed(copy, (d) => { d.flows = d.flows!.filter((f) => f.id !== "flow-1"); });
  const r = runCheck(copy, draft, "--check");
  assert.equal(r.status, 2, r.stdout);
  assert.ok(r.stdout.includes("flows removed:\n  flow-1: named by ch-1; repoint to flow-2, or drop\n"), r.stdout);
  assert.match(r.stderr, /^error UPDATE_MISMATCH: removed-flow-still-named: chain ch-1 names flow-1, which this update removes at \/chains\/0\/flows\/0$/m);
});

test("a chain-named flow that lost its last non-catalog source is refused by the same guard", () => {
  const copy = flowDoc();
  const draft = changed(copy, (d) => { flowOf(d, "flow-1").sources = [{ kind: "catalog", ref: "cat-service-01" }]; });
  const r = runCheck(copy, draft, "--check");
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /^error UPDATE_MISMATCH: flow-sources-lost: flow flow-1 is named by chain ch-1 and has lost its last source whose kind is not catalog at \/flows\/0\/sources$/m);
});

test("a removed flow no chain names is reported and marks nothing stale", () => {
  const copy = flowDoc();
  const draft = changed(copy, (d) => { d.flows = d.flows!.filter((f) => f.id !== "flow-2"); });
  const r = runCheck(copy, draft);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("flows removed:\n  flow-2: named by no chain\n"), r.stdout);
  assert.ok(r.stdout.includes("stale:\n  none"), r.stdout);
});
```

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/update-check.test.ts`
Expected: FAIL — the draft is accepted (status 0) where 2 is expected, and neither guard message prints.

- [ ] **Step 3: Implement the guard**

In `update-diff.ts`, add `removedFlows(copy, draft)` returning one entry per flow in `copy.flows` absent from `draft.flows`, with the chains in the draft that name it (id and draft index) and the candidate flows those chains could be re-pointed to (the flows the draft has that the copy did not, as `removedLinks` computes its own candidates), plus a second rule over draft chains naming a flow that has no non-catalog source left. Print the section `flows removed:` as `  <flow>: named by <chain>, …; repoint to <a, b>, or drop` or `  <flow>: named by no chain`. Add the two check rules to `CHECK_RULES` after `linkIntoRemoved`, with the messages the tests pin, so both are `UPDATE_MISMATCH` and exit 2 under `--check`. `EMPTY` in the test file gains `removedFlows: []` beside A12's two keys, for the same reason.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/update-check.test.ts`
Expected: PASS.

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0. If `removedFlows` trips the cyclomatic limit, split its candidate computation into a private helper as `removedLinks` does.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/scripts/lib/update-diff.ts skills/fmea-software/scripts/update-check.test.ts
git commit -F- <<'EOF'
Update mode: the removed-flow guard the invariants cannot give the draft

chain-flow-resolves and flow-sources-required fire at the end of an
update, so the checker needs its own structural guard: a removed flow a
chain still names, and a chain-named flow that lost its last non-catalog
source, are refused before the draft is written.
EOF
```

### Task A14: The stale reason accepted at or above the computed reach

**Files:**
- Modify: skills/fmea-software/scripts/lib/update-diff.ts (`ReachedRow` and `reachedRows`, the `STALE_REASON_ORDER` constant, `staleReason` at :284-289, and `checkContext` at :255-261)
- Test: skills/fmea-software/scripts/update-check.test.ts (new cases, and the existing refused-flag case at :276-278 which must now also accept the higher reasons)

**Interfaces:**
- Consumes: A12's `reason` field on `ReachedRow`; A1's five-member `StaleReason` and the schema's enum order.
- Produces: `export const STALE_REASON_ORDER: readonly StaleReason[]`; `ReachedRow.reason: StaleReason`; a `stale-reason` rule that refuses only a reason *below* the reach it computes.

- [ ] **Step 1: Write the failing tests**

```ts
test("STALE_REASON_ORDER is the schema's enum, in order", () => {
  const declared = (((loadSchema().$defs as Record<string, Record<string, unknown>>).stale as Record<string, Record<string, unknown>>).properties.reason as { enum: StaleReason[] }).enum;
  assert.deepEqual([...STALE_REASON_ORDER], declared);
});

test("a row reached by a flow change accepts flow-changed or any reason above it, and refuses the ones below", () => {
  const copy = flowDoc();
  const edit = (d: FmeaDocument, reason: StaleReason): void => {
    chainOf(d, "ch-1").stale = { flag: true, reason, since_version: d.meta.version };
    flowOf(d, "flow-1").users = { population: "internal only: operators" };
  };
  for (const [reason, status] of [["element-changed", 0], ["function-changed", 0], ["flow-changed", 0], ["control-removed", 2], ["scales-version", 2]] as const) {
    const draft = changed(copy, (d) => edit(d, reason));
    assert.equal(runCheck(copy, draft, "--check").status, status, reason);
  }
});

test("a row reached by an element change still accepts element-changed alone", () => {
  const copy = storedCopy();
  const draft = changed(copy, (d) => { chainOf(d, "ch-1").stale = { flag: true, reason: "function-changed", since_version: d.meta.version }; });
  const r = runCheck(copy, draft, "--check");
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /^error UPDATE_MISMATCH: stale-reason: chain ch-1 is reached by edge checkout to gw changed but its stale.reason is function-changed at \/chains\/0\/stale\/reason$/m);
});
```

- [ ] **Step 2: Run the suite and watch it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/update-check.test.ts`
Expected: FAIL — `STALE_REASON_ORDER` is not exported, and the flow-reached row with `function-changed` is refused where 0 is expected.

- [ ] **Step 3: Implement the rule**

Add `export const STALE_REASON_ORDER: readonly StaleReason[] = ["element-changed", "function-changed", "flow-changed", "control-removed", "scales-version"];` to `update-diff.ts`. In `reachedRows`, keep the reach whose reason has the lowest index when several reaches apply to one row (today it keeps the first computed), so a row reached by both an element change and a flow change keeps `element-changed`. Replace `staleReason` with:

```ts
const staleReason: CheckRule = (ctx, i) => {
  const reach = ctx.reached.get(i);
  const c = ctx.draft.chains[i];
  const stated = c.stale.reason;
  if (reach === undefined || !c.stale.flag || stated === undefined) return reach === undefined || !c.stale.flag ? [] : mismatch("stale-reason", `chain ${c.id} is reached by ${reach.rule} but its stale.reason is absent`, ptr("chains", i, "stale", "reason"));
  if (STALE_REASON_ORDER.indexOf(stated) <= STALE_REASON_ORDER.indexOf(reach.reason)) return [];
  return mismatch("stale-reason", `chain ${c.id} is reached by ${reach.rule} but its stale.reason is ${stated}`, ptr("chains", i, "stale", "reason"));
};
```

Add the two both-fire cases the design names as explicit tests: element + flow → `element-changed` accepted; function + flow → `function-changed` accepted (the second is the test above). Update `ReachedRow`'s comment to say that `reason` is the lowest-precedence-bar reason the reach justifies, so a draft may state anything at or above it.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/update-check.test.ts`
Expected: PASS, with the existing refused case at `:276-278` still refused (its row is reached by an edge, so only `element-changed` is accepted there).

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add skills/fmea-software/scripts/lib/update-diff.ts skills/fmea-software/scripts/update-check.test.ts
git commit -F- <<'EOF'
Update mode: the checker accepts any reason at or above the reach it computes

Its computed reach is a lower bound on the precedence order, so a row
reached by a function change and a flow change takes function-changed
instead of being refused for a reason the checker never computes.
EOF
```

### Task A15: The DF3 reading fixtures

**Files:**
- Test: skills/fmea-software/scripts/validate.test.ts (the accepted documents), skills/fmea-software/scripts/render.test.ts (the annotations), skills/fmea-software/scripts/lints.test.ts (the coupling rule)
- Modify: skills/fmea-software/scripts/test-helpers.ts (a `readingDoc()` builder, named apart from `update-check.test.ts`'s local `flowDoc()` so the two cannot be confused, shared by the test files that use it)

**Interfaces:**
- Consumes: A2's and A3's rules; A11's annotation; A9's fixture.
- Produces: one accepted document per DF3 reading, each stating the band it must produce, and the coupling case's finding.

- [ ] **Step 1: Write the seven documents and their assertions**

In `validate.test.ts`, add a test that walks the seven readings as data — the chain that names no flow (the function fallback); a chain-named flow read at majority; one read at subset; the floor case (a narrower named flow whose chain still reads the function's class); the partial-prefix case (a `steps_partial` flow whose prefix excludes the chain's function, read at subset before the floor); the share-raise case (a `users.share` raising the flow's class before the floor); and the single-client case (a flow whose population is one named client, read at majority) — asserting `checkInvariants` returns `[]` and no lint fires for each, and that each document's `ratings.S.value` is the band the reading produces:

```ts
const READINGS: { name: string; band: number; build: (doc: FmeaDocument) => void }[] = [ /* the seven */ ];
for (const reading of READINGS) {
  test(`validate.ts accepts the DF3 reading ${reading.name} and its stated band of ${reading.band}`, () => {
    const doc = minimalDoc();
    reading.build(doc);
    doc.chains[0].ratings.S.value = reading.band;
    doc.chains[0].ratings.S.rationale = `flow-1 sets the band: ${reading.name}`;
    assert.deepEqual(checkInvariants(doc), []);
    assert.deepEqual(runLints(doc).map((l) => l.rule), []);
  });
}
```

The band is read off the anchors the author chose; these assertions pin that the tool accepts the reading and that the chain's annotation and the invariant and lint behaviour are consistent with it, not that the tool computes a class. The design's own count disagrees with itself here — §11 criterion 7 says "DF3's five readings", §8.2 lists seven, and this task covers the seven — so the acceptance note records the discrepancy as a spec erratum rather than the plan silently choosing one number.

Add one further case, outside the `READINGS` loop, pinning the half the schema cannot see:

```ts
test("a population that is a bare count validates, and it is the reviewer rule that must catch it", () => {
  const doc = minimalDoc();
  doc.flows = [{ id: "flow-1", name: "One", value_priority: "High", users: { population: "5000 shoppers" }, sources: [{ kind: "document", ref: "checkout-inputs.md" }] }];
  doc.chains[0].flows = ["flow-1"];
  doc.chains[0].ratings.S.rationale = "flow-1 sets the band";
  assert.deepEqual(checkInvariants(doc), []);
  assert.deepEqual(runLints(doc).map((l) => l.rule), []);
});
```

- [ ] **Step 2: Pin the annotations**

In `render.test.ts`, add one case per reading that names flows, asserting the chain annotation prints the chosen flow (the first entry) and, where more than one is named, the disjointness note; and in `lints.test.ts`, add the coupling case — a chain naming two flows whose `steps` share a provider function — asserting `chain-flow-shared-provider` is documented as the reviewer rule that carries it (the rule is a reviewer rule, so the test asserts the documented row and that no machine lint fires on the pair).

- [ ] **Step 3: Run the suite and watch it fail, then pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/validate.test.ts skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/lints.test.ts`
Expected: FAIL first on the missing builders and the missing assertions; PASS once they are written, with no change to any lib module. If a reading needs a rule change to pass, that is a defect in A1 to A14, not a fixture problem: stop and report it.

- [ ] **Step 4: Run both runners**

Run: `bun tools/run-tests.ts` then `bun tools/check.ts`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add skills/fmea-software/scripts/test-helpers.ts skills/fmea-software/scripts/validate.test.ts skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/lints.test.ts
git commit -F- <<'EOF'
Tests: one document per DF3 reading, each stating the band it must produce

The function fallback, majority, subset, the floor, the partial prefix
read at subset, the share that raises before the floor, and the
single-client majority — with the coupling case that stays a reviewer
judgement.
EOF
```

### Task A16: The shipped docs and the version

**Files:**
- Modify: `docs/scripts.md` (the `update-check.ts` paragraphs and the compatibility section)
- Modify: `README.md` (only the lines that name the document's parts or the report's sections, found by grepping for `chains` and `sections`)
- Modify: `docs/specs/2026-09-07-fmea-software-design.md` (dated amendment notes)
- Modify: `skills/fmea-software/scripts/lib/version.ts:7` and `.claude-plugin/plugin.json` (0.6.0 → 0.7.0)
- Modify: the golden and before fixtures' `computed` blocks (regenerated at the new version)

**Interfaces:**
- Consumes: every earlier task; the repo's amendment-note convention from `docs/specs/2026-09-07-fmea-software-design.md`'s existing notes.
- Produces: the shipped documentation and the two version literals.

- [ ] **Step 1: Decide and state the version**

This task assumes 0.7.0 (decision 7). If the user renumbers, change the two literals and the two doc lines in this task only.

- [ ] **Step 2: The scripts page**

In `docs/scripts.md`, extend the `update-check.ts` paragraph and its role table row to name the flows section, the chain re-points, the removed-flow guard and the stale reason it can flag. In the compatibility section, add the 0.7.0 paragraph: the document gains an optional `flows` array and `chains[].flows`, an analysis without them still validates, and a stored analysis rated at scales version 1 is re-read on the next update by the existing rule.

- [ ] **Step 3: The README**

Two greps, for two different kinds of line:

```bash
grep -n 'chains\|sections\|five parts\|six parts' README.md
grep -n '0\.6\.0\|version 0\.6' README.md
```

Change an enumerating line only where the enumeration is closed — it gains flows. Change the version-bearing lines to 0.7.0: `README.md:5` ("It is version 0.6.0, a pre-release: …") and the opening of the status paragraph at `README.md:96` ("0.6.0 is a pre-release."). Leave the historical lines that name rounds which ran at 0.6.0 or 0.1.0 exactly as they are — `README.md:61`, `:107`, `:111`, `:112`, `:116` and `docs/scripts.md:36` are the record of those rounds, and the 0.7.0 round's own sentences arrive in plan B after its runs. Leave prose that merely mentions the chains.

- [ ] **Step 4: The main design's amendment notes**

Append dated notes in the convention the file already carries, one per changed part, pointing at `2026-10-12-flow-model-design.md` and the section that governs: the document's parts and the schema section (six authored parts, `flows[]`, `chains[].flows`, `$id` still v3); the validator and lint section (seven invariants, four lints, three reviewer rules, the new counts); the scales section (`scales version: 2`, the denominator, the anchor rows restated); the report section (the Flows section, the TOC entry, the chain annotation); the update-mode section (`flow-changed`, its triggers, the flow diff and the guards, the accepted reason at or above the reach); and the evals section (rubric 4, c16, prompt 1's maximum 28, the flows stability predicate), which part B delivers.

Check the notes are all present and none names the private repository:

```bash
git diff -U0 -- docs/specs/2026-09-07-fmea-software-design.md | grep '^+' | grep -c 'amended 2026-10-12 by the flow-model design'
git diff -U0 -- docs/specs/2026-09-07-fmea-software-design.md | grep '^+' | grep -c 'private repository'
```

- [ ] **Step 5: The version and the regenerated fixtures**

Set `PLUGIN_VERSION` in `skills/fmea-software/scripts/lib/version.ts` and `version` in `.claude-plugin/plugin.json` to `0.7.0`, then regenerate the fixtures' two `computed` blocks, one command each (a loop is not the same in bash and fish):

```bash
node skills/fmea-software/scripts/validate.ts skills/fmea-software/evals/fixtures/checkout-service.fmea.json --write
node skills/fmea-software/scripts/validate.ts skills/fmea-software/evals/fixtures/update/before.fmea.json --write
grep -n '0\.7\.0' .claude-plugin/plugin.json skills/fmea-software/scripts/lib/version.ts
grep -n '0\.6\.0' .claude-plugin/plugin.json skills/fmea-software/scripts/lib/version.ts
grep -n '0\.7\.0' README.md | head -3
```

Expected: the first grep prints the two new literals; the second prints nothing, so neither version file carries a stale literal; the third prints `README.md:5` and the status paragraph's opening at `:96`, so the README's own current-version statement agrees with the manifest. `0.6.0` remains where it records history this task does not touch: `README.md:61`, `:107`, `:111`, `:112`, `:116` and `docs/scripts.md:36`.

- [ ] **Step 6: Run both runners and the browser gate**

Run: `bun tools/run-tests.ts`, `bun tools/check.ts`, `node tools/check-browser.ts`
Expected: all exit 0, with `skill-copy.test.ts` seeing the manifest version and the fixture's `computed.validator_version` agree.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/scripts.md docs/specs/2026-09-07-fmea-software-design.md .claude-plugin/plugin.json skills/fmea-software/scripts/lib/version.ts skills/fmea-software/evals/fixtures
git commit -F- <<'EOF'
Docs: the flow model in the scripts page, the README and the main design, at 0.7.0

The update-check page names the flow sections and the guard; the main
design carries a dated note per changed part; and both version literals
move with the fixtures they are recorded in.
EOF
```

- [ ] **Step 8: The acceptance judge**

Dispatch one agent on the strongest available model with the spec, this plan and the branch, told to check only these, and to report anything it cannot check as unverified:
- §11 criterion 1, except the sentence about lint codes (decision 5), which is met by the shipped shape instead;
- §11 criterion 2, including that the checked sentence in `scales-software.md` passes and that no sourced sentence cites a record id that is not in the register;
- §11 criterion 3;
- §11 criterion 4, including that the checkout fixture renders the section;
- §11 criterion 7, including that the multi-flow case writes the disjointness assumption — which no tool can check, so the judge reads the golden fixture's `meta.assumptions[]` entry and the reviewer-rule text instead, and reports it as a document convention checked by reading;
- §11 criterion 8, except the parts about `evals/rubric.md`'s maxima and the c16 pins, which are criterion 5's and part B's;
- §11 criterion 6, limited to C201's register row and the `flow-users-review-by-date` refusal; the provisional-in-the-report half is checked on the golden fixture.
Report the judge's tier with its verdict. **This plan ends here**; part B holds §8.1, the evals.
