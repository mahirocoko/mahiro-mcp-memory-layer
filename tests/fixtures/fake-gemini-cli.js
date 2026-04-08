#!/usr/bin/env node

const args = process.argv.slice(2);

function readFlag(flag) {
  const index = args.indexOf(flag);

  if (index < 0 || index + 1 >= args.length) {
    return undefined;
  }

  return args[index + 1];
}

const model = readFlag("-m") ?? "unknown-model";
const prompt = readFlag("-p") ?? "";

process.stdout.write(
  `${JSON.stringify({
    response: `fake gemini response: ${prompt}`,
    stats: { model },
  })}\n`,
);
