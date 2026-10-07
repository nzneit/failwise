# Working in this repo

This repo is the failwise Claude Code plugin, holding one skill, `skills/fmea-software/`. The design is
`docs/specs/2026-09-07-fmea-software-design.md`; read it before changing anything.

## Before every commit

```
node tools/run-tests.ts
node tools/check.ts
```

The first runs both suites under `node --test`, every `*.test.ts` file under
`skills/fmea-software/scripts/` and under `tools/`, subfolders included and `node_modules` left out,
with the file lists built by the script; it exits 1 when a suite has no test file, or when a folder
of a suite cannot be listed, and that suite then runs nothing. The second runs the static checks:
the type check (`tsc`), the linter (`oxlint`) and the dead-code, duplication and complexity analysis
(`fallow`); it exits 1 on any finding, and on a missing tool. Both are the same command in bash and
fish. Node 24.2 or later must be on PATH (`source ~/.nvm/nvm.sh` in bash, `nvm use 24` in fish);
`bun tools/run-tests.ts` and `bun tools/check.ts` also work and find Node 24.2 or later through nvm.

The checkers are development tools declared in `dev/package.json`. Install them once with
`npm ci --prefix dev --ignore-scripts`, and again when `dev/package-lock.json` changes. Never add a
lockfile or a dependency to the root `package.json`: Claude Code installs whatever a plugin's root
declares on every user's machine.

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

## Non-negotiables

- **Never add AI attribution to a commit.** No `Co-Authored-By` trailer naming an AI, no
  "Generated with" line, no session trailer. This applies to your commits and to any brief
  you give a subagent.
- **Commits stay local.** Claude never pushes; the user working in this checkout does.
- **Every drafted pull request body opens with the diff link.** Its first line is
  `Read the diff: https://revision.city/diffs/nzneit/failwise/compare/<base>...<branch>`, with the
  target branch and the branch name filled in, as the "Opening a pull request" section of
  `CONTRIBUTING.md` describes.
- **Provenance is mandatory.** Every sourced statement in `skills/fmea-software/references/`
  cites a record id; every other statement is tagged `skill-authored`. The tag vocabulary is
  `references/provenance.md`, whose register traces each record id to its source. The evidence,
  meaning the records file and the research report, lives in the private repository
  nzneit/failwise-research and not here. Nothing from it enters `skills/` except what the
  provenance tags allow, and the maintainer's pre-push hook runs the restricted-wording audit
  (`tools/public-audit.ts` in failwise-research) before anything leaves the maintainer's machine.
- **Never ship licensed table content.** No AIAG-VDA cell values, no adapted Google SRE Book
  text. The priority table the plugin ships is the skill's own.
- **Nothing specific to a consuming application** enters the plugin.
