import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as zlib from 'node:zlib';
import * as tar from 'tar';

import type { ArchiveFormat } from '../types';

function getTarStream(sourceFolderPath: string) {
  const sourceFolderName = basename(sourceFolderPath);
  const sourceParent = dirname(sourceFolderPath);

  return tar.c(
    {
      cwd: sourceParent,
      portable: true,
      noMtime: true,
      strict: true,
    },
    [sourceFolderName],
  );
}

async function createTarBrotliArchive(sourceFolderPath: string, archivePath: string): Promise<void> {
  await mkdir(dirname(archivePath), { recursive: true });

  const tarStream = getTarStream(sourceFolderPath);
  const compressor = zlib.createBrotliCompress({
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
    },
  });

  await pipeline(tarStream, compressor, createWriteStream(archivePath));
}

async function createTarGzipArchive(sourceFolderPath: string, archivePath: string): Promise<void> {
  await mkdir(dirname(archivePath), { recursive: true });
  const tarStream = getTarStream(sourceFolderPath);
  const compressor = zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION });
  await pipeline(tarStream, compressor, createWriteStream(archivePath));
}

async function createTarZstdArchive(sourceFolderPath: string, archivePath: string): Promise<void> {
  const createZstdCompress = (zlib as typeof zlib & {
    createZstdCompress?: (options?: Record<string, unknown>) => NodeJS.ReadWriteStream;
  }).createZstdCompress;

  if (typeof createZstdCompress !== 'function') {
    throw new Error('The current Node.js runtime does not support zstd compression.');
  }

  await mkdir(dirname(archivePath), { recursive: true });
  const tarStream = getTarStream(sourceFolderPath);
  const compressor = createZstdCompress({
    params: {
      // Best-effort strong compression without making this implementation depend on unstable typings.
      1: 19,
    },
  });

  await pipeline(tarStream, compressor, createWriteStream(archivePath));
}

export function buildArchivePath(rootDir: string, folderDate: string, archiveFormat: ArchiveFormat): string {
  return resolve(rootDir, `${folderDate}.${archiveFormat}`);
}

export async function createArchive(
  sourceFolderPath: string,
  archivePath: string,
  archiveFormat: ArchiveFormat,
): Promise<void> {
  switch (archiveFormat) {
    case 'tar.br':
      await createTarBrotliArchive(sourceFolderPath, archivePath);
      return;
    case 'tar.gz':
      await createTarGzipArchive(sourceFolderPath, archivePath);
      return;
    case 'tar.zst':
      await createTarZstdArchive(sourceFolderPath, archivePath);
      return;
    default:
      throw new Error(`Unsupported archive format: ${archiveFormat}`);
  }
}
