# Working in this repo

This repo is the failwise Claude Code plugin, holding one skill, `skills/fmea-software/`. The design is
`docs/specs/2026-09-07-fmea-software-design.md`; read it before changing anything.

## Before every commit

```
node tools/run-tests.ts
node tools/check.ts
```

The first runs both suites under `node --test` (`skills/fmea-software/scripts/*.test.ts` and
`tools/*.test.ts`) with the globs expanded by the script. The second runs the static checks:
the type check (`tsc`), the linter (`oxlint`) and the dead-code, duplication and complexity
analysis (`fallow`); it exits 1 on any finding, and on a missing tool. Both are the same command in
bash and fish. Node 24.2 or later must be on PATH (`source ~/.nvm/nvm.sh` in bash, `nvm use 24` in
fish); `bun tools/run-tests.ts` and `bun tools/check.ts` also work and find Node 24.2 or later
through nvm.

The checkers are development tools declared in `dev/package.json`. Install them once with
`npm ci --prefix dev --ignore-scripts`, and again when `dev/package-lock.json` changes. Never add a
lockfile or a dependency to the root `package.json`: Claude Code installs whatever a plugin's root
declares on every user's machine.

## Non-negotiables

- **Never add AI attribution to a commit.** No `Co-Authored-By` trailer naming an AI, no
  "Generated with" line, no session trailer. This applies to your commits and to any brief
  you give a subagent.
- **Commits stay local.** Claude never pushes; the user working in this checkout does.
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
