# failwise

failwise is a Claude Code plugin that runs a design-side [Failure Mode and Effects Analysis](https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis) (FMEA) on a software system. You describe the system; Claude works through it with you, writes the analysis as one JSON document, checks and prioritizes it with bundled scripts, and renders it as a single-file HTML report.

It is version 0.1.0, a pre-release whose own evaluations did not pass. Read [Status and limitations](#status-and-limitations) before relying on it.

## What an FMEA is

An FMEA asks, for each part of a system, what it must do, how that can fail, what the failure does to the rest of the system and to the user, what causes it, and what prevents or detects it today. One failure mode, with its effects, causes and controls, is one failure chain, a row of the analysis. A chain is rated from 1 to 10 for Severity, Occurrence and Detection, and the three ratings give it a priority of high, medium or low, which says where to act first. A design-side FMEA is done on the design, before the incident, though it can also start from the incidents you already have. Wikipedia's [article on FMEA](https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis) covers the method's history and its variants.

## What the plugin does

The plugin holds one skill, `fmea-software`, which handles four kinds of request:

- a new analysis of a system, from its architecture, dependencies, contracts and incident history;
- an analysis seeded from existing postmortems;
- converting a legacy spreadsheet that ranks by RPN (risk priority number, the product of the three ratings) to the JSON model, keeping the original ratings and RPN for reference;
- updating an analysis after an architecture change, flagging the affected rows as stale rather than rewriting the document.

Every rating Claude suggests carries a rationale and starts out provisional. The skill asks a named person to re-score each one against the [rating anchors](skills/fmea-software/references/scales-software.md) before any priority is treated as final.

## What you get

- **A JSON document**, the analysis itself, which follows [`fmea.schema.json`](skills/fmea-software/schemas/fmea.schema.json). It is the record you keep and update.
- **An HTML report** rendered from it: one self-contained file that needs no JavaScript and no network access, and prints in landscape. Under its title and scope it shows a summary strip and a "Needs attention" block, then the ground rules, assumptions and review record, the system's structure, an index of the failure chains sorted by priority, one section per chain, the actions, the automated checks with a quality score, and a provenance appendix.

An [example report](https://nzneit.github.io/failwise/) is published from this repository. It is a hand-written reference analysis of a synthetic checkout service, the test suite's fixture and not the output of a session, rendered by the current code. To render it yourself, from a clone and with Node.js 24.2 or later:

```
node skills/fmea-software/scripts/render.ts skills/fmea-software/evals/fixtures/checkout-service.fmea.json --out checkout-report.html
```

## Install

Requirements: Claude Code, and Node.js 24.2 or later on PATH. The scripts are TypeScript that Node runs directly, so there is nothing else to install.

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

Ask Claude Code for an FMEA in your own words, or invoke the skill directly with `/failwise:fmea-software`. For example:

- "Run a design FMEA of our checkout service, which depends on a third-party payment gateway and a pricing service."
- "Seed an FMEA baseline from these postmortems and identify the gaps."
- "Convert this legacy RPN spreadsheet to the JSON model."
- "Update the existing FMEA after this architecture change."

The skill works from the inputs listed in [`design-inputs.md`](skills/fmea-software/references/design-inputs.md): critical flows, a component inventory, the dependencies and their limits, incident history, and the controls already in place. [`checkout-inputs.md`](skills/fmea-software/evals/fixtures/checkout-inputs.md) is an example of such inputs. The skill is written to ask for what is missing and to record each gap as an open assumption instead of inventing a value; in testing it did not always ask (see the limitations below).

A new analysis runs in seven steps: plan the scope, break the system into elements, state each element's functions, derive the failure chains, rate them, plan actions, and write the report. It ends with the JSON document, the rendered report, and a request that you re-score each rating in the session, one at a time, with your name and the date recorded on it. Expect several dozen for one service: each failure chain carries three ratings, and the four test runs of a new analysis wrote between 12 and 18 chains.

## Status and limitations

0.1.0 is a pre-release that did not pass its own acceptance gate. The skill was tested on four prompts, each at two model capabilities, high (filled by glm-5.3) and medium (glm-5.3-flash), and three of the eight combinations passed: converting a legacy RPN sheet at both, and updating an analysis after an architecture change at high. New analyses and postmortem seeding did not pass. The scores are in the [eval results](docs/specs/2026-09-07-eval-results.md) and the ruling is in the [acceptance note](docs/specs/2026-09-07-acceptance.md); both call this release v1.

The other six acceptance criteria pass, with one caveat: the check that each cited record supports its statement predates the edits of 2026-09-29. Four reference files have open findings from it, none about licensing, and two were not re-checked (see the acceptance note's addendum).

Known limitations:

- It may not ask for a missing input. No tested run of a new analysis or of postmortem seeding asked for a dependency's scaling limit that the test inputs deliberately leave out.
- Results vary between runs. The same inputs gave 12 failure chains in one run and 18 in another.
- Read priorities from the JSON or the rendered report, which the scripts compute, and not from Claude's closing message, which once stated a priority the document did not carry.
- Every rating stays provisional until a named person re-scores it.
- The tested runs were unattended: nobody answered questions, so the back-and-forth of a session and the re-scoring step were not exercised.
- The tested runs were made on glm-5.3 and glm-5.3-flash, not on Anthropic models.

Not in this version:

- Ready-made failure modes for every kind of element. The skill's catalog has them for services, external dependencies and components, with a short set for security components. For interfaces, event streams, datastores and ML or LLM components it asks guiding questions instead.
- Threat modeling. A failure whose cause is an adversary is recorded as a handoff to threat modeling.
- Process-side FMEA (PFMEA) of delivery, pipelines or operations. Such a request gets a short answer naming what is sourced and what is missing, and no analysis.

## The scripts

The skill has Claude run three scripts during a session and take every priority from them instead of working one out itself. You can also run them directly with `node`; they have no dependencies. All three are in `skills/fmea-software/scripts/`.

| Script | What it does |
|---|---|
| `validate.ts <analysis.json> [--write]` | Runs the schema checks, the document invariants and the lint rules, recomputes the priorities, and computes the quality score. On a clean run, `--write` stores the results in the document, which `render.ts` requires. |
| `priority.ts <analysis.json> --write` | Writes each row's priority from its ratings, and its post-action priority where the row has post-action ratings. Records the priority table's id in the document. |
| `render.ts <analysis.json> --out <report.html> [--force]` | Renders a validated document to one HTML file. `--force` overwrites an existing file. |

The priority table the plugin ships, `skills/fmea-software/data/priority-fmea-software-v1.json`, is the skill's own and carries no cell value from any standard. To use a different table, such as a licensed one you hold, pass the same `--table-file <path>` to all three scripts: `priority.ts --write` records the table's id in the document, and `validate.ts` and `render.ts` refuse a document whose recorded table differs from the one loaded (`TABLE_ID_MISMATCH`).

## Provenance

The skill depends on no external knowledge service. Every anchor, catalog row, table and rule it carries is tagged with its provenance: either a record id (`Cnnn`) that traces to a source, or `skill-authored`. The tags, what each source's license permits, and the register that gives each record's source and its web address are in [`provenance.md`](skills/fmea-software/references/provenance.md). The plugin ships no AIAG-VDA cell values, no Google SRE Book text, and no detail of any real system.

The research evidence behind the record ids quotes paywalled standards and no-derivatives material verbatim, so it is kept in a private repository. Finding ids of the form `F-WSn-NN`, in the design spec and the schema, point into it and do not resolve here. The design spec, the eval results and the acceptance note are public, under [`docs/specs/`](docs/specs/).

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers the tests and static checks, the evals, and the provenance rule for changes to the reference files. The design is [`docs/specs/2026-09-07-fmea-software-design.md`](docs/specs/2026-09-07-fmea-software-design.md).

## License

Apache-2.0, Copyright 2026 Nathan Neitman; see [`LICENSE`](LICENSE). Third-party material the skill reproduces or adapts keeps its own license and is listed with its attribution in [`NOTICES.md`](skills/fmea-software/licenses/NOTICES.md), with copies of those licenses beside it.
