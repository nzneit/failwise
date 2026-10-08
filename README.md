# failwise

failwise is a Claude Code plugin that runs a design-side [Failure Mode and Effects Analysis](https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis) (FMEA) on a software system. You describe the system; Claude works through it with you, writes the analysis as one JSON document, checks and prioritizes it with bundled scripts, and renders it as a single-file HTML report. You can read an [example report](https://nzneit.github.io/failwise/) before you install it.

It is version 0.4.1, a pre-release: the skill did not pass its own evaluations, and the tracking of actions has none. Read [Status and limitations](#status-and-limitations) before relying on it.

## Install

Requirements: Claude Code, and Node.js 24.2 or later on PATH. The scripts are TypeScript that Node runs directly, so there is nothing else to install, except the GitHub CLI, `gh`, if you track actions as GitHub issues, or the Atlassian CLI, `acli`, if you track them as Jira work items.

From a shell:

```
claude plugin marketplace add nzneit/failwise
claude plugin install failwise@failwise
```

or inside a Claude Code session:

```
/plugin marketplace add nzneit/failwise
/plugin install failwise@failwise
```

Then start a new session or run `/reload-plugins`. To update, run `claude plugin update failwise@failwise`.

To try a checkout without installing it, load it as a local plugin directory:

```
claude --plugin-dir /path/to/failwise
```

## Use it

If FMEA is new to you, read [What an FMEA is](#what-an-fmea-is) first.

The plugin holds one skill, `fmea-software`, which handles four kinds of request. Ask Claude Code for an FMEA in your own words, or invoke the skill directly with `/failwise:fmea-software`. One example prompt for each kind of request:

- "Run a design FMEA of our checkout service, which depends on a third-party payment gateway and a pricing service." A new analysis of a system, from its architecture, dependencies, contracts and incident history.
- "Seed an FMEA baseline from these postmortems and identify the gaps." An analysis seeded from existing postmortems.
- "Convert this legacy RPN spreadsheet to the JSON model." Converting a legacy spreadsheet that ranks by RPN (risk priority number, the product of the three ratings) to the JSON model, keeping the original ratings and RPN for reference.
- "Update the existing FMEA after this architecture change." Updating an analysis after an architecture change, flagging the affected rows as stale rather than rewriting the document.

The skill works from the inputs listed in [`design-inputs.md`](skills/fmea-software/references/design-inputs.md): critical flows, a component inventory, the dependencies and their limits, incident history, and the controls already in place. [`checkout-inputs.md`](skills/fmea-software/evals/fixtures/checkout-inputs.md) is an example of such inputs. The skill is written to ask for what is missing and to record each gap as an open assumption instead of inventing a value; in testing it did not always ask (see the limitations below).

Every rating Claude suggests carries a rationale and starts out provisional. The skill asks a named person to re-score each one against the [rating anchors](skills/fmea-software/references/scales-software.md) before any priority is treated as final.

A new analysis runs in seven steps: plan the scope, break the system into elements, state each element's functions, derive the failure chains, rate them, plan actions, and write the report. It ends with the JSON document, the rendered report, and a request that you re-score each rating in the session, one at a time, with your name and the date recorded on it. After your re-scores, Claude runs the scripts again, so that the priorities and the report follow your ratings. Expect several dozen for one service: each failure chain carries three ratings, and the four test runs of a new analysis wrote between 12 and 18 chains.

## What you get

- **A JSON document**, the analysis itself, which follows [`fmea.schema.json`](skills/fmea-software/schemas/fmea.schema.json). It is the record you keep and update.
- **An HTML report** rendered from it: one self-contained file that needs no JavaScript and no network access, and prints in landscape. Under its title and scope it shows a summary strip and a "Needs attention" block, then the ground rules, assumptions and review record, the system's structure, an index of the failure chains sorted by priority, one section per chain, the actions, the automated checks with a quality score, and a provenance appendix.

An [example report](https://nzneit.github.io/failwise/) is published from this repository. It is a hand-written reference analysis of a synthetic checkout service, the test suite's fixture and not the output of a session, rendered by the current code. To render it yourself, from a clone and with Node.js 24.2 or later:

```
node skills/fmea-software/scripts/render.ts skills/fmea-software/evals/fixtures/checkout-service.fmea.json --out checkout-report.html
```

## What an FMEA is

An FMEA asks, for each part of a system, what it must do, how that can fail, what the failure does to the rest of the system and to the user, what causes it, and what prevents or detects it today. One failure mode, with its effects, causes and controls, is one failure chain, a row of the analysis. A chain is rated from 1 to 10 for Severity, Occurrence and Detection, and the three ratings give it a priority of high, medium or low, which says where to act first. A design-side FMEA is done on the design, before the incident, though it can also start from the incidents you already have. Wikipedia's [article on FMEA](https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis) covers the method's history and its variants.

## Status and limitations

0.4.1 is a pre-release. Its skill was evaluated as 0.1.0, which did not pass its own acceptance gate, and the tracking of actions has no evaluation: neither the GitHub adapter that 0.2.0 adds nor the Jira adapter that 0.4.0 adds. The skill was tested on four prompts, each at two model capabilities, high (filled by glm-5.3) and medium (glm-5.3-flash), and three of the eight combinations passed: converting a legacy RPN sheet at both, and updating an analysis after an architecture change at high. New analyses and postmortem seeding did not pass. The scores are in the [eval results](docs/specs/2026-09-07-eval-results.md) and the ruling is in the [acceptance note](docs/specs/2026-09-07-acceptance.md); both call that release v1.

The other six acceptance criteria pass, with one caveat: the check that each cited record supports its statement predates the edits of 2026-09-29. Four reference files have open findings from it, none about licensing, and two were not re-checked (see the acceptance note's addendum).

Known limitations:

- It may not ask for a missing input. No tested run of a new analysis or of postmortem seeding asked for a dependency's scaling limit that the test inputs deliberately leave out.
- Results vary between runs. The same inputs gave 12 failure chains in one run and 18 in another.
- Read priorities from the JSON or the rendered report, which the scripts compute, and not from Claude's closing message, which once stated a priority the document did not carry.
- Every rating stays provisional until a named person re-scores it.
- The tested runs were unattended: nobody answered questions, so the back-and-forth of a session and the re-scoring step were not exercised.
- The tested runs were made on glm-5.3 and glm-5.3-flash, not on Anthropic models.

Not in this version:

- Ready-made failure modes for every kind of element. The skill's catalog has them for services and components, with dependency rows for any element outside the analysis or carrying a dependency block and a short security set for security-relevant elements. For interfaces, event streams, datastores and ML or LLM components it asks guiding questions instead.
- Threat modeling. A failure whose cause is an adversary is recorded as a handoff to threat modeling.
- Process-side FMEA (PFMEA) of delivery, pipelines or operations. Such a request gets a short answer naming what is sourced and what is missing, and no analysis.

The scripts page says which versions of the plugin read which documents, under [Compatibility between versions](docs/scripts.md#compatibility-between-versions).

## Tracking actions as GitHub issues or Jira work items

Once an analysis has actions, Claude can create a GitHub issue or a Jira work item for each one and later read their state back. This happens only when you ask. Tracking needs `gh` for GitHub or `acli` for Jira, installed and signed in. The script `track.ts` does the work in three commands: `plan`, `apply` and `refresh`. `plan` changes nothing, and nothing is created before you agree to the plan it shows. [The tracking page](docs/tracking.md) gives the details, the differences for Jira and the caveats.

## The scripts

The skill has Claude run four scripts and take every priority from them. You can also run them directly with `node`. All four are in `skills/fmea-software/scripts/`.

| Script | What it does |
|---|---|
| `validate.ts <analysis.json> [--write]` | Checks the analysis against the schema, the invariants and the lint rules, recomputes the priorities and the quality score, and on a clean run stores the results with `--write`, which `render.ts` requires. |
| `priority.ts <analysis.json> --write [--change-table]` | Writes each row's priority from its ratings, and with `--change-table` moves the analysis to another priority table. |
| `render.ts <analysis.json> --out <report.html> [--force]` | Renders a validated analysis to the HTML file that `--out` names, and with `--force` overwrites an existing file. |
| `track.ts plan <analysis.json>`<br>`track.ts apply <analysis.json> --plan <digest> [--only <key>,<key>] [--public-ok]`<br>`track.ts refresh <analysis.json> [--write]` | Tracks the actions as GitHub issues or Jira work items, as [the tracking page](docs/tracking.md) describes, and `apply` takes the digest that `plan` prints. |

[The scripts page](docs/scripts.md) describes the flags, the refusals and how to use a priority table of your own.

## Provenance

The skill depends on no external knowledge service. Every anchor, catalog row, table and rule it carries is tagged with its provenance: either a record id (`Cnnn`) that traces to a source, or `skill-authored`. The tags, what each source's license permits, and the register that gives each record's source and its web address are in [`provenance.md`](skills/fmea-software/references/provenance.md). The plugin ships no AIAG-VDA cell values, no Google SRE Book text, and no detail of any real system.

The research evidence behind the record ids quotes paywalled standards and no-derivatives material verbatim, so it is kept in a private repository. Finding ids of the form `F-WSn-NN`, in the design spec and the schema, point into it and do not resolve here. The design spec, the eval results and the acceptance note are public, under [`docs/specs/`](docs/specs/).

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers the tests and static checks, the evals, and the provenance rule for changes to the reference files. The design is [`docs/specs/2026-09-07-fmea-software-design.md`](docs/specs/2026-09-07-fmea-software-design.md).

## License

Apache-2.0, Copyright 2026 Nathan Neitman; see [`LICENSE`](LICENSE). Third-party material the skill reproduces or adapts keeps its own license and is listed with its attribution in [`NOTICES.md`](skills/fmea-software/licenses/NOTICES.md), with copies of those licenses beside it.
