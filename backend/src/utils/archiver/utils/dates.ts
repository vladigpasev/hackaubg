const DATE_PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = DATE_PARTS_FORMATTER_CACHE.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  DATE_PARTS_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

export function getSofiaDateString(date: Date, timeZone = 'Europe/Sofia'): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid date provided. Expected a valid Date instance.');
  }

  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Failed to derive a date string for time zone "${timeZone}".`);
  }

  return `${year}-${month}-${day}`;
}
