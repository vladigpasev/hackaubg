function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function serializeCsvCell(value: unknown): string {
  if (value == null) {
    return '';
  }

  let text: string;

  if (typeof value === 'string') {
    text = value;
  } else if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    text = String(value);
  } else if (value instanceof Date) {
    text = value.toISOString();
  } else {
    text = JSON.stringify(value);
  }

  if (text.includes('"')) {
    text = text.replace(/"/g, '""');
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text}"`;
  }

  return text;
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!Array.isArray(rows)) {
    throw new Error('CSV rows must be an array.');
  }

  if (rows.length === 0) {
    return '';
  }

  const header: string[] = [];
  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    if (!isPlainObject(row)) {
      throw new Error(`CSV row at index ${index} is not a plain object.`);
    }

    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        header.push(key);
      }
    }
  }

  const lines: string[] = [];
  lines.push(header.map((cell) => serializeCsvCell(cell)).join(','));

  for (const row of rows) {
    const line = header.map((key) => serializeCsvCell(row[key])).join(',');
    lines.push(line);
  }

  return lines.join('\n');
}

export function validateTransformRows(rows: unknown): asserts rows is Record<string, unknown>[] {
  if (!Array.isArray(rows)) {
    throw new Error('Transform must return an array of objects.');
  }

  for (const [index, row] of rows.entries()) {
    if (!isPlainObject(row)) {
      throw new Error(`Transform result row at index ${index} is not a plain object.`);
    }
  }
}
