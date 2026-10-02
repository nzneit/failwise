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

## Before every commit

```
node tools/run-tests.ts
node tools/check.ts
```

The first runs both test suites under `node --test`. The second runs the static checks: the
type check (`tsc`), the linter (`oxlint`) and the dead-code, duplication and complexity analysis
(`fallow`), which the CI workflow also runs on every pull request. Both need Node.js 24.2 or later
on PATH (`bun tools/run-tests.ts` and `bun tools/check.ts` also work and find Node through nvm).
The commands are the same in bash and fish.

The checkers are development tools declared in `dev/package.json`. Install them once with
`npm ci --prefix dev --ignore-scripts`, and again when `dev/package-lock.json` changes. Do not add
a lockfile or a dependency to the root `package.json`: Claude Code installs whatever a plugin's
root declares on every user's machine.

Commit messages carry no AI attribution lines: no `Co-Authored-By` trailer naming an AI, no
"Generated with" line, no session trailer.

## Scripts and tools

- The TypeScript scripts and tools run directly under Node 24.2 or later and take no
  runtime dependencies; keep it that way.
- Keep the one-line coded error contract: each failure is one line on stderr,
  `error <CODE>: <message>`, and exits 1 for usage, 2 for validation, 3 for I/O (design spec §9).
  The skill's codes come from the one list in `skills/fmea-software/scripts/lib/codes.ts`.
- Every command must behave the same in bash and fish. Where a shell snippet would differ
  between them, write the step as a TypeScript script that does the shell's work itself, as
  `tools/run-tests.ts` expands its own globs.
