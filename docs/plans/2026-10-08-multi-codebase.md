# Multi-codebase schema v3 Implementation Plan, part A: the format, the rules, the checker, the report and the prose

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the fmea-software plugin's analysis document to schema v3, so that one run covers several codebases and services: dependencies as edges, codebases as records, causes linked to the chain whose failure mode they are, a shipped read-only update checker, a report grouped by top-level element, and the skill text that teaches all of it, at version 0.6.0.

**Architecture:** The format change lands in one commit (tasks A1 to A3), because the validator refuses the old block from the moment the schema changes. A new module `scripts/lib/graph.ts` holds the one element index, the one parent walk and the edge-join predicate that the nine invariants, the four lints, the report model and the update checker all read (A4 to A7, A8 to A9, A11). The fixture is enriched once (A10), the report model and renderer follow (A11 to A14), and the prose, references and version close plan A (A15 to A18). Every task ends with both runners green; every commit that touches the renderer's import graph also runs the browser gate and the comparison. Plan B, `2026-10-08-multi-codebase-evals.md`, holds build step 6 of §18, the evals, which spend model time and end at a user gate.

**Tech Stack:** TypeScript run directly by Node 24.2 or later (`node:test`, `node:assert/strict`), the plugin's own scripts under `skills/fmea-software/scripts/`, a JSON Schema subset interpreted by `lib/schema.ts`, Playwright through `tools/check-browser.ts`, `tools/compare.ts` and `tools/shots.ts`, and the dev checkers `tsc`, `oxlint` and `fallow` through `tools/check.ts`.

**Spec:** `docs/specs/2026-10-08-multi-codebase-design.md` at commit ed1b9b0 on branch `multi-codebase`. The plan argues from the spec and quotes its sections as §N; executors read both. The main design, `docs/specs/2026-09-07-fmea-software-design.md`, describes what exists today.

## How to read this plan

- Tasks A1 to A18 run in order on branch `multi-codebase`. Task ids are the only names used across tasks; each task's **Interfaces** block names what it consumes from earlier tasks and what later tasks rely on, with exact signatures.
- Both plan files are committed on `multi-codebase` before A1 begins, so the clean-tree checks of A3 Step 15 and of plan B's B4, B5 and B7 hold. The plan files are not edited during execution; progress is tracked in the controller's ledger, so every clean-tree check means exactly that.
- Line numbers in **Files** blocks are those of commit ed1b9b0. Earlier tasks shift them, so every edit also quotes the anchor text to find.
- Commands written as `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node ...` are for the implementing agent's shell, which is zsh without Node on PATH. The two runners run as `bun tools/run-tests.ts` and `bun tools/check.ts`, which find Node 24 through nvm. None of these is a user-facing command; the shipped documents keep the forms CLAUDE.md prescribes.
- A step that says "watch it fail" names the failure it expects. A test that passes before the change is a regression pin and is named as such.
- Plan A ends with one Fable acceptance judge over the parts of §19 that plan A delivers (see the end of A18). Plan B has one Fable judge over the results note. Every other agent in both plans runs on Opus or Sonnet.

## Global Constraints

Every task's requirements include this section.

- Runtime: Node 24.2 or later. Activate it with `nvm use 24` in fish or `source ~/.nvm/nvm.sh` in bash. The Bash tool shell is zsh with no node on PATH, so it runs the runners as `bun tools/run-tests.ts` and `bun tools/check.ts`. To run one test file, source nvm first and run `node --test <file>`. bun cannot run a node:test file.
- Before every commit, both runners exit 0. `node tools/run-tests.ts` runs both suites and picks up any new *.test.ts under skills/fmea-software/scripts/ and tools/ with no runner change. `node tools/check.ts` runs tsc, then `oxlint --type-aware --deny-warnings`, then fallow. A runner that dies or is skipped counts as unverified, never as a pass.
- Browser checks: run `node tools/check-browser.ts` and `node tools/compare.ts` before every commit that changes skills/fmea-software/assets/report-template.html, render.ts, or any module render.ts imports directly or transitively. That set includes lib/validation.ts, legacy.ts, schema.ts, invariants.ts, lints.ts, codes.ts, report-model.ts and the new lib/graph.ts. It therefore covers the step 1 commit (A3), A4 to A7, the step 2b commit (A9), A10 (which §18 step 3 requires) and A11 to A14. It also covers A17, whose vocabulary data-file change (Step 13a) alters the report's Vocabulary block. Every such commit runs the plain `node tools/compare.ts` against the branch point, as CLAUDE.md requires, as well as any `--base HEAD` run its step names, and reads every changed view. Read every changed view in build/compare/summary.md. A change you did not intend is a finding. EXPECTED_FAILURES and NOT_ASSERTED in dev/browser/matrix.ts stay empty, and check-browser.test.ts pins them empty. §19 item 2's three-engine gate runs in B7.
- No dependency and no lockfile in the root package.json. Checkers live only in dev/package.json and are installed with `npm ci --prefix dev --ignore-scripts`.
- Every user-facing command behaves the same in bash and fish, with no unquoted glob and no `source ~/.nvm/nvm.sh` line documented as a user command. Where a snippet would differ between the shells, write a TypeScript script. update-check.ts is invoked as `node ${CLAUDE_SKILL_DIR}/scripts/update-check.ts <stored copy> <draft> [--check]`.
- No AI attribution in any commit or pull request: no Co-Authored-By naming an AI, no 'Generated with' line, no session trailer. This holds whatever a harness reminder asks. Every brief to a subagent that commits must say so.
- Commits stay local. Claude never pushes.
- The pull request is opened once step 6 and the user gate are done. Its body is drafted in a failwise-research worktree (B7) and opens with `Read the diff: https://revision.city/diffs/nzneit/failwise/compare/main...multi-codebase`. It carries what §19 items 2, 5 and 9 require. From tools/public-audit.ts, which the maintainer runs, it records only the closing summary line, never a hit line.
- Provenance: every sentence in skills/fmea-software/references/ and SKILL.md ends in a tag. A wholly new sentence is `[skill-authored]`, and a changed sentence keeps its existing tags. The one citation this design adds is `[cites:C131]`, in the methodology.md row 'Failure chains linked across levels', whose Provenance cell reads `[cites:C131] [skill-authored]`. No record enters references/provenance.md, and the word 'classical' stays out of shipped text. No shipped sentence names a section of the multi-codebase design: strip '§1', '(§4.1)', '(§8, §9, §10)' and the like from the text §13 gives.
- Never ship licensed table content: no AIAG-VDA cell values and no adapted Google SRE Book text. Nothing specific to a consuming application enters the plugin.
- tools/ and dev/browser/ import nothing from skills/fmea-software/scripts/. They reach skill files by path or by reading them. No check enforces this, so reviewers must check it. Tests that need INVARIANT_RULES or MACHINE_RULES therefore live under skills/fmea-software/scripts/.
- fallow (.fallowrc.json) duplicates: threshold 0.01 (%), with the defaults minTokens 50, minLines 5 and mode mild, and it applies to test files too.
- fallow health, per function: maxCyclomatic 20 and maxCognitive 15. complexity-cyclomatic and complexity-cognitive are at error, and complexity-crap is off. Build each multi-output function (checkInvariants' new helpers, the SCC, diffUpdate, buildReportModel's additions) from small private helpers.
- fallow includeEntryExports is true, so an unused export of an entry file is reported. The entry files are skills/fmea-software/scripts/*.ts, which takes in test-helpers.ts and every *.test.ts, plus tools/*.ts and dev/browser/*.ts. test-helpers.ts therefore exports a value only when a test file imports it in the same task, and keeps it module-private until then.
- fallow failOnParseError is true.
- The parent walk, the element index and the edge-join predicate live once, in lib/graph.ts. They are never copied into lints.ts, report-model.ts or update-diff.ts.
- tsc: strict, noEmit, module nodenext, allowImportingTsExtensions (imports carry `.ts`), erasableSyntaxOnly (no enum, no parameter property), verbatimModuleSyntax (type-only imports use `import type`).
- Version: PLUGIN_VERSION in skills/fmea-software/scripts/lib/version.ts and `version` in .claude-plugin/plugin.json both read "0.4.1" until A18, where both become "0.6.0". This assumes item-body lands first at 0.5.0. If the user renumbers at landing, the change covers both files, README.md's status line and limitations section, the DEPENDENCY_LEGACY message range '0.3.x to 0.5.x' with validate.test.ts's `V3_REMEDIES` (A2), SKILL.md's "Migrate a v2 document" section and scripts paragraph (A15), structure-elements.md's "Migrating a v2 document" (A17), and the docs/scripts.md paragraph (A18). validate.test.ts:318 asserts only that the two files agree.
- Shipped CLI shape: a header usage comment, then `function main(argv: string[]): number` using parseArgs, assertExtension, the readJson* helpers and ScriptError, with the file ending exactly `\nif (isEntry(import.meta)) run(main);\n`. Only lib/cli.ts run() sets the exit status. A lib module never imports a CLI, and no CLI imports another CLI. Every tools/*.ts ends with exactly one top-level `if (isEntry(import.meta)) ...` statement, which tools/run-tests.test.ts:304 pins. No tools/*.ts is added by this plan.
- Failure lines: Issue lists print through writeIssues as `error <CODE>: <rule>: <message> at <pointer>`. A thrown ScriptError prints as `error <CODE>: <message>[ at <pointer>]`. CODES is a closed list ordered by exit status: 1 usage, 2 validation, 3 I/O. DEPENDENCY_LEGACY, UPDATE_BASELINE and UPDATE_MISMATCH all map to 2.
- Ordering contracts: errors[] is unsorted. checkInvariants output comes in INVARIANT_RULES order, then checkPriorities. Lints come in MACHINE_RULES order, then each rule's stated document order, then tablePropertyLints. Lint messages are fixed once shipped, and only step 1 changes the dependency-row message.
- Id comparisons are byte for byte. A duplicate id resolves to its first occurrence in document order, for elements, functions, chains and codebases alike.
- Every in-test document carries `dependencies`, or the gate refuses it. It holds `[]` when all elements are in_scope, and otherwise an edge into each owned_outside or third_party element.
- The checkout fixture keeps its element order, because the legacy triggers address elements by index. ch-9 is appended last, at /chains/8. In every fixture, `dependencies` sits between `functions` and `chains`, and an element's `codebase` key sits after `security_relevant` and `security_rationale` and before `sources`.
- Test style: top-level `test("<sentence naming the rule id first>", () => {...})` from node:test, `import assert from "node:assert/strict"`, and no describe blocks. Builders and loaders come from scripts/test-helpers.ts, and CLIs are driven through runCli and withTempDir. Tests for lib/x.ts live flat in scripts/x.test.ts, with one exception: lib/update-diff.ts is tested in scripts/update-check.test.ts beside the CLI, as the spec's §15 names it.
- Commit subject style: `<Area>: <lower-case clause>` or a plain sentence, with no trailing period and no `(#NN)`. The body is prose wrapped near 72 columns; a step that writes a commit with `-m` gives the body's content, and the implementer writes it through `git commit -F- <<'EOF'` with that body wrapped near 72 columns.
- Escaping: every new string the report prints passes through escapeHtml (render.ts `e()`). The renderer only escapes and emits, and derivation lives in report-model.ts.
- Template: exactly one @media query with parentheses (`max-width: <BREAKPOINT-1>px`, pinned by check-browser.test.ts), and exactly two `overflow-wrap:anywhere` declarations outside the narrow-width block (pinned by render.test.ts). The print block line `h2, h3, article.row > header { break-after: avoid; }` is unchanged, and `.group` is never added to the print break-inside list.
- The generated vocabulary region of references/structure-elements.md, between `<!-- vocabulary:start -->` and `<!-- vocabulary:end -->`, is never hand-edited. tools/gen-element-vocabulary.test.ts pins it.
- design-inputs.md checklist numbers do not move, because rubric.md cites item 4. The new item is appended as item 14.
- Model tiering: task drafting, implementation and per-task critique run on Opus or Sonnet subagents. Fable runs only at decision gates. There are two: one Fable acceptance judge at the end of plan A, and one Fable judge over plan B's results note before the user gate. A run report names each phase's tier and the number of Fable agents.
- Eval runs: FMEA_EVAL_PUBLISH_ROOT is the absolute path /home/nn/Projects/failwise/build/evals/multi-codebase, because run-eval.sh publishes after it cd's into a temp dir. No earlier evidence under build/evals is overwritten. A clause or run that did not happen is recorded as unverified, never as a pass.
- The Pages workflow and docs/tracking.md are unchanged. skill-copy.test.ts is unchanged, and the fixture's meta.tracker.project stays acme/checkout.

## Review Focus

Five input classes the spec implies but does not name, most likely to bite a person first. Each line names the task whose tests pin it.

1. A codebase `repo` or `path` that holds `<`, `>`, `&`, `"` or `'` renders escaped in the header's Codebases row, the top-level table and the tree label, because the `repo` pattern admits every one of those characters. A13 adds `repo` and `path` to render.test.ts's `FREE_TEXT_KEYS` and gives the poisoned document a `path`.
2. A top-level `"dependencies": null` has the key, so it passes the v2 gate and gets SCHEMA lines at `/dependencies`; an element with `"dependency": null` has the key and gets `DEPENDENCY_LEGACY` at `/elements/<i>/dependency`. A2's "the v2 gate on minimalDoc" cases pin both.
3. `update-check.ts` run with one file as both the stored copy and the draft: the first run exits 0 with every section `none`, and `--check` refuses it with `UPDATE_BASELINE` at `/meta/version`, because a draft at the copy's own version passes only the first run. A9 pins both, with the whole stdout.
4. Two top-level elements that share an id yield one root row, one group section and one `id="group-<id>"`, for the first element in document order, so every href on the page resolves to exactly one id. A11 pins the model and A12 the markup and the href test.
5. A provider rating whose `evidence_ref` is `""` cannot be cited byte for byte, because `cited_o.evidence_ref` is a non-empty string, so `linked-cause-occurrence-drift` reports every consumer of that provider until the provider's rating is fixed. A7 pins the message, so the behaviour is deliberate and visible.

## Decisions for the user at plan review

The spec left these open or the plan departs from its letter. Each states the plan's answer and the ruling. On 2026-10-08 the user delegated the rulings to one Fable judge, instructed to optimize for user experience and FMEA capability; its reasoning is in `build/review/2026-10-08-plan-decisions.md` (gitignored). Eleven were accepted as written; 2, 4, 9, 10 and 12 changed, and the tasks named carry the change.

1. **Plan addition, B3.** §16 says the results-note generator needs no change, but §19 item 6 requires the note to record the four session checks and prompt 5 as not re-run. B3 adds two optional fields to `results.json` and two sections to the note, rendered only when present, so the earlier notes regenerate byte for byte. If declined, B6 appends a hand-written section after generation. Ruled: accepted.
2. **Plan addition, B2 step 10.** The evals workflow's critic prompt also reads the multi-codebase design. Ruled: the critic reads §16 only, with a sentence that §16's four session checks are made in a session after the results file is written and are recorded in the results note, so it does not report them as missing; it does not read §19. B2 Step 10 carries the text.
3. **Plan addition, A16.** A new test file, `scripts/quality-and-lint.test.ts`, pins the validator-id and machine-lint sentences of `quality-and-lint.md` to `INVARIANT_RULES` and `MACHINE_RULES`. Nothing pins them today. Ruled: accepted.
4. **The vocabulary's "of the analysed system", A17.** §13 asks that the boundary table's phrase read "of the system this analysis covers" and that the generated vocabulary region of `structure-elements.md` stay untouched; the phrase lives inside that region, generated from `data/element-vocabulary-v1.json`. Ruled: edit the data file, regenerate the region with `tools/gen-element-vocabulary.ts`, and run the browser checks, because the report's Vocabulary block reads the same file; "untouched" means never hand-edited, and M5 removes "the analysed system" from the vocabulary. A17 Steps 13a and 13b.
5. **Note form, A18.** The main design's §5 amendment note carries the file name `2026-10-08-multi-codebase-design.md`, as the element-kinds notes do, where §14 quotes the note without it. Ruled: accepted.
6. **Commit shape.** Step 1 is one commit (A1 to A3), step 2b one commit (A8 and A9), and step 2 a commit per task (A4 to A7), which §18 allows. Steps 4 and 5, which §18 describes as single steps, are also split one commit per task, step 4 into A11 to A14 and step 5 into A15 to A18; §18's "from step 1 to step 4 the report prints no strength, SLA or limits" therefore ends at A13, where the Dependencies table lands. Ruled: accepted.
7. **The checker's refusal lines.** §10's "one finding line per row" is read as one line per row per rule, so a row with a wrong reason and a wrong `since_version` prints two lines, in rule order. A9 pins it. Ruled: accepted.
8. **The edge rule string.** §10's form `edge <from> to <to> changed` is printed for an added, a removed and a changed edge alike; the edge's own change is printed in the `edges:` section. Ruled: accepted; the history entry of decision 9 carries the verb.
9. **The checker's output.** Plain text sections, each opened by `<name>:` with `  none` when empty, and one plain last line `update-check: ...`. The changed-provider section prints only under `--check`, as §10 says. Ruled: the format stands; the summary the session copies into the update summary in `meta.history` is the checker's edges, elements and stale sections together with its last line, not the last line alone, because §10 makes that record "the record of each stale row's rule" and M7 relies on it to name the edge behind a consumer-side flag. A9 Step 14, A18 Steps 10 and 15 and B5 check 5 carry it; A15 Step 13 adds one `skill-authored` sentence to SKILL.md naming the three sections, since SKILL.md is the text the session reads (pre-flight ruling).
10. **Rubric 3's date.** §16 dates rubric 3 "the day it lands" and writes 2026-10-08 in the c1 notes. Ruled: one date, the landing date of B2's commit, in the version paragraph, its test pin and both c1 notes, as rubric 2's notes carry their landing day; nothing differs when B2 lands on 2026-10-08. B2 Steps 12 to 14.
11. **Session checks, B5.** The attended runs are Opus subagents whose brief carries the person's answers in advance, with the run's questions and commands written to files as the record, so the dialogue as asked stays unverified, as §19 item 6 expects. Ruled: accepted.
12. **structure-elements.md:12, A17.** The line says the boundary decides whether the dependency rows apply; once the rows apply to any element that is the `to` of an edge, that holds only for an outside element, and an analyst reading it would skip the rows on an in-scope provider. Ruled: reword it in two `skill-authored` sentences so that the boundary decides whether an element must be the provider of an edge and the edges decide the dependency rows, a plan addition §13 does not name. A17 Step 1a.
13. **Self-links in the report, A11.** A cause whose `chain` names its own chain resolves by the letter of §4.4, but the plan prints it as an unresolved link, the cause text alone with no Propagates-to entry, because `cause-chain-self` refuses it and a row linking to itself would only point back at its own row. Ruled: accepted.
14. **A chainless root's name, A13.** §12 links each root row's name to its group section and gives a root with no chains no section, so the plan leaves such a root's name in the top-level table as plain text. Ruled: accepted.
15. **A v2 draft under the checker, A9.** §10's `UPDATE_BASELINE` covers "a document the legacy gate refuses"; the plan reads that as the stored copy only. A v2 draft keeps its own code, `DEPENDENCY_LEGACY`, prefixed `the draft: `, because it is the document being written, not the baseline. Ruled: accepted.
16. **The README's 0.1.0 account, B6.** §14 keeps the account of the 0.1.0 evaluation unchanged beside the new sentences. B6 Step 6 also changes two of its sentences, "The evaluation" to "The full evaluation" and "The tested runs" to "The 0.1.0 runs" with a clause naming the model of the 0.6.0 runs, because the 0.6.0 runs used an Anthropic model and the glm sentence would otherwise read as covering them. If declined, the model clause goes at the end of the new paragraph instead. Ruled: accepted.

## Assumptions the plan rests on

- The stored `computed.validator_version` after A10's regeneration is `PLUGIN_VERSION` as `version.ts` holds it at that time (`"0.4.1"` at ed1b9b0, `"0.5.0"` if `item-body` has landed). Every `0.4.1` in A10's pins stands for that value. Nothing regenerates the fixture after A18 bumps the version to 0.6.0, so the pins hold.
- The `DEPENDENCY_LEGACY` message's range `0.3.x to 0.5.x`, the 0.6.0 version and the docs assume `item-body` lands first at 0.5.0; §14 names every place to renumber if it does not.
- The lints `cause-chain-severity` and `linked-cause-occurrence-drift` skip a link whose function or element does not resolve at either end, through a shared private helper, as §6's opening sentence requires; A7 pins four broken ends per lint.
- The browser checks apply to every commit that changes a module `render.ts` imports transitively, which includes `lib/graph.ts` from A3 on; a commit that changes no rendered byte expects `tools/compare.ts --base HEAD` to report the two reports byte for byte the same.
- The drift floors of schema.test.ts move by the delta each task computes (A1: +23 derived, +3 minLength; A10: +111 and +20). The floors were counted from the schema and the documents, not measured; if a measured total differs, keep the file's convention (derived floor = total − 56, minLength floor = total) and write the measured value.
- `graphDoc` builds its chains from `minimalDoc`'s first chain (failure mode "stops serving", cause "process crash", S 8, O 3, D 4, priority M), and its meta from `minimalDoc` (id `fmea-min`, version 1). The pinned messages of A5 to A9 and A11 to A12 rely on those defaults.

---

### Task A1: Schema v3 and its types

**Files:**
- Modify: skills/fmea-software/schemas/fmea.schema.json:3-40, 175-333, 376-396
- Modify: skills/fmea-software/scripts/lib/types.ts:30-40, 59
- Modify: skills/fmea-software/scripts/test-helpers.ts:189-192
- Test: skills/fmea-software/scripts/schema.test.ts:186-190, 263 (new cases after it), 438-470, 579-604
- Test: skills/fmea-software/scripts/codes.test.ts:202-210, 378-384

**Interfaces:**
- Consumes: none
- Produces:
  - `"$id": "urn:fmea-software:schema:fmea:v3"`
  - root `"required": ["meta", "elements", "functions", "dependencies", "chains"]`; `properties` in the order meta, elements, functions, dependencies, chains, computed; `dependencies` = `{ "type": "array", "description": …, "items": { "$ref": "#/$defs/dependencyEdge" } }`, no `minItems`
  - `$defs.dependencyEdge`, `$defs.codebase`, `$defs.citedOccurrence` (shapes in Step 3); their enum properties (`dependencyEdge.strength`, `citedOccurrence.evidence_kind`) are bare `{ "enum": [...], "description": … }` with no `type`, as every enum in the file is; `$defs.dependency` and `element.properties.dependency` removed
  - `meta.properties.codebases` (after `boundary`), `element.properties.codebase` (after `security_rationale`), `cause.properties.chain` and `cause.properties.cited_o` (after `adversarial`)
  - types.ts: `export interface Codebase { id: string; name: string; repo: string; path?: string }`, `export interface DependencyEdge { from: string; to: string; strength: Strength; sla?: string; limits?: string }`, `export interface CitedOccurrence { value: number; evidence_kind: RatingEvidenceKind; evidence_ref?: string }`, `Element.codebase?: string`, `Cause.chain?: string`, `Cause.cited_o?: CitedOccurrence`, `Meta.codebases?: Codebase[]`, `FmeaDocument { meta; elements; functions; dependencies: DependencyEdge[]; chains; computed? }`; `Dependency` and `Element.dependency` removed
  - `minimalDoc()` carries `dependencies: []` between `functions` and `chains`
  - codes.test.ts `TYPE_NAMES` without `"Dependency"`, with `"Codebase"`, `"DependencyEdge"`, `"CitedOccurrence"`

- [ ] **Step 1: Write the failing schema cases, extend the derivation document and move the floors.** In schema.test.ts change line 188 to `assert.equal(schema.$id, "urn:fmea-software:schema:fmea:v3");`. After the post_priority test, which ends at line 263, add:

```ts
test("the top level is five authored parts in order, with dependencies required between functions and chains and computed after them", () => {
  const schema = loadSchema();
  assert.deepEqual(schema.required, ["meta", "elements", "functions", "dependencies", "chains"]);
  assert.deepEqual(Object.keys(schema.properties as object), ["meta", "elements", "functions", "dependencies", "chains", "computed"]);
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  delete doc.dependencies;
  const issues = checkSchema(doc);
  assert.deepEqual(issues.map((i) => i.pointer), [""]);
  assert.match(issues[0].message, /missing required property "dependencies"/);
});

test("an element that carries a dependency key is refused at the key", () => {
  const issues = elementIssues((e) => { e.dependency = { strength: "strong" }; });
  assert.deepEqual(issues.map((i) => i.pointer), ["/elements/0/dependency"]);
  assert.match(issues[0].message, /unexpected property "dependency"/);
});

// minimalDoc() with `dependencies` set to `edges`; the schema checks shape only, so the ends need not resolve.
function edgeIssues(...edges: unknown[]): string[] {
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  doc.dependencies = edges;
  return checkSchema(doc).map((i) => i.pointer);
}

test("a dependency edge is closed, requires from, to and strength, and takes sla and limits as free text", () => {
  const edge = { from: "svc", to: "svc.db", strength: "weak", sla: "99.9% monthly", limits: "10 rps" };
  assert.deepEqual(edgeIssues(edge, { from: "svc.db", to: "svc", strength: "strong" }), []);
  for (const key of ["from", "to", "strength"]) {
    const missing: Record<string, unknown> = { ...edge };
    delete missing[key];
    assert.deepEqual(edgeIssues(missing), ["/dependencies/0"], key);
  }
  assert.deepEqual(edgeIssues({ ...edge, consumer: "svc" }), ["/dependencies/0/consumer"]);
  assert.deepEqual(edgeIssues({ ...edge, strength: "critical" }), ["/dependencies/0/strength"]);
  assert.deepEqual(edgeIssues({ ...edge, from: "Svc" }), ["/dependencies/0/from"]);
  assert.deepEqual(edgeIssues({ ...edge, to: "svc..db" }), ["/dependencies/0/to"]);
});

function codebaseIssues(codebases: unknown): string[] {
  const doc = minimalDoc();
  (doc.meta as unknown as Record<string, unknown>).codebases = codebases;
  return checkSchema(doc).map((i) => i.pointer);
}

test("meta.codebases is optional, never empty, and each entry is closed with an id, a name and an owner/repo repo", () => {
  const entry = { id: "checkout", name: "Checkout service", repo: "acme/checkout" };
  assert.deepEqual(codebaseIssues([entry, { ...entry, id: "web", path: "apps/web" }]), []);
  assert.deepEqual(codebaseIssues([]), ["/meta/codebases"]);
  for (const key of ["id", "name", "repo"]) {
    const missing: Record<string, unknown> = { ...entry };
    delete missing[key];
    assert.deepEqual(codebaseIssues([missing]), ["/meta/codebases/0"], key);
  }
  for (const repo of ["acme", "acme/checkout/web", "acme/checkout@abc", "acme:x/checkout", "acme/check out", "/checkout"]) {
    assert.deepEqual(codebaseIssues([{ ...entry, repo }]), ["/meta/codebases/0/repo"], repo);
  }
  assert.deepEqual(codebaseIssues([{ ...entry, id: "-x" }]), ["/meta/codebases/0/id"]);
  assert.deepEqual(codebaseIssues([{ ...entry, path: "" }]), ["/meta/codebases/0/path"]);
  assert.deepEqual(codebaseIssues([{ ...entry, commit: "a".repeat(40) }]), ["/meta/codebases/0/commit"]);
});

test("elements[].codebase and causes[].chain are optional plain ids", () => {
  assert.deepEqual(elementIssues((e) => { e.codebase = "checkout"; }), []);
  assert.deepEqual(elementIssues((e) => { e.codebase = ""; }).map((i) => i.pointer), ["/elements/0/codebase"]);
  const doc = minimalDoc();
  doc.chains[0].causes[0].chain = "ch-2";
  assert.deepEqual(checkSchema(doc), []);
  doc.chains[0].causes[0].chain = "-ch-2";
  assert.deepEqual(checkSchema(doc).map((i) => i.pointer), ["/chains/0/causes/0/chain"]);
});

function citedIssues(cited: unknown): Issue[] {
  const doc = minimalDoc();
  Object.assign(doc.chains[0].causes[0], { chain: "ch-2", cited_o: cited });
  return checkSchema(doc);
}

test("causes[].cited_o is a closed object: value 1 to 10, evidence_kind required, evidence_ref optional and non-empty", () => {
  const cited = { value: 6, evidence_kind: "observed_incident", evidence_ref: "INC-2026-0314" };
  const at = (c: unknown): string[] => citedIssues(c).map((i) => i.pointer);
  assert.deepEqual(citedIssues(cited), []);
  assert.deepEqual(citedIssues({ value: 6, evidence_kind: "estimate" }), []);
  const zero = citedIssues({ ...cited, value: 0 });
  assert.deepEqual(zero.map((i) => i.pointer), ["/chains/0/causes/0/cited_o/value"]);
  assert.match(zero[0].message, /value 0 is below the minimum 1/);
  const eleven = citedIssues({ ...cited, value: 11 });
  assert.deepEqual(eleven.map((i) => i.pointer), ["/chains/0/causes/0/cited_o/value"]);
  assert.match(eleven[0].message, /value 11 is above the maximum 10/);
  const noKind = citedIssues({ value: 6, evidence_ref: "INC-2026-0314" });
  assert.deepEqual(noKind.map((i) => i.pointer), ["/chains/0/causes/0/cited_o"]);
  assert.match(noKind[0].message, /missing required property "evidence_kind"/);
  assert.deepEqual(at({ ...cited, rationale: "x" }), ["/chains/0/causes/0/cited_o/rationale"]);
  assert.deepEqual(at({ ...cited, evidence_kind: "guess" }), ["/chains/0/causes/0/cited_o/evidence_kind"]);
  assert.deepEqual(at({ ...cited, evidence_ref: "" }), ["/chains/0/causes/0/cited_o/evidence_ref"]);
});

test("the v3 properties sit where the plan places them and each new description names the rule that governs it", () => {
  const schema = loadSchema();
  const defs = schema.$defs as Record<string, SchemaNode>;
  const props = (def: string): Record<string, SchemaNode> => defs[def].properties as Record<string, SchemaNode>;
  const text = (node: SchemaNode): string => String(node.description);
  assert.ok(!("dependency" in defs));
  assert.deepEqual(Object.keys(props("meta")).slice(5, 7), ["boundary", "codebases"]);
  assert.deepEqual(Object.keys(props("element")).slice(-3), ["security_rationale", "codebase", "sources"]);
  assert.deepEqual(Object.keys(props("cause")), ["text", "origin", "adversarial", "chain", "cited_o"]);
  const cases: [string, SchemaNode, string[]][] = [
    ["dependencies", (schema.properties as Record<string, SchemaNode>).dependencies, ["element-dependency-required"]],
    ["dependencyEdge", defs.dependencyEdge, ["F-WS3-01", "dependency-pair-unique"]],
    ["dependencyEdge.from", props("dependencyEdge").from, ["dependency-from-resolves"]],
    ["dependencyEdge.to", props("dependencyEdge").to, ["dependency-to-resolves", "dependency-self"]],
    ["codebase.id", props("codebase").id, ["codebase-id-unique"]],
    ["element.codebase", props("element").codebase, ["element-codebase-resolves"]],
    ["cause.chain", props("cause").chain, ["cause-chain-resolves", "cause-chain-self", "cause-chain-cycle"]],
    ["cause.cited_o", props("cause").cited_o, ["linked-cause-occurrence-drift"]],
    ["citedOccurrence", defs.citedOccurrence, ["linked-cause-occurrence-drift"]],
  ];
  for (const [where, node, ids] of cases) for (const id of ids) assert.ok(text(node).includes(id), `${where} does not name ${id}`);
  assert.ok(text(props("cause").cited_o).includes("written only when the consumer's O is rated, re-rated or re-scored and removed with the link"));
  assert.ok(!text(defs.dependencyEdge).includes("analysed system"));
  assert.ok(text(defs.elementBoundary).endsWith("An element whose boundary is not in_scope is the `to` of at least one edge in dependencies[] (invariant element-dependency-required)."));
  assert.ok(text(props("element").parent).endsWith("Derivable from id; the report's tree and the ancestor walk of the lints read it."));
  assert.ok(text(schema).includes("Five parts are authored (meta, elements, functions, dependencies, chains)"));
  assert.ok(!text(schema).includes("fifth part"));
});
```

In the same file, extend derivationDoc() (lines 447-470) so the drift tests reach the new constrained nodes. Before its `return`, add:
```ts
(doc.meta as unknown as Record<string, unknown>).codebases = [{ id: "svc-repo", name: "Service repository", repo: "acme/svc", path: "services/svc" }];
doc.elements[0].codebase = "svc-repo";
Object.assign(doc.chains[0].causes[0], { chain: "ch-2", cited_o: { value: 6, evidence_kind: "observed_incident", evidence_ref: "INC-1" } });
```
Extend the comment above derivationDoc with one sentence: "It also sets a codebase entry with a path, an element's codebase and a linked cause with a cited O, which no fixture carries until the fixture gains them." (A10 Step 1 deletes this sentence when the fixture gains them.) The unreached pin at line 558 stays `["/$defs/historyEntry", "/$defs/stale/properties/reason"]`. `/$defs/codebase`, its `repo` and `/$defs/citedOccurrence` with its `evidence_kind` are unreached by the golden only until A10 enriches the fixture, so they are not pinned. Floors: line 595 becomes `assert.ok(derived >= 1208, …1208…)` and line 604 becomes `assert.ok(minLengthDerived >= 257, …257…)`. Append to the comment ending "the floor is 1,185." (line 594): "Schema v3 moved the count by 23. The golden lost its two dependency blocks (-4, one required entry and one enum each), gained the root's fifth required entry (+1) and two edges (+12, three required entries, two elementId patterns and one enum each). The derivation document gained its fifth root entry (+1), a codebase entry with a path (+7: three required entries, two patterns, two minLength), an element codebase (+1) and a linked cause with a cited O (+5: a plainId pattern, two required entries, one enum, one minLength). The floor moves by the change, to 1,208." Append to the minLength comment (line 603): "Schema v3 adds three, all from the derivation document: the codebase's name and path and the cited O's evidence_ref, so the floor is 257."

In codes.test.ts rename the test at line 202 to `"minimalDoc is one element, one function, no edge and one chain priced M with rpn 96"` and add `assert.deepEqual(doc.dependencies, []);` and `assert.deepEqual(Object.keys(doc), ["meta", "elements", "functions", "dependencies", "chains"]);`. In `TYPE_NAMES` (lines 378-384), replace `"Dependency"` at line 382 with `"Codebase", "DependencyEdge", "CitedOccurrence"`.

- [ ] **Step 2: Run the two files and watch them fail.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/schema.test.ts skills/fmea-software/scripts/codes.test.ts`. Expected failures:
  - the `$id` pin (`v2` !== `v3`);
  - every new case above;
  - "every constrained schema node the golden fixture cannot reach is reached by the derivation document", at "the derivation document must itself validate" (unexpected property `codebases`, `codebase`, `chain`, `cited_o`);
  - "drift: …", at the minLength floor (`expected at least 257 derived minLength violations, ran 254`), since the v2 schema has no node for the three new strings;
  - the minimalDoc test and the types test, which reports `types.ts must export Codebase`.

- [ ] **Step 3: Rewrite fmea.schema.json to v3.** Key order inside every object `$def` follows the house order: title, description, type, additionalProperties, required, properties. An enum property is written as the file writes every enum, `{ "enum": [...], "description": … }` with no `type`.
  - Line 3: `"$id": "urn:fmea-software:schema:fmea:v3",`.
  - Line 5: replace the sentences "Four parts are authored (meta, elements, functions, chains): … The fifth part, computed, is written only by validate.ts --write." with "Five parts are authored (meta, elements, functions, dependencies, chains): elements and functions are normalized and keyed by stable ids, dependencies are edges from a consumer element to a provider element, and chains are denormalized rows, one per failure chain, carrying everything the report's chain index and row sections print. A sixth part, computed, follows them and is written only by validate.ts --write." Keep the rest of that description as it is.
  - Line 8: `"required": ["meta", "elements", "functions", "dependencies", "chains"],`.
  - Between `functions` (ends line 27) and `chains` (line 28), add:
    ```json
    "dependencies": {
      "type": "array",
      "description": "The dependency edges, one per consumer and provider pair, each with its own strength, SLA and limits; an empty array when nothing depends on anything. An element whose boundary is not in_scope is the to of at least one edge (invariant element-dependency-required). The update mode diffs this array against the stored version by each edge's from and to.",
      "items": { "$ref": "#/$defs/dependencyEdge" }
    },
    ```
  - In `meta.properties`, directly after `boundary` (lines 203-205), add:
    ```json
    "codebases": {
      "type": "array",
      "minItems": 1,
      "description": "Optional. The codebases this run covers or reads, one entry each, set in step 1 beside the boundary; absent when the run names none, and never empty. A codebase whose repository the inputs do not name is an open assumption, not an entry.",
      "items": { "$ref": "#/$defs/codebase" }
    },
    ```
    `meta.required` is unchanged.
  - Replace `$defs.dependency` (lines 251-271) with:
    ```json
    "dependencyEdge": {
      "title": "Dependency edge",
      "description": "How a consumer element depends on a provider element, classified strong or weak with its SLA and limits as free text (F-WS3-01). An edge has no id: its from and to are its identity, and a pair occurs once (invariant dependency-pair-unique). An edge into an element outside the boundary makes that element an external dependency, and one into an in_scope element an internal dependency. Edges may cross levels in either direction and need not be acyclic.",
      "type": "object",
      "additionalProperties": false,
      "required": ["from", "to", "strength"],
      "properties": {
        "from": { "$ref": "#/$defs/elementId", "description": "The consumer: the id of the element that depends on the provider (invariant dependency-from-resolves)." },
        "to": { "$ref": "#/$defs/elementId", "description": "The provider: the id of the element depended on (invariant dependency-to-resolves), never the consumer itself (invariant dependency-self)." },
        "strength": { "enum": ["strong", "weak"], "description": "Strong or weak, as the design-inputs checklist classifies dependencies." },
        "sla": { "type": "string", "description": "The availability or latency commitment, as free text in the source's own terms. Nothing computes on it." },
        "limits": { "type": "string", "description": "Scaling or rate limits, as free text in the source's own terms. Nothing computes on it." }
      }
    },
    "codebase": {
      "title": "Codebase",
      "description": "One codebase the run covers or reads. Several entries may share a repo, which is the monorepo case; the lint repo-ref-codebase compares repositories only.",
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "name", "repo"],
      "properties": {
        "id": { "$ref": "#/$defs/plainId", "description": "Unique in meta.codebases (invariant codebase-id-unique); elements[].codebase names it." },
        "name": { "$ref": "#/$defs/nonEmptyString", "description": "How the team says it." },
        "repo": { "type": "string", "pattern": "^[^\\s/@:]+/[^\\s/@:]+$", "description": "The repository in the owner/repo form, the same form as the owner/repo head of a qualified repo source ref, which the lint repo-ref-codebase compares with it byte for byte." },
        "path": { "$ref": "#/$defs/nonEmptyString", "description": "Optional. A folder inside the repository, slashes allowed, for a codebase that is part of a monorepo. The report header prints it and nothing checks it." }
      }
    },
    ```
  - Line 291, `elementBoundary`: replace "A dependency block is required when the boundary is not in_scope (invariant element-dependency-required)." with "An element whose boundary is not in_scope is the `to` of at least one edge in dependencies[] (invariant element-dependency-required)."
  - Line 318, `parent`: replace "Stored for the reader; derivable from id." with "Derivable from id; the report's tree and the ancestor walk of the lints read it."
  - Lines 331-333: replace `"dependency": { "$ref": "#/$defs/dependency" },` with
    `"codebase": { "$ref": "#/$defs/plainId", "description": "Optional. The id of the entry of meta.codebases the element lives in (invariant element-codebase-resolves). An in_scope element without one inherits its in_scope parent's; an element outside the boundary neither inherits one nor passes one down." },`
  - In `cause.properties`, after `adversarial` (line 394), add:
    `"chain": { "$ref": "#/$defs/plainId", "description": "Optional. The id of another chain whose failure mode this cause is, the provider's chain; under a duplicate chain id, the first in document order. It names a chain (invariant cause-chain-resolves) other than the cause's own (invariant cause-chain-self), and the links over the document form no cycle (invariant cause-chain-cycle)." },`
    `"cited_o": { "$ref": "#/$defs/citedOccurrence", "description": "Optional, meaningful only beside chain: the linked chain's ratings.O as the consumer's O rationale cited it, written only when the consumer's O is rated, re-rated or re-scored and removed with the link; the lint linked-cause-occurrence-drift compares it with the linked chain's current ratings.O." }`
  - Directly after `$defs.cause` (after line 396), add:
    ```json
    "citedOccurrence": {
      "title": "Cited occurrence",
      "description": "The linked chain's ratings.O as the consumer's O rationale cited it: written only when the consumer's O is rated, re-rated or re-scored, never refreshed on its own, and removed with the link. The lint linked-cause-occurrence-drift flags a cause whose citation no longer matches the linked chain's current ratings.O, and a citation on a cause with no link.",
      "type": "object",
      "additionalProperties": false,
      "required": ["value", "evidence_kind"],
      "properties": {
        "value": { "type": "integer", "minimum": 1, "maximum": 10, "description": "The cited O value." },
        "evidence_kind": { "enum": ["observed_incident", "test_result", "estimate"], "description": "The cited rating's evidence_kind." },
        "evidence_ref": { "$ref": "#/$defs/nonEmptyString", "description": "Present exactly when the cited rating's evidence_ref was." }
      }
    },
    ```

- [ ] **Step 4: Rewrite types.ts to the v3 types.** Each new type is declared before its first user.
  - Directly before `Meta` (line 31), add `export interface Codebase { id: string; name: string; repo: string; path?: string }`.
  - Meta line 34 gains `codebases?: Codebase[];` after `tracker?: TrackerConfig;`.
  - Delete line 36 (`Dependency`).
  - After `Source` (line 37), add `export interface DependencyEdge { from: string; to: string; strength: Strength; sla?: string; limits?: string }`.
  - Element (line 38) ends `security_rationale?: string; codebase?: string; sources: Source[] }`.
  - Before `Cause` (line 40), add `export interface CitedOccurrence { value: number; evidence_kind: RatingEvidenceKind; evidence_ref?: string }`.
  - Cause becomes `{ text: string; origin?: CauseOrigin; adversarial?: boolean; chain?: string; cited_o?: CitedOccurrence }`.
  - Line 59 becomes `export interface FmeaDocument { meta: Meta; elements: Element[]; functions: Fn[]; dependencies: DependencyEdge[]; chains: Chain[]; computed?: Computed }`.
  - Keep `Strength`.

- [ ] **Step 5: Give minimalDoc its empty edge list.** In test-helpers.ts, between `functions: [ … ],` (line 191) and `chains: [` (line 192), add `dependencies: [],`. minimalDocOn needs no change. The "document builders" of §18 step 1 are `minimalDoc` and `minimalDocOn`, which this step and nothing else changes. `newElement`, `edge` and `graphDoc` land in A4 with their first importer, as the skeleton's test-builders entry says, so step 1's invariant and lint cases write their elements inline.

- [ ] **Step 6: Run the two files.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/schema.test.ts skills/fmea-software/scripts/codes.test.ts`. Expected: codes.test.ts all pass. schema.test.ts passes except three tests that read the golden fixture, which carries blocks until A3:
  - "the golden fixture validates against the shipped schema";
  - "every constrained schema node the golden fixture cannot reach is reached by the derivation document";
  - "drift: …", whose list names `/$defs/dependencyEdge` and `/$defs/dependencyEdge/properties/strength`.

  All three turn green in A3. tsc is red until A3 removes the last `.dependency` reads.

- [ ] **Step 7: No commit.** Step 1 is one commit, made at the end of A3.

### Task A2: The v2 legacy gate and DEPENDENCY_LEGACY

**Files:**
- Modify: skills/fmea-software/scripts/lib/legacy.ts:1-65
- Modify: skills/fmea-software/scripts/lib/codes.ts:15
- Modify: skills/fmea-software/scripts/lib/validation.ts:19-20
- Modify: skills/fmea-software/scripts/test-helpers.ts:114-151
- Test: skills/fmea-software/scripts/codes.test.ts:113-163
- Test: skills/fmea-software/scripts/validate.test.ts:8, 11, 94-114
- Test: skills/fmea-software/scripts/render.test.ts:15, 751-759
- Test: skills/fmea-software/scripts/track.test.ts:22, 206-210

**Interfaces:**
- Consumes: `FmeaDocument`, `DependencyEdge` (A1 types.ts additions); `minimalDoc()` with `dependencies: []` (A1)
- Produces:
  - codes.ts: `DEPENDENCY_LEGACY: EXIT_VALIDATION, // raised by legacyIssues in legacy.ts, after the v1 check and before the schema stage, for a v2 document`, directly after `KIND_LEGACY`. UPDATE_BASELINE and UPDATE_MISMATCH follow in A9.
  - Issue `{ code: "DEPENDENCY_LEGACY", rule: "format-legacy", message: \`document predates schema v3 (${reason}); a new analysis adds the top-level dependencies array, empty when nothing depends on anything, and an analysis written against 0.3.x to 0.5.x is migrated through the update mode as SKILL.md describes under "Migrate a v2 document"\`, pointer }`. Reasons: `no top-level dependencies array` at `/dependencies`, or `element ${String(e.id)} has a dependency block` at `ptr("elements", i, "dependency")`. The top-level trait is checked first. The check runs only when the v1 check returns `[]`.
  - test-helpers.ts: `export interface LegacyTrigger { name: string; mutate: (doc: FmeaDocument) => void; pointer: string; code: "KIND_LEGACY" | "DEPENDENCY_LEGACY" }`; `export const V2_TRIGGERS: LegacyTrigger[]`; `export function assertLegacyRefused(r: { status: number; stderr: string }, pointer: string, code: LegacyTrigger["code"] = "KIND_LEGACY", prefix: string = LEGACY_MESSAGE_PREFIXES[code]): void`. Module-private: `LEGACY_MESSAGE_PREFIXES` and `function moveEdgesIntoBlocks(doc: FmeaDocument): void`.
  - codes.test.ts title `"CODES holds exactly the twenty-three codes of the closed list"`.

- [ ] **Step 1: Pin the code in codes.test.ts.** At line 113, rename the test to `"CODES holds exactly the twenty-three codes of the closed list"` and insert `"DEPENDENCY_LEGACY",` between `"KIND_LEGACY",` and `"INVARIANT",`. After line 144, add `assert.equal(exitStatus("DEPENDENCY_LEGACY"), 2);`.

- [ ] **Step 2: Parameterise the legacy helpers in test-helpers.ts.**
  - Add `code` to `LegacyTrigger`, and `code: "KIND_LEGACY"` to each of the five `LEGACY_TRIGGERS`. The interface's doc comment becomes: "One way a v1 or v2 document reaches a script: a name, the change that turns the checkout fixture into it, and the pointer and code of the KIND_LEGACY or DEPENDENCY_LEGACY line that refuses it. validate.ts, render.ts and track.ts are each run over the whole list."
  - Add `const LEGACY_MESSAGE_PREFIXES: Record<LegacyTrigger["code"], string> = { KIND_LEGACY: "document predates schema v2 (", DEPENDENCY_LEGACY: "document predates schema v3 (" };`.
  - Add the private `moveEdgesIntoBlocks(doc)`. For each edge, the first element whose id is `edge.to` gets `dependency = { strength, sla?, limits? }`, the optional keys copied only when present. Then delete `doc.dependencies`.
  - Add, after `LEGACY_TRIGGERS`:
```ts
export const V2_TRIGGERS: LegacyTrigger[] = [
  { name: "a document with no top-level dependencies array is DEPENDENCY_LEGACY at /dependencies, before the schema runs",
    mutate: (doc) => { delete (doc as unknown as Record<string, unknown>).dependencies; }, pointer: "/dependencies", code: "DEPENDENCY_LEGACY" },
  { name: "an element with a dependency block is DEPENDENCY_LEGACY, pointing at the block",
    mutate: (doc) => { element(doc, 2).dependency = { strength: "strong" }; }, pointer: "/elements/2/dependency", code: "DEPENDENCY_LEGACY" },
  { name: "blocks on two elements are one DEPENDENCY_LEGACY line, at the earlier block",
    mutate: (doc) => { element(doc, 2).dependency = { strength: "strong" }; element(doc, 5).dependency = { strength: "weak" }; }, pointer: "/elements/2/dependency", code: "DEPENDENCY_LEGACY" },
  { name: "no top-level array and a block are one DEPENDENCY_LEGACY line, at /dependencies",
    mutate: (doc) => { delete (doc as unknown as Record<string, unknown>).dependencies; element(doc, 2).dependency = { strength: "strong" }; }, pointer: "/dependencies", code: "DEPENDENCY_LEGACY" },
  { name: "a v1 trait beside a missing dependencies array is KIND_LEGACY alone",
    mutate: (doc) => { delete element(doc, 0).boundary; delete (doc as unknown as Record<string, unknown>).dependencies; }, pointer: "/elements/0", code: "KIND_LEGACY" },
  { name: "a whole v2 document, every edge moved back into a block on its to element, is DEPENDENCY_LEGACY at /dependencies",
    mutate: moveEdgesIntoBlocks, pointer: "/dependencies", code: "DEPENDENCY_LEGACY" },
];
```
  - `assertLegacyRefused` takes the Interfaces signature. Its doc comment becomes: "A script's run refused the document with exit 2 and one `code` line at `pointer` whose message starts with `prefix`, and the schema stage never ran." Its message check becomes `assert.ok(r.stderr.startsWith(\`error ${code}: format-legacy: ${prefix}\`), r.stderr);` in place of the regex; the stderr is asserted to be one line, so startsWith checks that line. The other four assertions are unchanged.

- [ ] **Step 3: Run both lists in the three loops and add the gate cases.**
  - validate.test.ts: line 8 imports `minimalDoc` beside `minimalDocOn`, and line 11 imports `V2_TRIGGERS` beside `LEGACY_TRIGGERS`. The loop at line 94 becomes `for (const trigger of [...LEGACY_TRIGGERS, ...V2_TRIGGERS]) { test(trigger.name, () => { withTempDir((dir) => assertLegacyRefused(runCli("validate.ts", [writeLegacy(dir, trigger)]), trigger.pointer, trigger.code)); }); }`.
  - render.test.ts: line 15 imports `V2_TRIGGERS` beside `LEGACY_TRIGGERS`. The loop at line 751 iterates `[...LEGACY_TRIGGERS, ...V2_TRIGGERS]` and passes `trigger.code`.
  - track.test.ts: line 22 imports `V2_TRIGGERS` beside `LEGACY_TRIGGERS`. The loop at line 206 iterates `[...LEGACY_TRIGGERS, ...V2_TRIGGERS]` and passes `trigger.code`.
  - Rename the validate.test.ts test at line 100 to `"a v3 document gets no KIND_LEGACY or DEPENDENCY_LEGACY issue and a top level that is not an analysis falls through to SCHEMA"`. Rename its local `v2` to `v3`, and add `assert.ok(!v3.stderr.includes("DEPENDENCY_LEGACY"), v3.stderr);` and `assert.ok(!other.stderr.includes("DEPENDENCY_LEGACY"), other.stderr);`.
  - After it, add the following. The first case runs the CLI on the fixture and turns green with the fixture in A3. The four cases named "the v2 gate on minimalDoc" drive `validateDocument` directly on A1's `minimalDoc()`, which already has `dependencies: []`, so they go red and then green inside this task.
```ts
const V3_REMEDIES = 'a new analysis adds the top-level dependencies array, empty when nothing depends on anything, and an analysis written against 0.3.x to 0.5.x is migrated through the update mode as SKILL.md describes under "Migrate a v2 document"';

test("format-legacy: a document with no top-level dependencies array gets one DEPENDENCY_LEGACY line carrying both remedies", () => {
  withTempDir((dir) => {
    const r = runCli("validate.ts", [writeLegacy(dir, V2_TRIGGERS[0])]);
    assert.equal(r.status, 2);
    assert.equal(r.stderr, `error DEPENDENCY_LEGACY: format-legacy: document predates schema v3 (no top-level dependencies array); ${V3_REMEDIES} at /dependencies\n`);
  });
});

test("the v2 gate on minimalDoc: no top-level dependencies array is one DEPENDENCY_LEGACY issue at /dependencies", () => {
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  delete doc.dependencies;
  assert.deepEqual(validateDocument(doc, table).errors, [{
    code: "DEPENDENCY_LEGACY", rule: "format-legacy", pointer: "/dependencies",
    message: `document predates schema v3 (no top-level dependencies array); ${V3_REMEDIES}`,
  }]);
});

test("the v2 gate on minimalDoc: an element's dependency key, null included, is a block named by its element's id", () => {
  for (const block of [{ strength: "strong" }, null]) {
    const doc = minimalDoc();
    (doc.elements[0] as unknown as Record<string, unknown>).dependency = block;
    assert.deepEqual(validateDocument(doc, table).errors, [{
      code: "DEPENDENCY_LEGACY", rule: "format-legacy", pointer: "/elements/0/dependency",
      message: `document predates schema v3 (element svc has a dependency block); ${V3_REMEDIES}`,
    }], JSON.stringify(block));
  }
});

test("the v2 gate on minimalDoc: a v1 trait beside a missing dependencies array is KIND_LEGACY alone", () => {
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  delete doc.dependencies;
  delete (doc.elements as Record<string, unknown>[])[0].boundary;
  assert.deepEqual(validateDocument(doc, table).errors.map((e) => [e.code, e.pointer]), [["KIND_LEGACY", "/elements/0"]]);
});

test("the v2 gate on minimalDoc: a top-level dependencies of null passes the gate and gets SCHEMA lines", () => {
  const doc = minimalDoc() as unknown as Record<string, unknown>;
  doc.dependencies = null;
  const result = validateDocument(doc, table);
  assert.equal(result.ok, false);
  assert.ok(result.errors.every((e) => e.code === "SCHEMA"), JSON.stringify(result.errors));
  assert.ok(result.errors.some((e) => e.pointer === "/dependencies" && /expected type array/.test(e.message)), JSON.stringify(result.errors));
});
```

- [ ] **Step 4: Run codes.test.ts and the minimalDoc gate cases and watch them fail.** Run the two commands separately, since a name pattern applies to every file in the run:
  - `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/codes.test.ts`
  - `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test --test-name-pattern="the v2 gate on minimalDoc" skills/fmea-software/scripts/validate.test.ts`

  Expected failures:
  - the closed-list test (`DEPENDENCY_LEGACY` missing);
  - the exitStatus test, with `AssertionError: undefined !== 2`;
  - "the v2 gate on minimalDoc: no top-level dependencies array …", which gets a SCHEMA issue (`missing required property "dependencies"`) in place of DEPENDENCY_LEGACY;
  - "the v2 gate on minimalDoc: an element's dependency key …", which gets a SCHEMA issue (`unexpected property "dependency"`).

  The KIND_LEGACY-alone and null cases already pass. They pin that the v1 check runs first and that a present `dependencies` key passes the gate.

- [ ] **Step 5: Add the code.** In codes.ts, after line 15, add the `DEPENDENCY_LEGACY` line given in Interfaces. The KIND_LEGACY comment is unchanged.

- [ ] **Step 6: Add the v2 check to legacy.ts.** Header comment (lines 1-3): "The pre-schema gates for a v1 document (element-kinds spec s3) and a v2 document (multi-codebase spec s7): one KIND_LEGACY or DEPENDENCY_LEGACY issue naming the migration, in place of the schema lines such a document would otherwise produce. Run before checkSchema by validateDocument, so validate.ts, render.ts and track.ts refuse both the same way." Implementation:
  - Make `issue(code: "KIND_LEGACY" | "DEPENDENCY_LEGACY", message: string, pointer: string): Issue[]` the one builder, with the private `v1(reason, pointer)` and `v2(reason, pointer)` wrapping it with each message. The v1 text is unchanged and the v2 text is as given in Interfaces.
  - Move today's element and chain loops into a private `v1Issues(raw: Obj, elements: Obj[]): Issue[]`.
  - Add `function v2Issues(raw: Obj, elements: Obj[]): Issue[]`. It returns `v2("no top-level dependencies array", ptr("dependencies"))` when `!("dependencies" in raw)`. Otherwise it takes the first `i` with `"dependency" in elements[i]` and returns `v2(\`element ${String(elements[i].id)} has a dependency block\`, ptr("elements", i, "dependency"))`, or `[]` when there is none.
  - `legacyIssues` keeps line 53's precondition and returns `v1Issues(...)` when it is non-empty, else `v2Issues(...)`. Its doc comment: "At most one issue: the first v1 trait in document order, elements (with their sources) before chains, as KIND_LEGACY; failing that, the first v2 trait, a missing top-level dependencies key and then an element dependency key in document order, as DEPENDENCY_LEGACY. A top level not shaped like an analysis, an object whose `elements` is an array of objects, gives none and is left to the schema stage."

- [ ] **Step 7: Reword validateDocument's doc comment.** In validation.ts, line 19 opens "The v1 and v2 gates, then the schema, …"; the rest is unchanged.

- [ ] **Step 8: Run codes.test.ts and the minimalDoc gate cases.** The same two commands as Step 4. Expected: both pass. The rest of validate.test.ts, render.test.ts and track.test.ts stays red until A3 moves the fixture to v3. The checkout fixture still carries blocks and no `dependencies`, so the golden cases now get DEPENDENCY_LEGACY and the element-trigger cases point at `/dependencies`.

- [ ] **Step 9: No commit.** The v2 triggers mutate the v3 fixture that A3 writes, and A3 makes the step 1 commit.

### Task A3: Fixtures, builders and the reworded rule and lint on edges; element facts removed

**Files:**
- Create: skills/fmea-software/scripts/lib/graph.ts
- Modify: skills/fmea-software/scripts/lib/invariants.ts:1-5, 119-127, 231
- Modify: skills/fmea-software/scripts/lib/lints.ts:1-4, 212-219
- Modify: skills/fmea-software/scripts/render.ts:177-181, 194
- Modify: skills/fmea-software/assets/report-template.html:36-38, 134
- Modify: skills/fmea-software/evals/fixtures/checkout-service.fmea.json:105-109, 164-167, 232-233
- Modify: skills/fmea-software/evals/fixtures/update/before.fmea.json:70-74, 121-124, 179-180
- Modify: skills/fmea-software/evals/fixtures/update/stale-rows.fmea.json:68-72, 104, 144-145
- Modify: skills/fmea-software/evals/fixtures/legacy-rpn-sheet.expected.fmea.json:28, 44, 72-74, 142-143
- Test: skills/fmea-software/scripts/invariants.test.ts:102-115
- Test: skills/fmea-software/scripts/lints.test.ts:241-259
- Test: skills/fmea-software/scripts/render.test.ts:945-955, 1015-1025, 1027-1040
- Test: skills/fmea-software/scripts/validate.test.ts:20-36, 150-187

**Interfaces:**
- Consumes: `FmeaDocument`, `DependencyEdge` and the v3 schema (A1). A2's gate is run here, not written against.
- Produces:
  - `export function providerIds(doc: FmeaDocument): Set<string>` in lib/graph.ts, `new Set(doc.dependencies.map((e) => e.to))`
  - element-dependency-required: message `element ${id} has boundary ${boundary} and no edge depends on it` at `/elements/<i>/boundary`
  - dependency-row-without-dependency message tail `which is the provider of no edge`
  - fixture v3 facts for step 1: checkout `dependencies` = [checkout→checkout.payment-gateway strong sla "99.95% monthly" limits "50 rps per merchant"; checkout→pricing weak sla "99.9% monthly"], between `functions` and `chains`, element order unchanged, no codebase, no link, `computed` unchanged
  - render.test.ts `structureDoc()` edges: `[{ from: "svc", to: "svc.db", strength: "weak" }, { from: "svc.db", to: "svc.db.shard", strength: "strong", limits: "10 rps" }]`
  - owed to A13: the `sla ${safe}` and `limits ${safe}` assertions removed from the structure-escaping test come back in A13 Step 1 as the `sla` and `limits` of an edge in the same test, once the Dependencies table prints them
  - owed to A10: the pin in "the checkout fixture's edges are its two former blocks, each from checkout" is deleted by A10, whose fixture-facts test pins all three edges
  - validate.test.ts `ANALYSIS_FIXTURES` (the four analysis fixture names), which later fixture changes keep in step

- [ ] **Step 1: Rewrite the invariant case on edges.** Replace invariants.test.ts lines 102-115 with:
```ts
test("element-dependency-required fires at the boundary of an outside element no edge depends on, and any edge into it satisfies it", () => {
  for (const boundary of ["owned_outside", "third_party"] as const) {
    const doc = minimalDoc();
    doc.elements.push({ id: "svc.gateway", kind: "service", name: "Gateway", description: "", parent: "svc", boundary, security_relevant: false, sources: [{ kind: "document", ref: "arch.md" }] });
    const issues = checkInvariants(doc);
    expectOne(issues, "element-dependency-required", "INVARIANT", "/elements/1/boundary");
    assert.equal(only(issues, "element-dependency-required")[0].message, `element svc.gateway has boundary ${boundary} and no edge depends on it`);
    for (const from of ["svc", "ghost", "svc.gateway"]) {
      doc.dependencies = [{ from, to: "svc.gateway", strength: "weak" }];
      assert.deepEqual(only(checkInvariants(doc), "element-dependency-required"), [], `an edge from ${from}`);
    }
    doc.dependencies = [{ from: "svc.gateway", to: "svc", strength: "strong" }];
    expectOne(checkInvariants(doc), "element-dependency-required", "INVARIANT", "/elements/1/boundary");
  }
  const doc = minimalDoc();
  doc.elements.push({ id: "svc.gateway", kind: "service", name: "Gateway", description: "", parent: "svc", boundary: "in_scope", security_relevant: false, sources: [{ kind: "document", ref: "arch.md" }] });
  assert.deepEqual(only(checkInvariants(doc), "element-dependency-required"), []);
});
```

- [ ] **Step 2: Rewrite the dependency-row lint case on edges.** Replace lints.test.ts lines 241-259 with:
```ts
test("dependency-row-without-dependency fires on a cat-dependency- ref whose element is the provider of no edge and stays silent on an in_scope provider", () => {
  const doc = golden();
  assert.equal(doc.chains[0].catalog_refs[0].id, "cat-dependency-01");
  assert.deepEqual(fired(doc, "dependency-row-without-dependency"), []);
  elementById(doc, "pricing").boundary = "in_scope";
  assert.ok(doc.dependencies.some((e) => e.to === "pricing"));
  doc.chains[2].catalog_refs = [{ id: "cat-dependency-02", provenance: "skill-authored" }];
  assert.deepEqual(fired(doc, "dependency-row-without-dependency"), []);
  doc.dependencies = doc.dependencies.filter((e) => e.to !== "checkout.payment-gateway");
  elementById(doc, "checkout.payment-gateway").boundary = "in_scope";
  const finding: Lint = {
    rule: "dependency-row-without-dependency", severity: "warning", pointer: "/chains/0/catalog_refs/0/id",
    message: "chain ch-1 applies dependency row cat-dependency-01 to element checkout.payment-gateway, which is the provider of no edge",
  };
  assert.deepEqual(fired(doc, "dependency-row-without-dependency"), [finding]);
  doc.dependencies.push({ from: "checkout.payment-gateway", to: "pricing", strength: "weak" });
  assert.deepEqual(fired(doc, "dependency-row-without-dependency"), [finding], "an edge out of the element does not make it a provider");
});
```

- [ ] **Step 3: Move render.test.ts off the element facts.**
  - structureDoc (lines 945-955): drop both `dependency:` keys. After `doc.elements = [ … ];` add `doc.dependencies = [{ from: "svc", to: "svc.db", strength: "weak" }, { from: "svc.db", to: "svc.db.shard", strength: "strong", limits: "10 rps" }];`. The comment at 945 says "an edge with neither SLA nor limits" in place of "a dependency with neither SLA nor limits".
  - Replace the facts test (lines 1015-1025) with:
```ts
test("no element's block prints a facts list, and the template carries no .el-facts rule", () => {
  for (const doc of [golden(), structureDoc()]) {
    const structure = sectionOf(renderHtml(doc, table, template, vocabulary), "structure", "chains");
    assert.ok(!structure.includes("el-facts"), "an element prints a facts list");
    assert.ok(!structure.includes("<dt>Dependency</dt>"), "an element prints a dependency line");
  }
  assert.ok(!template.includes(".el-facts"), "the template keeps an .el-facts rule");
});
```
  - In the escaping test (lines 1027-1040), delete the `shard.dependency = …` line, and delete `` `sla ${safe}` `` and `` `limits ${safe}` `` from the expected list. A13 Step 1 puts them back as the `sla` and `limits` of an edge, once the Dependencies table prints them.

- [ ] **Step 4: Add the validate.test.ts fixture cases and the key-order pins.**
  - Line 159 becomes `["meta", "elements", "functions", "dependencies", "chains", "computed"]`.
  - In the authored-parts deepEqual (lines 160-163), add `dependencies: first.dependencies` and `dependencies: beforeDoc.dependencies` between functions and chains.
  - The reordered literal (line 177) gains `dependencies: doc.dependencies,` between `functions` and `chains`.
  - Line 182 becomes `["computed", "meta", "elements", "functions", "dependencies", "chains"]`.
  - After the golden test (line 36), add:
```ts
const ANALYSIS_FIXTURES = ["checkout-service.fmea.json", "update/before.fmea.json", "update/stale-rows.fmea.json", "legacy-rpn-sheet.expected.fmea.json"];

test("all four analysis fixtures carry a top-level dependencies array between functions and chains and no element dependency key", () => {
  for (const name of ANALYSIS_FIXTURES) {
    const doc = loadFixture<Record<string, unknown>>(name);
    const keys = Object.keys(doc);
    assert.ok(Array.isArray(doc.dependencies), name);
    assert.equal(keys.indexOf("dependencies"), keys.indexOf("functions") + 1, name);
    assert.equal(keys.indexOf("chains"), keys.indexOf("dependencies") + 1, name);
    assert.deepEqual((doc.elements as Record<string, unknown>[]).filter((e) => "dependency" in e).map((e) => e.id), [], name);
  }
});

test("update/before.fmea.json and legacy-rpn-sheet.expected.fmea.json validate with ok true", () => {
  for (const name of ["update/before.fmea.json", "legacy-rpn-sheet.expected.fmea.json"]) {
    const result = validateDocument(loadFixture(name), table);
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.errors)}`);
  }
});

test("the checkout fixture's edges are its two former blocks, each from checkout", () => {
  assert.deepEqual(golden().dependencies, [
    { from: "checkout", to: "checkout.payment-gateway", strength: "strong", sla: "99.95% monthly", limits: "50 rps per merchant" },
    { from: "checkout", to: "pricing", strength: "weak", sla: "99.9% monthly" },
  ]);
});

test("the legacy expected fixture holds the conversion's edge from checkout-api to payment-gateway, strong, with its open assumption owned by user", () => {
  const doc = loadFixture<FmeaDocument>("legacy-rpn-sheet.expected.fmea.json");
  assert.deepEqual(doc.dependencies, [{ from: "checkout-api", to: "payment-gateway", strength: "strong" }]);
  const named = doc.meta.assumptions.filter((a) => a.text.includes("checkout-api") && a.text.includes("payment-gateway"));
  assert.deepEqual(named.map((a) => [a.owner, a.status]), [["user", "open"]]);
  assert.match(named[0].text, /first in-scope item in sheet order/);
  assert.match(named[0].text, /strength strong/);
  assert.ok(!doc.meta.history[0].change.includes("dependency block"), doc.meta.history[0].change);
});

test("the update fixtures' checkout-to-gateway edge is strong before the update and weak in the stale rows", () => {
  const pricing = { from: "checkout", to: "pricing", strength: "weak", sla: "99.9% monthly" };
  const gateway = (strength: string) => ({ from: "checkout", to: "checkout.payment-gateway", strength, sla: "99.95% monthly", limits: "50 rps per merchant" });
  assert.deepEqual(loadFixture<FmeaDocument>("update", "before.fmea.json").dependencies, [gateway("strong"), pricing]);
  assert.deepEqual(loadFixture<FmeaDocument>("update", "stale-rows.fmea.json").dependencies, [gateway("weak"), pricing]);
});
```

- [ ] **Step 5: Run the touched files and watch them fail.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/invariants.test.ts skills/fmea-software/scripts/lints.test.ts skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/validate.test.ts`. Expected failures:
  - the element-dependency-required case (pointer `/elements/1/dependency`);
  - the dependency-row case (TypeError on `doc.dependencies.some`);
  - the facts test (`el-facts` still printed);
  - every golden-based validate case (DEPENDENCY_LEGACY).

- [ ] **Step 6: Create lib/graph.ts.** It opens with a header comment: "The document's structure, read once for every module that needs it: here, which elements are providers; the shared index and the parent walk join it later. Not an entry point." It contains `import type { FmeaDocument } from "./types.ts";` and the `providerIds` signature from Interfaces, with the doc comment "The ids that are the `to` of at least one edge, whatever the edge's `from`: the providers."

- [ ] **Step 7: Reword element-dependency-required in invariants.ts.** Import `providerIds` from `./graph.ts`. The helper becomes `function dependencyIssues(elements: Element[], providers: ReadonlySet<string>): Issue[]`. It fires when `elements[i].boundary !== "in_scope" && !providers.has(elements[i].id)`, with the Interfaces message at `ptr("elements", i, "boundary")`. Line 231 becomes `...dependencyIssues(elements, providerIds(doc)),` in the same position.

- [ ] **Step 8: Reword the dependency-row lint in lints.ts.** Import `providerIds` from `./graph.ts`. `check(doc)` becomes `const providers = providerIds(doc); return rowLints(doc, "dependency", (el) => providers.has(el.id), () => "which is the provider of no edge");`. The comment at 213-214 becomes "A dependency catalog row describes a failure at the edge to something the system relies on; applied to an element that is the provider of no edge, its strength, SLA and limits are unrecorded."

- [ ] **Step 9: Remove the element facts.** In render.ts, delete `elementFactsHtml` (lines 177-181) and the `${elementFactsHtml(el)}` at line 194. In report-template.html, delete the three `.el-facts` rules at lines 36-38 and the narrow-width `.el-facts` rule at line 134. No other rule changes.

- [ ] **Step 10: Move the four fixtures to v3.** Edges carry their keys in the order from, to, strength, sla, limits. Element order and every other byte stay as they are.
  - checkout-service.fmea.json: delete the `"dependency"` objects at 105-109 and 164-167. After the `functions` array's closing `],` (line 232), insert `"dependencies": [ { "from": "checkout", "to": "checkout.payment-gateway", "strength": "strong", "sla": "99.95% monthly", "limits": "50 rps per merchant" }, { "from": "checkout", "to": "pricing", "strength": "weak", "sla": "99.9% monthly" } ],`, formatted as the file is (2-space, one key per line). `computed` is not touched: no stored lint changes.
  - update/before.fmea.json: delete the blocks at 70-74 and 121-124, and insert the same two edges after `functions` (line 179).
  - update/stale-rows.fmea.json: delete the blocks at 68-72 and 104, and insert, in the file's compact style after `functions` (line 144): `"dependencies": [ { "from": "checkout", "to": "checkout.payment-gateway", "strength": "weak", "sla": "99.95% monthly", "limits": "50 rps per merchant" }, { "from": "checkout", "to": "pricing", "strength": "weak", "sla": "99.9% monthly" } ],`. The file keeps no priority and no computed block.
  - legacy-rpn-sheet.expected.fmea.json: delete the block at 72-74 and insert `"dependencies": [ { "from": "checkout-api", "to": "payment-gateway", "strength": "strong" } ],` after `functions` (line 142).
    - The line 28 assumption text becomes: "The sheet neither classifies the payment gateway dependency nor names its consumer; the conversion's declared default is an edge from checkout-api, the first in-scope item in sheet order, to payment-gateway at strength strong, because the sheet's own Effect column says a failed authorization leaves the cart unconfirmed, and both the consumer and the strength need the sheet author's confirmation."
    - In the line 44 history text, replace the clause from "dependency.strength set to strong on the 1 of 4 elements" through "the choice is recorded as an open assumption." with: "one dependency edge written, from checkout-api, the first in-scope item in sheet order, to payment-gateway, the 1 of 4 elements whose boundary is third_party, since an element outside the boundary must be the provider of an edge, at strength strong because the sheet records no classification, the fail-safe reading being that the system cannot serve without it; the consumer and the strength are recorded as an open assumption."

- [ ] **Step 11: Confirm that no other in-test document needs edges.** `grep -nE 'elements = \[|elements: \[|elements\.push' skills/fmea-software/scripts/*.test.ts`. Expected hits:
  - render.test.ts structureDoc (now with edges) and `doc.elements = []`, which has no outside element.
  - invariants.test.ts pushes of in_scope elements.
  - lints.test.ts repo-ref pushes of in_scope elements.
  - render.test.ts:859, a duplicate-id refusal case.

  Every other document comes from `minimalDoc()`, `minimalDocOn()` or a fixture, which all carry `dependencies`. An outside element in any other hit gets an edge from its nearest in_scope ancestor. A file edited here that is not already in Step 15's `git add` list is added to it.

- [ ] **Step 12: Run the touched files.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/invariants.test.ts skills/fmea-software/scripts/lints.test.ts skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/validate.test.ts skills/fmea-software/scripts/schema.test.ts skills/fmea-software/scripts/track.test.ts skills/fmea-software/scripts/codes.test.ts`. Expected: all pass. This includes:
  - the three schema tests A1 left red;
  - every `V2_TRIGGERS` case in the validate, render and track loops, and the fixture-based format-legacy line test;
  - "staleComputed finds nothing in a computed block validate.ts --write would write", which shows that the fixture's stored block is still fresh.

- [ ] **Step 13: Run both runners.** `bun tools/run-tests.ts` and `bun tools/check.ts`. Both must exit 0. A failure, or a runner that dies, blocks the commit.

- [ ] **Step 14: Run the browser gate and the comparison.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node tools/check-browser.ts && node tools/compare.ts`. Expected:
  - check-browser exits 0, prints `## not run here: firefox, webkit`, and prints no `## not asserted` line.
  - compare exits 0. build/compare/summary.md lists changed views of the `structure` part only: the gateway's and pricing's blocks lose their facts list.

  Read every changed view in build/compare/changed/. A changed view of any other part is a finding.

- [ ] **Step 15: Commit step 1 (A1, A2, A3).** First run `git status --short`. Every modified or new file it lists must be in the `git add` list below. A file Step 11 touched is added to the list. Any other file is a finding: stop and resolve it before committing. Add no trailer of any kind: no Co-Authored-By, no "Generated with" line, no session line.
```
git add skills/fmea-software/schemas/fmea.schema.json skills/fmea-software/scripts/lib/types.ts skills/fmea-software/scripts/lib/legacy.ts skills/fmea-software/scripts/lib/codes.ts skills/fmea-software/scripts/lib/validation.ts skills/fmea-software/scripts/lib/graph.ts skills/fmea-software/scripts/lib/invariants.ts skills/fmea-software/scripts/lib/lints.ts skills/fmea-software/scripts/render.ts skills/fmea-software/assets/report-template.html skills/fmea-software/scripts/test-helpers.ts skills/fmea-software/scripts/schema.test.ts skills/fmea-software/scripts/codes.test.ts skills/fmea-software/scripts/validate.test.ts skills/fmea-software/scripts/render.test.ts skills/fmea-software/scripts/track.test.ts skills/fmea-software/scripts/invariants.test.ts skills/fmea-software/scripts/lints.test.ts skills/fmea-software/evals/fixtures/checkout-service.fmea.json skills/fmea-software/evals/fixtures/update/before.fmea.json skills/fmea-software/evals/fixtures/update/stale-rows.fmea.json skills/fmea-software/evals/fixtures/legacy-rpn-sheet.expected.fmea.json
git commit -m "Schema v3: dependencies are edges in a top-level list, and a v2 document is refused with one DEPENDENCY_LEGACY line" -m "The analysis schema moves to v3. A dependency is now an edge from a
consumer element to a provider element in a required top-level
dependencies array, with its own strength, SLA and limits, and the
dependency block on the element is gone. The schema also accepts the
codebase records, an element's codebase, a cause's link to another
chain and the O it cited; the next commits give them their rules." -m "A v2 document is refused before the schema runs with one
DEPENDENCY_LEGACY line naming the migration, after the v1 check, so
validate.ts, render.ts and track.ts refuse it alike.
element-dependency-required and dependency-row-without-dependency read
the edges, the four analysis fixtures carry their blocks as edges, and
the report's element facts, whose only line was the dependency, are
removed until the Dependencies table prints them."
```
Expected: one commit on multi-codebase. `git status` shows a clean tree. Nothing is pushed.


### Task A4: The shared index and parent walk

**Files:**
- Modify: skills/fmea-software/scripts/lib/graph.ts (whole file; A3 created it holding `providerIds` only)
- Modify: skills/fmea-software/scripts/test-helpers.ts (the `import type { ... } from "./lib/types.ts"` line; end of file, after `minimalDoc`)
- Create: skills/fmea-software/scripts/graph.test.ts
- Test: skills/fmea-software/scripts/graph.test.ts

**Interfaces:**
- Consumes: `providerIds(doc: FmeaDocument): Set<string>` (A3); `Codebase`, `DependencyEdge`, `CitedOccurrence`, `Element.codebase?`, `Cause.chain?`, `Cause.cited_o?`, `Meta.codebases?`, `FmeaDocument.dependencies` (A1)
- Produces:
  - `export interface DocIndex { element: ReadonlyMap<string, number>; fn: ReadonlyMap<string, number>; chain: ReadonlyMap<string, number>; ancestors: readonly (readonly number[])[] }`
  - `export function indexDocument(doc: FmeaDocument): DocIndex`
  - `export function isDescendantOf(index: DocIndex, el: number, of: number): boolean`
  - `export function sameLineage(index: DocIndex, a: number, b: number): boolean`
  - `export function chainElement(doc: FmeaDocument, index: DocIndex, chain: number): number | undefined`
  - `export interface ResolvedLink { chain: number; cause: number; provider: number }`
  - `export function resolvedLinks(doc: FmeaDocument, index: DocIndex): ResolvedLink[]`
  - `export function edgeJoins(index: DocIndex, edge: DependencyEdge, consumer: number, provider: number): boolean`
  - `export function effectiveCodebases(doc: FmeaDocument, index: DocIndex): (Codebase | undefined)[]`
  - `export function rootOf(doc: FmeaDocument, index: DocIndex, el: number): number | undefined`
  - `export function sameTrimmed(a: string, b: string): boolean`
  - `export function triggerRestates(chain: Chain, text: string): boolean`
  - In test-helpers.ts: `export function newElement(id: string, overrides: Partial<Element> = {}): Element`, `export function edge(from: string, to: string, strength: Strength = "strong", extra: { sla?: string; limits?: string } = {}): DependencyEdge`, `export function graphDoc(spec: GraphSpec): FmeaDocument`. `function citeO(chain: Chain): CitedOccurrence` and `interface GraphSpec` stay module-private.

- [ ] **Step 1: Add the test builders to test-helpers.ts**

Add `Chain`, `CitedOccurrence`, `DependencyEdge`, `Element` and `Strength` to the existing `import type { ... } from "./lib/types.ts"` line, keeping every name already there (A2 may have added some), with no name listed twice. Append, after `minimalDoc`, exactly the builders of the Interfaces:
- `newElement(id, overrides)`: `{ id, kind: "service", name: id, description: "", parent: <id without its last dotted segment, or null>, boundary: "in_scope", security_relevant: false, sources: [{ kind: "document", ref: "arch.md" }], ...overrides }`.
- `edge(from, to, strength, extra)`: `{ from, to, strength, ...extra }`.
- `citeO(chain)` (not exported): `{ value, evidence_kind }` of `chain.ratings.O`, plus `evidence_ref` when it is not `undefined`.
- `interface GraphSpec { elements: (string | (Partial<Element> & { id: string }))[]; edges?: DependencyEdge[]; chains?: [chainId: string, elementId: string][]; links?: [consumer: string, provider: string][] }` (not exported).
- `graphDoc(spec)`: `minimalDoc()`'s meta; `elements` from `newElement(id)` or `newElement(o.id, o)`; one function `{ id: \`fn-${el.id}\`, element: el.id, statement: "serve requests", conditions: [], for_whom: "clients" }` per element; chains from `spec.chains ?? []`, each a `clone` of `minimalDoc().chains[0]` with the given id and `function: \`fn-${elementId}\``, so a spec without `chains` gives `doc.chains` equal to `[]`; `dependencies: spec.edges ?? []`; then per link of `spec.links ?? []`, consumer and provider found as the first chain of that id, `consumer.causes[0].chain = provider id` and `consumer.causes[0].cited_o = citeO(provider)`.

- [ ] **Step 2: Write graph.test.ts**

Imports: `test` from node:test, `assert` from node:assert/strict; `chainElement, edgeJoins, effectiveCodebases, indexDocument, isDescendantOf, resolvedLinks, rootOf, sameLineage, sameTrimmed, triggerRestates` and `import type { DocIndex, ResolvedLink }` from `./lib/graph.ts`; `edge, graphDoc, minimalDoc, newElement` from `./test-helpers.ts`; `import type { DependencyEdge } from "./lib/types.ts"`.

```ts
test("graphDoc builds one function per element and one chain per entry, and a link writes the provider's O as cited_o", () => {
  const doc = graphDoc({ elements: ["svc", { id: "db", boundary: "third_party" }], edges: [edge("svc", "db", "weak", { sla: "99.9% monthly" })],
    chains: [["ch-1", "svc"], ["ch-2", "db"]], links: [["ch-1", "ch-2"]] });
  assert.deepEqual(doc.functions.map((f) => [f.id, f.element]), [["fn-svc", "svc"], ["fn-db", "db"]]);
  assert.deepEqual(doc.chains.map((c) => [c.id, c.function]), [["ch-1", "fn-svc"], ["ch-2", "fn-db"]]);
  assert.deepEqual(doc.dependencies, [{ from: "svc", to: "db", strength: "weak", sla: "99.9% monthly" }]);
  assert.deepEqual(doc.chains[0].causes[0], { text: "process crash", chain: "ch-2", cited_o: { value: 3, evidence_kind: "estimate" } });
  assert.equal(doc.elements[1].boundary, "third_party");
  assert.equal(newElement("svc.api.handler").parent, "svc.api");
  assert.equal(newElement("svc").parent, null);
});

test("indexDocument maps each element, function and chain id to its first occurrence in document order", () => {
  const doc = graphDoc({ elements: ["svc", "db", "svc"], chains: [["ch-1", "svc"], ["ch-2", "db"], ["ch-1", "db"]] });
  const index: DocIndex = indexDocument(doc);
  assert.deepEqual([...index.element], [["svc", 0], ["db", 1]]);
  assert.deepEqual([...index.fn], [["fn-svc", 0], ["fn-db", 1]]);
  assert.deepEqual([...index.chain], [["ch-1", 0], ["ch-2", 1]]);
});

test("the parent walk lists ancestors nearest first and ends at a null parent and at a parent that does not resolve", () => {
  const doc = graphDoc({ elements: ["svc", "svc.api", "svc.api.handler", "ghost.child"] });
  assert.deepEqual(indexDocument(doc).ancestors, [[], [0], [1, 0], []]);
});

test("two elements that name each other as parent end the walk, each the other's ancestor", () => {
  const doc = graphDoc({ elements: [{ id: "a", parent: "b" }, { id: "b", parent: "a" }, { id: "c", parent: "a" }] });
  const index = indexDocument(doc);
  assert.deepEqual(index.ancestors, [[1], [0], [0, 1]]);
  assert.equal(isDescendantOf(index, 0, 1), true);
  assert.equal(isDescendantOf(index, 1, 0), true);
});

test("sameLineage holds for an element, its ancestors and its descendants, and not for a sibling or another root", () => {
  const index = indexDocument(graphDoc({ elements: ["svc", "svc.api", "svc.db", "pricing"] }));
  assert.deepEqual([sameLineage(index, 1, 1), sameLineage(index, 1, 0), sameLineage(index, 0, 1), sameLineage(index, 1, 2), sameLineage(index, 0, 3)],
    [true, true, true, false, false]);
});

test("chainElement reaches the element through the first function of the chain's id, and gives undefined when either does not resolve", () => {
  const doc = graphDoc({ elements: ["svc", "db"], chains: [["ch-1", "db"], ["ch-2", "svc"], ["ch-3", "svc"], ["ch-4", "svc"]] });
  doc.functions.push({ ...doc.functions[0], element: "db" });
  doc.functions.push({ id: "fn-ghost", element: "ghost", statement: "s", conditions: [], for_whom: "x" });
  doc.chains[2].function = "fn-missing";
  doc.chains[3].function = "fn-ghost";
  const index = indexDocument(doc);
  assert.deepEqual([0, 1, 2, 3].map((c) => chainElement(doc, index, c)), [1, 0, undefined, undefined]);
});

test("resolvedLinks keeps links that resolve to the first chain of the id, in chain and cause order, and drops unresolved links and self-links", () => {
  const doc = graphDoc({ elements: ["svc"], chains: [["ch-1", "svc"], ["ch-2", "svc"], ["ch-2", "svc"]] });
  doc.chains[0].causes = [{ text: "a", chain: "ch-2" }, { text: "b", chain: "ch-missing" }, { text: "c" }];
  doc.chains[1].causes[0].chain = "ch-2";
  doc.chains[2].causes[0].chain = "ch-2";
  const expected: ResolvedLink[] = [{ chain: 0, cause: 0, provider: 1 }, { chain: 2, cause: 0, provider: 1 }];
  assert.deepEqual(resolvedLinks(doc, indexDocument(doc)), expected);
});

test("edgeJoins takes an edge from the consumer, an ancestor or a descendant of it to the provider or an ancestor of it", () => {
  const index = indexDocument(graphDoc({ elements: ["svc", "svc.api", "svc.api.handler", "db", "db.shard", "pricing"] }));
  const joins = (e: DependencyEdge, c: number, p: number): boolean => edgeJoins(index, e, c, p);
  assert.equal(joins(edge("svc.api", "db.shard"), 1, 4), true);
  assert.equal(joins(edge("svc", "db"), 1, 4), true);
  assert.equal(joins(edge("svc.api.handler", "db"), 1, 4), true);
  assert.equal(joins(edge("svc.api", "db.shard"), 1, 3), false);
  assert.equal(joins(edge("pricing", "db.shard"), 1, 4), false);
  assert.equal(joins(edge("ghost", "db"), 1, 4), false);
  assert.equal(joins(edge("svc", "ghost"), 1, 4), false);
});

test("effectiveCodebases follows every inheritance rule: own, in-scope parent, override, outside element, unresolved id and parent, absent list", () => {
  const doc = graphDoc({ elements: [
    { id: "a", codebase: "cb-a" }, "a.x", "a.x.y", { id: "a.lib", codebase: "cb-b" }, "a.lib.z",
    { id: "a.gw", boundary: "third_party" }, "a.gw.adapter",
    { id: "a.vendor", boundary: "owned_outside", codebase: "cb-b" }, "a.vendor.shim",
    { id: "a.m", codebase: "cb-missing" }, "a.m.n", "ghost.k",
  ] });
  doc.meta.codebases = [{ id: "cb-a", name: "A", repo: "acme/a" }, { id: "cb-b", name: "B", repo: "acme/b" }, { id: "cb-a", name: "A again", repo: "acme/other" }];
  const repos = (): (string | null)[] => effectiveCodebases(doc, indexDocument(doc)).map((c) => (c === undefined ? null : c.repo));
  assert.deepEqual(repos(), ["acme/a", "acme/a", "acme/a", "acme/b", "acme/b", null, null, "acme/b", null, null, null, null]);
  delete doc.meta.codebases;
  assert.deepEqual(repos(), new Array(12).fill(null));
});

test("rootOf gives the depth-1 element a walk ends at, and undefined through an unresolved parent or a parent cycle", () => {
  const doc = graphDoc({ elements: ["svc", "svc.api", "svc.api.h", "ghost.k", "ghost.k.m", { id: "a", parent: "b" }, { id: "b", parent: "a" }] });
  const index = indexDocument(doc);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((e) => rootOf(doc, index, e)), [0, 0, 0, undefined, undefined, undefined, undefined]);
});

test("sameTrimmed compares trimmed text, and triggerRestates needs a non-empty trimmed trigger equal to the text", () => {
  assert.equal(sameTrimmed("  the cause \n", "the cause"), true);
  assert.equal(sameTrimmed("the cause", "a cause"), false);
  const chain = minimalDoc().chains[0];
  assert.equal(triggerRestates(chain, "process crash"), false);
  chain.trigger = "  process crash ";
  assert.equal(triggerRestates(chain, "process crash"), true);
  assert.equal(triggerRestates(chain, "a power cut"), false);
  chain.trigger = "   ";
  assert.equal(triggerRestates(chain, "  "), false);
});
```

- [ ] **Step 3: Run graph.test.ts and see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/graph.test.ts`
Expected: the file fails at load with `SyntaxError: The requested module './lib/graph.ts' does not provide an export named ...`; `# fail 1`.

- [ ] **Step 4: Implement the index and the walk in lib/graph.ts**

Add the produced exports with the signatures above (`import type { Chain, Codebase, DependencyEdge, FmeaDocument } from "./types.ts"`). Approach:
- `indexDocument`: a private `firstIndex(ids: string[]): Map<string, number>` builds the three maps, a later duplicate never overwriting; `ancestors[i]` by an iterative loop that follows `parent` through `element`, with a visited `Set` of ids seeded with element i's own id, stopping at `null`, an unresolved id or a visited id.
- `isDescendantOf` is `index.ancestors[el].includes(of)`; `sameLineage` is `a === b || isDescendantOf(index, a, b) || isDescendantOf(index, b, a)`.
- `chainElement`: `index.fn` then `index.element`, `undefined` when either misses.
- `resolvedLinks`: every `causes[cause].chain` whose first chain exists and is not `chain`, in (chain, cause) order.
- `edgeJoins`: both ends resolve through `index.element`, `sameLineage(index, from, consumer)`, and `to === provider || isDescendantOf(index, provider, to)`.
- `effectiveCodebases`: a first-occurrence map of `meta.codebases ?? []`; own `codebase` set → its lookup, no walk; an outside element → `undefined`; otherwise walk `index.ancestors[i]` nearest first and at each ancestor check in this order: an outside ancestor → return `undefined`, whatever it sets; an ancestor that sets `codebase` → return its lookup (`undefined` when it names no entry); otherwise go on to the next; the walk's end → `undefined`. Put the walk in a private helper so each function stays within maxCognitive 15.
- `rootOf`: the last of `[el, ...index.ancestors[el]]` when its `parent` is `null`, else `undefined`.
- `sameTrimmed` is `a.trim() === b.trim()`; `triggerRestates` is `(chain.trigger?.trim() ?? "") !== "" && sameTrimmed(chain.trigger ?? "", text)`.

- [ ] **Step 5: Run graph.test.ts and see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/graph.test.ts`
Expected: `# pass 11`, `# fail 0`.

- [ ] **Step 6: Run both runners**

Run: `bun tools/run-tests.ts && bun tools/check.ts`
Expected: both exit 0; every suite ends `# fail 0`; check.ts prints its `## types`, `## lint` and `## analysis` lines with no finding (no fallow duplicate, complexity or unused-export finding in graph.ts, graph.test.ts or test-helpers.ts).

- [ ] **Step 7: Run the browser gate**

graph.ts is in the renderer's import graph since A3 (render.ts → lib/validation.ts → lib/invariants.ts and lib/lints.ts → lib/graph.ts), so the browser checks apply.

Run: `bun tools/check-browser.ts`
Expected: exit 0, `## gate: playwright test over chromium (node v24…)` then `## not run here: firefox, webkit`, and no `## not asserted` line.

- [ ] **Step 8: Run the comparison**

Run: `bun tools/compare.ts --base HEAD && bun tools/compare.ts`
Expected: the first exits 0 with `## compare: no view of <n> changed against <HEAD sha>: the two reports are byte for byte the same, so none was photographed`; the second exits 0 and `build/compare/summary.md` lists only the views the step 1 commit changed. Any other changed view is a finding.

- [ ] **Step 9: Commit**

```
git add skills/fmea-software/scripts/lib/graph.ts skills/fmea-software/scripts/graph.test.ts skills/fmea-software/scripts/test-helpers.ts
git commit -m "Graph: one element index and one parent walk for the lints, the report and the update check" -m "lib/graph.ts gains the first-occurrence index of elements, functions
and chains, the iterative parent walk with its lineage, the element of
a chain, the resolved cause links, the edge-join predicate, effective
codebases, roots and the trimmed-text helpers. test-helpers.ts gains
newElement, edge and graphDoc for multi-element test documents."
```
No trailer of any kind.

### Task A5: The nine new invariants

**Files:**
- Modify: skills/fmea-software/scripts/lib/invariants.ts:1-31 (imports, INVARIANT_RULES), :119-137 (new helpers after `securityRationaleIssues`), :212-237 (`checkInvariants`)
- Modify: skills/fmea-software/scripts/invariants.test.ts:1-7 (imports), :28-38 (pin), new tests appended after line 128
- Test: skills/fmea-software/scripts/invariants.test.ts

**Interfaces:**
- Consumes: `DocIndex`, `indexDocument(doc)`, `ResolvedLink`, `resolvedLinks(doc, index)` (A4); `graphDoc`, `edge` (A4); `Codebase` (A1); A3's `element-dependency-required` case, which already pins that rule's message and `/elements/<i>/boundary` pointer
- Produces: `INVARIANT_RULES` (v3, 32 ids); the messages and pointers of `codebase-id-unique`, `element-codebase-resolves`, `dependency-from-resolves`, `dependency-to-resolves`, `dependency-self`, `dependency-pair-unique`, `cause-chain-resolves`, `cause-chain-self`, `cause-chain-cycle`

- [ ] **Step 1: Re-pin INVARIANT_RULES and add the new cases to invariants.test.ts**

Imports gain `edge, graphDoc` from `./test-helpers.ts` and `import type { Codebase } from "./lib/types.ts"`. Add these helpers after `expectOne`:

```ts
function found(issues: Issue[], rule: string): [string, string][] {
  return only(issues, rule).map((i) => [i.pointer, i.message]);
}
const CB_A: Codebase = { id: "cb-a", name: "Checkout", repo: "acme/checkout" };
const CB_B: Codebase = { id: "cb-b", name: "Session auth", repo: "acme/session-auth" };
function cycles(doc: FmeaDocument): [string, string][] { return found(checkInvariants(doc), "cause-chain-cycle"); }
function onSvc(ids: string[]): [string, string][] { return ids.map((id) => [id, "svc"]); }
```

The pin becomes the 32 ids: the existing 23 with these nine inserted between `"element-security-rationale-required",` and `"rating-review-by-date",`: `"codebase-id-unique", "element-codebase-resolves", "dependency-from-resolves", "dependency-to-resolves", "dependency-self", "dependency-pair-unique", "cause-chain-resolves", "cause-chain-self", "cause-chain-cycle",`; and `assert.equal(INVARIANT_RULES.length, 32)`.

New tests:

```ts
test("codebase-id-unique flags each later entry that repeats an id, at its id", () => {
  const doc = minimalDoc();
  doc.meta.codebases = [CB_A, CB_B, { ...CB_A, name: "Again" }];
  assert.deepEqual(found(checkInvariants(doc), "codebase-id-unique"), [["/meta/codebases/2/id", "codebase id cb-a is used more than once"]]);
});

test("element-codebase-resolves flags every codebase while meta.codebases is absent, then only an id no entry has", () => {
  const doc = graphDoc({ elements: [{ id: "a", codebase: "cb-a" }, { id: "b", codebase: "cb-x" }] });
  assert.deepEqual(found(checkInvariants(doc), "element-codebase-resolves"), [
    ["/elements/0/codebase", "codebase cb-a names no entry of meta.codebases"],
    ["/elements/1/codebase", "codebase cb-x names no entry of meta.codebases"],
  ]);
  doc.meta.codebases = [CB_A];
  assert.deepEqual(found(checkInvariants(doc), "element-codebase-resolves"), [["/elements/1/codebase", "codebase cb-x names no entry of meta.codebases"]]);
});

test("dependency-from-resolves, dependency-to-resolves and dependency-self report edge by edge, in that order within an edge", () => {
  const doc = graphDoc({ elements: ["svc"] });
  doc.dependencies = [edge("ghost", "svc"), edge("svc", "phantom"), edge("svc", "svc"), edge("void", "void")];
  assert.deepEqual(checkInvariants(doc).filter((i) => i.rule.startsWith("dependency-")).map((i) => [i.rule, i.pointer, i.message]), [
    ["dependency-from-resolves", "/dependencies/0/from", "element ghost does not exist"],
    ["dependency-to-resolves", "/dependencies/1/to", "element phantom does not exist"],
    ["dependency-self", "/dependencies/2/to", "edge from svc to svc has the same element at both ends"],
    ["dependency-from-resolves", "/dependencies/3/from", "element void does not exist"],
    ["dependency-to-resolves", "/dependencies/3/to", "element void does not exist"],
    ["dependency-self", "/dependencies/3/to", "edge from void to void has the same element at both ends"],
  ]);
});

test("element-dependency-required is satisfied by any edge whose to names the element, a self-edge or an unresolved from included", () => {
  const doc = graphDoc({ elements: ["svc", { id: "svc.gateway", boundary: "third_party" }] });
  doc.dependencies = [edge("svc.gateway", "svc.gateway")];
  const issues = checkInvariants(doc);
  assert.deepEqual(only(issues, "element-dependency-required"), []);
  assert.deepEqual(found(issues, "dependency-self"), [["/dependencies/0/to", "edge from svc.gateway to svc.gateway has the same element at both ends"]]);
  doc.dependencies = [edge("ghost", "svc.gateway")];
  assert.deepEqual(only(checkInvariants(doc), "element-dependency-required"), []);
});

test("dependency-pair-unique is silent on one provider with two consumers at different strengths, and the document violates nothing", () => {
  const doc = graphDoc({ elements: ["checkout", "billing", { id: "gateway", boundary: "third_party" }],
    edges: [edge("checkout", "gateway", "strong"), edge("billing", "gateway", "weak")] });
  assert.deepEqual(checkInvariants(doc), []);
});

test("dependency-pair-unique flags each later edge with the same from and to, at the edge, and never an edge that shares one end or reverses it", () => {
  const doc = graphDoc({ elements: ["svc", "db", "cache"] });
  doc.dependencies = [edge("svc", "db"), edge("svc", "db", "weak")];
  assert.deepEqual(found(checkInvariants(doc), "dependency-pair-unique"), [["/dependencies/1", "edge from svc to db is listed more than once"]]);
  doc.dependencies.push(edge("svc", "db"));
  assert.deepEqual(found(checkInvariants(doc), "dependency-pair-unique").map(([p]) => p), ["/dependencies/1", "/dependencies/2"]);
  doc.dependencies = [edge("svc", "db"), edge("svc", "cache"), edge("cache", "db"), edge("db", "svc")];
  assert.deepEqual(only(checkInvariants(doc), "dependency-pair-unique"), []);
});

test("cause-chain-resolves and cause-chain-self report cause by cause, a link resolving to the first chain of its id", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-2"]) });
  doc.chains[0].causes = [{ text: "a", chain: "ch-missing" }, { text: "b", chain: "ch-1" }];
  doc.chains[1].causes[0].chain = "ch-2";
  doc.chains[2].causes[0].chain = "ch-2";
  assert.deepEqual(checkInvariants(doc).filter((i) => i.rule === "cause-chain-resolves" || i.rule === "cause-chain-self").map((i) => [i.rule, i.pointer, i.message]), [
    ["cause-chain-resolves", "/chains/0/causes/0/chain", "chain ch-missing does not exist"],
    ["cause-chain-self", "/chains/0/causes/1/chain", "cause 1 links to its own chain ch-1"],
    ["cause-chain-self", "/chains/1/causes/0/chain", "cause 0 links to its own chain ch-2"],
  ]);
});

test("cause-chain-cycle reports a two-chain and a three-chain cycle once, at the smallest link inside it", () => {
  assert.deepEqual(cycles(graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2"]), links: [["ch-1", "ch-2"], ["ch-2", "ch-1"]] })),
    [["/chains/0/causes/0/chain", "cause 0 of chain ch-1 is on a cycle of links through chains ch-1, ch-2"]]);
  assert.deepEqual(cycles(graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-3"]), links: [["ch-1", "ch-2"], ["ch-2", "ch-3"], ["ch-3", "ch-1"]] })),
    [["/chains/0/causes/0/chain", "cause 0 of chain ch-1 is on a cycle of links through chains ch-1, ch-2, ch-3"]]);
});

test("cause-chain-cycle reports two disjoint cycles once each, in pointer order", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-3", "ch-4"]), links: [["ch-1", "ch-3"], ["ch-3", "ch-1"], ["ch-2", "ch-4"], ["ch-4", "ch-2"]] });
  assert.deepEqual(cycles(doc), [
    ["/chains/0/causes/0/chain", "cause 0 of chain ch-1 is on a cycle of links through chains ch-1, ch-3"],
    ["/chains/1/causes/0/chain", "cause 0 of chain ch-2 is on a cycle of links through chains ch-2, ch-4"],
  ]);
});

test("cause-chain-cycle reports two cycles that share a link once, at the smallest (chain index, cause index)", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-3"]), links: [["ch-1", "ch-2"], ["ch-2", "ch-1"], ["ch-3", "ch-1"]] });
  doc.chains[1].causes.push({ text: "a second cause", chain: "ch-3" });
  assert.deepEqual(cycles(doc), [["/chains/0/causes/0/chain", "cause 0 of chain ch-1 is on a cycle of links through chains ch-1, ch-2, ch-3"]]);
});

test("cause-chain-cycle never reports at a link that leaves the component, though it is the chain's cause 0", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-3"]), links: [["ch-2", "ch-1"]] });
  doc.chains[0].causes = [{ text: "a", chain: "ch-3" }, { text: "b", chain: "ch-2" }];
  assert.deepEqual(cycles(doc), [["/chains/0/causes/1/chain", "cause 1 of chain ch-1 is on a cycle of links through chains ch-1, ch-2"]]);
});

test("cause-chain-cycle does not report a chain that leads into a cycle but is not on it", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-3"]), links: [["ch-1", "ch-2"], ["ch-2", "ch-3"], ["ch-3", "ch-2"]] });
  assert.deepEqual(cycles(doc), [["/chains/1/causes/0/chain", "cause 0 of chain ch-2 is on a cycle of links through chains ch-2, ch-3"]]);
});

test("cause-chain-cycle survives a dangling link and a duplicate chain id, resolving to the first chain", () => {
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(["ch-1", "ch-2", "ch-2"]), links: [["ch-1", "ch-2"], ["ch-2", "ch-1"]] });
  doc.chains[2].causes = [{ text: "a", chain: "ch-missing" }, { text: "b", chain: "ch-2" }];
  assert.doesNotThrow(() => checkInvariants(doc));
  assert.deepEqual(cycles(doc), [["/chains/0/causes/0/chain", "cause 0 of chain ch-1 is on a cycle of links through chains ch-1, ch-2"]]);
});

test("cause-chain-cycle walks a path of 20000 links without recursion, and reports it once when its end links back", () => {
  const ids = Array.from({ length: 20000 }, (_, i) => `ch-${i + 1}`);
  const doc = graphDoc({ elements: ["svc"], chains: onSvc(ids) });
  for (let i = 0; i + 1 < ids.length; i++) doc.chains[i].causes[0].chain = ids[i + 1];
  assert.deepEqual(cycles(doc), []);
  doc.chains[ids.length - 1].causes[0].chain = ids[0];
  assert.deepEqual(cycles(doc).map(([p]) => p), ["/chains/0/causes/0/chain"]);
});
```

- [ ] **Step 2: Run invariants.test.ts and see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/invariants.test.ts`
Expected: the INVARIANT_RULES pin and every new case fail on `AssertionError`, except "dependency-pair-unique is silent on one provider with two consumers at different strengths, and the document violates nothing", which already passes as a guard (the gateway is the `to` of an edge and no new invariant exists yet); that case and the cases that predate this task pass.

- [ ] **Step 3: Implement the nine invariants in lib/invariants.ts**

Insert the nine ids into `INVARIANT_RULES` after `"element-security-rationale-required"`, in the pin's order. Import `indexDocument`, `resolvedLinks` and `import type { DocIndex, ResolvedLink }` from `./graph.ts`, and `DependencyEdge` as a type. New private helpers, after `securityRationaleIssues`, each one loop:
- `codebaseIssues(elements: Element[], codebaseIds: Set<string>): Issue[]`: `element-codebase-resolves`, `codebase ${id} names no entry of meta.codebases` at `ptr("elements", i, "codebase")`.
- `edgeIssues(edges: DependencyEdge[], elements: ReadonlyMap<string, number>): Issue[]`: per edge, in this order, `dependency-from-resolves` `element ${from} does not exist` at `ptr("dependencies", i, "from")`; `dependency-to-resolves` `element ${to} does not exist` at `ptr("dependencies", i, "to")`; `dependency-self` `edge from ${from} to ${to} has the same element at both ends` at `ptr("dependencies", i, "to")`.
- `pairIssues(edges: DependencyEdge[]): Issue[]`: `dependency-pair-unique`, keyed on `JSON.stringify([from, to])`, `edge from ${from} to ${to} is listed more than once` at `ptr("dependencies", i)` on each later edge.
- `causeLinkIssues(chains: Chain[], chainIndex: ReadonlyMap<string, number>): Issue[]`: per cause with `chain`, `cause-chain-resolves` `chain ${id} does not exist`, else, when the first chain of the id is `i`, `cause-chain-self` `cause ${j} links to its own chain ${id}`, both at `ptr("chains", i, "causes", j, "chain")`.
- `cycleIssues(doc: FmeaDocument, index: DocIndex): Issue[]` over strongly connected components, built from small private helpers so each stays within maxCognitive 15 (iterative Kosaraju; the first link of each component in `resolvedLinks` order is its smallest, so issues come out in ascending pointer order):

```ts
type Adjacency = number[][];

function adjacency(size: number, links: ResolvedLink[], reversed: boolean): Adjacency {
  const out: Adjacency = Array.from({ length: size }, () => []);
  for (const l of links) {
    if (reversed) out[l.provider].push(l.chain);
    else out[l.chain].push(l.provider);
  }
  return out;
}

// Each node once, in the order its depth-first visit finishes, with an explicit stack.
function finishOrder(graph: Adjacency): number[] {
  const seen = new Array<boolean>(graph.length).fill(false);
  const order: number[] = [];
  for (let root = 0; root < graph.length; root++) {
    if (seen[root]) continue;
    seen[root] = true;
    const stack: [number, number][] = [[root, 0]];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const next = graph[top[0]][top[1]++];
      if (next === undefined) { order.push(top[0]); stack.pop(); }
      else if (!seen[next]) { seen[next] = true; stack.push([next, 0]); }
    }
  }
  return order;
}

// The component of each chain: the reversed graph walked in reverse finishing order.
function components(size: number, links: ResolvedLink[]): number[] {
  const reversed = adjacency(size, links, true);
  const comp = new Array<number>(size).fill(-1);
  const order = finishOrder(adjacency(size, links, false));
  let count = 0;
  for (let k = order.length - 1; k >= 0; k--) {
    if (comp[order[k]] !== -1) continue;
    const stack = [order[k]];
    comp[order[k]] = count;
    for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
      for (const next of reversed[node]) if (comp[next] === -1) { comp[next] = count; stack.push(next); }
    }
    count++;
  }
  return comp;
}

function cycleIssues(doc: FmeaDocument, index: DocIndex): Issue[] {
  const links = resolvedLinks(doc, index);
  const comp = components(doc.chains.length, links);
  const reported = new Set<number>();
  const out: Issue[] = [];
  for (const l of links) {
    const c = comp[l.chain];
    if (c !== comp[l.provider] || reported.has(c)) continue;
    reported.add(c);
    const through = doc.chains.filter((_, k) => comp[k] === c).map((ch) => ch.id).join(", ");
    out.push(invariant("cause-chain-cycle", `cause ${l.cause} of chain ${doc.chains[l.chain].id} is on a cycle of links through chains ${through}`, ptr("chains", l.chain, "causes", l.cause, "chain")));
  }
  return out;
}
```

In `checkInvariants`, build `const index = indexDocument(doc);` once and `const codebaseIds = (doc.meta.codebases ?? []).map((c) => c.id);`. Between `...securityRationaleIssues(elements),` and `...ratingReviewIssues(chains),` insert, in this order: `...duplicates(codebaseIds, "codebase-id-unique", (i) => ptr("meta", "codebases", i, "id"), "codebase")`, `...codebaseIssues(elements, new Set(codebaseIds))`, `...edgeIssues(doc.dependencies, index.element)`, `...pairIssues(doc.dependencies)`, `...causeLinkIssues(chains, index.chain)`, `...cycleIssues(doc, index)`. Reword the comment above it to: `// Every invariant issue of \`doc\`. The helpers run in the order of INVARIANT_RULES; a helper that` / `// checks several rules reports them record by record.`

- [ ] **Step 4: Run invariants.test.ts and see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/invariants.test.ts`
Expected: `# fail 0`.

- [ ] **Step 5: Run both runners**

Run: `bun tools/run-tests.ts && bun tools/check.ts`
Expected: both exit 0; `validate.test.ts` still finds exactly one error (`stale-without-reason`) on the checkout fixture, since no new invariant fires on it; fallow reports no complexity finding on the new helpers and no duplicate.

- [ ] **Step 6: Run the browser gate**

Run: `bun tools/check-browser.ts`
Expected: exit 0, `## gate: playwright test over chromium (node v24…)`, `## not run here: firefox, webkit`, no `## not asserted` line.

- [ ] **Step 7: Run the comparison**

Run: `bun tools/compare.ts --base HEAD && bun tools/compare.ts`
Expected: the first exits 0 with `…: the two reports are byte for byte the same, so none was photographed`; the second exits 0 and `build/compare/summary.md` lists only the views the step 1 commit changed.

- [ ] **Step 8: Commit**

```
git add skills/fmea-software/scripts/lib/invariants.ts skills/fmea-software/scripts/invariants.test.ts
git commit -m "Invariants: codebases, dependency edges and cause links resolve, and links form no cycle" -m "Nine invariants join INVARIANT_RULES after
element-security-rationale-required: codebase ids are unique and every
element codebase names one, every edge's ends resolve and differ and its
pair occurs once, every cause link resolves and is no self-link, and the
links form no cycle, reported once per strongly connected component at
its smallest link by an iterative pass."
```
No trailer of any kind.

### Task A6: Lints on structure: repo-ref-codebase and cause-chain-unlinked

**Files:**
- Modify: skills/fmea-software/scripts/lib/lints.ts:1-72 (imports, `elementOfChain` removed, `rowLints`, `QUALIFIED_REPO_REF`, `RepoRef`, `repoRefs`), :230-241 (two entries after `repo-ref-form`)
- Modify: skills/fmea-software/scripts/lints.test.ts:1-7 (imports), :33-46 (pin), new tests after line 307
- Test: skills/fmea-software/scripts/lints.test.ts

**Interfaces:**
- Consumes: `DocIndex`, `indexDocument`, `isDescendantOf`, `chainElement`, `ResolvedLink`, `resolvedLinks`, `edgeJoins`, `effectiveCodebases` (A4); `graphDoc`, `edge` (A4); `providerIds` closure of the dependency-row lint as A3 left it
- Produces: `const QUALIFIED_REPO_REF = /^([^\s/@:]+\/[^\s/@:]+)@([^\s:]+):.+$/` with private `interface RepoRef { ref: string; element: string; index: number; pointer: string; head: string | undefined; commit: string | undefined }`; `MACHINE_RULES` gaining `repo-ref-codebase` and `cause-chain-unlinked` (12 entries); their messages

- [ ] **Step 1: Re-pin MACHINE_RULES and add the new cases to lints.test.ts**

Imports gain `edge, graphDoc` from `./test-helpers.ts` and `Codebase, Source` in the type import. The pin appends `["repo-ref-codebase", "warning"], ["cause-chain-unlinked", "warning"]` after `["repo-ref-form", "warning"]`. Add:

```ts
const SHA = "a".repeat(40);
const CODEBASES: Codebase[] = [{ id: "cb-a", name: "A", repo: "acme/a" }, { id: "cb-b", name: "B", repo: "acme/b" }];
function repoSource(repo: string, path = "src/index.ts"): Source { return { kind: "repo", ref: `${repo}@${SHA}:${path}` }; }

test("repo-ref-codebase flags a head no codebase lists, then a head that differs from the element's effective codebase, one finding per ref in element and source order", () => {
  const doc = graphDoc({ elements: [
    { id: "a", codebase: "cb-a", sources: [repoSource("acme/a"), repoSource("acme/b", "src/b.ts")] },
    { id: "a.x", sources: [repoSource("acme/zzz", "src/x.ts")] },
  ] });
  doc.meta.codebases = structuredClone(CODEBASES);
  assert.deepEqual(fired(doc, "repo-ref-codebase"), [
    { rule: "repo-ref-codebase", severity: "warning", pointer: "/elements/0/sources/1/ref",
      message: `repo ref acme/b@${SHA}:src/b.ts on element a names repository acme/b, but the element's codebase cb-a is acme/a` },
    { rule: "repo-ref-codebase", severity: "warning", pointer: "/elements/1/sources/0/ref",
      message: `repo ref acme/zzz@${SHA}:src/x.ts on element a.x names repository acme/zzz, which no entry of meta.codebases lists` },
  ]);
  delete doc.meta.codebases;
  assert.deepEqual(fired(doc, "repo-ref-codebase"), []);
});

test("repo-ref-codebase compares the head byte for byte and leaves an unqualified ref alone", () => {
  const doc = graphDoc({ elements: [{ id: "a", codebase: "cb-a", sources: [repoSource("Acme/A"), { kind: "repo", ref: "src/a.ts" }] }] });
  doc.meta.codebases = structuredClone(CODEBASES);
  assert.deepEqual(fired(doc, "repo-ref-codebase").map((l) => [l.pointer, l.message]), [
    ["/elements/0/sources/0/ref", `repo ref Acme/A@${SHA}:src/index.ts on element a names repository Acme/A, which no entry of meta.codebases lists`],
  ]);
});

test("repo-ref-codebase gives only the first check to an element with no effective codebase: a head that names an entry passes, one that names none is flagged", () => {
  const doc = graphDoc({ elements: [
    { id: "gw", boundary: "third_party", codebase: "cb-b" },
    { id: "gw.adapter", sources: [repoSource("acme/b"), repoSource("acme/zzz", "src/adapter.ts")] },
    { id: "a", codebase: "cb-missing", sources: [repoSource("acme/b")] },
    { id: "a.x", sources: [repoSource("acme/b"), repoSource("acme/zzz", "src/x.ts")] },
  ] });
  doc.meta.codebases = structuredClone(CODEBASES);
  assert.deepEqual(fired(doc, "repo-ref-codebase").map((l) => [l.pointer, l.message]), [
    ["/elements/1/sources/1/ref", `repo ref acme/zzz@${SHA}:src/adapter.ts on element gw.adapter names repository acme/zzz, which no entry of meta.codebases lists`],
    ["/elements/3/sources/1/ref", `repo ref acme/zzz@${SHA}:src/x.ts on element a.x names repository acme/zzz, which no entry of meta.codebases lists`],
  ]);
});

// ch-1 on svc.api (fn-svc.api, functions[1]) links its one cause to ch-2 on svc (fn-svc, functions[0]), its parent, with no edge.
function childToParent(): FmeaDocument {
  return graphDoc({ elements: ["svc", "svc.api"], chains: [["ch-1", "svc.api"], ["ch-2", "svc"]], links: [["ch-1", "ch-2"]] });
}
const CHILD_TO_PARENT = "cause 0 links to chain ch-2 on element svc, which is neither element svc.api nor below it, and no edge joins them";

test("cause-chain-unlinked accepts a same-element link, a link to a grandchild with no edge, and a link across an ancestor-to-ancestor edge", () => {
  assert.deepEqual(fired(graphDoc({ elements: ["svc"], chains: [["ch-1", "svc"], ["ch-2", "svc"]], links: [["ch-1", "ch-2"]] }), "cause-chain-unlinked"), []);
  assert.deepEqual(fired(graphDoc({ elements: ["svc", "svc.api", "svc.api.h"], chains: [["ch-1", "svc"], ["ch-2", "svc.api.h"]], links: [["ch-1", "ch-2"]] }), "cause-chain-unlinked"), []);
  assert.deepEqual(fired(graphDoc({ elements: ["a", "a.x", "b", "b.y"], edges: [edge("a", "b")], chains: [["ch-1", "a.x"], ["ch-2", "b.y"]], links: [["ch-1", "ch-2"]] }), "cause-chain-unlinked"), []);
});

test("cause-chain-unlinked flags a child-to-parent link no edge covers, keeps flagging it across an edge from the parent down, and accepts it once the child depends on the parent", () => {
  const doc = childToParent();
  assert.deepEqual(fired(doc, "cause-chain-unlinked"), [{ rule: "cause-chain-unlinked", severity: "warning", pointer: "/chains/0/causes/0/chain", message: CHILD_TO_PARENT }]);
  doc.dependencies = [edge("svc", "svc.api")];
  assert.deepEqual(fired(doc, "cause-chain-unlinked").map((l) => l.message), [CHILD_TO_PARENT]);
  doc.dependencies = [edge("svc.api", "svc")];
  assert.deepEqual(fired(doc, "cause-chain-unlinked"), []);
});

test("cause-chain-unlinked decides by the walk and not the id text: a nested id whose parent is missing or null is not below C", () => {
  for (const parent of ["ghost", null]) {
    const doc = graphDoc({ elements: ["svc", { id: "svc.api", parent }], chains: [["ch-1", "svc"], ["ch-2", "svc.api"]], links: [["ch-1", "ch-2"]] });
    assert.deepEqual(fired(doc, "cause-chain-unlinked").map((l) => [l.pointer, l.message]),
      [["/chains/0/causes/0/chain", "cause 0 links to chain ch-2 on element svc.api, which is neither element svc nor below it, and no edge joins them"]]);
  }
});

test("cause-chain-unlinked returns on two elements that name each other as parent, and accepts a link between them", () => {
  const doc = graphDoc({ elements: [{ id: "a", parent: "b" }, { id: "b", parent: "a" }], chains: [["ch-1", "a"], ["ch-2", "b"]], links: [["ch-1", "ch-2"]] });
  assert.deepEqual(fired(doc, "cause-chain-unlinked"), []);
});

test("cause-chain-unlinked skips a link that does not resolve, and a function or an element of either end that does not resolve", () => {
  const breaks: [string, (d: FmeaDocument) => void][] = [
    ["the link", (d) => { d.chains[0].causes[0].chain = "ch-missing"; }],
    ["the consumer's function", (d) => { d.chains[0].function = "fn-missing"; }],
    ["the consumer's element", (d) => { d.functions[1].element = "ghost"; }],
    ["the provider's function", (d) => { d.chains[1].function = "fn-missing"; }],
    ["the provider's element", (d) => { d.functions[0].element = "ghost"; }],
  ];
  for (const [what, breakDoc] of breaks) {
    const doc = childToParent();
    breakDoc(doc);
    assert.deepEqual(fired(doc, "cause-chain-unlinked"), [], what);
  }
});
```

- [ ] **Step 2: Run lints.test.ts and see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/lints.test.ts`
Expected: the pin fails, and every new case fails with `MACHINE_RULES has no rule repo-ref-codebase` or `MACHINE_RULES has no rule cause-chain-unlinked`; the older cases pass.

- [ ] **Step 3: Move rowLints onto chainElement and give repo refs their head**

In lints.ts, import `chainElement, edgeJoins, effectiveCodebases, indexDocument, isDescendantOf, resolvedLinks` and `import type { DocIndex, ResolvedLink }` from `./graph.ts`; add `Codebase` to the type import. Delete `elementOfChain`. In `rowLints`, build `const index = indexDocument(doc)` once and read `const at = chainElement(doc, index, i)`, skipping the chain when `at === undefined`, with `el = doc.elements[at]`. Replace the comment and regex at lines 44-45 with `// A repo ref in the qualified owner/repo@commit:path form; group 1 is the owner/repo head, group 2 the commit.` and the `QUALIFIED_REPO_REF` of the Interfaces; `RepoRef` becomes the Interfaces shape; `repoRefs` runs `exec` once and sets `index: i`, `head: m?.[1]`, `commit: m?.[2]`. `repo-ref-form` is otherwise unchanged.

- [ ] **Step 4: Append the two lints to MACHINE_RULES**

After the `repo-ref-form` entry, each with a short comment as the other entries carry:
- `repo-ref-codebase`, severity `"warning"`: `check(doc)` returns `[]` while `doc.meta.codebases` is undefined; otherwise `effectiveCodebases(doc, indexDocument(doc))` once and `repoRefs(doc).flatMap((r) => repoCodebaseLint(r, codebases, effective[r.index]))`. Private `repoCodebaseLint(r: RepoRef, codebases: Codebase[], own: Codebase | undefined): Lint[]`: `[]` when `head` is undefined; when no entry's `repo === head`, `repo ref ${ref} on element ${element} names repository ${head}, which no entry of meta.codebases lists`; else when `own !== undefined && own.repo !== head`, `repo ref ${ref} on element ${element} names repository ${head}, but the element's codebase ${own.id} is ${own.repo}`; both at `r.pointer`.
- `cause-chain-unlinked`, severity `"warning"`: `check(doc)` builds the index once and returns `resolvedLinks(doc, index).flatMap((l) => unlinkedLint(doc, index, l))`. Private `unlinkedLint(doc: FmeaDocument, index: DocIndex, link: ResolvedLink): Lint[]`: C and P from `chainElement` on `link.chain` and `link.provider`; `[]` when either is undefined, when `P === C`, when `isDescendantOf(index, P, C)`, or when `doc.dependencies.some((e) => edgeJoins(index, e, C, P))`; else at `ptr("chains", link.chain, "causes", link.cause, "chain")`, `cause ${link.cause} links to chain ${doc.chains[link.provider].id} on element ${doc.elements[P].id}, which is neither element ${doc.elements[C].id} nor below it, and no edge joins them`.

- [ ] **Step 5: Run lints.test.ts and see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/lints.test.ts`
Expected: `# fail 0`; `runLints(documentedDoc())` is still `[]` and the golden fixture still gives eleven lints with one blocker.

- [ ] **Step 6: Run both runners**

Run: `bun tools/run-tests.ts && bun tools/check.ts`
Expected: both exit 0; the minimalDoc pin of quality.test.ts still holds; fallow reports no unused `elementOfChain`, no duplicate and no complexity finding.

- [ ] **Step 7: Run the browser gate**

Run: `bun tools/check-browser.ts`
Expected: exit 0, `## gate: playwright test over chromium (node v24…)`, `## not run here: firefox, webkit`, no `## not asserted` line.

- [ ] **Step 8: Run the comparison**

Run: `bun tools/compare.ts --base HEAD && bun tools/compare.ts`
Expected: the first exits 0 with `…: the two reports are byte for byte the same, so none was photographed`; the second exits 0 and `build/compare/summary.md` lists only the views the step 1 commit changed.

- [ ] **Step 9: Commit**

```
git add skills/fmea-software/scripts/lib/lints.ts skills/fmea-software/scripts/lints.test.ts
git commit -m "Lints: a repo ref outside its element's codebase, and a cause link that crosses no edge" -m "repo-ref-codebase flags a qualified repo ref whose owner/repo head no
codebase lists, or that differs from its element's effective codebase.
cause-chain-unlinked flags a cause link that neither runs down the
containment walk nor crosses a recorded edge. The row lints now reach a
chain's element through the shared index in lib/graph.ts."
```
No trailer of any kind.

### Task A7: Lints on ratings: cause-chain-severity and linked-cause-occurrence-drift

**Files:**
- Modify: skills/fmea-software/scripts/lib/lints.ts:1 (type import), after the repo-ref helpers (new constant and helpers), end of MACHINE_RULES (two entries after `cause-chain-unlinked`)
- Modify: skills/fmea-software/scripts/test-helpers.ts (the `citeO` line A4 added: export it)
- Modify: skills/fmea-software/scripts/lints.test.ts:1-7 (imports), :33-46 (pin), new tests at the end of the A6 tests
- Test: skills/fmea-software/scripts/lints.test.ts

**Interfaces:**
- Consumes: `DocIndex`, `indexDocument`, `chainElement`, `ResolvedLink`, `resolvedLinks`, `triggerRestates` (A4); `graphDoc`, `edge` (A4); `MACHINE_RULES` with 12 entries and the `./graph.ts` import (A6)
- Produces: `export const CASCADING_ROWS: readonly string[] = ["cat-service-01", "cat-service-02", "cat-service-03", "cat-service-05", "cat-dependency-03", "cat-dependency-04"];`; `export function citeO(chain: Chain): CitedOccurrence` in test-helpers.ts; `MACHINE_RULES` (v3, 14 entries); the messages of `cause-chain-severity` and `linked-cause-occurrence-drift`

- [ ] **Step 1: Export citeO**

In test-helpers.ts change `function citeO(chain: Chain): CitedOccurrence` to `export function citeO(chain: Chain): CitedOccurrence`; nothing else changes.

- [ ] **Step 2: Re-pin MACHINE_RULES and add the new cases to lints.test.ts**

Imports gain `CASCADING_ROWS` from `./lib/lints.ts`, `citeO` from `./test-helpers.ts`, and `Chain` in the type import. The pin appends `["cause-chain-severity", "warning"], ["linked-cause-occurrence-drift", "warning"]` after `["cause-chain-unlinked", "warning"]`. Add:

```ts
const DRIFT = "linked-cause-occurrence-drift";

// ch-1 on svc (fn-svc, functions[0]) links its one cause to ch-2 on db (fn-db, functions[1]) across an edge;
// graphDoc writes ch-2's O as the cause's cited_o.
function linkedPair(): FmeaDocument {
  return graphDoc({ elements: ["svc", "db"], edges: [edge("svc", "db")], chains: [["ch-1", "svc"], ["ch-2", "db"]], links: [["ch-1", "ch-2"]] });
}
function severityPair(consumerS: number, providerS: number): FmeaDocument {
  const doc = linkedPair();
  doc.chains[0].ratings.S = rating(consumerS);
  doc.chains[1].ratings.S = rating(providerS);
  return doc;
}
const BELOW = "chain ch-2 rates S 7, below S 9 of chain ch-1, whose only cause is its failure mode";
// Each breaks one end of linkedPair's link without touching the link itself.
const UNRESOLVED_ENDS: [string, (doc: FmeaDocument) => void][] = [
  ["the consumer's function", (d) => { d.chains[0].function = "fn-missing"; }],
  ["the consumer's element", (d) => { d.functions[0].element = "ghost"; }],
  ["the provider's function", (d) => { d.chains[1].function = "fn-missing"; }],
  ["the provider's element", (d) => { d.functions[1].element = "ghost"; }],
];

test("CASCADING_ROWS is exactly the six positive-feedback catalog rows", () => {
  assert.deepEqual([...CASCADING_ROWS], ["cat-service-01", "cat-service-02", "cat-service-03", "cat-service-05", "cat-dependency-03", "cat-dependency-04"]);
});

test("cause-chain-severity flags a provider rated below its single-cause consumer, at the provider's S", () => {
  assert.deepEqual(fired(severityPair(9, 7), "cause-chain-severity"), [{ rule: "cause-chain-severity", severity: "warning", pointer: "/chains/1/ratings/S", message: BELOW }]);
});

test("cause-chain-severity reads ratings and never post_ratings", () => {
  const equal = severityPair(8, 8);
  equal.chains[1].post_ratings = { S: rating(2), O: rating(3), D: rating(4) };
  equal.chains[0].post_ratings = { S: rating(10), O: rating(3), D: rating(4) };
  assert.deepEqual(fired(equal, "cause-chain-severity"), []);
  const below = severityPair(9, 7);
  below.chains[1].post_ratings = { S: rating(9), O: rating(3), D: rating(4) };
  assert.deepEqual(fired(below, "cause-chain-severity").map((l) => l.message), [BELOW]);
});

test("cause-chain-severity is silent on a two-cause consumer, on an equal S, on a trigger that restates the linked cause, and on an unresolved link", () => {
  const twoCauses = severityPair(9, 7);
  twoCauses.chains[0].causes.push({ text: "a deploy fails" });
  assert.deepEqual(fired(twoCauses, "cause-chain-severity"), []);
  assert.deepEqual(fired(severityPair(8, 8), "cause-chain-severity"), []);
  const restated = severityPair(9, 7);
  restated.chains[0].trigger = ` ${restated.chains[0].causes[0].text} `;
  assert.deepEqual(fired(restated, "cause-chain-severity"), []);
  const unresolved = severityPair(9, 7);
  unresolved.chains[0].causes[0].chain = "ch-missing";
  assert.deepEqual(fired(unresolved, "cause-chain-severity"), []);
});

for (const id of ["cat-service-01", "cat-service-02", "cat-service-03", "cat-service-05", "cat-dependency-03", "cat-dependency-04"]) {
  test(`cause-chain-severity is silent on a single-cause linked consumer citing ${id}`, () => {
    const doc = severityPair(9, 7);
    doc.chains[0].catalog_refs = [{ id, provenance: "skill-authored" }];
    assert.deepEqual(fired(doc, "cause-chain-severity"), []);
  });
}

test("cause-chain-severity fires on a consumer citing cat-service-04 or cat-dependency-01, so no prefix or range matches", () => {
  for (const id of ["cat-service-04", "cat-dependency-01"]) {
    const doc = severityPair(9, 7);
    doc.chains[0].catalog_refs = [{ id, provenance: "skill-authored" }];
    assert.deepEqual(fired(doc, "cause-chain-severity").map((l) => l.message), [BELOW]);
  }
});

test("cause-chain-severity gives one finding per pair, by provider chain index then consumer chain index", () => {
  const doc = graphDoc({ elements: ["svc"], chains: [["ch-1", "svc"], ["ch-2", "svc"], ["ch-3", "svc"], ["ch-4", "svc"], ["ch-5", "svc"]],
    links: [["ch-1", "ch-5"], ["ch-2", "ch-4"], ["ch-3", "ch-4"]] });
  for (const i of [0, 1, 2]) doc.chains[i].ratings.S = rating(9);
  for (const i of [3, 4]) doc.chains[i].ratings.S = rating(5);
  assert.deepEqual(fired(doc, "cause-chain-severity").map((l) => [l.pointer, l.message]), [
    ["/chains/3/ratings/S", "chain ch-4 rates S 5, below S 9 of chain ch-2, whose only cause is its failure mode"],
    ["/chains/3/ratings/S", "chain ch-4 rates S 5, below S 9 of chain ch-3, whose only cause is its failure mode"],
    ["/chains/4/ratings/S", "chain ch-5 rates S 5, below S 9 of chain ch-1, whose only cause is its failure mode"],
  ]);
});

test("linked-cause-occurrence-drift is silent on a citation that matches, with and without evidence_ref", () => {
  const doc = linkedPair();
  assert.deepEqual(fired(doc, DRIFT), []);
  doc.chains[1].ratings.O = { ...rating(6, "rescored", "observed_incident"), evidence_ref: "INC-2026-0314" };
  doc.chains[0].causes[0].cited_o = citeO(doc.chains[1]);
  assert.deepEqual(fired(doc, DRIFT), []);
});

test("linked-cause-occurrence-drift is silent with no link, on an unresolved link and a self-link that carry no cited_o, and on a provider or a consumer without ratings", () => {
  assert.deepEqual(fired(minimalDoc(), DRIFT), []);
  for (const chain of ["ch-missing", "ch-1"]) {
    const doc = linkedPair();
    doc.chains[0].causes[0] = { text: "process crash", chain };
    assert.deepEqual(fired(doc, DRIFT), []);
  }
  for (const i of [0, 1]) {
    const doc = linkedPair();
    doc.chains[1].ratings.O = rating(5);
    delete (doc.chains[i] as Partial<Chain>).ratings;
    assert.deepEqual(fired(doc, DRIFT), []);
  }
});

test("cause-chain-severity and linked-cause-occurrence-drift are silent when a function or an element of either end does not resolve", () => {
  for (const [what, breakEnd] of UNRESOLVED_ENDS) {
    const severe = severityPair(9, 7);
    breakEnd(severe);
    assert.deepEqual(fired(severe, "cause-chain-severity"), [], what);
    const drifting = linkedPair();
    drifting.chains[1].ratings.O = rating(5);
    breakEnd(drifting);
    assert.deepEqual(fired(drifting, DRIFT), [], what);
  }
});

test("linked-cause-occurrence-drift fires at the consumer's O on a different value, evidence_kind, or evidence_ref present on one side only", () => {
  const cases: [(doc: FmeaDocument) => void, string][] = [
    [(d) => { d.chains[1].ratings.O = rating(5); }, "cause 0 cites ch-2 at O 3 (estimate); ch-2 now rates O 5 (estimate)"],
    [(d) => { d.chains[1].ratings.O = rating(3, "rescored", "test_result"); }, "cause 0 cites ch-2 at O 3 (estimate); ch-2 now rates O 3 (test_result)"],
    [(d) => { d.chains[1].ratings.O.evidence_ref = "load-test-7"; }, "cause 0 cites ch-2 at O 3 (estimate); ch-2 now rates O 3 (estimate, load-test-7)"],
    [(d) => { d.chains[0].causes[0].cited_o!.evidence_ref = "load-test-7"; }, "cause 0 cites ch-2 at O 3 (estimate, load-test-7); ch-2 now rates O 3 (estimate)"],
  ];
  for (const [change, message] of cases) {
    const doc = linkedPair();
    change(doc);
    assert.deepEqual(fired(doc, DRIFT), [{ rule: DRIFT, severity: "warning", pointer: "/chains/0/ratings/O", message }]);
  }
});

test("linked-cause-occurrence-drift reports a provider rating whose evidence_ref is empty as drift, since no valid citation records it", () => {
  const doc = linkedPair();
  doc.chains[1].ratings.O.evidence_ref = "";
  assert.deepEqual(fired(doc, DRIFT).map((l) => l.message), ["cause 0 cites ch-2 at O 3 (estimate); ch-2 now rates O 3 (estimate, )"]);
});

test("linked-cause-occurrence-drift reports the absent citation once graphDoc's cited_o is deleted", () => {
  const doc = linkedPair();
  delete doc.chains[0].causes[0].cited_o;
  assert.deepEqual(fired(doc, DRIFT), [{ rule: DRIFT, severity: "warning", pointer: "/chains/0/ratings/O",
    message: "cause 0 links to ch-2 but records no cited O; re-score O and record the provider's O" }]);
});

test("linked-cause-occurrence-drift flags a stray cited_o at the cause's cited_o: no chain, an unresolved link, a self-link", () => {
  const stray = [{ rule: DRIFT, severity: "warning", pointer: "/chains/0/causes/0/cited_o", message: "cited O recorded on a cause with no linked chain" }];
  const bare = minimalDoc();
  bare.chains[0].causes[0].cited_o = { value: 3, evidence_kind: "estimate" };
  assert.deepEqual(fired(bare, DRIFT), stray);
  for (const chain of ["ch-missing", "ch-1"]) {
    const doc = linkedPair();
    doc.chains[0].causes[0].chain = chain;
    assert.deepEqual(fired(doc, DRIFT), stray);
  }
});

test("linked-cause-occurrence-drift ignores post_ratings", () => {
  const doc = linkedPair();
  doc.chains[1].post_ratings = { S: rating(8), O: rating(1), D: rating(4) };
  assert.deepEqual(fired(doc, DRIFT), []);
});

test("linked-cause-occurrence-drift reports two drifting causes in chain then cause order", () => {
  const doc = graphDoc({ elements: ["svc"], chains: [["ch-1", "svc"], ["ch-2", "svc"], ["ch-3", "svc"]], links: [["ch-1", "ch-2"], ["ch-2", "ch-3"]] });
  doc.chains[0].causes.push({ text: "a second failure", chain: "ch-3", cited_o: citeO(doc.chains[2]) });
  doc.chains[1].ratings.O = rating(4);
  doc.chains[2].ratings.O = rating(5);
  assert.deepEqual(fired(doc, DRIFT).map((l) => [l.pointer, l.message]), [
    ["/chains/0/ratings/O", "cause 0 cites ch-2 at O 3 (estimate); ch-2 now rates O 4 (estimate)"],
    ["/chains/0/ratings/O", "cause 1 cites ch-3 at O 3 (estimate); ch-3 now rates O 5 (estimate)"],
    ["/chains/1/ratings/O", "cause 0 cites ch-3 at O 3 (estimate); ch-3 now rates O 5 (estimate)"],
  ]);
});
```

- [ ] **Step 3: Run lints.test.ts and see it fail**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/lints.test.ts`
Expected: the file fails at load with `SyntaxError: The requested module './lib/lints.ts' does not provide an export named 'CASCADING_ROWS'`; `# fail 1`.

- [ ] **Step 4: Add CASCADING_ROWS and cause-chain-severity**

In lints.ts add `triggerRestates` to the `./graph.ts` import (`chainElement` is already there from A6) and `Cause, CitedOccurrence, Rating, RatingEvidenceKind` to the type import. Add `CASCADING_ROWS` exactly as in the Interfaces, with a comment naming it the catalog's positive-feedback rows, compared whole with `includes`. Private helpers:
- `endsResolve(doc: FmeaDocument, index: DocIndex, link: ResolvedLink): boolean` is `chainElement(doc, index, link.chain) !== undefined && chainElement(doc, index, link.provider) !== undefined`, with a comment that the new lints skip a link whose function or element does not resolve, as §6 requires.
- `isCascading(chain: Chain, cause: Cause): boolean` is `triggerRestates(chain, cause.text) || chain.catalog_refs.some((r) => CASCADING_ROWS.includes(r.id))`.
- `severityLint(doc: FmeaDocument, index: DocIndex, link: ResolvedLink): Lint[]`: consumer `doc.chains[link.chain]`, provider `doc.chains[link.provider]`; a finding only when `endsResolve(doc, index, link)`, `consumer.causes.length === 1`, `!isCascading(consumer, consumer.causes[link.cause])` and `provider.ratings.S.value < consumer.ratings.S.value`, at `ptr("chains", link.provider, "ratings", "S")`, `chain ${provider.id} rates S ${ps}, below S ${cs} of chain ${consumer.id}, whose only cause is its failure mode`.

The entry `cause-chain-severity`, severity `"warning"`, goes after `cause-chain-unlinked`: build `const index = indexDocument(doc)` once, then `resolvedLinks(doc, index).toSorted((a, b) => a.provider - b.provider || a.chain - b.chain).flatMap((l) => severityLint(doc, index, l))`.

- [ ] **Step 5: Add linked-cause-occurrence-drift**

Private helpers:
- `ratingO(chain: Chain): Rating | undefined` returning `(chain as Partial<Chain>).ratings?.O`, so a chain without `ratings` is skipped without a type cast elsewhere.
- `citedText(o: { value: number; evidence_kind: RatingEvidenceKind; evidence_ref?: string }): string` giving `O ${o.value} (${o.evidence_kind})`, or `O ${o.value} (${o.evidence_kind}, ${o.evidence_ref})` when `o.evidence_ref !== undefined`; both a `CitedOccurrence` and a `Rating` satisfy the parameter.
- `sameCitation(cited: CitedOccurrence, o: Rating): boolean`: `value`, `evidence_kind` and `evidence_ref` each `===`.
- `strayLint(cause: Cause, i: number, j: number): Lint[]`: when `cause.cited_o` is present, the stray finding at `ptr("chains", i, "causes", j, "cited_o")`, `cited O recorded on a cause with no linked chain`; else `[]`.
- `driftLint(doc: FmeaDocument, index: DocIndex, i: number, j: number): Lint[]`: for cause j of chain i, with provider `p = cause.chain === undefined ? undefined : index.chain.get(cause.chain)`: when `p` is undefined or `p === i`, `strayLint(cause, i, j)`; otherwise `[]` when `!endsResolve(doc, index, { chain: i, cause: j, provider: p })` or `ratingO` of either chain is undefined; then, with `pid = doc.chains[p].id` and `providerO = ratingO(doc.chains[p])`, the absent finding `cause ${j} links to ${pid} but records no cited O; re-score O and record the provider's O` when `cited_o` is absent, or, when `!sameCitation(cited, providerO)`, `cause ${j} cites ${pid} at ${citedText(cited)}; ${pid} now rates ${citedText(providerO)}`, both at `ptr("chains", i, "ratings", "O")`. Keep it within maxCognitive 15.

The entry `linked-cause-occurrence-drift`, severity `"warning"`, goes last in MACHINE_RULES: build the index once and loop chains then causes in document order, collecting `driftLint`.

- [ ] **Step 6: Run lints.test.ts and see it pass**

Run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/lints.test.ts`
Expected: `# fail 0`; `runLints(documentedDoc())` is `[]` and the golden fixture still gives eleven lints.

- [ ] **Step 7: Run both runners**

Run: `bun tools/run-tests.ts && bun tools/check.ts`
Expected: both exit 0; quality.test.ts's minimalDoc pin still holds, `runLints(minimalDoc())` giving only the two `metadata-without-ground-rules` blockers; fallow reports `citeO` as used, and no duplicate or complexity finding in lints.ts or lints.test.ts.

- [ ] **Step 8: Run the browser gate**

Run: `bun tools/check-browser.ts`
Expected: exit 0, `## gate: playwright test over chromium (node v24…)`, `## not run here: firefox, webkit`, no `## not asserted` line.

- [ ] **Step 9: Run the comparison**

Run: `bun tools/compare.ts --base HEAD && bun tools/compare.ts`
Expected: the first exits 0 with `…: the two reports are byte for byte the same, so none was photographed`; the second exits 0 and `build/compare/summary.md` lists only the views the step 1 commit changed.

- [ ] **Step 10: Commit**

```
git add skills/fmea-software/scripts/lib/lints.ts skills/fmea-software/scripts/lints.test.ts skills/fmea-software/scripts/test-helpers.ts
git commit -m "Lints: a provider rated below its only consumer, and a cited Occurrence that no longer matches" -m "cause-chain-severity flags a provider whose S is below that of a
single-cause consumer that is not cascading or metastable, by the six
catalog rows of CASCADING_ROWS or a trigger that restates the linked
cause. linked-cause-occurrence-drift flags a linked cause with no cited
O or with one that differs from the provider's current O, and a cited O
on a cause with no linked chain. Both skip a link whose function or
element does not resolve. MACHINE_RULES now holds fourteen rules."
```
No trailer of any kind.


### Task A8: The update diff: edges, elements, the stale set and the re-rating order

**Files:**
- Create: skills/fmea-software/scripts/lib/update-diff.ts
- Create: skills/fmea-software/scripts/update-check.test.ts
- Test: skills/fmea-software/scripts/update-check.test.ts

**Interfaces:**
- Consumes:
  - From lib/graph.ts (A3/A4): `interface DocIndex { element: ReadonlyMap<string, number>; fn: ReadonlyMap<string, number>; chain: ReadonlyMap<string, number>; ancestors: readonly (readonly number[])[] }`, `indexDocument(doc: FmeaDocument): DocIndex`, `isDescendantOf(index: DocIndex, el: number, of: number): boolean`, `sameLineage(index: DocIndex, a: number, b: number): boolean`, `chainElement(doc: FmeaDocument, index: DocIndex, chain: number): number | undefined`, `interface ResolvedLink { chain: number; cause: number; provider: number }`, `resolvedLinks(doc: FmeaDocument, index: DocIndex): ResolvedLink[]`, `providerIds(doc: FmeaDocument): Set<string>`.
  - Test builders from test-helpers.ts, added in A4: `newElement(id, overrides?)`, `edge(from, to, strength = "strong", extra = {})`, `graphDoc(spec)`. graphDoc takes its meta from minimalDoc (id `fmea-min`, version 1), writes one function `fn-<element id>` per element in element order, makes each chain a clone of minimalDoc's ch-1 (S 8, O 3, D 4), and has each link set the consumer's `causes[0].chain` and `cited_o`.
  - Existing test-helpers.ts exports: `clone`, `rating`.
- Produces (lib/update-diff.ts):
  - `export type EdgeField = "strength" | "sla" | "limits";`
  - `export type ElementField = "kind" | "boundary" | "security_relevant";`
  - `export interface EdgeChange { change: "added" | "removed" | "changed"; from: string; to: string; fields: EdgeField[] }`
  - `export interface ElementChange { change: "added" | "removed" | "changed"; id: string; fields: ElementField[] }`
  - `export interface ReachedRow { chainId: string; index: number; rule: string }` (index in the draft)
  - `export interface UnmarkedRow { chainId: string; rule: string }`
  - `export interface RemovedLink { chainId: string; index: number; cause: number; removed: string; candidates: string[] }` (index in the draft)
  - `export interface Orphan { element: string; why: string }`
  - `export interface ChangedProvider { chainId: string; index: number; cause: number; provider: string; changed: ("failure_mode" | "O")[] }` (index in the draft)
  - `export interface UpdateDiff { edges: EdgeChange[]; elements: ElementChange[]; reached: ReachedRow[]; unmarked: UnmarkedRow[]; removedLinks: RemovedLink[]; orphans: Orphan[]; changedProviders: ChangedProvider[]; order: string[] }`
  - `export function diffUpdate(copy: FmeaDocument, draft: FmeaDocument): UpdateDiff`
  - The reached-row rule strings, the unmarked rule strings and the orphan `why` strings, all listed under "Rule strings" in Step 7.

- [ ] **Step 1: Open update-check.test.ts with its imports and local helpers**

```ts
// The structural check of an update: lib/update-diff.ts driven directly, then update-check.ts through runCli.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffUpdate } from "./lib/update-diff.ts";
import type { UpdateDiff } from "./lib/update-diff.ts";
import type { FmeaDocument } from "./lib/types.ts";
import { clone, edge, graphDoc, newElement, rating } from "./test-helpers.ts";

const EMPTY: UpdateDiff = { edges: [], elements: [], reached: [], unmarked: [], removedLinks: [], orphans: [], changedProviders: [], order: [] };

/** diffUpdate of `copy` against a clone of it that `edit` changes. */
function changed(copy: FmeaDocument, edit: (draft: FmeaDocument) => void): UpdateDiff {
  const draft = clone(copy);
  edit(draft);
  return diffUpdate(copy, draft);
}

function edgeDoc(): FmeaDocument {
  return graphDoc({ elements: ["a", "b", "c", "d"], edges: [edge("a", "b", "strong", { sla: "99.9%" }), edge("a", "c"), edge("a", "d", "weak", { limits: "10 rps" }), edge("b", "c")] });
}
```

- [ ] **Step 2: Write the edge-diff tests**

```ts
test("diffUpdate diffs edges by from and to: changed per field, an absent sla against a present one, added in draft order, removed last", () => {
  const diff = changed(edgeDoc(), (d) => {
    d.dependencies = [edge("a", "b", "weak", { sla: "99.9%" }), edge("a", "c", "strong", { sla: "99.95%" }), edge("a", "d", "weak", { limits: "20 rps" }), edge("c", "d")];
  });
  assert.deepEqual(diff.edges, [
    { change: "changed", from: "a", to: "b", fields: ["strength"] },
    { change: "changed", from: "a", to: "c", fields: ["sla"] },
    { change: "changed", from: "a", to: "d", fields: ["limits"] },
    { change: "added", from: "c", to: "d", fields: [] },
    { change: "removed", from: "b", to: "c", fields: [] },
  ]);
});

test("diffUpdate finds no change in a draft equal to the copy, nor in edges carried forward in another order", () => {
  assert.deepEqual(diffUpdate(edgeDoc(), clone(edgeDoc())), EMPTY);
  assert.deepEqual(changed(edgeDoc(), (d) => { d.dependencies.reverse(); }), EMPTY);
});
```

- [ ] **Step 3: Write the element-change and re-parenting tests**

The edge rule is §10's `edge <from> to <to> changed` for an added, a removed and a changed edge alike. The edge's own change is printed in the `edges:` section, not in the rule.

```ts
test("diffUpdate: a boundary change reaches its element's own chains only, and lists their consumer as unmarked", () => {
  const copy = graphDoc({ elements: ["checkout", "pricing"], edges: [edge("checkout", "pricing", "weak")],
    chains: [["ch-1", "checkout"], ["ch-2", "pricing"], ["ch-3", "checkout"]], links: [["ch-3", "ch-2"]] });
  assert.deepEqual(changed(copy, (d) => { d.elements[1].boundary = "owned_outside"; }), {
    ...EMPTY,
    elements: [{ change: "changed", id: "pricing", fields: ["boundary"] }],
    reached: [{ chainId: "ch-2", index: 1, rule: "element pricing boundary changed" }],
    unmarked: [{ chainId: "ch-3", rule: "link /chains/2/causes/0 into ch-2, a row this update marks" }],
    order: ["ch-2"],
  });
});

test("diffUpdate: a re-parented consumer marks the provider's chains through the added edge, and its new chain is never reached", () => {
  const copy = graphDoc({ elements: ["checkout", "checkout.api", { id: "gw", boundary: "third_party" }], edges: [edge("checkout.api", "gw")],
    chains: [["ch-1", "gw"], ["ch-2", "checkout.api"]], links: [["ch-2", "ch-1"]] });
  const diff = changed(copy, (d) => {
    d.elements[1] = newElement("api");
    d.functions[1] = { ...d.functions[1], id: "fn-api", element: "api" };
    d.dependencies = [edge("api", "gw")];
    d.chains[1] = { ...d.chains[1], id: "ch-3", function: "fn-api" };
  });
  assert.deepEqual(diff, {
    ...EMPTY,
    edges: [{ change: "added", from: "api", to: "gw", fields: [] }, { change: "removed", from: "checkout.api", to: "gw", fields: [] }],
    elements: [{ change: "added", id: "api", fields: [] }, { change: "removed", id: "checkout.api", fields: [] }],
    reached: [{ chainId: "ch-1", index: 0, rule: "edge api to gw changed" }],
    order: ["ch-1"],
  });
});

test("diffUpdate: a re-parented provider marks nothing, its new chain is never stale, and the link into its removed chain lists the new chain", () => {
  const copy = graphDoc({ elements: ["checkout", { id: "checkout.gw", boundary: "third_party" }], edges: [edge("checkout", "checkout.gw")],
    chains: [["ch-1", "checkout.gw"], ["ch-2", "checkout"]], links: [["ch-2", "ch-1"]] });
  const diff = changed(copy, (d) => {
    d.elements[1] = newElement("gw", { boundary: "third_party" });
    d.functions[1] = { ...d.functions[1], id: "fn-gw", element: "gw" };
    d.dependencies = [edge("checkout", "gw")];
    d.chains[0] = { ...d.chains[0], id: "ch-3", function: "fn-gw" };
  });
  assert.deepEqual(diff, {
    ...EMPTY,
    edges: [{ change: "added", from: "checkout", to: "gw", fields: [] }, { change: "removed", from: "checkout", to: "checkout.gw", fields: [] }],
    elements: [{ change: "added", id: "gw", fields: [] }, { change: "removed", id: "checkout.gw", fields: [] }],
    removedLinks: [{ chainId: "ch-2", index: 1, cause: 0, removed: "ch-1", candidates: ["ch-3"] }],
  });
});
```

- [ ] **Step 4: Write the consumer-side, re-rated-provider and order tests**

```ts
test("diffUpdate: an edge change reaches the chains on to and the links into them from from, an ancestor of from and a descendant of from, and no further", () => {
  const copy = graphDoc({
    elements: ["shop", "shop.api", "shop.api.handler", "shop.store", { id: "gw", boundary: "third_party" }, "gw.auth"],
    edges: [edge("shop.api", "gw", "strong", { sla: "99.9%" })],
    chains: [["ch-1", "gw"], ["ch-2", "gw.auth"], ["ch-3", "shop.api"], ["ch-4", "shop"], ["ch-5", "shop.api.handler"], ["ch-6", "shop.store"], ["ch-7", "shop.api"]],
    links: [["ch-3", "ch-1"], ["ch-4", "ch-1"], ["ch-5", "ch-1"], ["ch-6", "ch-1"], ["ch-7", "ch-2"]],
  });
  assert.deepEqual(changed(copy, (d) => { d.dependencies[0].sla = "99.95%"; }), {
    ...EMPTY,
    edges: [{ change: "changed", from: "shop.api", to: "gw", fields: ["sla"] }],
    reached: [
      { chainId: "ch-1", index: 0, rule: "edge shop.api to gw changed" },
      { chainId: "ch-3", index: 2, rule: "link /chains/2/causes/0 into ch-1 across edge shop.api to gw" },
      { chainId: "ch-4", index: 3, rule: "link /chains/3/causes/0 into ch-1 across edge shop.api to gw" },
      { chainId: "ch-5", index: 4, rule: "link /chains/4/causes/0 into ch-1 across edge shop.api to gw" },
    ],
    unmarked: [
      { chainId: "ch-6", rule: "link /chains/5/causes/0 into ch-1, a row this update marks" },
      { chainId: "ch-7", rule: "link /chains/6/causes/0 into ch-2 on gw.auth, a descendant of gw" },
    ],
    order: ["ch-1", "ch-3", "ch-4", "ch-5"],
  });
});

test("diffUpdate: a re-rated provider marks no consumer, and the consumer's cause is listed with what changed", () => {
  const copy = graphDoc({ elements: ["checkout", { id: "gw", boundary: "third_party" }], edges: [edge("checkout", "gw")],
    chains: [["ch-1", "gw"], ["ch-2", "checkout"]], links: [["ch-2", "ch-1"]] });
  const diff = changed(copy, (d) => { d.chains[0].failure_mode = "times out"; d.chains[0].ratings.O = rating(5); });
  assert.deepEqual(diff, { ...EMPTY, changedProviders: [{ chainId: "ch-2", index: 1, cause: 0, provider: "ch-1", changed: ["failure_mode", "O"] }] });
});

test("diffUpdate orders the stale rows provider before consumer over a three-chain link path, ties by draft index", () => {
  const copy = graphDoc({ elements: ["a", "b", "c", "d"], chains: [["ch-c", "c"], ["ch-b", "b"], ["ch-a", "a"], ["ch-d", "d"]], links: [["ch-c", "ch-b"], ["ch-b", "ch-a"]] });
  const diff = changed(copy, (d) => {
    d.meta.version = 2;
    for (const c of d.chains) c.stale = { flag: true, reason: "function-changed", since_version: 2 };
  });
  assert.deepEqual(diff.reached, []);
  assert.deepEqual(diff.order, ["ch-a", "ch-b", "ch-c", "ch-d"]);
});
```

- [ ] **Step 5: Write the orphan and codebase tests**

§15 says of the recursive orphan that "both are listed on the re-run after the confirmed removal". This test reads that as one element on each run. `platform` is listed on the first run. Once its removal is applied, `platform` no longer exists and `vendor` is listed on the re-run. This follows the recursion in §10's outside-element bullet.

```ts
test("diffUpdate lists each outside element that is the to of no edge with what left it so, and the re-run after a confirmed removal lists the next", () => {
  const copy = graphDoc({ elements: ["checkout", { id: "platform", boundary: "owned_outside" }, { id: "vendor", boundary: "third_party" }, "checkout.cache", { id: "legacy", boundary: "third_party" }],
    edges: [edge("checkout", "platform"), edge("platform", "vendor")] });
  const first = clone(copy);
  first.dependencies = [edge("platform", "vendor")];
  first.elements[3].boundary = "owned_outside";
  first.elements.push(newElement("ext", { boundary: "third_party" }));
  const tail = [
    { element: "checkout.cache", why: "its boundary changed to owned_outside and no edge names it" },
    { element: "legacy", why: "it had no consumer in the stored copy either" },
    { element: "ext", why: "it is added with no consumer" },
  ];
  assert.deepEqual(diffUpdate(copy, first).orphans, [{ element: "platform", why: "its last edge, from checkout, was removed" }, ...tail]);
  const second = clone(first);
  second.elements = second.elements.filter((e) => e.id !== "platform");
  second.functions = second.functions.filter((f) => f.element !== "platform");
  second.dependencies = [];
  assert.deepEqual(diffUpdate(copy, second).orphans, [{ element: "vendor", why: "its last edge, from platform, went with removed element platform" }, ...tail]);
});

test("diffUpdate: a removed codebase and a cleared or relabelled element mark nothing", () => {
  const copy = graphDoc({ elements: [{ id: "checkout", codebase: "checkout" }, { id: "checkout.auth", codebase: "auth" }], chains: [["ch-1", "checkout.auth"]] });
  copy.meta.codebases = [{ id: "checkout", name: "Checkout", repo: "acme/checkout" }, { id: "auth", name: "Auth", repo: "acme/auth" }];
  assert.deepEqual(changed(copy, (d) => {
    d.meta.codebases = [{ id: "checkout", name: "Checkout", repo: "acme/checkout" }];
    delete d.elements[1].codebase;
    d.elements[1].name = "Auth library";
  }), EMPTY);
});
```

- [ ] **Step 6: Run the file and see it fail**

From /home/nn/Projects/failwise in the Bash tool: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/update-check.test.ts`
Expected: it fails with `ERR_MODULE_NOT_FOUND` for `lib/update-diff.ts`.

- [ ] **Step 7: Create lib/update-diff.ts: the types, then diffUpdate over one private helper per output**

The header comment says three things. The module computes an update's structure from the stored copy and the draft. It shares graph.ts's index and walk. It imports no CLI. Export the types of Interfaces exactly as written there.

**Private context.** It is built once in `diffUpdate`:

```ts
interface Pair { copy: FmeaDocument; draft: FmeaDocument; ci: DocIndex; di: DocIndex }
interface Ctx extends Pair { links: ResolvedLink[]; edges: EdgeChange[]; elements: ElementChange[] }
type Change = "added" | "removed" | "changed";
```

- `pair(copy: FmeaDocument, draft: FmeaDocument): Pair` builds `ci = indexDocument(copy)` and `di = indexDocument(draft)`.
- In `Ctx`, `links = resolvedLinks(draft, di)`, `edges = diffEdges(copy, draft)` and `elements = diffElements(copy, draft)`.
- A9's `mismatchIssues` builds its context with the same `pair`.
- No parent walk, index or edge join is written in this module. Each one is the graph.ts function.

**Rule strings.** Each is exact, and §10 gives the forms:

| Kind | Rule string |
|---|---|
| Element rule | `element ${id} ${field} changed`, where field is the element change's first field |
| Edge rule | `edge ${from} to ${to} changed`, for an added, a removed or a changed edge alike |
| Link rule | `link /chains/${i}/causes/${j} into ${providerId} across edge ${from} to ${to}` |
| Unmarked, descendant form | `link /chains/${i}/causes/${j} into ${providerId} on ${providerElementId}, a descendant of ${to}` |
| Unmarked, marked form | `link /chains/${i}/causes/${j} into ${providerId}, a row this update marks` |
| Orphan `why` | the five strings in the `orphans` bullet below |

**Private helpers.** Each stays under maxCyclomatic 20 and maxCognitive 15.

- `copyRowIndex(p: Pair, i: number): number | undefined`: the copy index of draft chain `i`'s id. It is defined only when draft chain `i` is the first chain with its id (`di.chain.get(id) === i`). Otherwise it is `undefined`.
- `inBoth(p: Pair, i: number): boolean`: `copyRowIndex(p, i) !== undefined`. Rows are matched by chain id, so a chain absent from the copy is new and is never reached, unmarked or ordered.
- `newChainIds(p: Pair): string[]`: the ids of the draft chains whose id the copy lacks, in draft order, first occurrence only. A9 uses it too.
- `chainsOn(ctx: Ctx, elementId: string): number[]`: the draft chain indices `i`, ascending, for which `chainElement(draft, di, i)` equals `di.element.get(elementId)`. It is `[]` when the id does not resolve in the draft.
- `diffKeyed<F extends string, T extends { readonly [K in F]?: unknown }>(copy: readonly T[], draft: readonly T[], key: (x: T) => string, fields: readonly F[]): { change: Change; item: T; fields: F[] }[]`: the one keyed diff, written once so fallow finds no clone.
  - In each document the first occurrence of a key wins.
  - Added and changed items come in draft order, then removed items in copy order.
  - A field differs when `a[f] !== b[f]`, so an absent field differs from a present one. Fields keep the order of `fields`.
  - An item is `changed` only when at least one field differs. `item` is the draft item, or the copy item for a removed one.
- `diffEdges(copy: FmeaDocument, draft: FmeaDocument): EdgeChange[]`: `diffKeyed` over `dependencies`, with key `JSON.stringify([e.from, e.to])` and fields `["strength", "sla", "limits"]`. Each result maps to `{ change, from: item.from, to: item.to, fields }`.
- `diffElements(copy: FmeaDocument, draft: FmeaDocument): ElementChange[]`: `diffKeyed` over `elements`, with key `e.id` and fields `["kind", "boundary", "security_relevant"]`. Each result maps to `{ change, id: item.id, fields }`. No other field counts.
- `consumerLinks(ctx: Ctx, e: EdgeChange): ResolvedLink[]`: `[]` unless both `e.from` and `e.to` resolve in the draft. Otherwise, the links of `ctx.links` where:
  - the provider chain's element is exactly `to`'s index, and
  - the consumer chain's element resolves and satisfies `sameLineage(di, consumerEl, fromEl)`.
- `reachedRows(ctx: Ctx): ReachedRow[]`
- `unmarkedRows(ctx: Ctx, reached: ReachedRow[]): UnmarkedRow[]`
- `removedLinks(ctx: Ctx): RemovedLink[]`
- `orphans(ctx: Ctx): Orphan[]`
- `changedProviders(ctx: Ctx): ChangedProvider[]`
- `reratingOrder(ctx: Ctx, reached: ReachedRow[]): string[]`

**reachedRows.** It gives each row one rule: the first that applies, taking element rules first, then edge rules in `ctx.edges` order, then link rules. It lists rows in draft index order.

```ts
function reachedRows(ctx: Ctx): ReachedRow[] {
  const rule = new Map<number, string>();
  const mark = (i: number, text: string): void => { if (inBoth(ctx, i) && !rule.has(i)) rule.set(i, text); };
  for (const el of ctx.elements) if (el.change === "changed") for (const i of chainsOn(ctx, el.id)) mark(i, `element ${el.id} ${el.fields[0]} changed`);
  for (const e of ctx.edges) for (const i of chainsOn(ctx, e.to)) mark(i, `edge ${e.from} to ${e.to} changed`);
  for (const e of ctx.edges) for (const l of consumerLinks(ctx, e)) {
    mark(l.chain, `link /chains/${l.chain}/causes/${l.cause} into ${ctx.draft.chains[l.provider].id} across edge ${e.from} to ${e.to}`);
  }
  return [...rule].sort((a, b) => a[0] - b[0]).map(([index, text]) => ({ chainId: ctx.draft.chains[index].id, index, rule: text }));
}
```

**unmarkedRows.**
- It takes the rows that are in both documents and not reached, in draft index order.
- For each row it walks the row's links in `ctx.links` in cause order. Each link is tried in its descendant form first, then in its marked form. The first link that qualifies in either form gives the row its rule, in that form.
  - Descendant form: there is an `e` in `ctx.edges` such that `from` and `to` resolve in the draft, the consumer element resolves and shares a lineage with `from`, and `isDescendantOf(di, providerEl, toEl)` holds. Take the first such `e` and write the descendant-form string with its `to`.
  - Marked form: the provider chain is a reached row.
  - The marked form covers a provider reached by any rule, an element rule included, so the boundary-change test's link into ch-2 is listed; the descendant form is limited to a consumer whose element shares a lineage with the changed edge's `from`, the consumer side the edge bullet of §10 reaches. Both are this plan's reading of §10's "the consumers of the providers it marks" and "links into chains on descendants of `to`".
- A row with no qualifying link is not listed.

**removedLinks.**
- It takes every link of `resolvedLinks(copy, ci)` where the provider id is not a draft chain id (`!di.chain.has(id)`) and the consumer id is one. Order is copy (chain, cause) order.
- Each link gives `{ chainId, index, cause, removed: providerId, candidates }`. `index` is `di.chain.get(chainId)`, the draft index of the first chain with that id.
- `candidates` starts from `newChainIds(ctx)`. A candidate is dropped when the consumer is reachable from it, because repointing to it would close a cycle. To check, walk `ctx.links` breadth-first from the candidate, following each link from its chain to its provider.

**orphans.**
- It takes each draft element, first occurrence of its id, whose boundary is not `in_scope` and whose id is not in `providerIds(draft)`, in draft order.
- `why` is the first case that applies, with this exact text:
  1. `it is added with no consumer` when the copy lacks the id.
  2. Otherwise, when the copy has an edge whose `to` is the id, let `last` be the last such edge in copy order:
     - `its last edge, from ${last.from}, went with removed element ${last.from}` when the draft lacks the element `last.from`;
     - else `its last edge, from ${last.from}, was removed`.
  3. Otherwise, the copy has no edge to the id: `its boundary changed to ${boundary} and no edge names it` when the copy's boundary differs from the draft's. Here `boundary` is the draft's.
  4. Otherwise `it had no consumer in the stored copy either`.

**changedProviders.**
- It takes each link of `ctx.links` whose provider id is in the copy, in (chain, cause) order.
- Each gives `{ chainId: draft.chains[l.chain].id, index: l.chain, cause: l.cause, provider: providerId, changed }`.
- `changed` lists `"failure_mode"` when the provider's `failure_mode` differs from the copy row's.
- It then lists `"O"` when the provider's `ratings.O` differs in `value`, `evidence_kind` or `evidence_ref`. An absent value equals only an absent one.
- Only causes with a non-empty `changed` are listed.

**reratingOrder.** It covers the stale rows: the reached rows, plus each draft chain in both documents whose `stale.flag` is true. It is Kahn's algorithm over the links among them, provider first:

```ts
function reratingOrder(ctx: Ctx, reached: ReachedRow[]): string[] {
  const stale = new Set(reached.map((r) => r.index));
  ctx.draft.chains.forEach((c, i) => { if (c.stale.flag && inBoth(ctx, i)) stale.add(i); });
  const links = ctx.links.filter((l) => stale.has(l.chain) && stale.has(l.provider));
  const waiting = new Map([...stale].map((i) => [i, links.filter((l) => l.chain === i).length]));
  const order: number[] = [];
  while (waiting.size > 0) {
    const ready = [...waiting].filter(([, n]) => n === 0).map(([i]) => i);
    const next = Math.min(...(ready.length > 0 ? ready : waiting.keys())); // a cycle, which validate.ts refuses: lowest index first
    waiting.delete(next);
    order.push(next);
    for (const l of links) if (l.provider === next && waiting.has(l.chain)) waiting.set(l.chain, (waiting.get(l.chain) ?? 0) - 1);
  }
  return order.map((i) => ctx.draft.chains[i].id);
}
```

`export function diffUpdate(copy: FmeaDocument, draft: FmeaDocument): UpdateDiff` builds `Ctx` from `pair(copy, draft)`, computes `reached` once, and returns the eight outputs in the order of `UpdateDiff`.

- [ ] **Step 8: Run the file and see it pass**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/update-check.test.ts`
Expected: it passes with `# pass 10` and `# fail 0`.

- [ ] **Step 9: Run the static checks on the new module**

Run `bun tools/check.ts`. Expected: exit 0, with no tsc, oxlint or fallow finding, complexity included. Fix a fallow complexity finding on a helper by splitting the helper, never by changing the config. Fix a fallow duplication finding by moving the repeated shape into `diffKeyed` or `pair`.

No commit here. Step 2b is one commit, made at the end of A9.

### Task A9: update-check.ts, its baseline and --check refusals, and two codes

**Files:**
- Create: skills/fmea-software/scripts/update-check.ts
- Modify: skills/fmea-software/scripts/lib/update-diff.ts (append after diffUpdate)
- Modify: skills/fmea-software/scripts/lib/codes.ts:17-18, directly after the DEPENDENCY_LEGACY line (line 16 after A2)
- Modify: skills/fmea-software/scripts/codes.test.ts, in four tests: the closed-list test, the exitStatus test, the isEntry-guard test and the no-CLI-imports test
- Modify: skills/fmea-software/scripts/test-helpers.ts, in writeTable (lines 48-53 at ed1b9b0) and A2's private `moveEdgesIntoBlocks`
- Modify: skills/fmea-software/scripts/duplicate-keys.test.ts, in the header comment (lines 1-4) and the script loop (lines 78-83)
- Test: skills/fmea-software/scripts/update-check.test.ts, skills/fmea-software/scripts/codes.test.ts, skills/fmea-software/scripts/duplicate-keys.test.ts

**Out of scope for 2b:** §15's clause "the skill-commands test picks up the command" belongs to the step-5 task that adds the Scripts block line `node ${CLAUDE_SKILL_DIR}/scripts/update-check.ts <stored copy> <draft> [--check]`. That task has to extend tools/skill-commands.test.ts. Its `DOCUMENT_SCRIPTS` filter keeps only priority, validate and render lines, and its `argv()` cannot fill `<stored copy>`, which contains a space. Step 2b does not touch that test.

**Interfaces:**
- Consumes:
  - From A8: `diffUpdate(copy: FmeaDocument, draft: FmeaDocument): UpdateDiff`, the update-diff types, and the private `Pair`, `pair`, `copyRowIndex` and `newChainIds` of lib/update-diff.ts.
  - From A2:
    - `legacyIssues(raw: unknown): Issue[]`, which gives KIND_LEGACY or DEPENDENCY_LEGACY with rule `format-legacy`.
    - The private `moveEdgesIntoBlocks(doc: FmeaDocument): void` in test-helpers.ts.
  - `checkSchema(doc: unknown): Issue[]` from lib/schema.ts and `writeIssues(issues: Issue[]): void` from lib/validation.ts.
  - From the shared libs: `parseArgs`, `assertExtension`, `readJsonFile`, `isEntry` and `run`.
  - Test builders from A4: `graphDoc`, `edge`.
  - Existing test-helpers.ts exports: `clone`, `rating`, `loadFixture`, `fixturePath`, `runCli`, `withTempDir`.
- Produces:
  - In codes.ts, both directly after DEPENDENCY_LEGACY:
    - `UPDATE_BASELINE: EXIT_VALIDATION, // raised by update-check.ts for a stored copy that is not the draft's baseline`
    - `UPDATE_MISMATCH: EXIT_VALIDATION, // raised by update-check.ts --check for a draft whose flags, ratings or links disagree with the structural rules`
  - In update-diff.ts:
    - `export function baselineIssues(copy: FmeaDocument, draft: FmeaDocument, check: boolean): Issue[]`
    - `export function mismatchIssues(copy: FmeaDocument, draft: FmeaDocument, diff: UpdateDiff): Issue[]`
    - `export function diffLines(diff: UpdateDiff, check: boolean): string[]`
  - The rule names, which later steps' prose quotes: `update-baseline` (code UPDATE_BASELINE), and `stale-missing`, `stale-reason`, `stale-since-version`, `stale-unreached`, `rating-outside-set` and `link-into-removed` (code UPDATE_MISMATCH).
  - The stdout contract, which steps 5 and 6 quote:
    - The section headers, in order: `edges:`, `elements:`, `stale:`, `unmarked:`, `links into removed chains:`, `outside elements with no consumer:`, `consumer causes whose linked chain changed:` (only with `--check`) and `re-rating order:`.
    - The last line, `update-check: <counts>`, with the nouns of Step 13.
  - The CLI `update-check.ts <stored copy> <draft> [--check]`. It has no `USAGE_LINE` constant; its header comment carries the usage.
  - In test-helpers.ts: `export function writeJson(dir: string, name: string, value: unknown): string` and `export function moveEdgesIntoBlocks(doc: FmeaDocument): void`.
  - The codes.test.ts title `"CODES holds exactly the twenty-five codes of the closed list"`.

- [ ] **Step 1: Pin the codes, the CLI lists and the repeated-key run**

In codes.test.ts:
- Rename the closed-list test to `"CODES holds exactly the twenty-five codes of the closed list"`.
- Insert `"UPDATE_BASELINE", "UPDATE_MISMATCH",` directly after `"DEPENDENCY_LEGACY",`.
- Next to `assert.equal(exitStatus("DEPENDENCY_LEGACY"), 2);`, add `assert.equal(exitStatus("UPDATE_BASELINE"), 2);` and `assert.equal(exitStatus("UPDATE_MISMATCH"), 2);`.
- Both shipped-CLI lists become `["validate.ts", "priority.ts", "render.ts", "track.ts", "update-check.ts"]`. They are the one in the isEntry-guard test and `const clis` in the no-CLI-imports test.

In duplicate-keys.test.ts:
- In the header comment, "the four scripts" becomes "the five scripts".
- In the script loop, add `["update-check.ts", path, path],` after the track.ts entry. The expected `line`, exit 3, empty stdout and unchanged file stay as they are.

- [ ] **Step 2: Add writeJson and export moveEdgesIntoBlocks in test-helpers.ts**

```ts
/** Writes `value` as indented JSON with a final newline to `name` in `dir`, and returns the path. */
export function writeJson(dir: string, name: string, value: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  return path;
}
```
The body of `writeTable` becomes `return writeJson(dir, "table.json", table);`. Change `function moveEdgesIntoBlocks` to `export function moveEdgesIntoBlocks` and leave its body as it is.

- [ ] **Step 3: Add the CLI helpers to update-check.test.ts**

Extend the imports:
- `legacyIssues` from `./lib/legacy.ts`.
- The types `Cause`, `Chain`, `DependencyEdge` and `StaleReason`.
- `fixturePath`, `loadFixture`, `moveEdgesIntoBlocks`, `runCli`, `withTempDir` and `writeJson` from `./test-helpers.ts`.

Then add these module-private helpers:

```ts
function chainOf(doc: FmeaDocument, id: string): Chain {
  const c = doc.chains.find((x) => x.id === id);
  assert.ok(c, `no chain ${id}`);
  return c;
}

function edgeOf(doc: FmeaDocument, from: string, to: string): DependencyEdge {
  const e = doc.dependencies.find((x) => x.from === from && x.to === to);
  assert.ok(e, `no edge ${from} to ${to}`);
  return e;
}

/** The copy one version on, with a meta.history entry at that version. */
function bumped(copy: FmeaDocument): FmeaDocument {
  const d = clone(copy);
  d.meta.version = copy.meta.version + 1;
  d.meta.history.push({ version: d.meta.version, date: "2026-10-08", change: "test update" });
  return d;
}

/** checkout consumes the third-party gw; ch-1 on gw, ch-2 on checkout links into ch-1, ch-3 on checkout.api. */
function storedCopy(): FmeaDocument {
  return graphDoc({ elements: ["checkout", "checkout.api", { id: "gw", boundary: "third_party" }], edges: [edge("checkout", "gw")],
    chains: [["ch-1", "gw"], ["ch-2", "checkout"], ["ch-3", "checkout.api"]], links: [["ch-2", "ch-1"]] });
}

/** The draft the rules accept: the gw edge weak, ch-1 and ch-2 flagged element-changed at the draft's version. */
function goodDraft(copy: FmeaDocument): FmeaDocument {
  const d = bumped(copy);
  edgeOf(d, "checkout", "gw").strength = "weak";
  for (const id of ["ch-1", "ch-2"]) chainOf(d, id).stale = { flag: true, reason: "element-changed", since_version: d.meta.version };
  return d;
}

type Run = { status: number; stdout: string; stderr: string };

function runCheck(copy: unknown, draft: unknown, ...flags: string[]): Run {
  return withTempDir((dir) => runCli("update-check.ts", [writeJson(dir, "copy.json", copy), writeJson(dir, "draft.json", draft), ...flags]));
}

/** A change to the stored copy, made before goodDraft is built from it, and a change to that draft. */
type Edit = { copy?: (c: FmeaDocument) => void; edit: (d: FmeaDocument) => void };

/** --check of storedCopy, changed by `e.copy`, against goodDraft of it, changed by `e.edit`. */
function checkEdited(e: Edit): Run {
  const copy = storedCopy();
  e.copy?.(copy);
  const draft = goodDraft(copy);
  e.edit(draft);
  return runCheck(copy, draft, "--check");
}

const NONE = (name: string): string => `${name}:\n  none\n`;
```

- [ ] **Step 4: Write the printing tests**

```ts
test("update-check.ts prints the diff on the first run and refuses nothing a draft has not yet flagged", () => {
  const copy = storedCopy();
  const draft = bumped(copy);
  edgeOf(draft, "checkout", "gw").strength = "weak";
  const r = runCheck(copy, draft);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout, "edges:\n  changed checkout to gw: strength\n" + NONE("elements") +
    "stale:\n  ch-1: edge checkout to gw changed\n  ch-2: link /chains/1/causes/0 into ch-1 across edge checkout to gw\n" +
    NONE("unmarked") + NONE("links into removed chains") + NONE("outside elements with no consumer") +
    "re-rating order:\n  ch-1, ch-2\n" +
    "update-check: 1 edge change, 0 element changes, 2 stale rows, 0 unmarked rows, 0 links into removed chains, 0 outside elements with no consumer\n");
});

test("update-check.ts --check accepts a draft whose flags the rules reach, and prints the changed-provider section and count", () => {
  const r = runCheck(storedCopy(), goodDraft(storedCopy()), "--check");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.ok(r.stdout.includes(NONE("outside elements with no consumer") + NONE("consumer causes whose linked chain changed") + "re-rating order:\n  ch-1, ch-2\n"), r.stdout);
  assert.ok(r.stdout.endsWith(", 0 outside elements with no consumer, 0 changed providers\n"), r.stdout);
});

test("update-check.ts given one path as both copy and draft prints every section none, and --check refuses it at /meta/version", () => {
  const path = fixturePath("update", "before.fmea.json");
  const r = runCli("update-check.ts", [path, path]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, ["edges", "elements", "stale", "unmarked", "links into removed chains", "outside elements with no consumer", "re-rating order"].map(NONE).join("") +
    "update-check: 0 edge changes, 0 element changes, 0 stale rows, 0 unmarked rows, 0 links into removed chains, 0 outside elements with no consumer\n");
  const c = runCli("update-check.ts", [path, path, "--check"]);
  assert.equal(c.status, 2);
  assert.equal(c.stderr, "error UPDATE_BASELINE: update-baseline: the draft's meta.version 1 is not 2 as the stored copy's meta.version 1 requires at /meta/version\n");
});
```

- [ ] **Step 5: Write the UPDATE_MISMATCH tests, table-driven so that fallow finds no clone**

§10 says the refusal comes with "one finding line per row". This plan reads that as one line per row per rule. A row that breaks two rules prints two lines. The last MISMATCHES case pins that reading.

```ts
const MISMATCHES: (Edit & { name: string; stderr: string })[] = [
  { name: "stale-missing: each reached row with stale.flag false and no clearing entry is refused at its flag",
    edit: (d) => { for (const id of ["ch-1", "ch-2"]) chainOf(d, id).stale = { flag: false }; },
    stderr: "error UPDATE_MISMATCH: stale-missing: chain ch-1 is reached by edge checkout to gw changed but its stale.flag is false at /chains/0/stale/flag\n" +
      "error UPDATE_MISMATCH: stale-missing: chain ch-2 is reached by link /chains/1/causes/0 into ch-1 across edge checkout to gw but its stale.flag is false at /chains/1/stale/flag\n" },
  { name: "stale-reason: a reached row flagged for another reason is refused at its reason",
    edit: (d) => { chainOf(d, "ch-1").stale.reason = "function-changed"; },
    stderr: "error UPDATE_MISMATCH: stale-reason: chain ch-1 is reached by edge checkout to gw changed but its stale.reason is function-changed at /chains/0/stale/reason\n" },
  { name: "stale-since-version: a newly flagged row takes the draft's meta.version",
    edit: (d) => { chainOf(d, "ch-2").stale.since_version = 1; },
    stderr: "error UPDATE_MISMATCH: stale-since-version: chain ch-2 has stale.since_version 1 where 2 is due at /chains/1/stale/since_version\n" },
  { name: "stale-unreached: an element-changed flag new in this version that no rule reaches is refused",
    edit: (d) => { chainOf(d, "ch-3").stale = { flag: true, reason: "element-changed", since_version: 2 }; },
    stderr: "error UPDATE_MISMATCH: stale-unreached: chain ch-3 is newly flagged element-changed but no rule reaches it at /chains/2/stale/reason\n" },
  { name: "stale-since-version: a row flagged before keeps its own since_version when element-changed replaces function-changed",
    copy: (c) => { c.meta.version = 2; chainOf(c, "ch-1").stale = { flag: true, reason: "function-changed", since_version: 2 }; },
    edit: () => undefined,
    stderr: "error UPDATE_MISMATCH: stale-since-version: chain ch-1 has stale.since_version 3 where 2 is due at /chains/0/stale/since_version\n" },
  { name: "rating-outside-set: a rating changed on a row that is not stale, with no history entry at the draft's version, is refused",
    edit: (d) => { chainOf(d, "ch-3").ratings.O = rating(4); },
    stderr: "error UPDATE_MISMATCH: rating-outside-set: chain ch-3 is not stale but its O moved from 3 to 4 with no history entry at version 2 at /chains/2/ratings/O/value\n" },
  { name: "one line per row per rule: a row with a wrong reason and a wrong since_version gets both lines, in rule order",
    edit: (d) => { chainOf(d, "ch-1").stale = { flag: true, reason: "function-changed", since_version: 1 }; },
    stderr: "error UPDATE_MISMATCH: stale-reason: chain ch-1 is reached by edge checkout to gw changed but its stale.reason is function-changed at /chains/0/stale/reason\n" +
      "error UPDATE_MISMATCH: stale-since-version: chain ch-1 has stale.since_version 1 where 2 is due at /chains/0/stale/since_version\n" },
];

for (const m of MISMATCHES) {
  test(`update-check.ts --check, ${m.name}`, () => {
    const r = checkEdited(m);
    assert.equal(r.status, 2, r.stdout);
    assert.equal(r.stderr, m.stderr);
  });
}

const ACCEPTED: (Edit & { name: string })[] = [
  { name: "a row flagged before, with element-changed in place of function-changed, keeps its own since_version",
    copy: (c) => { c.meta.version = 2; chainOf(c, "ch-1").stale = { flag: true, reason: "function-changed", since_version: 2 }; },
    edit: (d) => { chainOf(d, "ch-1").stale.since_version = 2; } },
  { name: "a reached row cleared in the same session is accepted by its clearing history entry",
    edit: (d) => { const c = chainOf(d, "ch-2"); c.stale = { flag: false }; c.history.push({ version: 2, date: "2026-10-08", change: "stale flag cleared; since_version 2" }); } },
  { name: "a rating changed outside the stale set is accepted with a history entry at the draft's version",
    edit: (d) => { const c = chainOf(d, "ch-3"); c.ratings.O = rating(4); c.history.push({ version: 2, date: "2026-10-08", change: "O re-scored" }); } },
];

for (const a of ACCEPTED) {
  test(`update-check.ts --check accepts ${a.name}`, () => {
    const r = checkEdited(a);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
  });
}
```

- [ ] **Step 6: Write the link-into-removed tests**

```ts
/** The copy one version on with ch-1 removed and ch-4 new on gw; ch-2 still links to ch-1 until an edit changes it. */
function withoutCh1(copy: FmeaDocument): FmeaDocument {
  const d = bumped(copy);
  d.chains = [...d.chains.filter((c) => c.id !== "ch-1"), { ...clone(chainOf(copy, "ch-1")), id: "ch-4" }];
  return d;
}

const LINKS: { name: string; edit: (cause: Cause) => void; status: number; stderr: string }[] = [
  { name: "accepts a link repointed to a chain new in this update",
    edit: (c) => { c.chain = "ch-4"; delete c.cited_o; }, status: 0, stderr: "" },
  { name: "accepts a dropped link", edit: (c) => { delete c.chain; delete c.cited_o; }, status: 0, stderr: "" },
  { name: "link-into-removed: refuses a link repointed to a chain that already existed",
    edit: (c) => { c.chain = "ch-3"; delete c.cited_o; }, status: 2,
    stderr: "error UPDATE_MISMATCH: link-into-removed: cause 0 of chain ch-2 links to ch-3, which is neither dropped nor a chain new in this update at /chains/0/causes/0/chain\n" },
  { name: "link-into-removed: refuses a link left on the removed chain", edit: () => undefined, status: 2,
    stderr: "error UPDATE_MISMATCH: link-into-removed: cause 0 of chain ch-2 links to ch-1, which is neither dropped nor a chain new in this update at /chains/0/causes/0/chain\n" },
];

for (const l of LINKS) {
  test(`update-check.ts --check ${l.name}`, () => {
    const copy = storedCopy();
    const draft = withoutCh1(copy);
    l.edit(chainOf(draft, "ch-2").causes[0]);
    const r = runCheck(copy, draft, "--check");
    assert.equal(r.status, l.status, r.stderr);
    assert.equal(r.stderr, l.stderr);
    assert.ok(r.stdout.includes("links into removed chains:\n  /chains/0/causes/0 into ch-1: repoint to ch-4, or drop\n"), r.stdout);
    assert.ok(r.stdout.includes(", 1 link into a removed chain, "), r.stdout);
  });
}

test("update-check.ts --check link-into-removed: names every cause of one chain left linked into a removed chain, in cause order", () => {
  const copy = storedCopy();
  const consumer = chainOf(copy, "ch-2");
  consumer.causes.push(clone(consumer.causes[0]));
  const draft = withoutCh1(copy);
  const r = runCheck(copy, draft, "--check");
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.stderr,
    "error UPDATE_MISMATCH: link-into-removed: cause 0 of chain ch-2 links to ch-1, which is neither dropped nor a chain new in this update at /chains/0/causes/0/chain\n" +
    "error UPDATE_MISMATCH: link-into-removed: cause 1 of chain ch-2 links to ch-1, which is neither dropped nor a chain new in this update at /chains/0/causes/1/chain\n");
  assert.ok(r.stdout.includes("  /chains/0/causes/1 into ch-1: repoint to ch-4, or drop\n"), r.stdout);
  assert.ok(r.stdout.includes(", 2 links into removed chains, "), r.stdout);
});
```

- [ ] **Step 7: Write the UPDATE_BASELINE, schema, legacy, usage and I/O tests**

```ts
function v2(doc: FmeaDocument): FmeaDocument {
  const d = clone(doc);
  moveEdgesIntoBlocks(d);
  return d;
}
const v2Message = (): string => legacyIssues(v2(loadFixture<FmeaDocument>("checkout-service.fmea.json")))[0].message;

const BASELINES: { name: string; copy: () => FmeaDocument; draft: (c: FmeaDocument) => FmeaDocument; flags: string[]; stderr: () => string }[] = [
  { name: "update-baseline: a draft whose meta.id differs is refused at /meta/id", copy: storedCopy,
    draft: (c) => { const d = goodDraft(c); d.meta.id = "fmea-other"; return d; }, flags: ["--check"],
    stderr: () => "error UPDATE_BASELINE: update-baseline: the stored copy has meta.id fmea-min but the draft has fmea-other at /meta/id\n" },
  { name: "update-baseline: under --check the draft's version is exactly one above the copy's", copy: storedCopy,
    draft: (c) => { const d = goodDraft(c); d.meta.version = 1; return d; }, flags: ["--check"],
    stderr: () => "error UPDATE_BASELINE: update-baseline: the draft's meta.version 1 is not 2 as the stored copy's meta.version 1 requires at /meta/version\n" },
  { name: "update-baseline: on the first run a version two apart is refused", copy: storedCopy,
    draft: (c) => { const d = goodDraft(c); d.meta.version = 3; return d; }, flags: [],
    stderr: () => "error UPDATE_BASELINE: update-baseline: the draft's meta.version 3 is not 1 or 2 as the stored copy's meta.version 1 requires at /meta/version\n" },
  { name: "update-baseline: a v2 copy is refused before the schema runs, with the legacy message",
    copy: () => v2(loadFixture<FmeaDocument>("checkout-service.fmea.json")), draft: () => loadFixture<FmeaDocument>("checkout-service.fmea.json"), flags: [],
    stderr: () => `error UPDATE_BASELINE: update-baseline: the stored copy is not a v3 document: ${v2Message()} at /dependencies\n` },
  { name: "format-legacy: a v2 draft is refused with its own code, prefixed the draft",
    copy: () => loadFixture<FmeaDocument>("checkout-service.fmea.json"), draft: (c) => v2(c), flags: [],
    stderr: () => `error DEPENDENCY_LEGACY: format-legacy: the draft: ${v2Message()} at /dependencies\n` },
  { name: "schema: a copy that fails the schema is refused, naming the stored copy",
    copy: () => { const c = storedCopy(); delete (c.meta as Partial<FmeaDocument["meta"]>).scope; return c; }, draft: () => goodDraft(storedCopy()), flags: [],
    stderr: () => "error SCHEMA: schema: the stored copy: missing required property \"scope\" at /meta\n" },
  { name: "schema: a draft that fails the schema is refused, naming the draft", copy: storedCopy,
    draft: (c) => { const d = goodDraft(c); d.chains[0].ratings.S.value = 11; return d; }, flags: [],
    stderr: () => "error SCHEMA: schema: the draft: value 11 is above the maximum 10 at /chains/0/ratings/S/value\n" },
];

for (const b of BASELINES) {
  test(`update-check.ts: ${b.name}`, () => {
    const copy = b.copy();
    const r = runCheck(copy, b.draft(copy), ...b.flags);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, b.stderr());
  });
}

test("update-baseline: on the first run a draft at the copy's own version is accepted", () => {
  const copy = storedCopy();
  const draft = goodDraft(copy);
  draft.meta.version = 1;
  assert.equal(runCheck(copy, draft).status, 0);
});

test("update-check.ts refuses a wrong argument count or extension with USAGE, exit 1, and a missing copy with IO_READ, exit 3", () => {
  withTempDir((dir) => {
    const draft = writeJson(dir, "draft.json", storedCopy());
    assert.deepEqual(runCli("update-check.ts", [draft]), { status: 1, stdout: "", stderr: "error USAGE: expected 2 positional argument(s), got 1\n" });
    assert.deepEqual(runCli("update-check.ts", [`${dir}/copy.txt`, draft]), { status: 1, stdout: "", stderr: "error USAGE: the stored copy must end in .json\n" });
    const r = runCli("update-check.ts", [`${dir}/copy.json`, draft]);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /^error IO_READ: cannot read .*copy\.json: /);
  });
});
```

- [ ] **Step 8: Write the stored-fixture case**

```ts
test("update-check.ts --check exits 0 on update/before.fmea.json against a draft with the gateway edge weak and expected-stale.json's flags", () => {
  const copy = loadFixture<FmeaDocument>("update", "before.fmea.json");
  const draft = bumped(copy);
  edgeOf(draft, "checkout", "checkout.payment-gateway").strength = "weak";
  const expected = loadFixture<{ stale: Record<string, StaleReason> }>("update", "expected-stale.json");
  for (const [id, reason] of Object.entries(expected.stale)) chainOf(draft, id).stale = { flag: true, reason, since_version: 2 };
  const r = runCheck(copy, draft, "--check");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout, "edges:\n  changed checkout to checkout.payment-gateway: strength\n" + NONE("elements") +
    "stale:\n  ch-1: edge checkout to checkout.payment-gateway changed\n" + NONE("unmarked") + NONE("links into removed chains") +
    NONE("outside elements with no consumer") + NONE("consumer causes whose linked chain changed") + "re-rating order:\n  ch-1, ch-2, ch-4\n" +
    "update-check: 1 edge change, 0 element changes, 1 stale row, 0 unmarked rows, 0 links into removed chains, 0 outside elements with no consumer, 0 changed providers\n");
});
```

- [ ] **Step 9: Run the three files and see them fail**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/update-check.test.ts skills/fmea-software/scripts/codes.test.ts skills/fmea-software/scripts/duplicate-keys.test.ts`

Expected:
- The A8 module cases pass.
- Every CLI case fails, because node exits 1 with `Cannot find module` for `update-check.ts`.
- codes.test.ts fails on the closed list, on the two new exitStatus lines and on the missing update-check.ts file.
- duplicate-keys.test.ts fails on update-check.ts.

- [ ] **Step 10: Add the two codes to codes.ts**

Directly after the `DEPENDENCY_LEGACY` line (line 16 after A2), so the new lines are 17 and 18:
```ts
  UPDATE_BASELINE: EXIT_VALIDATION, // raised by update-check.ts for a stored copy that is not the draft's baseline
  UPDATE_MISMATCH: EXIT_VALIDATION, // raised by update-check.ts --check for a draft whose flags, ratings or links disagree with the structural rules
```

- [ ] **Step 11: Add baselineIssues to update-diff.ts**

`export function baselineIssues(copy: FmeaDocument, draft: FmeaDocument, check: boolean): Issue[]`. Every issue has code `UPDATE_BASELINE` and rule `update-baseline`. There is at most one issue per check, and the id check comes first:
- When the ids differ: `the stored copy has meta.id ${copy.meta.id} but the draft has ${draft.meta.id}` at `/meta/id`.
- Let `c = copy.meta.version` and `v = draft.meta.version`. The allowed versions are `check ? [c + 1] : [c, c + 1]`. When `v` is outside them: `the draft's meta.version ${v} is not ${check ? c + 1 : `${c} or ${c + 1}`} as the stored copy's meta.version ${c} requires` at `/meta/version`.

Add `import type { Issue } from "./codes.ts";`.

- [ ] **Step 12: Add mismatchIssues to update-diff.ts**

`export function mismatchIssues(copy: FmeaDocument, draft: FmeaDocument, diff: UpdateDiff): Issue[]`. Every issue has code `UPDATE_MISMATCH`.

**Context.** It is built once in mismatchIssues by a private `checkContext(copy, draft, diff)` that starts from A8's `pair`:

```ts
interface CheckCtx extends Pair { reached: ReadonlyMap<number, string>; removed: readonly RemovedLink[]; fresh: ReadonlySet<string> }
```
- `reached` maps each `diff.reached` row's index to its rule.
- `removed` is `diff.removedLinks`.
- `fresh` is `new Set(newChainIds(pair))`.

A row's copy row is `copy.chains[copyRowIndex(ctx, i)]`. A row is in both documents when that index is defined.

**Rules.** Each rule is a private helper `(ctx: CheckCtx, i: number): Issue[]` that returns at most one issue, except `link-into-removed`, which returns one issue per offending cause. Rows go in draft chain index order. On each row the helpers run in the order below, so a row that breaks several rules gets one line per rule.

A **clearing entry** is an entry of the draft row's `history[]` whose `version` equals `draft.meta.version`.

| Rule | Pointer | Message | Applies to |
|---|---|---|---|
| `stale-missing` | `/chains/<i>/stale/flag` | `chain ${id} is reached by ${rule} but its stale.flag is false` | a reached row whose `stale.flag` is false and that carries no clearing entry |
| `stale-reason` | `/chains/<i>/stale/reason` | `chain ${id} is reached by ${rule} but its stale.reason is ${reason ?? "absent"}` | a reached row whose flag is true and whose reason is not `element-changed` |
| `stale-since-version` | `/chains/<i>/stale/since_version` | `chain ${id} has stale.since_version ${got ?? "absent"} where ${want} is due` | a reached row whose flag is true and whose `since_version` is not `want` |
| `stale-unreached` | `/chains/<i>/stale/reason` | `chain ${id} is newly flagged element-changed but no rule reaches it` | any draft chain, new ones included, that is not reached, is flagged (`stale.flag` true) with reason `element-changed`, and whose copy row is absent or not flagged `element-changed` |
| `rating-outside-set` | `/chains/<i>/ratings/<F>/value` | `chain ${id} is not stale but its ${F} moved from ${a} to ${b} with no history entry at version ${v}` | a row in both documents whose draft `stale.flag` is false, that carries no clearing entry, and one of whose `ratings.<F>.value` differs from the copy row's; F is the first that differs, in S, O, D order |
| `link-into-removed` | `/chains/<i>/causes/<j>/chain` | `cause ${j} of chain ${id} links to ${target}, which is neither dropped nor a chain new in this update` | see below |

For `stale-since-version`, `want` is the copy row's `since_version` when the copy row's `stale.flag` is true. Otherwise `want` is `draft.meta.version`.

For `link-into-removed`, look at the entries of `ctx.removed` whose `index` is `i`, in order. There is one finding for each entry whose draft cause `j` still has a `chain` that is not in `ctx.fresh`, in cause order, so a chain with two causes left linked into removed chains gets two lines, as §13's "each link into a removed chain left in place" requires. A missing cause `j`, or a cause with no `chain`, counts as dropped.

- [ ] **Step 13: Add diffLines to update-diff.ts**

`export function diffLines(diff: UpdateDiff, check: boolean): string[]`.

The sections come in the order of this table. Each is a `<name>:` line followed by one line per item indented two spaces, or by `  none` when there are no items.

| Section | Item line |
|---|---|
| `edges:` | `added <from> to <to>` / `removed <from> to <to>` / `changed <from> to <to>: <fields joined ", ">` |
| `elements:` | `added <id>` / `removed <id>` / `changed <id>: <fields joined ", ">` |
| `stale:` | `<chainId>: <rule>`, from `reached` |
| `unmarked:` | `<chainId>: <rule>` |
| `links into removed chains:` | `/chains/<index>/causes/<cause> into <removed>: repoint to <candidates joined ", ">, or drop`, or `/chains/<index>/causes/<cause> into <removed>: drop` when there is no candidate |
| `outside elements with no consumer:` | `<element>: <why>` |
| `consumer causes whose linked chain changed:` | `/chains/<index>/causes/<cause> into <provider>: <changed joined ", ">`; the section is printed only when `check` is true |
| `re-rating order:` | the items are `order.length > 0 ? [order.join(", ")] : []`, so an empty order prints `  none` |

The last line is plain: `update-check: ` followed by the counts joined with `", "`. Each count uses the singular noun when it is 1 and the plural otherwise:

| Count | Singular | Plural |
|---|---|---|
| edges | `edge change` | `edge changes` |
| elements | `element change` | `element changes` |
| reached | `stale row` | `stale rows` |
| unmarked | `unmarked row` | `unmarked rows` |
| removedLinks | `link into a removed chain` | `links into removed chains` |
| orphans | `outside element with no consumer` | `outside elements with no consumer` |
| changedProviders, only with `check` | `changed provider` | `changed providers` |

Approach: use two private helpers, `section(name: string, items: string[]): string[]` and `counted(n: number, one: string, many: string): string`.

- [ ] **Step 14: Create update-check.ts**

```ts
// update-check.ts <stored copy> <draft> [--check]
// Reads the copy of the analysis an update set aside before its first change, and the draft it is
// writing, and prints the structural diff: the edge and element changes, the rows an element-changed
// rule reaches with each row's rule, the rows left unmarked by rule, the links into removed chains,
// the outside elements left with no consumer and the order to re-rate in. With --check it also prints
// the consumer causes whose linked chain changed, and refuses with UPDATE_MISMATCH a draft whose
// stale flags, ratings outside the stale set or links into removed chains disagree. A copy that is
// not the draft's baseline is UPDATE_BASELINE on either run. It runs the legacy gate and the schema on
// both documents, never the invariants or the priorities, and writes nothing.
// Its edges, elements and stale sections and its last line are the summary the update copies into meta.history.
```

- The file has no `USAGE_LINE` constant. The header comment carries the usage, and parseArgs and assertExtension write their own USAGE messages.
- `function main(argv: string[]): number` does the following, in order:
  1. Parse with `parseArgs(argv, { positional: 2, flags: { check: "boolean" } })`.
  2. Check `assertExtension(copyPath, ".json", "the stored copy")`, then `assertExtension(draftPath, ".json", "the draft")`.
  3. Read with `readJsonFile(copyPath)`, then `readJsonFile(draftPath)`.
  4. Run three stages. Each stage prints all its Issue lines through `writeIssues` and returns 2 when it found any:
     - The legacy gate, copy first.
       - Each issue of `legacyIssues(copy)` becomes `{ code: "UPDATE_BASELINE", rule: "update-baseline", message: `the stored copy is not a v3 document: ${i.message}`, pointer: i.pointer }`.
       - Each issue of `legacyIssues(draft)` keeps its code and rule, and its message becomes `the draft: ${i.message}`.
       - A v2 draft keeps its own code, `DEPENDENCY_LEGACY`, because it is the document being written, not the baseline (decision 15).
     - The schema stage: `checkSchema` on both documents, with messages prefixed `the stored copy: ` and `the draft: `.
     - `baselineIssues(copy, draft, check)`.
  5. Compute `diff = diffUpdate(copy, draft)` and write `diffLines(diff, check).join("\n") + "\n"` to stdout.
  6. With `--check`, print `mismatchIssues(copy, draft, diff)` through `writeIssues`, and return 2 when there are any.
  7. Return 0.
- Approach: two private helpers. `stage(issues: Issue[]): boolean` prints a list and reports whether it is non-empty. `prefixed(issues: Issue[], prefix: string): Issue[]` adds the message prefix.
- A USAGE or IO_READ ScriptError is thrown by the libraries and is never caught here. update-check.ts does not import ScriptError.
- The file ends exactly `\nif (isEntry(import.meta)) run(main);\n`. It imports no other CLI.

- [ ] **Step 15: Run the three files and see them pass**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/update-check.test.ts skills/fmea-software/scripts/codes.test.ts skills/fmea-software/scripts/duplicate-keys.test.ts`
Expected: `# fail 0`.

- [ ] **Step 16: Run both runners**

Run `bun tools/run-tests.ts`, then `bun tools/check.ts`. Both must exit 0. A runner that dies or prints nothing is unverified, not a pass. Fix a fallow clone in update-check.test.ts by moving the repeated shape into the table loops or the local helpers (`checkEdited`, `runCheck`). Fix a fallow clone in update-diff.ts by moving it into `pair`, `diffKeyed` or `copyRowIndex`.

- [ ] **Step 17: Run the browser checks (render.ts imports codes.ts)**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node tools/check-browser.ts && node tools/compare.ts --base HEAD && node tools/compare.ts`; the plain run compares against the branch point, must exit 0, and its summary's changed views are read, as the Global Constraints require of every renderer commit

- The gate must exit 0, and EXPECTED_FAILURES and NOT_ASSERTED must stay empty.
- The `--base HEAD` run is the check for this commit. It must print `## compare: no view of <n> changed against <short>: the two reports are byte for byte the same, so none was photographed`. Any changed view in that run is a finding.

- [ ] **Step 18: Commit step 2b**

```
git add skills/fmea-software/scripts/lib/update-diff.ts skills/fmea-software/scripts/update-check.ts skills/fmea-software/scripts/update-check.test.ts skills/fmea-software/scripts/lib/codes.ts skills/fmea-software/scripts/codes.test.ts skills/fmea-software/scripts/test-helpers.ts skills/fmea-software/scripts/duplicate-keys.test.ts
git commit -m "Update check: update-check.ts prints the structural diff of an update and refuses a draft or a copy that disagrees with it" -m "lib/update-diff.ts computes, from the stored copy and the draft,
the edge and element diffs, the rows an edge or element change marks
stale with each row's rule, the rows left unmarked, the links into
removed chains, the outside elements left with no consumer, the
consumer causes whose provider changed and the re-rating order, over
the index and walk of lib/graph.ts. update-check.ts prints it and,
with --check, refuses a disagreeing draft with UPDATE_MISMATCH; a copy
that is not the draft's baseline is UPDATE_BASELINE. Both codes join
CODES after DEPENDENCY_LEGACY."
```
Add no Co-Authored-By line, no "Generated with" line and no session trailer. Do not push.


### Task A10: Fixture enrichment: codebases, the order-store edge and the linked ninth chain

**Files:**
- Modify: skills/fmea-software/evals/fixtures/checkout-service.fmea.json:8-21 (meta, `codebases` after `boundary`), :62-80 (element `checkout`), :136-155 (element `checkout.session-auth`), the `dependencies` array A3 put between `functions` and `chains`, :1022-1023 (after `ch-8`), :1024-1097 (`computed`, regenerated)
- Modify: skills/fmea-software/scripts/schema.test.ts:447-468 (the comment A1 put on `derivationDoc()`'s codebase and `cited_o` additions), :533-561, :563-605
- Modify: skills/fmea-software/scripts/lints.test.ts:315-323, plus one new test after it
- Modify: skills/fmea-software/scripts/validate.test.ts:21-35, :48-58, :89-90, :124, :165-166, :183-185, :247, :261, :358-366, :386-394, plus one new test after :35, and A3's test "the checkout fixture's edges are its two former blocks, each from checkout", which Step 3 deletes
- Modify: skills/fmea-software/scripts/report-model.test.ts:36-49, :166-183, :204-226, :491-507
- Modify: skills/fmea-software/scripts/render.test.ts:195-218, :264, :282-291, :318-327, :399-404, :414-420, :427-435, :632-640, :735, :771, :833-834, :907, :920
- Test: the five test files above

Line numbers are at ed1b9b0. A1 to A9 shift them, so find each site by the quoted text.

**Interfaces:**
- Consumes: the fixture v3 facts as A3 left them: `dependencies` holds `checkout→checkout.payment-gateway` (strong, `"99.95% monthly"`, `"50 rps per merchant"`) and `checkout→pricing` (weak, `"99.9% monthly"`), with no codebase and no link. `MACHINE_RULES` (v3) has 14 ids, the last four being `repo-ref-codebase`, `cause-chain-unlinked`, `cause-chain-severity`, `linked-cause-occurrence-drift`. The `linked-cause-occurrence-drift` drift message `cause ${j} cites ${pid} at O ${v} (${kind}[, ${ref}]); ${pid} now rates O ${v2} (${kind2}[, ${ref2}])` is at `/chains/<i>/ratings/O`. Existing helpers: `loadFixture`, `validateDocument`, `staleComputed`, `buildReportModel`, `renderHtml`, and the local `golden()` (lints.test.ts, validate.test.ts, render.test.ts), `fixture()` (report-model.test.ts), `fired()`, `modelOf()`, `attentionOf()`, `headerOf()`, `sectionOf()`, `indexTable()`.
- The stored validator version. `validate.ts --write` records `PLUGIN_VERSION` from skills/fmea-software/scripts/lib/version.ts as `computed.validator_version`. That value is `"0.4.1"` at ed1b9b0. It would be `"0.5.0"` if this branch has been rebased onto `item-body`, as design §14 assumes may happen. Read version.ts before step 1. Every `0.4.1` in this task stands for that value: if version.ts reads otherwise, write its value in each place instead. `staleComputed` prints the stored version and never compares it with `PLUGIN_VERSION`, so A18's bump to 0.6.0 leaves every one of these pins valid. A later task that regenerates this fixture's `computed` block re-pins them in the same commit.
- Produces: the fixture v3 facts complete for later tasks (A11 to A14, B1, B5):
  - `meta.codebases` = `[{ id: "checkout", name: "Checkout service", repo: "acme/checkout" }, { id: "session-auth", name: "Session authentication library", repo: "acme/session-auth" }]`.
  - `checkout.codebase` = `"checkout"`; `checkout.session-auth.codebase` = `"session-auth"`.
  - Effective codebases, which `effectiveCodebases` gives and the tree-label and root-table pins of step 4 rely on: `checkout`, `checkout.api` and `checkout.order-store` resolve to `checkout`; `checkout.session-auth` resolves to `session-auth`; `checkout.payment-gateway` (third_party) and `pricing` (owned_outside) resolve to none.
  - A third edge `checkout→checkout.order-store` (strong, `"99.99% monthly"`), so `dependencies` has three edges in that order.
  - `ch-9` at `/chains/8`. Sort order `ch-2, ch-1, ch-5, ch-7, ch-9, ch-4, ch-8, ch-6, ch-3`.
  - Nine chains, quality score 89, `validator_version` `"0.4.1"`, and 14 stored lints in this order: index 0 `occurrence-estimate-without-trigger` at `/chains/5/ratings/O`; index 1 the blocker `detection-1-without-evidenced-control` at `/chains/6/ratings/D`; indexes 2 to 12 `rating-provisional` at `/chains/1/ratings/S`, `O`, `D`, `/chains/3/ratings/O`, `D`, `/chains/7/ratings/S`, `O`, `D` and `/chains/8/ratings/S`, `O`, `D`; index 13 `seeded-action-without-incident` at `/chains/7/actions/1`.

- [ ] **Step 1: Pin in schema.test.ts that the golden now reaches the codebase and cited-occurrence nodes, and raise the drift floors**

In `every constrained schema node the golden fixture cannot reach is reached by the derivation document`, the pinned loop over `["/$defs/historyEntry", "/$defs/stale/properties/reason"]` holds exactly those two pointers, as A1 left it. They are the only nodes unreachable from the golden under every version of the plan. Leave that loop as it is and append after it:

```ts
  // From step 3 the golden carries meta.codebases, two element codebases and ch-9's linked cause
  // with its cited_o, so these four are in its reach; derivationDoc() still reaches them too.
  for (const pointer of ["/$defs/codebase", "/$defs/codebase/properties/repo", "/$defs/citedOccurrence", "/$defs/citedOccurrence/properties/evidence_kind"]) {
    assert.ok(!unreached.includes(pointer), `${pointer} is reached by the golden fixture from step 3 on`);
  }
```

In `derivationDoc()`, delete the sentence A1 Step 1 added to the comment above it ("It also sets a codebase entry … until the fixture gains them.") and put this comment above its `meta.codebases`, element `codebase`, `causes[].chain` and `cited_o` additions:

```ts
  // meta.codebases, an element codebase, a linked cause and its cited_o. The golden fixture reaches
  // /$defs/codebase and /$defs/citedOccurrence too from step 3 on; these stay so that the
  // derivation document covers them whatever the golden carries.
```

In `drift: every required list, enum, pattern, format, and minLength in the schema file is enforced`, raise the floor of `derived` by 111 and the floor of `minLengthDerived` by 20, from the values A1 left there. That keeps the file's convention: `derived`'s floor sits 56 under the total, and `minLengthDerived`'s floor equals its total. Append to the two comments: "The enriched golden of step 3 adds 111 derivations: 12 from the two `meta.codebases` entries, 2 from the two element `codebase` ids, 6 from the order-store edge, 70 from `ch-9` and 21 from its three `rating-provisional` findings in `computed`. 20 of them are `minLength` (2 from the codebase names, 12 from `ch-9`, 6 from the findings)." Against the interface's v3 schema, the golden alone gives 1146 derivations (231 `minLength`) at step 1 and 1257 (251) at step 3.

- [ ] **Step 2: Re-pin the golden lint test in lints.test.ts and add the drift scenario**

Replace the comment above the golden pin with "The golden fixture's lint facts. A rule that fires on the golden analysis fails here first, before validate.test.ts." Then make the golden pin, and the new drift test after it, read as follows:

```ts
test("the golden fixture produces exactly the fourteen lints the later tasks assert, none from the four rules of schema v3", () => {
  const doc = loadFixture<FmeaDocument>("checkout-service.fmea.json");
  const lints = runLints(doc);
  assert.equal(lints.length, 14);
  assert.equal(lints.filter((l) => l.severity === "blocker").length, 1);
  for (const rule of ["repo-ref-codebase", "cause-chain-unlinked", "cause-chain-severity", "linked-cause-occurrence-drift"]) {
    assert.deepEqual(lints.filter((l) => l.rule === rule), [], rule);
  }
});

test("linked-cause-occurrence-drift on the golden fixture: ch-1's O raised to 7 gives exactly one finding, at /chains/8/ratings/O", () => {
  const doc = golden();
  assert.deepEqual(fired(doc, "linked-cause-occurrence-drift"), []);
  doc.chains[0].ratings.O.value = 7;
  assert.deepEqual(fired(doc, "linked-cause-occurrence-drift"), [{
    rule: "linked-cause-occurrence-drift", severity: "warning", pointer: "/chains/8/ratings/O",
    message: "cause 0 cites ch-1 at O 6 (observed_incident, INC-2026-0314); ch-1 now rates O 7 (observed_incident, INC-2026-0314)",
  }]);
});
```

`golden()` is the local loader at lints.test.ts:231.

- [ ] **Step 3: Re-pin validate.test.ts and add the fixture-facts test**

Re-pin these values. The only new assertion in the existing tests is the `slice(-3)` line in the first test.
- The first test is retitled `"the golden analysis validates with the fourteen expected lints and a score of 89"`, with `lints.length` 14, `quality_score` 89 and `byRule("rating-provisional").length` 11. It also gains `assert.deepEqual(byRule("rating-provisional").slice(-3), ["/chains/8/ratings/S", "/chains/8/ratings/O", "/chains/8/ratings/D"]);`.
- `an invariant failure still reports lints and a score`: 14 and 89.
- The CLI golden test: 89 and 14.
- The BOM test: 89.
- `--write adds a computed block …`: 89 and 14.
- `--write replaces an existing computed block …`: 89 and 14.
- `a document that already carries computed …`: 89.
- The lower-case `t` and `z` test: 89.
- The `staleComputed … falls short` messages: `"computed.quality_score is 3 but validate.ts now gives 89; run validate.ts --write, then render.ts again"` and `"computed.lints, written by validator 0.4.1, holds 14 findings fewer than validate.ts now finds; run validate.ts --write, then render.ts again"`.
- The `… stored list runs longer` case: pointer `"/computed/lints/14"`, message `"computed.lints, written by validator 0.4.1, holds 1 finding more than validate.ts now finds; run validate.ts --write, then render.ts again"`.

The existing `staleComputed finds nothing in a computed block validate.ts --write would write` test already checks that the stored block matches a fresh run, and step 2's golden lint test checks that none of the four v3 rules fires. So the one new test here pins only the fixture's facts and the stored version. Add it after the first test:

```ts
test("the checkout fixture holds two codebases, three edges from checkout, and ch-9 at /chains/8 linked to ch-1 with ch-1's O as its cited O", () => {
  const doc = golden();
  const metaKeys = Object.keys(doc.meta);
  assert.equal(metaKeys[metaKeys.indexOf("boundary") + 1], "codebases");
  assert.deepEqual(doc.meta.codebases, [
    { id: "checkout", name: "Checkout service", repo: "acme/checkout" },
    { id: "session-auth", name: "Session authentication library", repo: "acme/session-auth" },
  ]);
  assert.deepEqual(doc.elements.map((e) => [e.id, e.codebase ?? null]), [
    ["checkout", "checkout"], ["checkout.api", null], ["checkout.payment-gateway", null],
    ["checkout.order-store", null], ["checkout.session-auth", "session-auth"], ["pricing", null],
  ]);
  for (const i of [0, 4]) { const keys = Object.keys(doc.elements[i]); assert.equal(keys[keys.indexOf("sources") - 1], "codebase"); }
  assert.deepEqual(doc.dependencies, [
    { from: "checkout", to: "checkout.payment-gateway", strength: "strong", sla: "99.95% monthly", limits: "50 rps per merchant" },
    { from: "checkout", to: "pricing", strength: "weak", sla: "99.9% monthly" },
    { from: "checkout", to: "checkout.order-store", strength: "strong", sla: "99.99% monthly" },
  ]);
  const [ch1, ch9] = [doc.chains[0], doc.chains[8]];
  assert.deepEqual([doc.chains.length, ch9.id, ch9.function, ch9.trigger], [9, "ch-9", "fn-checkout-order", undefined]);
  assert.equal(`${ch9.failure_mode}.`, ch1.effects.next_level);
  assert.equal(ch9.effects.end, ch1.effects.end);
  assert.deepEqual(ch9.causes, [{ text: ch1.failure_mode, chain: "ch-1",
    cited_o: { value: ch1.ratings.O.value, evidence_kind: ch1.ratings.O.evidence_kind, evidence_ref: ch1.ratings.O.evidence_ref } }]);
  assert.deepEqual((["S", "O", "D"] as const).map((f) => [ch9.ratings[f].value, ch9.ratings[f].evidence_kind, ch9.ratings[f].review.status]),
    [[9, "estimate", "provisional"], [6, "estimate", "provisional"], [3, "estimate", "provisional"]]);
  assert.deepEqual([ch9.actions, ch9.catalog_refs, ch9.priority], [[], [], { value: "H", table: "priority-fmea-software-v1", rpn: 162 }]);
  assert.equal(doc.computed!.validator_version, "0.4.1");
});
```

This test is the only pin of the checkout fixture's whole edge list from this task on. Search `skills/fmea-software/scripts/` and `tools/` for `"99.9% monthly"`. The one other assertion that deepEquals the checkout fixture's whole `dependencies` array is A3's test "the checkout fixture's edges are its two former blocks, each from checkout" in validate.test.ts (A3 Step 4): delete that test, in this commit, and any other such assertion the search finds. An assertion on a single edge stays.

- [ ] **Step 4: Re-pin report-model.test.ts for ch-9**

- `sortChains, moved to the model, …`: `["ch-2", "ch-1", "ch-5", "ch-7", "ch-9", "ch-4", "ch-8", "ch-6", "ch-3"]`.
- `the tiles for the checkout fixture`:
  - `priorities` H 5, M 4, L 0;
  - `chainsLine: "9 failure chains"`;
  - `ratings: { provisional: 11, total: 30, line: "provisional, in 4 rows" }`;
  - `checks: { blockers: "1 blocker", warnings: "13 warnings", alert: true }`;
  - `actions` unchanged;
  - `qualityScore: 89`.
- The four-groups test is retitled `"… rating-provisional as one group over four rows"`. The `rating-provisional` group becomes `count: 11`, with `{ kind: "row", chainId: "ch-9", labels: [S, O, D] }` appended after ch-8.
- The rows test gains `["ch-9", "checkout", "top", null]` after the ch-7 entry.
- The marks test is retitled `"the fixture's row marks: provisional on ch-2, ch-9, ch-4, ch-8, handoff on ch-5, blocker on ch-7"` and gains `["ch-9", ["provisional"]]` after ch-7.
- `attention: the checkout fixture's block`: `label: "11 ratings not yet reviewed"`, with rows `{ chainId: "ch-2", factors: ["S", "O", "D"] }`, `{ chainId: "ch-9", factors: ["S", "O", "D"] }`, `{ chainId: "ch-4", factors: ["O", "D"] }` and `{ chainId: "ch-8", factors: ["S", "O", "D"] }`, in that order.

- [ ] **Step 5: Re-pin render.test.ts for ch-9**

- In the automated checks test:
  - `Quality score: 89 of 100` in both places;
  - `<code>rating-provisional</code> <span class="muted">×11</span>`;
  - the location line ends `… <a href="#row-ch-8"><code>ch-8</code></a> S, O, D<br><a href="#row-ch-9"><code>ch-9</code></a> S, O, D`.
- The header test's provisional tile (line 264) and the five-tiles test's provisional tile read `11 <small>of 30</small>` and `provisional, in 4 rows`.
- In the five-tiles test:
  - the priority tile reads `H</span>5`, `M</span>4`, `L</span>0` and `9 failure chains`;
  - the checks tile reads `<span class="sub">13 warnings</span>`;
  - the score tile reads `89 <small>of 100</small>`.
- The CLI test (line 735) and the `--force` test (line 771) pin only the big number. Each reads `'<span class="big">11 <small>of 30</small></span>'` and nothing else.
- The Needs-attention item reads `11 ratings not yet reviewed`, with the entries `ch-2 S, O, D`, `ch-9 S, O, D`, `ch-4 O, D` and `ch-8 S, O, D`, in that order, in the existing pin's link markup and with its separator.
- `row marks: …` is retitled `"row marks: one handoff, four provisional rows, no stale row"`, with the provisional count at 4.
- Every sort-order list reads `["ch-2", "ch-1", "ch-5", "ch-7", "ch-9", "ch-4", "ch-8", "ch-6", "ch-3"]`. That covers the sort test and both post_priority asserts. The frame-label list uses the same order for its `Ratings of <id>` entries.
- The COMPUTED_STALE tests:
  - the priority.ts case: `computed.quality_score is 89 but validate.ts now gives 100` and `written by validator 0.4.1, first differs at finding 1: …` (rest unchanged);
  - the reversed-lints case: `written by validator 0.4.1, first differs at finding 0: stored seeded-action-without-incident at /chains/7/actions/1, …` (rest unchanged);
  - the message case: `written by validator 0.4.1, first differs at finding 2: …` (rest unchanged).

- [ ] **Step 6: Run the five files and see them fail**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/schema.test.ts skills/fmea-software/scripts/lints.test.ts skills/fmea-software/scripts/validate.test.ts skills/fmea-software/scripts/report-model.test.ts skills/fmea-software/scripts/render.test.ts`

Expected: a `# fail` count above 0. The failures include:
- `the golden fixture produces exactly the fourteen lints …` (14 against 11);
- `linked-cause-occurrence-drift on the golden fixture …`;
- `the checkout fixture holds two codebases …`;
- `the tiles for the checkout fixture`;
- the schema reach test, which fails on `/$defs/codebase`.

- [ ] **Step 7: Add the codebases, the override and the third edge to checkout-service.fmea.json**

- In `meta`, directly after `boundary`, add `"codebases": [{ "id": "checkout", "name": "Checkout service", "repo": "acme/checkout" }, { "id": "session-auth", "name": "Session authentication library", "repo": "acme/session-auth" }]`.
- On `checkout` (element 0), add `"codebase": "checkout"` after `security_relevant` and before `sources`.
- On `checkout.session-auth` (element 4), add `"codebase": "session-auth"` after `security_rationale` and before `sources`.
- Append `{ "from": "checkout", "to": "checkout.order-store", "strength": "strong", "sla": "99.99% monthly" }` as the third entry of `dependencies`.

Element order and every existing `/chains` index stay as they are.

- [ ] **Step 8: Append ch-9 after ch-8 as /chains/8**

Copy this exactly. Its keys follow ch-1's order, without `trigger`:

```json
{
  "id": "ch-9",
  "function": "fn-checkout-order",
  "failure_mode": "Checkout returns a retryable error to the storefront and the cart is not confirmed",
  "effects": {
    "local": "The checkout request receives no authorization decision within its budget and stops waiting for one.",
    "next_level": "The storefront shows the shopper a retryable error and the cart stays unconfirmed.",
    "end": "Shoppers cannot complete checkout for as long as the gateway stays degraded."
  },
  "causes": [
    {
      "text": "The authorization call exceeds its timeout budget and returns no decision",
      "chain": "ch-1",
      "cited_o": { "value": 6, "evidence_kind": "observed_incident", "evidence_ref": "INC-2026-0314" }
    }
  ],
  "controls": [
    { "kind": "detection", "description": "Latency and error-rate alerting on gateway calls, paging the on-call engineer", "status": "existing", "evidence": { "kind": "observed_incident", "ref": "INC-2026-0314" } }
  ],
  "ratings": {
    "S": { "value": 9, "rationale": "The end effect restates ch-1's, loss of checkout for all shoppers while the gateway is degraded, which the severity anchor places in the top class at majority radius.", "evidence_kind": "estimate", "review": { "status": "provisional" } },
    "O": { "value": 6, "rationale": "The one cause is ch-1's failure mode, so this row's exposure is ch-1's: ch-1 rates O 6 on observed_incident INC-2026-0314.", "evidence_kind": "estimate", "review": { "status": "provisional" } },
    "D": { "value": 3, "rationale": "The gateway latency and error-rate alerting that paged the on-call engineer during INC-2026-0314 catches the cause before shoppers report it, which the detection anchor places near the middle.", "evidence_kind": "estimate", "review": { "status": "provisional" } }
  },
  "actions": [],
  "catalog_refs": [],
  "stale": { "flag": false },
  "history": [],
  "priority": { "value": "H", "table": "priority-fmea-software-v1", "rpn": 162 }
}
```

- [ ] **Step 9: Regenerate the computed block**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node skills/fmea-software/scripts/validate.ts skills/fmea-software/evals/fixtures/checkout-service.fmea.json --write`

Pass:
- exit 0 and nothing on stderr;
- stdout JSON with `"ok": true`, `"quality_score": 89` and 14 lints;
- the written block's `computed.validator_version` equals the value steps 3 and 5 pinned (`"0.4.1"` at ed1b9b0). If it does not, the pins are wrong. Correct them to the written value and do not edit the fixture.

The write re-serialises the whole file as 2-space JSON. Exit 2 means a coded line names the defect, and the file is left unwritten.

- [ ] **Step 10: Check the regenerated block against the stored one**

`git diff -U0 skills/fmea-software/evals/fixtures/checkout-service.fmea.json`

Within `computed`, only these change:
- the three `rating-provisional` entries at `/chains/8/ratings/S`, `O` and `D` are inserted after the `/chains/7/ratings/D` entry and before `seeded-action-without-incident`, which leaves them at indexes 10 to 12;
- `quality_score` goes from 88 to 89;
- `validated_at` changes;
- `validator_version` goes from `"0.1.0"` to `"0.4.1"`.

Outside `computed`, only the additions of steps 7 and 8 appear.

- [ ] **Step 11: Run the five files and see them pass**

Run the step 6 command again. Pass: `# fail 0`.

- [ ] **Step 12: Run both runners**

`bun tools/run-tests.ts` and `bun tools/check.ts`. Both must exit 0, and a runner that dies counts as unverified. In the tools suite, `skill-commands.test.ts` re-scores ch-1's S to 2, which adds a `cause-chain-severity` warning on its temporary copy. That test asserts only exit statuses, so it stays green.

- [ ] **Step 13: Run the browser gate**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node tools/check-browser.ts`. Pass: exit 0 with the lines `## gate: playwright test over chromium (node v…)` and `## not run here: firefox, webkit`, and no `## not asserted` line.

- [ ] **Step 14: Run the comparison, against main and against this commit's parent**

First `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node tools/compare.ts`, which must exit 0. Then `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node tools/compare.ts --base HEAD`, which must also exit 0. The comparison runs on Chromium over six views (320, 375, 768, 1280 and 1920 px, and print). Read `build/compare/summary.md` from the `--base HEAD` run:
- It has `## Changed views: 18`. The 18 lines are the parts `header` (tiles and Needs attention), `index` and `lints`, each at the six views. Each line has the form `- chromium <view> <part>: …`, where `<view>` is a width or `print`.
- `## Parts added` is followed by the one line `- row-ch-9`.
- There is no `## Parts removed` heading and no `## Unverified views` heading.

Open each changed view in `build/compare/changed/` and look at it. A changed count other than 18, or any part other than those three, is a finding.

- [ ] **Step 15: Look at the new row's screenshot**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node tools/shots.ts`. It must exit 0, and its last two lines must be `## shots: <n> files under build/shots/` and `## not run here: firefox, webkit`. Open `build/shots/chromium/<width>/row-05-ch-9.png`, or its `-pN` pieces, at each of the five widths. Each must show:
- the H badge;
- `ch-9` and its failure mode;
- the element `checkout`;
- `S 9 · O 6 · D 3 · RPN 162` and the provisional mark;
- the three effects;
- the cause text;
- the detection control;
- the ratings table with its three rationales;
- nothing clipped, overlapping or past the right edge.

Any departure is a finding.

- [ ] **Step 16: Commit**

```
git add skills/fmea-software/evals/fixtures/checkout-service.fmea.json skills/fmea-software/scripts/schema.test.ts skills/fmea-software/scripts/lints.test.ts skills/fmea-software/scripts/validate.test.ts skills/fmea-software/scripts/report-model.test.ts skills/fmea-software/scripts/render.test.ts
git commit -m "Fixtures: two codebases, the order-store edge and a ninth chain that links to the gateway's timeout" -m "The checkout fixture gains meta.codebases for acme/checkout and
acme/session-auth, with the session component overriding its parent's
codebase, and the strong edge from checkout to its order store. ch-9
is appended at /chains/8 on checkout's function. Its one cause is
ch-1's failure mode, linked to ch-1 with ch-1's O as its cited O, and
its provisional ratings are S 9, O 6 and D 3. The computed block is
regenerated: fourteen lints, eleven of them rating-provisional, and a
score of 89. None of the four lints of schema v3 fires on it. The
pinned counts, orders and messages move with it, the drift floors rise
by what the fixture adds, and a lint test pins the drift scenario on
ch-9."
```

If step 3's search deleted an edge-list pin outside these six files, add that file to the `git add` line. The commit carries no Co-Authored-By, Generated-with or session trailer.


### Task A11: The report model: roots, edges, codebases, sections and cause links

**Files:**
- Modify: skills/fmea-software/scripts/lib/report-model.ts:5-8, 40-53, 77-85, 273-281, 304-325, 409-430 (ed1b9b0 numbering; locate by the anchor text quoted in each step)
- Modify: skills/fmea-software/scripts/report-model.test.ts:1-8 (imports), then new tests appended at the end of the file
- Test: skills/fmea-software/scripts/report-model.test.ts

**Interfaces:**
- Consumes: from `lib/graph.ts` (A4): `indexDocument(doc): DocIndex` with `DocIndex.fn` and `DocIndex.element`; `chainElement(doc, index, chain): number | undefined`; `resolvedLinks(doc, index): ResolvedLink[]` with `ResolvedLink { chain; cause; provider }`; `effectiveCodebases(doc, index): (Codebase | undefined)[]`; `rootOf(doc, index, el): number | undefined`; `sameTrimmed(a, b): boolean`; `triggerRestates(chain, text): boolean`. From `test-helpers.ts` (A4): `graphDoc(spec)` and `edge(from, to, strength?, extra?)`. The v3 checkout fixture (A10): codebases `checkout` "Checkout service" `acme/checkout` and `session-auth` "Session authentication library" `acme/session-auth`, three edges, and `ch-9` at `/chains/8` linked to `ch-1`.
- Produces (exact, `lib/report-model.ts`):
  - `export interface CauseLink { cause: number; chainId: string; element: string; failureMode: string; differs: boolean }`
  - `export interface Propagation { chainId: string; element: string }`
  - `export interface RootRow { id: string; name: string; codebase: string | null; chains: number; top: { value: string; count: number }; provisional: number; openActions: number }`
  - `export interface GroupSection { root: { id: string; name: string } | null; rows: RowModel[] }`
  - `RowModel` gains `causeLinks: CauseLink[]; propagatesTo: Propagation[];`
  - `ReportModel` gains `codebases: Codebase[]; roots: RootRow[]; edges: DependencyEdge[]; sections: GroupSection[]; treeLabels: (string | null)[];`

- [ ] **Step 1: Write the failing tests.** Append to `report-model.test.ts`. Widen the imports to `import { clone, edge, graphDoc, loadFixture, minimalDoc, rating, withoutTracker } from "./test-helpers.ts";` and add `Codebase` to the `import type` line from `./lib/types.ts`. Add these module-level declarations above the new tests:

```ts
const cb = (id: string): Codebase => ({ id, name: `${id} codebase`, repo: `acme/${id}` });
function chainOf(doc: FmeaDocument, id: string): Chain {
  const chain = doc.chains.find((c) => c.id === id);
  assert.ok(chain, `no chain ${id}`);
  return chain;
}
const CH1_MODE = "The authorization call exceeds its timeout budget and returns no decision";
```

Add the tests below:

```ts
test("roots: the checkout fixture's two top-level elements, every count rolling up the subtree", () => {
  assert.deepEqual(modelOf(fixture()).roots, [
    { id: "checkout", name: "Checkout service", codebase: "Checkout service", chains: 8, top: { value: "H", count: 5 }, provisional: 4, openActions: 7 },
    { id: "pricing", name: "Pricing service", codebase: "owned outside", chains: 1, top: { value: "H", count: 0 }, provisional: 0, openActions: 1 },
  ]);
});

test("roots: ordered by the best priority rank in the subtree, ties by id, an out-of-vocabulary value after L, chainless roots last by id", () => {
  const doc = graphDoc({
    elements: ["e", "c", "b", "a", "a.x", "x", "y", "d"],
    chains: [["ch-a", "a"], ["ch-ax", "a.x"], ["ch-b", "b"], ["ch-c", "c"], ["ch-x", "x"], ["ch-y", "y"]],
  });
  chainOf(doc, "ch-ax").priority.value = "H";
  chainOf(doc, "ch-x").priority.value = "Z";
  chainOf(doc, "ch-y").priority.value = "L";
  assert.deepEqual(modelOf(doc).roots.map((r) => [r.id, r.chains, r.top.count]), [
    ["a", 2, 1], ["b", 1, 0], ["c", 1, 0], ["y", 1, 0], ["x", 1, 0], ["d", 0, 0], ["e", 0, 0],
  ]);
});

test("roots: two top-level elements sharing an id give one row and one section, for the first", () => {
  const model = modelOf(graphDoc({ elements: ["a", { id: "a", name: "second" }], chains: [["ch-1", "a"]] }));
  assert.deepEqual(model.roots.map((r) => [r.id, r.name, r.chains]), [["a", "a", 1]]);
  assert.deepEqual(model.sections.map((s) => s.root), [{ id: "a", name: "a" }]);
});

test("sections: one per root with chains in the roots' order, rows in index order, then the rootless tail", () => {
  assert.deepEqual(modelOf(fixture()).sections.map((s) => [s.root?.id ?? null, s.rows.map((r) => r.chain.id)]), [
    ["checkout", ["ch-2", "ch-1", "ch-5", "ch-7", "ch-9", "ch-4", "ch-8", "ch-6"]],
    ["pricing", ["ch-3"]],
  ]);
  const doc = graphDoc({
    elements: ["a", "b.c", { id: "m", parent: "n" }, { id: "n", parent: "m" }],
    chains: [["ch-1", "a"], ["ch-2", "b.c"], ["ch-3", "m"], ["ch-4", "a"]],
  });
  chainOf(doc, "ch-4").function = "fn-missing";
  assert.deepEqual(modelOf(doc).sections.map((s) => [s.root?.id ?? null, s.rows.map((r) => r.chain.id)]), [
    ["a", ["ch-1"]],
    [null, ["ch-2", "ch-3", "ch-4"]],
  ]);
});

test("codebases: overrides, an outside element that never inherits, in-scope children under it inheriting nothing, and a codebase that names no entry", () => {
  const doc = graphDoc({
    elements: [
      { id: "r", codebase: "main" },
      { id: "r.lib", codebase: "lib" },
      "r.lib.util",
      { id: "r.gw", boundary: "third_party" },
      "r.gw.adapter",
      { id: "r.ext", boundary: "owned_outside", codebase: "ext" },
      "r.ext.adapter",
      { id: "r.ext.own", codebase: "own" },
      "r.ext.own.kid",
      { id: "solo", codebase: "missing" },
      "solo.kid",
      { id: "vendor", boundary: "third_party" },
      { id: "partner", boundary: "owned_outside" },
      { id: "platform", boundary: "owned_outside", codebase: "ext" },
    ],
  });
  doc.meta.codebases = ["main", "lib", "ext", "own"].map(cb);
  const model = modelOf(doc);
  assert.deepEqual(model.codebases, doc.meta.codebases);
  assert.deepEqual(model.treeLabels, [
    "main codebase", "lib codebase", "lib codebase", null, "none", "ext codebase", "none",
    "own codebase", "own codebase", "none", "none", null, null, "ext codebase",
  ]);
  assert.deepEqual(model.roots.map((r) => [r.id, r.codebase]), [
    ["partner", "owned outside"], ["platform", "ext codebase"], ["r", "main codebase"], ["solo", "none"], ["vendor", "third party"],
  ]);
});

test("codebases: a document without meta.codebases has no codebase text on a root or a tree line", () => {
  const model = modelOf(graphDoc({ elements: ["a", { id: "a.gw", boundary: "third_party" }, { id: "b", boundary: "owned_outside" }] }));
  assert.deepEqual(model.codebases, []);
  assert.deepEqual(model.treeLabels, [null, null, null]);
  assert.deepEqual(model.roots.map((r) => r.codebase), [null, null]);
});

test("roots: the provisional count counts chains, not ratings, post-action ratings included, and open actions follow isOpen", () => {
  const doc = graphDoc({ elements: ["a"], chains: [["ch-1", "a"], ["ch-2", "a"], ["ch-3", "a"]] });
  chainOf(doc, "ch-1").ratings = { S: rating(8, "provisional"), O: rating(3, "provisional"), D: rating(4, "provisional") };
  chainOf(doc, "ch-2").post_ratings = { S: rating(8), O: rating(3, "provisional"), D: rating(4) };
  chainOf(doc, "ch-3").actions = [action("act-1", "Open", "2026-10-01"), action("act-2", "Completed", "2026-10-02"),
    action("act-3", "Not Implemented", "2026-10-03"), action("act-4", "Implementation pending", "2026-10-04")];
  assert.deepEqual(modelOf(doc).roots.map((r) => [r.provisional, r.openActions]), [[2, 2]]);
});

test("roots: the top count is taken against the first value of the table the report is rendered with", () => {
  assert.deepEqual(buildReportModel(fixture(), withVocabulary(["M", "H", "L"])).roots.map((r) => [r.id, r.top]), [
    ["checkout", { value: "M", count: 3 }],
    ["pricing", { value: "M", count: 1 }],
  ]);
});

test("edges: every edge in document order, two consumers of one provider at different strengths included", () => {
  const doc = graphDoc({ elements: ["a", "b", "p"], edges: [edge("b", "p", "weak", { sla: "99.9% monthly" }), edge("a", "p", "strong", { limits: "10 rps" })] });
  const model = modelOf(doc);
  assert.deepEqual(model.edges, doc.dependencies);
  assert.deepEqual(model.edges.map((e) => [e.from, e.to, e.strength]), [["b", "p", "weak"], ["a", "p", "strong"]]);
  assert.deepEqual(modelOf(fixture()).edges.map((e) => [e.from, e.to, e.strength]), [
    ["checkout", "checkout.payment-gateway", "strong"], ["checkout", "pricing", "weak"], ["checkout", "checkout.order-store", "strong"],
  ]);
});

test("cause links: one per resolved link that is not a self-link, the mode flagged when it differs from the cause text under trimming", () => {
  const golden = modelOf(fixture());
  assert.deepEqual(rowById(golden, "ch-9").causeLinks, [{ cause: 0, chainId: "ch-1", element: "checkout.payment-gateway", failureMode: CH1_MODE, differs: false }]);
  assert.deepEqual(golden.rows.filter((r) => r.chain.id !== "ch-9").map((r) => r.causeLinks), golden.rows.slice(1).map(() => []));
  const doc = graphDoc({ elements: ["p", "a"], chains: [["ch-p", "p"], ["ch-a", "a"]], links: [["ch-a", "ch-p"]] });
  chainOf(doc, "ch-a").causes.push({ text: "x", chain: "ch-missing" }, { text: "y", chain: "ch-a" });
  assert.deepEqual(rowById(modelOf(doc), "ch-a").causeLinks, [{ cause: 0, chainId: "ch-p", element: "p", failureMode: "stops serving", differs: true }]);
  chainOf(doc, "ch-a").causes[0].text = "  stops serving ";
  chainOf(doc, "ch-p").function = "fn-missing";
  assert.deepEqual(rowById(modelOf(doc), "ch-a").causeLinks, [{ cause: 0, chainId: "ch-p", element: "", failureMode: "stops serving", differs: false }]);
});

test("propagates to: each consumer once, in index order, on the first chain of the provider's id only", () => {
  assert.deepEqual(rowById(modelOf(fixture()), "ch-1").propagatesTo, [{ chainId: "ch-9", element: "checkout" }]);
  const doc = graphDoc({ elements: ["p", "a", "b", "c"], chains: [["ch-p", "p"], ["ch-b", "b"], ["ch-a", "a"], ["ch-c", "c"]], links: [["ch-b", "ch-p"], ["ch-a", "ch-p"]] });
  chainOf(doc, "ch-a").causes.push({ text: "a second cause", chain: "ch-p" });
  chainOf(doc, "ch-c").causes[0].chain = "ch-p";
  chainOf(doc, "ch-c").function = "fn-missing";
  const fnB = doc.functions.find((f) => f.id === "fn-b");
  assert.ok(fnB);
  fnB.element = "ghost";
  doc.chains.push(clone(chainOf(doc, "ch-p")));
  const model = modelOf(doc);
  assert.deepEqual(model.rows.filter((r) => r.chain.id === "ch-p").map((r) => r.propagatesTo), [
    [{ chainId: "ch-a", element: "a" }, { chainId: "ch-b", element: "ghost" }, { chainId: "ch-c", element: "" }],
    [],
  ]);
});
```

- [ ] **Step 2: Run the file and see the new tests fail.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/report-model.test.ts` (in fish: `nvm use 24; node --test skills/fmea-software/scripts/report-model.test.ts`). Expected: each of the eleven new tests fails, with a TypeError or an AssertionError, because `roots`, `sections`, `treeLabels`, `edges`, `codebases`, `causeLinks` or `propagatesTo` is undefined. Every earlier test passes.

- [ ] **Step 3: Add the types.** In `lib/report-model.ts`, extend the type import to `import type { Action, Chain, Codebase, DependencyEdge, Element, Factor, FmeaDocument, Ratings, Severity, Stale, StaleReason } from "./types.ts";`. Import `chainElement, effectiveCodebases, indexDocument, resolvedLinks, rootOf, sameTrimmed, triggerRestates` from `./graph.ts`, and `DocIndex` and `ResolvedLink` with `import type`. The existing `import { chainIndex } from "./pointer.ts";` stays, and no new parameter or local is named `chainIndex`. Add `CauseLink`, `Propagation`, `RootRow` and `GroupSection` exactly as in Interfaces. Add `causeLinks` and `propagatesTo` to `RowModel` after `staleNotice`, each with a one-line comment saying that `element` is "" only when the chain's function does not resolve. Add the five `ReportModel` fields after `attention`, with comments saying that `codebases` is `meta.codebases ?? []`, `roots` is in table order, `sections` is in the roots' order with the rootless tail last and present only when it has rows, and `treeLabels` is indexed by element position, null meaning print nothing.

- [ ] **Step 4: Rewrite `triggerMatch` on the graph helpers.** Keep the signature `function triggerMatch(chain: Chain): { trigger: string | null; triggerCauses: number[] }`. `triggerCauses` holds the indexes `i` where `triggerRestates(chain, chain.causes[i].text)`. `trigger` is the trimmed trigger when it is non-empty and `triggerCauses` is empty, else null. No local `.trim() ===` comparison remains. The existing trigger tests ("trigger: the fixture's ch-2 trigger …" and "trigger: equal to two causes after trimming …") pin the behaviour as unchanged.

- [ ] **Step 5: Build the links into the rows.** Every new parameter that carries the `DocIndex` is named `docIndex`, never `index`, because `buildRows` already declares `const index = doc.chains.indexOf(chain)` inside its map callback and keeps it.
  - `buildRows(doc: FmeaDocument, table: PriorityTable, located: Located[], docIndex: DocIndex, links: ResolvedLink[]): RowModel[]` gains the index and the `resolvedLinks` result.
  - Add the private `elementIdOf(doc: FmeaDocument, docIndex: DocIndex, chain: Chain): string`. It reads the chain's function through `docIndex.fn` and returns that function's `element`, or "". `buildRows` uses it for `row.element`, and reads `statement` through the same `docIndex.fn` lookup, which keeps the first-occurrence rule.
  - `causeLinks` comes from the private `causeLinksOf(doc: FmeaDocument, docIndex: DocIndex, links: ResolvedLink[], at: number): CauseLink[]`. It takes the links with `l.chain === at`, in cause order. Each gets `failureMode` set to the provider's `failure_mode` as stored, and `differs = !sameTrimmed(cause.text, provider.failure_mode)`. `buildRows` passes its local `index` as `at`. A self-link, a cause whose `chain` is its own chain's id, is not in `resolvedLinks` (A4), so it prints as an unresolved link does, the cause text alone, and it yields no `propagatesTo` entry: the invariant `cause-chain-self` refuses it, and a row pointing at itself would only link back to its own row (decision 13).
  - `propagatesTo` is filled after the rows exist, by the private `propagationsOf(rows: RowModel[], doc: FmeaDocument, docIndex: DocIndex, links: ResolvedLink[]): void`. For each row, it walks the rows in index order and keeps every consumer whose chain position links into this row's chain position. Each consumer is kept once, so a consumer that links twice is named once. Its `element` comes from `elementIdOf`. Rows are found by `doc.chains.indexOf(row.chain)`, as they are today.

- [ ] **Step 6: Build roots, sections, codebases and tree labels.** Write one private helper per output, each within fallow's limits (cyclomatic 20, cognitive 15):
  - `chainRoots(doc: FmeaDocument, docIndex: DocIndex): (number | undefined)[]`: for each chain position, `rootOf(doc, docIndex, chainElement(doc, docIndex, i))` when `chainElement` gives an element position, else undefined.
  - `rootIndexes(doc: FmeaDocument, docIndex: DocIndex): number[]`: the positions of the elements with `parent === null` whose position is the first occurrence of their id (`docIndex.element.get(el.id) === i`).
  - `codebaseText(doc: FmeaDocument, el: Element, effective: Codebase | undefined, root: boolean): string | null`:
    - null when `meta.codebases` is absent or empty;
    - otherwise the effective codebase's `name` when there is one;
    - otherwise "none" for an `in_scope` element;
    - otherwise, for an outside element, `el.boundary.replaceAll("_", " ")` when `root` is true, and null when it is false.
  - The private `interface OrderedRoot { at: number; row: RootRow }`, where `at` is the root's element position.
  - `rootRows(doc: FmeaDocument, table: PriorityTable, chainRootOf: (number | undefined)[], roots: number[], effective: (Codebase | undefined)[]): OrderedRoot[]`. Each root's chains are the chains with `chainRootOf[i] === at`.
    - `codebase` is `codebaseText(doc, el, effective[at], true)`.
    - `top.value` is `table.vocabulary[0]`, and `top.count` counts the chains whose `priority.value` equals it.
    - `provisional` counts the chains with `provisionalCount(chain) > 0`.
    - `openActions` counts the actions that pass `isOpen`.
    - Order: first the roots with chains, by the smallest `vocabularyRank(table, chain.priority.value)` over their chains, then by id with byte comparison. The roots with no chains follow, by id. If the counting takes `rootRows` past a limit, move it into a private `rollUp(chains: Chain[], top: string)`.
  - `buildSections(rows: RowModel[], doc: FmeaDocument, chainRootOf: (number | undefined)[], ordered: OrderedRoot[]): GroupSection[]`:
    - one entry per ordered root with `row.chains > 0`, in that order, with `root: { id: row.id, name: row.name }` and the rows whose chain position `p` has `chainRootOf[p] === at`, in index order;
    - then `{ root: null, rows }` for the rows whose chain reaches no root, only when there is at least one.
  - `treeLabels`: `doc.elements.map((el, i) => codebaseText(doc, el, effective[i], false))`.

  In `buildReportModel`:
  - Call `indexDocument`, `resolvedLinks`, `effectiveCodebases`, `chainRoots`, `rootIndexes` and `rootRows` once each, and pass the results down.
  - Return `roots: ordered.map((o) => o.row)`, `sections`, `treeLabels`, `codebases: doc.meta.codebases ?? []` and `edges: doc.dependencies` beside the existing fields.

- [ ] **Step 7: Run the file and see it pass.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/report-model.test.ts`. Expected: `# fail 0`.

- [ ] **Step 8: Run both runners.** `node tools/run-tests.ts` and `node tools/check.ts` (in the zsh tool shell: `bun tools/run-tests.ts` and `bun tools/check.ts`). Both exit 0. A fallow complexity or duplication finding means a helper is split further, never that a threshold is relaxed. A copy of the parent walk or of the trimmed-text rule outside `lib/graph.ts` is a finding.

- [ ] **Step 9: Run the browser checks and expect no change.** After the two commands below, `node tools/compare.ts` against the branch point also exits 0; read its summary, which shows only what earlier commits changed. `node tools/check-browser.ts` exits 0 with no `## not asserted` line. `node tools/compare.ts --base HEAD` exits 0 and prints, as its next-to-last line, `## compare: no view of <N> changed against <short>: the two reports are byte for byte the same, so none was photographed` (the last line names the engines not run). Nothing renders the new fields yet, so any changed view is a finding.

- [ ] **Step 10: Commit.** Add no attribution trailer of any kind.

```
git add skills/fmea-software/scripts/lib/report-model.ts skills/fmea-software/scripts/report-model.test.ts
git commit -m "Report model: top-level roll-ups, edges, codebases, group sections and cause links" -m "The model gains the roots with their subtree roll-ups, the edges, the codebases, the group sections with the rootless tail, the tree's codebase labels, and each row's cause links and Propagates to entries. Every derivation reads the shared index and walk of lib/graph.ts, and the trigger match now uses its trimmed-text helpers. Nothing renders the new fields yet."
```

### Task A12: Group sections, h4 row headings, cause links and Propagates to

**Files:**
- Modify: skills/fmea-software/scripts/render.ts:3-14 (imports), 78-80 (`rowLinkHtml`), 247-255 (`rowHeaderHtml`), 270-278 (`causesHtml`), 322-336 (`gridHtml`), 344-348 (`chainsHtml`) (ed1b9b0 numbering)
- Modify: skills/fmea-software/assets/report-template.html:100 (`article.row > header h3`), 101 (`article.row > header .meta`), 137 (the narrow-width `h3` rule). These are ed1b9b0 numbers. A3 removes the `.el-facts` lines 36-38 and 134, which moves them to 97, 98 and 133, so locate them by anchor text.
- Modify: skills/fmea-software/scripts/render.test.ts:14 (the `./test-helpers.ts` import), 522, 584-611, 687-702, 1168-1181, plus new tests
- Test: skills/fmea-software/scripts/render.test.ts

**Interfaces:**
- Consumes: the A11 report-model additions `ReportModel.sections: GroupSection[]`, `RowModel.causeLinks: CauseLink[]` and `RowModel.propagatesTo: Propagation[]`; `graphDoc` from `test-helpers.ts` (A4).
- Produces (render markup, `render.ts`):
  - `function chainRefHtml(chainId: string, element: string): string` returning `` `<a href="#row-${e(chainId)}"><code>${e(chainId)}</code>${element === "" ? "" : ` on <code>${e(element)}</code>`}</a>` ``. `rowLinkHtml(chainId)` becomes `return chainRefHtml(chainId, "");`, so one builder makes the anchor.
  - group section: `` `<section class="group" id="group-${e(root.id)}"><h3>${e(root.name)} <code>${e(root.id)}</code></h3>${rows}</section>` ``, with the tail rows after the last group and no wrapper
  - row header `<h4>`
  - cause: `` `${e(c.text)} <span class="cause-link">the failure mode of ${chainRefHtml(link.chainId, link.element)}${link.differs ? `: ${e(link.failureMode)}` : ""}</span>` ``, placed before the origin, adversarial and trigger marks
  - `part("Propagates to", refs.join(", "))` after Effects, only when `propagatesTo` is non-empty
- Produces (template rules): `article.row > header h4 { flex:1; font-size:1.05rem; margin:0; }`; in the narrow block `article.row > header h4 { flex-basis:calc(100% - 2.5rem); }`; `section.group > h3 { margin:2rem 0 .5rem; }`.
- Produces (module-level test builders in `render.test.ts`, for A13):
  - `const twinRoots = (): FmeaDocument`: `graphDoc` with two top-level `svc` elements and `ch-1` on `svc`.
  - `function idleRoot(): FmeaDocument`: `minimalDoc` with a second top-level element `idle` that has no chain.

- [ ] **Step 1: Move the heading pins to h4.** In `render.test.ts`:
  - At line 522, the `everyPart` header pin becomes `` `<header><span class="pri pri-mid">M</span><h4><code>ch-1</code>&nbsp; stops serving</h4><div class="meta">…` ``, with the rest unchanged.
  - Line 595 becomes `assert.ok(both.includes("second</h4>"));`.
  - Lines 605 and 610 end in `</span><h4>` in place of `</span><h3>`.
  - In the print test (687-702), keep `"h2, h3, article.row > header { break-after: avoid; }"` and add `assert.ok(!print.includes(".group"), "no group rule in the print block");`.

- [ ] **Step 2: Write the new failing tests.** Add `graphDoc` to the `./test-helpers.ts` import at line 14. Add these constants, builders and tests:

```ts
const CH1_MODE = "The authorization call exceeds its timeout budget and returns no decision";
const LINK_TO_CH1 = '<span class="cause-link">the failure mode of <a href="#row-ch-1"><code>ch-1</code> on <code>checkout.payment-gateway</code></a>';

// Two top-level elements sharing one id: one group section, for the first.
const twinRoots = (): FmeaDocument => graphDoc({ elements: ["svc", { id: "svc", name: "Twin" }], chains: [["ch-1", "svc"]] });

// minimalDoc with a second top-level element that has no chain.
function idleRoot(): FmeaDocument {
  const doc = minimalDoc();
  doc.elements.push({ ...doc.elements[0], id: "idle", name: "Idle" });
  return doc;
}

test("group sections: one per top-level element with chains, each an h3 with name and id, then its rows in index order", () => {
  const chains = sectionOf(renderHtml(golden(), table, template, vocabulary), "chains", "actions");
  assert.equal(occurrences(chains, '<section class="group"'), 2);
  assert.ok(chains.includes('<section class="group" id="group-checkout"><h3>Checkout service <code>checkout</code></h3><article class="row" id="row-ch-2">'));
  assert.ok(chains.includes('</article></section><section class="group" id="group-pricing"><h3>Pricing service <code>pricing</code></h3><article class="row" id="row-ch-3">'));
  const at = ["group-checkout", "row-ch-2", "row-ch-1", "row-ch-5", "row-ch-7", "row-ch-9", "row-ch-4", "row-ch-8", "row-ch-6", "group-pricing", "row-ch-3"]
    .map((id) => chains.indexOf(`id="${id}"`));
  assert.ok(at.every((i) => i !== -1), JSON.stringify(at));
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  assert.equal(occurrences(chains, "<h4>"), golden().chains.length);
});

test("a top-level element with no chains gets no group section, and chains that reach no root follow the last group with no heading", () => {
  const doc = idleRoot();
  doc.chains.push({ ...doc.chains[0], id: "ch-2", function: "fn-missing" });
  const chains = sectionOf(renderHtml(doc, table, template, vocabulary), "chains", "actions");
  assert.equal(occurrences(chains, 'id="group-idle"'), 0);
  assert.equal(occurrences(chains, '<section class="group"'), 1);
  assert.ok(chains.includes('</article></section><article class="row" id="row-ch-2">'), "the tail row follows the group, unwrapped");
});

test("the row anchors are unchanged: one article per chain, each the target of its index link", () => {
  const doc = golden();
  const html = renderHtml(doc, table, template, vocabulary);
  for (const chain of doc.chains) {
    assert.equal(occurrences(html, `<article class="row" id="row-${chain.id}">`), 1, chain.id);
    assert.ok(indexTable(html).includes(`<a href="#row-${chain.id}"><code>${chain.id}</code></a>`), chain.id);
  }
});

test("the template sets the row heading in h4 with no margin and spaces the group heading", () => {
  for (const rule of [
    "article.row > header h4 { flex:1; font-size:1.05rem; margin:0; }",
    "  article.row > header h4 { flex-basis:calc(100% - 2.5rem); }",
    "section.group > h3 { margin:2rem 0 .5rem; }",
  ]) assert.ok(template.includes(rule), rule);
  assert.ok(!template.includes("article.row > header h3"), "a rule still targets the old row heading");
});

test("a linked cause names the provider's row and element, and adds the provider's mode only when it differs", () => {
  const html = renderHtml(golden(), table, template, vocabulary);
  assert.ok(rowSection(html, "ch-9").includes(`<li>${CH1_MODE} ${LINK_TO_CH1}</span></li>`));
  const doc = golden();
  doc.chains[8].causes[0].text = "The gateway call times out";
  doc.chains[8].causes[0].origin = "design";
  assert.ok(rowSection(renderHtml(doc, table, template, vocabulary), "ch-9").includes(
    `<li>The gateway call times out ${LINK_TO_CH1}: ${CH1_MODE}</span> <span class="muted">[design]</span></li>`));
});

test("a link whose chain does not resolve prints the cause text alone, and a provider without a function is named by its chain id", () => {
  const lost = golden();
  lost.chains[8].causes[0].chain = "ch-missing";
  const row = rowSection(renderHtml(lost, table, template, vocabulary), "ch-9");
  assert.ok(row.includes(`<li>${CH1_MODE}</li>`));
  assert.ok(!row.includes("cause-link"));
  const bare = golden();
  bare.chains[0].function = "fn-missing";
  assert.ok(rowSection(renderHtml(bare, table, template, vocabulary), "ch-9").includes('<a href="#row-ch-1"><code>ch-1</code></a></span></li>'));
});

test("a row that other chains link into prints Propagates to after its effects, each consumer once in index order", () => {
  const html = renderHtml(golden(), table, template, vocabulary);
  const ch1 = rowSection(html, "ch-1");
  const line = '<div><span class="lbl">Propagates to</span><a href="#row-ch-9"><code>ch-9</code> on <code>checkout</code></a></div>';
  assert.ok(ch1.includes(line));
  assert.ok(ch1.indexOf('<span class="lbl">Effects</span>') < ch1.indexOf(line) && ch1.indexOf(line) < ch1.indexOf('<span class="lbl">Trigger</span>'));
  assert.ok(!rowSection(html, "ch-9").includes("Propagates to"));
  const doc = golden();
  doc.chains.push({ ...doc.chains[8], id: "ch-10" });
  assert.ok(rowSection(renderHtml(doc, table, template, vocabulary), "ch-1").includes(
    '<span class="lbl">Propagates to</span><a href="#row-ch-10"><code>ch-10</code> on <code>checkout</code></a>, <a href="#row-ch-9"><code>ch-9</code> on <code>checkout</code></a></div>'));
});

test("free text and a chain id holding markup are escaped in the cause link and in Propagates to", () => {
  const [text, mode, id] = vectors;
  assert.equal(new Set([text, mode, id]).size, 3);
  const doc = golden();
  doc.chains[8].causes[0].text = text;
  doc.chains[0].failure_mode = mode;
  doc.chains[8].id = id;
  const html = renderHtml(doc, table, template, vocabulary);
  for (const vector of [text, mode, id]) assert.ok(!html.includes(vector), `raw vector present: ${JSON.stringify(vector)}`);
  assert.ok(rowSection(html, "ch-1").includes(`<a href="#row-${escapeHtml(id)}"><code>${escapeHtml(id)}</code> on <code>checkout</code></a>`));
  assert.ok(rowSection(html, escapeHtml(id)).includes(`${escapeHtml(text)} ${LINK_TO_CH1}: ${escapeHtml(mode)}</span>`));
});

test("a linked-cause-occurrence-drift finding on ch-9 renders on its row labelled O", () => {
  const message = "cause 0 cites ch-1 at O 6 (observed_incident, INC-2026-0314); ch-1 now rates O 7 (observed_incident, INC-2026-0314)";
  const doc = withComputed(golden(), [lint("warning", "linked-cause-occurrence-drift", "/chains/8/ratings/O", message)], 89);
  assert.ok(rowSection(renderHtml(doc, table, template, vocabulary), "ch-9").includes(
    `<p class="finding warn">${mark("warning")} &nbsp;O &mdash; ${escapeHtml(message)} <span class="muted"><code>linked-cause-occurrence-drift</code></span></p>`));
});
```

Extend the href test at 1168-1181. Its doc list becomes `[golden(), staleRows(), twinRoots()]`, and it gains `assert.equal(occurrences(renderHtml(twinRoots(), table, template, vocabulary), 'id="group-svc"'), 1);`.

- [ ] **Step 3: Run the file and see it fail.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/render.test.ts`.
  - Expected to fail: the four h4 re-pins of Step 1 (the `everyPart` test, the no-function test and the supplied-table test); the group-section, no-chains/tail, template-rule, linked-cause, unresolved-link, Propagates-to and escaping tests; and the href test, through its `group-svc` assertion.
  - Expected to pass both before and after the change, kept as regression pins: the print test with its new no-`.group` assertion, "the row anchors are unchanged …", and "a linked-cause-occurrence-drift finding …", which needs no renderer change (§12).
  - Every other test passes.

- [ ] **Step 4: Render the groups, the h4 headings, the cause links and Propagates to.** In `render.ts`:
  - Add `GroupSection` to the `import type` from `./lib/report-model.ts`.
  - Add `chainRefHtml` beside `rowLinkHtml`, exactly as in Interfaces, and make `rowLinkHtml(chainId)` return `chainRefHtml(chainId, "")`.
  - `rowHeaderHtml` emits `<h4>…</h4>` in place of `<h3>…</h3>`.
  - `causesHtml` looks up `row.causeLinks.find((l) => l.cause === i)`. When it finds one, it appends the cause-link span of Interfaces after `e(c.text)` and before the origin.
  - `gridHtml` inserts `row.propagatesTo.length === 0 ? "" : part("Propagates to", row.propagatesTo.map((p) => chainRefHtml(p.chainId, p.element)).join(", "))` directly after `part("Effects", effectsHtml(c))`.
  - Add the private `groupHtml(section: GroupSection, trackers: Map<Action, ActionRow["tracker"]>): string`. It returns the wrapped markup of Interfaces, with the rows built by `rowSectionHtml`, when `section.root` is set, and the bare joined rows otherwise.
  - `chainsHtml` returns `keyHtml(model.vocabulary) + indexHtml(model.rows) + model.sections.map((s) => groupHtml(s, trackers)).join("")`. "No chains." stays for no rows.

- [ ] **Step 5: Change the template rules.** In `report-template.html`:
  - Replace `article.row > header h3 { flex:1; font-size:1.05rem; }` with `article.row > header h4 { flex:1; font-size:1.05rem; margin:0; }`.
  - Add `section.group > h3 { margin:2rem 0 .5rem; }` on the line after `article.row > header .meta { white-space:nowrap; font-size:.9rem; text-align:right; }`.
  - In the `@media (max-width: 767px)` block, replace `article.row > header h3 { flex-basis:calc(100% - 2.5rem); }` with `article.row > header h4 { flex-basis:calc(100% - 2.5rem); }`.
  - Add no `@media`, no `overflow-wrap`, and nothing to the print block.

- [ ] **Step 6: Run the file and see it pass.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/render.test.ts`. Expected: `# fail 0`.

- [ ] **Step 7: Run both runners.** `node tools/run-tests.ts` and `node tools/check.ts` (or `bun tools/run-tests.ts` and `bun tools/check.ts`). Both exit 0. `check-browser.test.ts` still finds one `@media (max-width: 767px)`, and the overflow-wrap test still counts two outside it.

- [ ] **Step 8: Run the browser gate and the comparison, and read every changed view.**
  - `node tools/check-browser.ts` exits 0 at every width and in print, with no `## not asserted` line.
  - `node tools/compare.ts --base HEAD` exits 0. The summary lists no part added or removed, because the group sections become parts only in A14. The changed views are `row-ch-1` (Propagates to) and `row-ch-9` (the cause link), at every width and in print. Open the before, after and difference images of each.
  - `node tools/compare.ts` against the branch point exits 0. Read its summary.
  - Any other changed view is a finding to explain or fix before the commit. One example is a row whose heading moved with the h4 change.
  - `node tools/compare.ts` against `main` also exits 0. Read its summary.

- [ ] **Step 9: Commit.** Add no attribution trailer of any kind.

```
git add skills/fmea-software/scripts/render.ts skills/fmea-software/assets/report-template.html skills/fmea-software/scripts/render.test.ts
git commit -m "Report: chain rows grouped under their top-level element, with cause links and a Propagates to line" -m "Each top-level element with chains gets a group section with an h3 heading, and chains that reach no root follow the last group. Row headings move to h4 with the template rules that go with them. A linked cause names the provider's row and element, adding its mode only when the texts differ, and a row that others link into lists them under Propagates to after its effects."
```

### Task A13: Codebases in the header; the top-level and Dependencies tables and tree labels in Structure

**Files:**
- Modify: skills/fmea-software/scripts/render.ts:3 and 14 (type imports), 154-169 (`headerHtml`), 183-201 (`elementTagHtml`, `structureHtml`), 409-417 (`renderHtml`) (ed1b9b0 numbering)
- Modify: skills/fmea-software/assets/report-template.html:31 (after `.el-rationale`)
- Modify: skills/fmea-software/scripts/render.test.ts:51-56 (`FREE_TEXT_KEYS` and its comment), 74-80 (`poisonedDocument`), 425-449, 1027-1040 ("every string in the structure section is entity-escaped", as A3 left it), 1081-1098, 1123-1127, 1168-1181, plus new tests
- Test: skills/fmea-software/scripts/render.test.ts

**Interfaces:**
- Consumes:
  - the A11 report-model additions `codebases`, `roots`, `edges`, `treeLabels` and `RootRow`;
  - A12's `group-<root id>` ids, and its test builders `twinRoots()` and `idleRoot()` in render.test.ts;
  - the existing render.ts helpers `frameHtml` and `captionHtml` (render.ts:60-67), which no step changes.
  - A3's owed `sla ${safe}` and `limits ${safe}` assertions of the structure-escaping test, which Step 1 restores as the fields of an edge.
- Produces (render markup, `render.ts`):
  - Header row `["Codebases", model.codebases.map((c) => `${e(c.name)}, <code>${e(c.repo)}</code>${c.path ? `, <code>${e(c.path)}</code>` : ""}`).join("<br>")]`, after Security boundary and only when `model.codebases.length > 0`.
  - `const ROOTS_CAPTION = "One row per top-level element; every count covers the element and everything under it, and a name links to its chain rows below.";`
  - `const DEPENDENCIES_CAPTION = "One row per dependency, in the order the analysis lists them: the consumer depends on the provider.";`
  - Root table: `captionHtml("roots-caption", ROOTS_CAPTION) + frameHtml("By top-level element", `<table aria-labelledby="roots-caption">…`)`.
    - Head: `<th>Top-level element</th>`, then `<th>Codebase</th>` only when `roots[0].codebase !== null`, then `<th class="num">Chains</th><th class="num">${e(top value)}</th><th class="num">Provisional</th><th class="num">Open actions</th>`.
    - Counts sit in `<td class="num">`.
    - The name cell is `<a href="#group-${e(id)}">${e(name)}</a>` only when `chains > 0`; a root with no chains has no group section to link to, so its name is plain text (decision 14).
  - Dependencies table: `captionHtml("dependencies-caption", DEPENDENCIES_CAPTION) + frameHtml("Dependencies", …)`, with the heads Consumer, Provider, Strength, SLA and Limits. Ids sit in `<code>`, and an absent sla or limits gives `<td></td>`. With no edges, `<p class="empty">No dependencies.</p>` replaces the caption and the table.
  - Tree label: `<span class="el-codebase">${e(label)}</span>` after the closing tag of `.el-tag` inside `.el-who`.
  - `function structureHtml(doc: FmeaDocument, model: ReportModel, vocabulary: Vocabulary): string`, emitting the root table, `vocabularyHtml`, the tree, then the Dependencies table.
- Produces (template rules): `.el-codebase { color:var(--muted); font-size:.9em; }`

- [ ] **Step 1: Re-pin the existing structure, frame and caption tests.**
  - Add `"repo", "path"` to `FREE_TEXT_KEYS`. Reword its comment at line 51 to `// The free-text fields: every string the report prints that no schema pattern, format or enum keeps free of markup (codebases[].repo has a pattern, but it admits < > & " ').`
  - In `poisonedDocument`, set `doc.meta.codebases![0].path = "services/checkout";` before calling `poison`, so that `path` is exercised.
  - In the structure-escaping test ("every string in the structure section is entity-escaped", as A3 trimmed it), after the `shard` edits, push an edge from `doc.elements[0].id` to `shard.id`, strength `strong`, with `` sla: `sla ${bad}` `` and `` limits: `limits ${bad}` ``, onto `doc.dependencies`, and add `` `sla ${safe}` `` and `` `limits ${safe}` `` back to the expected list after `desc ${safe}`. This settles A3's debt: the two strings reach the page again through the Dependencies table.
  - Rename the test at 437 to "no table carries a caption; each of the five captioned tables is named by the paragraph above its frame". Its `named` list gains these two entries first:

```ts
["roots-caption", "One row per top-level element; every count covers the element and everything under it, and a name links to its chain rows below.", "By top-level element", '<table aria-labelledby="roots-caption">'],
["dependencies-caption", "One row per dependency, in the order the analysis lists them: the consumer depends on the provider.", "Dependencies", '<table aria-labelledby="dependencies-caption">'],
```

  - The frame-label list at 429 opens `"By top-level element", "Dependencies", "Index of failure chains", …`, with the rest as A10 left it. It keeps `new Set(labels).size === labels.length`.
  - Replace the test at 1081 with:

```ts
test("the structure section opens with the top-level table, then the vocabulary, the tree and the Dependencies table", () => {
  const structure = sectionOf(renderHtml(golden(), table, template, vocabulary), "structure", "chains");
  const afterHeading = structure.slice(structure.indexOf("<h2>Structure</h2>") + "<h2>Structure</h2>".length).trimStart();
  assert.ok(afterHeading.startsWith('<p class="caption" id="roots-caption">'), "the top-level table is not the heading's first follower");
  assert.ok(afterHeading.includes('</table></div><section class="vocabulary">'), "the vocabulary does not follow the top-level table");
  const start = afterHeading.indexOf('<section class="vocabulary">');
  const end = afterHeading.indexOf("</section>", start) + "</section>".length;
  const block = afterHeading.slice(start, end);
  const pairs = [...vocabulary.roles, ...vocabulary.boundaries, vocabulary.security].map((x) => `<dt>${escapeHtml(x.label)}</dt><dd>${escapeHtml(x.test)}</dd>`);
  assert.equal(occurrences(block, "<dt>"), pairs.length, "the vocabulary holds a different number of terms than roles, boundaries and the flag");
  let at = 0;
  for (const pair of pairs) {
    const next = block.indexOf(pair, at);
    assert.ok(next >= at, `missing or out of order: ${pair}`);
    at = next;
  }
  for (const label of ["Service", "In scope", "Security-relevant"]) assert.ok(block.includes(`<dt>${label}</dt>`), `the vocabulary does not list ${label}`);
  assert.ok(afterHeading.slice(end).startsWith('<ul class="tree">'), "the tree does not follow the vocabulary");
  assert.ok(structure.indexOf('<ul class="tree">') < structure.indexOf('id="dependencies-caption"'), "the Dependencies table does not follow the tree");
});
```

  - The test at 1123 also asserts `!structure.includes("roots-caption")` and `structure.includes('<p class="empty">No elements.</p>')`.
  - The href test's doc list gains `idleRoot()` (A12) and becomes `[golden(), staleRows(), twinRoots(), idleRoot()]`.

- [ ] **Step 2: Write the new failing tests.**

```ts
const ROOTS_HEAD = '<thead><tr><th>Top-level element</th><th>Codebase</th><th class="num">Chains</th><th class="num">H</th><th class="num">Provisional</th><th class="num">Open actions</th></tr></thead>';
const DEPENDENCIES_HEAD = "<thead><tr><th>Consumer</th><th>Provider</th><th>Strength</th><th>SLA</th><th>Limits</th></tr></thead>";

test("the header lists the codebases after Security boundary, each with its repository and its path when set", () => {
  const doc = golden();
  doc.meta.codebases![1].path = "packages/auth";
  assert.ok(headerOf(doc).includes(
    `<dt>Security boundary</dt><dd>${escapeHtml(doc.meta.boundary.security)}</dd><dt>Codebases</dt><dd>Checkout service, <code>acme/checkout</code><br>` +
    "Session authentication library, <code>acme/session-auth</code>, <code>packages/auth</code></dd><dt>Scales version</dt><dd>1</dd>"));
});

test("the top-level table rolls up each root, links a name to its group, and heads its count with the table's first value", () => {
  const structure = sectionOf(renderHtml(golden(), table, template, vocabulary), "structure", "chains");
  assert.ok(structure.includes(`<table aria-labelledby="roots-caption">${ROOTS_HEAD}<tbody>` +
    '<tr><td><a href="#group-checkout">Checkout service</a></td><td>Checkout service</td><td class="num">8</td><td class="num">5</td><td class="num">4</td><td class="num">7</td></tr>' +
    '<tr><td><a href="#group-pricing">Pricing service</a></td><td>owned outside</td><td class="num">1</td><td class="num">0</td><td class="num">0</td><td class="num">1</td></tr></tbody></table>'));
  const idle = sectionOf(renderHtml(idleRoot(), table, template, vocabulary), "structure", "chains");
  assert.ok(idle.includes("<tr><td>Idle</td>"), "a root with no chains is not linked");
  assert.ok(!idle.includes('href="#group-idle"'));
});

test("the Dependencies table lists every edge in order, an absent SLA or limits as an empty cell, and escapes ids", () => {
  const structure = sectionOf(renderHtml(golden(), table, template, vocabulary), "structure", "chains");
  assert.ok(structure.includes(`<table aria-labelledby="dependencies-caption">${DEPENDENCIES_HEAD}<tbody>` +
    "<tr><td><code>checkout</code></td><td><code>checkout.payment-gateway</code></td><td>strong</td><td>99.95% monthly</td><td>50 rps per merchant</td></tr>" +
    "<tr><td><code>checkout</code></td><td><code>pricing</code></td><td>weak</td><td>99.9% monthly</td><td></td></tr>" +
    "<tr><td><code>checkout</code></td><td><code>checkout.order-store</code></td><td>strong</td><td>99.99% monthly</td><td></td></tr></tbody></table>"));
  const doc = minimalDoc();
  doc.dependencies = [{ from: "gh<o>st", to: "svc", strength: "weak" }];
  const escaped = sectionOf(renderHtml(doc, table, template, vocabulary), "structure", "chains");
  assert.ok(escaped.includes(`<tr><td><code>${escapeHtml("gh<o>st")}</code></td><td><code>svc</code></td><td>weak</td><td></td><td></td></tr>`));
  assert.ok(!escaped.includes("gh<o>st"), "a raw id reached the Dependencies table");
});

test("with no edges the Structure section prints No dependencies.", () => {
  const structure = sectionOf(renderHtml(minimalDoc(), table, template, vocabulary), "structure", "chains");
  assert.ok(structure.includes('<p class="empty">No dependencies.</p>'));
  assert.ok(!structure.includes("dependencies-caption"));
});

test("without codebases there is no Codebases row, no codebase column and no tree codebase", () => {
  const html = renderHtml(minimalDoc(), table, template, vocabulary);
  assert.ok(!headerOf(minimalDoc()).includes("<dt>Codebases</dt>"));
  const structure = sectionOf(html, "structure", "chains");
  assert.ok(structure.includes('<thead><tr><th>Top-level element</th><th class="num">Chains</th>'));
  assert.ok(!structure.includes("<th>Codebase</th>"));
  assert.ok(!structure.includes('class="el-codebase"'));
});

test("tree lines name the effective codebase, none for an in-scope element without one, nothing for an outside element without one", () => {
  const structure = sectionOf(renderHtml(golden(), table, template, vocabulary), "structure", "chains");
  assert.ok(elBlock(structure, "checkout").includes('<span class="el-boundary">in scope</span></span><span class="el-codebase">Checkout service</span></div>'));
  assert.ok(elBlock(structure, "checkout.api").includes('<span class="el-codebase">Checkout service</span>'));
  assert.ok(elBlock(structure, "checkout.session-auth").includes('security-relevant</span></span><span class="el-codebase">Session authentication library</span></div>'));
  for (const id of ["checkout.payment-gateway", "pricing"]) assert.ok(!elBlock(structure, id).includes("el-codebase"), id);
  const doc = minimalDoc();
  doc.meta.codebases = [{ id: "lib", name: "Library", repo: "acme/lib" }];
  const own = sectionOf(renderHtml(doc, table, template, vocabulary), "structure", "chains");
  assert.ok(elBlock(own, "svc").includes('<span class="el-codebase">none</span>'));
  assert.ok(own.includes('<tr><td><a href="#group-svc">Service</a></td><td>none</td>'));
});

test("the template styles the tree's codebase label", () => {
  assert.ok(template.includes(".el-codebase { color:var(--muted); font-size:.9em; }"));
});
```

- [ ] **Step 3: Run the file and see it fail.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/render.test.ts`.
  - Expected to fail: the seven new tests, and the frame-label, caption, structure-order and structure-escaping re-pins.
  - Expected to pass both before and after the change, kept as regression pins: the no-elements test with its two new assertions; the href test with `idleRoot()`, since nothing links to `#group-*` before this task; and the injection-vector and data-block tests with `repo` and `path` now poisoned.
  - Every other test passes.

- [ ] **Step 4: Render the header row, the two tables and the tree labels.** In `render.ts`:
  - Add `DependencyEdge` to the `import type` from `./lib/types.ts`, and `RootRow` to the `import type` from `./lib/report-model.ts`. `Element` is already imported, and nothing else is added, because an unused type import fails the checks.
  - `headerHtml` splices the Codebases row of Interfaces after `["Security boundary", …]` when `model.codebases.length > 0`.
  - Add `ROOTS_CAPTION` and `DEPENDENCIES_CAPTION` as given.
  - Add the private `rootsHtml(roots: RootRow[]): string`. It returns "" when `roots` is empty, and otherwise the caption and frame of Interfaces, with the top value read from `roots[0].top.value`.
  - Add the private `dependenciesHtml(edges: DependencyEdge[]): string`, with the "No dependencies." paragraph when there are none.
  - Add the private `treeHtml(elements: Element[], labels: (string | null)[]): string`. It is today's tree, with `node` passing each element's position so that the `.el-who` div ends `${elementTagHtml(el)}${label === null ? "" : `<span class="el-codebase">${e(label)}</span>`}</div>`, and "No elements." when there are no roots.
  - `structureHtml(doc, model, vocabulary)` returns `rootsHtml(model.roots) + vocabularyHtml(vocabulary) + treeHtml(doc.elements, model.treeLabels) + dependenciesHtml(model.edges)`.
  - `renderHtml` calls `structureHtml(doc, model, vocabulary)`.

  Every printed string passes through `e()`, and no derivation is added here.

- [ ] **Step 5: Add the template rule.** In `report-template.html`, add `.el-codebase { color:var(--muted); font-size:.9em; }` on the line after `.el-rationale { margin:.2rem 0 0; max-width:84ch; color:var(--muted); }`. Add no `@media`, no `overflow-wrap` and no print rule.

- [ ] **Step 6: Run the file and see it pass.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/render.test.ts`. Expected: `# fail 0`.

- [ ] **Step 7: Run both runners.** `node tools/run-tests.ts` and `node tools/check.ts` (or `bun tools/run-tests.ts` and `bun tools/check.ts`). Both exit 0.

- [ ] **Step 8: Run the browser gate and the comparison, and check the new frames.**
  - `node tools/check-browser.ts` exits 0 at every width from 320 px and in print. The frames spec, which runs `frameFaults`, reports no "table outside a frame", no frame that clips, and no table past its frame at rest from 1280 px up. axe finds no violation in the two tables.
  - `EXPECTED_FAILURES` and `NOT_ASSERTED` stay empty. A failure is fixed in the renderer or the template.
  - `node tools/compare.ts --base HEAD` exits 0. Its summary shows changed views only in `header` (the Codebases row) and `structure`. Open each changed view's three images.
  - `node tools/compare.ts` against `main` exits 0. Read its summary.

- [ ] **Step 9: Commit.** Add no attribution trailer of any kind.

```
git add skills/fmea-software/scripts/render.ts skills/fmea-software/assets/report-template.html skills/fmea-software/scripts/render.test.ts
git commit -m "Report: codebases in the header, and the top-level and dependency tables in the Structure section" -m "The header lists the codebases after the security boundary. The Structure section opens with a table that rolls each top-level element's subtree up and links a name to its group, keeps the vocabulary and the tree, which now names each element's effective codebase, and ends with one row per dependency edge. Without codebases the header row, the codebase column and the tree labels are left out."
```

### Task A14: Browser tools photograph and owe each group section

**Files:**
- Modify: tools/lib/compare-views.ts:13-17, 33-43
- Modify: tools/lib/fake-machine.ts:14 (import), plus the new `FAKE_REPORT` export
- Modify: dev/browser/report.ts:103-119
- Modify: dev/browser/capture.shots.ts:1-5, 42
- Modify: tools/shots.ts:9-11, 17-20, 31-34
- Modify: tools/shots.test.ts:6, 12-26, 61-67, 99-106, plus new tests
- Modify: tools/compare.test.ts:8, 14-17, plus one new test
- Test: tools/shots.test.ts, tools/compare.test.ts

**Interfaces:**
- Consumes: A12's render markup `<section class="group" id="group-<root id>">`, which holds an `h3` and its `article.row` elements.
- Produces:
  - `export function groupStems(html: string): string[]` in `tools/lib/compare-views.ts`, defined as `[...html.matchAll(/<section class="group" id="([^"]*)"/g)].map((m) => decoded(m[1]))`. `partsOf` returns `{ stems: [...sections, ...chains, ...groupStems(html), ...ids.map(rowStem)], rows }`, and group stems never enter `rows`.
  - `partLocator`: `if (stem.startsWith("group-")) return page.locator(`section.group[id="${stem}"]`);`, placed before the row branch.
  - capture: after the `[...SECTION_PARTS, "key", "index"]` loop, `for (const id of await page.locator("section.group").evaluateAll((els) => els.map((el) => el.id))) await writePart(page, await partLocator(page, id), dir, id);`
  - `owedBy`: `{ parts: [...SECTION_PARTS, ...chains, ...groupStems(html)], rows }`
  - `export const FAKE_REPORT: string` in `tools/lib/fake-machine.ts`: the fake report that both browser-runner tests start from. It is defined once so that fallow's duplication gate finds no clone.

- [ ] **Step 1: Define the fake report once, wrap its rows in a group section, and move the pins.**
  - The capture test §15 names is `tools/shots.test.ts`, which drives `capture.shots.ts` through the fake machine; the Playwright-only code, the group branch of `partLocator` and the capture loop, is checked by running it in Step 8.
  - In `tools/lib/fake-machine.ts`, widen the import to `import { SECTION_PARTS, VIEWS } from "../../dev/browser/matrix.ts";` and add:

```ts
/** The report the browser-runner tests start from: every section part, the key and the index, and one
 *  group section holding two rows. */
export const FAKE_REPORT =
  SECTION_PARTS.map((id) => `<section id="${id}"></section>`).join("") +
  '<section id="chains"><div class="key"></div><table class="index"></table>' +
  '<section class="group" id="group-checkout"><h3>Checkout service <code>checkout</code></h3>' +
  '<article class="row" id="row-ch-1"></article><article class="row" id="row-ch-2"></article></section></section>';
```

  - In `tools/shots.test.ts`:
    - Import `FAKE_REPORT` beside `fakeMachine`. The default report becomes `const HTML = FAKE_REPORT;`, with its doc comment reading "The default report: every section part, the key and the index, one group section and two rows."
    - `WRITTEN` gains `"group-checkout.png"` after `"index.png"`.
    - The first test's pin becomes `"## shots: 76 files under build/shots/"`, with the comment `// 5 widths × 15 files, and the PDF`.
    - The no-screenshot test's `owed` becomes `["page", ...SECTION_PARTS, "key", "index", "group-checkout", "row-01-", "row-02-"]`.
  - In `tools/compare.test.ts`:
    - Import `FAKE_REPORT` beside `fakeMachine`, and replace the local literal with `const HTML = FAKE_REPORT;`.
    - Set `const PARTS = [...SECTION_PARTS, "key", "index", "group-checkout", "row-ch-1", "row-ch-2"];`.
    - The pin `FAILWISE_COMPARE_PARTS?.endsWith(",row-ch-2-")` stays as it is, because rows remain last.
    - `withRow` still inserts before the last `</section>`, which now places the added row after the group, in the tail.

- [ ] **Step 2: Write the new failing tests.** In `tools/shots.test.ts`:

```ts
test("a missing group image is UNVERIFIED, exit 1", () => {
  const result = run([], { drop: ["chromium/320/group-checkout.png"] });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error UNVERIFIED: build/shots/chromium/320/ lacks group-checkout"]);
});

test("a tall group written in pieces is owed and found", () => {
  const written = WRITTEN.flatMap((name) => (name === "group-checkout.png" ? ["group-checkout-p1.png", "group-checkout-p2.png"] : [name]));
  assert.equal(run([], { written }).status, 0);
});

test("a tile-group section of the header owes no group image", () => {
  const html = HTML.replace('<section id="header"></section>', '<section id="header"><section class="tile-group" aria-labelledby="strip-found"></section></section>');
  assert.equal(run([], { html }).status, 0);
});
```

In `tools/compare.test.ts`:

```ts
test("a group section on the after side only is named as added and is not photographed", () => {
  const after = HTML.replace('<section class="group" id="group-checkout">', '<section class="group" id="group-pricing"></section><section class="group" id="group-checkout">');
  const result = run([], { rendered: { before: HTML, after } });
  assert.equal(result.status, 0);
  assert.ok((result.read("/repo/build/compare/summary.md") ?? "").includes("## Parts added\n\n- group-pricing\n"));
  for (const env of result.env.filter((one) => one.FAILWISE_COMPARE_PASS !== undefined)) assert.equal(env.FAILWISE_COMPARE_PARTS, PARTS.join(","));
});
```

- [ ] **Step 3: Run the two files and see them fail.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tools/shots.test.ts tools/compare.test.ts`. Expected:
  - In shots.test.ts, two tests fail: the no-screenshot test, whose list lacks `group-checkout`, and "a missing group image is UNVERIFIED", which exits 0.
  - In shots.test.ts, three tests pass both before and after the change and are kept as pins: the count pin (the fake folders already hold 15 files each), the pieces case and the tile-group case.
  - In compare.test.ts, every test that pins `PARTS` or `N` fails, because `group-checkout` is not yet a part, and so does the group-added case.

- [ ] **Step 4: Read the group stems in `partsOf` and owe them in `owedBy`.**
  - In `tools/lib/compare-views.ts`, add `groupStems` as in Interfaces and use it in `partsOf`.
  - Rewrite the order given in the `Parts` doc comment: the SECTION_PARTS names present, then "key" and "index", then the decoded id of each `<section class="group" id="...">` in document order, then one rowStem per row. Group stems are not reduced and never enter `rows`.
  - In `tools/shots.ts`, import `groupStems` from `./lib/compare-views.ts`, and have `owedBy` return the parts of Interfaces.
  - The part list in the header comment (line 10) reads "(each section but the chains, the key, the index, each group section, each row section)".
  - Nothing under `tools/` or `dev/browser/` imports from `skills/fmea-software/scripts/`.

- [ ] **Step 5: Run the two files and see them pass.** `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tools/shots.test.ts tools/compare.test.ts`. Expected: `# fail 0`.

- [ ] **Step 6: Locate and capture the group parts.** These run only under Playwright, and Step 8 verifies them.
  - In `dev/browser/report.ts`, add the `group-` branch of Interfaces to `partLocator`, before the `row-` branch. Its doc comment adds: "for a stem that starts "group-", the `section.group` whose id attribute equals it, unreduced".
  - In `dev/browser/capture.shots.ts`, add the group loop of Interfaces after line 42 and before the row loop.
  - The capture header comment reads "…then each section but the chains, the key, the index, each group section and each row section, …".
  - Leave `SECTION_PARTS` in `dev/browser/matrix.ts`, `views.compare.ts` and `print.spec.ts` unchanged.

- [ ] **Step 7: Run both runners.** `node tools/run-tests.ts` and `node tools/check.ts` (or `bun tools/run-tests.ts` and `bun tools/check.ts`). Both exit 0, and tsc type-checks `dev/browser/*.ts`.
  - `groupStems` is used by `compare-views.ts` and `shots.ts`, and `FAKE_REPORT` by both tests, so fallow reports no unused export.
  - A duplication finding between the two test files means the fake report was copied rather than imported.
  - `check-browser.test.ts` still pins `EXPECTED_FAILURES` and `NOT_ASSERTED` as empty.

- [ ] **Step 8: Run the screenshots, the gate and the comparison, and look at every group.**
  - `node tools/shots.ts` exits 0 and prints `## shots: <n> files under build/shots/`. Under `build/shots/chromium/<width>/`, each width holds `group-checkout.png` (or `group-checkout-p1.png` …) and `group-pricing.png`, with `row-05-ch-9.png` among the rows.
  - Open every group image at every width, and the `ch-9` row image. Each group shows its heading followed by its rows.
  - `node tools/check-browser.ts` exits 0 with no `## not asserted` line.
  - `node tools/compare.ts` against `main` exits 0. Its summary shows changes in the header, the structure section, the index, the chain rows and the lints section, and nothing else. `## Parts added` lists `group-checkout`, `group-pricing` and `row-ch-9`, which are not photographed. Read every changed view.

- [ ] **Step 9: Exercise the comparison on the group parts and record the group heights.**
  - `node tools/compare.ts --base HEAD~1` compares against A12's commit. Its report has the group sections and differs from the working tree in the header and the structure section, so the groups are photographed at every width and in print. It must exit 0, with every `group-checkout` and `group-pricing` view judged the same and no `error UNVERIFIED` line.
  - Run `file build/shots/chromium/<width>/group-*.png` at each width to see that every piece was written with a height. B7 Step 8 measures the 320 px heights for the pull request body.
  - If any group view fails to photograph or comes back UNVERIFIED in the comparison, stop and do not commit. Report it to the user as a spec gap: §12 makes the group part the whole wrapper, and only `capture.shots.ts` splits a tall part into `-pN` pieces. The user rules on a §12 amendment. Change no code or test meanwhile, and add no `NOT_ASSERTED` or `EXPECTED_FAILURES` entry.

- [ ] **Step 10: Commit.** Add no attribution trailer of any kind.

```
git add tools/lib/compare-views.ts tools/lib/fake-machine.ts dev/browser/report.ts dev/browser/capture.shots.ts tools/shots.ts tools/shots.test.ts tools/compare.test.ts
git commit -m "Render gate: each group section is a part of its own, photographed and owed" -m "The comparison and the screenshot command read each group section from the report and order the parts as sections, key, index, groups, then rows. partLocator selects a group by its id, the capture writes it whole or in pieces, and the screenshot command owes one file per group, reporting a missing one as UNVERIFIED. The browser-runner tests share one fake report."
```


### Task A15: SKILL.md for schema v3, and the commands test of its new line

**Files:**
- Modify: skills/fmea-software/SKILL.md:3, 33, 35-36, 38-39, 45, 62, 76, 81, 86, 90-92, 102, 108, 112
- Modify: tools/skill-commands.test.ts:1-10, 106-115, append after 149
- Test: tools/skill-commands.test.ts

**Interfaces:**
- Consumes: the `update-check.ts CLI` (A9): `update-check.ts <stored copy> <draft> [--check]`, exit 0 on a valid baseline, last stdout line `update-check: <n> edge change(s), <n> element change(s), <n> stale row(s), <n> unmarked row(s), <n> link(s) into removed chains, <n> outside element(s) with no consumer`, with a plural noun for 0 and the singular for 1 (`1 link into a removed chain`), as A9 Step 13's noun table fixes. The `DEPENDENCY_LEGACY issue` (A2), whose message ends `as SKILL.md describes under "Migrate a v2 document"`, and the unchanged KIND_LEGACY message, which ends `under "Migrate a v1 document"`. Both are written in lib/legacy.ts as one template literal each, with the heading inside bare, unescaped double quotes, as the KIND_LEGACY message at legacy.ts:20 is; the second test below reads the source and depends on that form. `CASCADING_ROWS` (A7): `["cat-service-01", "cat-service-02", "cat-service-03", "cat-service-05", "cat-dependency-03", "cat-dependency-04"]`. No earlier task produces the seven update-mode sentences of Step 12; this task writes them.
- Produces: the seven update-mode sentences of Step 12, the first of which A17 Step 6 restates for structure-elements.md. The `### Migrate a v2 document` heading, placed after `### Migrate a v1 document` and before `## Scripts`. The Scripts-block line `node ${CLAUDE_SKILL_DIR}/scripts/update-check.ts <stored copy> <draft> [--check]`, placed after the `track.ts refresh` line. A18 names the heading in the docs/scripts.md compatibility paragraph (A18 Step 11). The Scripts line is consumed by tools/skill-commands.test.ts in this task.

- [ ] **Step 1: Write the two failing tests in tools/skill-commands.test.ts**

First add a private helper `function inTempDir(body: (dir: string) => void): void`, which calls `mkdtempSync(join(tmpdir(), "skill-commands-"))` and then runs the body inside try/finally with `rmSync`. Rewrite `withDocument` on top of it, so that the new test's temp-dir block is not a fallow clone. Then append:

```ts
const UPDATE_CHECK_LINE = "node ${CLAUDE_SKILL_DIR}/scripts/update-check.ts <stored copy> <draft> [--check]";

/** The block's update-check.ts line, exactly once. */
function updateCheckCommand(block: string[]): string {
  const lines = block.filter((line) => scriptOf(line) === "update-check.ts");
  assert.equal(lines.length, 1, "the block gives update-check.ts once");
  return lines[0];
}

test("SKILL.md's update-check.ts line runs on a stored copy and an unchanged draft, exits 0 and prints its summary line", () => {
  const line = updateCheckCommand(scriptsBlock(skillMd));
  assert.equal(line, UPDATE_CHECK_LINE);
  inTempDir((dir) => {
    const copy = join(dir, "copy.json");
    const draft = join(dir, "draft.json");
    const text = readFileSync(FIXTURE, "utf8");
    writeFileSync(copy, text);
    writeFileSync(draft, text);
    // the placeholders hold a space, so they are filled before argv() splits the line
    const filled = required(line).replace("<stored copy>", copy).replace("<draft>", draft);
    const result = spawnSync(process.execPath, argv(filled, draft, ""), { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trimEnd().split("\n").at(-1),
      "update-check: 0 edge changes, 0 element changes, 0 stale rows, 0 unmarked rows, 0 links into removed chains, 0 outside elements with no consumer");
  });
});

test("each SKILL.md heading the KIND_LEGACY and DEPENDENCY_LEGACY messages name is a heading of SKILL.md", () => {
  const legacy = readFileSync(join(SKILL_DIR, "scripts", "lib", "legacy.ts"), "utf8");
  const named = [...legacy.matchAll(/SKILL\.md describes under "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...named].sort(), ["Migrate a v1 document", "Migrate a v2 document"],
    "lib/legacy.ts names both migration headings, each written whole inside one template literal with bare double quotes");
  for (const heading of named) assert.match(skillMd, new RegExp(`^### ${heading}$`, "m"), `SKILL.md has no '### ${heading}' heading`);
});
```

The test reads legacy.ts by path, because tools/ imports nothing from the skill scripts. The copy and the draft are both the unmodified v3 fixture. On the first run the draft's `meta.version` may equal the copy's. No `--check` is passed, so no changed-provider clause is printed.

- [ ] **Step 2: Run the file and watch both new tests fail**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tools/skill-commands.test.ts`
Expected: `# pass 2`, `# fail 2`. The first failure has the message "the block gives update-check.ts once", with the AssertionError's `actual` 0 and `expected` 1; a string message replaces the default text, so no `0 !== 1` is printed. The second failure is "SKILL.md has no '### Migrate a v2 document' heading".

- [ ] **Step 3: Update the header comment of tools/skill-commands.test.ts (lines 1-10)**

Add one sentence saying three things: the Scripts block's update-check.ts line is also run as given, on a stored copy and an unchanged draft of the fixture; its placeholders are filled before the line is split; and each heading the legacy messages name is checked against SKILL.md.

- [ ] **Step 4: Frontmatter (SKILL.md:3)**

Replace `inside the analysed system or beyond it` with `inside the boundary or beyond it`. Nothing else on the line changes.

- [ ] **Step 5: Review sentence (SKILL.md:33)**

Append to the line, after its `[skill-authored]`:
`When the ground rules name more than one team, record each team's review as its own `meta.reviews[]` entry and write each reviewer, there and in a rating's `review.by`, as name and team. [skill-authored]`

- [ ] **Step 6: Step 1, Plan (SKILL.md:35)**

Replace `List every codebase the analysis covers in `meta.boundary.included`. [skill-authored]` with:
`List every codebase the run covers or reads in `meta.codebases[]`, each with its `name`, its repository as `repo` in the `owner/repo` form and, for a folder inside a monorepo, its `path`; a codebase whose repository the inputs do not name is an open assumption owned by `user` and not an entry, so no repository name is ever invented. [skill-authored] `meta.boundary.included` describes what inside those codebases the analysis covers. [skill-authored]`
After `Write each one into `meta.ground_rules`. [skill-authored]` insert:
`A run over several codebases is one whose `meta.codebases[]` holds two or more entries the run covers, not only reads; in such a run, ask who owns the analysis and which team owns each codebase it covers, and write each answer as a ground rule in `meta.ground_rules`, a team the inputs do not name being an open assumption owned by `user` and never a guess. [skill-authored]`

- [ ] **Step 7: Step 2, Structure (SKILL.md:36)**

After the first sentence, which ends `the depth cap is this skill's own convention. [skill-authored]`, insert:
`In a run over several services, make each service a root, a depth-1 element with no umbrella element above the services, because the report groups and counts chains by root; one product spread over several repositories may stay one root whose children name their codebases. [skill-authored] Set `codebase` on each in-scope root; on an in-scope child that lives in a codebase other than its parent's, or whose parent is outside the boundary, since nothing is inherited through an outside element; and on an outside element whose repository the run read, since an outside element never inherits. [skill-authored] Write every dependency the inputs classify as an edge in `dependencies[]`, from the consumer to the provider, one edge per pair at the stronger strength where the inputs split a dependency by use; an element outside the boundary needs at least one consumer. [skill-authored]`

- [ ] **Step 8: Step 4, Failure (SKILL.md:38)**

After `On a cascading row the trigger is the triggering cause restated. [cites:C036]` insert:
`When a cause is a failure mode another chain already describes, link it with `chain` and state it in the consumer's terms. [skill-authored] Because consumers are often written before their providers, end this step with a linking pass that walks every cause once after the last chain is written, and do not renumber chain ids once a link exists. [skill-authored] On a linked pair, the provider's next-level effect states the failure mode of the consumer chain joined to it by the strongest edge, strong ranking above weak, where the edges that join a consumer chain to its provider chain run from an element in {the consumer chain's element, its ancestors, its descendants} to an element in {the provider chain's element, its ancestors}, the edges `cause-chain-unlinked` reads; where no edge joins any linked consumer, as with a link whose provider's element is the consumer's element or a descendant of it, or where the strongest edges tie, it states the failure mode of any one of them. [skill-authored] A feedback loop between two services is one cascading row, with the triggering event as its cause and the amplification as its mode, never two mutually linked rows. [skill-authored]`

- [ ] **Step 9: Step 5, Rate (SKILL.md:39)**

After the sentence ending `the version the ratings were made against. [skill-authored]` insert:
`Rate a provider on the worst end effect its mode reaches through any consumer; a consumer's own amplification or another cause may rate the consumer higher. [skill-authored] A provider whose failure is a consumer's only cause is not rated below that consumer unless the consumer row is cascading or metastable, meaning its trigger restates the linked cause or it cites `cat-service-01` (cascading failure), `cat-service-02` (metastable failure), `cat-service-03` (retry amplification), `cat-service-05` (recovery storm), `cat-dependency-03` (cold or contagious failover) or `cat-dependency-04` (reconnection stampede), the rows whose mode is a positive-feedback loop, so that the consumer's severity is its own. [skill-authored] Dependency strength moves no rating, and the catalog's per-strength readings are a default to check against the inputs. [skill-authored] A loss-of-access end effect on a provider that has at least one inbound edge, all of them weak, is recorded as an open assumption on the edges' strength, owned by `user`, and the effect is rated as written. [skill-authored]`
After `record the person's name and date on each re-scored rating. [skill-authored]` insert:
`When you rate, re-rate or re-score a consumer's O for a linked cause, write the cause's `cited_o` from the provider chain's current `ratings.O`, its value, evidence kind and evidence reference, and never change `cited_o` without re-reading the consumer's O. [skill-authored] Re-score a chain other chains link into before its consumers and, at a first rating, rate it before its consumers too, so that each consumer's `cited_o` has a provider O to record; after a re-score moves a linked provider's O, the re-run of step 7's sequence flags each consumer cause whose `cited_o` no longer matches, and those are the next ratings to re-score. [skill-authored]`
Check that the six ids, in this order, are exactly `CASCADING_ROWS` in lints.ts.

- [ ] **Step 10: Other modes (SKILL.md:45)**

Replace the line with:
`Conversion and update are performed by the skill; no script performs them. `update-check.ts` checks the structural part of an update and writes nothing. [skill-authored]`

- [ ] **Step 11: Conversion paragraph (SKILL.md:62)**

Replace the line with these lines:
```text
`security_relevant` is false unless the sheet or its item text says otherwise, as a declared substitution in the column mapping, and the sheet's `Owner` column is the action owner, never an element owner. [skill-authored]
Every outside item gets one edge in `dependencies[]` whose `from` is the first in-scope item in sheet order; an in-scope item whose rows carry a strength, an SLA or limits is an internal dependency and gets the same edge, from the first in-scope item other than itself, and when no other in-scope item exists its values go into an open assumption and it gets no edge. [skill-authored]
An item that gets an edge and has no strength in the sheet takes `strength: strong`, whatever its boundary; rows of one item that disagree take the stronger strength and the first row's SLA and limits, the other rows' values going into the edge's open assumption. [skill-authored]
Each edge gets its own open assumption owned by `user`, naming its `from` and `to`, the rule that chose the `from`, and its strength and whether that came from the sheet or is the `strong` default; the column mapping records the edges as a declared substitution, counted like the others. [skill-authored]
Attended, a sheet with no in-scope item stops the conversion until the person names, for each outside item, the item or items that consume it, an outside item included, and each named consumer gets an edge recorded as above. [skill-authored]
A sheet with no in-scope item has no default for the consumer of an outside item: write nothing, leave the sheet unconverted, and end with the question, naming each outside item. [skill-authored]
The conversion adds no link, even where a Cause cell restates another row's Failure Mode, and no codebase, and step 4's linking pass does not run on a converted sheet; both are later work for the person through an ordinary update, and the final message says so. [skill-authored]
```

- [ ] **Step 12: Update mode, the element-changed rule (SKILL.md:76)**

Replace line 76 with these seven sentences, one per line and in this order, each ending `[skill-authored]`. No earlier task produces them: they are the rules of §10 in the order of its bullets, and A17 Step 6 restates the first for structure-elements.md. Lines 77-81 stay as they are.

```
An element changed when its `kind`, `boundary` or `security_relevant` changed, or when an edge whose `to` is the element was added, removed or changed; name, description, sources, security rationale and codebase are labels and do not count, and a change of `parent` is a change of `id`, so it is a removed element and a new one. [skill-authored]
Edges are diffed by their `(from, to)` pair: an edge is added, removed, or changed in `strength`, `sla` or `limits`, a field the new inputs do not restate is carried forward and is not a change, and a strength change counts although strength moves no rating, because strength selects the provider's catalog readings and the open-assumption check of step 5; an edge whose consumer was removed or re-parented is a removed edge, one written again under the consumer's new id is an added edge, and both mark the provider's element changed. [skill-authored]
An edge change marks stale, with reason `element-changed`, the chains on the `to` element and the chains that link through a cause into a chain on the `to` element and whose own element is `from`, an ancestor of `from` or a descendant of `from`; a link into a chain on a descendant of the `to` element is not reached. [skill-authored]
A removed chain breaks every link into it: repoint each `causes[].chain` that named it only to the chain this update writes in its place, never where the link would be a self-link or make a cycle, and otherwise drop the link, unattended without asking; a dropped link marks no row stale and keeps the cause text, a dropped or repointed link loses its `cited_o`, and the update summary lists each link dropped or repointed. [skill-authored]
An element whose codebase entry was removed has `codebase` repointed when the inputs place it in another listed codebase and otherwise cleared, each listed in the summary, a cleared in-scope root being an open assumption owned by `user`; `meta.codebases` is dropped when the last entry goes; a changed or added codebase marks nothing stale and is listed in the summary, and where a codebase's `repo` changed, rewrite the `owner/repo` head of each qualified source ref that names the old repository and list them too. [skill-authored]
An added or changed link marks nothing stale, and a re-rated provider marks no consumer stale; the update summary lists every consumer cause whose linked chain had its failure mode rewritten or its O re-rated in this update, and from the next `validate.ts --write` the lint `linked-cause-occurrence-drift` flags each consumer cause whose `cited_o` no longer matches the provider's `ratings.O`. [skill-authored]
A finding on a row outside the stale set, such as a lint or reviewer disagreement, is listed in the update summary and named in the hand-over, and that row's ratings and `stale` are left as they are; the update rewrites ratings on stale rows only. [skill-authored]
```

- [ ] **Step 13: Update mode, the checker, outside-element, codebase and link sentences (after SKILL.md:81)**

After the line that begins `Re-run steps 4 to 6 on stale rows only`, insert §13's quoted sentences word for word, one per line, in this order:
- the checker's four, from "Before the first change, copy the stored document aside…" to "Copy its printed summary into the update summary in `meta.history`. [skill-authored]", followed by one sentence this plan adds (pre-flight ruling under decision 9): "The printed summary is its `edges:`, `elements:` and `stale:` sections and its last line. [skill-authored]";
- the outside element's four, from "An element whose boundary is not `in_scope` and that is the `to` of no edge once the edges are diffed…" to "…end with the question, naming each such element. [skill-authored]";
- the codebase's three, from "While `meta.codebases[]` is present and, for an entry…" to "…rows that reach no root last. [skill-authored]";
- the link's one: "A `linked-cause-occurrence-drift` finding on a row outside the stale set is listed in the summary and never re-rated by the update; a person's re-score of that consumer's O clears it. [skill-authored]"

- [ ] **Step 14: The v1 migration (SKILL.md:86, 90, 92)**

Line 86: replace `and its `dependency` block kept` with `and its `dependency` block carried into the v2 migration's edge`.
After line 90, insert: `A v1 document runs this migration and then the v2 migration below in the same update, every v1 boundary decision, answered or defaulted, settled before any edge's `from` is chosen, with one version bump and one history entry naming both. [skill-authored]`
Replace line 92 with: `Unattended, every question of this migration takes its stated default and is listed in `meta.assumptions[]` as an open assumption with owner `user`; the v2 migration, the conversion and the update mode each say what their own questions take unattended. [skill-authored]`

- [ ] **Step 15: Add the `### Migrate a v2 document` section (after SKILL.md:92, before `## Scripts`)**

After line 92, the last v1 sentence, insert a blank line and then the block below. Keep the blank line that stands before `## Scripts`, so the heading has a blank line on each side.
```text
### Migrate a v2 document

A document written against schema v2, by 0.3.x to 0.5.x, is migrated by this update mode as an update of its own, run alone and recorded in `meta.history`, never by hand, with the rules in [structure-elements](references/structure-elements.md); it bumps `meta.version`, adds no codebase and no link, and, when it writes the JSON, ends with step 7's sequence. [skill-authored]
```
After it, add §13's three quoted sentences word for word, one per line, in this order:
1. "It marks no row stale: the edge carries what the block carried, and strength moves no rating. [skill-authored]"
2. "A chain on an element whose `dependency` block was `weak` was rated under an exclusion…"
3. "A question of this migration with a stated default takes it unattended as an open assumption owned by `user`; the one with no default, an outside provider with no consumer, stops the whole update: the file is left as it was, and the final message asks. [skill-authored]"

- [ ] **Step 16: Scripts block line (after SKILL.md:102)**

Insert `node ${CLAUDE_SKILL_DIR}/scripts/update-check.ts <stored copy> <draft> [--check]` after the `track.ts refresh` line, inside the fence.

- [ ] **Step 17: Scripts paragraph (after SKILL.md:108 and after SKILL.md:112)**

After the `render.ts` line (108), insert:
`` `validate.ts`, `render.ts` and `track.ts` refuse a document written against an earlier schema before the schema checks, with one line: `DEPENDENCY_LEGACY` on a document this run is writing means its top-level `dependencies` array is missing, so add it, empty when nothing depends on anything, and run again from `priority.ts`; `DEPENDENCY_LEGACY` on a document written against 0.3.x to 0.5.x means migrating it through "Migrate a v2 document" as an update of its own; and `KIND_LEGACY` means a document written against 0.2.x or earlier, which runs the v1 and the v2 migrations in one update. [skill-authored] ``
After the `track.ts` network line (112), insert §13's quoted sentence word for word: "`update-check.ts` writes nothing: it prints the structural diff, … and on either run it refuses a copy that is not the draft's baseline (`UPDATE_BASELINE`). [skill-authored]"
Line 114 keeps `which all four scripts accept`.

- [ ] **Step 18: Check the tags and section references**

`git diff -U0 -- skills/fmea-software/SKILL.md | grep -E '^\+[^+]' | grep -v -E '^\+(#|$|node |description:)' | grep -v -E '\]$'` must print nothing, because every added prose line ends in a tag.
`git diff -U0 -- skills/fmea-software/SKILL.md | grep '^+' | grep -i -e '§' -e 'classical'` must print nothing.

- [ ] **Step 19: Run the file and watch it pass**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tools/skill-commands.test.ts`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 20: Run both runners**

`bun tools/run-tests.ts` must exit 0, with both suites reporting `# fail 0`. `bun tools/check.ts` must exit 0, with no `error` line after `## types`, `## lint` or `## analysis`.

- [ ] **Step 21: Commit (no attribution trailer of any kind)**

```bash
git add skills/fmea-software/SKILL.md tools/skill-commands.test.ts
git commit -F- <<'EOF'
SKILL.md: codebases, dependency edges, cause links, the v2 migration and the update check

SKILL.md now teaches schema v3: codebases in step 1 and step 2, edges
in dependencies[], cause links with their cited O, the update mode's
edge rules and the checker's two runs, and a section for migrating a
v2 document. The commands test runs the new update-check.ts line and
checks that both legacy messages name a heading that exists.
EOF
```

### Task A16: quality-and-lint.md and methodology.md rows, with the sentence pin

**Files:**
- Create: skills/fmea-software/scripts/quality-and-lint.test.ts
- Modify: skills/fmea-software/references/quality-and-lint.md:24-25, 211-213, 224, 226, 230, 232
- Modify: skills/fmea-software/references/methodology.md:93 (insert after)
- Test: skills/fmea-software/scripts/quality-and-lint.test.ts

**Interfaces:**
- Consumes: `INVARIANT_RULES (v3)`, the 32 ids in lib/invariants.ts. `MACHINE_RULES (v3)`, the 14 rules in lib/lints.ts. `CASCADING_ROWS`, the six ids, which the cause-chain-severity row names one by one.
- Produces: the `reviewer row ids` `weak-edges-loss-of-access`, `linked-pair-next-level`, `linked-pair-end-effect`, `linked-cause-occurrence-cited` and `linked-pair-severity`. The `quality-and-lint sentence test`.

- [ ] **Step 1: Write the failing test file skills/fmea-software/scripts/quality-and-lint.test.ts**

```ts
// Pins the two id sentences of references/quality-and-lint.md to the code they list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INVARIANT_RULES } from "./lib/invariants.ts";
import { MACHINE_RULES } from "./lib/lints.ts";
import { SKILL_ROOT } from "./test-helpers.ts";

const reference = readFileSync(join(SKILL_ROOT, "references", "quality-and-lint.md"), "utf8");

/** The backticked ids of the one line that starts with `opening`. */
function idsOf(opening: string): string[] {
  const line = reference.split("\n").find((l) => l.startsWith(opening));
  assert.ok(line, `quality-and-lint.md has a line starting '${opening}'`);
  return [...line.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
}

test("quality-and-lint.md lists the validator ids as schema, format-legacy and INVARIANT_RULES, in order", () => {
  assert.deepEqual(idsOf("The validator ids a row may name are exactly"), ["schema", "format-legacy", ...INVARIANT_RULES]);
});

test("quality-and-lint.md names fifteen machine lints: MACHINE_RULES in order, then priority-table-property", () => {
  const ids = idsOf("The machine lints the scripts implement are fifteen:");
  assert.equal(ids.length, 15);
  assert.deepEqual(ids, [...MACHINE_RULES.map((r) => r.id), "priority-table-property"]);
});
```

- [ ] **Step 2: Run it and watch both tests fail**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/quality-and-lint.test.ts`
Expected: `# fail 2`. The first is a deepEqual diff in which the nine new ids are missing after `element-security-rationale-required`. The second is "quality-and-lint.md has a line starting 'The machine lints the scripts implement are fifteen:'".

- [ ] **Step 3: Validator-id sentence (quality-and-lint.md:24)**

After `` `element-security-rationale-required`, `` and before `` `rating-review-by-date` ``, insert `` `codebase-id-unique`, `element-codebase-resolves`, `dependency-from-resolves`, `dependency-to-resolves`, `dependency-self`, `dependency-pair-unique`, `cause-chain-resolves`, `cause-chain-self`, `cause-chain-cycle`, ``. The tag is unchanged.

- [ ] **Step 4: Machine-lint sentence (quality-and-lint.md:25)**

Replace `are eleven:` with `are fifteen:`. Replace `` `repo-ref-form` and `priority-table-property` `` with `` `repo-ref-form`, `repo-ref-codebase`, `cause-chain-unlinked`, `cause-chain-severity`, `linked-cause-occurrence-drift` and `priority-table-property` ``.

- [ ] **Step 5: Reword the format-legacy and element-dependency-required rows (quality-and-lint.md:211-212)**

```text
| `format-legacy` | A document with an element that lacks `boundary` or `security_relevant`, has a removed kind (`external_dependency` or `security_component`), or cites a catalog row id with a removed prefix (`cat-external_dependency-` or `cat-security_component-`) is refused before the schema runs, with one finding that names the migration; once no such trait is found, so is a document whose top level has no `dependencies` key, or with an element that carries a `dependency` key. | blocker | none | validator | [skill-authored] |
| `element-dependency-required` | An element whose boundary is not `in_scope` is the `to` of at least one edge. Any edge whose `to` names the element counts, whatever its `from`, including a self-edge; `dependency-from-resolves` and `dependency-self` report that edge on their own. | blocker | none | validator | [skill-authored] |
```

- [ ] **Step 6: Add the nine validator rows after the element-security-rationale-required row (after quality-and-lint.md:213)**

Add one row per id, in INVARIANT_RULES order, each ending `| blocker | none | validator | [skill-authored] |`. Each Rule cell is the §5 rule text without its Message clause:
- `codebase-id-unique`: "No two entries of `meta.codebases[]` share an id."
- `element-codebase-resolves`: "`elements[].codebase` names an entry of `meta.codebases[]`. When `meta.codebases` is absent, every `elements[].codebase` fails it."
- `dependency-from-resolves`: "`dependencies[].from` names an element."
- `dependency-to-resolves`: "`dependencies[].to` names an element."
- `dependency-self`: "`from` and `to` differ."
- `dependency-pair-unique`: "No two edges share `from` and `to`."
- `cause-chain-resolves`: "`causes[].chain` names a chain."
- `cause-chain-self`: §5's text word for word, which starts "`causes[].chain`, resolved to the first chain with that id, is not the chain, by index, …".
- `cause-chain-cycle`: §5's three sentences word for word, which start "Over the links that resolve and are not self-links, …".

- [ ] **Step 7: Reword the dependency-row row (quality-and-lint.md:224)**

Rule cell: `A chain whose function resolves to an element that is the `to` of no edge cites a `catalog_refs[]` id beginning `cat-dependency-`; each such ref is flagged at its `id`.`

- [ ] **Step 8: Add the four lint rows after the repo-ref-form row (after quality-and-lint.md:226)**

Each Rule cell is §6's rule text with three kinds of change. Its references to the design's sections become the parent-walk definition, the bare reviewer id, or `structure-elements.md` for the effective codebase. Its parenthetical message shapes are left out. The `QUALIFIED_REPO_REF` capture-group clause, a code detail, is left out. §6's shared skip rule is stated in the rows that resolve links. Paste the block as it stands:
```text
| `repo-ref-codebase` | While `meta.codebases[]` is present: a qualified `repo` source ref whose `owner/repo` head is the `repo` of no entry is flagged; otherwise a qualified `repo` ref on an element that has an effective codebase, as `structure-elements.md` defines it, whose `repo` is a different repository, is flagged. The `owner/repo` head is the ref's text before its first `@`. It is compared byte for byte, case included, as ids are, with each entry's `repo` (so `Acme/Checkout` and `acme/checkout` are different repositories), and in the second check with the effective codebase's `repo`. One finding per ref, the first check winning, by element index then source index, at the ref's `ref` field, `/elements/<i>/sources/<j>/ref`, as `repo-ref-form` points. Unqualified refs are not checked; an element with no effective codebase, including one whose own or inherited `codebase` names no entry, gets only the first check, and a child does not fall back to a further ancestor; nothing is flagged while the list is absent. | warning | none | machine | [skill-authored] |
| `cause-chain-unlinked` | Let C be the element of the cause's chain and P the element of the linked chain, each reached through its function. Not flagged when P equals C, when P is a descendant of C, or when some edge runs from an element in {C, its ancestors, its descendants} to an element in {P, its ancestors}; an element's ancestors are the elements reached by the `parent` walk, which follows `parent` through the first element of each id, counts the element it starts from as visited, and stops at a `null` parent, a parent that does not resolve, or an id already visited, and its descendants are the elements that have it among their ancestors. Otherwise flagged at the cause's `chain`, by chain index then cause index: the link crosses neither downward containment nor a recorded dependency. A link from a chain on C to a chain on an ancestor of C is therefore flagged unless an edge covers it, because containment makes the part's failure mode a cause on the whole and not the reverse. A warning and not an error, because a team may arrange its hierarchy another way. A link, a function or an element that does not resolve is skipped. | warning | none | machine | [skill-authored] |
| `cause-chain-severity` | When a linked cause is the only cause of its chain, the consumer row is not cascading or metastable, and the provider chain's `ratings.S.value` is below the consumer chain's `ratings.S.value`, flagged at the provider's `/chains/<provider>/ratings/S`, naming the consumer chain; a consumer row is cascading or metastable when its `trigger`, trimmed, is not empty and equals the linked cause's `text`, trimmed, or when one of its `catalog_refs[].id` is exactly `cat-service-01`, `cat-service-02`, `cat-service-03`, `cat-service-05`, `cat-dependency-03` or `cat-dependency-04`. Severity flows from the top of the net, so a provider whose failure is the whole cause of a worse consumer effect is under-rated. Read from `ratings` only, never from `post_ratings`. One finding per (provider, consumer) pair, by provider chain index then consumer chain index. Every other linked pair is left to the reviewer row `linked-pair-severity`. A link, a function or an element that does not resolve is skipped. | warning | none | machine | [skill-authored] |
| `linked-cause-occurrence-drift` | On a cause whose `chain` resolves to a chain other than its own, flagged at the consumer's `/chains/<i>/ratings/O` when the cause has no `cited_o`, or when its `cited_o` differs from the provider's current `ratings.O` in `value`, `evidence_kind` or `evidence_ref`, an absent `evidence_ref` equal only to an absent one. A `cited_o` on a cause with no `chain`, or whose `chain` does not resolve or is a self-link, is flagged at the cause's `cited_o`; a provider without `ratings` is skipped, and so is a cause on a consumer chain without `ratings`. Reads `ratings` only, never `post_ratings`; makes no apportioning judgement, so it covers every linked cause whatever the cause count or the cascading status. One finding per cause, by chain index then cause index. The Occurrence counterpart of `cause-chain-severity`; the reviewer row `linked-cause-occurrence-cited` keeps the judgement on the rationale's words. | warning | none | machine | [skill-authored] |
```

- [ ] **Step 9: Add the five reviewer rows after score-weights-labelled (after quality-and-lint.md:230)**

Copy the five rows of §11's table word for word, in its order: `weak-edges-loss-of-access`, `linked-pair-next-level`, `linked-pair-end-effect`, `linked-cause-occurrence-cited`, `linked-pair-severity`. Each row is `| <id> | <rule text from §11> | warning | none | reviewer | [skill-authored] |`.

- [ ] **Step 10: Add the four linked-pair sentences after the Occurrence/Detection sentence (after quality-and-lint.md:232)**

Add §11's four quoted sentences word for word, one per line, each ending ` [skill-authored]`. They begin:
1. "A linked pair is a chain with a cause whose `chain` names another chain…"
2. "`linked-pair-severity` is the reviewer half of the machine lint `cause-chain-severity`…"
3. "`weak-edges-loss-of-access` is carried under the same id in `scales-software.md`…"
4. "`linked-cause-occurrence-cited` is the reviewer half of the machine lint `linked-cause-occurrence-drift`…"

Line 5's count of 105 is unchanged.

- [ ] **Step 11: Add the methodology row (after methodology.md:93)**

Paste this row after the row `| Effects recorded at more than one level | …` and before `| Controls identified before the evaluation step |`:
`| Failure chains linked across levels | new | A cause may name in `causes[].chain` the chain whose failure mode it is [skill-authored]; the linkage is the skill's own, since no record in the corpus defines a next-higher, focus and next-lower level structure [skill-authored]; MIL-STD-1629A's indenture levels, an ordering of the items analysed, are recorded here as a parallel only, since that record covers the ordering and not the linking of a mode to a cause at the next level up [cites:C131] | [cites:C131] [skill-authored] |`

- [ ] **Step 12: Check the tags and wording**

`git diff -U0 -- skills/fmea-software/references | grep -E '^\+[^+]' | grep -v -E '^\+(#|$)' | grep -v -E '\]( \|)?$'` must print nothing.
`git diff -U0 -- skills/fmea-software/references | grep '^+' | grep -i -e '§' -e 'classical'` must print nothing.
`git diff -U0 -- skills/fmea-software/references | grep '^+' | grep -o 'cites:C[0-9]*' | sort -u` must print exactly `cites:C131`. The check reads added lines only. A whole diff would also print `cites:C055` from the context line 93, the row "Effects recorded at more than one level".

- [ ] **Step 13: Run the test file and watch it pass**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/quality-and-lint.test.ts`
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 14: Run both runners**

`bun tools/run-tests.ts` must exit 0, and the skill suite now counts one more file. `bun tools/check.ts` must exit 0. fallow must report no unused export and no clone in the new test.

- [ ] **Step 15: Commit (no attribution trailer of any kind)**

```bash
git add skills/fmea-software/references/quality-and-lint.md skills/fmea-software/references/methodology.md skills/fmea-software/scripts/quality-and-lint.test.ts
git commit -F- <<'EOF'
Quality and lint: the nine invariants, four lints and five reviewer rows of schema v3, and linked chains in the methodology

The validator-id and machine-lint sentences now follow INVARIANT_RULES
and MACHINE_RULES, and a new test pins both to the code. The
methodology table gains the linked-chains row with its one citation.
EOF
```

### Task A17: structure-elements, design-inputs, scales-software and the catalog

**Files:**
- Modify: skills/fmea-software/references/structure-elements.md:12, 64-65, 70-72, 96, 108, 114, 117, 119-121, 128-129
- Modify: skills/fmea-software/references/design-inputs.md:14, 23, 25, 33, 35-36, 67, 71, 81
- Modify: skills/fmea-software/references/scales-software.md:33, 35
- Modify: skills/fmea-software/references/design-failure-catalog.md:61
- Modify: skills/fmea-software/data/element-vocabulary-v1.json:44
- Regenerate: skills/fmea-software/references/structure-elements.md:19-58, by `node tools/gen-element-vocabulary.ts`, never by hand
- Test: tools/gen-element-vocabulary.test.ts (unchanged; must stay green)

**Interfaces:**
- Consumes: A15's `### Migrate a v2 document` heading in SKILL.md, which the `## Migrating a v2 document` section this task creates in structure-elements.md (Step 7) matches by name; no earlier task fixes that heading. The `reviewer row ids` (`weak-edges-loss-of-access`). The first of A15's seven update-mode sentences (A15 Step 12), which Step 6 restates in full for structure-elements.md:119.
- Produces: none.

This task adds no test. The generated vocabulary region, lines 19-58 of structure-elements.md, is rewritten only by `tools/gen-element-vocabulary.ts`, in Step 13a.

**"of the analysed system" (decision 4, ruled: change the data file).** §13 asks that the boundary table's "of the analysed system" read "of the system this analysis covers", and that the generated vocabulary region be untouched by hand. The phrase lives at structure-elements.md:35, inside that region, and comes from skills/fmea-software/data/element-vocabulary-v1.json:44, the file the report's Vocabulary block also reads. Step 13a edits the data file and regenerates the region, which satisfies both clauses and M5, under which "the analysed system" leaves the vocabulary; Step 13b runs the browser checks, because the report changes.

**Reworded: structure-elements.md:12 (decision 12).** Line 12 said the boundary decides whether the dependency rows apply; once Step 13 places them on any element that is the `to` of an edge, that holds only for an outside element. Step 1a rewords it, a plan addition §13 does not name.

- [ ] **Step 1: Boundary table (structure-elements.md:64-65)**

Line 64 Consequence cell: `Catalog rows by role; the element may be the `to` of an edge when other elements depend on it, and is then an internal dependency`.
Line 65 Consequence cell: `An external dependency: at least one inbound edge is required, and the dependency rows apply on top of the role's rows`.

- [ ] **Step 1a: The three-answers sentence (structure-elements.md:12)**

Replace the line with:
`The three answers are independent of one another: the role says which catalog rows apply, the boundary whether the element must be the provider of an edge, and the flag whether the security rows apply as well. [skill-authored] The dependency rows apply on top of the role's rows to any element that is the provider of an edge, whatever its boundary: an element outside the boundary is always the provider of at least one edge, and an in-scope element gets the rows once another element depends on it. [skill-authored]`

- [ ] **Step 2: Dependencies section (structure-elements.md:70-72)**

Delete line 71 ("Strength stays in the `dependency` block…"). After line 70, insert:
```text

## Dependencies

A dependency is an edge in the top-level `dependencies[]`, from the consumer element in `from` to the provider element in `to`, with its own `strength`, strong or weak, and its `sla` and `limits` as free text in the source's own words, so two consumers can depend on one provider differently. [skill-authored]
A `(from, to)` pair occurs once, and a dependency that is strong for one use and weak for another, such as writes and reads, is one edge at the stronger strength, with the split carried by the chains. [skill-authored]
An edge may cross levels in either direction, so a parent may depend on its child and a child on a sibling or on an element of another root, and two services may depend on each other both ways. [skill-authored]
An element outside the boundary is the `to` of at least one edge and is an external dependency; an `in_scope` element that is the `to` of an edge is an internal dependency; an outside element consumed only by another outside element is allowed. [skill-authored]
Strength moves no rating: it selects the next-level and end readings of `cat-dependency-01`, the one dependency row that gives a reading per strength, read on the provider's row for the strongest edge whose `to` is the provider's element or one of its ancestors, whether or not any cause links the chain, as a default the run checks against the inputs; the other dependency rows have one reading whatever the strength, and the report prints every edge. [skill-authored]
```
The cited sentence (old line 72, `[cites:C014] [cites:C144] [cites:C145]`) stays word for word as the last line of the new section.

- [ ] **Step 3: Conversion sentence (structure-elements.md:96)**

Replace it with:
`When an item gets an edge and the sheet carries no strength for it, the edge's `strength` is `strong` whatever the item's boundary, recorded as a declared substitution: the fail-safe reading assumes the system cannot serve without the element. [skill-authored]`
Then add these two lines after it:
```text
Every outside item, and every in-scope item whose rows carry a strength, an SLA or limits, gets one edge whose `from` is the first in-scope item in sheet order other than itself, with an open assumption owned by `user` that names the edge, the rule that chose its `from`, and whether its strength came from the sheet. [skill-authored]
An in-scope item with no other in-scope item gets no edge, its values going into an open assumption, and a sheet with no in-scope item stops the conversion with the question SKILL.md gives. [skill-authored]
```

- [ ] **Step 4: v1 migration row and unattended sentence (structure-elements.md:108, 114)**

Line 108: replace `the `dependency` block kept` with `the `dependency` block carried into the v2 migration's edge`.
Line 114: `Unattended, every question of this migration takes its stated default and is listed in `meta.assumptions[]` as an open assumption with owner `user`. [skill-authored]`

- [ ] **Step 5: Dependency-row warning sentence (structure-elements.md:117)**

Replace `an in-scope element with no dependency block` with `an in-scope element that is the `to` of no edge`. Replace `giving the element a dependency block` with `giving the element a consumer`. The tag is kept.

- [ ] **Step 6: Update sentences (structure-elements.md:119-120)**

Replace line 119 with this restatement of the first of A15's update-mode sentences: "A role or a boundary the person changes afterwards goes through the update mode's ordinary stale rule, under which an element changed when its `kind`, `boundary` or `security_relevant` changed or when an edge whose `to` is the element was added, removed or changed. [skill-authored]". After it, insert §13's two quoted sentences word for word, one per line:
1. "The rows this rule reaches are the set `update-check.ts` computes; …"
2. "While `meta.codebases[]` is present and, for an entry that at least one element has as its effective codebase, the new inputs restate none of those elements, ask before the diff, … naming each such codebase. [skill-authored]"

Line 120 becomes: `Every other element field does not count: the name, the description and `codebase` are labels, and `sources` and `security_rationale` record why, not what. [skill-authored]`
These sentences stay in the `## Migrating a v1 document` section, where line 119 stands, because §13 places them after the update sentence it rewrites. They are update-mode rules that a migrated document meets afterwards, and Step 7's new section ends by pointing back to the update mode's ordinary rules.

- [ ] **Step 7: Add the `## Migrating a v2 document` section (after structure-elements.md:121, before `## Runs over several codebases`)**

```text

## Migrating a v2 document

A document written against schema v2, by 0.3.x to 0.5.x, carries a `dependency` block on an element in place of an edge, and is migrated by the skill's update mode and recorded in `meta.history`, never by hand. [skill-authored]
It runs alone, never in the same update as an architecture change, and bumps `meta.version`; when it writes the migrated JSON it ends with `priority.ts --write`, `validate.ts --write` and `render.ts`, and when it writes nothing it runs none of them. [skill-authored]
`update-check.ts` refuses a v2 document as its stored copy, so the migration runs no structural check. [skill-authored]
`dependencies[]` is created when absent and kept when present, and a document with no block and no array gets an empty array. [skill-authored]
Each element's `dependency` block becomes an edge whose `to` is the element and whose `strength`, `sla` and `limits` are the block's, one edge unless a rule below makes several or none, and the block is removed. [skill-authored]
The edge's `from` is the element's nearest `in_scope` ancestor. [skill-authored]
For a provider with no in-scope ancestor, `from` is the one other in-scope root when exactly one exists; when several exist the person is asked and may name one or more consumers, each of which gets an edge, and unattended the first such root in document order is taken and listed in `meta.assumptions[]` as an open assumption owned by `user` that names the other in-scope roots as candidates. [skill-authored]
When no other in-scope root exists, an `in_scope` provider has its block dropped and gets no edge, and the drop is listed as an open assumption owned by `user` that carries the block's strength, SLA and limits. [skill-authored]
An outside provider in that case cannot validate without an edge, so the person is asked to name a consumer, which may be a nested in-scope element; unattended, this is the one question of the migration with no default, and the whole update stops: the file is left as it was, with no edge, no history entry and no version bump, the v1 half of a combined update included, and the final message names each outside provider that has no consumer and asks for one. [skill-authored]
An edge the migration would make whose `(from, to)` is already an edge of the existing array is not added: the existing edge is kept as it is, and where the block's strength, SLA or limits differ from it, the difference is listed in `meta.assumptions[]` as an open assumption owned by `user` that carries the block's values. [skill-authored]
A v1 document runs the v1 migration and then this one in the same update, with every v1 boundary decision, answered or defaulted, settled before any `from` is chosen: one version bump and one history entry naming both. [skill-authored]
```
After it, add §13's two quoted stale sentences word for word, one per line:
1. "Migration marks no row stale: the edge carries what the block carried, and strength moves no rating. [skill-authored]"
2. "Every chain on an element whose `dependency` block was `weak` is named, by id, in one open assumption owned by `user`, … until an update marks the row stale. [skill-authored]"

Then add:
```text
That assumption is written the same attended and unattended, and none when no block was `weak`; it closes when every chain it names is settled, by nothing moving, by an edge change that re-read it, or by the open assumption on its edge's strength, and an update that settles some of them rewrites it to name the rest. [skill-authored]
The migration adds no codebase and no link; both are later work for the person through an ordinary update, and the final message says so, says that until links exist an edge change marks only the provider's rows stale, and names the chains the weak-block assumption lists or says that no block was `weak`. [skill-authored]
The history entry names each edge made with its `from` and the rule that chose it, each existing edge kept in place of a derived one, and the chains the weak-block assumption lists. [skill-authored]
A role, a boundary, an edge or a link the person changes or adds afterwards goes through the update mode's ordinary rules. [skill-authored]
```

- [ ] **Step 8: Rewrite "Runs over several codebases" (structure-elements.md:128-129)**

Replace line 128 with:
`Step 1 lists every codebase the run covers or reads in `meta.codebases[]`, each with its repository in the `owner/repo` form and, for part of a monorepo, its `path`; `meta.boundary.included` describes what inside them is covered, and a codebase whose repository the inputs do not name is an open assumption and not an entry. [skill-authored]`
Replace line 129 with §13's text, split so that each sentence carries its own tag:
`In a run over several services, each service is a depth-1 element with no artificial root above them, because the report groups and counts chains by root; one product spread over several repositories may stay one root whose children name their codebases. [skill-authored] The depth cap of 4 stays. [skill-authored]`
§13 quotes these two sentences under one closing tag. The split is deliberate: provenance.md:23 puts a tag at the end of the sentence it covers, and provenance.md:26 reports a sentence with no tag as untagged. The words are otherwise §13's.
Then append the two effective-codebase sentences of §13, each tagged:
```text
An element's effective codebase is its own `codebase` when it sets one; otherwise, when the element and its parent are both `in_scope`, its parent's effective codebase; otherwise none. [skill-authored]
An element outside the boundary neither inherits a codebase nor passes one down, so an in-scope element under an outside parent has an effective codebase only when it sets one, whatever the parent sets. [skill-authored]
```

- [ ] **Step 9: design-inputs.md checklist (lines 14, 23, 25)**

Item 4 cell: `For every element that is the provider of an edge, whatever its boundary, the availability SLA and the scaling limits.` Its tags `[paraphrased:C014] [skill-authored]` stay.
After line 23, append the row `| 14 | Codebases | The repositories the run covers or reads, each with its owner and name, the folder inside a monorepo, and the team that owns it when known, found in the service catalog and the organisation's repository hosting; ask for them when the inputs omit them. | [skill-authored] |`.
Line 25: replace `Items 1 to 4 are the structure inputs` with `Items 1 to 4 and 14 are the structure inputs`.

- [ ] **Step 10: design-inputs.md dependencies paragraph (lines 33, 35, 36)**

Line 33: `This skill asks for it on every element that is the provider of an edge, a `skill-authored` extension. [skill-authored]`
Line 35: `In the analysis JSON this lands on the edge from the consumer to the provider in `dependencies[]`: `strength` holds strong or weak, `sla` and `limits` hold the commitment and the limits as free text in the source's own words. [skill-authored]`
Line 36: `An element whose boundary is `owned_outside` or `third_party` is the provider of at least one edge and is an external dependency; an `in_scope` element that is the provider of an edge is an internal dependency. [skill-authored]`

- [ ] **Step 11: design-inputs.md unattended exception, own items and Where row (lines 67, 71, 81)**

After line 67, insert: `The exception is an answer the document cannot validate without, or a removal the update rules put to the person, which the migration, conversion and update rules name: the run does not proceed without it, writes nothing and ends with the question. [skill-authored]`
Line 71: `The contract files and the data flows are the skill's own checklist items, because the research produced no record on interface or data-flow inputs. [skill-authored]`
After line 81, the Component inventory row, insert `| Codebases | The service catalog; the organisation's repository hosting. | [skill-authored] |`.

- [ ] **Step 12: scales-software.md (lines 33, 35)**

Line 33: replace the clause `` `element-changed` re-reads S and O from the rewritten end effect and the changed dependency fields, `` with §13's clause in place, keeping the list's order (control-removed, element-changed, function-changed, scales-version), as §10's "one phrase" asks. The sentence then reads:
`An update-mode re-rating carries forward: a stale row keeps its prior value on every factor the stale reason did not touch, `control-removed` re-reads D only, `element-changed` re-reads S from the end effect as the update rewrites it on the stale row, and O from that end effect and, where an edge changed, the SLA and limits, as they now stand, of the edge whose addition, removal or change marked the row stale, the same on the provider's rows and on a consumer row whose cause links into one of them; a consumer row's O rationale cites the provider's O and its evidence, recorded in the cause's `cited_o`, and where both rows are stale the provider's row is re-rated first; `function-changed` re-reads S, and `scales-version` re-reads all three. [skill-authored]`
Line 35: replace it with:
`Dependency strength moves no rating; a loss-of-access end effect on a chain whose function belongs to an element that is the `to` of at least one edge, every such edge weak, is recorded as an open assumption on the edges' strength, owned by `user`, and Severity is rated on the end effect as written. [skill-authored] That check is the reviewer row `weak-edges-loss-of-access`, which `quality-and-lint.md` carries under the same id. [skill-authored]`
The line `scales version: 1` is unchanged.

- [ ] **Step 13: Catalog placement line (design-failure-catalog.md:61)**

Replace `any element outside the analysis boundary — boundary `owned_outside` or `third_party` — and to any in-scope element that carries a `dependency` block` with `any element that is the `to` of an edge`. The line then reads `Placement: these rows apply to any element that is the `to` of an edge, on top of its role's rows; that is exactly … [skill-authored]`.

- [ ] **Step 13a: The in-scope test in the vocabulary data file (element-vocabulary-v1.json:44)**

In the `boundaries` entry whose `id` is `in_scope`, replace the `test` value `This analysis covers it: its sources are the repository, documents, incidents or people of the analysed system` with `This analysis covers it: its sources are the repository, documents, incidents or people of the system this analysis covers`. The entry's `basis` and `tags` are unchanged. Then run `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node tools/gen-element-vocabulary.ts`. Expected: exit 0, and `git diff -U0 -- skills/fmea-software/references/structure-elements.md | grep '^@@'` shows exactly one hunk inside lines 19-58, at line 35, whose only change is that cell (decision 4).

- [ ] **Step 13b: Run the browser gate and the comparison, because the report's Vocabulary block reads the data file**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node tools/check-browser.ts && node tools/compare.ts --base HEAD`. Expected: the gate exits 0 with no `## not asserted` line, and `EXPECTED_FAILURES` and `NOT_ASSERTED` stay empty; the comparison exits 0 and build/compare/summary.md lists changed views of the `structure` part only, the In scope row of the vocabulary box. Open each changed view's three images. A changed view of any other part is a finding. Then run `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node tools/compare.ts` against the branch point, which must exit 0; read its summary.

- [ ] **Step 14: Check the tags, the wording and the generated region**

`git diff -U0 -- skills/fmea-software/references | grep -E '^\+[^+]' | grep -v -E '^\+(#|$)' | grep -v -E '\]( \|)?$'` must print nothing.
`git diff -U0 -- skills/fmea-software/references | grep '^+' | grep -i -e '§' -e 'classical' -e 'cites:' -e 'paraphrased:C'` must print exactly three lines: the design-inputs.md item 4 row, ending `[paraphrased:C014] [skill-authored] |`; the rewritten scales-software.md:33, which keeps its existing `[paraphrased:C090]` (Step 12 changes one clause of that line, so the whole line is an added line); and the regenerated In scope row of structure-elements.md:35, ending `[cites:C143] [cites:C146] [cites:C134] [cites:C149] [skill-authored] |`.
`grep -c 'cites:C014\] \[cites:C144\] \[cites:C145\]' skills/fmea-software/references/structure-elements.md` must print 1, because the cited sentence is kept unchanged as context and so never appears as an added line.
`git diff -U0 -- skills/fmea-software/references/structure-elements.md | grep '^@@'` must show exactly one hunk inside lines 19-58, the one Step 13a's regeneration wrote at line 35.

- [ ] **Step 15: Run the vocabulary test**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test tools/gen-element-vocabulary.test.ts`
Expected: `# fail 0`.

- [ ] **Step 16: Run both runners**

`bun tools/run-tests.ts` must exit 0, with both suites at `# fail 0`. `bun tools/check.ts` must exit 0.

- [ ] **Step 17: Commit (no attribution trailer of any kind)**

```bash
git add skills/fmea-software/references/structure-elements.md skills/fmea-software/references/design-inputs.md skills/fmea-software/references/scales-software.md skills/fmea-software/references/design-failure-catalog.md skills/fmea-software/data/element-vocabulary-v1.json
git commit -F- <<'EOF'
References: dependencies as edges, codebases and linked chains in the structure, inputs, scales and catalog

structure-elements.md gains a Dependencies section, the edge rule of
the update mode, a section on migrating a v2 document and the
effective-codebase rule; design-inputs.md asks for edge providers and
codebases; the scales drop the weak-dependency exclusion; the catalog
places the dependency rows on any element that is the to of an edge.
The in-scope boundary test no longer names 'the analysed system'; it is
regenerated from the vocabulary data file, and line 12 says that the edges,
not the boundary, decide the dependency rows.
EOF
```

### Task A18: README, scripts page, main design amendment notes and version 0.6.0

**Files:**
- Modify: .claude-plugin/plugin.json:3
- Modify: skills/fmea-software/scripts/lib/version.ts:7
- Modify: README.md:5, 47, 69, 71, 96, 118, 120 (append after), 130, 137 (append after)
- Modify: docs/scripts.md:5, 7, 16 (append after), 22 (append after), 31 (append after)
- Modify: docs/specs/2026-09-07-fmea-software-design.md:139, 150, 211, 212, 215, 227, 233 (append after), 237, 261
- Test: skills/fmea-software/scripts/validate.test.ts (the existing version test at :318)

**Interfaces:**
- Consumes: the `update-check.ts CLI` and its codes, `UPDATE_BASELINE` and `UPDATE_MISMATCH` (both exit 2). The `DEPENDENCY_LEGACY issue`, with range 0.3.x to 0.5.x. The README and docs/scripts.md `update-check.ts` rows, which this task writes itself in Steps 8 and 9. The `### Migrate a v2 document` heading of A15, named in Step 11.
- Produces: `export const PLUGIN_VERSION: string = "0.6.0";` and `"version": "0.6.0"` in plugin.json.

- [ ] **Step 1: Set the manifest version first (.claude-plugin/plugin.json:3)**

`"version": "0.6.0",`

- [ ] **Step 2: Run the version test and watch it fail**

`source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && node --test skills/fmea-software/scripts/validate.test.ts`
Expected: one failure, "the version validate.ts --write records is the version in .claude-plugin/plugin.json", with the message "scripts/lib/version.ts and .claude-plugin/plugin.json give different versions; a release changes both".

- [ ] **Step 3: Set PLUGIN_VERSION (skills/fmea-software/scripts/lib/version.ts:7)**

`export const PLUGIN_VERSION: string = "0.6.0";`

- [ ] **Step 4: Run the version test and watch it pass**

Run the same command. Expected: `# fail 0`.

- [ ] **Step 5: README status and limitations (README.md:5, 96)**

Line 5: replace `It is version 0.4.1,` with `It is version 0.6.0,`.
Line 96: replace `0.4.1 is a pre-release.` with `0.6.0 is a pre-release.`. At the end of that paragraph, append the format-change line: `0.6.0 also changes the format of the analysis to schema v3, so an analysis written with 0.3.x to 0.5.x needs a one-time migration, as [Compatibility between versions](docs/scripts.md#compatibility-between-versions) describes.`
Lines 61 and 110 and the evaluation paragraphs at 98-105 are left for B6.

- [ ] **Step 6: README inputs sentence and What you get (README.md:47, 69, 71)**

Line 47: replace `the dependencies and their limits, incident history,` with `the dependencies and their limits, the codebases and their repositories, incident history,`.
Line 69: `  - the structure of the system, with a table of its top-level elements and a table of its dependencies`.
Line 71: `  - one section per chain, grouped by top-level element`.

- [ ] **Step 7: README Not in this version (README.md:118, after 120)**

Line 118: replace `or with a dependency block` with `or that is the provider of an edge`.
After line 120, append the bullet `- One analysis has one owner and one tracker target, and an update re-reads the whole analysis; updating one codebase alone, and a tracker per team, are later work.`

- [ ] **Step 8: README scripts section (README.md:130, after 137)**

Line 130: `The skill has Claude run five scripts and take every priority from them. The fifth, `update-check.ts`, is the one the update mode runs. You can also run them directly with `node`. All five are in `skills/fmea-software/scripts/`.`
After line 137, add the row: `| `update-check.ts <stored copy> <draft> [--check]` | Compares an update's draft with the analysis as it was stored, prints the dependency and element changes, the rows they mark stale and the order to re-rate them in, and with `--check` refuses a draft whose stale flags disagree. It writes nothing. |`
The example-report link at line 3 stays, because tools/check.test.ts:365 pins it.

- [ ] **Step 9: docs/scripts.md counts and table row (lines 5, 7, after 16)**

Line 5: `During a session, the skill has Claude run five scripts. Claude takes every priority from them, and does not work one out itself. You can also run them directly with `node`. `validate.ts`, `priority.ts`, `render.ts` and `update-check.ts` have no dependencies. `track.ts` needs `gh`, installed and signed in, for a GitHub target, and `acli` for a Jira target. All five are in `skills/fmea-software/scripts/`.`
Line 7: replace `All four scripts refuse` with `All five scripts refuse`.
After line 16, add the same `update-check.ts` row as in README Step 8.
Lines 23 and 25 keep `all four scripts`.

- [ ] **Step 10: docs/scripts.md update-check.ts paragraph (after line 22, before the table-file paragraph)**

```text
`update-check.ts` runs in the update mode of the skill, before `priority.ts`. It reads two files: the stored copy, which is the analysis as it was before the update, and the draft, which is the analysis the update is writing. It writes nothing. It prints the changes to the dependencies and the elements, the failure chains those changes make stale with the rule that reaches each one, the chains the rules leave unmarked, each link into a removed chain, each element outside the analysis that is left with no consumer, and the order to re-rate the stale chains in. Claude copies its edges, elements and stale sections and its last line, the summary line, into the history of the analysis, so the history records what changed, each chain marked stale with the rule that reached it, and that the checker ran. It refuses a stored copy that is not the draft's baseline with `UPDATE_BASELINE`: a copy with another id, a copy written against an earlier schema, or a version that does not fit. With `--check`, it also refuses a draft whose stale flags, ratings or links disagree with the rules, with one `UPDATE_MISMATCH` line for each finding. Both refusals exit with status 2.
```

- [ ] **Step 11: docs/scripts.md compatibility paragraph (after line 31)**

The paragraph goes directly after the 0.3.0 paragraph, so that the two schema changes, v2 and v3, sit side by side, one paragraph each. Lines 33-35 are not ordered by version: they cover the tracker refusals of 0.1.0 to 0.3.0 and stale results in general, so they stay after both schema paragraphs.
```text

Version 0.6.0 changes the analysis schema to v3. Dependencies are now edges in a top-level list, from the element that depends to the element it depends on, and a cause may link to another failure chain. `validate.ts`, `render.ts` and `track.ts` refuse an analysis written against 0.3.x to 0.5.x with one `DEPENDENCY_LEGACY` line. The line names the section of `SKILL.md`, "Migrate a v2 document", under which the skill migrates such an analysis in a session. No script performs the migration. An analysis written against 0.2.x or earlier is refused with `KIND_LEGACY`, and the skill runs both migrations in one update. An earlier version of the plugin refuses a v3 analysis with schema lines, because its schema rejects the new top-level part. An update at 0.6.0 runs one more script, `update-check.ts`.
```

- [ ] **Step 12: Main design amendment note for §5 (2026-09-07-fmea-software-design.md:139)**

Append to the line:
` (amended 2026-10-08 by the multi-codebase design, `2026-10-08-multi-codebase-design.md` §10 and M10: conversion and update are still performed by the skill; `update-check.ts` computes and checks the structural part of an update's stale set and performs nothing, a narrow departure from 'no script implements them'; an update whose inputs do not cover a codebase asks before removing it.)`
§14 quotes this note without the file name. The plan adds `2026-10-08-multi-codebase-design.md` so that this note has the element-kinds form that §14's general sentence asks for, the same form as the other eight notes. Decision 5 records the difference from §14's quoted text.

- [ ] **Step 13: Amendment note for §6 (line 150)**

Append:
` (amended 2026-10-08 by the multi-codebase design, `2026-10-08-multi-codebase-design.md` §4, §5 and §10: schema v3 has five authored parts, `meta`, `elements`, `functions`, `dependencies` and `chains`, with `computed` after them; the element's `dependency` is removed, and a dependency is an edge in the top-level `dependencies[]`, `{from, to, strength, sla?, limits?}`, from the consumer to the provider, an element whose boundary is not `in_scope` being the `to` of at least one edge; `meta.codebases[]` (`{id, name, repo, path?}`) is optional, and `elements[].codebase?` names one of its entries; `causes[].chain?` names the chain whose failure mode the cause is, and `causes[].cited_o?` records that chain's `ratings.O` as the consumer's O rationale cited it, which the lint `linked-cause-occurrence-drift`, one of the four machine lints that bring the count to fifteen, compares with the provider's current rating; nine invariants are added on the codebase ids, the edges and the links, acyclicity among them; and each update's summary in `meta.history` also names the chains and edges removed, each link dropped or repointed, and the consumer causes whose linked chain had its failure mode rewritten or its O re-rated.)`

- [ ] **Step 14: Amendment notes for §8 (lines 211, 212, 215)**

Line 211, append: ` (amended 2026-10-08 by the multi-codebase design, `2026-10-08-multi-codebase-design.md` §11: the dependency rows apply to any element that is the `to` of an edge in `dependencies[]`, on top of its role's rows.)`
Line 212, append: ` (amended 2026-10-08 by the multi-codebase design, `2026-10-08-multi-codebase-design.md` §13: SLA and scaling limits are captured for every element that is the provider of an edge; strength, SLA and limits land on the edge from the consumer to the provider; and a fourteenth item, the codebases the run covers or reads with their repositories and owning teams, joins the structure inputs.)`
Line 215, append: ` (amended 2026-10-08 by the multi-codebase design, `2026-10-08-multi-codebase-design.md` §5, §6 and §11: nine invariants on codebase ids, edges and cause links join the validator ids after `element-security-rationale-required`; the file counts fifteen machine lints, adding `repo-ref-codebase`, `cause-chain-unlinked`, `cause-chain-severity` and `linked-cause-occurrence-drift`, and `dependency-row-without-dependency` reads the edges; five reviewer rows, `weak-edges-loss-of-access` and four on the linked pair, follow `score-weights-labelled`.)`

- [ ] **Step 15: Amendment notes for §9 (lines 227, after 233, 237)**

Line 227 (validate.ts), append: ` (amended 2026-10-08 by the multi-codebase design, `2026-10-08-multi-codebase-design.md` §6 and §7: after the v1 check and before the schema, a v2 document, one with no top-level `dependencies` or with an element carrying a `dependency` block, is refused with one `DEPENDENCY_LEGACY` line naming the migration, and `render.ts` and `track.ts` refuse it the same way; the lint `linked-cause-occurrence-drift` joins the machine lints with three others.)`
After line 233 (track.ts), add the paragraph:
```text

**`update-check.ts <stored copy> <draft> [--check]`.** (amended 2026-10-08 by the multi-codebase design, `2026-10-08-multi-codebase-design.md` §10: added.) Reads the analysis as it was stored before an update and the update's draft, runs the legacy gate and the schema stage on both, and writes nothing. It prints the edge and element diff, the `element-changed` rows with the rule that reaches each, the rows the rules leave unmarked, each link into a removed chain, each outside element left with no consumer and the re-rating order, then a summary line; the update copies the edges, elements and stale sections and that line into `meta.history`; with `--check` it also prints the consumer causes whose linked chain changed and refuses a draft whose stale flags, ratings outside the stale set or links into removed chains disagree with the rules (`UPDATE_MISMATCH`). On either run it refuses a copy that is not the draft's baseline (`UPDATE_BASELINE`); both codes exit 2.
```
Line 237 (report contents), append: ` (amended 2026-10-08 by the multi-codebase design, `2026-10-08-multi-codebase-design.md` §12: the header gains a Codebases row after the security boundary when `meta.codebases[]` is present; the structure section reads, in order, a table of the top-level elements with their codebase and counts, the vocabulary box, the tree, whose lines name each element's effective codebase when the document has codebases, and a Dependencies table of the edges, and the element facts lose their dependency line; the chain rows are grouped in one section per top-level element under an `h3` heading, each row heading an `h4`; a linked cause names the provider's row, and a row other chains link into carries a "Propagates to" line.)`

- [ ] **Step 16: Amendment note for §10 (line 261)**

Append: ` (amended 2026-10-08 by the multi-codebase design, `2026-10-08-multi-codebase-design.md` §16: rubric 3 adds c14, edges and codebases, for prompts 1 and 6, and c15, the cross-service trace, for prompt 1, neither a must, so the maxima become 26 for prompt 1 and 24 for prompt 6; prompts 1, 6 and 7 run twice at high under rubric 3 into `build/evals/multi-codebase`, and their results are `docs/specs/2026-10-08-multi-codebase-eval-results.md`.)`

- [ ] **Step 17: Check the notes and version lines**

`git diff -- docs/specs/2026-09-07-fmea-software-design.md | grep '^+' | grep -c 'amended 2026-10-08 by the multi-codebase design'` must print 9.
`git diff -U0 -- docs/specs/2026-09-07-fmea-software-design.md | grep '^+' | grep 'amended 2026-10-08 by the multi-codebase design' | sed 's/.*amended 2026-10-08 by the multi-codebase design//' | grep -c 'private repository'` must print 0. This check reads only the text from each new note's opening onward. Lines 150, 211 and 261 already end in a 2026-10-07 element-kinds note that names "the private repository nzneit/failwise-research", so a check over the whole rewritten lines would print 3 even when the work is correct.
`grep -rn '0\.4\.1' README.md docs/scripts.md .claude-plugin/plugin.json skills/fmea-software/scripts/lib/version.ts` must print nothing.

- [ ] **Step 18: Run both runners**

`bun tools/run-tests.ts` must exit 0, with both suites at `# fail 0`, and tools/skill-copy.test.ts sees validator_version 0.6.0 equal to the manifest. `bun tools/check.ts` must exit 0.

- [ ] **Step 19: Commit (no attribution trailer of any kind)**

```bash
git add README.md docs/scripts.md docs/specs/2026-09-07-fmea-software-design.md .claude-plugin/plugin.json skills/fmea-software/scripts/lib/version.ts
git commit -F- <<'EOF'
Docs: the README, the scripts page and the main design for schema v3, at version 0.6.0

The README and the scripts page name update-check.ts as the fifth
script and describe the v3 format and its migration; the main design
carries dated amendment notes pointing at the multi-codebase design;
plugin.json and version.ts both read 0.6.0.
EOF
```

Plan A ends with this commit. One Fable acceptance judge then checks the branch against the parts of §19 that plan A delivers, and no more:
- item 1;
- item 3;
- item 4;
- item 5, except the maintainer's `tools/public-audit.ts` run, which happens before the pull request is opened and stays unverified until then. The judge is told that §13's "of the analysed system" change was made in the vocabulary data file and regenerated into structure-elements.md:35 (A17 Step 13a, decision 4), and that structure-elements.md:12 was reworded for the edges (A17 Step 1a, decision 12) as a plan addition §13 does not name;
- item 7, limited to the README (less its run-result sentences, which belong to plan B), `docs/scripts.md`, the main design's amendment notes and the two version files. The rubric and its code sites belong to plan B;
- item 8, limited to its first clause: `update-check.ts --check` exits 0 with `update/before.fmea.json` as the stored copy against the draft the test builds, as `update-check.test.ts` pins it. The session-check runs and the results note belong to plan B;
- item 9, limited to the head recording the ownership answer, dated, with §17's first two items standing as later work. The pull request body belongs to plan B.

Items 2 and 6, and the parts left out above, go to plan B's gate. Anything the judge cannot check is reported as unverified, never as a pass. Report the judge's tier and count with the run.
