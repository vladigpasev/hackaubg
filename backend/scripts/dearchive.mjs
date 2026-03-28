import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";
import * as tar from "tar";

function stripArchiveExtension(fileName) {
  if (fileName.endsWith(".tar.br")) {
    return fileName.slice(0, -".tar.br".length);
  }

  if (fileName.endsWith(".tar.gz")) {
    return fileName.slice(0, -".tar.gz".length);
  }

  if (fileName.endsWith(".tar.zst")) {
    return fileName.slice(0, -".tar.zst".length);
  }

  if (fileName.endsWith(".tar")) {
    return fileName.slice(0, -".tar".length);
  }

  const lastDot = fileName.lastIndexOf(".");
  return lastDot === -1 ? fileName : fileName.slice(0, lastDot);
}

async function extractArchive(archivePath, outputDir) {
  if (archivePath.endsWith(".tar.br")) {
    await pipeline(
      createReadStream(archivePath),
      zlib.createBrotliDecompress(),
      tar.x({ cwd: outputDir, strict: true }),
    );
    return;
  }

  if (archivePath.endsWith(".tar.gz")) {
    await pipeline(
      createReadStream(archivePath),
      zlib.createGunzip(),
      tar.x({ cwd: outputDir, strict: true }),
    );
    return;
  }

  if (archivePath.endsWith(".tar.zst")) {
    const createZstdDecompress = zlib.createZstdDecompress;
    if (typeof createZstdDecompress !== "function") {
      throw new Error(
        "This Node.js runtime does not support zstd decompression.",
      );
    }

    await pipeline(
      createReadStream(archivePath),
      createZstdDecompress(),
      tar.x({ cwd: outputDir, strict: true }),
    );
    return;
  }

  if (archivePath.endsWith(".tar")) {
    await pipeline(
      createReadStream(archivePath),
      tar.x({ cwd: outputDir, strict: true }),
    );
    return;
  }

  throw new Error(`Unsupported archive extension: ${archivePath}`);
}

async function main() {
  const archivePathArg = process.argv[2];

  if (!archivePathArg) {
    throw new Error("Usage: node scripts/dearchive.mjs <archive-path>");
  }

  const archivePath = resolve(archivePathArg);
  const archiveDir = dirname(archivePath);
  const archiveFileName = basename(archivePath);
  const archiveBaseName = stripArchiveExtension(archiveFileName);
  const outputDir = resolve(archiveDir, `dearchived_${archiveBaseName}`);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await extractArchive(archivePath, outputDir);

  console.log(`Extracted to: ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
