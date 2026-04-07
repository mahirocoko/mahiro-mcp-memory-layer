export interface EmbeddingProvider {
  readonly version: string;
  readonly dimensions: number;
  embedText(input: string): Promise<readonly number[]>;
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  public readonly version = "deterministic-v0";

  public constructor(public readonly dimensions: number) {}

  public async embedText(input: string): Promise<readonly number[]> {
    const values = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenize(input);

    if (tokens.length === 0) {
      return values;
    }

    for (const token of tokens) {
      const hash = hashToken(token);
      const index = Math.abs(hash % this.dimensions);
      const sign = hash % 2 === 0 ? 1 : -1;
      values[index] = (values[index] ?? 0) + sign * 1;
    }

    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));

    if (magnitude === 0) {
      return values;
    }

    return values.map((value) => value / magnitude);
  }
}

function tokenize(input: string): readonly string[] {
  return input
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function hashToken(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}
