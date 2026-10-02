#!/usr/bin/env bash
# tools/run-eval.sh <prompt-id> <model-capability> <run-n>
#
# One unattended eval run (spec §10, plan reference §J and §K). Copies the
# prompt's fixture inputs into inputs/ under a scratch directory outside the
# repository, runs `claude -p` from there so the skill's ./analysis.json and
# ./report.html are not denied (Claude Code refuses writes under a --plugin-dir
# tree), saves the CLI's message stream as transcript.jsonl and its final result
# object as transcript.json, runs the validator on analysis.json into
# validate.json, copies the finished run into build/evals/p<id>/<capability>/run<n>/,
# and prints one summary line:
#   p<id> <capability> run<n>: model=<name> basis=<basis> effort=<effort> analysis=<present|missing> report=<present|missing> validate_exit=<n>
#
# Model capabilities, not model names (amended 2026-09-12 by the user's ruling
# at the eval re-run: the eval axis is a capability level, and the model that
# fills each level is runtime configuration, so the same harness runs on any
# provider's lineup). The second argument is the model capability the run is
# made at, high or medium; it names the run directory and every record the run
# produces, and it is never a model name. The model name the CLI is actually
# called with is resolved from a table: by default the provider scheme this
# repository has run on all along — Anthropic's high=opus, medium=sonnet,
# low=haiku — filled in unless otherwise specified. FMEA_EVAL_MODELS replaces
# the whole table when set, as 'high=glm-5.3,medium=glm-5.3-flash' or any other
# series' names: an unknown capability key, an empty value, or a table that
# names no model for the capability this run is at refuses the run before any
# model call is made. models.json in the finished run records the effective
# table and its basis, so the evidence can always say which model filled each
# capability; the summary line carries the same.
#
# The run's effort level is pinned, not inherited (amended 2026-09-12 by the
# user's ruling at the eval re-run): --effort high is passed to the CLI so a run
# does not take whatever effort the invoking session's settings carry. models.json
# and the summary line record it, so the evidence can always say what ran.
#
# The run is never pointed at this repository. --plugin-dir gets a filtered copy
# of the plugin, made under $TMPDIR for the run: .claude-plugin/ plus
# skills/fmea-software/ with evals/ left out and every *.test.ts stripped.
# evals/ holds the answer keys — the expected fixtures evals/fixtures/*expected*,
# prompt 1's golden evals/fixtures/checkout-service.fmea.json, and evals/rubric.md
# itself — and scripts/prompts.test.ts enumerates those file names, which is why
# the tests go too; a run never needs them. In the first sixteen runs
# --plugin-dir was the repository, so runs reached the keys: both p6/sonnet runs
# read the expected conversion before writing their answer, run 2 read the rubric
# as well, and p1/sonnet/run2 read the prompt 1 golden. The session names no path
# inside this repository, and the finished copy is searched for anything an
# answer key could be named before the run starts, so the fixtures copied into
# inputs/ are the only ones a run can see.
# Pointing --plugin-dir at the copy also keeps the CLI's plugin tooling out of
# the repository root, where a plugin install would otherwise be free to write
# node_modules beside package.json (D5: the repository ships no dependencies).
# The copy is passed to --add-dir as well, so Bash calls into it (ls, cat, grep,
# node <script>) are admitted; without it the file-access boundary denies them
# whatever --allowedTools says — see the ALLOWED_TOOLS comment below.
#
# Finished runs are published under $FMEA_EVAL_PUBLISH_ROOT, which defaults to
# $ROOT/build/evals, the tree the rest of the plan reads. The variable exists so
# tools/run-eval.test.ts can point a stubbed run at a temporary directory and
# never write into the repository.
#
# Requires `claude` and `node` 24.2 or later on PATH (where Node is installed only through nvm, run `source ~/.nvm/nvm.sh` first).
set -euo pipefail

# Set by the Task 30 preflight (Step 7), which records its determination as a
# dated comment line immediately above BARE=. --bare would keep the user's own
# ~/.claude skills, hooks, and CLAUDE.md out of the eval, but `claude --help`
# describes it as "Minimal mode: skip hooks, LSP, plugin sync, attribution,
# auto-memory, background prefetches, keychain reads, and CLAUDE.md
# auto-discovery", and adds that under it "Anthropic auth is strictly
# ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are
# never read)". Skipping plugin sync is why the preflight has to check that
# --plugin-dir still loads the skill; the auth clause is why a --bare run may
# not start at all. The default is therefore the empty string; the preflight
# promotes it to "--bare" only if a --bare run both authenticates and still
# lists the skill.
# preflight 2026-09-11: --bare did not list the fmea-software skill; BARE kept as ""
BARE=""

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIR="$ROOT/skills/fmea-software"
PROMPTS="$SKILL_DIR/evals/prompts.json"
# The commands the eval runs need. What this list does and does not control was
# measured on CLI 2.1.268 (probe 2026-09-11, --permission-mode dontAsk), not
# inferred: a Bash command whose path arguments stay inside the run's cwd is
# admitted whether or not each of its segments is listed (`ls -la . && echo
# marker` ran with only Bash(ls *) allowed), while a command naming a path
# outside the cwd is denied even when a list entry matches it exactly (`ls -la
# <dir>/skills/fmea-software` was denied under Bash(ls *), and denied again
# under the widened list below). The gate on those calls is the file-access
# boundary, not the allow-list, which is why the claude invocation passes
# --add-dir "$PLUGIN": with it the same `ls -la <plugin>/skills/fmea-software`
# is allowed, while a path inside this repository stays denied. The first sixteen
# runs (2026-09-11) were made under the narrower list with the repository as
# --plugin-dir, so their denials belonged to that harness rather than to the
# skill. They were repeated on 2026-09-12 with this script, which passes the
# scratch plugin copy to both --plugin-dir and --add-dir; those repeated runs are
# the ones the acceptance note scores, and it records the preflight's finding
# that bare mode is unavailable under this login.
ALLOWED_TOOLS="Read,Write,Edit,Glob,Grep,Bash(node *),Bash(ls *),Bash(cat *),Bash(cp *),Bash(mkdir *),Bash(find *),Bash(grep *),Bash(sed *),Bash(diff *),Bash(python3 *),Bash(wc *),Bash(head *),Bash(tail *),Bash(sort *),Bash(echo *),Bash(cd *)"
MAX_TURNS=80
# The effort the run pins (amended 2026-09-12 by the user's ruling at the eval
# re-run): --effort high is passed explicitly so a run does not inherit whatever
# effort the invoking session's settings carry. models.json and the summary line
# record it, so the evidence can always say what ran.
EFFORT="high"

usage() {
  echo "usage: tools/run-eval.sh <prompt-id: 1|5|6|7> <model-capability: high|medium> <run-n: positive integer>" >&2
  exit 1
}

[ "$#" -eq 3 ] || usage
PID="$1"; MODEL_CAPABILITY="$2"; RUN="$3"
case "$PID" in 1|5|6|7) ;; *) usage ;; esac
case "$MODEL_CAPABILITY" in high|medium) ;; *) usage ;; esac
[[ "$RUN" =~ ^[1-9][0-9]*$ ]] || usage

# The model table: one model name per model capability. Default: the provider
# scheme the repository has run on all along, Anthropic's. FMEA_EVAL_MODELS,
# when set, replaces the whole table — it is not merged key by key, so a launch
# states every capability it means to fill and a stale default cannot survive
# unexamined beside an override. Three rules, all checked before any model call:
# a pair naming an unknown capability refuses the run; an empty value refuses
# the run; and a table that names no model for the capability this run is at
# refuses the run. A capability the table leaves empty but this run does not use
# is not an error — a two-model launch need not name low.
MODELS_BY_CAPABILITY_HIGH="opus"
MODELS_BY_CAPABILITY_MEDIUM="sonnet"
MODELS_BY_CAPABILITY_LOW="haiku"
MODELS_BASIS="default (anthropic)"
if [ -n "${FMEA_EVAL_MODELS:-}" ]; then
  MODELS_BY_CAPABILITY_HIGH=""
  MODELS_BY_CAPABILITY_MEDIUM=""
  MODELS_BY_CAPABILITY_LOW=""
  MODELS_BASIS="FMEA_EVAL_MODELS"
  IFS=',' read -r -a _model_pairs <<< "$FMEA_EVAL_MODELS"
  for _pair in "${_model_pairs[@]}"; do
    case "$_pair" in
      high=*)  MODELS_BY_CAPABILITY_HIGH="${_pair#high=}" ;;
      medium=*) MODELS_BY_CAPABILITY_MEDIUM="${_pair#medium=}" ;;
      low=*)   MODELS_BY_CAPABILITY_LOW="${_pair#low=}" ;;
      *) echo "error: FMEA_EVAL_MODELS names an unknown model capability in '$_pair' (known: high, medium, low)" >&2; exit 1 ;;
    esac
  done
  for _cap in high medium low; do
    case "$_cap" in
      high) _value="$MODELS_BY_CAPABILITY_HIGH" ;;
      medium) _value="$MODELS_BY_CAPABILITY_MEDIUM" ;;
      low) _value="$MODELS_BY_CAPABILITY_LOW" ;;
    esac
    if [ -z "$_value" ]; then
      case ",$FMEA_EVAL_MODELS," in
        *",${_cap}=,"*) echo "error: FMEA_EVAL_MODELS names no model for the ${_cap} model capability (empty value)" >&2; exit 1 ;;
      esac
    fi
  done
fi
case "$MODEL_CAPABILITY" in
  high)   MODEL_NAME="$MODELS_BY_CAPABILITY_HIGH" ;;
  medium) MODEL_NAME="$MODELS_BY_CAPABILITY_MEDIUM" ;;
esac
if [ -z "$MODEL_NAME" ]; then
  echo "error: the model table ($MODELS_BASIS) names no model for the $MODEL_CAPABILITY model capability" >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || { echo "error: node is not on PATH (Node 24.2 or later is required; where Node is installed only through nvm, run: source ~/.nvm/nvm.sh)" >&2; exit 1; }
command -v claude >/dev/null 2>&1 || { echo "error: claude is not on PATH" >&2; exit 1; }
[ -f "$PROMPTS" ] || { echo "error: $PROMPTS not found" >&2; exit 1; }

# The prompt sent to the run: the unattended preamble, a blank line, the prompt text.
PROMPT_TEXT="$(node -e '
  const fs = require("node:fs");
  const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const q = p.prompts.find((x) => String(x.id) === process.argv[2]);
  if (!q) { process.stderr.write("unknown prompt id " + process.argv[2] + "\n"); process.exit(1); }
  process.stdout.write(p.unattended_preamble + "\n\n" + q.text);
' "$PROMPTS" "$PID")"

# The prompt's inputs, one skill-relative path per line (evals/fixtures/...).
INPUT_LIST="$(node -e '
  const fs = require("node:fs");
  const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const q = p.prompts.find((x) => String(x.id) === process.argv[2]);
  process.stdout.write(q.inputs.join("\n"));
' "$PROMPTS" "$PID")"

# Finished runs are published under $FMEA_EVAL_PUBLISH_ROOT (see the header); the
# layout beneath it is the one the rest of the plan reads. The directory is
# keyed on the model capability, never on the model name: a re-run under a
# different provider's lineup lands in the same tree and stays comparable.
PUBLISH_ROOT="${FMEA_EVAL_PUBLISH_ROOT:-$ROOT/build/evals}"
RUN_DIR="$PUBLISH_ROOT/p$PID/$MODEL_CAPABILITY/run$RUN"
if [ -e "$RUN_DIR/transcript.json" ]; then
  echo "error: $RUN_DIR already holds a transcript; delete the directory to re-run" >&2
  exit 1
fi

# The run must NOT be launched inside $ROOT. Claude Code denies every Write and
# Edit whose target path lies under a directory passed to --plugin-dir (verified
# on CLI 2.1.266: the identical write succeeds with --plugin-dir dropped and is
# denied with it, from a cwd inside or outside the tree), so a run whose cwd is
# $ROOT/build/evals/... can never create ./analysis.json. Working outside $ROOT
# also keeps the repository's own CLAUDE.md out of the eval session; the skill
# loads from the filtered plugin copy built below, and that copy's reference
# files and scripts stay readable and runnable by absolute path.

# Both scratch directories are removed by the EXIT trap. The trap is installed
# before the first mktemp, and cleanup skips a variable that is still empty, so a
# second mktemp that fails under `set -e` takes the first directory with it
# instead of leaking it.
WORK=""
PLUGIN=""
cleanup() {
  if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
  if [ -n "$PLUGIN" ]; then rm -rf "$PLUGIN"; fi
}
trap cleanup EXIT
WORK="$(mktemp -d "${TMPDIR:-/tmp}/fmea-eval-p${PID}-${MODEL_CAPABILITY}-run${RUN}-XXXXXX")"
PLUGIN="$(mktemp -d "${TMPDIR:-/tmp}/fmea-plugin-p${PID}-${MODEL_CAPABILITY}-run${RUN}-XXXXXX")"
mkdir -p "$WORK/inputs"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  cp "$SKILL_DIR/$rel" "$WORK/inputs/$(basename "$rel")"
done <<< "$INPUT_LIST"

# The record of which model filled each capability in this run, and at what
# effort. An empty value
# says the launch's table named none — honest for a capability the run did not
# use, and visibly so.
printf '{\n  "basis": "%s",\n  "models": { "high": "%s", "medium": "%s", "low": "%s" },\n  "effort": "%s"\n}\n' \
  "$MODELS_BASIS" "$MODELS_BY_CAPABILITY_HIGH" "$MODELS_BY_CAPABILITY_MEDIUM" "$MODELS_BY_CAPABILITY_LOW" "$EFFORT" \
  > "$WORK/models.json"

# The filtered plugin: everything the skill needs to run, no evals/ tree and no
# *.test.ts, so the answer keys are outside the run's reach — scripts/
# prompts.test.ts enumerates the answer keys' file names, and a run never needs
# the tests. $PLUGIN sits beside $WORK rather than inside it, so the publish copy
# below carries the run and not the plugin.
mkdir -p "$PLUGIN/skills"
cp -R "$ROOT/.claude-plugin" "$PLUGIN/.claude-plugin"
cp -R "$SKILL_DIR" "$PLUGIN/skills/fmea-software"
rm -rf "$PLUGIN/skills/fmea-software/evals"
find "$PLUGIN" -type f -name '*.test.ts' -delete
# Fail closed on the finished copy rather than on the path just deleted, which
# would prove nothing: the whole tree is searched for anything an answer key
# could be named — a directory named evals, rubric.md, any path inside the copy
# holding "expected", prompt 1's golden checkout-service.fmea.json, any
# *.test.ts — and the first hit stops the run before a model call is made. The
# "expected" clause is anchored at $PLUGIN/ because find matches -path against
# the whole absolute path, which begins with $TMPDIR: an unanchored '*expected*'
# would refuse every run made under a TMPDIR whose own name holds "expected",
# naming a path that holds no answer key.
LEAK="$(find "$PLUGIN" \( -type d -name evals -o -type f -name rubric.md -o -path "$PLUGIN/*expected*" -o -type f -name checkout-service.fmea.json -o -type f -name '*.test.ts' \) -print -quit)"
if [ -n "$LEAK" ]; then
  echo "error: the filtered plugin copy still holds an answer key: $LEAK; refusing to run" >&2
  exit 1
fi
# The validator the run's output is checked with is the copied one: same file,
# and running it never reaches back into the repository.
VALIDATOR="$PLUGIN/skills/fmea-software/scripts/validate.ts"

cd "$WORK"
# The run may exhaust --max-turns or fail; the summary line is still printed,
# so the CLI's exit status is reported rather than aborting the script.
# stream-json is the only --print output format that records tool_use blocks,
# and the rubric's c6 and c8 are scored on which scripts the run invoked;
# --output-format json emits the final result object alone. --verbose is
# required with stream-json under --print (the CLI exits 1 without it).
set +e
# shellcheck disable=SC2086  # $BARE is intentionally unquoted: empty means no flag.
claude -p "$PROMPT_TEXT" \
  $BARE \
  --plugin-dir "$PLUGIN" \
  --add-dir "$PLUGIN" \
  --model "$MODEL_NAME" \
  --effort "$EFFORT" \
  --permission-mode dontAsk \
  --allowedTools "$ALLOWED_TOOLS" \
  --output-format stream-json --verbose --no-session-persistence --max-turns "$MAX_TURNS" > transcript.jsonl
CLAUDE_EXIT=$?
set -e
[ "$CLAUDE_EXIT" -eq 0 ] || echo "p$PID $MODEL_CAPABILITY run$RUN: claude exited $CLAUDE_EXIT" >&2

# transcript.json keeps its meaning for the judge and for the re-run guard above:
# the single result object (type "result", with result, session_id,
# total_cost_usd, permission_denials) that --output-format json would have
# printed, taken from the stream's last result line.
node -e '
  const fs = require("node:fs");
  let last = null;
  for (const line of fs.readFileSync("transcript.jsonl", "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o && o.type === "result") last = o; } catch {}
  }
  fs.writeFileSync("transcript.json", JSON.stringify(last ?? { type: "result", subtype: "no_result_line", is_error: true, result: "" }, null, 2) + "\n");
'

# The validator is run even when analysis.json is missing (it then exits 3 with
# an IO_READ line), so validate_exit is always a number.
set +e
node "$VALIDATOR" analysis.json > validate.json 2> validate.stderr
VALIDATE_EXIT=$?
set -e

# Publish the run into the repository tree the rest of the plan reads.
mkdir -p "$RUN_DIR"
cp -R "$WORK/." "$RUN_DIR/"

ANALYSIS=missing; [ -f analysis.json ] && ANALYSIS=present
REPORT=missing;   [ -f report.html ]   && REPORT=present
echo "p$PID $MODEL_CAPABILITY run$RUN: model=$MODEL_NAME basis=$MODELS_BASIS effort=$EFFORT analysis=$ANALYSIS report=$REPORT validate_exit=$VALIDATE_EXIT"
