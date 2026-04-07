import type { SequentialWorkerContext, WorkerJob } from "./types.js";

const templatePattern = /\{\{\s*([^}]+?)\s*\}\}/g;

export function interpolateWorkerJob(job: WorkerJob, context: SequentialWorkerContext): WorkerJob {
  return {
    ...job,
    input: interpolateValue(job.input, context) as typeof job.input,
  };
}

export function validateWorkerJobTemplates(job: WorkerJob): void {
  validateTemplateableValue(job.input);
}

function interpolateValue(value: unknown, context: SequentialWorkerContext): unknown {
  if (typeof value === "string") {
    return interpolateString(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, context));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolateValue(item, context)]),
    );
  }

  return value;
}

function validateTemplateableValue(value: unknown): void {
  if (typeof value === "string") {
    validateTemplateString(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      validateTemplateableValue(item);
    }

    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      validateTemplateableValue(item);
    }
  }
}

function validateTemplateString(template: string): void {
  for (const match of template.matchAll(templatePattern)) {
    const expression = match[1]?.trim();

    if (!expression) {
      throw new Error("Empty template expression is not allowed.");
    }

    validateTemplateExpression(expression);
  }
}

function validateTemplateExpression(expression: string): void {
  const helperCall = parseHelperCall(expression);

  if (helperCall) {
    validateHelperCall(helperCall.name, helperCall.argumentsSource, expression);
    return;
  }

  validatePathExpression(expression);
}

function interpolateString(template: string, context: SequentialWorkerContext): string {
  return template.replace(templatePattern, (_match, expression: string) => {
    const resolved = resolveExpression(expression.trim(), context);
    return formatResolvedValue(resolved, expression);
  });
}

function resolveExpression(expression: string, context: SequentialWorkerContext): unknown {
  const helperCall = parseHelperCall(expression);

  if (helperCall) {
    return resolveHelperCall(helperCall.name, helperCall.argumentsSource, context, expression);
  }

  return resolvePathExpression(expression, context);
}

function resolvePathExpression(expression: string, context: SequentialWorkerContext): unknown {
  const scope = {
    last: context.lastResult,
    lastResult: context.lastResult,
    results: context.results,
    steps: context.results,
    stepIndex: context.stepIndex,
  } as const;

  const path = expression.split(".").filter(Boolean);
  let current: unknown = scope;

  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);

      if (!Number.isInteger(index)) {
        throw new Error(`Template path segment '${segment}' is not a valid array index.`);
      }

      current = current[index];
      continue;
    }

    if (!current || typeof current !== "object") {
      throw new Error(`Template path '${expression}' could not be resolved.`);
    }

    current = (current as Record<string, unknown>)[segment];
  }

  if (current === undefined) {
    throw new Error(`Template path '${expression}' could not be resolved.`);
  }

  return current;
}

function parseHelperCall(expression: string): { readonly name: string; readonly argumentsSource: string } | undefined {
  const openParenIndex = expression.indexOf("(");

  if (openParenIndex <= 0 || !expression.endsWith(")")) {
    return undefined;
  }

  const name = expression.slice(0, openParenIndex).trim();

  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    return undefined;
  }

  let depth = 0;
  let inQuote: '"' | "'" | undefined;

  for (let index = openParenIndex; index < expression.length; index += 1) {
    const character = expression[index];

    if (inQuote) {
      if (character === "\\") {
        index += 1;
        continue;
      }

      if (character === inQuote) {
        inQuote = undefined;
      }

      continue;
    }

    if (character === '"' || character === "'") {
      inQuote = character;
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth -= 1;

      if (depth === 0 && index !== expression.length - 1) {
        return undefined;
      }
    }
  }

  if (depth !== 0 || inQuote) {
    return undefined;
  }

  return {
    name,
    argumentsSource: expression.slice(openParenIndex + 1, -1),
  };
}

function resolveHelperCall(
  name: string,
  argumentsSource: string,
  context: SequentialWorkerContext,
  originalExpression: string,
): unknown {
  const args = splitHelperArguments(argumentsSource);

  switch (name) {
    case "json":
      return resolveJsonHelper(args, context, originalExpression);
    case "default":
      return resolveDefaultHelper(args, context, originalExpression);
    default:
      throw new Error(`Unknown template helper '${name}'.`);
  }
}

function validateHelperCall(
  name: string,
  argumentsSource: string,
  originalExpression: string,
): void {
  const args = splitHelperArguments(argumentsSource);

  switch (name) {
    case "json":
      if (args.length !== 1) {
        throw new Error(`Template helper 'json' expects exactly one argument in '${originalExpression}'.`);
      }

      validateHelperArgument(args[0] as string);
      return;
    case "default":
      if (args.length !== 2) {
        throw new Error(`Template helper 'default' expects exactly two arguments in '${originalExpression}'.`);
      }

      validateHelperArgument(args[0] as string);
      validateHelperArgument(args[1] as string);
      return;
    default:
      throw new Error(`Unknown template helper '${name}'.`);
  }
}

function resolveJsonHelper(
  args: readonly string[],
  context: SequentialWorkerContext,
  originalExpression: string,
): string {
  if (args.length !== 1) {
    throw new Error(`Template helper 'json' expects exactly one argument in '${originalExpression}'.`);
  }

  return JSON.stringify(resolveHelperArgument(args[0] as string, context));
}

function resolveDefaultHelper(
  args: readonly string[],
  context: SequentialWorkerContext,
  originalExpression: string,
): unknown {
  if (args.length !== 2) {
    throw new Error(`Template helper 'default' expects exactly two arguments in '${originalExpression}'.`);
  }

  try {
    const value = resolveHelperArgument(args[0] as string, context);

    if (value === undefined || value === null || value === "") {
      return resolveHelperArgument(args[1] as string, context);
    }

    return value;
  } catch {
    return resolveHelperArgument(args[1] as string, context);
  }
}

function resolveHelperArgument(argumentSource: string, context: SequentialWorkerContext): unknown {
  const trimmed = argumentSource.trim();
  const literal = parseLiteralArgument(trimmed);

  if (literal.parsed) {
    return literal.value;
  }

  return resolveExpression(trimmed, context);
}

function validateHelperArgument(argumentSource: string): void {
  const trimmed = argumentSource.trim();
  const literal = parseLiteralArgument(trimmed);

  if (literal.parsed) {
    return;
  }

  validateTemplateExpression(trimmed);
}

function splitHelperArguments(argumentsSource: string): readonly string[] {
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let inQuote: '"' | "'" | undefined;

  for (let index = 0; index < argumentsSource.length; index += 1) {
    const character = argumentsSource[index];

    if (inQuote) {
      current += character;

      if (character === "\\") {
        index += 1;
        current += argumentsSource[index] ?? "";
        continue;
      }

      if (character === inQuote) {
        inQuote = undefined;
      }

      continue;
    }

    if (character === '"' || character === "'") {
      inQuote = character;
      current += character;
      continue;
    }

    if (character === "(") {
      depth += 1;
      current += character;
      continue;
    }

    if (character === ")") {
      depth -= 1;
      current += character;
      continue;
    }

    if (character === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function parseLiteralArgument(argument: string): { readonly parsed: boolean; readonly value?: unknown } {
  if (argument === "true") {
    return { parsed: true, value: true };
  }

  if (argument === "false") {
    return { parsed: true, value: false };
  }

  if (argument === "null") {
    return { parsed: true, value: null };
  }

  if (/^-?\d+(?:\.\d+)?$/.test(argument)) {
    return { parsed: true, value: Number(argument) };
  }

  if (argument.startsWith('"') && argument.endsWith('"')) {
    return { parsed: true, value: JSON.parse(argument) };
  }

  if (argument.startsWith("'") && argument.endsWith("'")) {
    return {
      parsed: true,
      value: argument.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\"),
    };
  }

  return { parsed: false };
}

function validatePathExpression(expression: string): void {
  const path = expression.split(".").filter(Boolean);

  if (path.length === 0) {
    throw new Error("Template path expression must not be empty.");
  }

  for (const segment of path) {
    if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
      throw new Error(`Template path segment '${segment}' is invalid.`);
    }
  }
}

function formatResolvedValue(value: unknown, expression: string): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  throw new Error(`Template path '${expression}' resolved to an unsupported value.`);
}
