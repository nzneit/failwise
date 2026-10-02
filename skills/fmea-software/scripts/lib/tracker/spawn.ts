// Starts a process from an argument array, never through a shell, so no argument is ever
// interpreted: the analysis text that reaches `gh` arrives as the bytes it was (§8.1).

import { spawn } from "node:child_process";

/** `missing` is true when the command was not found; `status` is then null. */
export interface ProcessResult { status: number | null; stdout: string; stderr: string; missing: boolean }

/** Runs `command` with `args`, writes `input` (or nothing) to its stdin and closes it, and
 *  collects stdout and stderr as UTF-8. A command that cannot be started for any reason other
 *  than its absence rejects. */
export function runProcess(command: string, args: string[], input?: string): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let failed: NodeJS.ErrnoException | undefined;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    // A process that exits without reading its stdin breaks the pipe; its status still tells.
    child.stdin.on("error", () => undefined);
    child.on("error", (err: NodeJS.ErrnoException) => { failed = err; });
    child.on("close", (status) => {
      if (failed === undefined) resolve({ status, stdout, stderr, missing: false });
      else if (failed.code === "ENOENT") resolve({ status: null, stdout, stderr, missing: true });
      else reject(failed);
    });
    child.stdin.end(input ?? "");
  });
}
