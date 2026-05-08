import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { paths } from "../../../config/paths.js";
import {
  resolveDefaultWikiRootDirectory,
  resolveWikiOutputLayout,
  type WikiGeneratedPage,
  type WikiMaterializerManifest,
  type WikiOutputLayout,
  type WikiOutputLayoutOptions,
} from "./contracts.js";

export interface WriteWikiMaterializationInput {
  readonly pages: readonly WikiGeneratedPage[];
  readonly manifest: WikiMaterializerManifest;
  readonly layoutOptions: WikiOutputLayoutOptions;
}

export interface WikiMaterializationWriteResult {
  readonly layout: WikiOutputLayout;
  readonly writtenPagePaths: readonly string[];
}

const expectedRootPagePaths = ["index.md", "log.md"] as const;
const canonicalMemoryDirectories = [
  paths.dataDirectory,
  paths.logDirectory,
  paths.tracesDirectory,
  paths.lanceDbDirectory,
  paths.canonicalLogFilePath,
  paths.retrievalTraceFilePath,
] as const;

export async function writeWikiMaterialization(input: WriteWikiMaterializationInput): Promise<WikiMaterializationWriteResult> {
  const layout = resolveWikiOutputLayout(input.layoutOptions);
  const outputDirProvided = input.layoutOptions.outputDir !== undefined;

  assertSafeWikiOutputDirectory(layout.scopeDirectory, outputDirProvided);

  const parentDirectory = path.dirname(layout.scopeDirectory);
  await mkdir(parentDirectory, { recursive: true });

  const stagingDirectory = await mkdtemp(path.join(parentDirectory, `${path.basename(layout.scopeDirectory)}.staging-`));
  const backupDirectory = path.join(parentDirectory, `${path.basename(layout.scopeDirectory)}.backup-${randomUUID()}`);
  const sortedPages = [...input.pages].sort((left, right) => compareText(left.relativePath, right.relativePath));
  const writtenPagePaths = sortedPages.map((page) => page.relativePath);
  const finalExists = await pathExists(layout.scopeDirectory);

  try {
    await writeWikiMaterializationTree(stagingDirectory, sortedPages, input.manifest);
    await validateWikiMaterializationTree(stagingDirectory);

    if (finalExists) {
      await rename(layout.scopeDirectory, backupDirectory);
    }

    await rename(stagingDirectory, layout.scopeDirectory);

    if (finalExists) {
      await rm(backupDirectory, { recursive: true, force: true });
    }

    return { layout, writtenPagePaths };
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });

    if (finalExists) {
      try {
        await rename(backupDirectory, layout.scopeDirectory);
      } catch {
        // Best effort only; the original tree was already moved out of the way.
      }

      await rm(backupDirectory, { recursive: true, force: true });
    }

    throw error;
  }
}

async function writeWikiMaterializationTree(
  stagingDirectory: string,
  pages: readonly WikiGeneratedPage[],
  manifest: WikiMaterializerManifest,
): Promise<void> {
  await mkdir(path.join(stagingDirectory, "records"), { recursive: true });
  await mkdir(path.join(stagingDirectory, "sources"), { recursive: true });

  await writeFile(path.join(stagingDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  for (const page of pages) {
    const targetPath = resolvePageTargetPath(stagingDirectory, page.relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, page.content, "utf8");
  }
}

async function validateWikiMaterializationTree(stagingDirectory: string): Promise<void> {
  for (const relativePath of expectedRootPagePaths) {
    await assertFileExists(path.join(stagingDirectory, relativePath));
  }

  await assertDirectoryExists(path.join(stagingDirectory, "records"));
  await assertDirectoryExists(path.join(stagingDirectory, "sources"));
  await assertFileExists(path.join(stagingDirectory, "manifest.json"));
}

function assertSafeWikiOutputDirectory(scopeDirectory: string, outputDirProvided: boolean): void {
  const resolvedScopeDirectory = path.resolve(scopeDirectory);

  if (!outputDirProvided) {
    const defaultRootDirectory = resolveDefaultWikiRootDirectory();

    if (!isPathInsideOrEqual(resolvedScopeDirectory, defaultRootDirectory)) {
      throw new Error(`Unsafe wiki output directory: ${resolvedScopeDirectory}`);
    }
  }

  for (const unsafeDirectory of canonicalMemoryDirectories) {
    if (pathsOverlap(resolvedScopeDirectory, path.resolve(unsafeDirectory))) {
      throw new Error(`Unsafe wiki output directory: ${resolvedScopeDirectory}`);
    }
  }
}

function resolvePageTargetPath(stagingDirectory: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Wiki page path must be relative: ${relativePath}`);
  }

  const resolvedPath = path.resolve(stagingDirectory, relativePath);

  if (!isPathInsideOrEqual(resolvedPath, stagingDirectory)) {
    throw new Error(`Wiki page path escapes the staging directory: ${relativePath}`);
  }

  return resolvedPath;
}

async function assertFileExists(filePath: string): Promise<void> {
  try {
    const entry = await stat(filePath);

    if (!entry.isFile()) {
      throw new Error(`Expected file to exist: ${filePath}`);
    }
  } catch {
    throw new Error(`Expected file to exist: ${filePath}`);
  }
}

async function assertDirectoryExists(directoryPath: string): Promise<void> {
  try {
    const entry = await stat(directoryPath);

    if (!entry.isDirectory()) {
      throw new Error(`Expected directory to exist: ${directoryPath}`);
    }
  } catch {
    throw new Error(`Expected directory to exist: ${directoryPath}`);
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isPathInsideOrEqual(candidatePath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function pathsOverlap(leftPath: string, rightPath: string): boolean {
  return isPathInsideOrEqual(leftPath, rightPath) || isPathInsideOrEqual(rightPath, leftPath);
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
