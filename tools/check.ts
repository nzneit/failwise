// Runs the four static checks, the gate beside the test suites:
//
//   node tools/check.ts        # after `npm ci --prefix dev --ignore-scripts` once
//   bun tools/check.ts         # a shell where only Bun is on PATH
//
// 1. types:    tsc -p tsconfig.json
// 2. lint:     oxlint --type-aware --deny-warnings skills tools dev/browser
// 3. analysis: fallow list --files --format json, then a bare fallow
// 4. prose:    tools/check-prose.ts
//
// Each of the first three is the Node script under dev/node_modules/.bin.
// It starts from the repository root with the Node 24.2 or later that tools/lib/host.ts finds.
// So the gate never reaches the network and does not depend on which `node` is first on PATH,
// or on there being one.
// The fourth is a repository script, not a dev/node_modules tool, started the same way from the
// root.
// The verdict is each step's exit status and nothing else.
// `fallow list` only proves that fallow analysed TypeScript under each of skills/, tools/ and
// dev/browser/, since fallow exits 0 when it analyses nothing.
// Every step runs even after a failure.
// Exit status 0 when all four pass, 1 otherwise.
// It has three coded lines of its own: NODE (no Node 24.2 or later found), TOOLING and EMPTY.
// TOOLING means a tool absent, a tool or the prose script unstartable, or a `fallow list` that
// failed.
// EMPTY means no TypeScript file analysed under a folder.

import { delimiter, dirname, isAbsolute, join } from "node:path";
import { isEntry } from "./lib/entry.ts";
import { defaultHost, findNode, MIN_LABEL, type Host } from "./lib/host.ts";

const BIN = "dev/node_modules/.bin";
const INSTALL = "run npm ci --prefix dev --ignore-scripts";
const ANALYSED_FOLDERS = ["skills", "tools", "dev/browser"] as const;

interface Context {
  root: string;
  host: Host;
  node: string;
  env: Record<string, string | undefined>;
  writeError: (line: string) => void;
}

/** The environment every tool receives: the caller's, with the resolved Node's directory first on
 *  PATH when that Node is an absolute path, because oxlint starts its type-aware companion through a
 *  `#!/usr/bin/env node` launcher. */
function toolEnv(env: Record<string, string | undefined>, node: string): Record<string, string | undefined> {
  if (!isAbsolute(node)) return { ...env };
  const dir = dirname(node);
  return { ...env, PATH: env.PATH ? `${dir}${delimiter}${env.PATH}` : dir };
}

/** Starts one tool's entry through the resolved Node. Returns its exit status and captured stdout,
 *  or null after a TOOLING line when the entry is absent or the tool ends without a status. */
function runTool(
  ctx: Context,
  tool: string,
  args: string[],
  stdio: "inherit" | "pipe",
  extraEnv: Record<string, string> = {},
): { status: number; stdout: string } | null {
  const entry = `${BIN}/${tool}`;
  if (!ctx.host.exists(join(ctx.root, entry))) {
    ctx.writeError(`error TOOLING: ${entry} is absent; ${INSTALL}`);
    return null;
  }
  const result = ctx.host.spawn(ctx.node, [entry, ...args], { cwd: ctx.root, stdio, env: { ...ctx.env, ...extraEnv } });
  if (result.status === null) {
    ctx.writeError(`error TOOLING: ${tool} could not be started or ended without an exit status; ${INSTALL}`);
    return null;
  }
  return { status: result.status, stdout: result.stdout ?? "" };
}

/** Starts one repository script through the resolved Node from the root. Returns whether it exited 0;
 *  a TOOLING line follows when it could not be started or ended without an exit status. */
function runScript(ctx: Context, script: string): boolean {
  const result = ctx.host.spawn(ctx.node, [script], { cwd: ctx.root, stdio: "inherit", env: ctx.env });
  if (result.status === null) {
    ctx.writeError(`error TOOLING: ${script} could not be started or ended without an exit status`);
    return false;
  }
  return result.status === 0;
}

/** The files `fallow list --files --format json` names, or null when its output is not
 *  `{"file_count": N, "files": [...]}`. */
function listedFiles(stdout: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("files" in parsed)) return null;
  const files = parsed.files;
  if (!Array.isArray(files) || !files.every((file) => typeof file === "string")) return null;
  return files as string[];
}

/** Whether `fallow list` succeeded and names at least one .ts file under each analysed folder. The
 *  count alone proves nothing: it includes the HTML report template. */
function analysedEveryFolder(ctx: Context): boolean {
  const list = runTool(ctx, "fallow", ["list", "--files", "--format", "json"], "pipe");
  if (!list) return false;
  if (list.status !== 0) {
    ctx.writeError(`error TOOLING: fallow list exited with status ${list.status}; ${INSTALL}`);
    return false;
  }
  const files = listedFiles(list.stdout);
  if (!files) {
    ctx.writeError(`error TOOLING: fallow list printed no JSON file list; ${INSTALL}`);
    return false;
  }
  let complete = true;
  for (const folder of ANALYSED_FOLDERS) {
    if (!files.some((file) => file.startsWith(`${folder}/`) && file.endsWith(".ts"))) {
      ctx.writeError(`error EMPTY: fallow analysed no TypeScript file under ${folder}/`);
      complete = false;
    }
  }
  return complete;
}

/** Whether one tool ran and exited 0. */
function passes(ctx: Context, tool: string, args: string[], extraEnv: Record<string, string> = {}): boolean {
  return runTool(ctx, tool, args, "inherit", extraEnv)?.status === 0;
}

function printLine(line: string): void {
  process.stdout.write(line + "\n");
}

function printError(line: string): void {
  process.stderr.write(line + "\n");
}

export function runChecks(root: string, host: Host, write = printLine, writeError = printError): number {
  const node = findNode(host);
  if (!node) {
    writeError(`error NODE: no Node ${MIN_LABEL} or later found on PATH, in NVM_BIN, or under nvm's versions directory`);
    return 1;
  }
  if (!host.exists(join(root, "dev", "node_modules"))) {
    writeError(`error TOOLING: dev/node_modules is absent; ${INSTALL}`);
    return 1;
  }
  const ctx: Context = { root, host, node: node.path, env: toolEnv(host.env, node.path), writeError };
  const version = `(node v${node.version.join(".")})`;
  write(`## types: tsc -p tsconfig.json ${version}`);
  const types = passes(ctx, "tsc", ["-p", "tsconfig.json"]);
  write(`## lint: oxlint --type-aware --deny-warnings skills tools dev/browser ${version}`);
  const lint = passes(ctx, "oxlint", ["--type-aware", "--deny-warnings", "skills", "tools", "dev/browser"], {
    OXLINT_TSGOLINT_PATH: `${BIN}/tsgolint`,
  });
  write(`## analysis: fallow list --files --format json, then fallow ${version}`);
  const analysed = analysedEveryFolder(ctx);
  const analysis = passes(ctx, "fallow", []);
  write(`## prose: tools/check-prose.ts ${version}`);
  const prose = runScript(ctx, "tools/check-prose.ts");
  return types && lint && analysed && analysis && prose ? 0 : 1;
}

function main(): number {
  return runChecks(join(import.meta.dirname, ".."), defaultHost());
}

if (isEntry(import.meta)) {
  process.exit(main());
}
