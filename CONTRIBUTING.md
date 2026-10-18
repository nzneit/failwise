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

## Writing the skill's prose

`SKILL.md` and the reference files are written to `docs/style.md`. That page covers two kinds of
text, the shape of a procedure, the caps, one word for one thing, and the tag rules. It also covers
the text no one changes, what a change to a sourced sentence needs, and the prose checker that
`tools/check.ts` runs.

## Opening a pull request

Open the body of a pull request with a line that links its diff in Revision City, a third-party
viewer of GitHub diffs, above everything else:

```
Read the diff: https://revision.city/diffs/nzneit/failwise/compare/<base>...<branch>
```

`<base>` is the branch the pull request targets and `<branch>` the branch it merges from. The link
works as soon as the branch is pushed and needs no sign-in, since this repository is public. It
stops working when the branch is deleted after the merge, and the pull request's own page on
GitHub remains the record. The viewer's Symbols tab lists the functions, classes and headings a
change added, changed, renamed, moved or deleted, for the TypeScript, Markdown, JSON, YAML and CSS
files of this repository; it does not parse the HTML report template.

## Before every commit

```
node tools/run-tests.ts
node tools/check.ts
```

The first runs both test suites under `node --test`: every `*.test.ts` file under
`skills/fmea-software/scripts/` and under `tools/`, subfolders included and `node_modules` left out.
It fails when a suite has no test file, or when a folder of a suite cannot be listed; that suite
then runs nothing. The second runs the static checks: the type check (`tsc`), the linter (`oxlint`),
the dead-code, duplication and complexity analysis (`fallow`) and the prose ratchet
(`tools/check-prose.ts`), which compares the counts of `SKILL.md` and the references with
`dev/prose-baseline.json` and fails when one rises. The CI workflow also runs them on every pull
request. Both need Node.js 24.2 or later on PATH (`bun tools/run-tests.ts` and
`bun tools/check.ts` also work and find Node through nvm). The commands are the same in bash and
fish. If you call `node --test` directly, use the recursive glob form, such as
`node --test "tools/**/*.test.ts"`; `node --test <directory>` is not the same on Node 24.
A commit that improves the prose lowers the baseline in the same commit with
`node tools/check-prose.ts --write-baseline`, run from the repository root; the test suite refuses a
baseline above the measured counts and the writer refuses a count that would rise, so the baseline
moves only down.

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
not intend is a finding. When the two reports are byte for byte the same, the comparison
photographs nothing, writes no viewer, and says so. `--base <commit>` compares against another
commit.

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
view changed or the comparison itself failed. In CI the gate uses every core of the runner; the
screenshots, the comparison and every local run keep Playwright's default, half the logical cores.

`EXPECTED_FAILURES` and `NOT_ASSERTED` in `dev/browser/matrix.ts` are empty. A gap found later is
recorded there with its reason. The run fails when an expected failure starts to pass, so a change
that closes a gap removes its entry. A check not asserted, one whose result depends on the reader's
fonts, cannot fail the run and is named in a `## not asserted` line on every passing run.

## Scripts and tools

- The TypeScript scripts and tools run directly under Node 24.2 or later and take no
  runtime dependencies, except that `track.ts` starts `gh` for GitHub and `acli` for Jira; the
  version of `acli` tested is 1.3.39-stable. Keep it that way.
- No script needs a file outside `skills/fmea-software/` other than the files named on its command
  line, so the skill folder also runs copied on its own, outside a `node_modules` folder and below
  no `package.json` that sets another module type; `tools/skill-copy.test.ts` runs the four scripts
  from such a copy and fails when one of them reaches a file outside it by a path built from its own
  location or from the working folder. For that reason the plugin's version is written twice, in
  `.claude-plugin/plugin.json` and in `skills/fmea-software/scripts/lib/version.ts`: a release
  changes both, and `validate.test.ts` fails when they differ.
- Keep the one-line coded error contract: each failure is one line on stderr,
  `error <CODE>: <message>`, and exits 1 for usage, 2 for validation, 3 for I/O and for `INTERNAL`
  (design spec §9). The skill's codes come from the one list in
  `skills/fmea-software/scripts/lib/codes.ts`.
  A run that exits 0 may also print, after its output, one line `warning <rule>: <message>` on
  stderr per finding that does not fail it, under the rule id of the lint `validate.ts` records for
  the same finding: `priority.ts` does so for each priority property a loaded table breaks.
  Findings a script reports in its JSON output stay there.
- Every command must behave the same in bash and fish. Where a shell snippet would differ between
  them, write the step as a TypeScript script that does the shell's work itself, as
  `tools/run-tests.ts` builds its own lists of test files.

## Evals

```
tools/run-eval.sh <1|5|6|7> <high|medium> <run-n>      # one unattended eval run into build/evals/
node tools/run-round.ts <stage>                        # a prose round's sixteen runs, in parallel, into build/evals/prose-<stage>/
node tools/eval-report.ts                              # build/evals/results.json → docs/specs/2026-09-07-eval-results.md
```

An eval run is made at a model capability (`high`, `medium`), not a model name: the environment
variable `FMEA_EVAL_MODELS`, as `high=<model>,medium=<model>`, names the model that fills each
capability for any provider, and defaults to the Anthropic table when unset. A full eval is
sixteen runs, the four prompts at both capabilities twice each. After the sixteen runs, judge
them with Claude Code's Workflow tool,
`{scriptPath: "tools/workflows/evals.js", args: {root: "<repository root>"}}`, which returns the
results object and writes no file. Write it to `build/evals/results.json` for `eval-report.ts` to
read, as `JSON.stringify(result, null, 2)` of the `result` key of the Workflow task's output.

From the prose round 1c on, `node tools/run-round.ts <stage>` (or `bun tools/run-round.ts
<stage>`) runs the sixteen runs of a round on DeepSeek V4.1-Flash. The runs go into
`build/evals/prose-<stage>/`, or into the folder `--publish-root <dir>` names. The launcher runs
only that model, through DeepSeek's Anthropic-compatible gateway. It reads the gateway key with
`secret-tool` (libsecret, on Linux) from the login keyring entry of service `goose`. That entry's
secret is JSON with the field `DEEPSEEK_API_KEY`. To store the key, run
`secret-tool store --label=deepseek service goose`. At its prompt, paste
`{"DEEPSEEK_API_KEY": "<key>"}`. `FMEA_SECRET_TOOL` names another command to run in place of
`secret-tool`. For another model, or on a machine without `secret-tool`, use `tools/run-eval.sh`
with `FMEA_EVAL_MODELS`. The launcher smoke-tests the gateway first. It runs the first cell alone
as a canary, then the other fifteen at most
`--parallel <n>` at once (4 by default, more than 8 only with `--force-parallel`). Each cell's
output is appended to its log in `logs/` in that folder, so a re-run keeps the earlier attempt's
log. The cells and the smoke call do not inherit the launching session's `CLAUDE*` variables: the
launcher drops every variable whose name starts with `CLAUDE` from their environment and lists the
dropped names in `round.json` as `env_stripped`. The launcher prints the summary lines in roster
order, writes `round.json`, and names the `--cells` command, with `--no-canary`, for any cell that
needs a re-run. Judge a round with the same Workflow script and
`args: {root: "<repository root>", evalsDir: "build/evals/prose-<stage>"}`. Write the result to
`build/evals/prose-<stage>/results.json` in the same form. `eval-report.ts` prints a `Round method`
line under the Harness table from the `round.json` beside the `--results` file only, so generate
the round's note with `--results build/evals/prose-<stage>/results.json`.

Sixteen unattended runs and their judging spend real model time and money. Each run gets a fresh
`CLAUDE_CONFIG_DIR` under `$TMPDIR`, which the run removes when it ends, so the runner's
`~/.claude` (its CLAUDE.md, memory, skills, settings and login) stays out of the run. A run on the
default Anthropic table therefore needs `ANTHROPIC_API_KEY` in the environment; a model behind a
gateway needs `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`. A run still grants Read with no path
restriction, so run it from a machine and with keys you are content to expose.

A run killed by SIGKILL runs no cleanup. When `tools/run-round.ts` stops a round, it sends SIGKILL
to a cell that still runs 30 seconds after its SIGTERM. The killed run's `fmea-eval-*`,
`fmea-plugin-*` and `fmea-config-*` folders stay under `$TMPDIR`. Remove them by hand.

`tools/run-eval.sh` sets the context window per model from a table in the script. A model with a
row gets its `CLAUDE_CODE_AUTO_COMPACT_WINDOW` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS`, and a model
with no row gets neither, whatever the launching shell exports. A gateway model the CLI does not
know needs a row: without one the CLI takes a 200k window for it, its runs compact near 167k
tokens, and the judging marks them unverified.

Before every run the script asks the CLI for its window with `claude -p "/autocompact"`, in the
run's working directory and with the run's config directory and window settings. It refuses to
launch the run when the reply has no auto-compact window line, when that line says the window is
capped, or, for a model with a row, when the line does not name the row's window.

The script sets `DISABLE_AUTOUPDATER=1` for the probe and the run, because the CLI updated itself
in the middle of a round on 2026-10-14 and a round must run on one CLI version. Another session on
the machine can still update the shared install, so each run records its CLI version.

After the run, `tools/eval-context.ts` writes `context.json` into the run's folder. The file records
the CLI version, the run's `CLAUDE_CONFIG_DIR`, the two window settings, the window line, the
compactions and the peak context. It records the number of top-level assistant lines and the number
of those lines without usage figures. It also records the isolation facts, the denied script calls,
the lint counts and whether the final message is complete. Both judging workflows read it before
any judge. A run is unverified and gets no judge when:

- the run has no `context.json`;
- its `context.json` is not JSON;
- its `context.json` lacks a field the workflows read, or holds one of the wrong type:
  `compactions`, `peak_context_tokens`, `assistant_lines`, `assistant_lines_without_usage`,
  `window_line` or `final_message`;
- the run has a compaction;
- the run has no top-level assistant line;
- a top-level assistant line lacks its usage figures;
- the final message is not recorded complete: it is cut off, or `tools/eval-context.ts` could not
  check it (§8.1 of `docs/specs/2026-10-14-prose-design.md`);
- the context agent returned nothing on three attempts.

The context agent runs at the `medium` model capability, so `args.models`, when given, must name
`medium` in both `tools/workflows/evals.js` and `tools/workflows/rejudge.js`. The report's Harness
table shows each run's CLI version, and a line under the table names the versions when a round ran
on more than one. From round 1c, `context.json` also records `message_counts`. The field holds the
document's counts by priority before and after action. Of the counts that the final message states,
the field holds only the pairs of a count and a priority value that two patterns read. One pattern
reads a count before the value, as in `8 H`, `2 rows at H` or `4 rated priority M`. The other reads
the value, a colon or an equals sign, and then the count, as in `H: 8`. The patterns do not read
other forms, such as the table form `H — **8**` or a count in words. The Harness table's Counts
column shows whether those pairs match. When the patterns read no pair, the column shows
`none stated`, even when the message states counts in another form. `match` and `mismatch` cover
only the pairs that the patterns read. A wrong count is reported and never makes a run unverified.
