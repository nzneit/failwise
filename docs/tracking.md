# Tracking actions as GitHub issues or Jira work items

The README's section [Tracking actions as GitHub issues or Jira work items](../README.md#tracking-actions-as-github-issues-or-jira-work-items) summarizes this page.

Once an analysis has actions, you can ask Claude to create a GitHub issue or a Jira work item for each one and, later, to read the items' state back. This happens only when you ask, never as part of a run. For GitHub, it needs the GitHub CLI, `gh`, installed and signed in to the host: `gh auth login` for github.com, `gh auth login --hostname <host>` for another host. `plan` and `apply` need an account that can push to the repository, with issues turned on and the repository not archived; `refresh` needs only to read the issues.

## The target on GitHub

Claude first asks where the issues go: the repository, as `owner/repo`, and the label every issue carries, `failwise` unless you choose another. It writes them into the analysis as `meta.tracker`, with the host when it is not github.com and, if the report is published, its address so that each issue links to its row.

## The three commands

Once the target is set, the script `track.ts` does the work in three commands:

- **`plan`** changes nothing. It shows the repository and whether it is public, the text of every issue it would create, each existing issue it would link instead, and anything that needs your attention, such as two issues for one action.
- **`apply`** creates the issues of that plan, or links the existing ones it found, and records each issue's link on its action. Before it creates the first issue, it creates the label in the repository if the label is missing. Nothing is created before you agree to the plan shown: `apply` takes the plan's digest and refuses if what the plan would do has changed since it was shown, and Claude then shows you the new plan and asks again. A repository that is public, or whose visibility cannot be established, is refused unless you agree to that as well.
- **`refresh`** reads each linked issue's state. An issue closed as completed proposes Completed, and one closed as not planned proposes Not Implemented; Claude changes a status only when you confirm it. When the analysis says an action is finished and its issue is still open, close the issue yourself.

## Caveats on GitHub

Text taken from the analysis is written into an issue's body so that GitHub interprets nothing in it, which puts invisible characters into it, so text copied from an issue, or searched for on GitHub, will not match the analysis exactly. GitHub's listing of labelled issues can lag a new issue by some seconds, so after an `apply` that was interrupted, wait a moment before running `plan` again, and if `plan` reports a duplicate, remove the label from the extra issue.

## Jira Cloud

The same three commands track actions as work items in a Jira Cloud project. This needs the Atlassian CLI, `acli`, installed and signed in to your site; the version tested is 1.3.39-stable. Claude gives you the sign-in command and you run it yourself, so the plugin never sees your token: save an API token to a file outside any repository, run `acli jira auth login --site <host> --email <email> --token < token.txt`, and delete the file. Signing in through the browser with `acli jira auth login --web` works as well. If `acli` is signed in to another site, `track.ts` refuses to run and gives the command that switches it, `acli jira auth switch --site <host> --email <email>`. `plan` and `apply` need an account that can create work items in the project; `refresh` needs only to read them.

For a Jira target, `meta.tracker` holds the site as `host`, such as `example.atlassian.net`, the project key, and the label. It can also hold the work type to create, `Task` unless you choose another, and the key of an Epic as `parent`, which Claude recommends so that the items are grouped under it. The differences from GitHub:

- `apply` creates no label first, and since the script cannot tell who can see a Jira project, it treats every Jira target as one whose visibility is unknown: Claude asks you each time before anything is created.
- `refresh` reads an item closed under the status or resolution `Done` as done and proposes Completed, and one closed as `Won't Do` as dropped and proposes Not Implemented. If your project's workflow closes work under other names, Claude writes the whole list in `meta.tracker.states`: a `done` or `dropped` list written there replaces its default, so it keeps `Done` or `Won't Do` while your site still closes work under that name. An item closed under a name in neither list is reported as `closed-unclear` with its status and resolution, so that you can choose, and add the name to the list.
- A linked item whose description no longer carries its action's key, or carries another action's, is reported as `link-mismatch` and left as it is; check the link and, if it is wrong, remove the action's `tracker` block by hand. `refresh` refuses a link to an item on a site other than `host`; remove that link by hand too.
