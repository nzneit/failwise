// tools/workflows/evals.js
//
// Judges the 16 unattended eval runs under build/evals/ (4 prompts × 2 model capabilities ×
// 2 runs, produced by tools/run-eval.sh), checks run-to-run stability per
// (prompt, model capability), runs one completeness critic, and writes the result to
// build/evals/results.json. Run with the Workflow tool:
// {scriptPath: "tools/workflows/evals.js", args: {root: "<repository root>"}}.
// args.root is required because a workflow script has no filesystem access and
// cannot work out where the repository is, so without an absolute path it
// refuses before any agent is called. Returns
// {runs, stability, critic, unverified}.
//
// Fail-closed (plan reference §C): every agent() call is made through tryAgent(),
// which retries up to three times. A judge, stability pair, or critic that
// still returns nothing is pushed onto `unverified` and carried in the return
// value; it is never counted as a pass, and the critic's absence is itself a
// blocking candidate. The task that runs this script reports `unverified`
// rather than absorbing it. A judge that covered fewer of its prompt's criteria
// than it has, or scored one of them twice, is recorded the same way, and so is
// a stability pair whose eval-stability.ts call failed: neither measured a
// failure of the skill, so neither may read as one.
//
// Model capabilities (spec D10, amended 2026-09-10 by the user's ruling, and
// again 2026-09-12 by the user's ruling at the eval re-run): every agent names
// a model capability, never a model — judging and the critic at high, the two
// mechanical stages (running a command, writing a file) at medium — and the
// model that fills each capability comes from the table below, so the same
// judging runs on any provider's lineup. results.json carries the effective
// table as its `models` field, and every run and pair below is keyed on the
// capability alone.

export const meta = {
  name: 'fmea-evals',
  description: 'Judge the 16 fmea-software eval runs, check stability, and list what is missing',
  phases: [
    { title: 'Judge', detail: 'one judge per run directory, scoring by evals/rubric.md' },
    { title: 'Stability', detail: 'one agent per (prompt, model capability) running tools/eval-stability.ts' },
    { title: 'Critic', detail: 'one completeness critic over every score and stability result' },
    { title: 'Persist', detail: 'one Sonnet agent writes the results object to build/evals/results.json' },
  ],
}

const PROMPTS = [1, 5, 6, 7]
const MODEL_CAPABILITIES = ['high', 'medium']

// The model table: one model name per model capability, resolved once here and
// read by every agent() call below (amended 2026-09-12 by the user's ruling at
// the eval re-run). args.models replaces the whole table when given — the same
// rule tools/run-eval.sh applies to FMEA_EVAL_MODELS, so a launch states every
// capability it means to fill and no default survives unexamined beside an
// override. A key that is not a model capability, an empty value, or a table
// that names no model for a capability this run judges at refuses before any
// agent is called; the refusal is returned, not logged away.
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
    for (const capability of MODEL_CAPABILITIES) {
      if (!(capability in argsModels)) problems.push(`the table names no model for the ${capability} model capability this run judges at`)
    }
  }
  if (problems.length > 0) {
    const refused = `args.models refuses the run: ${problems.join('; ')}`
    log(refused)
    return { models: DEFAULT_MODELS_BY_CAPABILITY, runs: [], stability: [], critic: { missing: [], blocking_candidates: [refused] }, unverified: [], refused }
  }
  MODELS_BY_CAPABILITY = { ...argsModels }
}

// The repository root (2026-09-29): it comes from args.root, because a workflow
// script has no filesystem access and no import.meta, so it cannot derive the
// root from its own location, and a path written into the script breaks on
// every other machine. The value is trimmed and loses any trailing slash. A
// missing, non-string, empty or relative value refuses before any agent is
// called, returned in the same shape as the args.models refusal above; a run
// against a guessed root would judge whatever happens to sit there.
const argsRoot = args && typeof args === 'object' ? args.root : undefined
const ROOT = typeof argsRoot === 'string' ? argsRoot.trim().replace(/\/+$/, '') : ''
if (ROOT === '' || !ROOT.startsWith('/')) {
  const refused = 'args.root must be the absolute path of the repository root; a workflow script has no filesystem access and cannot derive it'
  log(refused)
  return { models: MODELS_BY_CAPABILITY, runs: [], stability: [], critic: { missing: [], blocking_candidates: [refused] }, unverified: [], refused }
}
const SKILL = `${ROOT}/skills/fmea-software`
const RUNS = [1, 2]

// The twelve rubric criteria (plan reference §I). c5 does not apply to prompt 6.
// Kept in sync by hand with tools/eval-report.ts CRITERIA; workflow scripts
// cannot import.
const CRITERIA = [
  { id: 'c1-missing-inputs-asked', must: true, prompts: [1, 5, 6, 7] },
  { id: 'c2-element-traceability', must: true, prompts: [1, 5, 6, 7] },
  { id: 'c3-chain-completeness', must: false, prompts: [1, 5, 6, 7] },
  { id: 'c4-rating-rationale-evidence', must: true, prompts: [1, 5, 6, 7] },
  { id: 'c5-provisional-rescore', must: true, prompts: [1, 5, 7] },
  { id: 'c6-priority-by-script', must: true, prompts: [1, 5, 6, 7] },
  { id: 'c7-json-validates', must: true, prompts: [1, 5, 6, 7] },
  { id: 'c8-html-renders', must: false, prompts: [1, 5, 6, 7] },
  { id: 'c9-provenance-tags', must: true, prompts: [1, 5, 6, 7] },
  { id: 'c10-no-invented-elements', must: true, prompts: [1, 5, 6, 7] },
  { id: 'c11-prompt6-conversion', must: true, prompts: [6] },
  { id: 'c12-prompt7-update', must: true, prompts: [7] },
]

const EXPECTED_FILES = {
  6: `${SKILL}/evals/fixtures/legacy-rpn-sheet.expected.fmea.json`,
  7: `${SKILL}/evals/fixtures/update/expected-stale.json`,
}

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 2 },
          evidence: { type: 'string' },
        },
        required: ['id', 'score', 'evidence'],
      },
    },
    total: { type: 'integer' },
    max: { type: 'integer' },
    musts_at_2: { type: 'integer' },
    notes: { type: 'string' },
  },
  required: ['scores', 'total', 'max', 'musts_at_2', 'notes'],
}

const STABILITY_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    jaccard: { type: 'number' },
    maxRows: { type: 'integer' },
    countDiffs: {
      type: 'object',
      properties: { H: { type: 'integer' }, M: { type: 'integer' }, L: { type: 'integer' } },
      required: ['H', 'M', 'L'],
    },
    bound: { type: 'number' },
    pass: { type: 'boolean' },
  },
  required: ['ok', 'jaccard', 'maxRows', 'countDiffs', 'bound', 'pass'],
}

const PERSIST_SCHEMA = {
  type: 'object',
  properties: {
    written: { type: 'boolean' },
    bytes: { type: 'integer' },
    parses: { type: 'boolean' },
  },
  required: ['written', 'bytes', 'parses'],
}

const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    missing: {
      type: 'array',
      items: {
        type: 'object',
        properties: { area: { type: 'string' }, detail: { type: 'string' } },
        required: ['area', 'detail'],
      },
    },
    blocking_candidates: { type: 'array', items: { type: 'string' } },
  },
  required: ['missing', 'blocking_candidates'],
}

// Units that could not be verified because their agent never returned
// (plan reference §C). Carried in the return value; never silently treated as a pass.
const unverified = []

// Every agent() call goes through here: up to three attempts, then give up and
// let the caller record the unit as unverified.
//
// An agent() call can throw as well as return null (the turn's token ceiling is
// one documented case). A throw inside a pipeline stage drops that item to null
// and skips the stage that would have recorded it as unverified, and the null
// then crashes the summary below, losing every result the run had earned. So
// every failure mode is funnelled into the same null return that the callers
// already handle, for the pipeline stages and for the Critic and Persist calls
// alike.
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

function criteriaFor(prompt) {
  return CRITERIA.filter((c) => c.prompts.includes(prompt))
}

// Recomputes total, max, musts_at_2 from the scores; a criterion the judge
// omitted scores 0. Same arithmetic as tools/eval-report.ts summarizeRun.
function summarize(prompt, scores) {
  const applicable = criteriaFor(prompt)
  const byId = new Map(scores.map((s) => [s.id, s.score]))
  let total = 0, mustsAt2 = 0, mustCount = 0
  for (const c of applicable) {
    const score = byId.get(c.id) ?? 0
    total += score
    if (c.must) { mustCount++; if (score === 2) mustsAt2++ }
  }
  const max = 2 * applicable.length
  return { total, max, musts_at_2: mustsAt2, must_count: mustCount, pass: mustsAt2 === mustCount && 5 * total >= 4 * max }
}

function judgePrompt(item) {
  const ids = criteriaFor(item.prompt).map((c) => `${c.id}${c.must ? ' (must)' : ''}`).join(', ')
  const expected = EXPECTED_FILES[item.prompt]
    ? `\n- The expected document for this prompt: ${EXPECTED_FILES[item.prompt]} (compare the run's analysis.json against it clause by clause for ${item.prompt === 6 ? 'c11-prompt6-conversion' : 'c12-prompt7-update'}).`
    : ''
  return `You are the judge for one unattended eval run of the fmea-software skill.

Run: prompt ${item.prompt}, model capability ${item.model_capability}, run ${item.run}. Run directory: ${item.dir}

Read, in full, before scoring:
- The rubric: ${SKILL}/evals/rubric.md (the scoring guide; every criterion states what earns 0, 1, 2).
- The prompt and its preamble: ${SKILL}/evals/prompts.json, the entry with id ${item.prompt}.
- The run's inputs: every file under ${item.dir}/inputs/.
- The run's outputs: ${item.dir}/analysis.json, ${item.dir}/report.html, ${item.dir}/validate.json (the validator's stdout for analysis.json), the "result" field of ${item.dir}/transcript.json (the run's final message; one small JSON object, read it in full), and ${item.dir}/transcript.jsonl (the run's message stream, one JSON object per line). Do not read transcript.jsonl in full: it is large. Grep it for "priority.ts", "validate.ts" and "render.ts" and read only the matching lines. A match counts as an invocation only when it sits inside a tool_use block: a line of type "assistant" whose content holds {"type":"tool_use","name":"Bash","input":{"command":"..."}} with the script in the command. A match inside a text block, a tool_result, or a file the run was reading is narration or file content, not an invocation. Those tool_use blocks are the only record of which of the skill's scripts the run actually ran, and they are the evidence the rubric requires for c6-priority-by-script and c8-html-renders; transcript.json carries no tool call and is never evidence that a script ran. A criterion whose rubric text asks for a script invocation scores at most 1 when transcript.jsonl holds no matching tool_use block; say so in the evidence rather than inferring the invocation from the artifacts.
- The catalog, for c9: ${SKILL}/references/design-failure-catalog.md (each row id and its provenance tag).${expected}

Score exactly these criteria, by id: ${ids}. Give each a score of 0, 1, or 2 per the rubric and one or two sentences of evidence naming the JSON pointer, file, or transcript text you relied on. Where analysis.json is missing or unparsable, score every criterion that reads it 0 and say so.

Unattended runs cannot ask questions: the rubric says how c1 and, where it applies, c5 are judged in that setting (open assumptions with owner "user" in meta.assumptions[] plus the question in the final message; ratings written provisional with a re-scoring request in the final message). Expect rating-provisional lint warnings in validate.json; they count against nothing.

Return: scores (one entry per criterion id above, no others), total (sum of scores), max (2 × number of criteria), musts_at_2 (how many must criteria scored 2), notes (anything a reader of the scores should know, or an empty string).`
}

function stabilityPrompt(pair) {
  const a = `${ROOT}/build/evals/p${pair.prompt}/${pair.model_capability}/run1/analysis.json`
  const b = `${ROOT}/build/evals/p${pair.prompt}/${pair.model_capability}/run2/analysis.json`
  return `Run this command exactly, from ${ROOT}, and return the JSON it prints as your structured result:

cd ${ROOT} && node tools/eval-stability.ts ${a} ${b}

The command needs Node 24.2 or later on PATH. On a machine where Node is installed only through nvm, run \`source ~/.nvm/nvm.sh\` first, in the same shell call as the command, because PATH does not carry over from one call to the next.

It prints {jaccard, maxRows, countDiffs, bound, pass}; countDiffs has one integer per priority value, H, M and L. Return those five fields verbatim, with countDiffs as an object with exactly the keys H, M and L, plus ok: true. If the command fails or prints no such JSON (a missing analysis.json exits 3), return {ok: false, jaccard: 0, maxRows: 0, countDiffs: {H: 0, M: 0, L: 0}, bound: 0, pass: false} and nothing else. The ok field records whether the comparison happened at all: a comparison that never ran is not an unstable pair, and must not be reported as one.`
}

function criticPrompt(runs, stabilityResults, unverifiedUnits) {
  return `You are the completeness critic for the fmea-software v1 eval gate (spec §10, §11 phase 6).

Everything below was produced by judges and the stability check. Your job is to say what is missing, not to re-score: an eval prompt whose runs both failed a must, a criterion every judge scored below 2 for the same reason, a stability failure, a judge whose evidence does not support its score, a run that produced no analysis.json, a rubric criterion no judge could assess, and anything the §10 eval design asked for that these results do not show. Read ${SKILL}/evals/rubric.md and the design's §10 and §15 in ${ROOT}/docs/specs/2026-09-07-fmea-software-design.md first; open any run directory under ${ROOT}/build/evals/ where a score needs checking.

Per-run results (scores recomputed from the judges' per-criterion scores):
${JSON.stringify(runs, null, 2)}

Stability per (prompt, model capability):
${JSON.stringify(stabilityResults, null, 2)}

Units whose agent never returned, after three attempts each. These are unverified, not passes: treat every one as a hole in the evidence and say so in your answer.
${JSON.stringify(unverifiedUnits, null, 2)}

Return: missing, a list of {area, detail} entries (area names the prompt, model capability, criterion, or rubric section; detail says what is missing and where you looked); blocking_candidates, a list of one-sentence statements, each something the user must rule on before v1 is accepted (a failed must on a prompt and model capability, a stability failure, a rubric threshold the results suggest changing, a defect the runs exposed in the skill or scripts). Empty lists are valid answers when nothing is missing.`
}

const runItems = []
for (const prompt of PROMPTS) {
  for (const modelCapability of MODEL_CAPABILITIES) {
    for (const run of RUNS) {
      runItems.push({ prompt, model_capability: modelCapability, run, dir: `${ROOT}/build/evals/p${prompt}/${modelCapability}/run${run}` })
    }
  }
}

phase('Judge')
const runs = await pipeline(
  runItems,
  (_prev, item) => tryAgent(judgePrompt(item), { label: `judge p${item.prompt} ${item.model_capability} run${item.run}`, phase: 'Judge', model: MODELS_BY_CAPABILITY.high, schema: SCORE_SCHEMA }),
  (judged, item) => {
    const key = `p${item.prompt} ${item.model_capability} run${item.run}`
    if (!judged) {
      unverified.push({ unit: `judge ${key}`, detail: 'the judge agent returned nothing on three attempts; this run is unjudged, not a failed run and not a pass' })
      log(`judge for ${key} returned nothing on three attempts; recorded as unverified`)
      return { ...item, scores: [], total: 0, max: 2 * criteriaFor(item.prompt).length, musts_at_2: 0, notes: 'judge returned no result on three attempts', pass: false, unverified: true }
    }
    const known = new Set(criteriaFor(item.prompt).map((c) => c.id))
    const scores = judged.scores.filter((s) => known.has(s.id))
    // Distinct ids, not entries: a judge that scored one criterion twice and left
    // another out returns as many entries as the prompt has criteria, and counting
    // entries passed that as a complete judgment with a criterion still unjudged.
    const scored = new Set(scores.map((x) => x.id))
    const duplicated = [...new Set(scores.map((x) => x.id).filter((id, i, all) => all.indexOf(id) !== i))]
    const s = summarize(item.prompt, scores)
    // A judge that scored fewer of the prompt's criteria than it has did not judge
    // this run against the whole rubric. The criteria it left out score 0 in
    // summarize(), which would turn a hole in the evidence into a measured failure
    // of the skill; plan reference §C says a check that did not run is never a
    // pass, and it is not a failure either. A criterion scored twice is the same
    // kind of hole: summarize() keeps one of the two scores and discards the
    // other, so which judgment stands is an artefact of ordering rather than a
    // measurement. Record the run unverified and let the acceptance note rule on
    // it.
    if (scored.size !== known.size || duplicated.length > 0) {
      const missing = [...known].filter((id) => !scored.has(id))
      const what = []
      if (missing.length > 0) what.push(`it left out ${missing.join(', ')}`)
      if (duplicated.length > 0) what.push(`it scored ${duplicated.join(', ')} more than once`)
      const detail = `the judge returned ${judged.scores.length} scores covering ${scored.size} of the prompt's ${known.size} criteria: ${what.join(' and ')}; the rubric was not covered exactly once, so this run is neither a failed run nor a pass`
      unverified.push({ unit: `judge ${key}`, detail })
      log(`${key}: ${detail}; recorded as unverified`)
      return { ...item, scores, total: s.total, max: s.max, musts_at_2: s.musts_at_2, notes: judged.notes, pass: false, unverified: true }
    }
    // Every applicable criterion was scored, so the run was judged against the
    // whole rubric even where the judge added its own scores up wrong. This file
    // recomputes the totals from the per-criterion scores rather than trusting the
    // judge's arithmetic, so a disagreement is logged and the recomputation stands.
    if (s.total !== judged.total || s.musts_at_2 !== judged.musts_at_2) {
      log(`${key}: the judge reported total ${judged.total}, musts ${judged.musts_at_2} against the recomputed total ${s.total}, musts ${s.musts_at_2}; the recomputation stands`)
    }
    return { ...item, scores, total: s.total, max: s.max, musts_at_2: s.musts_at_2, notes: judged.notes, pass: s.pass, unverified: false }
  },
)

phase('Stability')
const pairs = []
for (const prompt of PROMPTS) for (const modelCapability of MODEL_CAPABILITIES) pairs.push({ prompt, model_capability: modelCapability })
const stability = await pipeline(
  pairs,
  (_prev, pair) => tryAgent(stabilityPrompt(pair), { label: `stability p${pair.prompt} ${pair.model_capability}`, phase: 'Stability', schema: STABILITY_SCHEMA, model: MODELS_BY_CAPABILITY.medium }),
  (result, pair) => {
    if (!result) {
      unverified.push({ unit: `stability p${pair.prompt} ${pair.model_capability}`, detail: 'the stability agent returned nothing on three attempts; the two runs were never compared' })
      log(`stability for p${pair.prompt} ${pair.model_capability} returned nothing on three attempts; recorded as unverified and not a pass`)
      return { ...pair, jaccard: 0, maxRows: 0, countDiffs: { H: 0, M: 0, L: 0 }, bound: 0, pass: false, unverified: true }
    }
    // The agent returns ok: false when tools/eval-stability.ts did not run or
    // printed no JSON. That pair was never compared, so recording pass: false
    // here would report a measured instability the check never measured.
    const { ok, ...measured } = result
    if (ok !== true) {
      unverified.push({ unit: `stability p${pair.prompt} ${pair.model_capability}`, detail: 'the tools/eval-stability.ts call failed, so the two runs were never compared; this is a hole in the evidence, not an unstable pair' })
      log(`stability for p${pair.prompt} ${pair.model_capability}: the eval-stability.ts call failed; recorded as unverified, not as an unstable pair`)
      return { ...pair, jaccard: 0, maxRows: 0, countDiffs: { H: 0, M: 0, L: 0 }, bound: 0, pass: false, unverified: true }
    }
    return { ...pair, ...measured, unverified: false }
  },
)

phase('Critic')
const criticResult = await tryAgent(criticPrompt(runs, stability, unverified), { label: 'completeness critic', phase: 'Critic', model: MODELS_BY_CAPABILITY.high, schema: CRITIC_SCHEMA })
let critic
if (criticResult) {
  critic = criticResult
} else {
  // A critic that did not run is not a clean gate (plan reference §C). It becomes an
  // unverified unit and a blocking candidate, so no downstream document can
  // read an empty blocking list as an all-clear.
  unverified.push({ unit: 'critic', detail: 'the completeness critic returned nothing on three attempts; the blocking list is unknown, not empty' })
  log('the completeness critic returned nothing on three attempts; recorded as unverified')
  critic = {
    missing: [{ area: 'critic', detail: 'the completeness critic returned no result on three attempts; nothing here has been checked for completeness' }],
    blocking_candidates: ['the completeness critic did not run, so the gate has no completeness check; v1 cannot be accepted on these results until it runs'],
  }
}

// `models` first: the reader of results.json sees which model filled each
// capability before any score, so nothing below can be misread as a model
// name.
const results = { models: MODELS_BY_CAPABILITY, runs, stability, critic, unverified }
// Measured outcomes only: an unverified run or pair is listed under `unverified`
// below and never counted as a failure the evidence does not show.
const failing = runs.filter((r) => !r.pass && !r.unverified).map((r) => `p${r.prompt} ${r.model_capability} run${r.run}`)
const unstable = stability.filter((s) => !s.pass && !s.unverified).map((s) => `p${s.prompt} ${s.model_capability}`)
log(`runs failing the per-run rule: ${failing.length ? failing.join(', ') : 'none'}; unstable pairs: ${unstable.length ? unstable.join(', ') : 'none'}; blocking candidates: ${critic.blocking_candidates.length}; unverified units: ${unverified.length ? unverified.map((u) => u.unit).join(', ') : 'none'}`)

// The results object is several KB of JSON. Rather than have the executor
// retype it, one Sonnet agent writes it to disk; the task's next step checks
// the file and falls back to writing it by hand if this agent failed.
phase('Persist')
const resultsJson = JSON.stringify(results, null, 2)
const persisted = await tryAgent(
  `Write a file. Everything between the two marker lines below, excluding the marker lines themselves, is the exact content of ${ROOT}/build/evals/results.json.

Create ${ROOT}/build/evals/ if it does not exist, then write that text to ${ROOT}/build/evals/results.json unchanged: byte for byte, no reformatting, no re-indenting, no summarising, no truncation, no added commentary. Then read the file back, count its bytes, and check that JSON.parse succeeds on it.

Return: written (true only if the file now holds the whole text), bytes (the file's size in bytes as you read it back), parses (whether JSON.parse succeeded).

----- BEGIN results.json -----
${resultsJson}
----- END results.json -----`,
  { label: 'persist results.json', phase: 'Persist', schema: PERSIST_SCHEMA, model: MODELS_BY_CAPABILITY.medium },
)
log(`build/evals/results.json: written=${persisted ? persisted.written : false} bytes=${persisted ? persisted.bytes : 0} parses=${persisted ? persisted.parses : false} (expected ${resultsJson.length} characters)`)

// A Persist agent that never returned, or that did not confirm a whole file, is
// not a written deliverable (plan reference §C: a unit that did not run is never
// a pass). `results.unverified` is this same array, so the entry reaches the
// returned object, which is what the task reports and Task 33 harvests; the
// on-disk copy was serialised before this outcome was known and cannot carry the
// entry, which is exactly why the next step re-checks the file itself.
if (!persisted || persisted.written !== true) {
  unverified.push({ unit: 'persist results.json', detail: 'the persist agent returned nothing on three attempts; build/evals/results.json is missing or half written' })
  log('the persist agent did not confirm a written results.json; recorded as unverified')
}

return results
