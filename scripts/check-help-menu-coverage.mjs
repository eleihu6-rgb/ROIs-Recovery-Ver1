#!/usr/bin/env node
/**
 * Keep Help coverage aligned with the visible second-level Shell sidebar menus.
 *
 * The sidebar declares an explicit helpTopicSlug for each menu item and each
 * Help topic records the matching sourceMenuId. This checker enforces that the
 * two declarations remain a one-to-one mapping and that visible wording has
 * not drifted. Run it for every Help refresh:
 *
 *   node scripts/check-help-menu-coverage.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const valueFor = (flag, fallback) => {
  const index = argv.indexOf(flag)
  return index === -1 ? fallback : resolve(argv[index + 1])
}
const sidebarPath = valueFor('--sidebar', join(ROOT, 'gantt/src/components/shell/shell-sidebar.tsx'))
const helpDataPath = valueFor('--help-data', join(ROOT, 'gantt/src/components/help/help-data.ts'))

const sidebar = readFileSync(sidebarPath, 'utf8')
const helpData = readFileSync(helpDataPath, 'utf8')
const menus = []
const menuDefinitions = [
  ['Data', 'pageId'],
  ['Legality', 'item'],
  ['System', 'item'],
  ['PBS', 'item'],
]

for (const [tab, idKey] of menuDefinitions) {
  const match = sidebar.match(new RegExp(`const ${tab.toUpperCase()}_MENU:[\\s\\S]*?= \\[([\\s\\S]*?)\\n\\]`, 'm'))
  if (!match) {
    console.log(`DRIFT  ${tab} menu declaration was not found in ${sidebarPath}`)
    process.exitCode = 1
    continue
  }
  const itemPattern = new RegExp(`\\{\\s*${idKey}: '([^']+)',\\s*label: '([^']+)',\\s*helpTopicSlug: '([^']+)'`, 'g')
  for (const item of match[1].matchAll(itemPattern)) {
    menus.push({ tab, id: item[1], title: item[2], slug: item[3] })
  }
  const declaredItems = [...match[1].matchAll(new RegExp(`\\{\\s*${idKey}:`, 'g'))].length
  if (declaredItems !== menus.filter((item) => item.tab === tab).length) {
    console.log(`GAP    ${tab} has menu item(s) without helpTopicSlug`)
    process.exitCode = 1
  }
}

const topics = new Map()
const topicPattern = /\{\s*slug: '([^']+)',(?:\s*sourceMenuId: '([^']+)',)?\s*title: '([^']+)',\s*categorySlug: '([^']+)'[^}]*\}/g
for (const topic of helpData.matchAll(topicPattern)) {
  topics.set(topic[1], { sourceMenuId: topic[2], title: topic[3], category: topic[4] })
}

let problems = 0
const mappedIds = new Set()
console.log(`Visible menu items: ${menus.length}  |  Help topics: ${topics.size}`)
console.log()
for (const menu of menus) {
  const topic = topics.get(menu.slug)
  if (!topic) {
    problems++
    console.log(`GAP    ${menu.tab} / ${menu.title} (${menu.id}) -> missing Help topic ${menu.slug}`)
    continue
  }
  if (topic.sourceMenuId !== menu.id) {
    problems++
    console.log(`DRIFT  ${menu.tab} / ${menu.title} (${menu.id}) -> Help sourceMenuId is ${topic.sourceMenuId ?? 'missing'}`)
  }
  if (topic.title.replace(/ \(Partial\)$/, '') !== menu.title) {
    problems++
    console.log(`DRIFT  ${menu.tab} / ${menu.id} -> menu says "${menu.title}", Help says "${topic.title}"`)
  }
  if (mappedIds.has(menu.id)) {
    problems++
    console.log(`DRIFT  duplicate visible menu id ${menu.id}`)
  }
  mappedIds.add(menu.id)
}

for (const [slug, topic] of topics) {
  if (!topic.sourceMenuId || !['data', 'legality-tab', 'system', 'pbs'].includes(topic.category)) continue
  const menu = menus.find((item) => item.id === topic.sourceMenuId)
  if (!menu) {
    problems++
    console.log(`EXTRA  ${slug} references ${topic.sourceMenuId}, which is not a visible sidebar menu`)
  } else if (menu.slug !== slug) {
    problems++
    console.log(`DRIFT  ${slug} and ${menu.slug} both claim ${topic.sourceMenuId}`)
  }
}

console.log()
if (problems > 0 || process.exitCode) {
  console.log(`x ${problems || 1} Help menu coverage problem(s) found.`)
  process.exitCode = 1
} else {
  console.log('ok Every visible Data, Legality, System, and PBS submenu has one matching Help topic.')
}
