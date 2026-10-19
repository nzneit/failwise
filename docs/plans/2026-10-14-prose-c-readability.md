# Prose Implementation Plan, part C: readability (stage 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the skill's instructions easier for a person or an agent to read and maintain without moving a rule: `SKILL.md` becomes lead-plus-list, the procedural sections of the references are rewritten under a one-page style rule, a prose checker ratchets the counts against a baseline and fails closed, and a round shows no pair scoring worse than at stage 1.

**Architecture:** Task C0 lands §11.5 ruling 7's split sentence in `quality-and-lint.md`, with its dated note in the spec's §6.3, and runs the stage-1 Recheck. Those are the two items plan B's E6 left to part C, done before the checker is built. The checker comes next (C1, C2), is wired into `tools/check.ts` as a fourth step, and writes its baseline on the stage-1 text before any stage-2 edit, so every later commit is measured. The style rule (C3) is the brief every drafter reads. `SKILL.md` is rewritten section by section by Opus drafters, each checked by a rule-preservation critic, assembled by the controller, measured, pinned, re-checked by the private distill Recheck and committed with its lowered baseline (C4). The references' procedural sections follow in three groups, one commit per file (C5 to C7). C8 runs the round, writes the note and the acceptance note, and ends at the Fable final acceptance and the user's gate.

**Tech Stack:** TypeScript run directly by Node 24.2 or later (`node:test`, `node:assert/strict`), `tools/check.ts`'s injected `Host` for the runner tests, the Workflow tool for drafting and critique, the private repository's distill Recheck (`distill.js`, dispatched from its byte-identical gitignored copy `.superpowers/sdd/2026-10-14-prose/distill.js` because the Workflow tool refuses the private path, as at part B's B6 Step 3 and B7 Step 5), and for the round `tools/run-round.ts` (which runs `tools/run-eval.sh` once per cell) and `tools/workflows/evals.js`, as round 1c ran and judged them.

**Spec:** `docs/specs/2026-10-14-prose-design.md` as amended through 76959fd (unchanged at 15e8c87) on branch `prose` (worktree `/home/nn/Projects/failwise/.claude/worktrees/prose`). This plan's scope is §§7, 8.4, 9, 11.2 and 12, with §4.3 (frozen text). §9's eval-judging row no longer has the Sonnet persist phase (§11.4 ruling 7). Several amended parts of the spec also apply to part C:

- §8.1 as amended, which §8.4 uses: a cut-off final message makes a run unverified and its cell is re-run once; the note has a Counts column from `message_counts`; cells run under `tools/run-round.ts` with every `CLAUDE*` variable stripped, as from round 1c (§11.5 ruling 10; §11.6 carried items).
- §11.4's rulings for stage 2 and the acceptance note:
  - 3: c13 and c14 show any converter change.
  - 4: the 0.2 stability bound stays through stage 2, and the acceptance note names the four pairs that fail it.
  - 5: the option to fold the `cat-dependency-01` and `cat-security-04` cause columns into stage 2's reference rewrite (decision 8). The stage-1 gates did not take this up.
  - 6 and D15: the attribution hole is on the acceptance agenda.
  - 9: the rounds are not v1 evidence.
  - 10: the sheet parser is revisited at acceptance.
  - 11: what the acceptance note records of stage 1.
- §11.5 rulings 4, 7 and 11.
- §11.6's carried items: stage 2 compares against round 1c; the §6.3 split sentence, `SKILL.md`'s singular "that substitution" and the stability predicate stay with part C. The split sentence lands in C0, the singular in C4, and the stability predicate is reported in C8.
- §11.7's three wording follow-ups, which the rule-preservation critics are briefed to reject. Its enforcement and harness follow-ups come after part C, as do §11.4 ruling 1's c2 wording and §11.3's carry-note rule.

D9 now excepts the §5.5 reference, which plan B's task E6 fixed (4de8fd4). Parts A and B have run, plan B through its epilogue (E1 to E7 in the plan, E8 in the ledger), and their rounds are recorded. Part A's "How to read this plan" and Global Constraints apply here, with two exceptions. First, the round runs through the tracked launcher `tools/run-round.ts <stage>` (spec §11.5 ruling 10, used from round 1c on by §11.6). Run it like any single TypeScript tool, with nvm's node by absolute path: `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/run-round.ts 2`. The launcher reads the gateway key from the login keyring itself, so the round no longer runs through `bash …/.superpowers/sdd/2026-10-14-prose/run-round.sh` or through `env … tools/run-eval.sh` lines in a script. The `bash …/<script>.sh` rule still applies to the other key-reading helpers in that folder. Second, `evals.js` has no persist phase (§11.4 ruling 7). The controller writes `build/evals/prose-<stage>/results.json` from the `result` key of the Workflow task's output and checks that the file parses and holds the run count. Part A's Sonnet persist tier is therefore not run.

## How to read this plan

- Tasks C0 to C8 run in order on branch `prose`, after part B's gate. Task ids are the only names used across tasks.
- Line numbers in **Files** blocks are those of commit 7506ffe for files part B did not touch; for `SKILL.md` and `quality-and-lint.md` each task quotes its anchor text, because part B moved their lines. Part B moved most lines of `SKILL.md` (181 lines at 7506ffe, 237 at 15e8c87): B6 and the round-1b revision (6966ed6) added twenty lines to the spine, the "Before you …" lists after steps 1, 2 and 7, so steps 2 to 7 are now `:41` and `:46` to `:50`, `## Other modes` is `:63` and `## Scripts` is `:190`; B6 and E3 added sixteen lines to the seed section, B6, the round-1b revision (6966ed6) and E3 added eighteen to the Convert section, and B6 and E6 added two to the update section. B2 and B3 add two rows after `quality-and-lint.md:243`, now `:244` and `:245`, and the later edits to that file and to `design-inputs.md` replaced lines in place, so no other line there moved, at 15e8c87; C0 then adds one paragraph after `quality-and-lint.md:105`; `design-inputs.md`'s headings keep their 7506ffe lines.
- The implementing agent's Bash tool runs zsh and, in a worktree session, refuses `source`, `PATH=` prefixes and `cd` into another checkout. Run the suites as `bun tools/run-tests.ts` and `bun tools/check.ts`, the prose checker as `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/check-prose.ts` from the worktree root.
- No task in this plan changes the renderer, the template or the golden fixture, so no task runs the browser checks. Part B's parked browser-tool follow-up stays a follow-up after part C (decision 7 item (i)): `tools/lib/browser.ts:306` starts render.ts with stdio inherit, so its provisional-count line prints in every browser command run that renders the checkout fixture.
- Drafters return text; they never write a file. The controller assembles a file from the returned sections, runs the checks and commits. A drafter and its critic loop until the critic passes or three rounds are spent; a section still failing after three is unverified and goes to the controller, never silently kept.
- Model tiering (§9): drafters and rule-preservation critics run on Opus; the prose checker and the pinned-literal tests are scripts; the private Recheck is Opus; C8's judging runs the existing `evals.js` tiers; the final acceptance is **Fable (3)**, one call planned, plus one more if it rules `revise`. Every report names the tier of each phase and the Fable calls actually made.

## Global Constraints

The Global Constraints of parts A and B apply, as amended since 7506ffe:

- A round is launched by `node tools/run-round.ts <stage>`, which runs one `tools/run-eval.sh` per cell and drops every inherited `CLAUDE*` variable (CONTRIBUTING.md, "From the prose round 1c on"; spec §8.1 and §11.6). It is not launched by `env … tools/run-eval.sh` lines in a script.
- A run is also unverified when its final message is cut off: `context.json`'s `final_message.complete` is not true (spec §8.1, as amended by §11.5 ruling 1). Plan A's §8.2 pass line does not have this clause.
- A note carries plan A's four hand-written sections and `## §8.2 check`, as every round note since prose-0 has; from round 1b the check carries clause (f), the final message complete. Like round 1c's `## §8.3 reading`, it also carries a reading of its stage's gate, written by hand.
- The stale-reason precedence line that plan B freezes is the sentence that begins "When more than one rule fires on a row, `reason` records the first that applies". It is `SKILL.md:146` at 15e8c87, not `:92`.
- Plan B's exact lint values are those of spec §6.4 with its dated amendments (§11.5 rulings 4 and 5, §11.6 ruling 3).
- Plan B's round values give way to this plan's round below. The stage-1 round of record is `prose-1c`.

In addition:

- Stage 2 touches only §7.1 (`SKILL.md`) and §7.2 (the named procedural sections), plus the two wording items §11.6 carries to part C. The first is the sentence that splits the `design-inputs-declared` reviewer row from the `edge-reliability-unstated` lint, with a dated note in the spec's §6.3 (§11.5 ruling 7). B6's Recheck proposed it after `quality-and-lint.md`'s WS3 table, outside §7.2's named section; C0 lands it. Beside it stands any pre-branch fix the user rules after C0's Recheck (C0 Step 3), in its own commit named as pre-branch. The second is the singular "that substitution is counted" in the Convert section's control sentence (`SKILL.md:109` at 15e8c87; §11.5 ruling 4); C4 rewrites it. Stage 2 keeps every frozen literal of §4.3 and every stage-1 placement. The descriptive sections, apart from the split sentence and any such fix, and `rubric.md` are left alone (D5, D14). A commit that lowers a count lowers `dev/prose-baseline.json` in the same commit.
- The style rule's caps, quoted from §7.6: an instruction sentence at most **20** words, a description sentence at most **25**, a procedural paragraph at most **six** sentences, then it becomes a list. The checker counts **sentences over 25 words**; the 20-word cap on instructions is the drafter's rule, checked by the critic.
- Tags (§7.4): one tag per sentence outside a table, per bullet, and per table row in its Provenance column; a bullet carries one tag at its end and may hold several sentences; a bullet that would mix sources is split; a split sourced sentence keeps its tag on each part and is split at a clause boundary only, never reworded.
- Vocabulary (§7.5), in skill-authored sentences only: `need` for `require` (outside the four `*-required` invariant ids, JSON Schema's `required`, the DORA definitions, NIST's "a required security property" and the licence-obligation sense), `do` or `make` for `perform` (outside the MIL-STD-1629A title and Occurrence anchor row 8), `through` for `via`, `more` for `additional`, `obey` for `follow` only where the sense is obey (the three sentences: `SKILL.md`'s "follow rule 6 of `references/work-tracking.md`", `methodology.md:5`, `quality-and-lint.md:180` at 15e8c87). Never: `check` for `verify`, `end`/`stop` for `terminate`, `change` for `modify`, `start` for `initiate`, `try` for `attempt` (the skill's `attempt` is a noun). `test` stays as a noun everywhere; of its four verb uses, two sit in sections this plan rewrites and are skill-authored, `design-failure-catalog.md:97` ("re-tested") and `methodology.md:146` ("are tested as properties"), and are rewritten without the verb only under decision 6; the other two, catalog `:82` ([paraphrased:C127]) and `:112` (a row outside §7.2), stay. `near` replaces `close` only for distance at `design-failure-catalog.md:66`, a sourced row ([adapted-from:C014]) outside §7.2 that §7.4 forbids rewording, so on this branch it applies nowhere (decision 6). Words the skill uses in more than one sense are not unified; no new sense is introduced and the schema's word is preferred.
- Exact values this plan ships:
  - the checker's scope: `skills/fmea-software/SKILL.md` and every `skills/fmea-software/references/*.md` (ten files); `evals/rubric.md` is outside it (D14).
  - the filler list: `basically`, `essentially`, `simply`, `actually`, `in order to`; never a modal.
  - the exempt regions: in `references/structure-elements.md` the lines between `<!-- vocabulary:start -->` and `<!-- vocabulary:end -->` (lines 19 and 58); in `references/provenance.md` lines 55 to 129, from `## The source register` to the line before the next heading (`## IEC 60812:2018` is line 130, and is measured).
  - the baseline file `dev/prose-baseline.json`: `{ "<repo-relative path>": { "untagged": n, "long": n, "filler": n } }`, keys sorted, tracked (`.gitignore` ignores nothing under `dev/` but `node_modules`).
  - the description limit (§11.2, verified 2026-10-14 against the Agent Skills specification and the Anthropic platform documentation): `description` is capped at **1,024** characters there and truncated at 1,536 in Claude Code's skill listing; `SKILL.md`'s description is **1,178** characters today (§11.2's 1,183 counts bytes: the value after `description: ` is 1,182 bytes, the two em dashes being three bytes each, plus its newline) and is shortened to 1,024 or fewer in C4, counted in characters.
  - the round (§8.1, §8.4): prompts 1, 5, 6, 7 at high and medium, two runs each, on `deepseek-flash`; `build/evals/prose-2/`; note `docs/specs/2026-10-14-prose-eval-results-2.md`; acceptance note `docs/specs/2026-10-14-prose-acceptance.md`; the stage-1 round of record is `prose-1c` (`build/evals/prose-1c/`, note `docs/specs/2026-10-14-prose-eval-results-1c.md`), per plan B's epilogue and spec §11.6 and §11.7.
- Test style, fallow, tsc, coded lines and commit style as in part A. `tools/check-prose.ts` is a `tools/*.ts` fallow entry; each of its exports is imported by `tools/check-prose.test.ts`, and `tools/check.ts` spawns it as a script and imports nothing from it.

## Review Focus

Five conditions the spec implies but no task's own tests name first. Each line gives the behaviour a reasonable person would expect and the task whose tests pin it.

1. **A bullet whose tag is followed by a link** (`[skill-authored] [design-failure-catalog](references/design-failure-catalog.md)`, the shape of `SKILL.md` step 4, line 38 at 7506ffe). The bullet is tagged because it carries a tag, not because its last characters are one; the link is not read as a tag, and the sentence split keeps the tag with the sentence before it. C1 pins it.
2. **A `#` line inside a fenced block.** It is code, not a heading: the fence rule precedes the heading rule, and the block's lines are not measured. C1 pins it.
3. **A table cell holding a sentence over 25 words.** It counts under `long` for its row's heading, and the row's tag is read from the Provenance cell alone. C1 pins it.
4. **Regenerating the vocabulary region** (`tools/gen-element-vocabulary.ts`). The region is exempt, so a regeneration moves no count and the ratchet does not fire on it. C1 pins the exemption; C5's `structure-elements.md` commit runs the generator's test.
5. **Lowering a count without lowering the baseline, or raising the baseline.** The baseline-not-above-measured test fails on the first; `--write-baseline` refuses a rise on the second; so the baseline moves with the text in the same commit and only downward. C1 pins both.

## Decisions for the user at plan review

1. **`work-tracking.md` has no distill Recheck target** (the private `distill.js` names nine reference files and `SKILL.md`; `work-tracking.md` arrived later). Its stage-2 pass gets the Opus rule-preservation critic and the prose checker, and the acceptance note names it as the one file the Recheck did not cover. Default: as written. Alternative: an Opus checker with the Recheck's own prompt, run by hand. Ruled 2026-10-15: default. After stage 2, how to cover `work-tracking.md` (a distill pass or a Recheck-style checker) is revisited; C8 Step 6 lists it among the follow-ups.
2. **The description is shortened to 1,024 characters or fewer and triggering is checked by the user's `/skill-doctor` report**, quoted in the acceptance note, because the eval rounds name the skill explicitly and measure no triggering, and `/skill-doctor` is a user-invoked command. Default: as written. Alternative: a `claude plugin eval` suite with a `tool_used: Skill` grader over three prompts, which is its own small design. Ruled 2026-10-15: default. A `claude plugin eval` suite with a `tool_used: Skill` grader is a follow-up after part C only if the `/skill-doctor` report leaves a doubt.
3. **The prose check is spawned by `tools/check.ts` as a fourth step** (`tools/check-prose.ts` under the resolved Node, from the repository root), so the checker stays a CLI of its own that prints every count; `tools/check.test.ts`'s fake Host keys it on its script path. Default: spawn. Alternative: an in-process call, which would make the fake Host's empty `listDir` measure nothing. Ruled 2026-10-15: default, the spawn.
4. **The README's evaluation record gains one paragraph for the prose rounds** in C8, in the shape of the 0.6.0 sentences at `README.md:108`, after the stage-2 note exists; the 0.7.0 round's own sentences are pending the user's rulings in the main checkout and are not written here. Default: add the paragraph. Ruled 2026-10-15: default, the paragraph is added.
5. **Sentences of fewer than three words are not measured** (the basis the inventory of §3.1 used), so a bold lead such as `**Plan.**` or a cell holding an id is neither long nor untagged. Default: as written. Ruled 2026-10-15: default.
6. **§7.5's `test` and `close` rules meet §7.2 and §7.4.** Of the four verb uses of `test`, only `design-failure-catalog.md:97` and `methodology.md:146` are in sections this plan rewrites and skill-authored; rewriting them is an exception to "only the five substitutions". `near` for `close` applies only at catalog `:66`, a sourced row outside §7.2. Default: rewrite the two `test` verbs in C7 without the verb (`what is tested again` is out, since the verb stays; `what is checked again` is out, since `check` collides; the drafter finds a form with the noun, such as `which tests run again when it changes`), leave the other three lines alone, and record all five in the acceptance note. Alternative: apply none of them. Ruled 2026-10-15: default, the two `test` verbs are rewritten in C7 and all five lines are recorded.
7. **The items part B and the spec left with part C.** Three are ruled already and are carried by tasks: (a) the split sentence (§11.5 ruling 7, C0), (b) the singular "that substitution is counted" at `SKILL.md:109` (§11.5 ruling 4, C4), and (c) the stability predicate (§11.4 ruling 4 keeps the 0.2 bound through stage 2; C8 reports it; round 1c passes it on (1, high), (5, medium), (6, high), (6, medium) and (7, high) and fails it on (1, medium), (5, high) and (7, medium)). The open calls, lines at 15e8c87:
   - (d) no blank line between the seed list and its pointer line (`SKILL.md:92-93`; E3 review). Default: the `Seed from postmortems` drafter adds it (C4 Step 1's appended list). It is a formatting change, not a rule, and the critic does not flag it.
   - (e) no sentence says a sheet column with no schema field converts unmapped (E6 review; the Convert list). Default: after part C, beside §11.7's follow-ups in the acceptance note, since it adds a rule, which part C's critics are briefed to reject, as §11.7 rules for its three wording changes. Alternative: briefed to C4's Convert drafter as an allowed addition.
   - (f) spec §6.1's E3 amendment note quotes the seed-section text inside the c11 Convert bullet (`docs/specs/2026-10-14-prose-design.md:244`). Default: C8's spec edits add one dated line saying the quoted text was rewritten at stage 2 and the quote stands as the record of E3's text.
   - (g) `SKILL.md:153`, the pointer to `docs/specs/2026-09-07-fmea-software-design.md`, the only run-time sentence pointing outside the skill folder (E6 review minor 1, left to the user under §11.5 ruling 8). Default: the `Update after a change` drafter drops the pointer sentence and keeps `:152`'s rule; the critic reads the drop as a pointer removed, not a rule lost. Alternatives: keep the plain path; make it `${CLAUDE_SKILL_DIR}`-relative.
   - (h) E3 skeptic item c11-7, a Convert item naming each edge the conversion writes, with its `from` and `strength`, as a declared default in `meta.history` with its count (logged for part C). Default: after part C, beside §11.7's follow-ups in the acceptance note, since it adds a rule. Alternative: briefed to C4's Convert drafter.
   - (i) `tools/lib/browser.ts:306` starts `render.ts` with stdio inherit, so its provisional-count line prints in every browser command run that renders the checkout fixture (B4 review, "plan C or later"). Default: after part C, named in the acceptance note's follow-up list.

   Default: as written above. Alternative: any item moved into C4 as the user rules; the critics then count it as allowed. Ruled 2026-10-15: the defaults for (d) to (i).
8. **§11.4 ruling 5's catalog cause columns.** Ruling 5 logged the cause columns of `cat-dependency-01` (`design-failure-catalog.md:66`, `[adapted-from:C014]`) and `cat-security-04` (`:114`, `[skill-authored]`) in §11.3. It left them for the stage-1 gate to revisit, with the option to fold them into stage 2's rewrite. §11.5 to §11.7 record no revisit. Round 1c's critic asks for a ruling (`docs/specs/2026-10-14-prose-eval-results-1c.md:204`), because the restated cause seeded c3 losses in four runs (`:189`). Both rows lie outside §7.2's sections, §4.2 puts `cat-dependency-01`'s cause column out of scope, and §12 criterion 3 limits stage 2 to §7.1 and §7.2. Folding either row in therefore needs a dated amendment of those three. `cat-dependency-01`'s cell is sourced, and §7.4 allows it only a clause-boundary split, which leaves the restatement in place. Rewriting it also needs an exception to §7.4, with the private evidence and the Recheck. Default: neither row changes on this branch; both stay logged in §11.3, and the acceptance note names them. Alternative: C7 rewrites `cat-security-04`'s cause cell under that dated amendment, landed in C7 before its catalog commit, and rewrites `cat-dependency-01`'s only with the §7.4 exception. Ruled 2026-10-15: default; the two cells go on C8 Step 6's follow-up list, for a small dedicated change after part C, judged on its own.
9. **How §8.4's first bullet reads a drop on a criterion stage 1 did not gate.** §8.4 says "No pair scores worse than at stage 1 on any criterion", against prose-1c, where c1, c5 and c11 score 2 on every run they apply to. §8.3's second bullet was amended at the stage-1 gate (§11.5 ruling 3) so that a regression outside c1, c5 and c11 counts only when the result gate names a mechanism in the shipped text or the checks, and is otherwise logged as variance; §8.4 has no such clause. At round 1c, c3 and c6 dropped from baseline on four pairs with no mechanism in the text, so a stage-2 round read strictly could fail on judge variance alone. Default: C8's spec edit, before the round, adds a dated note to §8.4 giving its first bullet the same reading as §8.3's amended second bullet, over every criterion: a drop counts when the result gate names a mechanism in the stage-2 diff (a rule lost, moved or changed, which the rule-preservation lists make findable), and is otherwise logged as variance. Alternatives: strict as written (any drop fails: revise once, run once more, a second failure to the user, at about USD 1 and 33 minutes a round, as round 1c ran); or strict on c1, c5 and c11 only, with the variance reading for the rest. Ruled 2026-10-15: strict on c1, c5 and c11, the variance reading for every other criterion.

## Assumptions the plan rests on

- The private `distill.js` Recheck accepts a `files` list of base names and reads the tree `args.root` names (part B's assumption, confirmed when B6 ran).
- `tools/check.test.ts`'s `fakeHost` builds a full `Host` literal (lines 34-64) and derives a tool name from `args[0]` after the `dev/node_modules/.bin/` prefix; C2 extends it to key `tools/check-prose.ts` by its path. Its resolved Node is `/opt/node/bin/node`.
- `SKILL.md` and the references stand as round 1c measured them at 4f2cd77: B6's 4e7860c as revised by the round-1b revision (6966ed6), the epilogue's E3 (8d7db34) and E6 (4de8fd4), and the lint-row commits to `quality-and-lint.md`. Neither has changed since. Plan B's epilogue makes round 1c the round of record, so the baseline written in C2 on these files, as C0 completes them, is §7.6's "first written on the stage-1 text".
- The two reasons §7.1 names already have fuller twins in their references: the IEC 60812 clause-order sentence (`SKILL.md:28` at 7506ffe, in the lead under `## The spine`, [cites:C055]) at `methodology.md:96`'s "Controls identified before the evaluation step" row, and the LLM-rating study with its "The gate is therefore…" consequence (`SKILL.md:39` at 7506ffe, step 5, [paraphrased:C067]) at `scales-software.md:133` under `## The review gate`. The move therefore appends nothing: `SKILL.md` keeps a one-line pointer to each and the reference copies are not touched (§7.1's twin rule).

---

### Task C0: The split sentence, its §6.3 note and the stage-1 Recheck

Spec §11.5 ruling 7, carried to part C by §11.6, adds one sentence to `skills/fmea-software/references/quality-and-lint.md` and a dated note to the spec's §6.3. Spec §7.4 asks for a distill Recheck "after stage 1", and no stage-1 Recheck passed: the part B ledger (`.superpowers/sdd/2026-10-14-prose-b-behaviour/progress.md:94`, `:132`) records pass=false on every file of every run, and E6 fixed the pre-branch findings at 4de8fd4 and left ruling 7's sentence and the re-run to plan C. Both land before C2 writes the baseline, so the baseline is written on the stage-1 text as completed.

**Files:**
- Modify: `skills/fmea-software/references/quality-and-lint.md` (one `[skill-authored]` sentence after the WS3 table, whose last row is L105, in the shape of the file's other split sentences at L77, L261 and L263; it splits the `design-inputs-declared` row at L84 from the `edge-reliability-unstated` row at L244; lines at 15e8c87)
- Modify: `docs/specs/2026-10-14-prose-design.md` (§6.3 at L256: the dated note ruling 7 asks for, after the existing 2026-10-15 amendment at L260-264)

**Interfaces:**
- Consumes: the stage-1 text at 15e8c87; the Recheck's proposed fix in `.superpowers/sdd/2026-10-14-prose-b-behaviour/r-recheck-result.json`.
- Produces: the stage-1 text as C2 measures it; the Recheck verdict C8 reports.

- [ ] **Step 1: The sentence and the §6.3 note**

The sentence is the fix the Recheck proposed, recorded in `.superpowers/sdd/2026-10-14-prose-b-behaviour/r-recheck-result.json` at `files[0].outstanding[1].fix`: "In plan C, add one [skill-authored] sentence after the WS3 table. It leaves to `edge-reliability-unstated` a missing or placeholder sla or limits that no open user assumption names, so that defect is reported once, and keeps the rest of the judgement under `design-inputs-declared`. Add the dated note that ruling 7 names." The sentence leaves to the machine lint `edge-reliability-unstated` an edge whose `sla` or `limits` is absent, empty or a placeholder and that no open assumption owned by `user` records, and keeps the rest of the judgement under the reviewer row `design-inputs-declared`, so the defect is reported once. The sentence goes directly after the WS3 table's last row (`quality-and-lint.md:105` at 15e8c87), before the metastable paragraph at `:107`. It stands as its own paragraph, with a blank line on each side. At most 25 words per sentence, split into two sentences if needed, each tagged `[skill-authored]`; no rule beyond the split. The §6.3 note is one dated paragraph in the form of §6.3's existing amendment, `(amended <date> at plan C's task C0, §11.5 ruling 7: …)`, naming ruling 7 and the sentence.

- [ ] **Step 2: Run the gates**

Run: `bun tools/run-tests.ts` and `bun tools/check.ts`. Expected: both exit 0; `run-tests.ts` ends each of its two suites with `ℹ fail 0` (969 and 356 tests at 15e8c87), and `check.ts` ends with `✓ 0 above threshold`.

- [ ] **Step 3: The stage-1 Recheck over the uncommitted tree (Workflow, Opus)**

The Recheck runs before the commit, on the uncommitted tree, as plan B's B6 Step 3 did. It covers `quality-and-lint.md` with the sentence in place, `SKILL.md` and `design-inputs.md`. Dispatch with the Workflow tool:

```json
{ "scriptPath": "/home/nn/Projects/failwise/.claude/worktrees/prose/.superpowers/sdd/2026-10-14-prose/distill.js",
  "args": { "stage": "check", "root": "/home/nn/Projects/failwise/.claude/worktrees/prose", "files": ["SKILL.md", "design-inputs.md", "quality-and-lint.md"] } }
```

The script is the gitignored copy, byte-identical to the private original, whose path the Workflow tool refused at B6 (part B ledger `:79`). A file passes only when its checker returns pass; a file at pass=false is unverified, never pass. The verdict per file and the workflow id go in the ledger, in Step 4's commit body and in C8's acceptance note (C8 Step 6). Tiers: the Recheck's checkers are Opus, as at B6; no Fable call.

C0 itself fixes nothing. A finding on any of the three files makes that file unverified. The controller takes it to the user before C1, since the stage-1 text is the user's by the §11.5 rulings. If the user rules fix-and-note, the fix is its own commit, named pre-branch in its title. It lands after Step 4's commit of the sentence and before C1. That commit's body carries the verdict of the Recheck, re-run once over the fixed file. Such a fix is pre-branch text outside §7.1 and §7.2, and its commit body says so. The first "In addition" constraint admits it beside the split sentence, and C8 Step 5 names it to the gate with ruling 7's sentence. The stage-1 figures stay those of the round-1c text: 56,336 characters as a file, 55,471 at the skill load. If the user rules log, the acceptance note lists the item as unverified (C8 Step 6). The file then stays as it is, and C2's baseline is written on the text as it stands.

- [ ] **Step 4: Commit**

The commit follows the Recheck, so its body carries the verdict, as spec §7.4 asks.

```bash
git add skills/fmea-software/references/quality-and-lint.md docs/specs/2026-10-14-prose-design.md
git commit -F- <<'EOF'
Docs: the edge lint alone reports a missing SLA or limit, §6.3 noted

§11.5 ruling 7, which §11.6 carries to part C: one [skill-authored] sentence
after the WS3 table leaves to edge-reliability-unstated a missing or
placeholder sla or limits that no open user assumption records, and keeps the
rest of the judgement under design-inputs-declared. §6.3 gains ruling 7's
dated note. Apart from any pre-branch fix the user rules in C0, the
sentence is part C's one ruled change to skill text outside §7.1 and
§7.2. Distill Recheck <date>, <workflow id>:
quality-and-lint.md <pass|unverified>, SKILL.md <pass|unverified>,
design-inputs.md <pass|unverified>.
EOF
```

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
- Consumes: C1's CLI; the stage-1 text as C0 completed it.
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
- Produces: the one page every C4 to C7 drafter and critic reads, under these headings, in this order: `# How the skill's prose is written`; `## Two kinds of text` (an instruction tells the model what to do; a description tells a person what is so; how to tell them apart: the verb and the reader); `## The shape of a procedure` (one lead sentence stating what the step produces, then a list of rules in the order the model acts, one rule per bullet, the command verb first, the rule before its reason, a warning before the step it guards, the "before you write" list last); `## Caps` (20 words for an instruction, 25 for a description, six sentences for a procedural paragraph, then a list; what the checker counts and what the critic checks); `## One word for one thing` (the schema's word preferred; no new sense; the five substitutions, the five refusals and the `test` and `close` rules of §7.5 as a two-column table (the obey-for-follow sentence §7.5 cites as `SKILL.md:156` is at `:212` at 15e8c87), with decision 6's ruling; the sentences the table leaves alone); `## Tags` (the rules of §7.4 verbatim; a split sourced sentence keeps its tag on each part and is never reworded; a bullet that would mix sources is split); `## Text no one changes` (the frozen list of §4.3, each with the test or reason that pins it; the twins named by their text, or by their lines at 15e8c87, `SKILL.md:35`, `:41`, `:98-99`, `:165`, `:173-175` and `:185`, since §4.3's numbers are those of 7506ffe); `## Changing a sourced sentence` (what it requires: the private evidence, the Recheck, the audit, the tag's permission); `## The checker` (`node tools/check-prose.ts` from the repository root, the three counts, the baseline rule, `--write-baseline` and its refusal of a rise). One page: at most 120 lines.

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
- Consumes: C2's checker and baseline, C3's style rule, part B's placements, and the `SKILL.md` items that part B and the spec leave to part C or to the user's call at plan review. Each item is named by its text, with its line at 15e8c87:
  - the singular "that substitution is counted" at the end of the Convert section's control sentence "A control taken from the sheet carries `status: existing`, …" (`:109` at 15e8c87; §11.5 ruling 4, §11.6's carried items);
  - the blank line missing between the seed list's last item, "A control an action item created is `existing` only where …", and the pointer line "Before you send a seeded run's final message, …" (`:92`-`:93` at 15e8c87; E3 review minor);
  - the Convert list's missing statement that a sheet column with no schema field converts unmapped (E6 review note; no sentence in `SKILL.md` or the references says it);
  - the user's call on the update-section sentence that names `docs/specs/2026-09-07-fmea-software-design.md`, the only run-time pointer outside the skill folder: keep it, make it `${CLAUDE_SKILL_DIR}`-relative, or drop it (`:153` at 15e8c87; E6 review minor);
  - E3's skeptic item c11-7, a Convert item naming each edge the conversion writes, with its `from` and `strength`, as a declared default in `meta.history` with its count of edges (logged for part C).

  Decision 7 says which of these land in C4; the critics count a ruled item as allowed, not as a rule added.
- Produces: the rewritten `SKILL.md` C8's final judge reads as one document; the shortened frontmatter description.

- [ ] **Step 1: The sections and their drafters (Workflow, Opus)**

One Workflow, one drafter per section, in parallel, the sections named by heading because part B moved the lines: the lead under `# Software FMEA, design side` before `## Input rule` (`SKILL.md:8-11` at 7506ffe, two sentences over the cap at `:8` and `:11`); `Input rule`; `When this skill runs`; the lead under `## The spine` before item `1. **Plan.**` (`:25-33` at 7506ffe: the seven-step sentence [cites:C086]; the two adjustments, which hold the IEC 60812 clause-order sentence [cites:C055] at `:28`, the no-standard-binds sentence at `:29` and the C071 evidence-kind sentence at `:30`; and the review paragraph at `:32-33` (the [paraphrased:C110] sentence at `:32`, its two `meta.reviews[]` rules at `:33`), which step 7's "recorded the same way" depends on); one per spine step, 1 to 7; the two sentences under `## Other modes` before `### Seed from postmortems`; `Seed from postmortems`; `Convert a legacy sheet`; `Update after a change`; `Migrate a v1 document`; `Migrate a v2 document`; `Scripts` (the prose after the fenced block only, which becomes a table: Script, What it refuses and how, Provenance); `Reference files` (a table: File, Carries, Load when, Provenance); `What v1 does not carry`; the frontmatter `description`. Each drafter gets: `docs/style.md`; the section's current text, which is the stage-1 text as C0 completed it; the §7.1 rules for its section (a spine step: lead sentence, then the rules in the order the model acts, the stage-1 "before you write" list last, the edge rule staying in the edge bullet, the hand-over rule first in the hand-over list; a reason that is not a rule moves to the reference that owns the topic, and where the reference already states the claim the sentence is a twin: the step keeps a one-line `[skill-authored]` pointer, nothing is appended and the reference stays untouched; the IEC 60812 clause-order sentence in the spine lead and the LLM-rating study with its consequence in step 5 are both twins, of `methodology.md:96` and `scales-software.md:133`; a near-verbatim twin of a reference anywhere else keeps the short imperative and a pointer); the frozen literals in its section; the D9 rule as amended, that the inconsistencies of spec §11.3 are logged, not fixed, except the §5.5 reference, which 4de8fd4 fixed in plan B's task E6 (§11.5 ruling 8, moved to E6 by §11.6), so each remaining one's content stays as it stands, quoted: the two sentences `Unattended, this question has no default: write nothing, leave the file as it was with no history entry and no version bump, and end with the question, naming each such element.` and `… naming each such codebase.` stay two rules, each after its own question, and are not merged; in `Migrate a v1 document`, `The migration runs alone, never in the same update as an architecture change` and `A v1 document runs this migration and then the v2 migration below in the same update, …` are not reconciled. The `Convert a legacy sheet` drafter also gets the one ruled wording change, §11.5 ruling 4, kept with part C by §11.6. It rewrites the singular `that substitution is counted` in the control sentence (`SKILL.md:109` at 15e8c87, `[skill-authored]`) so it names both defaults it covers. These are `status: existing` and `evidence.kind` `none`, each counted in the column mapping like the others. Each drafter also gets the rule that a sourced sentence is split at a clause boundary only. The two sentences that replaced the §5.5 clause in the update section, `The update summary copies the checker's flow sections: …` and `` The checker's flow diff and removed-flow guard are specified under `update-check.ts` in §9 of the plugin's design, … `` (`SKILL.md:152-153` at 15e8c87), are not a logged item: they are drafted like any other rule, keeping their meaning. Whether `:153` keeps its path outside the skill folder, is made `${CLAUDE_SKILL_DIR}`-relative, or is dropped is decision 7 item (g), settled before the `Update after a change` drafter is dispatched.

Appended to the drafters' brief: the items part B left for part C or for the user in three sections, each applied only as decision 7 rules, lines at 15e8c87.

- In `Seed from postmortems`: a blank line between the seed list (`SKILL.md:88-92`) and its pointer line (`:93`) (E3 review minor; decision 7 item (d)).
- In `Convert a legacy sheet`, two rules added, each ruled by the user into C4 or, after part C, beside §11.7's follow-ups in the acceptance note: a sentence that a sheet column with no schema field converts unmapped (E6 review note; decision 7 item (e)), and a Convert-list item naming each edge the conversion writes, with its `from` and `strength`, as a declared default with its count of edges in `meta.history` (E3 skeptic c11-7, logged for part C; decision 7 item (h)).
- In `Update after a change`: `:153`'s plain path to `docs/specs/2026-09-07-fmea-software-design.md`, kept, made `${CLAUDE_SKILL_DIR}`-relative, or dropped (E6 review minor 1, a user call under §11.5 ruling 8; decision 7 item (g)).

The critics count each item the user rules into C4 as allowed, not as a rule added or a meaning changed. An item ruled out of C4 keeps its current text, and the critics flag any change to it.

Each drafter returns `{ text, rules_before: [{ rule, tag }], rules_after: [{ rule, tag, position }], twins: [{ sentence, tag, reference, section }] }`. The description drafter returns a description of at most 1,024 characters, one plain unquoted YAML line (`description: …`, no folded or quoted scalar), third person, what the skill does first, then when to use it, keeping every trigger word of the current one (FMEA, DFMEA, the four shapes, the file names).

- [ ] **Step 2: The rule-preservation critics (Workflow, Opus, in the same pipeline)**

For each drafted section, one critic given the section before and after and the drafter's two rule lists, asked to list every rule in the before text and find it in the after text, and to flag: a rule lost, a rule added, a rule moved from its stage-1 position, a rule whose meaning changed (one ruled change and each decision 7 item ruled into C4 (Step 1) excepted, each flagged when it is missing; the ruled change is, in `Convert a legacy sheet`, the control sentence's singular `that substitution is counted`, `SKILL.md:109` at 15e8c87, reworded so it names the two defaults it covers, `status: existing` and `evidence.kind` `none`, each counted in the column mapping like the others, as the list item at `SKILL.md:120` already names them; §11.5 ruling 4, kept with part C by §11.6 and plan B's epilogue), a sourced sentence reworded rather than split, a tag lost or changed, a sentence over the cap, a frozen literal changed, a substitution applied in a sourced sentence or outside §7.5's list, a new sense of a word, a §11.3 item fixed, a twin appended to a reference that already carries it. Schema `{ pass: boolean, findings: [{ rule, defect, change }] }`. A failing section goes back to its drafter with the findings, up to three rounds; a section still failing is returned unverified.

- [ ] **Step 3: Assemble, measure, pin**

The controller assembles `SKILL.md` from the returned sections in the file's order, the Scripts fenced block byte for byte, the migration headings and the stale-reason line unchanged, then runs `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/check-prose.ts` (every count under the baseline; the `SKILL.md` headings at zero over-cap sentences and zero untagged items, frozen text excepted, each excepted item listed in the ledger with its §4.3 clause), `bun tools/run-tests.ts` (the pinned literals: `tools/skill-commands.test.ts`, `update-check.test.ts:274`, `prompts.test.ts`; expected here: every test passes except `the real baseline is never above the real counts`, which fails because the baseline is still above the lowered counts until Step 4 writes it; any other failure stops the step) and `bun tools/check.ts`. No reference file changes in this task (the two moved reasons are twins). The description's length: run `python3 -I -c "import re; t=open('/home/nn/Projects/failwise/.claude/worktrees/prose/skills/fmea-software/SKILL.md', encoding='utf-8').read(); print(len(re.search(r'^description: (.*)$', t.split('---')[1], re.M).group(1)))"`. Expected: one integer, at most 1024 (characters, not bytes; the current description gives 1178). An `AttributeError` means the description is no longer one plain line: the check is unverified and the step stops.

- [ ] **Step 4: The Recheck, the baseline, the commit**

The private Recheck over `SKILL.md`, dispatched as C0 Step 3 dispatches the stage-1 Recheck (the gitignored copy `.superpowers/sdd/2026-10-14-prose/distill.js`), with `files: ["SKILL.md"]`. Then `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/check-prose.ts --write-baseline` (the counts fall, so the baseline falls; a rise refuses), the two runners (expected: both exit 0), and the commit:

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

The ledger records the file size of `SKILL.md` in characters (47,224 before stage 1, at 7506ffe; 56,336 after stage 1, the text of 4de8fd4 that round 1c ran, unchanged at 15e8c87; after stage 2; the file count includes the frontmatter description, which the skill load does not carry), the per-heading counts, the critics' findings and rounds, any unverified section, and the tiers. The size at the skill load is C8's measurement.

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
- Modify: `skills/fmea-software/references/quality-and-lint.md` (The skill applies these to itself, L264 at 7506ffe, L266 at 15e8c87, after B2 and B3 add their rows after line 243)
- Modify: `skills/fmea-software/references/work-tracking.md` (The three commands L7; The rules L18, rule 7 kept as the first column-0 line starting `7. `)
- Modify: `skills/fmea-software/references/method-selection.md` (Which incidents seed a chain L20; What a postmortem hands over L42; Learning and action are fenced apart L51; Identifiers a seeded chain carries L60; What incident data may rate, and what may not L67; The threat-model handoff L92; The interface L98; What the handoff does not do L107)
- Modify: `dev/prose-baseline.json`

- [ ] **Step 1: Per file, the C4 procedure**

As C5, one commit per file. `quality-and-lint.md`'s pinned sentences (lines 24-26) and rows are outside the named section and untouched; the sentence §11.5 ruling 7 adds after the WS3 table landed in C0 and is not part of C6's rewrite; `tools/skill-commands.test.ts` reads `work-tracking.md`'s rule 7 and the Recheck does not cover `work-tracking.md` (decision 1): its commit body says `Distill Recheck: not covered (the private distill names no work-tracking.md); Opus critic pass, prose checker pass`.

---

### Task C7: `design-failure-catalog.md`, `methodology.md`, `scales-software.md`, `provenance.md` and `process-stub.md`

**Files:**
- Modify: `skills/fmea-software/references/design-failure-catalog.md` (Reading a row L7; ML or LLM elements L86, whose questions stay under that heading and are not moved to `structure-elements.md` (§11.3); What this catalog does not carry L162; the cause columns of `cat-dependency-01` (L66, `[adapted-from:C014]`, which §7.4 forbids rewording on this branch) and `cat-security-04` (L114, `[skill-authored]`) lie outside §7.2 and stay as §11.3 logs them unless the user takes §11.4 ruling 5's option at plan review (decision 8))
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
- Modify: `docs/specs/2026-10-14-prose-design.md` (the spec edits decisions 7 and 9 name: §8.4's dated note, decision 9; the dated line at §6.1's E3 note, decision 7 item (f))

**Interfaces:**
- Consumes: C4 to C7 as merged; parts A and B's notes and `results.json` files; the stage-1 round of record.
- Produces: the evidence the user rules on.

- [ ] **Step 1: Clean tree and gates**

Before the round, the spec edits decisions 7 and 9 name, as the user ruled them, are committed by explicit path. The template carries both rulings of 2026-10-15: decision 7 item (f)'s dated line, and decision 9's dated note under §8.4. That note reads §8.4's first bullet strictly on c1, c5 and c11. A pair scoring worse than at stage 1 on one of them fails: revise once, run once more, a second failure goes to the user. On every other criterion it takes §8.3's amended variance reading. A drop there counts when the result gate names a mechanism in the stage-2 diff, a rule lost, moved or changed. Otherwise it is logged as variance.

```bash
git add docs/specs/2026-10-14-prose-design.md
git commit -F- <<'EOF'
Spec: §8.4 reads a drop as §8.3 does, the E3 quote kept as the record

Two dated notes land before the stage-2 round, as the user ruled plan
C's decisions at plan review. §8.4 gains decision 9's note: its first
bullet is read strictly on c1, c5 and c11, where a drop fails. Every
other criterion takes §8.3's amended variance reading. There a drop
counts when the result gate names a mechanism in the stage-2 diff, and
is otherwise logged as variance. §6.1's E3 amendment note gains the
dated line of decision 7 item (f): the quoted seed-section text was
rewritten at stage 2. The quote stands as the record of E3's text.
EOF
```

Then run: `git status --short` (expect nothing), `bun tools/run-tests.ts`, `bun tools/check.ts`. Expected: all exit 0. Record `git rev-parse HEAD`.

- [ ] **Step 2: Run and judge the round, generate the note, append its sections**

Run in the background, as round 1c ran, `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/run-round.ts 2 --parallel 4 > .superpowers/sdd/2026-10-14-prose/round-2.log 2>&1` (`bun tools/run-round.ts 2 --parallel 4` also works), waiting with Monitor for the process to exit. The launcher smoke-tests the gateway, runs the canary p1:high:1 alone, then the other fifteen cells four at once, with every inherited `CLAUDE*` variable stripped from the smoke call and every cell, writes `build/evals/prose-2/round.json` (the source of the note's Round method line), and prints the sixteen summary lines and a `round finished` line; it exits 0 when every cell is clean. A canary that refuses or ends with an artefact missing stops the round with exit 1 and starts no other cell; move its folder out of `build/evals/prose-2/` before launching again. When a fanned-out cell fails, it exits 1, names the cells to re-run, and prints the `node tools/run-round.ts 2 --no-canary --cells …` command; move each named cell's published folder out of `build/evals/prose-2/` first, keeping it for the record, since the launcher refuses a run folder that already holds a transcript. Then the Workflow tool with `tools/workflows/evals.js` and args `{ root: "/home/nn/Projects/failwise/.claude/worktrees/prose", evalsDir: "build/evals/prose-2", prompts: [1, 5, 6, 7], capabilities: ["high", "medium"] }`. It returns the results object and writes no file. Write `build/evals/prose-2/results.json` as `JSON.stringify(result, null, 2)` of the `result` key of the Workflow task's output (CONTRIBUTING.md, Evals; `.superpowers/sdd/2026-10-14-prose/PROCEDURES.md`, "Persist"), and check that it parses and holds 16 `runs[]`, 8 `stability[]` and the `unverified[]` list. Then:
```
/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/eval-report.ts --results build/evals/prose-2/results.json --out docs/specs/2026-10-14-prose-eval-results-2.md --title "Eval results, prose stage 2"
```
Expected: `wrote docs/specs/2026-10-14-prose-eval-results-2.md`, exit 0; on exit 3 or 1 no note is written and the stage is unverified. Append the hand-written tail in the form the stage-1 notes carry it (`docs/specs/2026-10-14-prose-eval-results-1c.md:207-308`). Before the round is judged, the controller gives the gitignored helper `.superpowers/sdd/2026-10-14-prose/b7-append.py` a stage-2 form. At stage `2` it writes clause (f) on every `## §8.2 check` line. Today it writes clause (f) only for `1b` and `1c` (`b7-append.py:234` and `:259-265`). The stage-2 form writes stage 2's confounds without the two stage-1 input sentences of `:99-111`, and adds `## SKILL.md size`. Run it with `--dry` first. A `## §8.2 check` line without clause (f) makes its run unverified, never verified. Then `python3 -I .superpowers/sdd/2026-10-14-prose/b7-append.py <worktree> 2` appends the tail. The tail holds these sections:

- `## What this round cannot separate`: the §8.5 text, then stage 2's own confounds against prose-1c: the rewrite; the launch method and the CLI version, each compared with prose-1c's rather than the baseline's. Leave out A6 Step 5's sentences on prompt 7's input and prompt 6's answer key, because prose-1c ran on the same fixtures.
- `## Secondary leak grep`
- `## Bundled skills`
- `## §8.2 check`, including clause (f), the final message complete.
- `## Warnings the final documents carry`
- A sixth, `## SKILL.md size`: `At the skill load: 55,471 characters at stage 1 (build/evals/prose-1c/p1/high/run1), <b> at stage 2. As a file: 47,224 before stage 1, 56,336 after stage 1, <d> after stage 2 (the file count includes the frontmatter description, which the skill load does not carry).`
- A seventh, `## §8.4 reading`, written by hand at Step 3 in the form of round 1c's `## §8.3 reading` (`docs/specs/2026-10-14-prose-eval-results-1c.md:299-308`). It holds each §8.4 bullet with its verdict and the drops read as decision 9 rules, strict on c1, c5 and c11. It also holds the stability pairs and each frozen item with its §4.3 clause.

After any regeneration, re-splice all seven with `regen-note.py` (`.superpowers/sdd/2026-10-14-prose/PROCEDURES.md:19-21`).

- [ ] **Step 3: Read the round against §8.4**

Per pair and criterion by §8.1's definition against the stage-1 round of record (`build/evals/prose-1c/results.json`), no pair scores worse, read as decision 9 rules. A drop on c1, c5 or c11 fails: revise once, run once more, and a second failure goes to the user. On every other criterion a drop counts only when the result gate names a mechanism in the stage-2 diff, and is otherwise logged as variance. Stability holds where it held at prose-1c, on (1, high), (5, medium), (6, high), (6, medium) and (7, high), under the 0.2 × max-rows count bound (`COUNT_BOUND_FRACTION`), which stays through stage 2 (§11.4 ruling 4); the per-heading counts of `node tools/check-prose.ts` (nvm's node by absolute path) show zero over-cap sentences and zero untagged items in `SKILL.md` and under the §7.2 headings, frozen text excepted: each remaining item under one of those headings is listed in the note under `## §8.4 reading` with the §4.3 clause that freezes it (an anchor row, a sourced reproduction, a split-only sourced sentence), and an item with no such clause is a §8.4 failure, never absorbed. The size at the skill load, before and after: in `build/evals/prose-1c/p1/high/run1/transcript.jsonl` (55,471 characters, measured 2026-10-15) and `build/evals/prose-2/p1/high/run1/transcript.jsonl`, the first entry with `type: "user"` whose content holds a `text` block starting `Base directory for this skill:`; its size is that block's length in characters (`python3 -I` over the JSONL; the 0.7.0 round's p1/high/run1 measured 46,359); a missing block counts as unverified, not as zero. An unverified cell has its folder moved out of `build/evals/prose-2/` (kept for the record, as the launcher asks) and is re-run with `/home/nn/.nvm/versions/node/v24.17.0/bin/node tools/run-round.ts 2 --no-canary --cells p<p>:<cap>:<n>`, which replaces that cell's entry in `round.json`; a cut-off cell is re-run once, and a second cut is a failure (§8.1). The pair is then judged and merged by the rest of A6 Step 5's procedure: both run folders copied into `build/evals/prose-2-rerun/`, `evals.js` with `evalsDir: "build/evals/prose-2-rerun"`, and the merge by hand into `build/evals/prose-2/results.json`. The note is then regenerated and re-appended.

- [ ] **Step 4: The user's triggering check**

Ask the user to run `/skill-doctor` on the plugin (decision 2) and paste its report; quote it in the acceptance note. The eval rounds name the skill and do not measure triggering.

- [ ] **Step 5: The Fable final acceptance (Agent, session model, unanchored)**

One agent on the session model, given: `git diff 15e8c87..HEAD -- skills/ docs/style.md` (C0's §11.5 ruling 7 sentence in `quality-and-lint.md` is in that diff, outside §7.2, and so is any pre-branch fix the user ruled in C0; the gate is told of both), the stage-2 note, the stage-1 round of record's note (`docs/specs/2026-10-14-prose-eval-results-1c.md`), §8.4, §12 and §11.5 ruling 7 of the spec, and the rewritten `SKILL.md` as one document; asked whether a model acting from `SKILL.md` would do the right thing in the right order, whether the diff touches only §7.1 and §7.2 and keeps every frozen literal and stage-1 placement, and whether §8.4 is met; it rules `pass`, `revise` or `escalate` with findings. It receives no controller conclusion. Schema `{ verdict, findings: [{ where, defect, change }] }`. Each gate run is recorded in the ledger. On `revise`: apply, re-run the affected file's C4 procedure and the gate once; a second `revise` or `escalate` goes to the user.

- [ ] **Step 6: The acceptance note and the README paragraph**

`docs/specs/2026-10-14-prose-acceptance.md`, one paragraph per criterion of §12 (eight), each met, unverified or not applicable with its evidence (the commits, every round's note, the Recheck verdicts per commit, the stage-1 Recheck's verdict and workflow id from C0 beside C4's, the checker's final counts, the `/skill-doctor` report, the private audit as the user's pre-push step); then §8.5 stated in full (D12, judge variance, the open c5 reading of D15 named, the model). Then the items that the spec's gate rulings and plan C's review rulings send to this note:

- the stability count predicate, which §11.6 leaves with part C: the 0.2 bound stays through stages 1 and 2 (§11.4 ruling 4), and part C does not change it. Each pair that fails the bound is named by kind, row-count case or rating drift, as ruling 4 names prose-0's four: (1, high) and (7, medium) as row-count cases, (1, medium) and (5, high) as rating drift. Beside them stand the failures of round 1c, the stage-1 round of record, (1, medium), (5, high) and (7, medium), and those of stage 2. The predicate's redesign (share-based or shared-chains, with the rubric, `COUNT_BOUND_FRACTION` and the tests moving together) is on the v1 acceptance agenda.
- the attribution hole that the strict c5 reading would close (D15, §11.4 ruling 6), with §11.3's proposed rule that the carry note goes in `history[]` and the rationale stays byte-identical.
- the prompt-6 sheet parser, revisited on the rounds' c11 scores. §11.4 ruling 10 named three rounds (baseline, stage 1 and stage 2) before rounds 1b and 1c ran.
- the record that §11.4 ruling 11 asked of stage 1 and that no stage-1 note carries: c5's failure did not reproduce at baseline (0 of 4 prompt-7 runs under the lenient reading), so its stage-1 result shows non-regression only; c1's premise held on 6 of the 8 planted-gap runs, not on (1, high); and c11's mechanism held on 2 of 4 under §11.4 ruling 2, c11's broad reading.
- the §5.5 reference that §11.3 still lists at `SKILL.md:98`, named as fixed on this branch at 4de8fd4 (§11.5 ruling 8, which §11.6 moved to plan B's task E6; D9 as amended).
- §11.4 ruling 9's reading: the rounds count as the prose baseline and the stage comparisons only, not as v1 evidence for criterion 2 of the base design's §15.
- the five lines of decision 6, each with what C7 did to it: the two `test` verbs rewritten, the other three left alone.
- §11.7's follow-ups after part C, with the items decision 7 leaves after part C.
- how to cover `work-tracking.md`, which the Recheck does not cover (decision 1): a distill pass or a Recheck-style checker, revisited after stage 2.
- a `claude plugin eval` suite with a `tool_used: Skill` grader, after part C only if the `/skill-doctor` report leaves a doubt (decision 2).
- the cause columns of `cat-dependency-01` and `cat-security-04`, unchanged on this branch (decision 8): a small dedicated change after part C, judged on its own.

Then every unverified cell of every round; the tier of every phase of parts A, B and C and the Fable calls actually made, from the ledgers (three gates planned, B1, B7 and C8; plan A made no Fable call; plan B made six: the draft gate at B1, the round-1b revision's draft gate, the draft gate at E3, and the result gate on prose-1, prose-1b and prose-1c, none of them a re-run on `revise`; plus C8's, with its one re-run if it rules `revise`); the deviations the plans recorded (part A's decisions 1 to 7 and the eleven rulings of the stage-0 gate (spec §11.4), part B's decisions 1 to 7 and the rulings of its three stage-1 user gates (spec §11.5 to §11.7), part C's decisions 1 to 9); the file the Recheck did not cover (decision 1); and §11.3's logged items with the ones the rounds touched. The README paragraph, after line 108, in the 0.6.0 sentences' shape: what the prose rounds ran and scored, what stayed unverified, and the links to every round's note.

- [ ] **Step 7: Serve the result to the user and stop**

Report in one message: the commit, every note's path and that their appended sections are present, the acceptance note's path, the per-criterion comparison with stage 1, the checker's counts, the two skill-load sizes, the gate's verdict, the tiers and the Fable calls actually made, and the things that are the user's to decide: whether the rounds' results are accepted, whether to run the Claude-model after round (§8.5), whether to rebase `prose` when `flow-model` merges, and whether to push after the private audit; and the items the spec and the part B ledger leave to the user at or after this gate: the attribution hole that the strict c5 reading would close (D15, §11.4 ruling 6), with §11.3's rule "carry note goes in history[], rationale stays byte-identical" as `SKILL.md` text for after stage 2; the stability predicate redesign (§11.4 ruling 4's v1 acceptance agenda, carried to part C by §11.6); the sheet parser, on three rounds of c11 scores (§11.4 ruling 10); the c2 skill wording at `design-inputs.md:105` and `structure-elements.md:156-158` (lines at 15e8c87), a follow-up decision after stage 2 (§11.4 ruling 1); the cause columns of `cat-dependency-01` and `cat-security-04`, unless decision 8 folded them into C7's rewrite (§11.4 ruling 5, which no stage-1 gate ruled on); §11.7's follow-ups after part C (three wording changes, the enforcement of the seed sentence that a control the inventory does not list carries `evidence.kind` `none`, and the harness fixes to the count check and `firedCount`), and the items decision 7 leaves after part C; and those of the part B review minors parked for the user (part B ledger, `.superpowers/sdd/2026-10-14-prose-b-behaviour/progress.md:187`) that part C did not fix. **This plan ends at that gate.** The note, the acceptance note and the README paragraph are committed only after the user has read them:

```bash
git add docs/specs/2026-10-14-prose-eval-results-2.md docs/specs/2026-10-14-prose-acceptance.md README.md
git commit -F- <<'EOF'
Evals: the prose stage-2 round and the acceptance note

Sixteen runs on deepseek-flash under rubric 4 and the harness as §8.1
amends it (the cut-off final-message gate, the count check), launched by
tools/run-round.ts with the CLAUDE* variables stripped, as round 1c was,
read against §8.4 of the prose design; the acceptance note rules on
§12's eight criteria and names every unverified cell of every round.
EOF
```
