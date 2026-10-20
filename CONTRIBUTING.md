# Contributing to failwise

failwise is one Claude Code skill, `skills/fmea-software/`, with the scripts and tests around it. Read [`docs/design.md`](docs/design.md) before a change of substance.

## Setup

Node.js 24.2 or later must be on PATH; the scripts are TypeScript run directly by Node. Install the development checkers once with `npm ci --prefix dev --ignore-scripts`, and again when `dev/package-lock.json` changes. The root `package.json` stays bare: Claude Code installs whatever a plugin's root declares on every user's machine, so no dependency and no lockfile goes there.

## Tests

```
node tools/run-tests.ts
```

This runs both suites under `node --test`: every `*.test.ts` under `skills/fmea-software/scripts/` and under `tools/`, with the globs expanded by the script. It fails when a suite has no test file or cannot be listed. `bun tools/run-tests.ts` also works and finds Node through nvm. Do not call `node --test <directory>` directly; that form is not the same on Node 24. Use the recursive glob, `node --test "tools/**/*.test.ts"`.

## Static checks

```
node tools/check.ts
```

It runs five checks in order: the TypeScript type check (`tsc`), the linter (`oxlint`) with type-aware rules and warnings denied, the dead-code, duplication and complexity analysis (`fallow`), the prose ratchet (`tools/check-prose.ts`), and the documentation check (`tools/check-docs.ts`). It exits 1 on any finding or a missing tool.

The prose ratchet compares `SKILL.md` and the reference files with `dev/prose-baseline.json`; it fails when a count rises, when a reference file is added, renamed or removed, or when it cannot read its input. Lower the baseline in the same commit with `node tools/check-prose.ts --write-baseline`.

The documentation check enforces the seven-file documentation surface and the caps in `dev/docs-baseline.json`. Caps may only be lowered: `--write-baseline` refuses a raise, refuses to add or remove a path, and leaves the file unchanged on a refusal. Only the maintainer may raise a cap, in a separate reviewed commit.

## Browser checks

Run `node tools/check-browser.ts` and `node tools/compare.ts` before a commit that changes the report template or the renderer. The first checks the report in real browsers at five widths — 320, 375, 768, 1280 and 1920 px — and under print emulation, failing on sideways scroll, an element past the edge, or an accessibility violation. The second photographs each part of the report and compares it with the report of the commit where the branch left `main`; a changed view is not a failure, but read every one. `node tools/shots.ts` writes a screenshot of every part for a look at the report, and `node tools/check-browser.ts --fetch` installs the browsers once and again when Playwright's version changes.

## Cite sources, do not paste them

Every statement in `skills/fmea-software/references/` carries a provenance tag. The vocabulary, the per-source permission rule and the register that traces each record id (`Cnnn`) to its source are in [`provenance.md`](skills/fmea-software/references/provenance.md).

- A change that rests on a standard, book or paper cites it and restates it in your own words. Do not paste its wording.
- A statement with no source is tagged `skill-authored`.
- A source not in the register is named in the pull request; do not invent a record id.
- No AIAG-VDA cell values and no adapted Google SRE Book text, anywhere.

The maintainer audits every change to the references for restricted wording before merging. A pull request merged on GitHub does not pass the local pre-push hook, so the maintainer fetches it and runs the audit first. The evidence and the process records live in the private repository `nzneit/failwise-research`, because the records quote paywalled and no-derivatives material verbatim; finding ids of the form `F-WSn-NN` do not resolve here, while a record id does, through the register.

## Writing the skill's prose

`SKILL.md` and the reference files are written to [`docs/style.md`](docs/style.md), which covers the two kinds of text, the shape of a procedure, the caps, one word for one thing, the tag rules, what a change to a sourced sentence needs, and the checker. Write each rule once, where it applies, and keep every paragraph and bullet on one line.

## Opening a pull request

Open the body with the diff link on its own first line, above everything else:

```
Read the diff: https://revision.city/diffs/nzneit/failwise/compare/<base>...<branch>
```

The body is at most 350 words. It carries `## Purpose` and `## Verification`; `## Changes` and `## Known limits` are recommended. No per-commit itemisation, no test-by-test evidence, no hashes, no ledger citations: the evidence lives in the linked private record. A commit body is at most 200 words and its subject at most 100 characters, and the landing commit is included. A squash landing whose subject carries the ` (#N)` suffix is exempt from the 200-word body limit, because the 350-word pull request limit governs it; its subject is measured without the suffix and stays within 100 characters. Never add AI attribution: no `Co-Authored-By` trailer naming an AI, no "Generated with" line, no session trailer.

Use the template at [`.github/pull_request_template.md`](.github/pull_request_template.md). CI checks the body on open, synchronise, reopen and edit, and checks each pushed commit range on `main`.

## What does not go in this repository

- **Process records.** Plans, acceptance notes, eval results, dated designs, SDD ledgers and task briefs are created in `nzneit/failwise-research`, under `docs/` or `docs/archive/`, never here.
- **Licensed table content.** No AIAG-VDA cell values, and no adapted Google SRE Book text.
- **Anything specific to a consuming application.** No service name, team name, incident id or architecture detail from a real system.
- **A root lockfile or dependency.** The plugin's root manifest stays bare.

## License

The plugin is licensed under Apache-2.0 (`LICENSE`). Under section 5 of that license, a contribution you submit for inclusion is licensed under the same terms unless you explicitly state otherwise, so there is no contributor agreement to sign.
