import { MemoryService } from "../memory/memory-service.js";
import type { MemoryToolBackend } from "../memory/lib/tool-definitions.js";

export type OpenCodePluginMemoryBackend = MemoryToolBackend;

export interface OpenCodePluginTestOptions {
  readonly memory?: OpenCodePluginMemoryBackend;
  readonly createMemoryBackend?: () => Promise<OpenCodePluginMemoryBackend>;
  readonly messageDebounceMs?: number;
  readonly standaloneMcpAvailable?: boolean;
  readonly sessionVisibleRemindersAvailable?: boolean;
  readonly homeDirectory?: string;
  readonly opencodeConfigDirectory?: string;
}

let singletonMemoryBackendPromise: Promise<OpenCodePluginMemoryBackend> | undefined;

export function getOpenCodePluginMemoryBackend(
  testOptions: OpenCodePluginTestOptions | undefined,
): Promise<OpenCodePluginMemoryBackend> {
  if (testOptions?.memory) {
    return Promise.resolve(testOptions.memory);
  }

  return getOrCreateSingletonMemoryBackend(testOptions?.createMemoryBackend ?? createDefaultMemoryBackend);
}

export function resetOpenCodePluginMemoryBackendSingletonForTests(): void {
  singletonMemoryBackendPromise = undefined;
}

async function createDefaultMemoryBackend(): Promise<OpenCodePluginMemoryBackend> {
  return await MemoryService.create();
}

function getOrCreateSingletonMemoryBackend(
  createMemoryBackend: () => Promise<OpenCodePluginMemoryBackend>,
): Promise<OpenCodePluginMemoryBackend> {
  if (!singletonMemoryBackendPromise) {
    singletonMemoryBackendPromise = createMemoryBackend().catch((error) => {
      singletonMemoryBackendPromise = undefined;
      throw error;
    });
  }

  return singletonMemoryBackendPromise;
}
