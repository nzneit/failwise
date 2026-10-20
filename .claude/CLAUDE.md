# Working in this repo

This repo is the failwise Claude Code plugin, holding one skill, `skills/fmea-software/`. The design is [`docs/design.md`](docs/design.md); read it before changing anything.

## Before every commit

```
node tools/run-tests.ts
node tools/check.ts
```

The first runs both suites under `node --test`, every `*.test.ts` under `skills/fmea-software/scripts/` and under `tools/`, with the file lists built by the script; it exits 1 when a suite has no test file or a folder cannot be listed. The second runs five static checks in order: the type check (`tsc`), the linter (`oxlint`) with warnings denied, the dead-code, duplication and complexity analysis (`fallow`), the prose ratchet (`tools/check-prose.ts`) against `dev/prose-baseline.json`, and the documentation check (`tools/check-docs.ts`) against the caps in `dev/docs-baseline.json`; it exits 1 on any finding or a missing tool. Lower a prose baseline in the same commit with `node tools/check-prose.ts --write-baseline`. Documentation caps may only be lowered; `--write-baseline` refuses a raise and leaves the file unchanged, and only the maintainer raises one, in a separate reviewed commit.

Both commands are the same in bash and fish. Node 24.2 or later must be on PATH (`source ~/.nvm/nvm.sh` in bash, `nvm use 24` in fish); `bun tools/run-tests.ts` and `bun tools/check.ts` also work and find Node 24.2 or later through nvm.

The checkers are development tools declared in `dev/package.json`. Install them once with `npm ci --prefix dev --ignore-scripts`, and again when `dev/package-lock.json` changes. Never add a lockfile or a dependency to the root `package.json`: Claude Code installs whatever a plugin's root declares on every user's machine.

## Browser checks

Run `node tools/check-browser.ts` and `node tools/compare.ts` before a commit that changes `skills/fmea-software/assets/report-template.html` or the renderer (`render.ts` and the modules it imports). The gate opens the rendered fixture in real browsers at 320, 375, 768, 1280 and 1920 px and under print emulation and fails on sideways scroll, an element past the edge or an accessibility violation; the comparison photographs each part of the report and compares it with the report of the commit where the branch left `main`, where a changed view is not a failure but must be read. `node tools/shots.ts` writes a screenshot of every part, and `node tools/check-browser.ts --fetch` installs the browsers once and again when Playwright's version changes.

## Non-negotiables

- **Never add AI attribution to a commit.** No `Co-Authored-By` trailer naming an AI, no "Generated with" line, no session trailer. This applies to your commits and to any brief you give a subagent.
- **Commits stay local.** Claude never pushes; the user working in this checkout does.
- **Every drafted pull request body opens with the diff link.** Its first line is `Read the diff: https://revision.city/diffs/nzneit/failwise/compare/<base>...<branch>`. The body is at most 350 words and carries `## Purpose` and `## Verification`; `## Changes` and `## Known limits` are recommended. A commit body is at most 200 words and its subject at most 100 characters; a squash landing with a ` (#N)` subject is exempt from the body limit and its title is measured without the suffix.
- **Process records stay out of this repository.** Plans, acceptance notes, eval results, dated designs, SDD ledgers and task briefs are created in `nzneit/failwise-research`.
- **Provenance is mandatory.** Every sourced statement in `skills/fmea-software/references/` cites a record id; every other statement is tagged `skill-authored`. The tag vocabulary is `references/provenance.md`, whose register traces each record id to its source. The evidence, meaning the records file and the research report, lives in the private repository nzneit/failwise-research and not here. Nothing from it enters `skills/` except what the provenance tags allow, and the maintainer's pre-push hook runs the restricted-wording audit (`tools/public-audit.ts` in failwise-research) before anything leaves the maintainer's machine.
- **Never ship licensed table content.** No AIAG-VDA cell values, no adapted Google SRE Book text. The priority table the plugin ships is the skill's own.
- **Nothing specific to a consuming application** enters the plugin.
