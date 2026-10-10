# Tracking actions as GitHub issues or Jira work items

The README's section [Tracking actions as GitHub issues or Jira work items](../README.md#tracking-actions-as-github-issues-or-jira-work-items) summarizes this page.

For each action of an analysis, you can ask Claude to create a GitHub issue or a Jira work item, an item below. Later, you can ask Claude to read the state of the items back. Claude does this only when you ask, never as part of a run.

For GitHub, `track.ts` needs the GitHub CLI, `gh`, installed and signed in to the host. Sign in with one of these commands:

- `gh auth login` for github.com
- `gh auth login --hostname <host>` for another host.

`plan` and `apply` need an account that can push to the repository. The repository must have issues turned on. It must not be an archived repository. `refresh` needs only an account that can read the issues.

## The target on GitHub

Claude first asks where the issues go. It asks for the repository, as `owner/repo`, and for the label that every issue carries. The label is `failwise` unless you choose another. Claude writes the repository and the label into the analysis as `meta.tracker`. When the host is not github.com, `meta.tracker` also holds the host. When the report has a published address, `meta.tracker` also holds that address, so that each issue links to its failure chain.

## The three commands

After Claude sets the target, the script `track.ts` does the work in three commands:

- **`plan`** changes nothing. It prints the repository and whether it is public. It prints the text of every issue that it will create, and each existing issue that it will link instead. It also prints anything that needs your attention, such as two issues for one action.
- **`apply`** creates the issues of that plan, or links the existing issues that `plan` found. It writes the link of each issue into the analysis, on its action. When the label is missing from the repository, `apply` creates the label before the first issue. `apply` creates nothing before you agree to the plan. It takes the digest of the plan and refuses when the plan has changed since Claude showed it. Claude then shows you the new plan and asks again.

  `apply` refuses a repository that is public, or whose visibility it cannot establish, unless you agree to that as well.
- **`refresh`** reads the state of each linked issue. When someone closes an issue as completed, `refresh` proposes Completed. When someone closes an issue as not planned, `refresh` proposes Not Implemented. Claude changes a status only when you confirm it. When the analysis holds a finished action whose issue is still open, close the issue yourself.

## What an item says

An item starts with the text of its action. Six sections follow:

- **Where** names the element and the function of the failure chain, with the conditions of the function and the people it serves.
- **The failure** gives the failure mode, its trigger, its three effects, its causes and the existing controls.
- **Priority** gives the priority of the chain and the rationale and evidence of each rating.
- **This action** gives the owner, the target date and the status of the action. It also names the other actions on the chain. When the chain carries a threat-model handoff, a stale flag or a source incident, it names them too.
- **Done when** tells you how to finish the item and what a close proposes in the analysis.
- **Reference** names the analysis, its version, the chain and the action. It shows the key of the item. When the report has a published address, it links to the chain in the report.

`plan` prints the content of every item before you agree. An item is written once. A later change in the analysis does not change the item. Items that an earlier version created keep their text, and `refresh` reads them as before.

## Caveats on GitHub

`apply` escapes the text it takes from the analysis, so that GitHub interprets nothing in it. Then `apply` writes the text into the body of an issue. The escape puts invisible characters into the text. Text that you copy from an issue, or search for on GitHub, does not match the analysis exactly.

The listing of labelled issues on GitHub can lag a new issue by some seconds. After an interrupted `apply`, wait a moment before you run `plan` again. When `plan` prints a duplicate, remove the label from the extra issue.

## Jira Cloud

The same three commands track actions as work items in a Jira Cloud project. For Jira, `track.ts` needs the Atlassian CLI, `acli`, installed and signed in to your site. The version tested is 1.3.39-stable. Claude gives you the sign-in command, and you run it yourself. So failwise never sees your token.

To sign in with an API token:

1. Save an API token to a file outside any repository.
2. Run `acli jira auth login --site <host> --email <email> --token < token.txt`.
3. Delete the file.

You can also sign in through the browser with `acli jira auth login --web`.

When `acli` has a sign-in to another site, `track.ts` refuses to run. It prints the command that switches the site: `acli jira auth switch --site <host> --email <email>`. `plan` and `apply` need an account that can create work items in the project. `refresh` needs only an account that can read them.

For a Jira target, `meta.tracker` holds the site as `host`, such as `example.atlassian.net`. It also holds the project key and the label. It can hold the work type that `apply` creates, which is `Task` unless you choose another. It can also hold the key of an Epic as `parent`. Claude recommends an Epic, so that Jira groups the work items under it.

These are the differences from GitHub:

- `apply` creates no label first. `track.ts` cannot tell who can see a Jira project. So it treats every Jira target as one whose visibility is unknown. Claude asks you each time before `apply` creates anything.
- `refresh` reads a work item closed under the status or resolution `Done` as done, and proposes Completed. It reads a work item closed as `Won't Do` as dropped, and proposes Not Implemented.

  When the workflow of your project closes work under other names, Claude writes the whole list in `meta.tracker.states`. A `done` or `dropped` list there replaces its default. So Claude keeps `Done` or `Won't Do` in that list while your site still closes work under that name.

  `refresh` reports a work item closed under a name in neither list as `closed-unclear`, with its status and resolution. You can then choose, and add the name to the list.
- A linked work item can have a description that no longer carries the key of its action, or carries the key of another action. `refresh` reports such a work item as `link-mismatch` and leaves it as it is. Check the link. When the link is wrong, remove the `tracker` block of the action by hand.
- `refresh` refuses a link to a work item on a site other than `host`. Remove that link by hand too.
