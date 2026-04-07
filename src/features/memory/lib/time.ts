export function nowIso(): string {
  return new Date().toISOString();
}

export function toTimestamp(input: string): number {
  return Date.parse(input);
}
