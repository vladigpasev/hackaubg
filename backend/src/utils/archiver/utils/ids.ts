import { extname, resolve } from 'node:path';

export function sanitizeId(id: string): string {
  const trimmed = id.trim();

  if (!trimmed) {
    throw new Error('Invalid id. Expected a non-empty string.');
  }

  let safe = trimmed
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .replace(/^_+|_+$/g, '');

  if (safe.toLowerCase().endsWith('.json')) {
    safe = safe.slice(0, -5);
  }

  safe = safe.replace(/^\.+/, '').replace(/^_+|_+$/g, '');

  if (!safe || safe === '.' || safe === '..') {
    throw new Error(
      `Invalid id "${id}". The sanitized file name would be empty or unsafe.`,
    );
  }

  return safe;
}

export function buildSafeJsonFilePath(folderPath: string, id: string): string {
  const safeId = sanitizeId(id);
  const filename = `${safeId}.json`;
  const fullPath = resolve(folderPath, filename);
  const resolvedFolder = resolve(folderPath);

  if (
    !fullPath.startsWith(`${resolvedFolder}/`) &&
    fullPath !== resolve(resolvedFolder, filename)
  ) {
    throw new Error(`Resolved path for id "${id}" escapes the target folder.`);
  }

  if (extname(fullPath).toLowerCase() !== '.json') {
    throw new Error(`Resolved path for id "${id}" does not end with .json.`);
  }

  return fullPath;
}
