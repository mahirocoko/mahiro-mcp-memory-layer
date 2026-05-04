import { createLocalReadOnlyMemoryReader } from "./features/memory-viewer/reader.js";
import { defaultMemoryViewerPort, memoryViewerHost, startMemoryViewerServer } from "./features/memory-viewer/server.js";

async function main(): Promise<void> {
  const reader = await createLocalReadOnlyMemoryReader();
  const port = parsePort(process.argv.slice(2));
  const { url } = await startMemoryViewerServer(reader, port);
  console.error(`Memory viewer listening on ${url}`);
  console.error(`Local only: bound to ${memoryViewerHost}. Press Ctrl+C to stop.`);
}

function parsePort(args: readonly string[]): number {
  const inline = args.find((arg) => arg.startsWith("--port="));
  const value = inline?.slice("--port=".length) ?? args[args.indexOf("--port") + 1];

  if (!value) {
    return defaultMemoryViewerPort;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid --port value: ${value}`);
  }

  return parsed;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
