export type ArchiveFormat = 'tar.br' | 'tar.zst' | 'tar.gz';

export interface JsonArchiverOptions {
  rootDir?: string;
  timeZone?: string;
  archiveFormat?: ArchiveFormat;
}

export interface WriteJsonRecordResult {
  filePath: string;
  folderDate: string;
}

export interface ArchiveFolderResult {
  folderDate: string;
  sourceFolderPath: string;
  archivePath: string;
  csvPath: string;
  extractedCount: number;
  csvRowCount: number;
}

export interface NormalizedJsonArchiverOptions {
  rootDir: string;
  timeZone: string;
  archiveFormat: ArchiveFormat;
}
