# How the skill's prose is written

This page is the style rule for `skills/fmea-software/SKILL.md` and the files in `skills/fmea-software/references/`. It states the rules of §4.3 and §7 of `docs/specs/2026-10-14-prose-design.md`, with the amendments of its §11. Line numbers are those of commit a90b912; once a rewrite moves a line, find the item by its quoted text. A bare file name is a reference file, and a test file without `tools/` is in `skills/fmea-software/scripts/`. Other paths start at `skills/fmea-software/`, except those under `tools/`, `dev/`, `docs/` and `build/`.

Rewrite only `SKILL.md` and the procedural sections of the references that §7.2 of the spec names. Leave the descriptive sections and `evals/rubric.md` alone. Lose, add or change no rule, and move none from its stage-1 position. Only a ruled item is exempt, such as the singular "that substitution is counted" at `SKILL.md:109` (§11.5 ruling 4). The three wording changes of §11.7 each add a rule, so they wait until after part C.

## Two kinds of text

An instruction tells the model what to do. A description tells a person what is so. Tell them apart by the verb and the reader:
- An instruction's verb is a command, such as "Write", "Ask" or "Never write". Its reader is the model that runs the skill.
- A description's verb states a fact, such as "is", "carries" or "counts". Its reader is a person, such as a reviewer.
- A sentence the model must act on, such as "Those words are a value, not a gap", is an instruction whatever its verb. A sentence that only states a fact, a reason or a definition is a description, even though the model reads it.

## The shape of a procedure

Give each step of the spine in `SKILL.md`, and each of its other modes, this shape:
1. Open with one lead sentence that states what the step produces.
2. List the rules in the order the model acts, one rule per bullet, each starting with its command verb.
3. Put each rule before its reason, and each warning before the step it guards.
4. End the step with its "Before you write" or "Before you send" list from stage 1, where the step has one.

- Keep each sentence stage 1 placed where it stands relative to the output it guards. The edge rule stays in the edge bullet, and the hand-over rule first in the hand-over list.
- Keep the numbering other files cite: steps 1 to 7, the migration headings, and every heading a test or a script message names.
- Keep the first fenced block under `## Scripts` byte for byte; the prose after it may become a table. Make `## Reference files` a table.
- Move a reason that is not a rule, with its tags, to the reference that owns its topic, and leave a one-line pointer. Two such reasons are the IEC 60812 clause-order citation and the LLM-rating study in step 5. A moved sentence meets the cap in its new home, by a clause-boundary split where it is sourced.
- Where `SKILL.md` repeats a reference near-verbatim, keep a short imperative and a pointer in `SKILL.md`. The reference keeps the full text.
- In a reference, give a procedural section the sentence rules under Caps, not this shape.

## Caps

Count words as the checker does: tags removed, a code span one word, a link its label, parentheticals kept. Table cells are measured; headings, frontmatter, fenced blocks and sentences under three words are not.
- Keep an instruction sentence to 20 words, and a description sentence to 25. Keep a procedural paragraph to six sentences; make a longer one a list.
- Split a sentence over its cap at a clause boundary, outside the text no one changes. Write in the active voice, one rule per sentence.
- Keep every stated uncertainty, every caveat that is content and every "may" that grants permission. Such caveats include "stays provisional until", "no standard in the corpus binds" and a licence condition.
- Add no filler word: basically, essentially, simply, actually, in order to. A modal is never filler.
- The checker counts sentences over 25 words in every file; the critic also holds an instruction to 20, in `SKILL.md` and the references alike. The checker also counts untagged items and filler words, and cannot tell an instruction from a description.
- The critic checks the 20-word cap on instructions, the six-sentence cap on paragraphs and the tags. It lists every rule before and after the draft, and flags a rule lost, added, moved from its stage-1 position or changed.

## One word for one thing

- Prefer the schema's word: call a thing what `schemas/fmea.schema.json` calls it. Give no word a new sense. Never unify a word the skill uses in several senses, such as record, state, flag, control, review, check, end, change, open or status. The other sixteen are under "One-meaning conflicts" in the "Vocabulary" section of `build/prose/brief.md`.
- Substitute only in skill-authored sentences, and only as this table allows.

| Apply | Do not apply |
|---|---|
| `need` for `require`, outside the four `*-required` invariant ids, JSON Schema's `required`, the DORA definitions, NIST's "a required security property" and the licence-obligation sense | `check` for `verify`: it collides with `--check`, `update-check.ts`, "checker" and the noun "check" |
| `do` or `make` for `perform`, outside the MIL-STD-1629A title and Occurrence anchor row 8 | `end` or `stop` for `terminate`: it collides with `effects.end` and "a stopped `apply`" |
| `through` for `via` | `change` for `modify`: it collides with the `*-changed` reasons, `--change-table`, `IO_CHANGED` and `history[].change` |
| `more` for `additional` | `start` for `initiate`: it breaks "initiating event" |
| `obey` for `follow`, only where the sense is obey: `SKILL.md:212`, `methodology.md:5` and `quality-and-lint.md:183` | `try` for `attempt`: the skill's "attempt" is a noun |
| | `test` as a verb: the noun stays, and the ruling below names the verb uses to rewrite |
| | `near` for `close`: only for distance at `design-failure-catalog.md:66`, which the ruling below leaves |

The ruling of 2026-10-15 on `test` and `close`, whose five lines the acceptance note records:
- Rewrite two skill-authored verb uses without the verb: `design-failure-catalog.md:97` ("re-tested") and `methodology.md:146` ("are tested as properties").
- Use a form with the noun, such as "which tests run again when it changes". Never write "tested again" or "checked again". Count these two rewrites as allowed, not as a sixth substitution.
- Leave catalog `:82`, a sourced sentence (`[paraphrased:C127]`), and catalog `:112`, a row outside the rewritten sections. Leave catalog `:66` too: it is a sourced row (`[adapted-from:C014]`) outside the rewritten sections, and §7.4 forbids rewording it.

A sourced sentence keeps its word. The table leaves these alone: `SKILL.md:15` ("followed"), `quality-and-lint.md:117` ("initiated") and `:182` ("followed"), `cat-component-05` at `design-failure-catalog.md:84` ("follow"), and `scales-software.md:133` ("follow"). Spec §7.5 gives `SKILL.md:212` as `:156`, and `quality-and-lint.md:117`, `:182` and `:183` as `:114`, `:179` and `:180`.

## Tags

Spec §7.4 reads:
> - One tag per sentence, per bullet, and per table row in its Provenance column, as the private checker's rule reads; the register is the one exempt table. A bullet carries one tag at its end and may hold several sentences. A bullet that would mix sources is split into two bullets, so no bullet carries a mixed tag.
> - A split sentence keeps its tag on each part. A `paraphrased:`, `adapted-from:` or `cites:` sentence is split at a clause boundary only and never reworded on this branch, so the private distill check meets no new claim.
> - `SKILL.md` and every changed reference file go through the private repository's distill check stage, its Recheck covering both, after stage 1 and after stage 2, before the commit that lands each, with the verdict in the commit body. The restricted-wording audit runs from the private checkout before the user pushes.

- Split a `paraphrased:`, `adapted-from:` or `cites:` sentence at a clause boundary only, keep its tag on each part, and never reword it. Split a bullet that would mix sources into two bullets, each with its own tag.
- Tag a sentence that takes nothing from a source `[skill-authored]`. The tag vocabulary, its syntax and the permission table are in `provenance.md`.

## Text no one changes

A test, a licence, a script or the private audit depends on the exact form of this text. Change none of it.

| Text | Where | What pins it |
|---|---|---|
| Every `sourced:` reproduction: the DORA metric table and definitions, the Howie tables, and the NASA quotation "Don't let assumptions go unwritten." | `process-stub.md:27-55`, `:74-82`; `method-selection.md:28-36`; `design-inputs.md:72-73` | The licence, with the statement of changes or the government-work note beside each |
| The licence blocks of MIL-STD-1629A, dora.dev and Howie with their statements of changes, and the register cells on the audit allow-list | `provenance.md:139-159`, `:55-129` | The licences, and the private restricted-wording audit |
| Every anchor row of the three scales, `scales version: 2`, the headings `## Severity, 1 to 10` and `## Occurrence, 1 to 10`, and the line opening `The anchor rows that name a radius class are 2 to 10` | `scales-software.md:55-64`, `:80-89`, `:103-112`, `:3`, `:39`, `:66`, `:51` | `quality-and-lint.test.ts:53`, `:58`; a changed anchor row also bumps the scales version and marks every rated row stale |
| The generated region between `<!-- vocabulary:start -->` and `<!-- vocabulary:end -->` | `structure-elements.md:19-58` | `tools/gen-element-vocabulary.test.ts:33`; it changes only through `data/element-vocabulary-v1.json` |
| The first fenced block under `## Scripts`, each command opening with `node ${CLAUDE_SKILL_DIR}/scripts/` at column 0 | `SKILL.md:192-200` | `tools/skill-commands.test.ts:129` and `:169`, which read it line by line |
| The headings `### Migrate a v1 document` and `### Migrate a v2 document` | `SKILL.md:171`, `:183` | `tools/skill-commands.test.ts:188`, since the messages of `scripts/lib/legacy.ts` name both |
| The stale-reason precedence line, ``When more than one rule fires on a row, `reason` records the first that applies`` | `SKILL.md:146` | `update-check.test.ts:274`, which finds it by `the order of the stale reason set v2` and reads its ids in order |
| The lines opening `The validator ids a row may name are exactly`, `The machine lints the scripts implement are twenty-one:` and `The stale reason set v2 is` | `quality-and-lint.md:24`, `:25`, `:267` | `quality-and-lint.test.ts:22`, `:26`, `:32` |
| The rows matched by line prefix: `catastrophic-severity-anchor`, `chain-flow-effect-consistency`, `chain-flow-shared-provider` and `flow-referent-unsourced` | `quality-and-lint.md:99`, `:258-260` | `quality-and-lint.test.ts:38`, `:46`; `lints.test.ts:683` |
| The DF4 disclaimer row, the row headed "A flow's value-priority tier" | `methodology.md:111` | `quality-and-lint.test.ts:76` |
| Rule 7, the first column-0 line starting `7. `, with its `validate.ts` and `render.ts` spans | `work-tracking.md:26` | `tools/skill-commands.test.ts:149` |

The test pins above are among the 61 pinned literals of the scan, listed under "Pinned literals" in the untracked `build/prose/brief.md`. The other pins hold `evals/prompts.json` (`prompts.test.ts`, `tools/run-eval.test.ts`), `evals/rubric.md` and the two judge workflows, `tools/workflows/evals.js` and `tools/workflows/rejudge.js` (`tools/eval-report.test.ts`), which stage 2 leaves alone. Of §4.3's literals that change by design, the lint-count sentence and the two fixtures' `computed` blocks changed in stage 1. Stage 2 shortens the frontmatter `description` of `SKILL.md` to 1,024 characters or fewer.
Two files carry twin text on purpose, and no test compares the twins. You may shorten the `SKILL.md` copy by the twin rule above; never touch the words of the reference's copy, whose line form follows its section (ruled at the prose acceptance, 2026-10-16).

| `SKILL.md` | Its text | The reference's copy |
|---|---|---|
| `:35`, step 1 | "Decide the ground rules before the analysis begins", "Write every assumption into `meta.assumptions` as its own item" and "Ask for what is missing" | `design-inputs.md:4`, `:70-71`; `quality-and-lint.md:67` |
| `:41`, step 2 | "In a run over several services, make each service a root" | `structure-elements.md:160` |
| `:98-99`, Convert | "A type, owner or external column that maps to a role or a boundary is used first", and the `security_relevant` and `Owner` clauses | `structure-elements.md:100-102`, `:106` |
| `:165`, Update | "While `meta.codebases[]` is present and, for an entry that at least one element has as its effective codebase" | `structure-elements.md:130` |
| `:173-175`, Migrate v1 | "A document written against the v1 kinds is migrated", and the `external_dependency` and `security_component` sentences | `structure-elements.md:111`, `:117-118`, `:125` |
| `:185`, Migrate v2 | "A document written against schema v2, by 0.3.x to 0.5.x, is migrated" | `structure-elements.md:136-137` |

## Changing a sourced sentence

A sourced sentence carries `sourced:`, `paraphrased:`, `adapted-from:` or `cites:`. It rests on a record whose evidence lives only in the private repository.
- Never change a `sourced:` reproduction; it is frozen text. Split any other sourced sentence at a clause boundary only, with its tag on each part.
- Never reword a sourced sentence on this branch: §7.4 forbids it, and an exception needs the user's ruling. Bring nothing from the evidence into `skills/` beyond what the tags allow.
- Commit a reword only when all four of these hold:
  1. The private evidence: the records file in `nzneit/failwise-research` supports the new words.
  2. The tag's permission: the source's status in the register of `provenance.md` permits the tag.
  3. The Recheck: the private distill check stage passes on the file, and its verdict goes in the commit body.
  4. The audit: the restricted-wording audit, `tools/public-audit.ts` in the private checkout, passes before the user pushes.

## The checker

Run `node tools/check-prose.ts` from the repository root. It is the same command in bash and fish, and `bun tools/check-prose.ts` also works. `tools/check.ts` runs it as its fourth step, after `tsc`, `oxlint` and `fallow`.
- It reads `SKILL.md` and every `references/*.md`; `evals/rubric.md` and this page are outside it. It counts untagged items, sentences over 25 words and filler words, per heading and per file.
- An item is a sentence outside a table, a bullet, or a table row. A row is untagged when its last cell holds no tag. The register in `provenance.md` and the generated region in `structure-elements.md` are exempt.
- It compares each count with `dev/prose-baseline.json`, first written on the stage-1 text. A count may fall and may never rise. Lower the baseline in the commit that lowers a count, with `node tools/check-prose.ts --write-baseline`. That write refuses a rise. The test suite refuses a baseline entry above its measured count, so a fall cannot go unrecorded.
- It prints every count on every run, and it fails closed: input it cannot read or judge is never a pass. It exits 0 when the counts hold, and 1 on a rise, a bad argument or a scope mismatch. A scope mismatch is a file in scope that the baseline lacks, or a baseline entry outside the scope.
- It exits 3 on a missing or unreadable baseline, or one that is not a JSON object. It also exits 3 on an unreadable file, a file that measures nothing, a references folder it cannot list, or a failed baseline write.
