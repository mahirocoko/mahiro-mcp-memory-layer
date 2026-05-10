export function nowIso(): string {
  return new Date(Date.now()).toISOString();
}

export function toTimestamp(input: string): number {
  return Date.parse(input);
}
