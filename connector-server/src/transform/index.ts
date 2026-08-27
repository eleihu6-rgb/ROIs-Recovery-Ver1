import { TransformPlugin } from './base.js'
import { defaultTransform } from './default.js'

/**
 * Transform plugin registry
 * Maps transform_plugin identifiers to their implementations
 */
const registry: Map<string, TransformPlugin> = new Map()

// Register default transform
registry.set('default', defaultTransform)

/**
 * Get transform plugin by identifier
 * @param identifier - Plugin identifier (e.g., 'default', 'f8/flight', 'tg/crew')
 * @returns TransformPlugin instance
 */
export const getTransform = (identifier?: string | null): TransformPlugin => {
  if (!identifier) {
    return defaultTransform
  }

  const plugin = registry.get(identifier)
  if (!plugin) {
    // Try to load dynamically (for airline-specific transforms)
    // Note: Dynamic imports would require additional setup
    console.warn(`Transform plugin '${identifier}' not found, using default`)
    return defaultTransform
  }

  return plugin
}

/**
 * Register a new transform plugin
 * @param identifier - Unique identifier for the plugin
 * @param plugin - TransformPlugin implementation
 */
export const registerTransform = (identifier: string, plugin: TransformPlugin): void => {
  if (registry.has(identifier)) {
    console.warn(`Overriding existing transform plugin '${identifier}'`)
  }
  registry.set(identifier, plugin)
}

/**
 * List all registered transform plugins
 */
export const listTransforms = (): string[] => {
  return Array.from(registry.keys())
}

// Re-export types
export { TransformPlugin, StandardRecord, StandardFlight, StandardCrew, StandardRoster, StandardPairing } from './base.js'