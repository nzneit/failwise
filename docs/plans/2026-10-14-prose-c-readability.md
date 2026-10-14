# Prose Implementation Plan, part C: readability (stage 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the skill's instructions easier for a person or an agent to read and maintain without moving a rule: `SKILL.md` becomes lead-plus-list, the procedural sections of the references are rewritten under a one-page style rule, a prose checker ratchets the counts against a baseline and fails closed, and a round shows no pair scoring worse than at stage 1.

**Architecture:** The checker comes first (C1, C2), is wired into `tools/check.ts` as a fourth step, and writes its baseline on the stage-1 text before any stage-2 edit, so every later commit is measured. The style rule (C3) is the brief every drafter reads. `SKILL.md` is rewritten section by section by Opus drafters, each checked by a rule-preservation critic, assembled by the controller, measured, pinned, re-checked by the private distill Recheck and committed with its lowered baseline (C4). The references' procedural sections follow in three groups, one commit per file (C5 to C7). C8 runs the round, writes the note and the acceptance note, and ends at the Fable final acceptance and the user's gate.

**Tech Stack:** TypeScript run directly by Node 24.2 or later (`node:test`, `node:assert/strict`), `tools/check.ts`'s injected `Host` for the runner tests, the Workflow tool for drafting and critique, the private repository's `distill.js` Recheck, `tools/run-eval.sh` and `evals.js` as in parts A and B.

**Spec:** `docs/specs/2026-10-14-prose-design.md` at commit 7506ffe on branch `prose` (worktree `/home/nn/Projects/failwise/.claude/worktrees/prose`). Sections 7, 8.4, 9, 11.2 and 12 of the spec are this plan's scope, with §4.3 (frozen text). Parts A and B have run and their rounds are recorded. Part A's "How to read this plan" and Global Constraints apply here unchanged.

## How to read this plan

- Tasks C1 to C8 run in order on branch `prose`, after part B's gate. Task ids are the only names used across tasks.
- Line numbers in **Files** blocks are those of commit 7506ffe for files part B did not touch; for `SKILL.md`, `design-inputs.md` and `quality-and-lint.md` each task quotes its anchor text, because part B moved their lines (B6 adds about nine lines between `SKILL.md:35` and `:42`; B2 and B3 add two rows after `quality-and-lint.md:243`).
- The implementing agent's Bash tool runs zsh and, in a worktree session, refuses `source`, `PATH=` prefixes and `cd` into another checkout. Run the suites as `bun tools/run-tests.ts` and `bun tools/check.ts`, the prose checker as `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/check-prose.ts` from the worktree root.
- No task in this plan changes the renderer, the template or the golden fixture, so no task runs the browser checks.
- Drafters return text; they never write a file. The controller assembles a file from the returned sections, runs the checks and commits. A drafter and its critic loop until the critic passes or three rounds are spent; a section still failing after three is unverified and goes to the controller, never silently kept.
- Model tiering (§9): drafters and rule-preservation critics run on Opus; the prose checker and the pinned-literal tests are scripts; the private Recheck is Opus; C8's judging runs the existing `evals.js` tiers; the final acceptance is **Fable (3)**, one call planned, plus one more if it rules `revise`. Every report names the tier of each phase and the Fable calls actually made.

## Global Constraints

The Global Constraints of parts A and B apply unchanged. In addition:

- Stage 2 touches only §7.1 (`SKILL.md`) and §7.2 (the named procedural sections) and keeps every frozen literal of §4.3 and every stage-1 placement; the descriptive sections and `rubric.md` are left alone (D5, D14). A commit that lowers a count lowers `dev/prose-baseline.json` in the same commit.
- The style rule's caps, quoted from §7.6: an instruction sentence at most **20** words, a description sentence at most **25**, a procedural paragraph at most **six** sentences, then it becomes a list. The checker counts **sentences over 25 words**; the 20-word cap on instructions is the drafter's rule, checked by the critic.
- Tags (§7.4): one tag per sentence outside a table, per bullet, and per table row in its Provenance column; a bullet carries one tag at its end and may hold several sentences; a bullet that would mix sources is split; a split sourced sentence keeps its tag on each part and is split at a clause boundary only, never reworded.
- Vocabulary (§7.5), in skill-authored sentences only: `need` for `require` (outside the four `*-required` invariant ids, JSON Schema's `required`, the DORA definitions, NIST's "a required security property" and the licence-obligation sense), `do` or `make` for `perform` (outside the MIL-STD-1629A title and Occurrence anchor row 8), `through` for `via`, `more` for `additional`, `obey` for `follow` only where the sense is obey (the three sentences: `SKILL.md`'s "follow rule 6 of `references/work-tracking.md`", `methodology.md:5`, `quality-and-lint.md:180`). Never: `check` for `verify`, `end`/`stop` for `terminate`, `change` for `modify`, `start` for `initiate`, `try` for `attempt` (the skill's `attempt` is a noun). `test` stays as a noun everywhere; of its four verb uses, two sit in sections this plan rewrites and are skill-authored, `design-failure-catalog.md:97` ("re-tested") and `methodology.md:146` ("are tested as properties"), and are rewritten without the verb only under decision 6; the other two, catalog `:82` ([paraphrased:C127]) and `:112` (a row outside §7.2), stay. `near` replaces `close` only for distance at `design-failure-catalog.md:66`, a sourced row ([adapted-from:C014]) outside §7.2 that §7.4 forbids rewording, so on this branch it applies nowhere (decision 6). Words the skill uses in more than one sense are not unified; no new sense is introduced and the schema's word is preferred.
- Exact values this plan ships:
  - the checker's scope: `skills/fmea-software/SKILL.md` and every `skills/fmea-software/references/*.md` (ten files); `evals/rubric.md` is outside it (D14).
  - the filler list: `basically`, `essentially`, `simply`, `actually`, `in order to`; never a modal.
  - the exempt regions: in `references/structure-elements.md` the lines between `<!-- vocabulary:start -->` and `<!-- vocabulary:end -->` (lines 19 and 58); in `references/provenance.md` lines 55 to 129, from `## The source register` to the line before the next heading (`## IEC 60812:2018` is line 130, and is measured).
  - the baseline file `dev/prose-baseline.json`: `{ "<repo-relative path>": { "untagged": n, "long": n, "filler": n } }`, keys sorted, tracked (`.gitignore` ignores nothing under `dev/` but `node_modules`).
  - the description limit (§11.2, verified 2026-10-14 against the Agent Skills specification and the Anthropic platform documentation): `description` is capped at **1,024** characters there and truncated at 1,536 in Claude Code's skill listing; `SKILL.md`'s description is **1,178** characters today (§11.2's 1,183 counts bytes: the value after `description: ` is 1,182 bytes, the two em dashes being three bytes each, plus its newline) and is shortened to 1,024 or fewer in C4, counted in characters.
  - the round (§8.1, §8.4): prompts 1, 5, 6, 7 at high and medium, two runs each, on `deepseek-flash`; `build/evals/prose-2/`; note `docs/specs/2026-10-14-prose-eval-results-2.md`; acceptance note `docs/specs/2026-10-14-prose-acceptance.md`; the stage-1 round of record is `prose-1b` when part B's B7 Step 5 ran, else `prose-1`.
- Test style, fallow, tsc, coded lines and commit style as in part A. `tools/check-prose.ts` is a `tools/*.ts` fallow entry; each of its exports is imported by `tools/check-prose.test.ts`, and `tools/check.ts` spawns it as a script and imports nothing from it.

## Review Focus

Five conditions the spec implies but no task's own tests name first. Each line gives the behaviour a reasonable person would expect and the task whose tests pin it.

1. **A bullet whose tag is followed by a link** (`[skill-authored] [design-failure-catalog](references/design-failure-catalog.md)`, the shape of `SKILL.md` step 4, line 38 at 7506ffe). The bullet is tagged because it carries a tag, not because its last characters are one; the link is not read as a tag, and the sentence split keeps the tag with the sentence before it. C1 pins it.
2. **A `#` line inside a fenced block.** It is code, not a heading: the fence rule precedes the heading rule, and the block's lines are not measured. C1 pins it.
3. **A table cell holding a sentence over 25 words.** It counts under `long` for its row's heading, and the row's tag is read from the Provenance cell alone. C1 pins it.
4. **Regenerating the vocabulary region** (`tools/gen-element-vocabulary.ts`). The region is exempt, so a regeneration moves no count and the ratchet does not fire on it. C1 pins the exemption; C5's `structure-elements.md` commit runs the generator's test.
5. **Lowering a count without lowering the baseline, or raising the baseline.** The baseline-not-above-measured test fails on the first; `--write-baseline` refuses a rise on the second; so the baseline moves with the text in the same commit and only downward. C1 pins both.

## Decisions for the user at plan review

1. **`work-tracking.md` has no distill Recheck target** (the private `distill.js` names nine reference files and `SKILL.md`; `work-tracking.md` arrived later). Its stage-2 pass gets the Opus rule-preservation critic and the prose checker, and the acceptance note names it as the one file the Recheck did not cover. Default: as written. Alternative: an Opus checker with the Recheck's own prompt, run by hand.
2. **The description is shortened to 1,024 characters or fewer and triggering is checked by the user's `/skill-doctor` report**, quoted in the acceptance note, because the eval rounds name the skill explicitly and measure no triggering, and `/skill-doctor` is a user-invoked command. Default: as written. Alternative: a `claude plugin eval` suite with a `tool_used: Skill` grader over three prompts, which is its own small design.
3. **The prose check is spawned by `tools/check.ts` as a fourth step** (`tools/check-prose.ts` under the resolved Node, from the repository root), so the checker stays a CLI of its own that prints every count; `tools/check.test.ts`'s fake Host keys it on its script path. Default: spawn. Alternative: an in-process call, which would make the fake Host's empty `listDir` measure nothing.
4. **The README's evaluation record gains one paragraph for the prose rounds** in C8, in the shape of the 0.6.0 sentences at `README.md:108`, after the stage-2 note exists; the 0.7.0 round's own sentences are pending the user's rulings in the main checkout and are not written here. Default: add the paragraph.
5. **Sentences of fewer than three words are not measured** (the basis the inventory of §3.1 used), so a bold lead such as `**Plan.**` or a cell holding an id is neither long nor untagged. Default: as written.
6. **§7.5's `test` and `close` rules meet §7.2 and §7.4.** Of the four verb uses of `test`, only `design-failure-catalog.md:97` and `methodology.md:146` are in sections this plan rewrites and skill-authored; rewriting them is an exception to "only the five substitutions". `near` for `close` applies only at catalog `:66`, a sourced row outside §7.2. Default: rewrite the two `test` verbs in C7 without the verb (`what is tested again` is out, since the verb stays; `what is checked again` is out, since `check` collides; the drafter finds a form with the noun, such as `which tests run again when it changes`), leave the other three lines alone, and record all five in the acceptance note. Alternative: apply none of them.

## Assumptions the plan rests on

- The private `distill.js` Recheck accepts a `files` list of base names and reads the tree `args.root` names (part B's assumption, confirmed when B6 ran).
- `tools/check.test.ts`'s `fakeHost` builds a full `Host` literal (lines 34-64) and derives a tool name from `args[0]` after the `dev/node_modules/.bin/` prefix; C2 extends it to key `tools/check-prose.ts` by its path. Its resolved Node is `/opt/node/bin/node`.
- The stage-1 text has landed as part B's B6 committed it, so the baseline written in C2 is the §7.6 "first written on the stage-1 text".
- The two reasons §7.1 names already have fuller twins in their references: the IEC 60812 clause-order sentence (`SKILL.md:28` at 7506ffe, in the lead under `## The spine`, [cites:C055]) at `methodology.md:96`'s "Controls identified before the evaluation step" row, and the LLM-rating study with its "The gate is therefore…" consequence (`SKILL.md:39` at 7506ffe, step 5, [paraphrased:C067]) at `scales-software.md:133` under `## The review gate`. The move therefore appends nothing: `SKILL.md` keeps a one-line pointer to each and the reference copies are not touched (§7.1's twin rule).

---

### Task C1: `tools/check-prose.ts`: the measurement and the ratchet

**Files:**
- Create: `tools/check-prose.ts`
- Create: `tools/check-prose.test.ts`

**Interfaces:**
- Consumes: `tools/lib/host.ts`'s `Host` and `defaultHost()`.
- Produces:

```ts
export interface Counts { untagged: number; long: number; filler: number }
export interface HeadingCounts { heading: string; counts: Counts; items: number }
export interface FileMeasure { path: string; headings: HeadingCounts[]; total: Counts; items: number }
export type ProseHost = Host & { readFile: (path: string) => string };
export const LONG_WORDS = 25;
export const MIN_WORDS = 3;
export const FILLER = ["basically", "essentially", "simply", "actually", "in order to"];
export const BASELINE_PATH = "dev/prose-baseline.json";
export function defaultProseHost(): ProseHost;                           // { ...defaultHost(), readFile: (p) => readFileSync(p, "utf8") }
export function proseFiles(root: string, host: ProseHost): string[];     // SKILL.md then references/*.md sorted, repo-relative
export function measureText(path: string, text: string): FileMeasure;   // the one measurement basis
export function compareToBaseline(measured: FileMeasure[], baseline: unknown): string[];   // error lines, [] when the ratchet holds
export function checkProse(root: string, host: ProseHost, options: { writeBaseline: boolean }, write: (line: string) => void, writeError: (line: string) => void): number;
```

The CLI: `node tools/check-prose.ts [--write-baseline]`, run from the repository root. `main` measures the current working directory, `checkProse(process.cwd(), defaultProseHost(), { writeBaseline }, printLine, printError)`; unlike `tools/check.ts:143` it does not root at `import.meta.dirname`, so the CLI test can point it at a temporary root, and `tools/check.ts` starts it with `cwd: ctx.root` (C2). The exit status is 3 when any `error IO_READ:` line was printed, else 1 when any `error PROSE:` or `error USAGE:` line was printed, else 0; the counts per heading and per file are printed on every run.

The measurement basis (§7.6), one rule set:
- Lines are read in order. A frontmatter block (a first line `---` to the next `---`) is skipped. A line starting with three backticks toggles a fence; fenced lines are skipped. A line starting with `#` sets the current heading (its text after the `#`s) and is skipped; the heading before the first one is `(preamble)`. A blank line and a line that is one HTML comment are skipped. The exempt regions of the Global Constraints are skipped by path and marker.
- A line starting with `|` is a table row. The first row of a table and a separator row (cells of `-` and `:` only) are not items. A row is one item: untagged when its last cell holds no tag; its other cells are split into sentences for `long` and `filler`.
- A line matching `^\s*(?:[-*]|\d+\.)\s+` is a list item: one item, untagged when its text holds no tag; its text is split into sentences for `long` and `filler`.
- Any other line is paragraph text: split into sentences, each sentence one item, untagged when it holds no tag.
- The tag and the split are built from one source string; the tag test is `new RegExp(TAG)` and a sentence boundary is `SPLIT` (checked on 2026-10-14 with node on the four shapes below):
  ```ts
  const TAG = "\\[(?:skill-authored|(?:paraphrased|adapted-from|cites|sourced):C\\d+)\\]";
  const SPLIT = new RegExp("(?<=[.!?]|" + TAG + ")\\s+(?=[A-Z`\"'(]|\\[(?!" + TAG.slice(2) + "))");
  ```
  So a tag, or a run of tags such as `[paraphrased:C103] [skill-authored]`, stays with the sentence before it and ends that sentence, and a sentence may open with a link. `A b c. [skill-authored] D e f. [cites:C023]` gives two sentences; `x. [skill-authored] [design-failure-catalog](references/design-failure-catalog.md) offers rows. [skill-authored]` gives two.
- A sentence's word count is taken after removing tags, replacing each code span with one token, replacing each `[label](target)` link with its label, and dropping `*` and `_` markers; words are whitespace-separated tokens. A sentence with fewer than `MIN_WORDS` words is not an item. `long` counts sentences with more than `LONG_WORDS` words. `filler` counts whole-word, case-insensitive matches of `FILLER` over the measured text of every item.

The ratchet: the baseline must be a JSON object; every file in scope must have an entry with the three integer counts (`error PROSE: dev/prose-baseline.json lacks <path>`); every entry must name a file in scope (`error PROSE: dev/prose-baseline.json names <path>, which is not in scope`); a count above its baseline is `error PROSE: <path>: <count name> is <n>, above its baseline <m>`. Fail closed: the baseline file missing or not JSON, a file in scope that cannot be read, or a file measuring 0 items, each one `error IO_READ:` line. With `--write-baseline` the measured counts are written as the baseline (sorted keys, two-space indent, trailing newline) and `wrote dev/prose-baseline.json` is printed, except that a count that would rise above the existing entry refuses with `error PROSE: <path>: <count name> would rise from <m> to <n>` and writes nothing (no override flag; on the first write every entry is new); under `--write-baseline` a missing baseline file is not an error (every entry is new), while a baseline file that exists but is not JSON, a file in scope that cannot be read, or a file measuring 0 items still prints its `error IO_READ:` line, exits 3 and writes nothing.

- [ ] **Step 1: Write the failing tests**

`const ROOT = join(import.meta.dirname, "..")` and `const CLI = join(import.meta.dirname, "check-prose.ts")`. Fixture texts are inline template strings, with two escapes: each backtick in a fixture (the fence lines and the code spans) is written `\``, and each literal `${…}`, such as the Scripts block's `node ${CLAUDE_SKILL_DIR}/…` lines, is written `\${…}`; unescaped, the first ends the template literal and the second is an interpolation (tsc reports `Cannot find name`, the test throws a `ReferenceError`). A fixture line that holds either may instead be a plain double-quoted string joined with `"\n"`, as `tools/skill-commands.test.ts:25` writes `"node ${CLAUDE_SKILL_DIR}/scripts/"`. Tests, each `test(...)`:

- "the caps and the filler list are the spec's": `assert.equal(LONG_WORDS, 25)`, `assert.equal(MIN_WORDS, 3)`, `assert.deepEqual(FILLER, ["basically", "essentially", "simply", "actually", "in order to"])`, `assert.equal(BASELINE_PATH, "dev/prose-baseline.json")`.
- "measureText: a paragraph line in the repository's layout is one item per sentence, each keeping its tag, tagged when it carries one, long above 25 words": the fixture is the shape of `SKILL.md:30`, three sentences on one line, `S1. [skill-authored] S2. [skill-authored] S3. [paraphrased:C071]`, with word counts 10, 15 and 29 after tag removal → `items: 3`, `total { untagged: 0, long: 1, filler: 0 }`; a second line of three sentences with only the last tagged → `untagged: 2`.
- "measureText: a list item is one item, tagged when it carries a tag anywhere, and its sentences count for long and filler": a bullet of two sentences ending with a tag → untagged 0; a bullet whose tag is followed by `[design-failure-catalog](references/design-failure-catalog.md) offers rows. [skill-authored]` → untagged 0 and two sentences; a bullet with no tag → untagged 1; a bullet with `in order to` → filler 1.
- "measureText: a table row is one item read from its Provenance cell, and its other cells count for long": a header, a separator and two rows, one with an empty last cell and a 30-word cell → `untagged: 1, long: 1`.
- "measureText: frontmatter, fences, headings, blank lines and HTML comments are not measured, and a # inside a fence is not a heading": a SKILL.md-shaped text → the fenced `# not a heading` line sets no heading and the `node ${CLAUDE_SKILL_DIR}/…` lines are not items.
- "measureText: counts are reported per heading, in order, with (preamble) first": two headings and a preamble sentence → `headings.map((h) => h.heading)` deep-equals `["(preamble)", "Input rule", "The spine"]`.
- "measureText: the vocabulary region of structure-elements.md and the source register of provenance.md are exempt, and the heading after the register is measured": text with the markers under the real paths → the untagged rows inside the region are not counted, and an untagged sentence under the `## ` heading that follows the register is; the same text under another path counts the rows too.
- "measureText: a sentence of fewer than three words is not an item, a code span is one word, a link counts its label": `**Plan.**` alone is not an item; a sentence of `LONG_WORDS + 1` tokens whose last token is a code span of five words counts `LONG_WORDS + 1`; a link label of three words counts 3.
- "compareToBaseline: equal counts pass; a count above its baseline, a missing entry and an entry outside the scope are PROSE lines": four cases.
- "checkProse fails closed: a missing or non-JSON baseline, an unreadable file and a file measuring nothing are IO_READ lines, exit 3, an IO_READ beside a PROSE line still exits 3, and under --write-baseline a non-JSON baseline or an unreadable file still exits 3 and writes nothing": through a fake `ProseHost` that gives every `Host` field (`execPath`, `isNode`, `env`, `exists`, `listDir`, `listEntries`, `spawn`, `home`), as `tools/check.test.ts:34-64`'s `fakeHost` builds them, plus `readFile`.
- "checkProse --write-baseline writes the measured counts with sorted keys and exits 0, the next run without it passes, and a write that would raise a count refuses": a temp root holding `skills/fmea-software/SKILL.md`, a `skills/fmea-software/references/` folder with one file and an empty `dev/` folder (no `dev/prose-baseline.json`, the first-write case), `defaultProseHost()`; the written JSON deep-equals the measured counts; after adding a 30-word sentence, `--write-baseline` exits 1 with `/^error PROSE: skills\/fmea-software\/SKILL\.md: long would rise from 0 to 1$/m` and the file is unchanged.
- "the CLI prints every count and exits 1 above the baseline, 0 at it": `spawnSync(process.execPath, [CLI, "--write-baseline"], { cwd: tmpRoot })` then edit a file to add a 30-word sentence, run `[CLI]` again → status 1, stderr `/^error PROSE: skills\/fmea-software\/SKILL\.md: long is 1, above its baseline 0$/m`, stdout matching `/^## skills\/fmea-software\/SKILL\.md$/m` and `/^- \(preamble\): \d+ untagged, \d+ over 25 words, \d+ filler$/m`; `[CLI, "--other"]` → status 1, `error USAGE: usage: node tools/check-prose.ts [--write-baseline]`.
- "the real baseline is never above the real counts": `measureText` over every file `proseFiles(ROOT, defaultProseHost())` lists, against `JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), "utf8"))`: for each file and count, `assert.ok(baseline[path][k] <= measured[k], \`${path} ${k}: baseline ${…} above measured ${…}\`)`, and every file in scope has an entry. (Until C2 writes the baseline this test is skipped when the file does not exist, with `{ skip: "dev/prose-baseline.json not written yet (plan C2)" }`; C2 removes the skip.)

- [ ] **Step 2: Run them to watch them fail**

Run: `bun tools/run-tests.ts`. Expected: `Cannot find module '…/tools/check-prose.ts'`.

- [ ] **Step 3: Implement `tools/check-prose.ts`**

Header comment in the form of `tools/check.ts:1-17`: what it measures and why (§7.6: a ratchet, not caps; one basis for every file; fails closed), the usage line, that it measures the current directory and is run from the repository root (a run from anywhere else ends in `error IO_READ:` lines), the exit codes, the baseline's shape. Small private helpers under the complexity caps: `stripFrontmatter`, `classifyLine` (returning `fence`, `heading`, `skip`, `row`, `bullet` or `text`), `rowCells`, `isSeparatorRow`, `sentencesOf`, `wordCount`, `hasTag`, `fillerCount`, `exemptRanges(path, lines)`, `formatCounts`, `writeBaseline`. `checkProse` reads the baseline through `host.readFile`, measures every file `proseFiles` lists, prints `## <path>` then `- <heading>: <u> untagged, <l> over 25 words, <f> filler` per heading and `total: …`, then either writes the baseline or compares, printing each error line through `writeError`. The CLI entry: `if (isEntry(import.meta)) process.exit(main(process.argv.slice(2)))` with `main` parsing `--write-baseline` only.

- [ ] **Step 4: Run them to watch them pass**

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0 (the real-baseline test skipped; every export imported by the test).

- [ ] **Step 5: Commit**

```bash
git add tools/check-prose.ts tools/check-prose.test.ts
git commit -F- <<'EOF'
Tools: check-prose.ts measures untagged items, long sentences and filler per heading and ratchets them against a baseline

One measurement basis over SKILL.md and the references: tags kept with their
sentences, a code span one word, table cells measured, headings, frontmatter
and fences skipped, the register and the vocabulary region exempt. Fails
closed on a missing baseline, an unreadable file or a file that measures
nothing; --write-baseline refuses a count that would rise.
EOF
```

---

### Task C2: The fourth check, the documents, and the first baseline

**Files:**
- Modify: `tools/check.ts:1-17` (header), `:46-64` (beside `runTool`, a `runScript`), `:118-140` (`runChecks`)
- Modify: `tools/check.test.ts:21` (`Step`), `:34-64` (`fakeHost`), `:74-76` (`toolCalls`), `:78-93`, `:96-105`, `:125-131`, `:134-140`, `:142-148`, `:158-165`, `:192-221` (the assertions the fourth step moves)
- Modify: `.claude/CLAUDE.md:16-18`, `CONTRIBUTING.md:64-67`
- Create: `dev/prose-baseline.json`
- Modify: `tools/check-prose.test.ts` (the skip removed)

**Interfaces:**
- Consumes: C1's CLI.
- Produces: `tools/check.ts` running `tools/check-prose.ts` as its fourth step under the heading `## prose: tools/check-prose.ts (node vX.Y.Z)`, spawned as `ctx.host.spawn(ctx.node, ["tools/check-prose.ts"], { cwd: ctx.root, stdio: "inherit", env: ctx.env })` through a private `runScript(ctx: Context, script: string): boolean`; the baseline on the stage-1 text; the documents that name four checks.

- [ ] **Step 1: Write the failing runner tests**

In `tools/check.test.ts`: `Step` gains `"check-prose"`; `fakeHost`'s `spawn` keys a call whose `args[0] === "tools/check-prose.ts"` as `"check-prose"` (before the `.bin` slice); `toolCalls` renders that call as `tools/check-prose.ts`. The pins move: lines 83-87 expect four headings, the fourth `"## prose: tools/check-prose.ts (node v24.17.0)"`; 88-93 five calls, the fifth `"tools/check-prose.ts"`; `result.lines.length` 4 at lines 101 and 129; `calls.length` 5 at 103, 138 and 195; line 131 adds the prose call; lines 147 and 164 assert `toolCalls(calls).at(-2) === "fallow"` and `.at(-1) === "tools/check-prose.ts"`; line 198 allows `tools/check-prose.ts`; 202 `["inherit", "inherit", "pipe", "inherit", "inherit"]`; 208 and 215 five PATHs; 214 five `"node"`; 221 five entries, the fifth `undefined`. New tests: "the prose step failing does not stop the others' report, and the run exits 1" (`statuses: { "check-prose": 1 }` → status 1, four headings); "the prose step is started as a repository script through the resolved Node from the root, not from dev/node_modules/.bin": on the default `fakeHost({ calls })`, the call whose `args[0] === "tools/check-prose.ts"` has `call.command === "/opt/node/bin/node"` (the Node the fake resolves, the same command as the tool calls), `call.args` deep-equals `["tools/check-prose.ts"]`, `call.cwd === ROOT` and `call.stdio === "inherit"`.

- [ ] **Step 2: Run them to watch them fail; implement; run again**

Run: `bun tools/run-tests.ts`; expected: the heading deepEqual fails with three headings. Then `runScript(ctx, script)` (spawns as the Interfaces say; a null status is `error TOOLING: ${script} could not be started or ended without an exit status`; returns `status === 0`); in `runChecks`, after the analysis step: `write(\`## prose: tools/check-prose.ts ${version}\`)`, `const prose = runScript(ctx, "tools/check-prose.ts")`, and `return types && lint && analysed && analysis && prose ? 0 : 1`. The header says four checks and names the fourth. Run: `bun tools/run-tests.ts`; expected: PASS.

- [ ] **Step 3: Write the baseline on the stage-1 text**

Run, from the worktree root: `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/check-prose.ts --write-baseline`. Expected: `wrote dev/prose-baseline.json`, exit 0, and the printed counts per file. Remove the skip from the real-baseline test. Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0, the fourth heading printed by `check.ts`.

- [ ] **Step 4: The documents**

`.claude/CLAUDE.md:16-18`: the sentence naming the three checks gains the fourth: `…and the dead-code, duplication and complexity analysis (`fallow`), then the prose ratchet (`tools/check-prose.ts`, which measures `SKILL.md` and the references against `dev/prose-baseline.json` and fails when a count rises); it exits 1 on any finding, and on a missing tool.` `CONTRIBUTING.md:64-67` the same sentence in its own words, and the paragraph gains: `A commit that improves the prose lowers the baseline in the same commit with `node tools/check-prose.ts --write-baseline`, run from the repository root; the test suite refuses a baseline above the measured counts and the writer refuses a count that would rise, so the baseline moves only down.` (The `node tools/check.ts` command users run is unchanged and is the same in bash and fish.)

- [ ] **Step 5: Commit**

```bash
git add tools/check.ts tools/check.test.ts tools/check-prose.test.ts dev/prose-baseline.json .claude/CLAUDE.md CONTRIBUTING.md
git commit -F- <<'EOF'
Tools: check.ts runs the prose ratchet as its fourth step; the baseline is written on the stage-1 text

dev/prose-baseline.json holds each file's untagged, long and filler counts as
measured before the first stage-2 edit. CLAUDE.md and CONTRIBUTING.md name the
fourth check and the baseline rule.
EOF
```

---

### Task C3: `docs/style.md`

**Files:**
- Create: `docs/style.md`
- Modify: `CONTRIBUTING.md` (a new section after `## Cite sources, do not paste them`, before `## Opening a pull request` at line 39)

**Interfaces:**
- Consumes: §7.1 to §7.6 and §4.3 of the spec; `dev/prose-baseline.json`; decision 6.
- Produces: the one page every C4 to C7 drafter and critic reads, under these headings, in this order: `# How the skill's prose is written`; `## Two kinds of text` (an instruction tells the model what to do; a description tells a person what is so; how to tell them apart: the verb and the reader); `## The shape of a procedure` (one lead sentence stating what the step produces, then a list of rules in the order the model acts, one rule per bullet, the command verb first, the rule before its reason, a warning before the step it guards, the "before you write" list last); `## Caps` (20 words for an instruction, 25 for a description, six sentences for a procedural paragraph, then a list; what the checker counts and what the critic checks); `## One word for one thing` (the schema's word preferred; no new sense; the five substitutions, the five refusals and the `test` and `close` rules of §7.5 as a two-column table, with decision 6's ruling; the sentences the table leaves alone); `## Tags` (the rules of §7.4 verbatim; a split sourced sentence keeps its tag on each part and is never reworded; a bullet that would mix sources is split); `## Text no one changes` (the frozen list of §4.3, each with the test or reason that pins it); `## Changing a sourced sentence` (what it requires: the private evidence, the Recheck, the audit, the tag's permission); `## The checker` (`node tools/check-prose.ts` from the repository root, the three counts, the baseline rule, `--write-baseline` and its refusal of a rise). One page: at most 120 lines.

- [ ] **Step 1: Write the page and the pointer**

Write `docs/style.md` under those headings. In `CONTRIBUTING.md`, after line 37, the section:

```
## Writing the skill's prose

`SKILL.md` and the reference files are written to `docs/style.md`: two kinds of text, the shape of a procedure, the caps, one word for one thing, the tag rules, the text no one changes, and the prose checker that `tools/check.ts` runs.
```

- [ ] **Step 2: Measure and commit**

Run: `bun tools/run-tests.ts` and `bun tools/check.ts` (the page is outside the checker's scope; the gates still run). Expected: both exit 0.

```bash
git add docs/style.md CONTRIBUTING.md
git commit -F- <<'EOF'
Docs: the style rule for the skill's prose, pointed to from CONTRIBUTING.md
EOF
```

---

### Task C4: `SKILL.md` restructured

**Files:**
- Modify: `skills/fmea-software/SKILL.md` (every section but the frozen literals), `dev/prose-baseline.json`

**Interfaces:**
- Consumes: C2's checker and baseline, C3's style rule, part B's placements.
- Produces: the rewritten `SKILL.md` C8's final judge reads as one document; the shortened frontmatter description.

- [ ] **Step 1: The sections and their drafters (Workflow, Opus)**

One Workflow, one drafter per section, in parallel, the sections named by heading because part B moved the lines: the lead under `# Software FMEA, design side` before `## Input rule` (`SKILL.md:8-11` at 7506ffe, two sentences over the cap at `:8` and `:11`); `Input rule`; `When this skill runs`; the lead under `## The spine` before item `1. **Plan.**` (`:25-33` at 7506ffe: the seven-step sentence [cites:C086]; the two adjustments, which hold the IEC 60812 clause-order sentence [cites:C055] at `:28`, the no-standard-binds sentence at `:29` and the C071 evidence-kind sentence at `:30`; and the review paragraph at `:32-33` (the [paraphrased:C110] sentence at `:32`, its two `meta.reviews[]` rules at `:33`), which step 7's "recorded the same way" depends on); one per spine step, 1 to 7; the two sentences under `## Other modes` before `### Seed from postmortems`; `Seed from postmortems`; `Convert a legacy sheet`; `Update after a change`; `Migrate a v1 document`; `Migrate a v2 document`; `Scripts` (the prose after the fenced block only, which becomes a table: Script, What it refuses and how, Provenance); `Reference files` (a table: File, Carries, Load when, Provenance); `What v1 does not carry`; the frontmatter `description`. Each drafter gets: `docs/style.md`; the section's current text; the §7.1 rules for its section (a spine step: lead sentence, then the rules in the order the model acts, the stage-1 "before you write" list last, the edge rule staying in the edge bullet, the hand-over rule first in the hand-over list; a reason that is not a rule moves to the reference that owns the topic, and where the reference already states the claim the sentence is a twin: the step keeps a one-line `[skill-authored]` pointer, nothing is appended and the reference stays untouched; the IEC 60812 clause-order sentence in the spine lead and the LLM-rating study with its consequence in step 5 are both twins, of `methodology.md:96` and `scales-software.md:133`; a near-verbatim twin of a reference anywhere else keeps the short imperative and a pointer); the frozen literals in its section; the D9 rule that the inconsistencies of spec §11.3 are logged, not fixed, so each one's content stays as it stands, quoted: in the update section the clause `as §5.5 fixes them` stays; the two sentences `Unattended, this question has no default: write nothing, leave the file as it was with no history entry and no version bump, and end with the question, naming each such element.` and `… naming each such codebase.` stay two rules, each after its own question, and are not merged; in `Migrate a v1 document`, `The migration runs alone, never in the same update as an architecture change` and `A v1 document runs this migration and then the v2 migration below in the same update, …` are not reconciled; and the rule that a sourced sentence is split at a clause boundary only. It returns `{ text, rules_before: [{ rule, tag }], rules_after: [{ rule, tag, position }], twins: [{ sentence, tag, reference, section }] }`. The description drafter returns a description of at most 1,024 characters, one plain unquoted YAML line (`description: …`, no folded or quoted scalar), third person, what the skill does first, then when to use it, keeping every trigger word of the current one (FMEA, DFMEA, the four shapes, the file names).

- [ ] **Step 2: The rule-preservation critics (Workflow, Opus, in the same pipeline)**

For each drafted section, one critic given the section before and after and the drafter's two rule lists, asked to list every rule in the before text and find it in the after text, and to flag: a rule lost, a rule added, a rule moved from its stage-1 position, a rule whose meaning changed, a sourced sentence reworded rather than split, a tag lost or changed, a sentence over the cap, a frozen literal changed, a substitution applied in a sourced sentence or outside §7.5's list, a new sense of a word, a §11.3 item fixed, a twin appended to a reference that already carries it. Schema `{ pass: boolean, findings: [{ rule, defect, change }] }`. A failing section goes back to its drafter with the findings, up to three rounds; a section still failing is returned unverified.

- [ ] **Step 3: Assemble, measure, pin**

The controller assembles `SKILL.md` from the returned sections in the file's order, the Scripts fenced block byte for byte, the migration headings and the stale-reason line unchanged, then runs `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/check-prose.ts` (every count under the baseline; the `SKILL.md` headings at zero over-cap sentences and zero untagged items, frozen text excepted, each excepted item listed in the ledger with its §4.3 clause), `bun tools/run-tests.ts` (the pinned literals: `tools/skill-commands.test.ts`, `update-check.test.ts:274`, `prompts.test.ts`; expected here: every test passes except `the real baseline is never above the real counts`, which fails because the baseline is still above the lowered counts until Step 4 writes it; any other failure stops the step) and `bun tools/check.ts`. No reference file changes in this task (the two moved reasons are twins). The description's length: run `python3 -I -c "import re; t=open('/home/nn/Projects/failwise/.claude/worktrees/prose/skills/fmea-software/SKILL.md', encoding='utf-8').read(); print(len(re.search(r'^description: (.*)$', t.split('---')[1], re.M).group(1)))"`. Expected: one integer, at most 1024 (characters, not bytes; the current description gives 1178). An `AttributeError` means the description is no longer one plain line: the check is unverified and the step stops.

- [ ] **Step 4: The Recheck, the baseline, the commit**

The private Recheck over `SKILL.md`, as part B's B6 Step 3 dispatches it with `files: ["SKILL.md"]`. Then `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/check-prose.ts --write-baseline` (the counts fall, so the baseline falls; a rise refuses), the two runners (expected: both exit 0), and the commit:

```bash
git add skills/fmea-software/SKILL.md dev/prose-baseline.json
git commit -F- <<'EOF'
Skill: SKILL.md is lead-plus-list, one rule per bullet, the stage-1 placements kept

Stage 2 of the prose design (§7.1): each step a lead sentence and a list in
the order the model acts, the two reasons that are not rules replaced by
pointers to the references that already carry them, the twins shortened to a
pointer, the Scripts prose and the Reference files section as tables, the
description under 1,024 characters. <N> Opus drafters, <N> Opus critics,
<rounds>. Distill Recheck <date>, <workflow id>: SKILL.md pass. Baseline
lowered: SKILL.md <before> -> <after> over 25 words, <before> -> <after>
untagged.
EOF
```

- [ ] **Step 5: Report**

The ledger records the file size of `SKILL.md` in characters (47,224 before stage 1; after stage 1; after stage 2; the file count includes the frontmatter description, which the skill load does not carry), the per-heading counts, the critics' findings and rounds, any unverified section, and the tiers. The size at the skill load is C8's measurement.

---

### Task C5: `design-inputs.md` and `structure-elements.md`

**Files:**
- Modify: `skills/fmea-software/references/design-inputs.md` (sections: Flows, components and dependencies L28; Incident history L50; The control inventory L58; Ground rules and assumptions L68; Contracts and data flows L82; The non-catalog source rule L108; all at 7506ffe, each quoted by heading)
- Modify: `skills/fmea-software/references/structure-elements.md` (The three questions L6; Dependencies L72; Role L81; Conversion from a sheet L98; Migrating a v1 document L109; Migrating a v2 document L134; Runs over several codebases L154; the generated region and the Boundary and Security relevance sections untouched)
- Modify: `dev/prose-baseline.json`

**Interfaces:**
- Consumes: C4's procedure (drafter, critic, assemble, measure, Recheck, baseline).
- Produces: the two files, one commit each.

- [ ] **Step 1: Per file, the C4 procedure over the named sections**

The drafters get §7.2's rules for a sentence pass: a sentence over 25 words split at a clause boundary; active voice; one rule per sentence; a paragraph of more than six sentences becomes a list; only the five substitutions, only in skill-authored sentences; every stated uncertainty, every caveat that is content and every permissive "may" stays; a sourced sentence split only. The critic checks the same list. The controller assembles, runs the checker (the named headings at zero over-cap sentences and zero untagged items; where a count under a §7.2 heading is not zero, each remaining item is listed in the ledger and the commit body with the §4.3 clause that freezes it, an anchor row, a sourced reproduction or a split-only sourced sentence, and an item with no such clause is a failure, never absorbed), the runners (for `structure-elements.md`: `tools/gen-element-vocabulary.test.ts` and the region's markers unchanged; expected: every test passes except `the real baseline is never above the real counts`, as in C4 Step 3), the Recheck over the file, `--write-baseline`, the two runners again (expected: both exit 0), and commits:

```bash
git add skills/fmea-software/references/design-inputs.md dev/prose-baseline.json
git commit -F- <<'EOF'
References: design-inputs.md procedural sections at one rule per sentence, under the caps

Stage 2 of the prose design (§7.2). Distill Recheck <date>, <workflow id>: pass.
Baseline lowered: <before> -> <after> over 25 words.
EOF
```

and the same for `structure-elements.md`.

---

### Task C6: `quality-and-lint.md`, `work-tracking.md` and `method-selection.md`

**Files:**
- Modify: `skills/fmea-software/references/quality-and-lint.md` (The skill applies these to itself, L264 at 7506ffe, L266 after B2 and B3 add their rows after line 243)
- Modify: `skills/fmea-software/references/work-tracking.md` (The three commands L7; The rules L18, rule 7 kept as the first column-0 line starting `7. `)
- Modify: `skills/fmea-software/references/method-selection.md` (Which incidents seed a chain L20; What a postmortem hands over L42; Learning and action are fenced apart L51; Identifiers a seeded chain carries L60; What incident data may rate, and what may not L67; The threat-model handoff L92; The interface L98; What the handoff does not do L107)
- Modify: `dev/prose-baseline.json`

- [ ] **Step 1: Per file, the C4 procedure**

As C5, one commit per file. `quality-and-lint.md`'s pinned sentences (lines 24-26) and rows are outside the named section and untouched; `tools/skill-commands.test.ts` reads `work-tracking.md`'s rule 7 and the Recheck does not cover `work-tracking.md` (decision 1): its commit body says `Distill Recheck: not covered (the private distill names no work-tracking.md); Opus critic pass, prose checker pass`.

---

### Task C7: `design-failure-catalog.md`, `methodology.md`, `scales-software.md`, `provenance.md` and `process-stub.md`

**Files:**
- Modify: `skills/fmea-software/references/design-failure-catalog.md` (Reading a row L7; ML or LLM elements L86, whose questions stay under that heading and are not moved to `structure-elements.md` (§11.3); What this catalog does not carry L162)
- Modify: `skills/fmea-software/references/methodology.md` (Why severity-first L136; What this file never carries L149)
- Modify: `skills/fmea-software/references/scales-software.md` (Rules common to the three scales L29; the prose, never the anchor rows, of Severity L39, Occurrence L66 and Detection L91; The review gate L131; Versioning L135; `scales version: 2`, the two scale headings and the range sentence unchanged)
- Modify: `skills/fmea-software/references/provenance.md` (the preamble L1; Tag syntax L21; Tag-permission rule L28; Refuted records L49; Sources with no license status in evidence L170; Never ships L198; the three licence sections and the register untouched)
- Modify: `skills/fmea-software/references/process-stub.md` (The answer to a PFMEA request L7; Incident data that is not rating evidence L92; Actions carried over from a postmortem L101; the DORA section untouched)
- Modify: `dev/prose-baseline.json`

- [ ] **Step 1: Per file, the C4 procedure**

As C5, one commit per file. Under decision 6, the drafters of `design-failure-catalog.md` (`:97`) and `methodology.md` (`:146`) rewrite the two skill-authored verb uses of `test` without the verb, and the critic counts that as allowed, not as a sixth substitution. `scales-software.md`'s commit runs `quality-and-lint.test.ts` (lines 53-56 pin its version line, lines 58-74 its Severity radius rows and their checked sentence); `methodology.md`'s commit runs the same file, whose lines 76-82 pin the DF4 row at `methodology.md:111`, outside the sections rewritten; `provenance.md`'s commit confirms the licence blocks byte for byte (`git diff` shows no change in lines 130-169). Every commit runs the full suite anyway; these are the pins to read first on a failure.

---

### Task C8: The stage-2 round, the notes, the final acceptance

**Files:**
- Create (gitignored): `build/evals/prose-2/`
- Create: `docs/specs/2026-10-14-prose-eval-results-2.md` (generated, then appended by hand)
- Create: `docs/specs/2026-10-14-prose-acceptance.md`
- Modify: `README.md` (one paragraph in the evaluation record, after line 108)

**Interfaces:**
- Consumes: C4 to C7 as merged; parts A and B's notes and `results.json` files; the stage-1 round of record.
- Produces: the evidence the user rules on.

- [ ] **Step 1: Clean tree and gates**

Run: `git status --short` (expect nothing), `bun tools/run-tests.ts`, `bun tools/check.ts`. Expected: all exit 0. Record `git rev-parse HEAD`.

- [ ] **Step 2: Run and judge the round, generate the note, append its sections**

Run in the background, as A6 Step 3 does, `bash …/run-round.sh 2 > …/round-2.log 2>&1`, waiting with Monitor. Then the Workflow tool with `evals.js`, `evalsDir: "build/evals/prose-2"`, and the other args as in A6 Step 4 (`root`, `prompts: [1, 5, 6, 7]`, `capabilities: ["high", "medium"]`). Then:
```
/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/eval-report.ts --results build/evals/prose-2/results.json --out docs/specs/2026-10-14-prose-eval-results-2.md --title "Eval results, prose stage 2"
```
Expected: `wrote docs/specs/2026-10-14-prose-eval-results-2.md`, exit 0; on exit 3 or 1 no note is written and the stage is unverified. Append the sections of A6 Step 5 and B7 Step 2 verbatim (`## What this round cannot separate`, `## Secondary leak grep`, `## Bundled skills`, `## Warnings the final documents carry`) and a fifth, `## SKILL.md size`: `At the skill load: <a> characters at stage 1, <b> at stage 2. As a file: 47,224 before stage 1, <c> after stage 1, <d> after stage 2 (the file count includes the frontmatter description, which the skill load does not carry).` Re-append all five after any regeneration.

- [ ] **Step 3: Read the round against §8.4**

Per pair and criterion by §8.1's definition against the stage-1 round of record (`build/evals/prose-1b/results.json` when B7 Step 5 ran, else `prose-1`): no pair scores worse on any criterion; stability holds where it held; the per-heading counts of `node tools/check-prose.ts` (nvm's node by absolute path) show zero over-cap sentences and zero untagged items in `SKILL.md` and under the §7.2 headings, frozen text excepted: each remaining item under one of those headings is listed in the note with the §4.3 clause that freezes it (an anchor row, a sourced reproduction, a split-only sourced sentence), and an item with no such clause is a §8.4 failure, never absorbed. The size at the skill load, before and after: in `build/evals/<stage-1 round>/p1/high/run1/transcript.jsonl` and `build/evals/prose-2/p1/high/run1/transcript.jsonl`, the first entry with `type: "user"` whose content holds a `text` block starting `Base directory for this skill:`; its size is that block's length in characters (`python3 -I` over the JSONL; the 0.7.0 round's p1/high/run1 measured 46,359); a missing block counts as unverified, not as zero. An unverified cell is re-run and merged by A6 Step 5's procedure with `run-round.sh 2 <p> <cap> <n>` and `evalsDir: "build/evals/prose-2-rerun"`, and the note is regenerated and re-appended.

- [ ] **Step 4: The user's triggering check**

Ask the user to run `/skill-doctor` on the plugin (decision 2) and paste its report; quote it in the acceptance note. The eval rounds name the skill and do not measure triggering.

- [ ] **Step 5: The Fable final acceptance (Agent, session model, unanchored)**

One agent on the session model, given: `git diff <part B's last commit>..HEAD -- skills/ docs/style.md`, the stage-2 note, the stage-1 round of record's note, §8.4 and §12 of the spec, and the rewritten `SKILL.md` as one document; asked whether a model acting from `SKILL.md` would do the right thing in the right order, whether the diff touches only §7.1 and §7.2 and keeps every frozen literal and stage-1 placement, and whether §8.4 is met; it rules `pass`, `revise` or `escalate` with findings. It receives no controller conclusion. Schema `{ verdict, findings: [{ where, defect, change }] }`. Each gate run is recorded in the ledger. On `revise`: apply, re-run the affected file's C4 procedure and the gate once; a second `revise` or `escalate` goes to the user.

- [ ] **Step 6: The acceptance note and the README paragraph**

`docs/specs/2026-10-14-prose-acceptance.md`, one paragraph per criterion of §12 (eight), each met, unverified or not applicable with its evidence (the commits, every round's note, the Recheck verdicts per commit, the checker's final counts, the `/skill-doctor` report, the private audit as the user's pre-push step); then §8.5 stated in full (D12, judge variance, the open c5 reading of D15 named, the model); every unverified cell of every round; the tier of every phase of parts A, B and C and the Fable calls actually made, from the ledgers (three gates planned, B1, B7 and C8, plus each re-run named by gate); the deviations the plans recorded (part A's decisions 1 to 7, part B's 1 to 6, part C's 1 to 6); the file the Recheck did not cover (decision 1); and §11.3's logged items with the ones the rounds touched. The README paragraph, after line 108, in the 0.6.0 sentences' shape: what the prose rounds ran and scored, what stayed unverified, and the links to every round's note.

- [ ] **Step 7: Serve the result to the user and stop**

Report in one message: the commit, every note's path and that their appended sections are present, the acceptance note's path, the per-criterion comparison with stage 1, the checker's counts, the two skill-load sizes, the gate's verdict, the tiers and the Fable calls actually made, and the things that are the user's to decide: whether the rounds' results are accepted, whether to run the Claude-model after round (§8.5), whether to rebase `prose` when `flow-model` merges, and whether to push after the private audit. **This plan ends at that gate.** The note, the acceptance note and the README paragraph are committed only after the user has read them:

```bash
git add docs/specs/2026-10-14-prose-eval-results-2.md docs/specs/2026-10-14-prose-acceptance.md README.md
git commit -F- <<'EOF'
Evals: the prose stage-2 round and the acceptance note

Sixteen runs on deepseek-flash under rubric 4 and the stage-0 harness, read
against §8.4 of the prose design; the acceptance note rules on §12's eight
criteria and names every unverified cell of every round.
EOF
```
