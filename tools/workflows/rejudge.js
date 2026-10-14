// tools/workflows/rejudge.js
//
// Re-judges one rubric criterion alone, on the unattended eval runs the caller
// names, against that criterion's section of evals/rubric.md as it now stands,
// every dated amendment paragraph in it included. Run with the Workflow tool:
// {scriptPath: "tools/workflows/rejudge.js", args: {root: "<repository root>",
// evalsDir: "build/evals/flow-model", criterion: "c5-provisional-rescore",
// runs: [{prompt: 7, model_capability: "high", run: 1}, ...]}}.
// args.root is required because a workflow script has no filesystem access and
// cannot work out where the repository is. args.evalsDir (a non-empty path
// relative to args.root), args.criterion (one id of the CRITERIA table below) and
// args.runs (a non-empty list of {prompt, model_capability, run}, each naming the
// run directory <root>/<evalsDir>/p<prompt>/<model_capability>/run<run>) are
// required as well; args.models is optional. A value outside what the comments
// below allow refuses before any agent is called. Returns
// {models, criterion, scores, unverified}; a refusal returns the same shape with
// empty lists and a `refused` sentence, and is never thrown.
//
// Why one criterion and named runs: a ruling that amends one criterion's text
// moves that criterion's scores alone, and only on the runs whose fact pattern
// the amendment reads. Re-running the whole judging would put every other score
// back in a fresh judge's hands although no other text moved, so no other score
// may move either. On 2026-10-13 the user ruled on four contested readings of
// the flow-model round (build/evals/flow-model, judged under rubric 4 by
// evals.js), and the rulings entered rubric.md as dated paragraphs under c1, c3,
// c5 and c11 (commit 0f64c18). The runs those readings touch are re-judged with
// this file: c5 on p7 high run1, p7 high run2 and p7 medium run2, and c3 on the
// four p1 runs. rejudge-c1.js did the same job once, for c1 on the v1 round, with
// the criterion, the prompts and build/evals/ written into it; it stays as the
// record of that re-judging, and this file takes all three as arguments.
// args.evalsDir has no default, so a re-judging never reads a round its caller
// did not name.
//
// Fail-closed (plan reference §C): every agent() call goes through tryAgent(),
// which retries up to three times. A judge that still returns nothing, returns a
// result outside its schema, or says it did not score the run (scored: false,
// which the rubric's reading paragraph requires when analysis.json or report.html
// is missing) is pushed onto `unverified` and carried in the return value. None
// of these is ever a score, a pass, or an old score left standing silently: the
// task that runs this script reports the list, and each entry travels to the
// round's results note. The caller merges the returned scores into
// <evalsDir>/results.json mechanically: it replaces this criterion's
// {id, score, evidence} entry in the scores[] of the run with the same prompt,
// model capability and run (a returned `notes` goes to the round's results note
// and the acceptance note, never into scores[]), and appends one entry to the
// file's rejudged[] — {criterion, date, runs, by: "tools/workflows/rejudge.js",
// models, reason, unverified}, with `runs` the count of scores plus unverified
// entries and `date` stamped by the caller — which tools/eval-report.ts reads to
// flag every critic entry and judge note that quotes a score the tables no
// longer carry. tools/eval-report.ts then recomputes each run's total and pass
// from the scores. This script writes no file, because the Persist agent of the
// main judging workflow was caught abridging an evidence string on 2026-09-15.
//
// Model capabilities (spec D10): every judge runs at the high capability, filled
// from the table below, which args.models replaces wholesale exactly as in
// evals.js and rejudge-c1.js. The table has to name the high capability this run
// judges at, and every run's model capability has to be one of its keys.

export const meta = {
  name: 'fmea-rejudge',
  description: 'Re-judge one rubric criterion alone on the eval runs the caller names',
  phases: [{ title: 'Re-judge', detail: 'one judge per run, scoring the one criterion against its section of rubric.md as it now stands' }],
}

const PROMPTS = [1, 5, 6, 7]

// The sixteen criteria of rubric 4: ids, must flags and prompts copied from
// CRITERIA in tools/workflows/evals.js, because workflow scripts cannot import;
// the sync test in tools/eval-report.test.ts reads this table and fails when it
// drifts from tools/eval-report.ts CRITERIA. A criterion id outside this table,
// or a run whose prompt the criterion does not apply to, refuses before any
// agent is called.
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
  { id: 'c13-element-typing', must: false, prompts: [1, 6] },
  { id: 'c14-edges-and-codebases', must: false, prompts: [1, 6] },
  { id: 'c15-cross-service-trace', must: false, prompts: [1] },
  { id: 'c16-flows', must: false, prompts: [1] },
]

const argsObject = args && typeof args === 'object' ? args : {}
// The criterion as given, echoed in a refusal so the caller sees what was refused.
const GIVEN_CRITERION = typeof argsObject.criterion === 'string' ? argsObject.criterion : null

// The model table, validated exactly as in rejudge-c1.js: a key that is not a
// model capability, an empty value, or a table that names no model for the high
// capability refuses before any agent is called, with the default table in the
// returned `models`.
const DEFAULT_MODELS_BY_CAPABILITY = { high: 'opus', medium: 'sonnet', low: 'haiku' }
const argsModels = argsObject.models !== undefined ? argsObject.models : null
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
    return { models: DEFAULT_MODELS_BY_CAPABILITY, criterion: GIVEN_CRITERION, scores: [], unverified: [], refused }
  }
  MODELS_BY_CAPABILITY = { ...argsModels }
}

// The repository root, exactly as in rejudge-c1.js and evals.js: it comes from
// args.root, because a workflow script has no filesystem access and no
// import.meta, so it cannot derive the root from its own location. The value is
// trimmed and loses any trailing slash. A missing, non-string, empty or relative
// value refuses before any agent is called.
const argsRoot = argsObject.root
const ROOT = typeof argsRoot === 'string' ? argsRoot.trim().replace(/\/+$/, '') : ''
if (ROOT === '' || !ROOT.startsWith('/')) {
  const refused = 'args.root must be the absolute path of the repository root; a workflow script has no filesystem access and cannot derive it'
  log(refused)
  return { models: MODELS_BY_CAPABILITY, criterion: GIVEN_CRITERION, scores: [], unverified: [], refused }
}
const SKILL = `${ROOT}/skills/fmea-software`

// The request: the evals directory, the criterion and the runs. Every problem is
// collected and the whole list refuses before any agent is called. args.evalsDir
// is trimmed and loses any trailing slash, as in evals.js. A run entry is an
// object of exactly prompt, model_capability and run: a key outside those three
// refuses, so a field the caller thinks this script reads (a dir, a score) is
// never silently ignored.
const requestProblems = []
const EVALS_DIR = typeof argsObject.evalsDir === 'string' ? argsObject.evalsDir.trim().replace(/\/+$/, '') : ''
if (EVALS_DIR === '' || EVALS_DIR.startsWith('/')) requestProblems.push('args.evalsDir must be a non-empty path relative to args.root, such as "build/evals/flow-model"')

const CRITERION = CRITERIA.find((c) => c.id === argsObject.criterion) ?? null
if (CRITERION === null) {
  const given = argsObject.criterion === undefined ? 'it is missing' : `it is ${JSON.stringify(argsObject.criterion)}`
  requestProblems.push(`args.criterion must be one criterion id of rubric 4 (${CRITERIA.map((c) => c.id).join(', ')}); ${given}`)
}

const MODEL_KEYS = Object.keys(MODELS_BY_CAPABILITY)
const RUN_KEYS = ['prompt', 'model_capability', 'run']
function runProblems(entry, where) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [`${where} must be an object {prompt, model_capability, run}`]
  const found = []
  const extra = Object.keys(entry).filter((k) => !RUN_KEYS.includes(k))
  if (extra.length > 0) found.push(`${where} carries ${extra.join(', ')}, which this script does not read (a run entry is exactly prompt, model_capability, run)`)
  if (!PROMPTS.includes(entry.prompt)) found.push(`${where}.prompt is ${JSON.stringify(entry.prompt)}, which is not one of ${JSON.stringify(PROMPTS)}`)
  else if (CRITERION !== null && !CRITERION.prompts.includes(entry.prompt)) found.push(`${where} is a prompt-${entry.prompt} run, and ${CRITERION.id} applies to prompt${CRITERION.prompts.length === 1 ? '' : 's'} ${CRITERION.prompts.join(', ')} only`)
  if (typeof entry.model_capability !== 'string' || !MODEL_KEYS.includes(entry.model_capability)) found.push(`${where}.model_capability is ${JSON.stringify(entry.model_capability)}, which is not a key of the model table (${MODEL_KEYS.join(', ')})`)
  if (!Number.isInteger(entry.run) || entry.run < 1) found.push(`${where}.run is ${JSON.stringify(entry.run)}, which is not a positive integer`)
  return found
}
const RUNS = []
if (!Array.isArray(argsObject.runs) || argsObject.runs.length === 0) {
  requestProblems.push('args.runs must be a non-empty list of {prompt, model_capability, run}')
} else {
  const seen = new Set()
  argsObject.runs.forEach((entry, i) => {
    const found = runProblems(entry, `args.runs[${i}]`)
    if (found.length > 0) {
      requestProblems.push(...found)
      return
    }
    const key = `p${entry.prompt} ${entry.model_capability} run${entry.run}`
    if (seen.has(key)) {
      requestProblems.push(`args.runs[${i}] repeats ${key}`)
      return
    }
    seen.add(key)
    RUNS.push({ prompt: entry.prompt, model_capability: entry.model_capability, run: entry.run })
  })
}
if (requestProblems.length > 0) {
  const refused = `the request refuses the run: ${requestProblems.join('; ')}`
  log(refused)
  return { models: MODELS_BY_CAPABILITY, criterion: GIVEN_CRITERION, scores: [], unverified: [], refused }
}
const EVALS = `${ROOT}/${EVALS_DIR}`
const SHORT_ID = CRITERION.id.split('-')[0]

// The files the rubric's reading paragraph adds for prompts 6 and 7, as in evals.js.
const EXPECTED_FILES = {
  6: `${SKILL}/evals/fixtures/legacy-rpn-sheet.expected.fmea.json`,
  7: `${SKILL}/evals/fixtures/update/expected-stale.json`,
}

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    scored: { type: 'boolean' },
    score: { type: 'integer', minimum: 0, maximum: 2 },
    evidence: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['scored', 'score', 'evidence', 'notes'],
}

// Every agent() call goes through here: up to three attempts, then give up and
// let the caller record the unit as unverified. An agent() call can throw as well
// as return null (the turn's token ceiling is one documented case), so both are
// funnelled into the same null return, as in evals.js.
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

// One short reading hint per criterion a 2026-10-13 ruling amended, each taken
// from that criterion's amendment paragraph and asking for the evidence the
// ruling turns on. Every other criterion gets the generic prompt alone. A hint
// never stands in for the section: the prompt tells the judge to read the
// section itself.
const HINTS = {
  'c1-missing-inputs-asked': (item) => (item.prompt === 1 || item.prompt === 5
    ? `Reading hint for c1, from its clause as amended: the fixture's planted gap is the pricing service's scaling limit (its request ceiling or capacity). Say in evidence where the gap is recorded: the JSON pointer of the entry of /meta/assumptions with owner "user" and status "open" that names it, or the word "nowhere" (an assumption about another element, or about pricing's availability, latency or boundary, is not that datum; quote the entry you judge closest either way); whether the final message lists that question, quoted; and every document field, an edge's limits included, that holds a value for it, quoted. Under the third sentence of that paragraph, added 2026-10-13, a field that says in words that the input is unstated does not lower the score of a run that records both the entry and the question, while in a run with no such entry a field value still scores 0, whatever the field says.`
    : `Reading hint for c1: prompt ${item.prompt} carries no planted gap. Say in evidence which input, if any, the run stated as fact without having been given it, with its JSON pointer, or that there is none.`),
  'c3-chain-completeness': () =>
    'Reading hint for c3, from its paragraph added 2026-10-13: list in evidence every chain you count toward the quarter, each with its id and the way it is incomplete, and, for a chain counted because its causes restate the mode, every cause it lists quoted beside its failure_mode; then give the count of counted chains against the chain total, such as "3 of 14 chains". A chain counts for restated causes only when every cause it lists restates the mode; one cause with content of its own keeps the chain out of the count. A cause restates the mode only when it says nothing the failure_mode does not already say, in the mode\'s words or in others: the mode\'s own because-clause or one of its branches, or the recorded availability SLA not met or the recorded scaling limit reached under a mode in which the element is unavailable or slow. A cause filled in from a row of references/design-failure-catalog.md is counted like any other. A cause that names a driver or a mechanism the mode does not state has content of its own however thin it is, so a borderline chain is not counted.',
  'c5-provisional-rescore': () =>
    'Reading hint for c5, from its paragraph added 2026-10-13: quote in evidence every place the final message names a priority (a priority level, a ranking, a count of rows by priority, a bare level beside a chain\'s ratings) and every caveat in it about provisional ratings or priorities, then say which caveat, if any, covers the priorities. One statement anywhere in the final message that its priorities are not final until the ratings are re-scored covers every priority the message names; a step that re-runs priority.ts --write after the re-scoring, named as what follows it, is such a statement, and a record that priority.ts --write has already run is not. A caveat that covers the ratings alone, saying they are provisional and are to be re-scored but not that the priority rests on them, does not cover a priority, and band 1 then counts that priority as presented as final. The report\'s own provisional marking covers every priority the report names and does not cover the final message; confirm in report.html the sentence that the priority of provisional rows is not final and the mark on each provisional row before counting that marking. Quote the re-scoring request too, and say whether every rating the run authored has review.status "provisional".',
  'c11-prompt6-conversion': () =>
    'Reading hint for c11, from its paragraph amended 2026-10-13: say in evidence where the rationale substitution is recorded, as the JSON pointer of the meta.history entry that names it and the rows it covers (by count or by naming them), or say that meta.history does not name it; a column mapping of Justification to rationale, an open entry in meta.assumptions[], the final message and the row\'s own history[] do not stand in for it. Quote the row-2 substitute: the rationale the document holds on each rating of the row whose Justification cell is empty, once if all three are the same. The prescribed substitute is "converted from legacy-rpn-sheet.csv; no rationale recorded", or the same with "inputs/" before the file name; any other text there is band 1.',
}

function readingList(item) {
  const lines = [
    `- The criterion, as it now stands: the section of ${SKILL}/evals/rubric.md whose heading begins "### ${CRITERION.id}", from that heading to the next heading — its bands, the prose around them and every dated amendment in it (each marked with its date). Read with it, under "## How a run is judged" earlier in that file, the reading paragraph (what a judge reads, and that a run whose analysis.json or report.html is missing is not scored) and the "Unattended runs" bullets. The text as it now stands is the only text that governs; read it yourself rather than relying on any summary of it, including any in this prompt.`,
    `- Any other file of the skill that the section tells you to read or compare against (under ${SKILL}/references/ or ${SKILL}/evals/fixtures/), at the part it names.`,
    `- The prompt and its preamble: ${SKILL}/evals/prompts.json, the entry with id ${item.prompt}.`,
    `- The run's inputs: every file under ${item.dir}/inputs/.`,
    `- The run's outputs: ${item.dir}/analysis.json, ${item.dir}/report.html, ${item.dir}/validate.json (the validator's stdout for analysis.json), the "result" field of ${item.dir}/transcript.json (the run's final message: read it in full; it is the only place an unattended run can put a question), and ${item.dir}/invocations.json, read in full: every Bash call in the run's message stream ${item.dir}/transcript.jsonl whose command names one of the skill's scripts, extracted by tools/eval-invocations.ts, each with its line in transcript.jsonl, its command, its outcome (ran, error, denied or no_result) and the head of its result. Do not read or grep transcript.jsonl: it runs to megabytes, and almost every line of it that mentions a script is a file read or a thought. invocations.json is the only record of which of the skill's scripts the run ran; transcript.json carries no tool call and is never evidence that a script ran. A call invokes a script when its command runs it, not when it only reads it, and a call whose outcome is denied was refused by the permission check and never ran. c6-priority-by-script and c8-html-renders ask for a script invocation, and each scores at most 1 when invocations.json lists no call invoking its script.`,
  ]
  if (EXPECTED_FILES[item.prompt]) lines.push(`- The expected file the rubric's reading paragraph names for prompt ${item.prompt}: ${EXPECTED_FILES[item.prompt]}; compare the run's analysis.json against it where the section says to.`)
  if (CRITERION.id === 'c12-prompt7-update') {
    lines.push(`- The update checker: run \`cd ${ROOT} && node ${SKILL}/scripts/update-check.ts ${SKILL}/evals/fixtures/update/before.fmea.json ${item.dir}/analysis.json\` under Node 24.2 or later (where Node is installed only through nvm, run \`source ~/.nvm/nvm.sh\` first, in the same shell call), and read the stale set it prints beside ${EXPECTED_FILES[7]}; a refusal, a non-zero exit with error lines, is the checker's verdict on the run's analysis.json, so quote it in the evidence and score c12 on the document as the rubric says.`)
  }
  return lines.join('\n')
}

// The two criteria that ask for a script invocation, as in evals.js: only for
// these does a missing or unreadable invocations.json leave the run unscored.
const INVOCATION_CRITERIA = ['c6-priority-by-script', 'c8-html-renders']

function notScored(item) {
  const files = `If ${item.dir}/analysis.json or ${item.dir}/report.html is missing, return scored false, name in evidence which of the two files is missing, and quote the reason the run's final message gives, as the rubric's reading paragraph says.`
  if (!INVOCATION_CRITERIA.includes(CRITERION.id)) return `The run is not scored in one case. ${files} The run is then recorded unverified, never scored 0.`
  return `The run is not scored in two cases. ${files} If ${item.dir}/invocations.json is missing or is not JSON, the run's script calls were never extracted, and ${CRITERION.id} asks for a script invocation: return scored false and say so in evidence. Either way the run is recorded unverified, never scored 0.`
}

function judgePrompt(item) {
  const hint = HINTS[CRITERION.id] ? `\n\n${HINTS[CRITERION.id](item)}` : ''
  return `You are re-judging one criterion, ${CRITERION.id}, on one unattended eval run of the fmea-software skill. You are not scoring any other criterion and not forming a verdict on the run as a whole.

Run: prompt ${item.prompt}, model capability ${item.model_capability}, run ${item.run}. Run directory: ${item.dir}

Read, in full, before scoring:
${readingList(item)}

Open nothing under ${EVALS} outside ${item.dir}: results.json, returned.json and the rulings notes there hold earlier judges' scores and evidence and the rulings' expected outcomes. Open no results note or acceptance note under ${ROOT}/docs/ either. This score stands on the run's files and the rubric alone.

Unattended runs cannot ask questions: the rubric's "Unattended runs" bullets say how c1 and, where it applies, c5 are judged in that setting. Expect rating-provisional lint warnings in validate.json; they count against nothing.

Score ${CRITERION.id} 0, 1 or 2 strictly by its bands and the amendment paragraphs of its section as they now stand, not by any earlier judge's evidence or score. Apply the section as written even where you would have drawn the line differently; if you think the section itself is wrong, score it as written and say so in notes. Where analysis.json exists but is not JSON, score 0 if the criterion reads it, and say so.

${notScored(item)}${hint}

Return:
- scored: true when you scored the run; false only in the case${INVOCATION_CRITERIA.includes(CRITERION.id) ? 's' : ''} above.
- score: 0, 1 or 2 (give 0 when scored is false; it is then not recorded).
- evidence: the JSON pointers, file lines and final-message text you relied on, quoted where this prompt asks for quotation.
- notes: anything a reader of this score should know, or an empty string.`
}

function runKey(item) {
  return `p${item.prompt} ${item.model_capability} run${item.run}`
}

// One judge for one run. Returns {score} or {unverified}; anything the judge
// returns that is not a score inside the schema becomes an unverified entry.
async function judge(item) {
  const unit = `rejudge ${CRITERION.id} ${runKey(item)}`
  const label = `rejudge ${SHORT_ID} ${runKey(item)}`
  const r = await tryAgent(judgePrompt(item), { label, phase: 'Re-judge', model: MODELS_BY_CAPABILITY.high, schema: SCORE_SCHEMA })
  if (!r) {
    log(`${label} returned nothing on three attempts; recorded as unverified and not a score`)
    return { unverified: { unit, detail: `the re-judging agent returned nothing on three attempts; ${CRITERION.id} was never re-scored for this run, so its stored score stands unreconciled` } }
  }
  if (typeof r.scored !== 'boolean' || !Number.isInteger(r.score) || r.score < 0 || r.score > 2 || typeof r.evidence !== 'string' || typeof r.notes !== 'string') {
    log(`${label} returned a result outside its schema; recorded as unverified and not a score`)
    return { unverified: { unit, detail: `the re-judging agent returned a result outside its schema (scored ${JSON.stringify(r.scored)}, score ${JSON.stringify(r.score)}); ${CRITERION.id} was never re-scored for this run, so its stored score stands unreconciled` } }
  }
  if (!r.scored) {
    const detail = `the judge did not score ${CRITERION.id}, as it does when the run left no analysis.json or report.html, or no invocations.json for a criterion that asks for a script invocation; its evidence: ${r.evidence || '(none)'}; its notes: ${r.notes || '(none)'}; this run is recorded unverified, never scored`
    log(`${label}: ${detail}`)
    return { unverified: { unit, detail } }
  }
  return { score: { prompt: item.prompt, model_capability: item.model_capability, run: item.run, dir: item.dir, score: r.score, evidence: r.evidence, notes: r.notes } }
}

const items = RUNS.map((r) => ({ ...r, dir: `${EVALS}/p${r.prompt}/${r.model_capability}/run${r.run}` }))
log(`re-judging ${CRITERION.id} alone on ${items.length} run${items.length === 1 ? '' : 's'} under ${EVALS_DIR}: ${items.map(runKey).join(', ')}`)

phase('Re-judge')
// A thunk that throws resolves to null in parallel(); judge() catches every agent
// failure through tryAgent(), so a null here is a defect of this script, and it
// is recorded unverified rather than dropped. The two lists are built in the
// order of args.runs, whatever order the judges finish in.
const outcomes = await parallel(items.map((item) => () => judge(item)))
const scores = []
const unverified = []
outcomes.forEach((outcome, i) => {
  if (outcome && outcome.score) scores.push(outcome.score)
  else if (outcome && outcome.unverified) unverified.push(outcome.unverified)
  else unverified.push({ unit: `rejudge ${CRITERION.id} ${runKey(items[i])}`, detail: `the re-judging step threw before it recorded a score or a reason; ${CRITERION.id} was never re-scored for this run, so its stored score stands unreconciled` })
})

const byScore = { 0: 0, 1: 0, 2: 0 }
for (const s of scores) byScore[s.score] += 1
log(
  `re-judged ${CRITERION.id}${CRITERION.must ? ' (must)' : ''} on ${scores.length} of ${items.length} runs: ${byScore[0]} scored 0, ${byScore[1]} scored 1, ${byScore[2]} scored 2; ` +
    `unverified: ${unverified.length === 0 ? 'none' : unverified.map((u) => u.unit).join(', ')}`,
)

return { models: MODELS_BY_CAPABILITY, criterion: CRITERION.id, scores, unverified }
