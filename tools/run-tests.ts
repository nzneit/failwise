// Runs both test suites with Node's test runner, expanding the file lists here
// instead of in the shell, so the command behaves the same in bash and fish.
//
//   node tools/run-tests.ts        # Node 24.2 or later on PATH (bash: source ~/.nvm/nvm.sh)
//   bun tools/run-tests.ts         # a shell where only Bun is on PATH
//
// Either way the suites run under Node 24.2 or later (`node --test`, spec D5):
// when the runner itself is not running under such a Node it finds one through
// PATH, NVM_BIN, or the nvm install directory; that lookup is in tools/lib/host.ts.
// 24.2 is the floor, not 24.0, because every entry point reads `import.meta.main`,
// which Node 24 has only from 24.2: on 23.6 to 24.1, which strip types but lack
// it, a script that does not check first loads, runs nothing, and exits 0, so this
// file checks. Exit status 0 when every suite passes, 1 when a suite fails or no
// Node 24.2 or later can be found.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isEntry } from "./lib/entry.ts";
import { defaultHost, findNode, MIN_LABEL, type Host } from "./lib/host.ts";

export interface Suite {
  name: string;
  dir: string;
}

export const SUITES: readonly Suite[] = [
  { name: "skill", dir: "skills/fmea-software/scripts" },
  { name: "tools", dir: "tools" },
];

export function collectTests(root: string, dir: string, listDir: (path: string) => string[] = readdirSync): string[] {
  const full = join(root, dir);
  let names: string[];
  try {
    names = listDir(full);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(".test.ts"))
    .sort()
    .map((name) => join(dir, name));
}

// The suites run in a fresh test context: `node --test` marks its child
// processes with NODE_TEST_CONTEXT, and a runner started from inside one (this
// file's own end-to-end test, for instance) must not pass that mark on.
export function suiteEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const clean = { ...env };
  delete clean.NODE_TEST_CONTEXT;
  return clean;
}

export function runSuites(
  root: string,
  host: Host,
  write: (line: string) => void = (line) => process.stdout.write(line + "\n"),
  writeError: (line: string) => void = (line) => process.stderr.write(line + "\n"),
): number {
  const node = findNode(host);
  if (!node) {
    writeError(`error NODE: no Node ${MIN_LABEL} or later found on PATH, in NVM_BIN, or under nvm's versions directory`);
    return 1;
  }
  let status = 0;
  for (const suite of SUITES) {
    const files = collectTests(root, suite.dir, host.listDir);
    if (files.length === 0) {
      write(`## ${suite.name}: no *.test.ts files under ${suite.dir}/`);
      continue;
    }
    write(`## ${suite.name}: node --test over ${files.length} file(s) under ${suite.dir}/ (node v${node.version.join(".")})`);
    const result = host.spawn(node.path, ["--test", ...files], { cwd: root, stdio: "inherit", env: suiteEnv(host.env) });
    if (result.status !== 0) status = 1;
  }
  return status;
}

function main(): number {
  return runSuites(join(import.meta.dirname, ".."), defaultHost());
}

if (isEntry(import.meta)) {
  process.exit(main());
}
