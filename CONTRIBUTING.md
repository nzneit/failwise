# Contributing to failwise

failwise is one Claude Code skill, `skills/fmea-software/`, with the scripts and tests around it.
Read the design, `docs/specs/2026-09-07-fmea-software-design.md`, before a change of substance.

## License

The plugin is licensed under Apache-2.0 (`LICENSE`). Under section 5 of that license, a
contribution you submit for inclusion is licensed under the same terms unless you explicitly
state otherwise, so there is no contributor agreement to sign.

## Cite sources, do not paste them

Every statement in `skills/fmea-software/references/` carries a provenance tag. The tag
vocabulary, and which tags each source's license permits, is in
`skills/fmea-software/references/provenance.md`; its register traces each record id (`Cnnn`) to
its source.

- When a change rests on a standard, a book or a paper, cite it and write the statement in your
  own words. Do not paste its wording.
- A new statement with no source is tagged `skill-authored`.
- If your change needs a source that is not in the register, say so in the pull request rather
  than inventing a record id.
- No AIAG-VDA table values and no Google SRE Book text, adapted or not. Nothing specific to one
  consuming application.

The maintainer audits every change to `skills/fmea-software/references/` for restricted wording
before merging it. A pull request merged on GitHub does not pass through the maintainer's local
push hook, so the maintainer fetches the change and runs the audit on it first.

The research the skill rests on (the research reports with their findings, and the records
file), the design-panel records, the implementation plan and the publication design live in the
private repository `nzneit/failwise-research`, because the records file quotes paywalled
standards and no-derivatives material verbatim. Two kinds of reference in this repository point
into it and do not resolve here: finding ids of the form `F-WSn-NN`, in the design spec and in
the schema, and "plan reference §X" in code comments. A record id `Cnnn` does resolve, through
the register.

## Before every commit

```
node tools/run-tests.ts
node tools/check.ts
```

The first runs both test suites under `node --test`. The second runs the static checks: the
type check (`tsc`), the linter (`oxlint`) and the dead-code, duplication and complexity analysis
(`fallow`), which the CI workflow also runs on every pull request. Both need Node.js 24.2 or later
on PATH (`bun tools/run-tests.ts` and `bun tools/check.ts` also work and find Node through nvm).
The commands are the same in bash and fish. If you call `node --test` directly, use the glob
form; `node --test <directory>` is not the same on Node 24.

The checkers are development tools declared in `dev/package.json`. Install them once with
`npm ci --prefix dev --ignore-scripts`, and again when `dev/package-lock.json` changes. Do not add
a lockfile or a dependency to the root `package.json`: Claude Code installs whatever a plugin's
root declares on every user's machine.

Commit messages carry no AI attribution lines: no `Co-Authored-By` trailer naming an AI, no
"Generated with" line, no session trailer.

## Browser checks

Run these before a commit that changes `skills/fmea-software/assets/report-template.html` or the
renderer (`skills/fmea-software/scripts/render.ts` and the modules it imports):

```
node tools/check-browser.ts
node tools/shots.ts
```

The first renders the checkout fixture and opens it in Chromium at four widths (375, 768, 1280 and
1920 px) and under print emulation. It fails on a page that scrolls sideways, on an element past
the right edge, on a WCAG A or AA violation that axe-core finds, and on a print rule that does not
take effect. The second writes a screenshot of every part of the report, at every width, to
`build/shots/`, with the print PDF. Look at the parts your change touches, at every width, before
calling the change done: the gate cannot judge page breaks or whether the report reads well. A part
image is cut at its element's box, so content that spills sideways shows only in `page.png`.

Fetch the browser once with `node tools/check-browser.ts --fetch`, and again when
`dev/package-lock.json` changes Playwright's version. Both commands take
`--engines chromium,firefox,webkit` and `--report <file.html>` for a report that already exists, and
both are the same in bash and fish. A local run names the engines it did not run. CI runs all three
on every pull request and uploads the screenshots as the `browser-checks` artifact.

A check listed in `EXPECTED_FAILURES` of `dev/browser/matrix.ts` is a known gap with its reason. The
run fails when such a check starts to pass, so a change that closes a gap removes its entry.

## Scripts and tools

- The TypeScript scripts and tools run directly under Node 24.2 or later and take no
  runtime dependencies; keep it that way.
- Keep the one-line coded error contract: each failure is one line on stderr,
  `error <CODE>: <message>`, and exits 1 for usage, 2 for validation, 3 for I/O (design spec §9).
  The skill's codes come from the one list in `skills/fmea-software/scripts/lib/codes.ts`.
- Every command must behave the same in bash and fish. Where a shell snippet would differ
  between them, write the step as a TypeScript script that does the shell's work itself, as
  `tools/run-tests.ts` expands its own globs.

## Evals

```
tools/run-eval.sh <1|5|6|7> <high|medium> <run-n>      # one unattended eval run into build/evals/
node tools/eval-report.ts                              # build/evals/results.json → docs/specs/2026-09-07-eval-results.md
```

An eval run is made at a model capability (`high`, `medium`), not a model name: the environment
variable `FMEA_EVAL_MODELS`, as `high=<model>,medium=<model>`, names the model that fills each
capability for any provider, and defaults to the Anthropic table when unset. A full eval is
sixteen runs, the four prompts at both capabilities twice each. After the sixteen runs, judge
them with Claude Code's Workflow tool,
`{scriptPath: "tools/workflows/evals.js", args: {root: "<repository root>"}}`, which writes
`build/evals/results.json` for `eval-report.ts` to read.

Sixteen unattended runs and their judging spend real model time and money. An eval run loads the
runner's global Claude Code configuration (bare mode is not used) and grants Read with no path
restriction, so run it from a machine and login you are content to expose.
