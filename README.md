# failwise

failwise is a Claude Code plugin that runs a design-side [Failure Mode and Effects Analysis](https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis) (FMEA) on a software system. You describe the system; Claude works through it with you, writes the analysis as one JSON document, checks and prioritizes it with bundled scripts, and renders a single-file HTML report. Version 0.7.0 is a pre-release: the skill did not pass its own evaluations and tracking has none; see [Status](#status).

An FMEA asks what each part of a system must do, how that can fail, what that does to the system and its users, what causes it, and what prevents or detects it today. One failure mode with its effects, causes and controls is one failure chain. Its Severity, Occurrence and Detection ratings, each from 1 to 10, give it a priority that says where to act first. A design-side FMEA examines the design before the incident.

## Install

failwise needs Claude Code and Node.js 24.2 or later on PATH; the scripts are TypeScript that Node runs directly. Tracking adds the GitHub CLI, `gh`, or the Atlassian CLI, `acli`.

```
claude plugin marketplace add nzneit/failwise
claude plugin install failwise@failwise
```

Or inside a session, `/plugin marketplace add nzneit/failwise` then `/plugin install failwise@failwise`. Start a new session or run `/reload-plugins`; update with `claude plugin update failwise@failwise`. To try a checkout without installing it, run `claude --plugin-dir /path/to/failwise`.

## Use it

failwise holds one skill, `fmea-software`; ask in your own words or invoke `/failwise:fmea-software`. It handles four kinds of request:

- **A new analysis.** "Run a design FMEA of our checkout service, which depends on a third-party payment gateway and a pricing service."
- **A seeded analysis.** "Seed an FMEA baseline from these postmortems and identify the gaps."
- **A conversion.** "Convert this legacy RPN spreadsheet to the JSON model." The sheet's ratings are kept as authored.
- **An update.** "Update the existing FMEA after this architecture change." Only the affected chains are re-read and marked stale.

It works from the inputs [`design-inputs.md`](skills/fmea-software/references/design-inputs.md) lists — flows, components, dependencies and limits, codebases, incidents and controls — and asks for what is missing, recording it as an open assumption rather than inventing it.

Claude works through a new analysis in seven steps: plan the scope, break the system into elements, state each element's functions, derive the failure chains, rate them, plan actions and write the report. Every rating it suggests carries a rationale and stays provisional until a named person re-scores it against the [anchors](skills/fmea-software/references/scales-software.md), one rating at a time, with their name and the date recorded.

## What you get

A **JSON analysis** against [`fmea.schema.json`](skills/fmea-software/schemas/fmea.schema.json), which you keep and update, and an **HTML report**: one self-contained file, no JavaScript, no network access, landscape print. The report holds, in order: a summary and needs-attention block; the ground rules, assumptions and review record; the structure and its dependencies; the flows; a chain index sorted by priority; one section per chain grouped by top-level element; the actions; the automated checks and quality score; and a provenance appendix.

An [example report](https://nzneit.github.io/failwise/) of a synthetic checkout service is published. Render it yourself with Node.js 24.2 or later:

```
node skills/fmea-software/scripts/render.ts dev/fixtures/checkout-service.fmea.json --out checkout-report.html
```

## Status

| Version | Model | Rounds | Outcome |
|---|---|---|---|
| 0.1.0 acceptance | glm-5.3 and glm-5.3-flash | 8 runs: 4 prompts at 2 capabilities | 3 of 8 combinations passed; the v1 acceptance gate failed |
| 0.6.0 | Claude Opus 5.5, high | 6 runs: 3 prompts, 2 runs each | 2 of 3 prompts passed; the new analysis failed a must criterion; postmortems did not run |
| 0.7.0 flow model | DeepSeek V4.1-Flash, high and medium | 12 runs: 3 prompts, 2 capabilities, 2 runs | 0 of 6 combinations passed; 4 of 12 runs passed individually |
| Prose baseline | DeepSeek V4.1-Flash | 16 runs: 4 prompts, 2 capabilities, 2 runs | 1 of 8 combinations passed |
| Prose behaviour, three rounds | DeepSeek V4.1-Flash | 48 runs: 3 rounds of 16 | 1, 4 and 2 of 8 combinations passed |
| Prose readability, two rounds | DeepSeek V4.1-Flash | 32 runs: 2 rounds of 16 | 3 and 4 of 8 combinations passed |

### Known limitations

- Claude does not always ask for a missing input. The test inputs leave out a dependency's scaling limit on purpose, and some runs recorded it as a fact instead of an open question.
- Results vary between runs. The same inputs have produced 12 failure chains in one run and 18 in another.
- Read priorities from the analysis or report. The scripts compute both; a closing message once named a priority the analysis did not carry.
- Every rating stays provisional until a named person re-scores it.
- No person took part in the tested runs, so the session's back-and-forth and the re-score step were never exercised.
- The prose rounds used DeepSeek V4.1-Flash, not an Anthropic model: they compare stages of the instructions and do not show how the skill behaves on Claude.

### Not in this version

- Ready-made failure modes for every element kind. Interfaces, event streams, datastores and ML or LLM components get elicitation questions instead.
- Threat modeling. An adversarial cause is written as a handoff to it.
- Process-side FMEA beyond a stub answer.
- One owner and one tracker target per analysis. Per-codebase updates and per-team trackers are later work.

## Tracking actions as GitHub issues or Jira work items

When you ask, Claude can create a GitHub issue or Jira work item per action and read their state back later. Tracking needs `gh` or `acli`, installed and signed in, and nothing is created before you agree to the plan. [The tracking page](docs/tracking.md) gives the commands, Jira differences and caveats.

## The scripts

| Script | What it does |
|---|---|
| `validate.ts <analysis.json> [--write]` | Checks the schema, invariants and lints, recomputes priorities and the score, and writes results with `--write`. |
| `priority.ts <analysis.json> --write [--change-table]` | Writes each chain's priority from its ratings, and records the priority table. |
| `render.ts <analysis.json> --out <report.html> [--force]` | Renders a validated analysis to one HTML file; `--force` overwrites. |
| `track.ts plan\|apply\|refresh <analysis.json>` | Plans, creates or reads back the tracker items for the actions. |
| `update-check.ts <stored copy> <draft> [--check]` | Prints the structural diff and the stale set an update produces, and checks a draft against them. |

[The scripts page](docs/scripts.md) gives every flag and refusal.

## Provenance

Every anchor, catalog row, table and rule carries a record id that traces to a source or the tag `skill-authored`. The tags, license permissions and source register are in [`provenance.md`](skills/fmea-software/references/provenance.md). The design history, eval results and acceptance notes are private, because the records behind them quote restricted material; the plugin ships no AIAG-VDA cell values, no Google SRE Book text and no detail of a real system.

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers setup, tests, static and browser checks, provenance, prose rules and pull request limits. The design is [`docs/design.md`](docs/design.md).

## License

Apache-2.0, Copyright 2026 Nathan Neitman; see [`LICENSE`](LICENSE). Third-party material the skill reproduces or adapts keeps its own license and is listed in [`NOTICES.md`](skills/fmea-software/licenses/NOTICES.md).
