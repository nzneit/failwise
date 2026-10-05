// Runs both test suites with Node's test runner, expanding the file lists here
// instead of in the shell, so the command behaves the same in bash and fish. A suite
// is every *.test.ts file in its folder and in the folders below it, node_modules
// left out.
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
// file checks. Every suite runs even after one fails. Exit status 0 when every suite
// passes, 1 when a suite fails, when a suite has no test file or a folder of it
// cannot be listed (an EMPTY line naming the folder), or when no Node 24.2 or later
// can be found (a NODE line).

import { join } from "node:path";
import { isEntry } from "./lib/entry.ts";
import { defaultHost, findNode, MIN_LABEL, type DirEntry, type Host } from "./lib/host.ts";

export interface Suite {
  name: string;
  dir: string;
}

export const SUITES: readonly Suite[] = [
  { name: "skill", dir: "skills/fmea-software/scripts" },
  { name: "tools", dir: "tools" },
];

/** A folder of a suite that could not be listed, relative to the root, and the error's message. */
export interface Unlisted {
  unlisted: string;
  reason: string;
}

/** The suite's files, or the first folder that could not be listed. */
export type Collected = { files: string[] } | Unlisted;

// node_modules holds packages, never this repository's tests.
const SKIPPED_FOLDER = "node_modules";

function listOrUnlisted(root: string, dir: string, listEntries: (path: string) => DirEntry[]): DirEntry[] | Unlisted {
  try {
    return listEntries(join(root, dir));
  } catch (err) {
    return { unlisted: dir, reason: err instanceof Error ? err.message : String(err) };
  }
}

function walk(root: string, dir: string, listEntries: (path: string) => DirEntry[], files: string[]): Unlisted | null {
  const entries = listOrUnlisted(root, dir, listEntries);
  if (!Array.isArray(entries)) return entries;
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (!entry.dir) {
      if (entry.name.endsWith(".test.ts")) files.push(path);
      continue;
    }
    if (entry.name === SKIPPED_FOLDER) continue;
    const failed = walk(root, path, listEntries, files);
    if (failed) return failed;
  }
  return null;
}

// Every *.test.ts file in the folder and the folders below it, node_modules left out, sorted and
// relative to the root. A symbolic link to a folder is not walked; a symbolic link whose own name
// ends in .test.ts is handed to node --test as it is.
export function collectTests(root: string, dir: string, listEntries: (path: string) => DirEntry[]): Collected {
  const files: string[] = [];
  return walk(root, dir, listEntries, files) ?? { files: files.sort() };
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
    const collected = collectTests(root, suite.dir, host.listEntries);
    if ("unlisted" in collected) {
      writeError(`error EMPTY: the ${suite.name} suite ran nothing: ${collected.unlisted}/ could not be listed (${collected.reason})`);
      status = 1;
      continue;
    }
    const { files } = collected;
    if (files.length === 0) {
      writeError(`error EMPTY: the ${suite.name} suite ran nothing: no *.test.ts file under ${suite.dir}/`);
      status = 1;
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
