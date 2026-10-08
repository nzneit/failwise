# The scripts

The table under [The scripts](../README.md#the-scripts) in the README summarizes this page.

During a session, the skill has Claude run four scripts. Claude takes every priority from them, and does not work one out itself. You can also run them directly with `node`. The first three scripts have no dependencies. `track.ts` needs `gh`, installed and signed in, for a GitHub target, and `acli` for a Jira target. All four are in `skills/fmea-software/scripts/`.

All four scripts refuse an analysis in which one object carries the same key twice. An edit by hand can leave an analysis in that state. A JSON reader keeps only the last of the two values. Without this refusal, no check reads the first value, and the next `--write` removes it from the file.

For this refusal, the scripts print an `IO_READ` line. The line names the key and ends with the JSON pointer of the object. When the repeat is at the top level, the line says "the top-level object" instead. Keep the value that the analysis means, or join the two values into one. Then run the scripts again.

| Script | What it does |
|---|---|
| `validate.ts <analysis.json> [--write]` | Runs the schema checks, the invariants of the analysis and the lint rules. Recomputes the priorities, and computes the quality score. On a clean run, `--write` writes the results into the analysis. `render.ts` requires these results, and refuses them when they no longer match the analysis. |
| `priority.ts <analysis.json> --write [--change-table]` | Writes the priority of each failure chain from its ratings. Writes the post-action priority of each chain that has post-action ratings. Writes the id of the priority table into an analysis that holds no table id yet. Refuses an analysis that holds the id of another table, with `TABLE_ID_MISMATCH`, unless you give `--change-table`. `--change-table` writes the id of the loaded table in its place. |
| `render.ts <analysis.json> --out <report.html> [--force]` | Checks the analysis as `validate.ts` does, and renders it to one HTML file. Refuses an analysis that `validate.ts` refuses. Also refuses an analysis without the results of `validate.ts --write`, and an analysis whose results no longer match it. `--force` overwrites an existing file. An analysis that an earlier version of the plugin validated can carry results that the current `validate.ts` computes differently. Such an analysis needs one `validate.ts --write` before `render.ts` renders it. |
| `track.ts plan <analysis.json>`<br>`track.ts apply <analysis.json> --plan <digest> [--only <key>,<key>] [--public-ok]`<br>`track.ts refresh <analysis.json> [--write]` | Tracks the actions as GitHub issues or Jira work items, as [the tracking page](tracking.md) describes. `plan` writes nothing, and prints the plan with its digest. `apply` carries out that plan, or only the actions that `--only` names. `apply` writes each link into the analysis. `refresh` prints the state of each linked item, with any proposal. With `--write`, `refresh` also writes what it finds into the analysis. |

`validate.ts --write`, `priority.ts --write`, `track.ts apply` and `track.ts refresh --write` read the analysis file again just before they replace it. When another program, such as your editor, saves the file after the script reads it or after its last write, the script refuses. The refusal carries `IO_CHANGED` and exit status 3. It leaves the file as that program saved it. To continue:

- After `apply`, run `plan` again.
- After any other command, run the command again.

The priority table that the plugin ships is `skills/fmea-software/data/priority-fmea-software-v1.json`. It is the skill's own table, and carries no cell value from any standard. To use a different table, such as a licensed one you hold, pass the same `--table-file <path>` to all four scripts.

`priority.ts --write` writes the id of the table into an analysis that holds no table id yet. From then on, all four scripts refuse a run that loads another table, with `TABLE_ID_MISMATCH`. To move an analysis that already holds a table id to a different table, add `--change-table` to `priority.ts --write`. `--change-table` writes the id of the loaded table, and `priority.ts` recomputes every priority. `priority.ts` refuses `--change-table` with `USAGE` when the analysis holds no table id, or already holds the id of the loaded table.

The scripts refuse a table of your own only when its shape is wrong. [`scales-software.md`](../skills/fmea-software/references/scales-software.md) lists the properties that the shipped table keeps. When the cells of your table break one of these properties, the scripts still use the table. `priority.ts --write` then prints one `warning priority-table-property:` line on stderr for each broken property, with the names of its cells. `validate.ts` prints the same finding as a warning. `validate.ts --write` writes the warning into the analysis, and the report lists it.

## Compatibility between versions

Version 0.3.0 changed the analysis schema to v2. Every element now carries a boundary and a security flag. The former `external_dependency` and `security_component` kinds became those two attributes. `validate.ts`, `render.ts` and `track.ts` refuse an analysis written against 0.2.x with one `KIND_LEGACY` line. The update mode of the skill migrates such an analysis, as `SKILL.md` describes under "Migrate a v1 document".

The validator of 0.1.0 refuses an analysis that carries a tracker target or a link. The validators of 0.2.0 and 0.3.0 also refuse an analysis with a Jira target. So people who share an analysis must share the version of the plugin too.

An analysis that an earlier version of the plugin validated can carry results that the current `validate.ts` computes differently. Such an analysis needs one `validate.ts --write` before `render.ts` renders it.
