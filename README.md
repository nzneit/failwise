# failwise

failwise is a Claude Code plugin holding one skill, `fmea-software`, that conducts Failure Mode and Effects Analysis (FMEA) on enterprise software. Version 0.1.0 performs design-side analysis (DFMEA) of software systems, services, interfaces, and components; writes a JSON document that conforms to a published schema; validates, lints, and prioritizes that document with scripts; and renders it to a single-file HTML report.

## What it does

The skill runs a seven-step design FMEA: plan the scope and boundary, decompose the system into typed elements, state each element's functions, derive failure chains (mode, effects at three levels, causes, controls), rate Severity, Occurrence, and Detection on 1 to 10 against software-specific anchors, plan actions, and document the result. Every rating carries a rationale and an evidence kind and starts out provisional: the skill asks a named person to re-score each rating before any priority is treated as final.

Four task shapes are supported:

- a new design FMEA of a system from its architecture, dependency, contract, and incident inputs;
- seeding an FMEA baseline from existing postmortems;
- converting a legacy RPN spreadsheet to the JSON model, keeping the original ratings and RPN for reference;
- updating an existing analysis after an architecture change, flagging stale rows rather than rewriting the document.

The behavioural failure catalog in `skills/fmea-software/references/design-failure-catalog.md` carries rows for services, external dependencies, and components, plus a short skill-authored set for security components; for interfaces, event streams, datastores, and ML or LLM components it supplies elicitation questions rather than rows, which is the scope this version claims.

A failure whose cause is an adversary is recorded as a handoff to threat modeling; the plugin does no threat modeling itself. A process-side (PFMEA) request receives a short answer naming what is sourced and what is missing; the process branch is a stub in this version.

The scripts, run as `node <script>` under Node.js 24.2 or later with no dependencies:

| Script | Purpose |
|---|---|
| `skills/fmea-software/scripts/validate.ts <analysis.json> [--write]` | Schema checks, document invariants, priority recomputation, lint rules, quality score. `--write` stores the computed block in the document. |
| `skills/fmea-software/scripts/priority.ts <analysis.json> --write` | Writes every row's priority from its ratings and the severity-first priority table, and, on a row that carries post-action ratings, its `post_priority` from those ratings by the same lookup; a row with no post-action ratings loses any `post_priority` it carried. |
| `skills/fmea-software/scripts/render.ts <analysis.json> --out <report.html> [--force]` | Renders the validated document to one self-contained HTML file. It refuses to overwrite an existing output file unless `--force` is given. |

The priority table the plugin ships, `skills/fmea-software/data/priority-fmea-software-v1.json`, is the skill's own. A different table, including a licensed one you hold, can be supplied at run time with `--table-file`; it is never committed here. When `--table-file` is used it must be passed to all three scripts, because `priority.ts --write` records the table's id in the document and `validate.ts` and `render.ts` refuse a document whose table id differs from the loaded table's (`TABLE_ID_MISMATCH`).

## Status

This is 0.1.0, a pre-release. The design (`docs/specs/2026-09-07-fmea-software-design.md` §15) sets seven acceptance criteria for the first release, which the documents call v1. Six pass, though criterion 3 rests on checker verdicts from before the 2026-09-29 edits (see the addendum in the acceptance note). Criterion 2, the skill evals, does not: 3 of 8 (prompt, model capability) pairs pass, so v1 is not accepted. The scores are in `docs/specs/2026-09-07-eval-results.md`, and the ruling on each open question is in `docs/specs/2026-09-07-acceptance.md`.

What passed: converting a legacy RPN sheet at both model capabilities, and updating an analysis after an architecture change at the high capability.

Known limitations:

- on a new analysis or when seeding from postmortems, no evaluated run asked for the one input the test fixture withholds, a dependency's scaling limit;
- two runs on the same inputs can differ in how many failure chains they write (12 against 18 in one pair);
- one hand-over message stated a priority the document did not carry, so read priorities from the JSON or the rendered report, which the scripts compute;
- every rating stays provisional until a named person re-scores it;
- the evaluated runs were made on glm-5.3 and glm-5.3-flash filling the high and medium capabilities, not on Anthropic models.

## Install

From the marketplace at `nzneit/failwise` on GitHub. From the shell:

```
claude plugin marketplace add nzneit/failwise
claude plugin install failwise@failwise
```

or inside a Claude Code session:

```
/plugin marketplace add nzneit/failwise
/plugin install failwise@failwise
```

Then start a new session or run `/reload-plugins`. Update with `claude plugin update failwise@failwise`.

To try a checkout without installing it, load it as a local plugin directory:

```
claude --plugin-dir /path/to/failwise
```

The skill is discovered at `skills/fmea-software/SKILL.md` and triggers on FMEA, DFMEA, failure mode and effects analysis, and the four task shapes above; it can also be invoked directly as `/failwise:fmea-software`.

Requirements: Claude Code, and Node.js 24.2 or later on PATH. The scripts are TypeScript that node runs directly; there is nothing to install.

## Provenance policy

The skill depends on no external knowledge service. Every anchor, catalog row, table, and rule it carries is tagged with its provenance, using the vocabulary defined in `skills/fmea-software/references/provenance.md`:

- `sourced:<Cnnn>` — reproduced verbatim under a license that permits it, with attribution;
- `paraphrased:<Cnnn>` — restated from a source;
- `adapted-from:<Cnnn>` — derived from a source with changes;
- `cites:<Cnnn>` — authored by the skill, citing the record for the concept only;
- `skill-authored` — the skill's own, citing nothing.

Each `Cnnn` is a record in the research evidence; "Where the evidence lives" below says where that is kept and how a record id is traced to its source. Which tags a source permits follows its license status: paywalled standards are paraphrase-only, the Google SRE Book is cite-only, IEC 60812 is cite-only in this version, public-domain and permissively licensed material may be reproduced with attribution. The plugin ships no AIAG-VDA cell values and nothing specific to any consuming application.

## Where the evidence lives

The research the skill rests on (the research plan, the run 2 report with its findings `F-WSn-NN`, the 130-record records file, and the run 1 report), the two design-panel records, the implementation plan with its reference (cited in code comments as "plan reference §X"), and the publication design (`2026-09-11-publication-design.md`) live in the private repository `nzneit/failwise-research`, because the records file quotes paywalled standards and no-derivatives material verbatim. This repository carries the design spec (`docs/specs/2026-09-07-fmea-software-design.md`), the eval results (`docs/specs/2026-09-07-eval-results.md`), and the v1 acceptance note (`docs/specs/2026-09-07-acceptance.md`), all under `docs/specs/`.

Every record id `Cnnn` is traced to its source through the 26-source register in `skills/fmea-software/references/provenance.md`, whose Address column gives each source's web address. Finding ids `F-WSn-NN`, in the design spec and in the schema, name sections of the private report and do not resolve here. Nothing from the evidence enters `skills/` except what the provenance tags allow, and the public tree is audited for restricted wording by the maintainer's pre-push hook before every push; an outside change to `skills/fmea-software/references/` is audited before it is merged (see `CONTRIBUTING.md`).

## Development

```
npm ci --prefix dev --ignore-scripts                   # once: the static-check tools, installed into dev/node_modules
node tools/run-tests.ts                                # both test suites under node --test, before every commit
node tools/check.ts                                    # types, lint, dead code, duplication and complexity, before every commit
tools/run-eval.sh <1|5|6|7> <high|medium> <run-n>      # one unattended eval run into build/evals/
node tools/eval-report.ts                              # build/evals/results.json → docs/specs/2026-09-07-eval-results.md
```

The eval run is made at a model capability (`high`, `medium`), not a model name: `FMEA_EVAL_MODELS`, as `high=<model>,medium=<model>`, names the model that fills each capability for any provider, and defaults to the Anthropic table when unset. A full eval is sixteen runs, the four prompts at both capabilities twice each. After the sixteen runs, judge them with Claude Code's Workflow tool, `{scriptPath: "tools/workflows/evals.js", args: {root: "<repository root>"}}`, which writes `build/evals/results.json` for `eval-report.ts` to read. Sixteen unattended runs and their judging spend real model time and money. An eval run loads the runner's global Claude Code configuration (bare mode is not used) and grants Read with no path restriction, so run it from a machine and login you are content to expose.

The commands are the same in bash and fish: the test runner expands its globs itself, and `bun tools/run-tests.ts` and `bun tools/check.ts` also work from a shell where only Bun is on PATH (each finds Node.js 24.2 or later through nvm). The static-check tools are declared in `dev/package.json`, not at the root, so the plugin itself still installs no dependencies. Node.js 24.2 or later must otherwise be on PATH (`source ~/.nvm/nvm.sh` in bash, `nvm use 24` in fish). If you call `node --test` directly, use the glob form; `node --test <directory>` is not the same on Node 24. Commit policy and the provenance rule are in `.claude/CLAUDE.md`; read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

## License

Apache-2.0 for the plugin, Copyright 2026 Nathan Neitman; `LICENSE` carries the notice. Third-party material the skill reproduces or adapts keeps its own license and is listed with its attribution in [`skills/fmea-software/licenses/NOTICES.md`](skills/fmea-software/licenses/NOTICES.md), with copies of those licenses beside it (`licenses/APACHE-2.0.txt`, `licenses/MIT-ddunnock-claude-plugins.txt`). The provenance register in `skills/fmea-software/references/provenance.md` covers the rest.
