# Process-side FMEA: the v1 stub

v1 ships no process branch: the analysis document's `branch` enum holds exactly one value, `DFMEA`, so a PFMEA request produces the answer in this file and no document. [skill-authored]
This file holds what the skill has on the process side, what it is missing, and the licensing that governs each piece. [skill-authored]
Load it when a user asks for a process, delivery, pipeline or operations FMEA. [skill-authored]

## The answer to a PFMEA request

Classical PFMEA analyses a manufacturing and assembly process, so its software-delivery reading is an adaptation and not a transfer. [paraphrased:C082]
v1 therefore answers a PFMEA request instead of running one. [skill-authored]
What is sourced is below: DORA's five delivery metrics, Google's Production Readiness Review named as a control-plan analog, Howie's incident-selection heuristics as revisit triggers, the limits on incident data as rating evidence, and the rule for actions carried over from a postmortem. [skill-authored]
What is missing is the four items in the next section, and none of them can be assembled from the evidence base. [skill-authored]
The offer that goes with the answer: run the design spine over the delivery pipeline's own components as elements — a build service, an artifact store, a deployment controller, a release gate are elements like any other — which analyses the pipeline without needing a canonical step list. [skill-authored]

## What a PFMEA branch needs that is not here

- A canonical delivery step list. [skill-authored]
- A 4M analog. [skill-authored]
- A reverse-FMEA analog. [skill-authored]
- A process failure catalog. [skill-authored]

No source in the evidence base supplies a delivery step list, so a process has nothing to be structured against the way a system structures a DFMEA. [skill-authored]
No record reaches a 4M grouping of process causes or a reverse-FMEA pass, so neither analog can be built without inventing one and calling it sourced. [skill-authored]
A process failure catalog would need rows about delivery steps; every catalog row the skill ships is a design-side row about a component. [skill-authored]
Building any of the four from the design-side evidence would produce untraceable content, which is the defect this plugin exists to avoid. [skill-authored]

## DORA's five delivery metrics

The current model has five metrics in two groups — three throughput metrics and two instability metrics — and it replaced the earlier four-keys model. [paraphrased:C006]

| Group | Metric | Provenance |
|---|---|---|
| Throughput | Change lead time | [sourced:C006] |
| Throughput | Deployment frequency | [sourced:C006] |
| Throughput | Failed deployment recovery time | [sourced:C006] |
| Instability | Change fail rate | [sourced:C006] |
| Instability | Deployment rework rate | [sourced:C006] |

Two of the five definitions are reproduced below; the other three metrics are named without one, because no record's quote carries their wording. [skill-authored]

- Change fail rate: The ratio of deployments that require immediate intervention following a deployment. Likely resulting in a rollback of the changes or a "hotfix" to quickly remediate any issues. [sourced:C007]
- Failed deployment recovery time: The time it takes to recover from a deployment that fails and requires immediate intervention. [sourced:C008]

MTTR is no longer one of the metrics: failed deployment recovery time replaced time to restore service and is scoped to recovery from a deployment that failed, not to incidents at large. [paraphrased:C008]
A skill mapping DORA onto detection or response timing must use that deployment-scoped reading rather than a general incident MTTR. [paraphrased:C008]
Change fail rate's denominator on the metrics guide is a deployment, while DORA's own 2024 survey instrument asks for a percentage of changes with a wider remediation set, so DORA's published percentile bands are not per-deployment and are not reusable as per-deployment thresholds. [paraphrased:C007]
A per-deployment ratio is nonetheless the shape an occurrence rating on a delivery step would need. [skill-authored]
The skill records that as a candidate and nothing more: no occurrence anchor in v1 rests on it, and a metric is evidence a rater cites in a rationale, never a score computed on their behalf. [skill-authored]
DORA here is DevOps Research and Assessment, not the EU Digital Operational Resilience Act. [skill-authored]

**CC BY 4.0 attribution for the metric names, the group headings and the two definitions above:** Nathen Harvey, "DORA's software delivery performance metrics", https://dora.dev/guides/dora-metrics/; licensor Google LLC; license CC BY 4.0, https://creativecommons.org/licenses/by/4.0/. [paraphrased:C010]
Indication of changes: the five metric names and the two definitions are reproduced unchanged; the two group labels in the table are shortened from the source's phrases "software delivery throughput" and "software delivery instability"; the table, its column headings and every other sentence in this section are this file's. [sourced:C006] [skill-authored]
The grant is per page because of the *unless otherwise specified* clause on dora.dev, and it was checked for the metrics page only. [paraphrased:C010]
Neither CC BY 4.0 nor Apache-2.0 grants trademark rights, so DORA, Google Cloud, Howie and PagerDuty are named here nominatively and never as branding or as a claim of endorsement. [paraphrased:C010] [paraphrased:C080]

## Production Readiness Review, cited as the control-plan analog

The Google SRE Book pages carry a CC BY-NC-ND 4.0 notice, and v1 treats every record from them as cite-only: this section names them for the concept and reproduces, paraphrases and adapts nothing. [cites:C020] [cites:C040]
Google's Production Readiness Review is the process-side control-plan analog that v1 names, and the record covers its position as the standard first engagement step, its stated objectives, and its stage sequence. [cites:C021]
A second record covers the team-maintained checklist the review's analysis stage runs from. [cites:C022]
A third covers the review taking a service's recent incidents, its postmortems and their follow-up tasks as inputs. [cites:C023]
A fourth covers Google's report that platform frameworks move readiness work from review into construction. [cites:C025]
The Launch Coordination Checklist records sit under the same restriction and are named the same way, for a tiered pre-launch prompt list, for release-process controls named as review topics on that checklist, and for meta-monitoring as its own review topic. [cites:C016] [cites:C018] [cites:C019]
What the skill takes from all of these is the shape and not the content: a readiness review is prior art for treating incident and postmortem records as an input to an analysis rather than as a rating, and for separating controls that prevent from controls that review. [skill-authored]

## Triggers for revisiting a process-side analysis

Howie is published under the Apache License 2.0, and its checklists may be reproduced and adapted with attribution and the license notice, so its incident-selection heuristics are reproduced below. [paraphrased:C080]
The guide states that no fixed rule decides which incidents deserve deeper analysis, and that the effort spent on one should track how much it might teach. [paraphrased:C077]
It offers the list as examples rather than as a complete one. [paraphrased:C077]

| Trigger | Provenance |
|---|---|
| There were multiple (> 2) teams involved | [sourced:C077] |
| A new service or interaction took part in the event | [sourced:C077] |
| It involved misuse of something that seemed simple or uninteresting (hint: there's usually more to dig into here (e.g., expired certs) | [sourced:C077] |
| The event involved a use case that was never thought of—indication of a surprise | [sourced:C077] |
| The event was almost really bad | [sourced:C077] |
| It looks like a repeat incident | [sourced:C077] |
| There is a lot of discussion around the incident | [sourced:C077] |
| There was confusion in or around the event | [sourced:C077] |
| The incident took place during an important event (e.g., an earnings call) | [sourced:C077] |

**Apache-2.0 attribution for the table above:** Howie: The Post-Incident Guide, https://howie-guide.pagerduty.com/, Copyright 2024 PagerDuty, Inc., licensed under the Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0; originally published by Dr. Laura Maguire, Nora Jones and Vanessa Huerta Granda in collaboration with the Jeli team, and rehomed by PagerDuty after it acquired Jeli in 2023. [paraphrased:C080]
Apache-2.0 §4 conditions reproduction on a copy of the license, retention of the copyright and attribution notices, and a statement of the changes made. [paraphrased:C080]
That license copy ships inside the skill at `licenses/APACHE-2.0.txt`, beside this `references/` directory, so the reproduced checklist and the license text travel together. [skill-authored]
Statement of changes: nine of the guide's ten examples are reproduced with their wording unchanged, including the source's own parenthetical asides; the tenth, an interest in investigating the incident further, is not carried; the table, its column heading and the sentences around it are this file's, and no item was added or reordered. [paraphrased:C077] [skill-authored]
The Howie repository carries no NOTICE file, so there is no NOTICE passthrough obligation. [paraphrased:C080]
Severity is one of several signals and not the sole gate, though the guide's home page does say that high-severity or very public incidents and serious near misses call for more of its tools. [paraphrased:C077]
The skill's use: an incident matching any row is a reason to revisit an analysis, and because v1 has no process branch the triggers are offered against the design branch's update mode. [skill-authored]

## Incident data that is not rating evidence

Incident duration is positively skewed rather than normally distributed, with most incidents resolved inside a couple of hours, so a mean such as MTTR does not represent the data and is unreliable as a measure of reliability. [paraphrased:C001]
Recorded severity has the same defect and is subjective besides, because a level is often assigned to draw attention to an incident rather than to record what it cost. [paraphrased:C003]
In place of one averaged number the VOID points to four kinds of input: the coordination an incident demanded, meaning the people, teams, tools and channels drawn in; how widely the write-ups and review meetings that follow incidents are read, attended and linked to; close calls; and service-level objectives read alongside what customers report. [paraphrased:C005]
Howie argues the same point from the other side, that the industry has over-indexed on error-reduction metrics such as mean time to respond at the expense of the insight each incident could yield — a stated position rather than an empirical result. [paraphrased:C079]
The rule that follows: a rating whose `evidence_kind` is `observed_incident` means an incident count over a stated window named in `evidence_ref`, and neither an averaged duration metric nor a recorded severity label satisfies it. [skill-authored]
An incident count is one evidence source that a rationale must accompany, never a score on its own. [skill-authored]

## Actions carried over from a postmortem

Howie fences learning off from action generation: the learning review is explicitly not about corrective actions, items generated inside such a review tend to be rushed and poorly thought through, and an implemented action item can itself become a contributing factor in a later incident. [paraphrased:C076]
A postmortem is therefore an input to an analysis and not a competing output: its contributing factors are candidate causes, the measures it records are candidate controls, and its action items are candidate actions. [skill-authored]
Expect narrative, unstructured text with plural contributing factors and no S, O or D fields, so extracting failure modes, causes and controls from it is the skill's work and not the postmortem's. [paraphrased:C078]
The guide moves away from both a single root cause and a linear detect-diagnose-repair sequence, and it counts root-cause analysis among the industry's legacy terms. [paraphrased:C078]
The skill therefore avoids root-cause wording when it interfaces with a team that works this way, and a single chain row can hold several causes in `causes[]`. [skill-authored]
An action carried over from a postmortem keeps the identifier of the incident it came from. [cites:C076] The skill stores it in the action's `source_incident` field, and the lint `seeded-action-without-incident` reports an action that carries none on a chain seeded from an incident. [skill-authored]

## The scope note: SAE J1739

SAE J1739 covers three kinds of FMEA — design, the supplemental MSR variant, and process — and scopes its process branch to manufacturing and assembly processes; the public abstract mentions software nowhere. [paraphrased:C082]
The record is J1739_202605: the January 2021 text, stabilised in May 2026 and typed by SAE as a Recommended Practice. [paraphrased:C082]
The standard supplies its own terms, rating charts and worksheets, and those sit inside the paid, copyrighted document, so nothing of them is available to this skill beyond a paraphrase with citation. [paraphrased:C083]
That is why the name PFMEA is used here with a note attached: a software-delivery process FMEA is an adaptation of the classical process branch, not a transfer of it, and no part of J1739's process framing is carried over unexamined. [skill-authored]

## Prior art on the process side

Applying FMEA to the software development process itself is not new: Georgieva's 2010 note in ACM SIGSOFT Software Engineering Notes proposes exactly that and demonstrates it with a tool. [paraphrased:C091]
The body is closed access, so the evidence base holds the abstract only and no method detail from it reaches this file. [paraphrased:C091]
The same abstract puts FMEA's standing in 2010 as established in traditional reliability analysis and unpopular in software engineering — the author's characterisation, not a survey result. [paraphrased:C094]
Prior art on the process side therefore exists and is thin, which is the second reason v1 ships a stub rather than a branch. [skill-authored]
