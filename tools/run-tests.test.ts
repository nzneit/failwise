import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareVersions, defaultHost, findNode, MIN_VERSION, parseVersion, type Host } from "./lib/host.ts";
import { collectTests, runSuites, suiteEnv, SUITES } from "./run-tests.ts";

function fakeHost(overrides: Partial<Host> & { calls?: string[][] }): Host {
  const calls = overrides.calls ?? [];
  return {
    execPath: "/fake/node",
    isNode: true,
    env: {},
    exists: () => false,
    listDir: () => [],
    spawn: (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === "--version") return { status: 0, stdout: "v24.17.0\n" };
      return { status: 0 };
    },
    home: "/fake/home",
    ...overrides,
  };
}

test("collectTests keeps only *.test.ts, sorted, relative to the root", () => {
  const listDir = () => ["z.test.ts", "helper.ts", "a.test.ts", "notes.md"];
  assert.deepEqual(collectTests("/root", "tools", listDir), ["tools/a.test.ts", "tools/z.test.ts"]);
});

test("collectTests returns [] for a directory that does not exist", () => {
  const listDir = () => {
    throw new Error("ENOENT");
  };
  assert.deepEqual(collectTests("/root", "tools", listDir), []);
});

test("parseVersion and compareVersions handle nvm directory names", () => {
  assert.deepEqual(parseVersion("v24.17.0"), [24, 17, 0]);
  assert.deepEqual(parseVersion("22.1.3\n"), [22, 1, 3]);
  assert.equal(parseVersion("latest"), null);
  assert.ok(compareVersions([24, 17, 0], [24, 9, 9]) > 0);
  assert.ok(compareVersions([25, 0, 0], [24, 17, 0]) > 0);
  assert.equal(compareVersions([24, 0, 0], [24, 0, 0]), 0);
});

test("MIN_VERSION is 24.2.0, the first Node 24 with import.meta.main", () => {
  assert.deepEqual(MIN_VERSION, [24, 2, 0]);
});

test("findNode uses the running runtime when it is Node 24.2 or later", () => {
  const host = fakeHost({ execPath: "/opt/node24/bin/node" });
  assert.deepEqual(findNode(host), { path: "/opt/node24/bin/node", version: [24, 17, 0] });
});

test("findNode skips a runtime older than 24 and takes node from PATH", () => {
  const host = fakeHost({
    execPath: "/opt/node22/bin/node",
    spawn: (command, args) => {
      if (args[0] !== "--version") return { status: 0 };
      return { status: 0, stdout: command === "/opt/node22/bin/node" ? "v22.12.0\n" : "v24.17.0\n" };
    },
  });
  assert.deepEqual(findNode(host), { path: "node", version: [24, 17, 0] });
});

test("findNode skips a running Node 24.1, which lacks import.meta.main, and takes node 24.2 from PATH", () => {
  const host = fakeHost({
    execPath: "/opt/node24.1/bin/node",
    spawn: (command, args) => {
      if (args[0] !== "--version") return { status: 0 };
      return { status: 0, stdout: command === "/opt/node24.1/bin/node" ? "v24.1.0\n" : "v24.2.0\n" };
    },
  });
  assert.deepEqual(findNode(host), { path: "node", version: [24, 2, 0] });
});

test("findNode under Bun with no node on PATH falls back to NVM_BIN", () => {
  const host = fakeHost({
    execPath: "/home/u/.bun/bin/bun",
    isNode: false,
    env: { NVM_BIN: "/home/u/.nvm/versions/node/v24.17.0/bin" },
    spawn: (command, args) => {
      if (args[0] !== "--version") return { status: 0 };
      if (command === "node") return { status: null };
      return { status: 0, stdout: "v24.17.0\n" };
    },
  });
  assert.deepEqual(findNode(host), { path: "/home/u/.nvm/versions/node/v24.17.0/bin/node", version: [24, 17, 0] });
});

test("findNode scans nvm's versions directory and picks the highest 24.2 or later", () => {
  const host = fakeHost({
    isNode: false,
    execPath: "/home/u/.bun/bin/bun",
    env: {},
    home: "/home/u",
    listDir: (path) => {
      assert.equal(path, "/home/u/.nvm/versions/node");
      return ["v22.12.0", "v24.9.0", "v24.17.0", "junk"];
    },
    exists: (path) => path === "/home/u/.nvm/versions/node/v24.17.0/bin/node",
    spawn: () => ({ status: null }),
  });
  assert.deepEqual(findNode(host), { path: "/home/u/.nvm/versions/node/v24.17.0/bin/node", version: [24, 17, 0] });
});

test("findNode's nvm scan passes over v24.1.0 and picks v24.2.0", () => {
  const host = fakeHost({
    isNode: false,
    execPath: "/home/u/.bun/bin/bun",
    home: "/home/u",
    listDir: () => ["v24.1.0", "v24.2.0"],
    exists: (path) => path.startsWith("/home/u/.nvm/versions/node/"),
    spawn: () => ({ status: null }),
  });
  assert.deepEqual(findNode(host), { path: "/home/u/.nvm/versions/node/v24.2.0/bin/node", version: [24, 2, 0] });
});

test("with only v24.1.0 installed findNode returns null and runSuites fails with the 24.2 line", () => {
  const host = fakeHost({
    isNode: false,
    execPath: "/home/u/.bun/bin/bun",
    home: "/home/u",
    listDir: (path) => (path === "/home/u/.nvm/versions/node" ? ["v24.1.0"] : ["a.test.ts"]),
    exists: (path) => path === "/home/u/.nvm/versions/node/v24.1.0/bin/node",
    spawn: () => ({ status: null }),
  });
  assert.equal(findNode(host), null);
  const lines: string[] = [];
  const errors: string[] = [];
  assert.equal(runSuites("/root", host, (line) => lines.push(line), (line) => errors.push(line)), 1);
  assert.deepEqual(lines, []);
  assert.deepEqual(errors, ["error NODE: no Node 24.2 or later found on PATH, in NVM_BIN, or under nvm's versions directory"]);
});

test("findNode returns null when nothing qualifies", () => {
  const host = fakeHost({ isNode: false, execPath: "/bun", spawn: () => ({ status: null }), listDir: () => ["v20.0.0"] });
  assert.equal(findNode(host), null);
});

test("runSuites spawns node --test once per non-empty suite and reports failure", () => {
  const calls: string[][] = [];
  const lines: string[] = [];
  const host = fakeHost({
    calls,
    listDir: (path) => (path.endsWith("/tools") ? ["b.test.ts", "a.test.ts"] : ["x.ts"]),
    spawn: (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === "--version") return { status: 0, stdout: "v24.17.0\n" };
      return { status: args.includes("tools/b.test.ts") ? 1 : 0 };
    },
  });
  const status = runSuites("/root", host, (line) => lines.push(line));
  assert.equal(status, 1);
  const runs = calls.filter((call) => call[1] === "--test");
  assert.deepEqual(runs, [["/fake/node", "--test", "tools/a.test.ts", "tools/b.test.ts"]]);
  assert.equal(lines[0], "## skill: no *.test.ts files under skills/fmea-software/scripts/");
  assert.match(lines[1], /^## tools: node --test over 2 file\(s\) under tools\/ \(node v24\.17\.0\)$/);
});

test("runSuites returns 1 and prints the coded line when no Node 24.2 or later is found", () => {
  const host = fakeHost({ isNode: false, execPath: "/bun", spawn: () => ({ status: null }) });
  const lines: string[] = [];
  const errors: string[] = [];
  assert.equal(runSuites("/root", host, (line) => lines.push(line), (line) => errors.push(line)), 1);
  assert.deepEqual(lines, []);
  assert.deepEqual(errors, ["error NODE: no Node 24.2 or later found on PATH, in NVM_BIN, or under nvm's versions directory"]);
});

test("suiteEnv drops the test-runner context mark and keeps everything else", () => {
  assert.deepEqual(suiteEnv({ PATH: "/bin", NODE_TEST_CONTEXT: "child-v8" }), { PATH: "/bin" });
});

test("runSuites launches each suite with the cleaned environment", () => {
  const envs: Array<Record<string, string | undefined> | undefined> = [];
  const host = fakeHost({
    env: { PATH: "/bin", NODE_TEST_CONTEXT: "child-v8" },
    listDir: (path) => (path.endsWith("/tools") ? ["a.test.ts"] : []),
    spawn: (command, args, options) => {
      if (args[0] === "--version") return { status: 0, stdout: "v24.17.0\n" };
      envs.push(options.env);
      return { status: 0 };
    },
  });
  assert.equal(runSuites("/root", host, () => {}), 0);
  assert.deepEqual(envs, [{ PATH: "/bin" }]);
});

test("runSuites end to end: real node --test over a temporary tree", () => {
  const root = mkdtempSync(join(tmpdir(), "run-tests-"));
  try {
    for (const suite of SUITES) mkdirSync(join(root, suite.dir), { recursive: true });
    writeFileSync(join(root, "package.json"), '{"type": "module"}\n');
    writeFileSync(join(root, SUITES[0].dir, "pass.test.ts"), 'import { test } from "node:test";\ntest("ok", () => {});\n');
    writeFileSync(join(root, SUITES[1].dir, "fail.test.ts"), 'import { test } from "node:test";\nimport assert from "node:assert/strict";\ntest("no", () => { assert.equal(1, 2); });\n');
    const quiet: Host = { ...defaultHost(), spawn: (command, args, options) => defaultHost().spawn(command, args, { ...options, stdio: "pipe" }) };
    const lines: string[] = [];
    assert.equal(runSuites(root, quiet, (line) => lines.push(line)), 1);
    assert.equal(lines.length, 2);
    rmSync(join(root, SUITES[1].dir, "fail.test.ts"));
    assert.equal(runSuites(root, quiet, () => {}), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Every tool ends with one `isEntry(import.meta)` check from lib/entry.ts, so that on Node 23.6 to
// 24.1, which strip types but have no `import.meta.main`, the tool exits 1 with a NODE line instead
// of exiting 0 having run nothing. tools/entry.test.ts proves what isEntry does; this test pins that
// every tool uses it. The suites have no parser, so the rules read lines.

/** Whether a line is code: neither blank nor a `//` comment, wherever the comment starts. */
function isCodeLine(line: string): boolean {
  const text = line.trim();
  return text !== "" && !text.startsWith("//");
}

/** The last line that starts in column 0 and is not blank, a comment or a closing brace: the
 *  first line of the file's last top-level statement. */
function lastTopLevelLine(src: string): string | undefined {
  return src
    .split("\n")
    .filter((line) => /^\S/.test(line) && !/^(\/\/|\/\*|\})/.test(line))
    .at(-1);
}

test("each tool ends with one isEntry(import.meta) check and reads import.meta.main nowhere else", () => {
  const tools = readdirSync(import.meta.dirname).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts")).sort();
  assert.ok(tools.includes("run-tests.ts"), "tools/ lists no run-tests.ts");
  for (const name of tools) {
    const src = readFileSync(join(import.meta.dirname, name), "utf8");
    assert.equal(src.split("isEntry(import.meta)").length - 1, 1, `${name} must hold isEntry(import.meta) exactly once`);
    const reads = src.split("\n").filter((line) => isCodeLine(line) && line.includes("import.meta.main"));
    assert.deepEqual(reads, [], `${name} reads import.meta.main outside a comment`);
    assert.ok(lastTopLevelLine(src)?.startsWith("if (isEntry(import.meta))"), `${name} must end with the isEntry(import.meta) check`);
  }
});
