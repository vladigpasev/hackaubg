import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type {
  ArchiveFolderResult,
  JsonArchiverOptions,
  NormalizedJsonArchiverOptions,
  WriteJsonRecordResult,
} from './types';
import { buildArchivePath, createArchive } from './utils/archive';
import { rowsToCsv, validateTransformRows } from './utils/csv';
import { getSofiaDateString } from './utils/dates';
import { buildSafeJsonFilePath } from './utils/ids';

function normalizeOptions(
  options: JsonArchiverOptions = {},
): NormalizedJsonArchiverOptions {
  return {
    rootDir: resolve(options.rootDir ?? './json-archive'),
    timeZone: options.timeZone ?? 'Europe/Sofia',
    archiveFormat: options.archiveFormat ?? 'tar.br',
  };
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function ensureCurrentSofiaFolder(
  options: NormalizedJsonArchiverOptions,
): Promise<string> {
  const todayFolderDate = getSofiaDateString(new Date(), options.timeZone);
  const todayFolderPath = resolve(options.rootDir, todayFolderDate);
  await ensureDirectory(todayFolderPath);
  return todayFolderPath;
}

async function assertDirectoryExists(path: string): Promise<void> {
  try {
    const pathStat = await stat(path);
    if (!pathStat.isDirectory()) {
      throw new Error(`Expected a directory at: ${path}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Source folder does not exist: ${path}`);
    }
    throw error;
  }
}

export function createJsonArchiver(options: JsonArchiverOptions = {}) {
  const normalizedOptions = normalizeOptions(options);

  async function writeJsonRecord(
    id: string,
    value: unknown,
  ): Promise<WriteJsonRecordResult> {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Invalid id. Expected a non-empty string.');
    }

    const folderDate = getSofiaDateString(
      new Date(),
      normalizedOptions.timeZone,
    );
    const folderPath = resolve(normalizedOptions.rootDir, folderDate);
    await ensureDirectory(folderPath);

    const filePath = buildSafeJsonFilePath(folderPath, id);
    const payload = JSON.stringify(value);
    await writeFile(filePath, payload, 'utf8');

    return {
      filePath,
      folderDate,
    };
  }

  async function archiveFolderByDate<
    TResultRow extends Record<string, unknown> = Record<string, unknown>,
  >(
    records_name: string,
    targetDateTime: Date,
    transform: () => TResultRow[] | Promise<TResultRow[]>,
  ): Promise<ArchiveFolderResult> {
    if (
      !(targetDateTime instanceof Date) ||
      Number.isNaN(targetDateTime.getTime())
    ) {
      throw new Error(
        'Invalid targetDateTime. Expected a valid Date instance.',
      );
    }

    if (typeof transform !== 'function') {
      throw new Error('Invalid transform. Expected a function.');
    }

    await ensureDirectory(normalizedOptions.rootDir);

    const folderDate = getSofiaDateString(
      targetDateTime,
      normalizedOptions.timeZone,
    );
    const sourceFolderPath = resolve(normalizedOptions.rootDir, folderDate);
    await assertDirectoryExists(sourceFolderPath);

    const transformResult = await transform();
    validateTransformRows(transformResult);

    const csvPath = resolve(sourceFolderPath, `summary.${records_name}.csv`);
    const csvContent = rowsToCsv(transformResult);
    await writeFile(csvPath, csvContent, 'utf8');

    const archivePath = buildArchivePath(
      normalizedOptions.rootDir,
      folderDate,
      normalizedOptions.archiveFormat,
    );

    await ensureDirectory(dirname(archivePath));
    await createArchive(
      sourceFolderPath,
      archivePath,
      normalizedOptions.archiveFormat,
    );
    await rm(sourceFolderPath, { recursive: true, force: true });
    await ensureCurrentSofiaFolder(normalizedOptions);

    return {
      folderDate,
      sourceFolderPath,
      archivePath,
      csvPath,
      csvRowCount: transformResult.length,
    };
  }

  return {
    writeJsonRecord,
    archiveFolderByDate,
  };
}

const defaultArchiver = createJsonArchiver();

export const writeJsonRecord = defaultArchiver.writeJsonRecord;
export const archiveFolderByDate = defaultArchiver.archiveFolderByDate;

export type {
  ArchiveFolderResult,
  ArchiveFormat,
  JsonArchiverOptions,
  WriteJsonRecordResult,
} from './types';
export { getSofiaDateString } from './utils/dates';
