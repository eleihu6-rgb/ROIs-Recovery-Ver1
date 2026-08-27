type LineholderTtlCacheOptions<TValue> = {
  ttlMs: number;
  load: () => Promise<TValue>;
  clone: (value: TValue) => TValue;
  now?: () => number;
};

export const createLineholderTtlCache = <TValue>({
  ttlMs,
  load,
  clone,
  now = Date.now,
}: LineholderTtlCacheOptions<TValue>) => {
  let cache: {
    expiresAt: number;
    value: TValue;
  } | null = null;

  return async (): Promise<TValue> => {
    const currentTime = now();

    if (cache && cache.expiresAt > currentTime) {
      return clone(cache.value);
    }

    const value = await load();
    cache = {
      expiresAt: currentTime + ttlMs,
      value: clone(value),
    };

    return clone(value);
  };
};
