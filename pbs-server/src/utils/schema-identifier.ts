export const validateSchemaName = (schemaName: string, label: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid ${label}: ${schemaName}`);
  }

  return schemaName;
};
