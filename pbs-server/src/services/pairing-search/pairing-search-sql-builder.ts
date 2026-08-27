export type PairingSearchCteBundle<TNames extends Record<string, string>> = {
  names: TNames;
  fragments: string[];
};

export type PairingSearchSqlBuilder = {
  params: unknown[];
  addParam: (value: unknown) => string;
  getOrRegisterCteBundle: <TNames extends Record<string, string>>(
    key: string,
    factory: (prefix: string) => PairingSearchCteBundle<TNames>,
  ) => TNames;
  renderCtes: () => string;
};

export const createPairingSearchSqlBuilder = (): PairingSearchSqlBuilder => {
  const params: unknown[] = [];
  const bundles = new Map<string, PairingSearchCteBundle<Record<string, string>>>();

  return {
    params,
    addParam: (value) => {
      params.push(value);
      return `$${params.length}`;
    },
    getOrRegisterCteBundle: <TNames extends Record<string, string>>(
      key: string,
      factory: (prefix: string) => PairingSearchCteBundle<TNames>,
    ): TNames => {
      const existing = bundles.get(key);

      if (existing) {
        return existing.names as TNames;
      }

      const bundle = factory(`pairing_search_${bundles.size + 1}`);
      bundles.set(key, bundle);
      return bundle.names;
    },
    renderCtes: () => Array.from(bundles.values())
      .flatMap((bundle) => bundle.fragments)
      .join(",\n"),
  };
};
