import type { ZodRawShape } from "zod";

export interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodRawShape;
  readonly execute: (input: Record<string, unknown>) => Promise<unknown>;
}
