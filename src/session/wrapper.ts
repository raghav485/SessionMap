import { spawn } from "node:child_process";

import { loadConfig } from "../config.js";
import { ensureDaemonRunning } from "../daemon/launcher.js";
import { endExplicitSession, startExplicitSession } from "../daemon/client.js";

class StdoutTailBuffer {
  private readonly lines: string[] = [];
  private partialLine = "";

  constructor(private readonly maxLines: number) {}

  append(chunk: string): void {
    if (this.maxLines === 0) {
      return;
    }

    const pieces = `${this.partialLine}${chunk}`.split(/\r?\n/u);
    this.partialLine = pieces.pop() ?? "";

    for (const piece of pieces) {
      this.lines.push(piece);
      if (this.lines.length > this.maxLines) {
        this.lines.shift();
      }
    }
  }

  toString(): string {
    const output = [...this.lines];
    if (this.partialLine) {
      output.push(this.partialLine);
    }
    return output.join("\n");
  }
}

export async function runTrackedCommand(
  projectRoot: string,
  command: string[],
  intent?: string
): Promise<number> {
  if (command.length === 0) {
    throw new Error("track requires a command after --");
  }

  const manifest = await ensureDaemonRunning(projectRoot);
  const { config } = loadConfig(projectRoot);
  const started = await startExplicitSession(manifest, {
    intent,
    agentCommand: command.join(" "),
    source: "explicit-wrapper"
  });

  const tailBuffer = new StdoutTailBuffer(config.session.captureStdout ? config.session.maxStdoutLines : 0);
  const child = spawn(command[0], command.slice(1), {
    cwd: projectRoot,
    stdio: ["inherit", "pipe", "inherit"]
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    tailBuffer.append(chunk.toString("utf8"));
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });

  try {
    await endExplicitSession(manifest, started.sessionId, {
      agentStdout: config.session.captureStdout ? tailBuffer.toString() : undefined,
      exitCode
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return exitCode ?? 1;
  }

  return exitCode ?? 1;
}
