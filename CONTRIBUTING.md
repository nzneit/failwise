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

The first runs both test suites under `node --test`: every `*.test.ts` file under
`skills/fmea-software/scripts/` and under `tools/`, subfolders included and `node_modules` left out.
It fails when a suite has no test file, or when a folder of a suite cannot be listed; that suite
then runs nothing. The second runs the static checks: the type check (`tsc`), the linter (`oxlint`)
and the dead-code, duplication and complexity analysis (`fallow`), which the CI workflow also runs
on every pull request. Both need Node.js 24.2 or later on PATH (`bun tools/run-tests.ts` and
`bun tools/check.ts` also work and find Node through nvm). The commands are the same in bash and
fish. If you call `node --test` directly, use the recursive glob form, such as
`node --test "tools/**/*.test.ts"`; `node --test <directory>` is not the same on Node 24.

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
node tools/compare.ts
```

The first renders the checkout fixture and opens it in Chromium at five widths (320, 375, 768, 1280
and 1920 px), at every width from 320 to 1280 px in 4 px steps, and under print emulation. It fails
on a page that scrolls sideways, on an element past the right edge, on a table outside its frame or
a frame that clips, on a WCAG A or AA violation that axe-core finds, and on a print rule that does
not take effect. A table wider than the page scrolls inside its own frame, which the gate checks in
place of the table's own edge.

The second compares the report of your working tree with the report of the commit where your
branch left `main`, part by part, at every width and in print. Each part is photographed on its own,
with the rest of the page hidden, so a change shows only in the parts it touches. For each view that
changed it writes a before, an after and a difference image to `build/compare/changed/`, with a
summary in `build/compare/summary.md` and a viewer in `build/compare/html/`. A changed view is not a
failure: read the summary and look at every changed view before calling the change done. The command
exits 1 only when a view could not be judged or the comparison could not be done. A change you did
not intend is a finding. `--base <commit>` compares against another commit.

`node tools/shots.ts` writes a screenshot of every part of the report, at every width, to
`build/shots/`, with the print PDF, for a look at the report as it is. A part image is cut at its
element's box, and a framed table shows cut at its frame.

Fetch the browser once with `node tools/check-browser.ts --fetch`, and again when
`dev/package-lock.json` changes Playwright's version. The three commands take
`--engines chromium,firefox,webkit`; the gate and the screenshot command also take
`--report <file.html>` for a report that already exists. All are the same in bash and fish, and a
local run names the engines it did not run. CI runs the gate and the screenshots on all three
engines and uploads them, as the `browser-checks` artifact, only when one of them fails. On a pull
request it also runs the comparison on Chromium against the pull request's base, shows its summary
on the run's page, and uploads the summary and the viewer as the `report-changes` artifact when a
view changed or the comparison itself failed.

`EXPECTED_FAILURES` and `NOT_ASSERTED` in `dev/browser/matrix.ts` are empty. A gap found later is
recorded there with its reason. The run fails when an expected failure starts to pass, so a change
that closes a gap removes its entry. A check not asserted, one whose result depends on the reader's
fonts, cannot fail the run and is named in a `## not asserted` line on every passing run.

## Scripts and tools

- The TypeScript scripts and tools run directly under Node 24.2 or later and take no
  runtime dependencies, except that `track.ts` starts `gh`, the GitHub CLI; keep it that way.
- No script needs a file outside `skills/fmea-software/` other than the files named on its command
  line, so the skill folder also runs copied on its own, outside a `node_modules` folder and below
  no `package.json` that sets another module type; `tools/skill-copy.test.ts` runs the four scripts
  from such a copy and fails otherwise. For that reason the plugin's version is written twice, in
  `.claude-plugin/plugin.json` and in `skills/fmea-software/scripts/lib/version.ts`: a release
  changes both, and `validate.test.ts` fails when they differ.
- Keep the one-line coded error contract: each failure is one line on stderr,
  `error <CODE>: <message>`, and exits 1 for usage, 2 for validation, 3 for I/O (design spec §9).
  The skill's codes come from the one list in `skills/fmea-software/scripts/lib/codes.ts`.
- Every command must behave the same in bash and fish. Where a shell snippet would differ between
  them, write the step as a TypeScript script that does the shell's work itself, as
  `tools/run-tests.ts` builds its own lists of test files.

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
