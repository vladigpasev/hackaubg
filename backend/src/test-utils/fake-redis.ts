type SortedSetMemberI = {
  value: string;
  score: number;
  order: number;
};

export class InMemoryRedisClient {
  private readonly values = new Map<string, string>();
  private readonly expirations = new Map<string, number>();
  private readonly sortedSets = new Map<
    string,
    Map<string, SortedSetMemberI>
  >();
  private nextOrder = 0;
  isOpen = true;

  connect(): Promise<void> {
    this.isOpen = true;
    return Promise.resolve();
  }

  quit(): Promise<void> {
    this.isOpen = false;
    return Promise.resolve();
  }

  private purgeExpiredKey(key: string): void {
    const expiresAt = this.expirations.get(key);

    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      this.values.delete(key);
      this.expirations.delete(key);
    }
  }

  private purgeExpiredKeys(): void {
    for (const key of this.expirations.keys()) {
      this.purgeExpiredKey(key);
    }
  }

  get(key: string): Promise<string | null> {
    this.purgeExpiredKey(key);
    return Promise.resolve(this.values.get(key) ?? null);
  }

  set(
    key: string,
    value: string,
    options?: { NX?: boolean; PX?: number },
  ): Promise<'OK' | null> {
    this.purgeExpiredKey(key);

    if (options?.NX && this.values.has(key)) {
      return Promise.resolve(null);
    }

    this.values.set(key, value);

    if (typeof options?.PX === 'number') {
      this.expirations.set(key, Date.now() + options.PX);
    } else {
      this.expirations.delete(key);
    }

    return Promise.resolve('OK');
  }

  del(keys: string | string[]): Promise<number> {
    const normalizedKeys = Array.isArray(keys) ? keys : [keys];
    let removed = 0;

    for (const key of normalizedKeys) {
      if (this.values.delete(key)) {
        this.expirations.delete(key);
        removed += 1;
      }

      if (this.sortedSets.delete(key)) {
        removed += 1;
      }
    }

    return Promise.resolve(removed);
  }

  mGet(keys: string[]): Promise<Array<string | null>> {
    keys.forEach((key) => this.purgeExpiredKey(key));
    return Promise.resolve(keys.map((key) => this.values.get(key) ?? null));
  }

  mSet(entries: [string, string][]): Promise<'OK'> {
    for (const [key, value] of entries) {
      this.purgeExpiredKey(key);
      this.values.set(key, value);
      this.expirations.delete(key);
    }

    return Promise.resolve('OK');
  }

  keys(pattern: string): Promise<string[]> {
    this.purgeExpiredKeys();
    const keys = [
      ...new Set([...this.values.keys(), ...this.sortedSets.keys()]),
    ];

    if (!pattern.includes('*')) {
      return Promise.resolve(keys.includes(pattern) ? [pattern] : []);
    }

    const prefix = pattern.slice(0, pattern.indexOf('*'));

    return Promise.resolve(keys.filter((key) => key.startsWith(prefix)).sort());
  }

  zAdd(
    key: string,
    values: Array<{ score: number; value: string }>,
  ): Promise<number> {
    const sortedSet =
      this.sortedSets.get(key) ?? new Map<string, SortedSetMemberI>();
    let added = 0;

    for (const entry of values) {
      const existing = sortedSet.get(entry.value);

      if (!existing) {
        added += 1;
      }

      sortedSet.set(entry.value, {
        value: entry.value,
        score: entry.score,
        order: existing?.order ?? this.nextOrder++,
      });
    }

    this.sortedSets.set(key, sortedSet);

    return Promise.resolve(added);
  }

  zRangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<Array<{ value: string; score: number }>> {
    const values = [...(this.sortedSets.get(key)?.values() ?? [])].sort(
      (a, b) => (a.score === b.score ? a.order - b.order : a.score - b.score),
    );
    const normalizedStart =
      start < 0 ? Math.max(values.length + start, 0) : start;
    const normalizedEnd =
      stop < 0 ? values.length + stop + 1 : Math.min(stop + 1, values.length);

    return Promise.resolve(
      values
        .slice(normalizedStart, normalizedEnd)
        .map(({ value, score }) => ({ value, score })),
    );
  }

  zRem(key: string, value: string): Promise<number> {
    const sortedSet = this.sortedSets.get(key);

    if (!sortedSet) {
      return Promise.resolve(0);
    }

    const removed = sortedSet.delete(value);

    if (sortedSet.size === 0) {
      this.sortedSets.delete(key);
    }

    return Promise.resolve(removed ? 1 : 0);
  }
}

export function createRedisServiceMock() {
  return {
    client: new InMemoryRedisClient(),
  };
}
