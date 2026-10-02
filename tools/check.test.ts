import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Host, Spawn } from "./lib/host.ts";
import { runChecks } from "./check.ts";

const ROOT = "/repo";
const BIN = "dev/node_modules/.bin";
const LIST = JSON.stringify({
  file_count: 4,
  files: [
    "skills/fmea-software/assets/report-template.html",
    "skills/fmea-software/scripts/lib/args.ts",
    "tools/check.ts",
    "dev/browser/matrix.ts",
  ],
});

/** A tool call as the fake tells them apart: `fallow list` and the bare `fallow` separately. */
type Step = "tsc" | "oxlint" | "fallow-list" | "fallow";

interface Call {
  command: string;
  args: string[];
  cwd: string;
  stdio: string;
  env: Record<string, string | undefined> | undefined;
}

/** A machine where Node 24.17 runs the checker from /opt/node/bin/node, every tool entry exists, and
 *  each tool exits with the status `statuses` gives it (0 by default). `fallow list` prints `list`.
 *  With `noNode`, no `node --version` probe succeeds. */
function fakeHost(
  options: {
    calls?: Call[];
    statuses?: Partial<Record<Step, number | null>>;
    list?: string;
    missing?: string[];
    env?: Record<string, string | undefined>;
    noNode?: boolean;
  } = {},
): Host {
  const calls = options.calls ?? [];
  const spawn: Spawn = (command, args, spawnOptions) => {
    if (args[0] === "--version") return options.noNode ? { status: null } : { status: 0, stdout: "v24.17.0\n" };
    calls.push({ command, args, cwd: spawnOptions.cwd, stdio: spawnOptions.stdio, env: spawnOptions.env });
    const tool = args[0].slice(BIN.length + 1);
    const key = (tool === "fallow" && args[1] === "list" ? "fallow-list" : tool) as Step;
    const statuses = options.statuses ?? {};
    const status = key in statuses ? (statuses[key] ?? null) : 0;
    return { status, stdout: key === "fallow-list" ? (options.list ?? LIST) : "" };
  };
  return {
    execPath: "/opt/node/bin/node",
    isNode: true,
    env: options.env ?? { PATH: "/usr/bin:/bin" },
    exists: (path) => !(options.missing ?? []).some((gone) => path === join(ROOT, gone) || path.startsWith(join(ROOT, gone) + "/")),
    listDir: () => [],
    spawn,
    home: "/home/u",
  };
}

function run(host: Host): { status: number; lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  const status = runChecks(ROOT, host, (line) => lines.push(line), (line) => errors.push(line));
  return { status, lines, errors };
}

/** Each tool call as `<tool> <args>`, with the Node and the entry path folded into the tool name. */
function toolCalls(calls: Call[]): string[] {
  return calls.map((call) => [call.args[0].slice(BIN.length + 1), ...call.args.slice(1)].join(" "));
}

test("all three steps pass: three headings, each tool once in order, exit 0", () => {
  const calls: Call[] = [];
  const result = run(fakeHost({ calls }));
  assert.equal(result.status, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.lines, [
    "## types: tsc -p tsconfig.json (node v24.17.0)",
    "## lint: oxlint --type-aware --deny-warnings skills tools dev/browser (node v24.17.0)",
    "## analysis: fallow list --files --format json, then fallow (node v24.17.0)",
  ]);
  assert.deepEqual(toolCalls(calls), [
    "tsc -p tsconfig.json",
    "oxlint --type-aware --deny-warnings skills tools dev/browser",
    "fallow list --files --format json",
    "fallow",
  ]);
});

test("a failing step does not stop the later ones, and the run exits 1", () => {
  for (const failing of ["tsc", "oxlint", "fallow"] as const) {
    const calls: Call[] = [];
    const result = run(fakeHost({ calls, statuses: { [failing]: 1 } }));
    assert.equal(result.status, 1, failing);
    assert.equal(result.lines.length, 3, failing);
    assert.deepEqual(result.errors, [], failing);
    assert.equal(calls.length, 4, failing);
  }
});

test("no Node 24.2 or later: the NODE line, exit 1, no step run", () => {
  const calls: Call[] = [];
  const result = run({ ...fakeHost({ calls, noNode: true }), isNode: false, execPath: "/bun" });
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, []);
  assert.deepEqual(result.errors, ["error NODE: no Node 24.2 or later found on PATH, in NVM_BIN, or under nvm's versions directory"]);
  assert.deepEqual(calls, []);
});

test("dev/node_modules absent: one TOOLING line, exit 1, no step run", () => {
  const calls: Call[] = [];
  const result = run(fakeHost({ calls, missing: ["dev/node_modules"] }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, []);
  assert.deepEqual(result.errors, ["error TOOLING: dev/node_modules is absent; run npm ci --prefix dev --ignore-scripts"]);
  assert.deepEqual(calls, []);
});

test("one tool's entry absent: TOOLING for that step, the other steps still run, exit 1", () => {
  const calls: Call[] = [];
  const result = run(fakeHost({ calls, missing: [`${BIN}/oxlint`] }));
  assert.equal(result.status, 1);
  assert.equal(result.lines.length, 3);
  assert.deepEqual(result.errors, [`error TOOLING: ${BIN}/oxlint is absent; run npm ci --prefix dev --ignore-scripts`]);
  assert.deepEqual(toolCalls(calls), ["tsc -p tsconfig.json", "fallow list --files --format json", "fallow"]);
});

test("a tool that cannot be started or ends without an exit status: TOOLING, exit 1", () => {
  const calls: Call[] = [];
  const result = run(fakeHost({ calls, statuses: { tsc: null } }));
  assert.equal(result.status, 1);
  assert.equal(calls.length, 4);
  assert.deepEqual(result.errors, ["error TOOLING: tsc could not be started or ended without an exit status; run npm ci --prefix dev --ignore-scripts"]);
});

test("fallow list exits non-zero: TOOLING, the bare fallow still runs, exit 1", () => {
  const calls: Call[] = [];
  const result = run(fakeHost({ calls, statuses: { "fallow-list": 2 } }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error TOOLING: fallow list exited with status 2; run npm ci --prefix dev --ignore-scripts"]);
  assert.equal(toolCalls(calls).at(-1), "fallow");
});

test("fallow list prints something that is not its JSON file list: TOOLING, exit 1", () => {
  for (const list of ["", "not json", "[]", '{"file_count": 1}', '{"file_count": 1, "files": [1]}']) {
    const result = run(fakeHost({ list }));
    assert.equal(result.status, 1, list);
    assert.deepEqual(result.errors, ["error TOOLING: fallow list printed no JSON file list; run npm ci --prefix dev --ignore-scripts"], list);
  }
});

test("fallow list names no .ts file under tools/ while fallow exits 0: EMPTY, the bare fallow still runs, exit 1", () => {
  const calls: Call[] = [];
  const list = JSON.stringify({ file_count: 2, files: ["skills/fmea-software/scripts/lib/args.ts", "dev/browser/matrix.ts"] });
  const result = run(fakeHost({ calls, list }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error EMPTY: fallow analysed no TypeScript file under tools/"]);
  assert.equal(toolCalls(calls).at(-1), "fallow");
});

test("fallow list names no .ts file under skills/: EMPTY, exit 1", () => {
  const list = JSON.stringify({ file_count: 2, files: ["tools/check.ts", "dev/browser/matrix.ts"] });
  const result = run(fakeHost({ list }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error EMPTY: fallow analysed no TypeScript file under skills/"]);
});

test("fallow list names no .ts file under dev/browser/: EMPTY, exit 1", () => {
  const list = JSON.stringify({ file_count: 2, files: ["skills/fmea-software/scripts/lib/args.ts", "tools/check.ts"] });
  const result = run(fakeHost({ list }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, ["error EMPTY: fallow analysed no TypeScript file under dev/browser/"]);
});

test("a list that holds only the HTML template is EMPTY for every folder", () => {
  const list = JSON.stringify({ file_count: 1, files: ["skills/fmea-software/assets/report-template.html"] });
  const result = run(fakeHost({ list }));
  assert.equal(result.status, 1);
  assert.deepEqual(result.errors, [
    "error EMPTY: fallow analysed no TypeScript file under skills/",
    "error EMPTY: fallow analysed no TypeScript file under tools/",
    "error EMPTY: fallow analysed no TypeScript file under dev/browser/",
  ]);
});

test("each tool is started through the resolved Node from the root, with that Node's directory first on PATH", () => {
  const calls: Call[] = [];
  run(fakeHost({ calls }));
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.command, "/opt/node/bin/node");
    assert.match(call.args[0], /^dev\/node_modules\/\.bin\/(tsc|oxlint|fallow)$/);
    assert.equal(call.cwd, ROOT);
    assert.equal(call.env?.PATH, "/opt/node/bin:/usr/bin:/bin");
  }
  assert.deepEqual(calls.map((call) => call.stdio), ["inherit", "inherit", "pipe", "inherit"]);
});

test("with no PATH at all the tools receive the resolved Node's directory as their PATH", () => {
  const calls: Call[] = [];
  run(fakeHost({ calls, env: {} }));
  assert.deepEqual(calls.map((call) => call.env?.PATH), ["/opt/node/bin", "/opt/node/bin", "/opt/node/bin", "/opt/node/bin"]);
});

test("a Node found as the bare command node leaves PATH as it is", () => {
  const calls: Call[] = [];
  run({ ...fakeHost({ calls }), isNode: false, execPath: "/bun" });
  assert.deepEqual(calls.map((call) => call.command), ["node", "node", "node", "node"]);
  assert.deepEqual(calls.map((call) => call.env?.PATH), ["/usr/bin:/bin", "/usr/bin:/bin", "/usr/bin:/bin", "/usr/bin:/bin"]);
});

test("only the lint step is told where oxlint's type-aware companion is", () => {
  const calls: Call[] = [];
  run(fakeHost({ calls }));
  assert.deepEqual(calls.map((call) => call.env?.OXLINT_TSGOLINT_PATH), [undefined, `${BIN}/tsgolint`, undefined, undefined]);
});

// Claude Code installs a plugin's Node packages on every user's machine when the plugin root holds a
// package.json and a lockfile. The tools are therefore declared in dev/, and the root must stay bare.
// This reads the files on disk, not git, so it also holds in an exported folder before `git init`.
test("the root package.json declares nothing and the root holds no lockfile", () => {
  const root = join(import.meta.dirname, "..");
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(manifest).sort(), ["name", "private", "type"]);
  for (const lockfile of ["package-lock.json", "npm-shrinkwrap.json", "bun.lock"]) {
    assert.equal(existsSync(join(root, lockfile)), false, `${lockfile} at the repository root`);
  }
});

const workflowText = (file: string): string => readFileSync(join(import.meta.dirname, "..", ".github", "workflows", file), "utf8");

/** The `run:` commands and the `uses:` actions of a workflow under `.github/workflows/`, in file order. */
function workflowSteps(file: string): { runs: string[]; uses: string[] } {
  const workflow = workflowText(file);
  return {
    runs: [...workflow.matchAll(/^\s*(?:-\s+)?run:\s*(.+?)\s*$/gm)].map((match) => match[1]),
    uses: [...workflow.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((match) => match[1]),
  };
}

/** The `browser` job's nine steps, each as the text it has in ci.yml: ids, conditions, environment, artifacts and retention are held word for word. */
const BROWSER_STEPS = [
  [
    "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    "        with:",
    "          fetch-depth: 0",
  ].join("\n"),
  [
    "      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0",
    "        with:",
    "          node-version: \"24\"",
  ].join("\n"),
  [
    "      - run: npm ci --prefix dev --ignore-scripts",
  ].join("\n"),
  [
    "      - run: node tools/check-browser.ts --fetch --with-deps --engines chromium,firefox,webkit",
  ].join("\n"),
  [
    "      - id: gate",
    "        run: node tools/check-browser.ts --engines chromium,firefox,webkit",
  ].join("\n"),
  [
    "      - id: shots",
    "        if: ${{ !cancelled() && steps.gate.outcome != 'skipped' }}",
    "        run: node tools/shots.ts --engines chromium,firefox,webkit",
  ].join("\n"),
  [
    "      - if: ${{ !cancelled() && (steps.gate.outcome == 'failure' || steps.shots.outcome == 'failure') }}",
    "        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
    "        with:",
    "          name: browser-checks",
    "          path: |",
    "            build/shots/",
    "            build/browser/",
    "          retention-days: 7",
  ].join("\n"),
  [
    "      - id: compare",
    "        if: ${{ !cancelled() && github.event_name == 'pull_request' && steps.gate.outcome != 'skipped' }}",
    "        env:",
    "          BASE: ${{ github.event.pull_request.base.sha }}",
    "        run: node tools/compare.ts --base \"$BASE\"",
  ].join("\n"),
  [
    "      - if: ${{ !cancelled() && (steps.compare.outcome == 'failure' || (steps.compare.outcome == 'success' && steps.compare.outputs.changed != '0')) }}",
    "        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
    "        with:",
    "          name: report-changes",
    "          path: |",
    "            build/compare/summary.md",
    "            build/compare/html/",
    "          retention-days: 14",
  ].join("\n"),
];

// The workflow's syntax is first proved when it runs on GitHub. Until then this pins what it runs and
// that every action is pinned to a commit, not to a tag that can be moved.
test("the CI workflow runs the suites and the gate in one job, the browser checks and the comparison in another, and pins every action by commit", () => {
  const { runs, uses } = workflowSteps("ci.yml");
  assert.deepEqual(runs, [
    "npm ci --prefix dev --ignore-scripts",
    "node tools/run-tests.ts",
    "node tools/check.ts",
    "npm ci --prefix dev --ignore-scripts",
    "node tools/check-browser.ts --fetch --with-deps --engines chromium,firefox,webkit",
    "node tools/check-browser.ts --engines chromium,firefox,webkit",
    "node tools/shots.ts --engines chromium,firefox,webkit",
    'node tools/compare.ts --base "$BASE"',
  ]);
  assert.deepEqual(
    uses.map((action) => action.split("@")[0]),
    ["actions/checkout", "actions/setup-node", "actions/checkout", "actions/setup-node", "actions/upload-artifact", "actions/upload-artifact"],
  );
  for (const action of uses) assert.match(action, /@[0-9a-f]{40}$/, action);
  const workflow = workflowText("ci.yml");
  assert.equal(workflow.split("contents: read").length - 1, 2, "each job reads the repository and nothing more");
  const [, browser] = workflow.split(/^ {2}browser:$/m);
  for (const block of BROWSER_STEPS) assert.equal(browser.split(block).length - 1, 1, block);
  assert.ok(!workflow.includes("if: ${{ !cancelled() }}\n"), "no step runs on a bare !cancelled() any more");
});

// The same pin for the workflow that publishes the sample report, which no pull request runs: it
// renders a fixture that exists into the folder it uploads, only the deploy job may publish, and
// the README links to the page it deploys.
test("the Pages workflow renders the sample analysis into the site it deploys, and pins every action by commit", () => {
  const root = join(import.meta.dirname, "..");
  const fixture = "skills/fmea-software/evals/fixtures/checkout-service.fmea.json";
  const { runs, uses } = workflowSteps("pages.yml");
  assert.deepEqual(runs, ["mkdir site", `node skills/fmea-software/scripts/render.ts ${fixture} --out site/index.html`]);
  assert.ok(existsSync(join(root, fixture)), fixture);
  assert.deepEqual(
    uses.map((action) => action.split("@")[0]),
    ["actions/checkout", "actions/setup-node", "actions/upload-pages-artifact", "actions/deploy-pages"],
  );
  for (const action of uses) assert.match(action, /@[0-9a-f]{40}$/, action);

  const workflow = workflowText("pages.yml");
  assert.doesNotMatch(workflow, /pull_request/, "a pull request must not trigger a deployment");
  assert.match(workflow, /^permissions: \{\}$/m, "no permission is granted by default");
  const [build, deploy] = workflow.split(/^ {2}deploy:$/m);
  assert.match(build, /^ {10}path: site$/m, "the uploaded folder is the one the render writes to");
  assert.doesNotMatch(build, /pages: write|id-token: write/, "the job that runs repository code cannot publish");
  for (const grant of ["pages: write", "id-token: write", "name: github-pages"]) {
    assert.ok(deploy.includes(grant), `the deploy job is missing: ${grant}`);
  }
  assert.ok(
    readFileSync(join(root, "README.md"), "utf8").includes("](https://nzneit.github.io/failwise/)"),
    "the README links to the published report",
  );
});
