type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function write(level: LogLevel, scope: string, message: string, fields?: Record<string, unknown>): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(fields ? { fields } : {})
  };

  process.stderr.write(`${JSON.stringify(line)}\n`);
}

export function createLogger(scope: string) {
  return {
    info(message: string, fields?: Record<string, unknown>) {
      write("INFO", scope, message, fields);
    },
    warn(message: string, fields?: Record<string, unknown>) {
      write("WARN", scope, message, fields);
    },
    error(message: string, fields?: Record<string, unknown>) {
      write("ERROR", scope, message, fields);
    },
    debug(message: string, fields?: Record<string, unknown>) {
      write("DEBUG", scope, message, fields);
    }
  };
}
