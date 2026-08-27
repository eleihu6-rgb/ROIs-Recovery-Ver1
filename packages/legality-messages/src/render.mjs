import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_JSON = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'messages.json',
)

export function fillTemplate(template, fields) {
  const text = String(template ?? '')
  const names = [...text.matchAll(/\{([a-z][a-z0-9_]*)\}/g)].map((m) => m[1])
  for (const name of names) {
    if (fields[name] == null || fields[name] === '') return null
  }
  return text.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, name) => String(fields[name]))
}

export function loadMessages(jsonPath = DEFAULT_JSON) {
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
}

export function renderRuleBody(messages, ruleCode, fields) {
  const body = messages?.rules?.[String(ruleCode)]?.body
  if (!body) return null
  return fillTemplate(body, fields)
}
