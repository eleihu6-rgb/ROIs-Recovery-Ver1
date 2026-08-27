export const isScenarioNotFoundError = (message: string | null | undefined): boolean =>
  typeof message === 'string' && /\bscenario not found\b/i.test(message)
