export type PairingSearchSqlBuilder = {
  params: unknown[];
  addParam: (value: unknown) => string;
};

export const createPairingSearchSqlBuilder = (): PairingSearchSqlBuilder => {
  const params: unknown[] = [];

  return {
    params,
    addParam: (value) => {
      params.push(value);
      return `$${params.length}`;
    },
  };
};
