# Tracking actions as GitHub issues or Jira work items

When you ask, Claude can create a GitHub issue or a Jira work item for each action of an analysis, and later read their state. Only on request, never as part of a run. Tracking needs `gh` for GitHub or `acli` for Jira, installed and signed in.

## The target on GitHub

Claude asks where the issues go: the repository as `owner/repo`, and the label every issue carries, `failwise` unless you choose another. It writes both into `meta.tracker`, with the host when it is not github.com and a published report address when one exists. `plan` and `apply` need an account that can push to the repository, and the repository must not be archived; `refresh` needs only read access.

## The three commands

- **`plan`** changes nothing. It prints the repository and its visibility, every issue it will create or link, every finding, and the digest `apply` takes.
- **`apply`** recomputes the plan, refuses a stale digest, and creates or adopts one issue per action, the label included. It writes each link into the analysis as soon as the item exists, creates nothing before you agree, and refuses a public or unknown-visibility repository without `--public-ok`.
- **`refresh`** reads every linked issue's state. A close as completed proposes Completed, and one as not planned proposes Not Implemented; Claude changes a status only on your confirmation. A finished action whose issue is still open is yours to close.

## What an item says

An item begins with the action's text, then six sections: **Where** names the element, function, conditions and people served; **The failure** gives the mode, trigger, effects, causes and controls; **Priority** gives the chain's priority and each rating's rationale and evidence; **This action** gives its owner, target date, status and sibling actions; **Done when** says how to finish it; **Reference** names the analysis, version, chain, action and key, and links to the chain when the report is published.

An item is written once: a later analysis change does not rewrite it, and items from an earlier plugin version keep their text.

## Caveats on GitHub

`apply` escapes the analysis text so GitHub interprets none of it, which puts invisible characters into the body; copied text does not match the analysis byte for byte. The issue listing can lag a new issue by seconds, so after an interrupted `apply`, wait before running `plan` again and remove the label from any duplicate.

## Jira Cloud

The same three commands work against a Jira Cloud project, through `acli`; the version tested is 1.3.39-stable. Claude gives you the sign-in command and you run it, so failwise never sees your token. With an API token in a file outside any repository:

```
acli jira auth login --site <host> --email <email> --token < token.txt
```

Delete it afterwards; `acli jira auth login --web` also works. When `acli` is signed in to another site, `track.ts` refuses and prints the `acli jira auth switch --site <host> --email <email>` command. `plan` and `apply` need an account that can create work items; `refresh` needs read access.

For Jira, `meta.tracker` holds the site as `host`, the project key and the label. It can hold the work type `apply` creates, `Task` unless you choose another, and the key of an Epic as `parent`; Claude recommends an Epic so Jira groups the items. Four differences follow.

- `apply` creates no label, because `track.ts` cannot tell who can see a Jira project; every target is unknown-visibility, so Claude asks first.
- `refresh` reads a work item closed as `Done` as done and proposes Completed, and one closed as `Won't Do` as dropped and proposes Not Implemented. Put your project's own close names in `meta.tracker.states` as `done` or `dropped` lists. A close under a name in neither list is reported as `closed-unclear`.
- A linked work item whose description no longer carries its action's key, or carries another's, is reported as `link-mismatch` and left alone. Check the link, and remove the action's `tracker` block by hand when it is wrong.
- `refresh` refuses a link to a work item on a site other than `host`; remove that link by hand too.
