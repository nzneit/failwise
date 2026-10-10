# failwise

failwise is a Claude Code plugin that runs a design-side [Failure Mode and Effects Analysis](https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis) (FMEA) on a software system. You describe the system; Claude works through it with you, writes the analysis as one JSON document, checks and prioritizes it with bundled scripts, and renders it as a single-file HTML report. You can read an [example report](https://nzneit.github.io/failwise/) before you install it.

It is version 0.6.0, a pre-release: the skill did not pass its own evaluations, and the tracking of actions has none. Read [Status and limitations](#status-and-limitations) before relying on it.

## Install

failwise needs Claude Code, and Node.js 24.2 or later on PATH. The scripts are TypeScript that Node runs directly. You install nothing else, except a CLI for the tracking of actions:

- the GitHub CLI, `gh`, if you track actions as GitHub issues
- the Atlassian CLI, `acli`, if you track them as Jira work items.

To install failwise from a shell, run these commands:

```
claude plugin marketplace add nzneit/failwise
claude plugin install failwise@failwise
```

Or run these commands inside a Claude Code session:

```
/plugin marketplace add nzneit/failwise
/plugin install failwise@failwise
```

Then start a new session or run `/reload-plugins`. To update, run `claude plugin update failwise@failwise`.

To try a checkout and not install it, load it as a local plugin directory:

```
claude --plugin-dir /path/to/failwise
```

## Use it

If FMEA is new to you, read [What an FMEA is](#what-an-fmea-is) first.

failwise holds one skill, `fmea-software`. The skill handles four kinds of request. Ask Claude Code for an FMEA in your own words. You can also invoke the skill directly with `/failwise:fmea-software`. The list gives one example prompt for each kind of request:

- The skill makes a new analysis of a system. It works from the architecture, dependencies, contracts and incident history of the system. Example: "Run a design FMEA of our checkout service, which depends on a third-party payment gateway and a pricing service."
- The skill seeds an analysis from existing postmortems. Example: "Seed an FMEA baseline from these postmortems and identify the gaps."
- The skill converts a legacy spreadsheet that ranks by RPN to the JSON model. RPN is the risk priority number, the product of the three ratings. The skill keeps the original ratings and RPN for reference. Example: "Convert this legacy RPN spreadsheet to the JSON model."
- The skill updates an analysis after an architecture change. It flags the affected failure chains as stale, and does not write the whole analysis again. Example: "Update the existing FMEA after this architecture change."

The skill works from the inputs that [`design-inputs.md`](skills/fmea-software/references/design-inputs.md) lists. They are critical flows, a component inventory, the dependencies and their limits, the codebases and their repositories, incident history, and the controls already in place. [`checkout-inputs.md`](skills/fmea-software/evals/fixtures/checkout-inputs.md) is an example of such inputs. The skill tells Claude to ask for what is missing. It also tells Claude to write each gap into the analysis as an open assumption, and not to invent a value. In the tests, Claude did not always ask, as the limitations below say.

Every rating that Claude suggests carries a rationale. Each rating is provisional at first. The skill asks a named person to re-score each rating against the [rating anchors](skills/fmea-software/references/scales-software.md). The skill treats no priority as final before that re-score.

Claude works through a new analysis with you in seven steps:

1. Plan the scope.
2. Break the system into elements.
3. State the functions of each element.
4. Derive the failure chains.
5. Rate the failure chains.
6. Plan actions.
7. Write the report.

At the end, Claude gives you the analysis and the rendered report. Claude then asks you to re-score each rating in the session, one at a time. Claude writes your name and the date on each rating that you re-score. After your re-scores, Claude runs the scripts again, so that the priorities and the report follow your ratings. Expect several dozen ratings for one service. Each failure chain carries three ratings. The four test runs of a new analysis at version 0.1.0 wrote between 12 and 18 chains, and the two at version 0.6.0 wrote 16 each.

## What you get

- **A JSON document**, the analysis itself. It follows [`fmea.schema.json`](skills/fmea-software/schemas/fmea.schema.json). It is the record that you keep and update.
- **An HTML report**, which `render.ts` renders from the analysis. The report is one self-contained file. It needs no JavaScript and no network access, and it prints in landscape. It holds these parts, in this order:
  - a summary strip and a "Needs attention" block, under the title and the scope
  - the ground rules, assumptions and review record
  - the structure of the system, with a table of its top-level elements and a table of its dependencies
  - an index of the failure chains, sorted by priority
  - one section per chain, grouped by top-level element
  - the actions
  - the automated checks, with a quality score
  - a provenance appendix.

This repository publishes an [example report](https://nzneit.github.io/failwise/). The report shows a hand-written reference analysis of a synthetic checkout service. That analysis is the fixture of the test suite, not the output of a session. The current code renders it. To render it yourself, run this command in a clone, with Node.js 24.2 or later:

```
node skills/fmea-software/scripts/render.ts skills/fmea-software/evals/fixtures/checkout-service.fmea.json --out checkout-report.html
```

## What an FMEA is

An FMEA asks these questions about each part of a system:

- What must it do?
- How can that fail?
- What does the failure do to the rest of the system and to the user?
- What causes it?
- What prevents or detects it today?

One failure mode, with its effects, causes and controls, is one failure chain, a row of the analysis. Each chain has three ratings from 1 to 10: Severity, Occurrence and Detection. The three ratings give the chain a priority of high, medium or low. The priority says where to act first. A design-side FMEA examines the design, before the incident. It can also start from the incidents that you already have. Wikipedia's [article on FMEA](https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis) covers the method's history and its variants.

## Status and limitations

0.6.0 is a pre-release. The full evaluation of its skill ran on version 0.1.0, and that version did not pass its own acceptance gate. Neither the GitHub adapter that 0.2.0 adds nor the Jira adapter that 0.4.0 adds has an evaluation. 0.6.0 also changes the format of the analysis to schema v3, so an analysis written with 0.3.x to 0.5.x needs a one-time migration, as [Compatibility between versions](docs/scripts.md#compatibility-between-versions) describes.

The evaluation tested the skill on four prompts. It ran each prompt at two model capabilities, high and medium. glm-5.3 filled the high capability, and glm-5.3-flash filled the medium capability. Three of the eight combinations passed:

- the conversion of a legacy RPN sheet, at both capabilities
- the update of an analysis after an architecture change, at high.

New analyses and postmortem seeding did not pass. The [eval results](docs/specs/2026-09-07-eval-results.md) give the scores, and the [acceptance note](docs/specs/2026-09-07-acceptance.md) gives the ruling. Both call release 0.1.0 v1.

The other six acceptance criteria pass, with one caveat. The check that each cited record supports its statement predates the edits of 2026-09-29. Four reference files have open findings from that check, and none of the findings is about licensing. The check did not run again on two other reference files. The addendum of the acceptance note gives the details.

Version 0.6.0 ran three of the four prompts again, twice each at high: the new analysis, the conversion of a legacy RPN sheet and the update after an architecture change. Two of the three passed: the conversion and the update. The new analysis failed on a must criterion: its second run wrote "None stated." as the scaling limit of the pricing service, instead of raising the missing limit as an open question. Postmortem seeding did not run again and has no result at 0.6.0. Four checks in a session also tried the migration of an older analysis and the update rules on dependencies and codebases. The [multi-codebase eval results](docs/specs/2026-10-08-multi-codebase-eval-results.md) give the scores, the checks and what stayed unverified.

Known limitations:

- Claude does not always ask for a missing input. The test inputs leave out the scaling limit of a dependency on purpose. At version 0.1.0, no tested run of a new analysis or of postmortem seeding asked for it. At version 0.6.0, one of the two runs of a new analysis recorded it as an open assumption for you to answer, and the other did not.
- Results vary between runs. At version 0.1.0 the same inputs gave 12 failure chains in one run and 18 in another, and at version 0.6.0 both runs wrote 16.
- Read the priorities from the analysis or the rendered report. The scripts compute the priorities in both. Do not read them from Claude's closing message, which once stated a priority that the analysis did not carry.
- Every rating stays provisional until a named person re-scores it.
- No person took part in the tested runs. Nobody answered questions, so the tests did not exercise the back-and-forth of a session or the re-score step.
- The 0.1.0 runs used glm-5.3 and glm-5.3-flash, not Anthropic models. The 0.6.0 runs used Claude Opus 5.5 (`claude-opus-5-5`) at the high capability.

Not in this version:

- Ready-made failure modes for every kind of element. The catalog of the skill has them for services and components. It also has catalog rows for dependencies, for any element outside the analysis or that is the provider of an edge. It has a short security set for security-relevant elements. For interfaces, event streams, datastores and ML or LLM components, the skill asks guiding questions instead.
- Threat modeling. The skill writes a failure whose cause is an adversary as a handoff to threat modeling.
- Process-side FMEA (PFMEA) of delivery, pipelines or operations. For such a request, the skill gives a short answer and no analysis. The answer names what has a source and what is missing.
- One analysis has one owner and one tracker target, and an update re-reads the whole analysis; updating one codebase alone, and a tracker per team, are later work.

Under [Compatibility between versions](docs/scripts.md#compatibility-between-versions), the scripts page says which versions of the plugin read which analyses.

## Tracking actions as GitHub issues or Jira work items

Once an analysis has actions, Claude can create a GitHub issue or a Jira work item for each one and later read their state back. This happens only when you ask. Tracking needs `gh` for GitHub or `acli` for Jira, installed and signed in. The script `track.ts` does the work in three commands: `plan`, `apply` and `refresh`. `plan` changes nothing, and nothing is created before you agree to the plan it prints. [The tracking page](docs/tracking.md) gives the details, the differences for Jira and the caveats.

## The scripts

The skill has Claude run five scripts and take every priority from them. The fifth, `update-check.ts`, is the one the update mode runs. You can also run them directly with `node`. All five are in `skills/fmea-software/scripts/`.

| Script | What it does |
|---|---|
| `validate.ts <analysis.json> [--write]` | Checks the analysis against the schema, the invariants and the lint rules, recomputes the priorities and the quality score, and on a clean run writes the results with `--write`, which `render.ts` requires. |
| `priority.ts <analysis.json> --write [--change-table]` | Writes each failure chain's priority from its ratings, and with `--change-table` moves the analysis to another priority table. |
| `render.ts <analysis.json> --out <report.html> [--force]` | Renders a validated analysis to the HTML file that `--out` names, and with `--force` overwrites an existing file. |
| `track.ts plan <analysis.json>`<br>`track.ts apply <analysis.json> --plan <digest> [--only <key>,<key>] [--public-ok]`<br>`track.ts refresh <analysis.json> [--write]` | Tracks the actions as GitHub issues or Jira work items, as [the tracking page](docs/tracking.md) describes, and `apply` takes the digest that `plan` prints. |
| `update-check.ts <stored copy> <draft> [--check]` | Compares an update's draft with the analysis as it was stored, prints the dependency and element changes, the rows they mark stale and the order to re-rate them in, and with `--check` refuses a draft whose stale flags disagree. It writes nothing. |

[The scripts page](docs/scripts.md) describes the flags, the refusals and how to use a priority table of your own.

## Provenance

The skill depends on no external knowledge service. Every anchor, catalog row, table and rule it carries is tagged with its provenance: either a record id (`Cnnn`) that traces to a source, or `skill-authored`. The tags, what each source's license permits, and the register that gives each record's source and its web address are in [`provenance.md`](skills/fmea-software/references/provenance.md). The plugin ships no AIAG-VDA cell values, no Google SRE Book text, and no detail of any real system.

The research evidence behind the record ids quotes paywalled standards and no-derivatives material verbatim, so it is kept in a private repository. Finding ids of the form `F-WSn-NN`, in the design spec and the schema, point into it and do not resolve here. The design spec, the eval results and the acceptance note are public, under [`docs/specs/`](docs/specs/).

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers the tests and static checks, the evals, and the provenance rule for changes to the reference files. The design is [`docs/specs/2026-09-07-fmea-software-design.md`](docs/specs/2026-09-07-fmea-software-design.md).

## License

Apache-2.0, Copyright 2026 Nathan Neitman; see [`LICENSE`](LICENSE). Third-party material the skill reproduces or adapts keeps its own license and is listed with its attribution in [`NOTICES.md`](skills/fmea-software/licenses/NOTICES.md), with copies of those licenses beside it.
