# Flow model acceptance note

**Date:** 2026-10-14
**Decided by:** not decided. The acceptance decision is the user's (plan B Step 6). This note is
committed on the branch under the gate ruling of 2026-10-13 in the local, git-ignored plan B ledger
(`.superpowers/sdd/2026-10-12-flow-model/progress.md`, line 156): "With a PR as the landing
mechanism, B3 Step 6's 'the acceptance note stays uncommitted until the user rules' is superseded: the
notes are committed on the branch, pushed, and the PR review is the ruling." The pull request's review
is the ruling.
**Design:** `docs/specs/2026-10-12-flow-model-design.md`, §11's eight criteria.
**Plans:** part A `docs/plans/2026-10-12-flow-model.md`; part B `docs/plans/2026-10-12-flow-model-evals.md`.
**Evidence:** the results note `docs/specs/2026-10-12-flow-model-eval-results.md` (B3 Step 4 of plan B,
committed with this note); `build/evals/flow-model/results.json`, `rulings-record.md`, `rulings-brief.md` and
`session-facts.md` (gitignored); the gate runs of 2026-10-14 listed under "The runners and the browser
checks".

This note records part B's evidence against the eight acceptance criteria of design §11 and leaves the
acceptance decision to the user. It is not a v1 acceptance under §15 of the main design,
`docs/specs/2026-09-07-fmea-software-design.md`, and it rules on nothing.

**The branch.** `flow-model` carries 41 commits over `main` (`git log --oneline main..flow-model`),
from `509536a` to `97261fc`. It leaves `main` at `41b8daa`, "Schema v3: runs over several codebases and
services (#29)", the commit `git merge-base main flow-model` returns. At the evidence runs the only entry
in `git status --short` was the untracked results note. When this note was written, `git status
--short` also listed `README.md` as modified: `git diff` shows plan B Step 4b's sentences for this
round in its evaluation record, uncommitted and made after the gates ran. The remote-tracking branch
`origin/flow-model` is at `1856a45`, and `git status -sb` shows `flow-model` 27 commits ahead of it.

| Subject prefix | Count | Commits |
|---|---|---|
| register | 3 | `509536a` (C161–C191), `c6f3cfc` (C192–C200), `92e8ebc` (C201) |
| spec | 10 | `8fd9f35`, `d535e0d`, `75888cf`, `a68f3f6`, `987d568`, `b0ff2f8`, `446b1d5`, `7a243da`, `fa54489`, `798a310` |
| plans | 1 | `1856a45` |
| Schema, Rules, Invariants | 4 | `66dad68`, `4874891`, `2e8078a`, `8dc3a1e` |
| Reference | 4 | `a61dd19`, `3ffe62f`, `dcdbb20`, `1eb035a` |
| Skill, Fixtures, Docs | 3 | `7550283`, `45dd774`, `82b6319` |
| Report, Tests | 4 | `6090b70`, `ff6f548`, `0766a5d`, `8c8551b` |
| Update mode | 3 | `c594c75`, `6fdd471`, `d2cf730` |
| Flow model | 1 | `d9c19db`, "close the final review's three findings and two minors" |
| Evals | 8 | `96802ed`, `9c4d483`, `37f22c9`, `ef17160`, `2fea11a`, `23eb1c4`, `0f64c18`, `97261fc` |

**The round of record.** `build/evals/flow-model/`, launched 2026-10-13 20:16:47 and finished about
21:22: twelve runs, prompts 1, 6 and 7 at the capabilities high and medium, two runs each. Every run used
`deepseek-flash` (DeepSeek V4.1-Flash through DeepSeek's Anthropic-compatible gateway) at
`--effort high` for both capability labels, as each run's `models.json` records. The round was judged
2026-10-13 21:29–21:43 under rubric 4 (workflow run `wf_c1e3b462-d11`), the user ruled on it the same
evening, and two criteria were re-judged on 2026-10-14 (`session-facts.md`). `results.json`'s `models`
field reads `{high: opus, medium: sonnet, low: haiku}`: that field records the judging table, not the
model under test.

## The runners and the browser checks

All at `97261fc` on 2026-10-14, under node v24.17.0, as the evidence report of that date gives them.

- `bun tools/run-tests.ts`: exit 0. skill: 30 files, tests 908, pass 908, fail 0. tools: 15 files,
  tests 283, pass 283, fail 0. Cancelled, skipped and todo are 0 in both suites.
- `bun tools/check.ts`: exit 0. tsc, oxlint and fallow ran. fallow reports dead files 0 of 117, dead
  exports 0 of 438, no duplication and 0 above threshold. Its output carries the line "WARN fallow:
  'node_modules' does not exist. [...] imports and dependencies can be misreported", and the run still
  exits 0.
- `node tools/check-browser.ts`: exit 0, "30 passed" on Chromium. The output has no `## not asserted`
  line. **Unverified:** the gate did not run on Firefox or WebKit.
- `node tools/compare.ts`: exit 0, "36 of 126 views changed against 41b8daa". The changed views are six
  parts at all six views (320, 375, 768, 1280 and 1920 px, and print): header, assumptions, lints,
  group-checkout, row-ch-5 and row-ch-9. Read from the markup of `build/compare/before.html` and
  `after.html`: ch-5 and ch-9 gain the chain annotation, and ch-9's carries the disjointness note; their
  two Severity rationales gain one sentence each, which is fixture content; the header moves the scales
  version from 1 to 2 and the warnings tile from 13 to 16, and its Contents line gains Flows; the
  assumptions gain the ch-9 disjointness entry; the lints gain three `flow-users-provisional` warnings.
  Rows ch-1 to ch-4 and ch-6 to ch-8 are byte-identical. **Unverified:** the comparison does not
  photograph the Flows section, because `SECTION_PARTS` in `dev/browser/matrix.ts:59` has no `flows`
  entry; the 36 before, after and difference images in `build/compare/changed/` were not viewed for this
  note's evidence; the comparison did not run on Firefox or WebKit.

## Acceptance criteria (§11)

| # | Subject | Verdict |
|---|---|---|
| 1 | Schema, invariants, lints, reviewer rules | Met; the lint-code sentence unverified (plan A's decision 5) |
| 2 | Scales, reference files, register | Met |
| 3 | `update-check.ts` | Met |
| 4 | The render | Met; three visual checks unverified |
| 5 | c16 and the flows stability predicate | Not met: met at high, not met at medium; the p6 flows predicate unverified |
| 6 | C201 and the provisional denominator | Met; the denominator stays provisional in every scored p1 and p7 run |
| 7 | DF3's readings and the multi-flow assumptions | Unverified; the golden fixture carries no coupling assumption |
| 8 | `SKILL.md`, the vocabulary label, the pins | Met |

**1. Met, except the lint-code sentence, which is unverified.** The schema (commit `66dad68`) reads
`"$id": "urn:fmea-software:schema:fmea:v3"` (`fmea.schema.json:3`); `properties.flows` carries
`minItems: 1`, and `$defs.chain.properties.flows` exists. The seven invariants (`4874891`, with
`2e8078a`) are in `INVARIANT_RULES`, which `invariants.test.ts:36` pins, and the four lints (`8dc3a1e`)
are in `MACHINE_RULES`; the skill suite passes 908 of 908. The three reviewer rules,
`chain-flow-effect-consistency`, `chain-flow-shared-provider` and `flow-referent-unsourced`, are rows
of kind `reviewer` at `quality-and-lint.md:253–255`, and `quality-and-lint.test.ts:40` pins the three
ids. The criterion says the lints fire "under the … lint codes". The lints carry no fault code and print
as `<severity> <rule>: <message>`, as the comparison's lints part shows (`warning
flow-users-provisional`). Plan A's decision 5, "The machine lints carry no fault code", records that
shape as a decision for the user at plan review; no file read for this note records the user's answer.
The sentence is not met as written and the departure is not recorded as accepted, so this note
records it as unverified.

**2. Met.** Commits `3ffe62f`, `a61dd19`, `dcdbb20` and `1eb035a`, with `d9c19db`'s carry-forward fix.
`scales-software.md:3` reads `scales version: 2`. Line 45 states DF3 as the redefinition: the reference
population is the named flow's where a chain names flows, the radius class is
`max(flow class, function class)`, the floor, a partial prefix that excludes the chain's function reads
subset with precedence over the flow's own class, and the reading holds "while the mode is active". The
checked sentence, line 51, reads "The anchor rows that name a radius class are 2 to 10 and each was
restated in referent terms; rating 1 names no radius class." Its wording pin,
`quality-and-lint.test.ts:58`, "scales-software.md restates every anchor row that names a radius
class, and its checked sentence lists exactly those rows", passes in the skill suite.
`quality-and-lint.md:99` restates `catastrophic-severity-anchor` over "the reference population — the
named flow's, where a chain names flows, the function's users otherwise". `design-inputs.md` item 1
(line 11) names the flow fields, and the file holds the granularity rule (line 31), the internal-only
rule (32), the async recipe with its consumer list (34), the `value_priority` field (35) and its three
criteria as tests a second rater can apply (37–39).
`methodology.md:88` maps the flow as "Operational context as a named path", with "phases and modes are
out of scope as document objects", and `methodology.md:120` records the safety boundary in §1's terms.
The register clause rests on a check written for this note: it collects every record id inside a
`sourced:`, `paraphrased:`, `adapted-from:` or `cites:` tag in `references/*.md` and `SKILL.md` (121
ids) and finds each one among the 201 ids that `provenance.md`'s register rows name. That check is not a
gate of this repository. The restricted-wording audit runs in the private repository's pre-push hook and
did not run for this note.

**3. Met.** Commits `c594c75` (the flow diff and the chain re-points), `6fdd471` (the removed-flow
guard) and `d2cf730` (the checker accepts any reason at or above the reach it computes). The passing
skill suite holds `update-check.test.ts:190`, "diffUpdate: a chain-named flow's users change reaches its
chain as flow-changed and marks nothing else"; `:197`, "diffUpdate: a chain's flows set change reaches
it as flow-changed, and a name or a tier change marks nothing"; `:240`, "a removed flow a chain still
names is refused and listed with the flows to re-point to"; `:250`, "a chain-named flow that lost its
last non-catalog source is refused by the same guard"; and `:288`, "stale-reason: a row reached by a
flow change accepts flow-changed and every reason above it, and refuses the ones below". The tests pin
the name and tier cases of "nothing on the other field changes"; for `steps`, `steps_partial`,
`sources` and `users.review` the evidence is a reading of `lib/update-diff.ts:197`, which marks a
chain only on a `users` change, and `SKILL.md:94`. In the round, the p7 judges ran
`update-check.ts` on the fixture pair: its stale section derives ch-2 from "flow flow-resume changed
users" (the p7 medium run 1 judge), and the document records ch-2 as `function-changed` by the
precedence order (the p7 high run 1 judge). Design §8.1 asks that this be stated: on prompt 7,
`flow-changed` is masked on ch-2 by `function-changed`, so `expected-stale.json` and c12 band 2 stay
unchanged, and `flow-changed`, both the `users`-change trigger and the chain re-point trigger, is
covered end to end only by the `update-check` unit tests. c12 scores 2 on the three scored p7 runs
(`results.json`).

**4. Met**, on Chromium and in the markup; three checks are unverified. Commits `6090b70` (the Flows
section, its legend and its provisional marker), `ff6f548` (the chain names the flows it breaks and
marks the one that set the band) and `0766a5d`. The report the comparison renders from the checkout
fixture, `build/compare/after.html`, holds `<section id="flows">` and a Contents link to `#flows`. Its
legend reads "Priority here is a flow-value priority label: not a rating, not a criticality analysis,
not a safety or hazard analysis, and not a reliability target." Its order line reads "One row per flow,
High first then by id, a presentational order that ranks nothing." Each of the three flows carries the
provisional marker, and the section ends "A chain-named flow whose population has not been re-scored is
marked provisional; the Severity of the rows that rest on it, and the priority that follows, are not
final." The ch-5 annotation names `flow-resume` and marks it as the flow whose band was used. The ch-9
annotation marks `flow-checkout` as that flow, names `flow-retry`, and adds "The named flows are treated
as disjoint and their union is not computed; the band is the highest of the single flows' classes." The
fixture carries flows, so it cannot show the empty state; `render.test.ts:195`, "the Flows section has
its empty state, and a partial flow renders its phrase", asserts `No flows recorded.`, and
`render.test.ts:189` asserts that the legend prints DF4's sentence verbatim. Both are in the passing
skill suite, and the browser gate passes on Chromium. **Unverified:** the comparison does not
photograph the Flows section; the 36 changed images were not viewed; the gate and the comparison did
not run on Firefox or WebKit.

**5. Not met.** Plan B Step 5 names three verdicts, met, unverified and not applicable; a measured
failure fits none of them, so this note records it as not met. It is met at high and not met at
medium. c16 scores 2 on both p1 high runs and on p1 medium run 2, and 1 on p1 medium run 1
(`results.json`): no chain of that run names both `flow-checkout` and `flow-retry`, so the first
chain-naming condition fails, and ruling 9 leaves the score standing. The flows stability predicate is `pass` at Jaccard 1.000 with `verified: true` on both
p1 pairs. On both p6 pairs neither run carries flows, legitimately, because `legacy-rpn-sheet.csv`
names no critical flows; the predicate is `unverified` with `verified: false`, and this note records
both p6 predicates as unverified, never as a pass. The maxima and the threshold: `rubric.md:9` reads
"Under rubric 4, prompt 1 adds c16 (maximum 28, 8 musts); prompts 6 and 7 are unchanged (prompt 6
maximum 24, 8 musts; prompt 7 maximum 22, 9 musts)." and `rubric.md:242` lists "23 of 28, since 22.4
rounds up". `tools/eval-report.ts:62` and `tools/workflows/evals.js:167` carry the c16 entry, not a
must, for prompt 1 only, at rubric 4; `evals.js:145` reads `const RUBRIC = 4`; `eval-report.ts:558`
applies the 80% rule as `5 * total >= 4 * max`. `eval-report.test.ts:33`, `:336` and `:344` pin the
criterion count, the 23-of-28 sentence and the rubric number, and the tools suite passes 283 of 283
(commits `96802ed`, `9c4d483`, `37f22c9`). The results note prints the maxima 28, 24 and 22.

**6. Met**, and this note says what the criterion asks it to say: the Severity denominator stays
provisional in every scored p1 and p7 run. `design-inputs.md:35` defines `value_priority` and lines
37–39 state its three criteria, each tagged `[paraphrased:C201]`; `methodology.md:111`, the tier's row,
also cites C201. The schema's `value_priority` description carries DF4's sentence and no record id.
C201's register row is `provenance.md:128`. In commit order C201 first enters `skills/` with that row
(`92e8ebc`, 2026-10-12 23:10), before the commits that cite it (`dcdbb20`, `1eb035a` and `6090b70`, all
2026-10-13), as `git log -S C201 main..flow-model -- skills` shows. Design §7 records C201 admitted
`confirmed`. C196 and C198 appear only as register rows (`provenance.md:123` and `:125`); no other
reference file names them. `flow-users-review-by-date`, scoped by design §4.3 to a chain-named flow, is
tested at `invariants.test.ts:217`, "flow-users-review-by-date wants by and date on a chain-named flow's
rescored or authored review", in the passing skill suite (commit `4874891`). The provisional half: the
checkout fixture's three flows carry no `users.review`, so its report marks each flow provisional, as
criterion 4 quotes, and its lints carry three `flow-users-provisional` warnings. In the round every
scored p1 and p7 run carries `flow-users-provisional` warnings (the completeness critic, results note;
each run's `validate.json`, read for this note).

**7. Unverified.** The readings half is met. `DF3_READINGS` in
`skills/fmea-software/scripts/test-helpers.ts:335` holds seven documents, each stating the band it must
produce, from "the function fallback, the chain naming no flow" (band 8) to "a flow whose population is
one named client, read at majority" (band 9). `validate.test.ts:519` and `render.test.ts:254` run every
one, in the passing skill suite (commit `8c8551b`). That covers the criterion under either count (see
"Erratum"). The disjointness half is met on the golden fixture: `checkout-service.fmea.json`
`meta.assumptions[2]` is its own entry, owner `user`, status `open`, and reads "ch-9 names the flows
flow-checkout and flow-retry; their populations are treated as disjoint and their union is not
computed, [...]". That the run writes it "with the ground rules and before any chain row" is a run-time
order that no document shows; `SKILL.md:38` states the rule, and no tool checks it. The coupling half is
not shown. `chain-flow-shared-provider` is a documented reviewer rule (`quality-and-lint.md:254`;
`lints.test.ts:681`) that applies "When a chain names more than one flow and their `steps` share a
provider function or element across steps". In the golden fixture ch-9 names `flow-checkout` (steps
`fn-checkout-order`, `fn-pricing-quote`, `fn-gateway-authorize`, `fn-store-persist`) and `flow-retry`
(steps `fn-checkout-order`, `fn-gateway-authorize`), which share two steps, and `meta.assumptions[]`
holds three entries with no coupling assumption among them; the comparison's assumptions part shows
only the disjointness entry as new. By the rule's text the fixture is short of that assumption. This is
a finding of this note's reading, and no check made it. Plan A's A16 Step 8 judge was to read this
criterion, and no file read for this note records its verdict.

**8. Met.** Commit `7550283` (the flow model in the spine and the update mode), with `d9c19db`.
`SKILL.md` step 1 collects the critical flows "in that same pass" (line 35); step 2 writes each flow into
`flows[]` (36); step 3 fills each flow's `steps` "after this step" (37); step 4 has a chain name the
flows it breaks in `chains[].flows` (38); step 5 reads the blast radius over a named flow's referent
population (39). The Update-mode section carries the precedence order (92), the `flow-changed`
triggers (93) and the S-only re-read with O and D carried forward (95). The label "stale reason set v2"
is at `SKILL.md:92` and `quality-and-lint.md:262`. The DF4 pins are `schema.test.ts:417` and
`render.test.ts:189`, with `quality-and-lint.test.ts:79`, and the skill suite passes 908 of 908.

## The round's results

From the results note and `results.json`, after the re-judging of 2026-10-14.

| Prompt | Capability | Run | Total / max | Musts at 2 | Result | Criteria below 2 |
|---|---|---|---|---|---|---|
| 1 | high | 1 | 23 / 28 | 6 / 8 | FAIL | c1 0, c2 1, c3 0 |
| 1 | high | 2 | 25 / 28 | 7 / 8 | FAIL | c1 0, c3 1 |
| 1 | medium | 1 | 23 / 28 | 7 / 8 | FAIL | c1 0, c3 0, c16 1 |
| 1 | medium | 2 | 25 / 28 | 7 / 8 | FAIL | c2 1, c3 0 |
| 6 | high | 1 | 21 / 24 | 8 / 8 | pass | c13 1, c14 0 |
| 6 | high | 2 | 20 / 24 | 7 / 8 | FAIL | c11 1, c13 1, c14 0 |
| 6 | medium | 1 | 21 / 24 | 8 / 8 | pass | c13 1, c14 0 |
| 6 | medium | 2 | 20 / 24 | 7 / 8 | FAIL | c11 1, c13 1, c14 0 |
| 7 | high | 1 | 21 / 22 | 8 / 9 | FAIL | c5 1 |
| 7 | high | 2 | 22 / 22 | 9 / 9 | pass | none |
| 7 | medium | 1 | not scored | — | UNVERIFIED | none scored: the run left no `report.html` |
| 7 | medium | 2 | 22 / 22 | 9 / 9 | pass | none |

| Prompt | Capability | Jaccard | Max rows | Bound | Count diffs | Typing | Flows | Stability |
|---|---|---|---|---|---|---|---|---|
| 1 | high | 1.000 | 12 | 2.400 | H 2, M 1, L 0 | 6/6 pass | 1.000 pass | pass |
| 1 | medium | 1.000 | 14 | 2.800 | H 1, M 0, L 0 | 6/6 pass | 1.000 pass | pass |
| 6 | high | 1.000 | 4 | 0.800 | H 0, M 0, L 0 | 4/4 pass | 1.000 unverified | UNVERIFIED |
| 6 | medium | 1.000 | 4 | 0.800 | H 0, M 0, L 0 | 4/4 pass | 1.000 unverified | UNVERIFIED |
| 7 | high | 1.000 | 6 | 1.200 | H 0, M 0, L 0 | 6/6 pass | 1.000 pass | pass |
| 7 | medium | 1.000 | 7 | 1.400 | H 1, M 1, L 0 | 6/6 pass | 1.000 pass | pass, carried as unverified below |

| Prompt | Capability | Run 1 | Run 2 | Stability | Pair |
|---|---|---|---|---|---|
| 1 | high | FAIL | FAIL | pass | FAIL |
| 1 | medium | FAIL | FAIL | pass | FAIL |
| 6 | high | pass | FAIL | UNVERIFIED | UNVERIFIED |
| 6 | medium | pass | FAIL | UNVERIFIED | UNVERIFIED |
| 7 | high | FAIL | pass | pass | FAIL |
| 7 | medium | UNVERIFIED | pass | pass | UNVERIFIED |

**No pair passes.** Of six pairs, three fail and three are unverified. Four of the eleven scored runs
pass, and one run is not scored. No reading of any item makes every pair pass (`rulings-brief.md`,
"What no reading changes").

What decides each pair, from `rulings-record.md` ("What follows") and the brief's "What no reading
changes":

- **(1, high), FAIL.** Both runs score the must c1 = 0 under every reading: neither records pricing's
  scaling limit as an open assumption. Run 1 also scores the must c2 = 1, which ruling 7 keeps.
- **(1, medium), FAIL.** Run 1 scores c1 = 0 under every reading. Run 2 scores c1 = 2 under ruling 6 and
  fails on the must c2 = 1, which ruling 7 keeps.
- **(6, high), UNVERIFIED.** The flows predicate is unverified because neither run carries flows
  (ruling 3). Beside it, run 2 is a measured FAIL on the must c11 = 1: its `meta.history` does not record
  the row-2 rationale substitution, which sits only in `meta.assumptions[5]` (ruling 5). Run 1 passes,
  its substitute text being the template ruling 5 prescribes.
- **(6, medium), UNVERIFIED.** The same flows predicate. Beside it, run 2 is a measured FAIL on
  c11 = 1: it records the substitution nowhere, so this pair never passes under any reading. Run 1
  passes under every reading.
- **(7, high), FAIL.** Run 1 scores the must c5 = 1 after the re-judging under ruling 1: its final
  message names ch-6's priority "M", and no statement in the message covers that priority. Run 2 passes
  at 22 of 22.
- **(7, medium), UNVERIFIED.** Run 1 left no `report.html` and is not scored (ruling 2). Run 2 passes at
  22 of 22. The stability entry reads `pass` and `verified: true`, but one side of it is run 1, whose
  priorities were written by hand; the critic carries that verdict as unverified, and so does this note.

**The unverified list.** Each is a hole in the evidence and never a pass:

- the judgement of p7 medium run 1, which scored none of the prompt's 11 criteria (`results.json`
  `unverified[]`);
- the flows predicate of the (6, high) and (6, medium) stability pairs (`results.json` `stability[]`,
  `unverified: true`), which the results note's "Unverified units" list omits;
- the (7, medium) stability verdict, one side of which is the unscored run;
- the prompt-5 pairs, which this round did not re-run;
- the check the three `STALE_*` rosters carry (below);
- the browser gate and the comparison on Firefox and WebKit;
- the Flows section in the comparison, which owes it no view, and the 36 changed images, which were not
  viewed;
- §11 criterion 7's coupling half and its write-order half;
- the restricted-wording audit of the private repository, which did not run for this note;
- plan A's A16 Step 8 acceptance judge, whose run and verdict no file read for this note records;
- §11 criterion 1's lint-code sentence, which rests on plan A's decision 5, whose answer no file read
  for this note records;
- the tiers of plan B's B1 and B2, which no file read for this note states ("Tiers");
- the four deferrals of design §9 ("Deferrals left to later work").

**Checks that could not be evaluated.** The results note names three pre-ruling score rosters in
`tools/eval-report.ts`, `STALE_C1_RUNS`, `STALE_C3_RUNS` and `STALE_C5_RUNS`, each with 4 entries keyed
on the capabilities `opus` and `sonnet`, that match no run of this round. They state nothing about this
round's scores; this round's re-judging is recorded in `results.json`'s `rejudged[]` instead. The check
those rosters carry did not run, and the ruling on them is the user's.

**What the round did not measure.** c9 is vacuous on all four p6 runs and both p7 high runs, which carry
no `catalog_refs` (the critic, results note). Both capability labels were filled by one model at one
effort, so the two-capability axis of design §10 was not exercised (see "Harness findings").

**Earlier rounds, measured and never judged** (`session-facts.md`):

- **The capped round**, `build/evals/flow-model.capped/`, run 2026-10-13 10:13–11:38 plus a p1 re-run
  that evening, on the same roster and model. Every run ran with the CLI's default 200k context window,
  because Claude Code does not know `deepseek-flash`; 13 of 16 runs auto-compacted near 167k tokens, and
  four drafted their whole analysis after a compaction (p1 medium run 2, p7 medium run 1, p7 medium run 2,
  p7 high run 2). Measured, never judged: p1 high stability pass; p1 medium stability fail on the M
  count (difference 5 against a bound of 4.4; element Jaccard 0.857; flows 1); p7 medium stability pass;
  both p6 pairs unverified by design (no flows); p7 high unverified, because its run 2 wrote neither
  output file after concluding that all of Bash was denied.
- **The first p1 runs**, `build/evals/flow-model.superseded/p1/`, run 2026-10-13 in the morning on an
  input that stated no flow ids or tiers, so every run minted its own ids. Measured, never judged: p1 high
  stability failed on counts (H difference 4 against a bound of 3.2) and on flow ids; p1 medium failed on
  flow ids only. Commit `23eb1c4` made the input state each flow's id and tier before any run was judged
  under rubric 4, and the p1 cells were re-run.

**Prompt 5 was not re-run.** `results.json` `not_rerun` gives the reason; see "Pairs this round did not
re-run".

## Rulings

The user took nine rulings on 2026-10-13, one at a time, in the brief's order (`rulings-record.md`).

**1. c5, third clause (prompt 7): lenient.** One statement in the final message that priorities are
not final until the ratings are re-scored covers every priority the message names, and the report's own
provisional marking covers the report; a re-run step named after the re-scoring counts as that
statement. Effect: p7 high run 1 c5 2 → 1 (FAIL), p7 high run 2 1 → 2 (pass), p7 medium run 2 stays 2;
the p7 high pair still fails. Written into `rubric.md` in `0f64c18` and re-judged.

**2. p7 medium run 1, no `report.html`: leave unverified; re-run after the harness fix.** The cause:
`bun` was denied by the allow list, the run never tried `node` on its own, and the user's global
`CLAUDE.md` leaked into the run. The cell is re-run only after runs get a separate `CLAUDE_CONFIG_DIR`.
No re-run now. Recorded in this note.

**3. p6 pairs under the flows predicate: keep unverified and state the c11 failures beside them.**
Design §11 criterion 5 decides the case. No rubric, tool or test change this round. Recorded in this
note, under criterion 5 and "What decides each pair".

**4. The stability rule (`rubric.md` line 236 when ruled) on prompts whose inputs name no flows: amend
for the next round, with a not-applicable state.** On such a prompt the flows predicate is not
applicable and the pair is judged on the element and count predicates; `eval-stability.ts` gains a
fourth flows state, `not_applicable`, set from a per-prompt flag the workflow passes, distinct from
`unverified`. Effective from the next round; this round's p6 pairs stay unverified as ruled in 3. Not
yet made: a follow-up.

**5. c11, where the substitution is recorded and its text: history-strict, text as a template.**
`meta.history` itself records the rationale substitution with its row count, and an open assumption does
not stand in for it. The substitute text is the template `converted from <sheet file name>; no rationale
recorded`, so the path the run was given the sheet under is the prescribed text. Effect: no score
changes. Written into `rubric.md` in `0f64c18`.

**6. c1, a field value beside an open assumption: instead-scoped.** The 0 is for a run that writes a
field value instead of recording the assumption and the question. A placeholder in words beside an open
user-owned assumption and a final-message question states no fact and is not 0; a field value with no
assumption is 0, and a gap recorded nowhere is 0. Effect: no score changes (p1 medium run 2 keeps 2; the
other three p1 runs stay 0). Written into `rubric.md` in `0f64c18`.

**7. c2, repository refs to repositories the run was not given: keep strict.** A repository the run did
not read is not among the things a supplied ref points at, and band 1 counts "at least one ref". Effect:
no score changes (p1 high run 1 and p1 medium run 2 keep c2 = 1). No rubric change.

**8. c3, causes that restate the failure mode: literal, counted the refuter's way.** A cause that only
repeats the mode's own because-clause restates it, whether or not it came from the catalog. One counting
rule now says what a restatement is and where a borderline chain falls. Effect: p1 totals 23, 25, 23
and 25 of 28; no pass changes, c3 not being a must. Written into `rubric.md` in `0f64c18` and
re-judged.

**9. c16, third condition: keep as written; a slow or partial end effect breaks the flow.** `SKILL.md`
line 38 says a chain names the flows it breaks, and `scales-software.md` line 43 lists a slow or partial
result among the five effect classes. Effect: no score changes; the ruling keeps p1 medium run 2's c16
at 2 (`rulings-brief.md`, item 9). No rubric change.

**Threshold changes: none.** No ruling moves the stability Jaccard floor (0.8), the count bound, the 80%
rule or a must flag, and the rubric stays at version 4. Four criteria's text changed in `0f64c18`, each
marked as made after the round was judged: c1 (ruling 6), c3 (ruling 8), c5 (ruling 1) and c11
(ruling 5). Four Opus agents drafted them, each checked by an Opus skeptic, and the session made two
wording edits. Ruling 4's `not_applicable` state changes the stability predicate from the next round
and is not yet made.

**The re-judging.** `tools/workflows/rejudge.js` (commit `97261fc`) re-judges one criterion on named runs
of a named round and writes nothing itself. On 2026-10-14 seven Opus judges ran under it, with 0 Fable,
and every judge returned on the first attempt: `wf_47c23c2d-d74` for c5 and `wf_aeea3ccf-899` for c3.
Seven score entries were re-judged, and six changed value:

- c5: p7 high run 1 2 → 1; p7 high run 2 1 → 2; p7 medium run 2 stays 2.
- c3: p1 high run 1 1 → 0 (3 of 11 chains); p1 high run 2 2 → 1 (3 of 12, on the quarter line); p1
  medium run 1 1 → 0 (4 of 14); p1 medium run 2 1 → 0 (6 of 13).

Two run results moved, p7 high run 1 from pass to FAIL and p7 high run 2 from FAIL to pass. No pair
outcome moved, and both criteria match the brief's expected outcomes. A session script merged the
judges' returned objects, `rejudge-c5-20261014.json` and `rejudge-c3-20261014.json`, into
`results.json`; `results.pre-rulings.json` is the file before the merge. A comparison of the two files
made for this note finds that the seven score entries and the seven runs' notes moved, that `total`
moved on the six runs whose score changed and `musts_at_2` and `pass` on the two p7 high runs, that
`rejudged[]` with its two entries is new, and that `stability`, `critic`, `unverified`, `not_rerun`,
`models` and `rubric` are unchanged. `rulings-record.md` ("Applied") names only the score entries, the
notes and `rejudged[]`; the derived fields are the difference. The critic ran before the re-judging,
so its entries that quote a c3 or c5 score describe scores the tables no longer carry (results note,
"What the critic ran before").

**A reading not yet ruled on.** The c5 judge of p7 high run 1 flagged it (`rulings-record.md`,
"Applied"). The run prefixed the rationale text of four carried-forward, already re-scored ratings
(ch-2 O and D, ch-4 S and O) with "Carried forward from the last re-score:" and changed neither their
value nor their review status. The judge did not count them as ratings the run authored. A stricter
reading counts them as authored, and band 0 then applies. The run fails on the must c5 under either
reading, so the reading moves no result in this round. The ruling is the user's.

**The critic's blocking candidates** (results note, "Blocking candidates"), and where each went:

| # | Candidate | Where it went |
|---|---|---|
| 1 | None of the six pairs passes. | "The round's results"; the decision on each pair is the user's. |
| 2 | Prompt 1 fails the must c1 in 3 of 4 runs: fix the skill's elicitation or change c1's reading. | Ruling 6; no score moved; a skill finding. |
| 3 | c2's band for a repository ref the inputs list but did not supply. | Ruling 7, keep strict. |
| 4 | p1 medium run 2's c1 = 2 beside the `limits` field value. | Ruling 6; c1 stays 2. |
| 5 | The flows predicate is unverified by construction on prompt 6. | Ruling 3 for this round; ruling 4 for the next. |
| 6 | All four p6 runs typed the payment gateway `in_scope`. | Not ruled; a skill finding. |
| 7 | c11 on the p6 run 2s, and the path prefix on p6 high run 1. | Ruling 5. |
| 8 | The two p7 high judges read c5 differently. | Ruling 1; re-judged. The scores the critic quotes for these runs are superseded. |
| 9 | p7 medium run 1 is unverified because `bun` was denied. | Ruling 2; a follow-up. |
| 10 | Eleven of twelve transcripts apply the user's private `CLAUDE.md`: are the runs valid evidence? | Not ruled in `rulings-record.md`; a harness finding; part of the user's re-run decision. |
| 11 | Both capability labels were `deepseek-flash`: do the runs count? | Not ruled in `rulings-record.md`; a harness finding; part of the user's re-run decision. |
| 12 | §11 criterion 5 is unmet. | Criterion 5 above. |
| 13 | `cat-dependency-01`'s cause column against c3. | Ruling 8; a skill finding; a follow-up. |
| 14 | The p7 update summaries leave out inventory controls. | Not ruled; a skill finding. |

## Skill findings

- The planted gap, pricing's scaling limit, is not recorded as an open assumption in 3 of the 4 p1 runs;
  with the multi-codebase round that is 4 of the last 6 prompt-1 runs. It fails both p1 pairs under
  every reading.
- Runs cite repositories they never read as element sources (p1 high run 1 and p1 medium run 2). p1
  medium run 2's own assumption says "the commit each element was read at is unrecorded", and no
  transcript shows an attempt to read one.
- p7 high run 1 names a priority, ch-6's "M", with no tie to its provisional ratings.
- Both p6 run 2s leave the rationale substitution out of `meta.history`; p6 medium run 2 records it
  nowhere while its final message claims every substitution is recorded.
- `cat-dependency-01`'s cause column restates its own mode, and the runs copy it. The c3 judges add
  that the counted causes are near-copies of catalog rows (`cat-dependency-01`, `cat-security-02`,
  `cat-security-03`, `cat-security-04`), and that drivers often sit in the chain's `trigger` field, which
  c3 does not read.
- p1 medium run 1's `ch-retry-amplification` has the end effect "Checkout returns no confirmation to any
  submitting shopper" and names only `flow-retry`.
- All four p6 runs typed the payment gateway `in_scope` (c13 = 1, c14 = 0); Opus typed it `third_party`
  in the multi-codebase round.
- The p7 update summaries leave out inventory controls: p7 high run 2 leaves out settlement
  reconciliation, p7 medium run 2 leaves out two of the four, and all four p7 runs leave ch-1 with no
  control at D 9 or 10 (the critic, results note).
- In the superseded p1 runs, no run recorded the missing flow tier as an open assumption, which is
  `SKILL.md`'s rule for a missing input; that is why the input now states the tiers.
- In the superseded p1 runs, the medium runs rated `flow-retry` Medium where the user's intent was High.
- Found while writing this note: the golden fixture's ch-9 carries no coupling assumption although its
  two flows share steps (criterion 7).

## Harness findings

From `session-facts.md`, except the last two, whose sources are named.

- The user's global `~/.claude/CLAUDE.md` reached eleven of the twelve runs, every one but p7 medium
  run 2: `tools/run-eval.sh` runs the CLI without `--bare`, so the user's own rules entered the runs.
  Eleven runs tried `bun` at least once; `bun` is not on the allow list (`Bash(node *)` is), so those
  calls were denied with "Permission to use Bash has been denied". p7 medium run 1 never tried `node`
  on its own, concluded every interpreter was refused, wrote `analysis.json` by hand and no report, and
  is unverified. The fix, a separate `CLAUDE_CONFIG_DIR` for eval runs, is not yet made.
- Both capability labels were filled by the same model at the same effort, so the two-capability axis of
  design §10 was not exercised. `results.json`'s `models` field still reads the default table because
  that field records the judging table; each run's `models.json` records the model under test.
- `tools/eval-report.ts` display defects seen in the results note: an unscored run renders as
  "0 / 22 | 0 / 9 | UNVERIFIED"; the "Unverified units" heading says those agents "never returned",
  although the p7 medium run 1 judge returned and declined to score; a pair with a measured FAIL in one
  run and an unverified stability check renders UNVERIFIED, which hides the failure (both p6 pairs); the
  Unverified-units list omits the two p6 stability pairs; the critic wrote "fail stability" for pairs the
  tables mark UNVERIFIED.
- The stability and persist phases of `evals.js` are agents only because a Workflow script cannot run a
  command; moving stability into a script step is a follow-up.
- Fixed before the round of record: the capped round ran every run at the CLI's default 200k window, as
  "Earlier rounds" records. The fix is `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000` and a gate in the round
  scripts that refuses unless `claude -p "/autocompact"` reports the 786.4k window uncapped; a probe sent
  800,061 tokens through the gateway and the model read both ends.
- The comparison owes no view of the Flows section, because `SECTION_PARTS` in
  `dev/browser/matrix.ts:59` has no `flows` entry (the evidence report of 2026-10-14).
- The three `STALE_*` rosters in `tools/eval-report.ts` are keyed on the capabilities `opus` and
  `sonnet` and match no run of this round (the results note, "Checks that could not be evaluated").

## Board note (DF6)

Only the blast-radius denominator definition moved. DF3 reads Severity's blast radius over the affected
population of the flows a chain names, with the class the chain reads with no flow named as its floor,
and it adds no rating scale and moves no band cut (DF1). No rating is changed by this design. Because DF3
changes how an anchor reads, the scales version moves from 1 to 2 (`scales-software.md:3`), and by the
existing rule a version gap marks every rated row `scales-version` and re-reads all three factors on the
next update; DF6 calls this "the rule working as written, not a side effect to route around". The
mandated re-read may move S, because the population S is read over can now be a named flow's. O and D
are re-opened for re-read and not for a change of factor: nothing in this design changes how Occurrence
or Detection is computed (§1), and `scales-software.md:137` states that "no other factor moves".

## Deferrals left to later work

Design §9 opens: "Recorded so it is not silently dropped, none of it blocks v1:". Each of its four items
is **unverified**: this design does not build it, and no check covers it.

- **The typed broker node:** "Typed flow steps (function / element / external / broker node), and typed
  fan-out/broker nodes that model an event-driven flow as a branching DAG rather than a line", which §9
  calls "now the most important of these". DF2 and §4.4 point to it, and it is what would make the
  second half of `flow-referent-unsourced` checkable.
- **The aggregate:** "Computing the **aggregate** blast radius of several named flows", which the design
  "deliberately does not compute (DF3, §4.2)"; §10 lists it as out of scope.
- **The positional steps marker:** "A positional "steps continue past this step" marker, replacing the
  whole-flow `steps_partial` boolean where the author needs finer grain."
- **The per-flow contract string:** "An optional `outcome`/contract string per flow (the RCM/JA1011
  pattern, A-C10), recording what the flow delivers to its users."

§8 names no deferral: a search of its lines for later, defer, §9, future, follow-up and "out of scope"
finds nothing.

## Pairs this round did not re-run

Prompt 5, at high and at medium. `results.json` `not_rerun` records the reason: "rubric 4 adds no
criterion prompt 5 is scored on: its postmortem-seeded baseline is scored on c1 to c10 only, the
convention that keeps c13, c14 and c16 off it. It reads checkout-inputs.md, whose Critical flows section
this branch turned into a table of ids and tiers (23eb1c4), so its last scores predate that input." No
result of an earlier round stands in for the prompt-5 pairs, which are unverified by this round. The
acceptance decision on every pair, the six this round scored and the two it did not re-run, is the
user's.

## Erratum

§11 criterion 7 says "DF3's five readings" while §8.2 lists seven, and plan A's task A15 and commit
`8c8551b` cover the seven, so the criterion is covered under either count.

## Tiers

Runs: `deepseek-flash` (DeepSeek V4.1-Flash) at effort high for both capability labels; judging (`wf_c1e3b462-d11`): 12 Opus judges, 1 Opus completeness critic, 6 Sonnet stability agents, 1 Sonnet persist agent; rulings brief (`wf_0161946f-138`): 7 Opus analysts, 7 Opus refuters, 1 Opus synthesis; rubric amendments (`wf_3e072835-2cf`): 4 Opus drafters, each checked by an Opus skeptic; `rejudge.js` (`wf_9503f5be-320`): 1 Opus writer, 1 Opus reviewer; re-judging (`wf_47c23c2d-d74`, `wf_aeea3ccf-899`): 7 Opus judges; results note (B3 Step 4): generated by `tools/eval-report.ts`, no model; B1 and B2: tier not stated in the files read for this note; B3 Steps 4b and 5 (`wf_cc77f89f-0a0`): 1 Opus evidence agent, then 1 Opus drafter and 1 Opus reviewer per document (the README record and this note); controller: Claude Opus 5.5 through the judging and the rulings brief, Claude Fable 5.1 from the rulings onward; top-tier (Fable) subagent calls in part B: 0; plan A's A16 Step 8 acceptance judge: unverified, because no file read for this note records whether it ran or what it found.

Plan B's Global Constraints state that "no planning or review agent is dispatched in this plan". The
rulings brief's analysts and refuters, the amendments' skeptics, the `rejudge.js` reviewer and the
reviewer of this note ran after the round was judged, all at the Opus tier and none at the top tier.

## Decisions for the user

1. **Whether the three revision decisions stand.** The `value_priority` rename: DF4 in §2 ("named
   `value_priority`") and §12 ("the `criticality` → `value_priority` rename with both disclaimers"). The
   `max(flow, function)` floor: DF3 in §2 ("the radius class is `max(flow class, function class)` — the
   **floor**") and §12 ("the composition rule stated as **replacement with a floor**"). The
   worst-single-flow relabel: DF3 in §2 ("the **worst-single-flow** reading, not a worst-credible one")
   and §12 ("the relabel to **worst-single-flow**").
2. **Whether to re-run prompt 5 and the other pairs:** p7 medium run 1 after the `CLAUDE_CONFIG_DIR` fix
   (ruling 2), and the p6 pairs under ruling 4's `not_applicable` state; and whether this round's runs
   stand as evidence, given the `CLAUDE.md` leak and one model at both capabilities (the critic's
   candidates 10 and 11, not ruled).
3. **Whether to merge `flow-model` to `main`.**
4. **Whether to push.**
5. **The open items this note names as the user's:** plan A's decision 5 (criterion 1's lint-code
   sentence), the golden fixture's missing coupling assumption (criterion 7), the stricter reading of
   c5 ("A reading not yet ruled on") and the three `STALE_*` rosters.

By the remote-tracking branch, the 27 commits after `1856a45` are not pushed. This note opens no pull
request; whether one exists is not checked for this note.

## Follow-ups agreed, not yet made

From `session-facts.md`:

- ruling 4's `not_applicable` flows state: `rubric.md` (line ~232), `eval-stability.ts`, `evals.js`,
  `eval-report.ts` and their tests;
- a separate `CLAUDE_CONFIG_DIR` for eval runs;
- the `eval-report.ts` display defects under "Harness findings";
- Node on PATH in every shell (links under `~/.local/bin`);
- `cat-dependency-01`'s cause column;
- stability as a script step in `evals.js`;
- the re-run of p7 medium run 1 after the config-dir fix.
