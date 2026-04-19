import { spawn } from "node:child_process";

export async function runTmuxCommand(command: string, args: readonly string[]): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${exitCode}.`));
    });
  });
}
