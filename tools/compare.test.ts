import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCompare } from "./compare.ts";
import { rowFileStem, rowStem, SECTION_PARTS, VIEWS } from "../dev/browser/matrix.ts";
import { fakeMachine, MERGE_BASE, viewReport, type FakeOptions, type ViewTest } from "./lib/fake-machine.ts";

const ROOT = "/repo";
const NODE = "/opt/node/bin/node";
const PW = "dev/node_modules/.bin/playwright";
const SHORT = MERGE_BASE.slice(0, 7);
const PARTS = [...SECTION_PARTS, "key", "index", "row-ch-1", "row-ch-2"];
const HTML = SECTION_PARTS.map((id) => `<section id="${id}"></section>`).join("") +
  '<section id="chains"><div class="key"></div><table class="index"></table>' +
  '<article class="row" id="row-ch-1"></article><article class="row" id="row-ch-2"></article></section>';
const N = PARTS.length * VIEWS.length; // views owed on one engine
/** Recorded from Playwright 1.63.0 on 2026-10-02 (spec section 3.3). */
const RECORDED_WITH = "1.63.0";
const SIZED = "Error: \u001b[2mexpect(\u001b[22m\u001b[31mlocator\u001b[39m\u001b[2m).\u001b[22mtoHaveScreenshot\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m)\u001b[22m failed\n\nLocator: locator('#header')\n  Expected an image 327px by 2957px, received 351px by 1930px. 57668 pixels (ratio 0.06 of all image pixels) are different.\n\n  Snapshot: 375--header.png\n";
/** A size change with no pixel count, as Playwright 1.63.0 wrote it on 2026-10-02 (its call log left off). */
const SIZE_ONLY = "Error: \u001b[2mexpect(\u001b[22m\u001b[31mlocator\u001b[39m\u001b[2m).\u001b[22mtoHaveScreenshot\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m)\u001b[22m failed\n\nLocator: locator('#reviews')\n  Expected an image 327px by 230px, received 327px by 231px. \n\n  Snapshot: 375/reviews.png\n";
const SAME_SIZE ="Error: \u001b[2mexpect(\u001b[22m\u001b[31mlocator\u001b[39m\u001b[2m).\u001b[22mtoHaveScreenshot\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m)\u001b[22m failed\n\nLocator: locator('#header')\n  2524 pixels (ratio 0.01 of all image pixels) are different.\n\n  Snapshot: 1280--header.png\n";

/** Every owed view of the default report on chromium, each an "expected" test. */
function owedTests(): ViewTest[] {
  return VIEWS.flatMap((view) => PARTS.map((stem) => ({ view: String(view), stem })));
}

/** Pass 2's results: every owed view on chromium "expected", except the tests given, which replace theirs. */
function second(...tests: ViewTest[]): string {
  const given = (one: ViewTest): ViewTest | undefined => tests.find((test) => test.view === one.view && test.stem === one.stem);
  return viewReport(...owedTests().map((one) => given(one) ?? one));
}

/** A pass's results with every owed view "expected" except the one named, which has no test. */
function without(view: string, stem: string): string {
  return viewReport(...owedTests().filter((one) => !(one.view === view && one.stem === stem)));
}
const secondWithout = without;
const firstWithout = without;

/** `html` with `<article class="row" id="<id>"></article>` inserted before its last `</section>`. */
function withRow(html: string, id: string): string {
  const at = html.lastIndexOf("</section>");
  return `${html.slice(0, at)}<article class="row" id="${id}"></article>${html.slice(at)}`;
}

/** Runs the comparison on a fake machine; `rendered` defaults to HTML on both sides. `calls` holds every child
 *  but `--version`, as "<command> <args>" for git and tar and as the arguments alone for Node. */
function run(argv: string[], fake: FakeOptions = {}): {
  status: number; lines: string[]; errors: string[]; calls: string[];
  env: Record<string, string | undefined>[]; removed: string[]; writes: string[];
  read: (path: string) => string | null; // the fake disk after the run
} {
  const recorded = fakeMachine("compare", ROOT, { ...fake, rendered: { before: HTML, after: HTML, ...fake.rendered } });
  const status = runCompare(argv, recorded.machine);
  const { lines, errors, removed, writes } = recorded;
  const calls = recorded.calls.map((call) => (call.command === NODE ? call.args : [call.command, ...call.args]).join(" "));
  const env = recorded.calls.map((call) => call.env ?? {});
  return { status, lines, errors, calls, env, removed, writes, read: recorded.machine.files.readText };
}

test("a row's comparison stem is its id reduced as the screenshot command reduces it, with no position", () => {
  assert.equal(rowStem("row-ch-2"), "row-ch-2");
  assert.equal(rowStem("row-a/b c"), "row-a-b-c");
  assert.equal(rowFileStem(12, "row-a/b c"), "row-12-a-b-c");
});

// The classes
test("no view changed: the no-change line, the engines not run, exit 0", () => {
  const result = run([]);
  assert.deepEqual([result.status, result.errors], [0, []]);
  assert.deepEqual(result.lines.slice(-2), [`## compare: no view of ${N} changed against ${SHORT}`, "## not run here: firefox, webkit"]);
  assert.ok(!result.writes.some((path) => path.startsWith("/repo/build/compare/changed/")));
});

test("views changed: the count line, one summary line each, and the three images of each", () => {
  const result = run([], { passes: { 2: second({ view: "1280", stem: "header", changed: true, message: SAME_SIZE }, { view: "375", stem: "row-ch-2", changed: true, message: SIZED }) } });
  assert.equal(result.status, 0);
  assert.equal(result.lines.at(-2), `## compare: 2 of ${N} views changed against ${SHORT} (build/compare/summary.md)`);
  const summary = result.read("/repo/build/compare/summary.md") ?? "";
  assert.ok(summary.includes("## Changed views: 2\n\n- chromium 375 row-ch-2: 57668 pixels differ, 327×2957 px before, 351×1930 px after\n- chromium 1280 header: 2524 pixels differ\n"));
  for (const kind of ["before", "after", "diff"]) {
    assert.ok(result.read(`/repo/build/compare/changed/chromium/1280/header.${kind}.png`) !== null, kind);
    assert.ok(result.read(`/repo/build/compare/changed/chromium/375/row-ch-2.${kind}.png`) !== null, kind);
  }
  assert.equal(result.writes.filter((path) => path.includes("/changed/")).length, 6);
});

test("a failed test without the three images: UNVERIFIED, exit 1, the summary written and incomplete", () => {
  const result = run([], { passes: { 2: second({ view: "1280", stem: "header", status: "unexpected", attachments: ["actual"] }) } });
  assert.deepEqual([result.status, result.errors], [1, ["error UNVERIFIED: chromium 1280 header: failed without the three images"]]);
  assert.ok(!result.lines.some((line) => line.startsWith("## compare: no view") || / views changed against /.test(line)));
  assert.match(result.read("/repo/build/compare/summary.md") ?? "", /## Unverified views: 1\n\nThe comparison is incomplete\.\n\n- chromium 1280 header: failed without the three images/);
});

test("a test with a status the runner does not know, or skipped: UNVERIFIED", () => {
  for (const status of ["interrupted", "skipped", "flaky"]) {
    const result = run([], { passes: { 2: second({ view: "1280", stem: "header", status }) } });
    assert.deepEqual([result.status, result.errors], [1, [`error UNVERIFIED: chromium 1280 header: status ${status}`]]);
  }
});

test("a view with no result in the second pass: UNVERIFIED", () => {
  const result = run([], { passes: { 2: secondWithout("1280", "header") } });
  assert.deepEqual([result.status, result.errors], [1, ["error UNVERIFIED: chromium 1280 header: no result in the second pass"]]);
});

test("a view whose reference the first pass did not write: UNVERIFIED, even when its second test passed", () => {
  const result = run([], { passes: { 1: firstWithout("1280", "header") } });
  assert.deepEqual([result.status, result.errors], [1, ["error UNVERIFIED: chromium 1280 header: the first pass wrote no reference"]]);
});

// The parts
test("a part on one side only is named as added or removed and is not photographed", () => {
  const result = run([], { rendered: { before: withRow(HTML, "row-ch-3"), after: withRow(HTML, "row-ch-4") } });
  assert.equal(result.status, 0);
  const summary = result.read("/repo/build/compare/summary.md") ?? "";
  assert.ok(summary.includes("## Parts added\n\n- row-ch-4\n"));
  assert.ok(summary.includes("## Parts removed\n\n- row-ch-3\n"));
  for (const env of result.env.filter((one) => one.FAILWISE_COMPARE_PASS !== undefined)) {
    assert.equal(env.FAILWISE_COMPARE_PARTS, PARTS.join(","));
  }
});

test("two rows that reduce to one file name: every view of both UNVERIFIED, neither photographed", () => {
  const html = HTML.replace("row-ch-1", "row-a/b").replace("row-ch-2", "row-a b");
  const result = run([], { rendered: { before: html, after: html } });
  assert.equal(result.status, 1);
  assert.equal(result.errors.length, VIEWS.length);
  assert.equal(result.errors[0], `error UNVERIFIED: chromium ${VIEWS[0]} row-a-b: more than one row id reduces to this file name (row-a/b, row-a b)`);
  assert.ok(!result.env.some((one) => one.FAILWISE_COMPARE_PARTS?.includes("row-a-b")));
});

// The passes
test("the first pass updates references from the before report, the second compares the after report", () => {
  const result = run([]);
  const passes = result.calls.filter((call) => call.startsWith(`${PW} test`));
  assert.deepEqual(passes, [
    `${PW} test --config dev/browser/compare.config.ts --project chromium --update-snapshots=all`,
    `${PW} test --config dev/browser/compare.config.ts --project chromium --update-snapshots=none`,
  ]);
  const envs = result.env.filter((one) => one.FAILWISE_COMPARE_PASS !== undefined);
  assert.deepEqual(envs.map((one) => [one.FAILWISE_COMPARE_PASS, one.FAILWISE_REPORT, one.FAILWISE_COMPARE_PARTS]), [
    ["1", "/repo/build/compare/before.html", PARTS.join(",")],
    ["2", "/repo/build/compare/after.html", PARTS.join(",")],
  ]);
  assert.deepEqual(result.lines.slice(0, 2), [
    "## compare: the base commit's report, playwright test over chromium (node v24.17.0)",
    "## compare: the working tree's report, playwright test over chromium (node v24.17.0)",
  ]);
});

test("a second pass that leaves no results file is UNVERIFIED, whatever the first left", () => {
  const result = run([], { passes: { 2: null } });
  assert.deepEqual([result.status, result.errors], [1, ["error UNVERIFIED: build/compare/pass2/results.json is absent or is not Playwright's JSON report"]]);
  assert.match(result.read("/repo/build/compare/summary.md") ?? "", new RegExp(`## Unverified views: ${N}`));
});

// The sides
test("the before render runs the unpacked tree's renderer on its own fixture, the after render the working tree's", () => {
  const { calls } = run([]);
  assert.deepEqual(calls.filter((call) => !call.startsWith(PW)), [
    "git rev-parse --verify --quiet main^{commit}",
    "git merge-base main HEAD",
    "git status --porcelain",
    `git archive --format=tar --output=build/compare/before.tar ${MERGE_BASE} skills`,
    "tar -xf build/compare/before.tar -C build/compare/before-tree",
    "build/compare/before-tree/skills/fmea-software/scripts/render.ts build/compare/before-tree/skills/fmea-software/evals/fixtures/checkout-service.fmea.json --out build/compare/before.html --force",
    "skills/fmea-software/scripts/render.ts skills/fmea-software/evals/fixtures/checkout-service.fmea.json --out build/compare/after.html --force",
  ]);
});

test("the summary names the before commit and both hashes, and says when the reports are the same", () => {
  const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
  const same = run([]).read("/repo/build/compare/summary.md") ?? "";
  assert.ok(same.includes(`- Before: ${MERGE_BASE}, where HEAD left main\n`));
  assert.ok(same.includes("- After: the working tree, with no uncommitted change\n"));
  assert.ok(same.includes(`- before.html SHA-256: ${sha(HTML)}\n- after.html SHA-256: ${sha(HTML)}\n- The two reports are byte for byte the same.\n`));
  const after = HTML + "<p>changed</p>";
  const differ = run(["--base", "HEAD"], { rendered: { before: HTML, after }, git: { dirty: true } }).read("/repo/build/compare/summary.md") ?? "";
  assert.ok(differ.includes(`- after.html SHA-256: ${sha(after)}\n`));
  assert.ok(!differ.includes("byte for byte"));
  assert.ok(differ.includes("- After: the working tree, with uncommitted changes\n"));
  assert.ok(differ.includes(", where HEAD left HEAD\n"));
});

// The failures to start
test("--base naming no commit: USAGE, nothing exported or rendered", () => {
  const result = run(["--base", "nope"], { git: { commit: false } });
  assert.deepEqual([result.status, result.errors], [1, ["error USAGE: --base names no commit: nope"]]);
  assert.ok(!result.calls.some((call) => call.startsWith("git archive") || call.includes("render.ts")));
});

test("no merge base: TOOLING", () => {
  const result = run([], { git: { mergeBase: null } });
  assert.deepEqual([result.status, result.errors], [1, ["error TOOLING: main and HEAD have no merge base"]]);
});

test("git status, git archive or tar failing: TOOLING, nothing rendered", () => {
  const cases: [FakeOptions, string][] = [
    [{ statuses: { gitStatus: 128 } }, "error TOOLING: git status exited 128"],
    [{ statuses: { archive: 128 } }, "error TOOLING: git archive exited 128; the base commit could not be exported"],
    [{ statuses: { tar: 2 } }, "error TOOLING: tar exited 2; the base commit could not be unpacked"],
  ];
  for (const [fake, line] of cases) {
    const result = run([], fake);
    assert.deepEqual([result.status, result.errors], [1, [line]]);
    assert.ok(!result.calls.some((call) => call.includes("render.ts")), line);
  }
});

test("either renderer failing: TOOLING, Playwright's tests not started", () => {
  const before = run([], { statuses: { renderBefore: 2 } });
  assert.deepEqual(before.errors, ["error TOOLING: the base commit's render.ts exited 2; its checkout fixture could not be rendered"]);
  const after = run([], { statuses: { render: 2 } });
  assert.deepEqual(after.errors, ["error TOOLING: render.ts exited 2; the checkout fixture could not be rendered"]);
  for (const result of [before, after]) assert.ok(!result.calls.some((call) => call.startsWith(`${PW} test`)));
});

test("a missing browser: BROWSER, no git call", () => {
  const result = run([], { missing: ["/cache/chromium-1"] });
  assert.match(result.errors[0], /^error BROWSER: /);
  assert.deepEqual(result.calls, [`${PW} install --dry-run chromium`]);
});

test("--report and --fetch belong to the other commands: USAGE", () => {
  assert.deepEqual(run(["--report", "x.html"]).errors, ["error USAGE: unknown flag --report"]);
  assert.deepEqual(run(["--fetch"]).errors, ["error USAGE: unknown flag --fetch"]);
});

// Housekeeping
test("build/compare is removed before anything runs, so an earlier run's results cannot stand in", () => {
  const stale = second();
  const result = run([], { present: { "/repo/build/compare/pass2/results.json": stale }, passes: { 2: null } });
  assert.ok(result.removed.includes("/repo/build/compare"));
  assert.equal(result.status, 1);
});

test("the tar file and the unpacked tree are removed after the before render, whether or not it succeeded", () => {
  for (const fake of [{}, { statuses: { renderBefore: 2 } }]) {
    const { removed } = run([], fake);
    assert.ok(removed.includes("/repo/build/compare/before.tar"));
    assert.ok(removed.includes("/repo/build/compare/before-tree"));
  }
});

test("both GitHub files written when set and the exit is 0; the output untouched on exit 1; neither written when unset", () => {
  const env = { GITHUB_STEP_SUMMARY: "/gh/summary", GITHUB_OUTPUT: "/gh/output" };
  const pass = run([], { env });
  assert.equal(pass.read("/gh/summary"), pass.read("/repo/build/compare/summary.md"));
  assert.equal(pass.read("/gh/output"), "changed=0\n");
  const fail = run([], { env, passes: { 2: second({ view: "1280", stem: "header", status: "interrupted" }) } });
  assert.equal(fail.read("/gh/output"), null);
  assert.notEqual(fail.read("/gh/summary"), null);
  assert.ok(run([]).writes.every((path) => path.startsWith("/repo/build/compare/")));
});

// The summary line and the version guard
test("a message with no pixel count: the summary line says changed", () => {
  const result = run([], { passes: { 2: second({ view: "1280", stem: "header", changed: true, message: "Error: screenshot differs" }) } });
  assert.ok((result.read("/repo/build/compare/summary.md") ?? "").includes("- chromium 1280 header: changed\n"));
});

test("the pixel count and sizes are read from the message Playwright 1.63.0 wrote, and dev/package.json still names that version", () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "dev", "package.json"), "utf8"));
  assert.equal(manifest.devDependencies["@playwright/test"], RECORDED_WITH, "Playwright changed: record its message again and check the wording");
  const result = run([], { passes: { 2: second({ view: "375", stem: "header", changed: true, message: SIZED }) } });
  assert.ok((result.read("/repo/build/compare/summary.md") ?? "").includes("- chromium 375 header: 57668 pixels differ, 327×2957 px before, 351×1930 px after\n"));
});

test("a message with the two sizes and no pixel count: the summary line keeps the sizes", () => {
  const result = run([], { passes: { 2: second({ view: "375", stem: "reviews", changed: true, message: SIZE_ONLY }) } });
  assert.equal(result.status, 0);
  assert.ok((result.read("/repo/build/compare/summary.md") ?? "").includes("- chromium 375 reviews: 327×230 px before, 327×231 px after\n"));
});

// The fix round
test("no part on both sides: UNVERIFIED, exit 1, no pass started, the summary written with the parts added and removed", () => {
  const env = { GITHUB_OUTPUT: "/gh/output" };
  const result = run([], { env, rendered: { before: '<section id="header"></section>', after: '<section id="actions"></section>' } });
  assert.deepEqual([result.status, result.errors], [1, ["error UNVERIFIED: no part of the report is on both sides, so nothing was compared"]]);
  assert.ok(!result.calls.some((call) => call.startsWith(`${PW} test`)));
  assert.ok(!result.lines.some((line) => line.startsWith("## compare:")));
  assert.equal(result.read("/gh/output"), null);
  const summary = result.read("/repo/build/compare/summary.md") ?? "";
  assert.ok(summary.includes("- Views compared: 0\n"));
  assert.ok(summary.includes("## Parts added\n\n- actions\n"));
  assert.ok(summary.includes("## Parts removed\n\n- header\n"));
  assert.ok(summary.includes("The comparison is incomplete."));
});

test("every owed part collided: each view UNVERIFIED with its reason, and no pass started with an empty list", () => {
  const html = '<article class="row" id="row-a/b"></article><article class="row" id="row-a b"></article>';
  const result = run([], { rendered: { before: html, after: html } });
  assert.equal(result.status, 1);
  assert.equal(result.errors.length, VIEWS.length);
  assert.ok(result.errors.every((line) => line.endsWith("row-a-b: more than one row id reduces to this file name (row-a/b, row-a b)")));
  assert.ok(!result.calls.some((call) => call.startsWith(`${PW} test`)));
});

test("a view the first pass reports as expected but whose reference file is absent: UNVERIFIED, even when its second test passed", () => {
  const result = run([], { unreferenced: ["1280 header"] });
  assert.deepEqual([result.status, result.errors], [1, ["error UNVERIFIED: chromium 1280 header: the first pass wrote no reference"]]);
});

// The Review Focus
test("a row id holding escaped characters is compared under the stem the browser computes", () => {
  const html = HTML.replace('id="row-ch-2"', 'id="row-ch&amp;2&quot;"');
  const result = run([], { rendered: { before: html, after: html } });
  assert.equal(result.status, 0);
  assert.ok(result.env.some((one) => one.FAILWISE_COMPARE_PARTS?.endsWith(",row-ch-2-")));
});

test("the GitHub files keep what earlier steps wrote in them", () => {
  const env = { GITHUB_STEP_SUMMARY: "/gh/summary", GITHUB_OUTPUT: "/gh/output" };
  const result = run([], { env, present: { "/gh/summary": "# earlier\n", "/gh/output": "x=1\n" } });
  assert.match(result.read("/gh/summary") ?? "", /^# earlier\n# Report comparison/);
  assert.equal(result.read("/gh/output"), "x=1\nchanged=0\n");
});

test("a changed view whose images cannot be copied is UNVERIFIED, not changed", () => {
  const result = run([], {
    passes: { 2: second({ view: "1280", stem: "header", changed: true, message: SAME_SIZE }) },
    lost: ["/repo/build/compare/output/views.compare.ts-1280-header-chromium/1280/header-diff.png"],
  });
  assert.deepEqual([result.status, result.errors], [1, ["error UNVERIFIED: chromium 1280 header: its images could not be copied"]]);
});

test("--base with no value or an empty one: USAGE, nothing started", () => {
  for (const argv of [["--base"], ["--base", ""]]) {
    const result = run(argv);
    assert.deepEqual([result.status, result.errors, result.calls], [1, ["error USAGE: --base needs a commit"], []]);
  }
});

test("two rows with one id: the views of that stem UNVERIFIED, exit 1", () => {
  const html = HTML.replace('id="row-ch-2"', 'id="row-ch-1"');
  const result = run([], { rendered: { before: html, after: html } });
  assert.equal(result.status, 1);
  assert.equal(result.errors[0], `error UNVERIFIED: chromium ${VIEWS[0]} row-ch-1: more than one row id reduces to this file name (row-ch-1, row-ch-1)`);
});

// The fail-closed branches
test("a view with a result on chromium only, when firefox is asked for too: UNVERIFIED on firefox, the chromium result does not stand in", () => {
  const both = ["chromium", "firefox"].flatMap((engine) => owedTests().map((one) => ({ ...one, engine })));
  const results = viewReport(...both.filter((one) => !(one.engine === "firefox" && one.view === "1280" && one.stem === "header")));
  const dryRun = "browser: chromium version 1\n  Install location:    /cache/chromium-1\nbrowser: firefox version 1\n  Install location:    /cache/firefox-1\n";
  const result = run(["--engines", "chromium,firefox"], { dryRun, passes: { 2: results } });
  assert.deepEqual([result.status, result.errors], [1, ["error UNVERIFIED: firefox 1280 header: no result in the second pass"]]);
});

test("one row stem reached from a different single id on each side: every view of it UNVERIFIED, naming both ids", () => {
  const before = HTML.replace("row-ch-1", "row-a/b");
  const after = HTML.replace("row-ch-1", "row-a b");
  const result = run([], { rendered: { before, after } });
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, VIEWS.map((view) => `error UNVERIFIED: chromium ${view} row-a-b: more than one row id reduces to this file name (row-a b, row-a/b)`));
  assert.ok(!result.env.some((one) => one.FAILWISE_COMPARE_PARTS?.includes("row-a-b")));
});

test("a rendered report that cannot be read: UNVERIFIED, exit 1, no pass started", () => {
  for (const side of ["before", "after"]) {
    const result = run([], { rendered: { [side]: null } });
    assert.deepEqual([result.status, result.errors], [1, [`error UNVERIFIED: build/compare/${side}.html could not be read`]]);
    assert.ok(!result.calls.some((call) => call.startsWith(`${PW} test`)), side);
  }
});

test("a first pass that leaves no results file: UNVERIFIED, exit 1, every view unverified in the summary", () => {
  const result = run([], { passes: { 1: null } });
  assert.deepEqual([result.status, result.errors], [1, ["error UNVERIFIED: build/compare/pass1/results.json is absent or is not Playwright's JSON report"]]);
  assert.match(result.read("/repo/build/compare/summary.md") ?? "", new RegExp(`## Unverified views: ${N}\n`));
});

// What a failed child says
test("git that cannot be started: TOOLING, not USAGE, nothing else started", () => {
  const result = run([], { statuses: { revParse: null } });
  assert.deepEqual([result.status, result.errors], [1, ["error TOOLING: git could not be started"]]);
  assert.deepEqual(result.calls, [`${PW} install --dry-run chromium`, "git rev-parse --verify --quiet main^{commit}"]);
});

test("a failing git archive shows its own stderr before the coded line, and only the coded line when it wrote none", () => {
  const line = "error TOOLING: git archive exited 128; the base commit could not be exported";
  const said = run([], { statuses: { archive: 128 }, stderr: { archive: "fatal: not a tree object\n" } });
  assert.deepEqual([said.status, said.errors], [1, ["fatal: not a tree object", line]]);
  const silent = run([], { statuses: { archive: 128 } });
  assert.deepEqual([silent.status, silent.errors], [1, [line]]);
});
