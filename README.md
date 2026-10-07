# failwise

failwise is a Claude Code plugin that runs a design-side [Failure Mode and Effects Analysis](https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis) (FMEA) on a software system. You describe the system; Claude works through it with you, writes the analysis as one JSON document, checks and prioritizes it with bundled scripts, and renders it as a single-file HTML report.

It is version 0.3.0, a pre-release: the evaluations of the skill, run on 0.1.0, did not pass, and the tracking of actions has no evaluation, neither as GitHub issues, new in 0.2.0, nor as Jira work items, new in 0.3.0. Read [Status and limitations](#status-and-limitations) before relying on it.

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

Ask Claude Code for an FMEA in your own words, or invoke the skill directly with `/failwise:fmea-software`. For example:

- "Run a design FMEA of our checkout service, which depends on a third-party payment gateway and a pricing service."
- "Seed an FMEA baseline from these postmortems and identify the gaps."
- "Convert this legacy RPN spreadsheet to the JSON model."
- "Update the existing FMEA after this architecture change."

The skill works from the inputs listed in [`design-inputs.md`](skills/fmea-software/references/design-inputs.md): critical flows, a component inventory, the dependencies and their limits, incident history, and the controls already in place. [`checkout-inputs.md`](skills/fmea-software/evals/fixtures/checkout-inputs.md) is an example of such inputs. The skill is written to ask for what is missing and to record each gap as an open assumption instead of inventing a value; in testing it did not always ask (see the limitations below).

A new analysis runs in seven steps: plan the scope, break the system into elements, state each element's functions, derive the failure chains, rate them, plan actions, and write the report. It ends with the JSON document, the rendered report, and a request that you re-score each rating in the session, one at a time, with your name and the date recorded on it. After your re-scores, Claude runs the scripts again, so that the priorities and the report follow your ratings. Expect several dozen for one service: each failure chain carries three ratings, and the four test runs of a new analysis wrote between 12 and 18 chains.

## Tracking actions as GitHub issues or Jira work items

Once an analysis has actions, you can ask Claude to create a GitHub issue or a Jira work item for each one and, later, to read the items' state back. This happens only when you ask, never as part of a run. For GitHub, it needs the GitHub CLI, `gh`, installed and signed in to the host: `gh auth login` for github.com, `gh auth login --hostname <host>` for another host. `plan` and `apply` need an account that can push to the repository, with issues turned on and the repository not archived; `refresh` needs only to read the issues.

Claude first asks where the issues go: the repository, as `owner/repo`, and the label every issue carries, `failwise` unless you choose another. It writes them into the analysis as `meta.tracker`, with the host when it is not github.com and, if the report is published, its address so that each issue links to its row. Then the script `track.ts` does the work in three commands:

- **`plan`** changes nothing. It shows the repository and whether it is public, the text of every issue it would create, each existing issue it would link instead, and anything that needs your attention, such as two issues for one action.
- **`apply`** creates the issues of that plan, or links the existing ones it found, and records each issue's link on its action. Before it creates the first issue, it creates the label in the repository if the label is missing. Nothing is created before you agree to the plan shown: `apply` takes the plan's digest and refuses if what the plan would do has changed since it was shown, and Claude then shows you the new plan and asks again. A repository that is public, or whose visibility cannot be established, is refused unless you agree to that as well.
- **`refresh`** reads each linked issue's state. An issue closed as completed proposes Completed, and one closed as not planned proposes Not Implemented; Claude changes a status only when you confirm it. When the analysis says an action is finished and its issue is still open, close the issue yourself.

Text taken from the analysis is written into an issue's body so that GitHub interprets nothing in it, which puts invisible characters into it, so text copied from an issue, or searched for on GitHub, will not match the analysis exactly. GitHub's listing of labelled issues can lag a new issue by some seconds, so after an `apply` that was interrupted, wait a moment before running `plan` again, and if `plan` reports a duplicate, remove the label from the extra issue.

### Jira Cloud

The same three commands track actions as work items in a Jira Cloud project. This needs the Atlassian CLI, `acli`, installed and signed in to your site; the version checked is 1.3.39-stable. Claude gives you the sign-in command and you run it yourself, so the plugin never sees your token: save an API token to a file, run `acli jira auth login --site <host> --email <email> --token < token.txt`, and delete the file. Signing in through the browser with `acli jira auth login --web` works as well. If `acli` is signed in to another site, `track.ts` refuses to run and gives the command that switches it, `acli jira auth switch --site <host> --email <email>`. `plan` and `apply` need an account that can create work items in the project; `refresh` needs only to read them.

For a Jira target, `meta.tracker` holds the site as `host`, such as `example.atlassian.net`, the project key, and the label. It can also hold the work type to create, `Task` unless you choose another, and the key of an Epic as `parent`, which Claude recommends so that the items are grouped under it. The differences from GitHub:

- `apply` creates no label first, and since the script cannot tell who can see a Jira project, it treats every Jira target as one whose visibility is unknown: Claude asks you each time before anything is created.
- `refresh` reads an item closed under the status or resolution `Done` as done and proposes Completed, and one closed as `Won't Do` as dropped and proposes Not Implemented. If your project's workflow closes work under other names, Claude records them in `meta.tracker.states`. An item closed under a name in neither list is reported as `closed-unclear` with its status and resolution, so that you can choose, and add the name.
- A linked item whose description no longer carries its action's key, or carries another action's, is reported as `link-mismatch` and left as it is; check the link and, if it is wrong, remove the action's `tracker` block by hand. `refresh` refuses a link to an item on a site other than `host`; remove that link by hand too.

An analysis that carries a tracker target or a link is refused by the validator of 0.1.0, and one with a Jira target by the validator of 0.2.0 as well, so people who share an analysis need to share the plugin version too.

## Status and limitations

0.3.0 is a pre-release. Its skill was evaluated as 0.1.0, which did not pass its own acceptance gate, and the tracking of actions has no evaluation: neither the GitHub adapter that 0.2.0 adds nor the Jira adapter that 0.3.0 adds. The skill was tested on four prompts, each at two model capabilities, high (filled by glm-5.3) and medium (glm-5.3-flash), and three of the eight combinations passed: converting a legacy RPN sheet at both, and updating an analysis after an architecture change at high. New analyses and postmortem seeding did not pass. The scores are in the [eval results](docs/specs/2026-09-07-eval-results.md) and the ruling is in the [acceptance note](docs/specs/2026-09-07-acceptance.md); both call that release v1.

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

The skill has Claude run four scripts during a session and take every priority from them instead of working one out itself. You can also run them directly with `node`. The first three have no dependencies; `track.ts` needs `gh` installed and signed in for a GitHub target, and `acli` for a Jira target. All four are in `skills/fmea-software/scripts/`.

All four scripts refuse a document in which one object carries the same key twice, as an edit by hand can leave it: the `IO_READ` line names the key and ends with the JSON pointer of the object, or says "the top-level object" when the repeat is at the top level. A JSON reader keeps only the last of the two values, so the first would be checked by nothing and the next `--write` would remove it from the file. Keep the value the analysis means, or join the two into one, and run the scripts again.

| Script | What it does |
|---|---|
| `validate.ts <analysis.json> [--write]` | Runs the schema checks, the document invariants and the lint rules, recomputes the priorities, and computes the quality score. On a clean run, `--write` stores the results in the document; `render.ts` requires them and refuses them when they no longer match the document. |
| `priority.ts <analysis.json> --write [--change-table]` | Writes each row's priority from its ratings, and its post-action priority where the row has post-action ratings. Records the priority table's id in a document that records none yet, and refuses a document that records another table (`TABLE_ID_MISMATCH`) unless `--change-table` is given, which records the loaded table in its place. |
| `render.ts <analysis.json> --out <report.html> [--force]` | Checks the document as `validate.ts` does and renders it to one HTML file. It refuses a document `validate.ts` refuses, one without the stored results of `validate.ts --write`, and one whose stored results no longer match it. `--force` overwrites an existing file. A document validated by an earlier version of the plugin may need one `validate.ts --write` before it renders. |
| `track.ts plan <analysis.json>`<br>`track.ts apply <analysis.json> --plan <digest> [--only <key>,<key>] [--public-ok]`<br>`track.ts refresh <analysis.json> [--write]` | Tracks the actions as GitHub issues or Jira work items, as described [above](#tracking-actions-as-github-issues-or-jira-work-items). `plan` writes nothing and prints the plan with its digest; `apply` carries out that plan, or only the actions `--only` names, and records each link in the document; `refresh` prints each linked item's state with any proposal, and `--write` stores what it saw. |

`validate.ts --write`, `priority.ts --write`, `track.ts apply` and `track.ts refresh --write` read the analysis file again just before they replace it. When another program, such as your editor, saved the file after the script read or last wrote it, the script refuses with `IO_CHANGED` (exit status 3) and leaves the file as that program saved it; run the command again, or, after `apply`, run `plan` again.

The priority table the plugin ships, `skills/fmea-software/data/priority-fmea-software-v1.json`, is the skill's own and carries no cell value from any standard. To use a different table, such as a licensed one you hold, pass the same `--table-file <path>` to all four scripts. `priority.ts --write` records the table's id in a document that records none yet, and from then on all four scripts refuse a run that loads another table (`TABLE_ID_MISMATCH`). To move an analysis that already records a table to a different one, add `--change-table` to `priority.ts --write`: it records the loaded table and recomputes every priority, and it is refused (`USAGE`) when the document records no table or already records the loaded one.

The scripts refuse such a table only when its shape is wrong. When its cells break one of the properties the shipped table keeps, which [`scales-software.md`](skills/fmea-software/references/scales-software.md) lists, the table is still used: `priority.ts --write` prints one `warning priority-table-property:` line on stderr for each broken property, naming the cells, and `validate.ts` reports the same finding as a warning, which `--write` stores in the document and the report lists.

## Provenance

The skill depends on no external knowledge service. Every anchor, catalog row, table and rule it carries is tagged with its provenance: either a record id (`Cnnn`) that traces to a source, or `skill-authored`. The tags, what each source's license permits, and the register that gives each record's source and its web address are in [`provenance.md`](skills/fmea-software/references/provenance.md). The plugin ships no AIAG-VDA cell values, no Google SRE Book text, and no detail of any real system.

The research evidence behind the record ids quotes paywalled standards and no-derivatives material verbatim, so it is kept in a private repository. Finding ids of the form `F-WSn-NN`, in the design spec and the schema, point into it and do not resolve here. The design spec, the eval results and the acceptance note are public, under [`docs/specs/`](docs/specs/).

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers the tests and static checks, the evals, and the provenance rule for changes to the reference files. The design is [`docs/specs/2026-09-07-fmea-software-design.md`](docs/specs/2026-09-07-fmea-software-design.md).

## License

Apache-2.0, Copyright 2026 Nathan Neitman; see [`LICENSE`](LICENSE). Third-party material the skill reproduces or adapts keeps its own license and is listed with its attribution in [`NOTICES.md`](skills/fmea-software/licenses/NOTICES.md), with copies of those licenses beside it.
