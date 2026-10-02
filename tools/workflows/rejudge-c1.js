// tools/workflows/rejudge-c1.js
//
// Re-judges c1-missing-inputs-asked alone, on the eight prompt-1 and prompt-5
// runs under build/evals/, against the c1 clause as amended 2026-09-15 by the
// user's ruling at the acceptance re-gate. Run with the Workflow tool:
// {scriptPath: "tools/workflows/rejudge-c1.js", args: {root: "<repository root>"}}.
// args.root is required because a workflow script has no filesystem access and
// cannot work out where the repository is, so without an absolute path it
// refuses before any agent is called. Returns {models, scores, unverified}.
//
// Why only c1 and only these eight runs: the first judging of this round scored
// one fact pattern 0, 1 and 2 across four runs, and two of the 2s carried runs
// that the Overall table then marked pass. The gate's ruling was to reconcile
// the clause with references/design-inputs.md and re-judge that criterion, not
// to re-run the whole evaluation: no other criterion's text moved, so no other
// score may move either. Prompts 6 and 7 carry no planted gap and are untouched.
//
// Fail-closed (plan reference §C): every agent() call goes through tryAgent(),
// which retries up to three times. A judge that still returns nothing is pushed
// onto `unverified` and carried in the return value. It is never counted as a
// pass and never left at its old score silently — the task that runs this script
// reports the list, and each entry travels to the acceptance note's blocking
// list. The caller copies the returned scores into build/evals/results.json
// mechanically; this script writes no file, because the Persist agent of the
// main judging workflow was caught abridging an evidence string on 2026-09-15.
//
// Model capabilities (spec D10): judging is at the high capability, filled from
// the table below, which args.models replaces wholesale exactly as in evals.js.

export const meta = {
  name: 'fmea-rejudge-c1',
  description: 'Re-judge c1-missing-inputs-asked on the eight prompt-1 and prompt-5 runs',
  phases: [{ title: 'Re-judge', detail: 'one judge per run, scoring c1 alone against the amended clause' }],
}

const PROMPTS = [1, 5]
const MODEL_CAPABILITIES = ['high', 'medium']
const RUNS = [1, 2]

const DEFAULT_MODELS_BY_CAPABILITY = { high: 'opus', medium: 'sonnet', low: 'haiku' }
const argsModels = args && typeof args === 'object' && args.models !== undefined ? args.models : null
let MODELS_BY_CAPABILITY = DEFAULT_MODELS_BY_CAPABILITY
if (argsModels !== null) {
  const known = new Set(Object.keys(DEFAULT_MODELS_BY_CAPABILITY))
  const problems = []
  if (typeof argsModels !== 'object' || Array.isArray(argsModels) || argsModels === null) {
    problems.push('args.models must be an object of { model capability: model name }')
  } else {
    for (const [capability, name] of Object.entries(argsModels)) {
      if (!known.has(capability)) problems.push(`unknown model capability '${capability}' (known: high, medium, low)`)
      else if (typeof name !== 'string' || name.trim() === '') problems.push(`the ${capability} model capability names no model (empty value)`)
    }
    if (!('high' in argsModels)) problems.push('the table names no model for the high model capability this run judges at')
  }
  if (problems.length > 0) {
    const refused = `args.models refuses the run: ${problems.join('; ')}`
    log(refused)
    return { models: DEFAULT_MODELS_BY_CAPABILITY, scores: [], unverified: [], refused }
  }
  MODELS_BY_CAPABILITY = { ...argsModels }
}

// The repository root (2026-09-29): it comes from args.root, exactly as in
// evals.js, because a workflow script has no filesystem access and no
// import.meta, so it cannot derive the root from its own location. The value is
// trimmed and loses any trailing slash. A missing, non-string, empty or relative
// value refuses before any agent is called, returned in the same shape as the
// args.models refusal above.
const argsRoot = args && typeof args === 'object' ? args.root : undefined
const ROOT = typeof argsRoot === 'string' ? argsRoot.trim().replace(/\/+$/, '') : ''
if (ROOT === '' || !ROOT.startsWith('/')) {
  const refused = 'args.root must be the absolute path of the repository root; a workflow script has no filesystem access and cannot derive it'
  log(refused)
  return { models: MODELS_BY_CAPABILITY, scores: [], unverified: [], refused }
}
const SKILL = `${ROOT}/skills/fmea-software`

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 2 },
    evidence: { type: 'string' },
    names_the_gap: { type: 'boolean' },
    where_recorded: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['score', 'evidence', 'names_the_gap', 'where_recorded', 'notes'],
}

const unverified = []

async function tryAgent(prompt, options) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await agent(prompt, options)
      if (result) return result
      log(`${options.label}: attempt ${attempt} of 3 returned nothing`)
    } catch (err) {
      log(`${options.label}: attempt ${attempt} of 3 threw: ${String(err)}`)
    }
  }
  return null
}

function judgePrompt(item) {
  return `You are re-judging one criterion, c1-missing-inputs-asked, on one unattended eval run of the fmea-software skill. You are not scoring any other criterion and not forming a verdict on the run as a whole.

Run: prompt ${item.prompt}, model capability ${item.model_capability}, run ${item.run}. Run directory: ${item.dir}

Read, in full, before scoring:
- The criterion, as it now stands: the section "### c1-missing-inputs-asked (must)" of ${SKILL}/evals/rubric.md, together with the "Unattended runs" bullets earlier in that file. The clause was amended on 2026-09-15 and the amended text is the only text that governs. Read it yourself rather than relying on any summary of it, including this one.
- The checklist the amended clause reconciles against: ${SKILL}/references/design-inputs.md, items 3 and 4 and the prose beneath them.
- The prompt and its preamble: ${SKILL}/evals/prompts.json, the entry with id ${item.prompt}.
- The run's inputs: every file under ${item.dir}/inputs/ — in particular the component inventory, the "Dependencies" list and the "SLAs and limits" list of checkout-inputs.md.
- The run's document: ${item.dir}/analysis.json — read /meta/assumptions in full, and read the element the fixture types as the pricing service (its /dependency object in particular, including whether a limits field is present and what it says).
- The run's final message: the "result" field of ${item.dir}/transcript.json. Read it in full; it is the only place an unattended run can put a question.

The question you are answering is narrow and factual. The fixture omits one datum: the pricing service's scaling limit. Determine, from the two places the rubric names:
1. Does an entry of /meta/assumptions with owner "user" and status "open" name that missing datum — pricing's scaling limit, request ceiling or capacity? An assumption about a different element (the gateway's 50 rps, the order store's ceiling) or about pricing's availability, latency or boundary treatment is not that datum. Quote the assumption you judge closest, whichever way you decide.
2. Does the final message list that same question back to the user?

Then score 0, 1 or 2 strictly by the bands and the surrounding prose of the amended clause. Note especially what the amended clause says about a run that records the datum only as a value in a document field, and about a run that records it in neither place while recording other gaps conscientiously. Apply the clause as written even where you would have drawn the line differently; if you think the clause itself is wrong, score it as written and say so in notes.

Return:
- score: 0, 1 or 2.
- evidence: one or two sentences naming the JSON pointers and the final-message text you relied on.
- names_the_gap: true only if an open user-owned assumption names pricing's missing scaling limit, request ceiling or capacity.
- where_recorded: where the missing datum appears in the document, if anywhere — a JSON pointer, or the words "nowhere".
- notes: anything a reader of this score should know, or an empty string.`
}

const items = []
for (const prompt of PROMPTS) {
  for (const modelCapability of MODEL_CAPABILITIES) {
    for (const run of RUNS) {
      items.push({
        prompt,
        model_capability: modelCapability,
        run,
        dir: `${ROOT}/build/evals/p${prompt}/${modelCapability}/run${run}`,
      })
    }
  }
}

phase('Re-judge')
const results = await parallel(
  items.map((item) => async () => {
    const label = `rejudge-c1 p${item.prompt} ${item.model_capability} run${item.run}`
    const r = await tryAgent(judgePrompt(item), {
      label,
      phase: 'Re-judge',
      model: MODELS_BY_CAPABILITY.high,
      schema: SCORE_SCHEMA,
    })
    if (!r) {
      unverified.push({
        unit: `rejudge-c1 p${item.prompt} ${item.model_capability} run${item.run}`,
        detail: 'the re-judging agent returned nothing on three attempts; c1 was never re-scored for this run, so its stored score stands unreconciled',
      })
      log(`${label} returned nothing on three attempts; recorded as unverified and not a score`)
      return null
    }
    return {
      prompt: item.prompt,
      model_capability: item.model_capability,
      run: item.run,
      score: r.score,
      evidence: r.evidence,
      names_the_gap: r.names_the_gap,
      where_recorded: r.where_recorded,
      notes: r.notes,
    }
  }),
)

const scores = results.filter((x) => x !== null)
const byScore = { 0: 0, 1: 0, 2: 0 }
for (const s of scores) byScore[s.score] = (byScore[s.score] ?? 0) + 1
log(
  `re-judged ${scores.length} of ${items.length} runs: ${byScore[0]} scored 0, ${byScore[1]} scored 1, ${byScore[2]} scored 2; ` +
    `named the gap: ${scores.filter((s) => s.names_the_gap).length}; unverified: ${unverified.length === 0 ? 'none' : unverified.map((u) => u.unit).join(', ')}`,
)

return { models: MODELS_BY_CAPABILITY, scores, unverified }
