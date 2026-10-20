# How the skill's prose is written
This page is the style rule for `skills/fmea-software/SKILL.md` and the files in `skills/fmea-software/references/`.

## Two kinds of text
An instruction tells the model what to do; a description tells a person what is so. Tell them apart by the verb and the reader.

- An instruction's verb is a command ("Write", "Never write"); its reader is the model.
- A description's verb states a fact ("is", "counts"); its reader is a person.
- A sentence the model must act on ("Those words are a value, not a gap") is an instruction whatever its verb; one that only states a fact, reason or definition is a description.

## The shape of a procedure
Give each step of the spine in `SKILL.md`, and each other mode, this shape.

1. Open with one lead sentence that states what the step produces.
2. List the rules in acting order, one per bullet, each starting with its command verb.
3. Put each rule before its reason, and each warning before the step it guards.
4. End the step with its "Before you write" or "Before you send" list, where it has one.

- Keep each sentence where it stands relative to the output it guards, and keep the numbering other files cite: steps 1 to 7, migration headings, and every heading a test or script names.
- Keep the first fenced block under `## Scripts` byte for byte; the prose after it and `## Reference files` may be tables. Move a reason that is not a rule, with its tags, to the reference that owns it; a repeated reference keeps its full text there.

## Caps
Count words as the checker does: tags removed, a code span one word, a link its label, parentheticals kept. It measures each cell of a row except the last, and not headings, frontmatter, fenced blocks or sentences under three words.

- Keep an instruction sentence to 20 words and a description sentence to 25, and a procedural paragraph to six sentences. Split an overlong sentence at a clause boundary outside the pinned text, and write in the active voice, one rule per sentence.
- Keep every stated uncertainty, content caveat and permission-granting "may", including "stays provisional until" and licence conditions. Add no filler: basically, simply, actually, in order to.
- The checker counts sentences over 25 words; the critic holds an instruction to 20, checks the six-sentence cap and the tags, and flags a rule lost, added, moved or changed.
- Pinned text depends on its exact form, and a test names each piece: sourced reproductions with licence blocks, the scales' anchors and version, the generated vocabulary region, the `## Scripts` block and `update-check.ts` row, the migration headings, the stale-reason precedence, the validator and lint-count lines, the prefix-matched rows, and rule 7 of `work-tracking.md`.

## One word for one thing
Call a thing what `schemas/fmea.schema.json` calls it. Give no word a new sense, and never unify a word the skill uses in several senses, such as record, state, flag, review, check, end or status. Substitute only in skill-authored sentences.

| Apply | Do not apply |
|---|---|
| `need` for `require`, outside the `*-required` ids, JSON Schema's `required`, DORA and the NIST security-property sense | `check` for `verify`: collides with `--check`, `update-check.ts`, "checker" and the noun "check" |
| `do` or `make` for `perform`, outside the MIL-STD-1629A title and Occurrence row 8 | `end` or `stop` for `terminate`: collides with `effects.end` and "a stopped `apply`" |
| `through` for `via` | `change` for `modify`: collides with `*-changed`, `--change-table`, `IO_CHANGED` and `history[].change` |
| `more` for `additional` | `start` for `initiate`: breaks "initiating event" |
| `obey` for `follow`, where the sense is obey | `try` for `attempt`, and `test` as a verb: "attempt" there is a noun |
|  | `near` for `close`, except for distance in one catalog row |
## Tags
- One tag per sentence, per bullet, and per table row in its `Provenance` column; the source register is the one exempt table. A bullet carries one tag at its end and may hold several sentences; one that would mix sources is split in two.
- A split sentence keeps its tag on each part; a `paraphrased:`, `adapted-from:` or `cites:` sentence is split at a clause boundary only and never reworded.
- Tag an unsourced sentence `[skill-authored]`; an untagged sentence is a defect. The vocabulary, syntax and permission table are in [`provenance.md`](../skills/fmea-software/references/provenance.md).

## Changing a sourced sentence
A sourced sentence carries `sourced:`, `paraphrased:`, `adapted-from:` or `cites:`, and rests on a record whose evidence is private.

- Never change a `sourced:` reproduction; it is frozen text. Split any other sourced sentence at a clause boundary only, with its tag on each part.
- Never reword a sourced sentence without the maintainer's ruling; commit a reword only when private records support the words, the register permits the tag, the private Recheck passes, and the audit passes before the user pushes.

## The checker
Run `node tools/check-prose.ts` from the repository root; `bun tools/check-prose.ts` also works, and `tools/check.ts` runs it as its fourth step.

- It reads `SKILL.md` and every `references/*.md` and counts untagged items, sentences over 25 words and filler words, per heading and file; an item is a sentence outside a table, bullet or row, and a row is untagged when its last cell holds no tag; the register and generated region are exempt.
- Keep each paragraph and bullet on one line: it measures each line alone, a bullet is one item at any length, and a tag anywhere in it tags it.
- It compares each file's three totals with `dev/prose-baseline.json`: a count may fall, never rise. Lower it with `node tools/check-prose.ts --write-baseline`; that write refuses a rise, and the suite refuses a baseline above the measured count. It fails closed: exit 0 when the counts hold, 1 on a rise, bad argument or scope mismatch, and 3 on an unreadable baseline, file or folder, or a failed write.
