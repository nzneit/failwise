# The scripts

The table under [The scripts](../README.md#the-scripts) in the README summarizes this page.

The skill has Claude run four scripts during a session and take every priority from them instead of working one out itself. You can also run them directly with `node`. The first three have no dependencies; `track.ts` needs `gh` installed and signed in for a GitHub target, and `acli` for a Jira target. All four are in `skills/fmea-software/scripts/`.

All four scripts refuse a document in which one object carries the same key twice, as an edit by hand can leave it: the `IO_READ` line names the key and ends with the JSON pointer of the object, or says "the top-level object" when the repeat is at the top level. A JSON reader keeps only the last of the two values, so the first would be checked by nothing and the next `--write` would remove it from the file. Keep the value the analysis means, or join the two into one, and run the scripts again.

| Script | What it does |
|---|---|
| `validate.ts <analysis.json> [--write]` | Runs the schema checks, the document invariants and the lint rules, recomputes the priorities, and computes the quality score. On a clean run, `--write` stores the results in the document; `render.ts` requires them and refuses them when they no longer match the document. |
| `priority.ts <analysis.json> --write [--change-table]` | Writes each row's priority from its ratings, and its post-action priority where the row has post-action ratings. Records the priority table's id in a document that records none yet, and refuses a document that records another table (`TABLE_ID_MISMATCH`) unless `--change-table` is given, which records the loaded table in its place. |
| `render.ts <analysis.json> --out <report.html> [--force]` | Checks the document as `validate.ts` does and renders it to one HTML file. It refuses a document `validate.ts` refuses, one without the stored results of `validate.ts --write`, and one whose stored results no longer match it. `--force` overwrites an existing file. A document validated by an earlier version of the plugin may need one `validate.ts --write` before it renders. |
| `track.ts plan <analysis.json>`<br>`track.ts apply <analysis.json> --plan <digest> [--only <key>,<key>] [--public-ok]`<br>`track.ts refresh <analysis.json> [--write]` | Tracks the actions as GitHub issues or Jira work items, as described in [the tracking page](tracking.md). `plan` writes nothing and prints the plan with its digest; `apply` carries out that plan, or only the actions `--only` names, and records each link in the document; `refresh` prints each linked item's state with any proposal, and `--write` stores what it saw. |

`validate.ts --write`, `priority.ts --write`, `track.ts apply` and `track.ts refresh --write` read the analysis file again just before they replace it. When another program, such as your editor, saved the file after the script read or last wrote it, the script refuses with `IO_CHANGED` (exit status 3) and leaves the file as that program saved it; run the command again, or, after `apply`, run `plan` again.

The priority table the plugin ships, `skills/fmea-software/data/priority-fmea-software-v1.json`, is the skill's own and carries no cell value from any standard. To use a different table, such as a licensed one you hold, pass the same `--table-file <path>` to all four scripts. `priority.ts --write` records the table's id in a document that records none yet, and from then on all four scripts refuse a run that loads another table (`TABLE_ID_MISMATCH`). To move an analysis that already records a table to a different one, add `--change-table` to `priority.ts --write`: it records the loaded table and recomputes every priority, and it is refused (`USAGE`) when the document records no table or already records the loaded one.

The scripts refuse such a table only when its shape is wrong. When its cells break one of the properties the shipped table keeps, which [`scales-software.md`](../skills/fmea-software/references/scales-software.md) lists, the table is still used: `priority.ts --write` prints one `warning priority-table-property:` line on stderr for each broken property, naming the cells, and `validate.ts` reports the same finding as a warning, which `--write` stores in the document and the report lists.

## Compatibility between versions

Version 0.3.0 changed the analysis schema to v2: every element now carries a boundary and a security flag, and the former `external_dependency` and `security_component` kinds became those two attributes; an analysis written against 0.2.x is refused with one `KIND_LEGACY` line and is migrated through the skill's update mode, as `SKILL.md` describes under "Migrate a v1 document".

An analysis that carries a tracker target or a link is refused by the validator of 0.1.0, and one with a Jira target by the validators of 0.2.0 and 0.3.0 as well, so people who share an analysis need to share the plugin version too.

A document validated by an earlier version of the plugin may need one `validate.ts --write` before `render.ts` renders it.
