export const asSafeIdentifier = (value: string): string => {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Invalid database schema identifier: ${value}`)
  }

  return value.toLowerCase()
}
