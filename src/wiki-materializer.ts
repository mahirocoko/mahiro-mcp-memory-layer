import { runWikiMaterializerCli } from "./features/memory/wiki-materializer/cli.js";

async function main(): Promise<void> {
  const result = await runWikiMaterializerCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
