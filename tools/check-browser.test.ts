import { test } from "node:test";
import assert from "node:assert/strict";
import { runGate } from "./check-browser.ts";
import { EXPECTED_FAILURES, expectedFailure, NOT_ASSERTED } from "../dev/browser/matrix.ts";
import { fakeMachine, report, type Call, type FakeOptions } from "./lib/fake-machine.ts";

const ROOT = "/repo";
const PLAYWRIGHT = "dev/node_modules/.bin/playwright";
const RESULTS = "/repo/build/browser/gate/results.json";
const NOT_FOUND = "error NODE: no Node 24.2 or later found on PATH, in NVM_BIN, or under nvm's versions directory";
const INSTALL = "run npm ci --prefix dev --ignore-scripts";
/** The line a passing gate run prints for the checks measured and not asserted, built from the matrix. */
const NOT_ASSERTED_LINE = `## not asserted: ${NOT_ASSERTED.map((open) => `${open.width}px ${open.check}`).join(", ")} (reasons in dev/browser/matrix.ts)`;

/** The options of the fake machine, unchanged for the gate: see tools/lib/fake-machine.ts. */
type Fake = FakeOptions;

/** Runs the gate on a fake machine. `calls` holds every child but `--version`, as its arguments
 *  joined by a space with the Node path dropped; `env` the FAILWISE_REPORT each call received. */
function run(
  argv: string[],
  fake: Fake = {},
): { status: number; lines: string[]; errors: string[]; calls: string[]; env: (string | undefined)[]; removed: string[]; raw: Call[] } {
  const { machine, calls, lines, errors, removed } = fakeMachine("gate", ROOT, fake);
  const status = runGate(argv, machine);
  return {
    status,
    lines,
    errors,
    calls: calls.map((call) => call.args.join(" ")),
    env: calls.map((call) => call.env?.FAILWISE_REPORT),
    removed,
    raw: calls,
  };
}

test("the default run: dry run, render, Playwright on chromium, the other engines named, exit 0", () => {
  const result = run([]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.calls, [
    `${PLAYWRIGHT} install --dry-run chromium`,
    "skills/fmea-software/scripts/render.ts skills/fmea-software/evals/fixtures/checkout-service.fmea.json --out build/browser/report.html --force",
    `${PLAYWRIGHT} test --config dev/browser/playwright.config.ts --project chromium`,
  ]);
  assert.deepEqual(result.lines, ["## gate: playwright test over chromium (node v24.17.0)", NOT_ASSERTED_LINE, "## not run here: firefox, webkit"]);
  assert.equal(result.env[2], "/repo/build/browser/report.html");
});

test("all three engines: one --project each, and no line about engines not run", () => {
  const result = run(["--engines", "webkit,chromium,firefox"]);
  assert.equal(result.status, 0);
  assert.match(result.calls[2], /--project chromium --project firefox --project webkit$/);
  assert.deepEqual(result.lines, ["## gate: playwright test over chromium, firefox, webkit (node v24.17.0)", NOT_ASSERTED_LINE]);
});

test("a repeated engine is run once; an empty item is USAGE", () => {
  assert.match(run(["--engines", "chromium,chromium"]).calls[2], /--project chromium$/);
  const result = run(["--engines", "chromium,"]);
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error USAGE: --engines needs a comma-separated list of chromium, firefox, webkit"]);
  assert.deepEqual(result.calls, []);
});

test("an unknown flag, an unknown engine, a flag without its value, --with-deps alone: USAGE, nothing started", () => {
  const cases: [string[], string][] = [
    [["--fast"], "error USAGE: unknown flag --fast"],
    [["--engines", "safari"], "error USAGE: unknown engine safari; the engines are chromium, firefox, webkit"],
    [["--engines"], "error USAGE: --engines needs a comma-separated list of chromium, firefox, webkit"],
    [["--report"], "error USAGE: --report needs a path"],
    [["--with-deps"], "error USAGE: --with-deps is only used with --fetch"],
  ];
  for (const [argv, line] of cases) {
    const result = run(argv);
    assert.equal(result.status, 1, line);
    assert.deepEqual(result.errors, [line]);
    assert.deepEqual(result.calls, []);
  }
});

test("no Node 24.2 or later: NODE, nothing started", () => {
  const result = run([], { noNode: true });
  assert.deepEqual([result.status, result.errors, result.calls], [1, [NOT_FOUND], []]);
});

test("dev/node_modules or Playwright's entry absent: TOOLING, nothing started", () => {
  for (const gone of ["dev/node_modules", PLAYWRIGHT]) {
    const result = run([], { missing: [gone] });
    assert.deepEqual([result.status, result.errors, result.calls], [1, [`error TOOLING: ${gone} is absent; ${INSTALL}`], []]);
  }
});

test("an engine's build absent: BROWSER with the fetch command, Playwright's tests not started", () => {
  const result = run([], { missing: ["/cache/chromium-1"] });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error BROWSER: /cache/chromium-1 is absent; run node tools/check-browser.ts --fetch --engines chromium"]);
  assert.deepEqual(result.calls, [`${PLAYWRIGHT} install --dry-run chromium`]);
  assert.ok(result.removed.includes("/repo/build/browser/gate"), "an earlier run's results do not survive a BROWSER line");
});

test("a dry run of three blocks, as Playwright 1.63 prints it, with the second build absent: one BROWSER line for it", () => {
  const dryRun = [
    "Chrome for Testing 153.0.8010.12 (playwright chromium v1243)",
    "  Install location:    /cache/chromium-1243",
    "  Download url:        https://example.invalid/chrome-linux64.zip",
    "",
    "FFmpeg (playwright ffmpeg v1011)",
    "  Install location:    /cache/ffmpeg-1011",
    "  Download url:        https://example.invalid/ffmpeg-linux.zip",
    "  Download fallback 1: https://example.invalid/fallback/ffmpeg-linux.zip",
    "",
    "Chrome Headless Shell 153.0.8010.12 (playwright chromium-headless-shell v1243)",
    "  Install location:    /cache/chromium_headless_shell-1243",
    "  Download url:        https://example.invalid/chrome-headless-shell-linux64.zip",
    "",
  ].join("\n");
  const result = run([], { dryRun, missing: ["/cache/ffmpeg-1011"] });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error BROWSER: /cache/ffmpeg-1011 is absent; run node tools/check-browser.ts --fetch --engines chromium"]);
  assert.equal(result.calls.length, 1);
});

test("a dry run that fails or names no location: TOOLING", () => {
  for (const fake of [{ dryRun: "nothing useful" }, { statuses: { dryRun: 1 } }]) {
    const result = run([], fake);
    assert.deepEqual([result.status, result.errors], [1, [`error TOOLING: playwright install --dry-run named no install location; ${INSTALL}`]]);
  }
});

test("the fixture cannot be rendered: TOOLING, Playwright's tests not started", () => {
  const result = run([], { statuses: { render: 2 } });
  assert.deepEqual(result.errors, ["error TOOLING: render.ts exited 2; the checkout fixture could not be rendered"]);
  assert.equal(result.calls.length, 2);
});

test("render.ts ends without an exit status: TOOLING, Playwright's tests not started", () => {
  const result = run([], { statuses: { render: null } });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error TOOLING: render.ts exited without a status; the checkout fixture could not be rendered"]);
  assert.ok(!result.calls.some((call) => call.startsWith(`${PLAYWRIGHT} test`)));
});

test("Playwright ends without an exit status: TOOLING", () => {
  const result = run([], { statuses: { test: null }, results: null });
  assert.equal(result.status, 1);
  assert.equal(result.errors[0], `error TOOLING: playwright could not be started or ended without an exit status; ${INSTALL}`);
});

test("a failing or flaky test, or a non-zero exit from Playwright: exit 1 with no coded line", () => {
  for (const fake of [
    { results: report(["chromium", "unexpected"]), statuses: { test: 1 } },
    { results: report(["chromium", "flaky"]) },
    { statuses: { test: 1 } },
  ]) {
    const result = run([], fake);
    assert.deepEqual([result.status, result.errors], [1, []]);
  }
});

test("a failing gate run prints no line about engines not run", () => {
  const result = run([], { statuses: { test: 1 } });
  assert.equal(result.status, 1);
  assert.ok(!result.lines.some((line) => line.startsWith("## not run here")), result.lines.join("\n"));
});

test("a failing gate run prints no line about checks not asserted", () => {
  const result = run([], { statuses: { test: 1 } });
  assert.equal(result.status, 1);
  assert.ok(!result.lines.some((line) => line.startsWith("## not asserted")), result.lines.join("\n"));
});

test("no report, an unreadable report, an engine with no test, a skipped test: UNVERIFIED", () => {
  const absent = "error UNVERIFIED: build/browser/gate/results.json is absent or is not Playwright's JSON report";
  const cases: [string[], Fake, string[]][] = [
    [[], { results: null }, [absent]],
    [[], { results: "not json" }, [absent]],
    [[], { results: JSON.stringify({ stats: {} }) }, [absent]],
    [["--engines", "chromium,firefox"], { results: report(["chromium", "expected"]) }, ["error UNVERIFIED: no test ran on firefox"]],
    [[], { results: report(["chromium", "expected"], ["chromium", "skipped"]) }, ["error UNVERIFIED: 1 test(s) were skipped"]],
  ];
  for (const [argv, fake, errors] of cases) {
    const result = run(argv, fake);
    assert.deepEqual([result.status, result.errors], [1, errors]);
  }
});

test("a test whose status the runner does not know, or that has none: UNVERIFIED", () => {
  const unknown = "error UNVERIFIED: 1 test(s) have a status the runner does not know";
  const noStatus = JSON.stringify({ suites: [{ specs: [{ tests: [{ projectName: "chromium", status: "expected" }, { projectName: "chromium" }] }] }] });
  for (const results of [report(["chromium", "expected"], ["chromium", "interrupted"]), noStatus]) {
    const result = run([], { results });
    assert.deepEqual([result.status, result.errors], [1, [unknown]]);
  }
});

test("a file's suite with no suites key and a spec list nested as Playwright 1.63 writes it is read", () => {
  const results = JSON.stringify({
    config: {},
    suites: [{ title: "report.spec.ts", file: "report.spec.ts", column: 0, line: 0, specs: [{ tests: [{ projectName: "chromium", expectedStatus: "passed", status: "expected" }] }] }],
    errors: [],
    stats: {},
  });
  const result = run([], { results });
  assert.deepEqual([result.status, result.errors], [0, []]);
});

test("a results file from an earlier run is removed before Playwright starts, so it cannot stand in", () => {
  const result = run([], { stale: report(["chromium", "expected"]), results: null });
  assert.equal(result.status, 1);
  assert.ok(result.removed.includes("/repo/build/browser/gate"));
  assert.match(result.errors[0], /^error UNVERIFIED: /);
});

test("--report: a relative path is resolved against the caller's directory and nothing is rendered", () => {
  const result = run(["--report", "out/r.html"], { cwd: "/work" });
  assert.equal(result.status, 0);
  assert.equal(result.calls.length, 2);
  assert.equal(result.env[1], "/work/out/r.html");
});

test("--report naming no file: USAGE, Playwright's tests not started", () => {
  const result = run(["--report", "/work/gone.html"], { missing: ["/work/gone.html"] });
  assert.deepEqual(result.errors, ["error USAGE: no such report: /work/gone.html"]);
  assert.equal(result.calls.length, 1);
});

test("--fetch starts Playwright's install for the engines named, runs no check, and returns its status", () => {
  assert.deepEqual(run(["--fetch"]).calls, [`${PLAYWRIGHT} install chromium`]);
  const ci = run(["--fetch", "--with-deps", "--engines", "chromium,firefox,webkit"], { statuses: { install: 3 } });
  assert.deepEqual(ci.calls, [`${PLAYWRIGHT} install --with-deps chromium firefox webkit`]);
  assert.equal(ci.status, 3);
});

test("--fetch whose install cannot be started or ends without an exit status: TOOLING, exit 1", () => {
  const result = run(["--fetch"], { statuses: { install: null } });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, [`error TOOLING: playwright could not be started or ended without an exit status; ${INSTALL}`]);
});

test("each child is started through the resolved Node from the root", () => {
  const { raw } = run([]);
  assert.equal(raw.length, 3);
  for (const call of raw) {
    assert.equal(call.command, "/opt/node/bin/node");
    assert.equal(call.cwd, ROOT);
  }
  assert.deepEqual(raw.map((call) => call.stdio), ["pipe", "inherit", "inherit"]);
});

test("the stale results file the fake starts with sits where the runner reads it", () => {
  const { machine } = fakeMachine("gate", ROOT, { stale: "{}" });
  assert.equal(machine.files.readText(RESULTS), "{}");
});

test("the phone-width layout checks are expected failures, and the tablet-width ones are measured and not asserted", () => {
  assert.deepEqual(EXPECTED_FAILURES.map((known) => `${known.width} ${known.check}`), ["375 scroll", "375 edge"]);
  assert.deepEqual(NOT_ASSERTED.map((open) => `${open.width} ${open.check}`), ["768 scroll", "768 edge"]);
  for (const entry of [...EXPECTED_FAILURES, ...NOT_ASSERTED]) {
    assert.match(entry.reason, /narrow-screen design/, `${entry.check} at ${entry.width}`);
  }
  for (const open of NOT_ASSERTED) {
    assert.match(open.reason, /fonts/, `${open.check} at ${open.width}`);
    assert.equal(expectedFailure(open.check, open.width), undefined, "a check is an expected failure or not asserted, never both");
  }
});
