// The skill folder copied on its own, as a person may copy skills/fmea-software/ into a skills
// folder of their own, and its four scripts run there on the checkout fixture in the order the
// skill runs them: priority.ts --write, validate.ts --write, render.ts, then track.ts plan. The
// copy sits in a fresh temporary folder outside this repository, with no .claude-plugin/ in it or
// in any folder above it, so a script that needs a file outside skills/fmea-software/ fails here
// although every other test passes. The copy's path holds a space, as a home folder's may, so a
// script that finds its files through the URL of its own location, which writes a space as %20,
// fails here too. The fixture's computed block is removed first, so render.ts renders only what
// validate.ts --write wrote in the copy. track.ts plan reaches a stand-in for gh: a shell script,
// the only entry of PATH, that answers the two reads plan makes and refuses any other call, so no
// run can reach a real gh or the network. Each script is started with this Node by its absolute
// path and no shell, so the test behaves the same under bash and fish. Any non-zero exit, or any
// coded error line on stderr, fails the test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SKILL_DIR = join(ROOT, "skills", "fmea-software");
const CODED_LINE = /^error [A-Z][A-Z_]*: /;

// What `gh api --include` prints for the repository and for an empty first page of the labelled
// issues of the fixture's target, acme/checkout; any other call prints no answer and exits 1.
const STAND_IN_GH = `#!/bin/sh
for last; do :; done
case "$last" in
  repos/acme/checkout)
    printf 'HTTP/2.0 200 OK\\r\\nContent-Type: application/json\\r\\n\\r\\n{"visibility":"private","has_issues":true,"archived":false,"permissions":{"push":true}}' ;;
  repos/acme/checkout/issues\\?*)
    printf 'HTTP/2.0 200 OK\\r\\nContent-Type: application/json\\r\\n\\r\\n[]' ;;
  *)
    echo "stand-in gh: no answer for: $*" >&2
    exit 1 ;;
esac
`;

/** The nearest folder at or above `dir` that holds a .claude-plugin/ entry, or undefined. */
function manifestFolderAbove(dir: string): string | undefined {
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, ".claude-plugin"))) return d;
    if (dirname(d) === d) return undefined;
  }
}

/** A failure line for one script run that exited non-zero or printed a coded line, or undefined. */
function failureOf(label: string, result: ReturnType<typeof spawnSync>): string | undefined {
  const stderr = String(result.stderr);
  const coded = stderr.split("\n").filter((line) => CODED_LINE.test(line));
  return result.status === 0 && coded.length === 0 ? undefined : `${label} exited ${result.status}: ${stderr.trim()}`;
}

test("the four scripts run from a copy of skills/fmea-software/ alone, outside the repository and with no .claude-plugin/ above it", () => {
  const dir = mkdtempSync(join(tmpdir(), "skill-copy-"));
  try {
    const skill = join(dir, "my skills", "fmea-software");
    assert.ok(!skill.startsWith(ROOT + sep), `the copy ${skill} is inside the repository: set TMPDIR to a folder outside it`);
    cpSync(SKILL_DIR, skill, { recursive: true });
    const above = manifestFolderAbove(skill);
    assert.equal(above, undefined, `${above}/.claude-plugin/ sits above the copy: set TMPDIR to a folder with none above it`);

    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "gh"), STAND_IN_GH);
    chmodSync(join(bin, "gh"), 0o755);
    const doc = join(dir, "analysis.json");
    const fixture = JSON.parse(readFileSync(join(skill, "evals", "fixtures", "checkout-service.fmea.json"), "utf8")) as Record<string, unknown>;
    delete fixture.computed;
    writeFileSync(doc, JSON.stringify(fixture, null, 2) + "\n");
    const report = join(dir, "report.html");

    const runs: [string, string[]][] = [
      ["priority.ts --write", ["priority.ts", doc, "--write"]],
      ["validate.ts --write", ["validate.ts", doc, "--write"]],
      ["render.ts", ["render.ts", doc, "--out", report]],
      ["track.ts plan", ["track.ts", "plan", doc]],
    ];
    const results = runs.map(([label, [script, ...args]]) => {
      const result = spawnSync(process.execPath, [join(skill, "scripts", script), ...args], { cwd: dir, env: { ...process.env, PATH: bin }, encoding: "utf8" });
      return { label, result };
    });
    const failures = results.map(({ label, result }) => failureOf(label, result)).filter((f) => f !== undefined);
    assert.deepEqual(failures, [], "every script exits 0 with no coded line from the bare copy");

    const manifest = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8")) as { version: string };
    const written = JSON.parse(readFileSync(doc, "utf8")) as { computed?: { validator_version?: string } };
    assert.equal(written.computed?.validator_version, manifest.version, "validate.ts --write in the copy records the plugin's version");
    assert.ok(existsSync(report), "render.ts wrote the report in the copy");
    const plan = JSON.parse(String(results[3].result.stdout)) as { command?: string; target?: { visibility?: string } };
    assert.deepEqual([plan.command, plan.target?.visibility], ["plan", "private"], "track.ts plan read the target from the stand-in gh");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
