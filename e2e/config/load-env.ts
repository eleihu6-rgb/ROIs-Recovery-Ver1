import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Loads e2e/.env (gitignored, per-developer) into process.env WITHOUT overriding
 * anything already set on the command line or by CI. This keeps every checked-in
 * Playwright config environment-neutral: no .env file → the localhost fallbacks in
 * each config stand, so teammates validate against their own environment; a
 * developer's own .env can point the whole suite at any target (e.g. Ryan's
 * https://cr.rois.one sign-off gate) without editing shared defaults.
 *
 * Dependency-free on purpose — a handful of KEY=VALUE lines does not justify pulling
 * in `dotenv` (info-security dependency review + extra install footprint).
 */
export const loadLocalEnv = (envPath = path.resolve(configDir, '../.env')): void => {
  let text: string
  try {
    text = fs.readFileSync(envPath, 'utf8')
  } catch {
    return // no personal .env → keep the config's localhost defaults
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!key || key in process.env) continue // explicit env / CI always wins
    let value = line.slice(eq + 1).trim()
    if (
      value.length >= 2 &&
      ((value[0] === '"' && value.endsWith('"')) || (value[0] === "'" && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}
