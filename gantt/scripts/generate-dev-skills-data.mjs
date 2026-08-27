import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const skillsRoot = path.join(repoRoot, '.agents/skills')
const outputPath = path.join(repoRoot, 'gantt/src/components/dev/dev-skills-data.generated.ts')

const SECTION_PATTERNS = {
  howToUse: /(?:how to use|run|workflow|required workflow|quick debug checklist|completion criteria|when skill invoked)/i,
  function: /(?:purpose|feature|core rule|architecture|file map|key files|what|overview)/i,
}

const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim()

const parseFrontmatter = (text, fallbackName) => {
  if (!text.startsWith('---\n')) {
    return { name: fallbackName, description: '', body: text }
  }

  const end = text.indexOf('\n---\n', 4)
  if (end === -1) {
    return { name: fallbackName, description: '', body: text }
  }

  const frontmatter = text.slice(4, end)
  const body = text.slice(end + 5)
  const lines = frontmatter.split(/\r?\n/)
  const fields = {}

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue

    const [, key, rawValue] = match
    if (rawValue === '>') {
      const folded = []
      for (let next = index + 1; next < lines.length; next += 1) {
        if (/^[A-Za-z0-9_-]+:\s*/.test(lines[next])) break
        folded.push(lines[next].trim())
        index = next
      }
      fields[key] = normalizeWhitespace(folded.join(' '))
    } else {
      fields[key] = normalizeWhitespace(rawValue.replace(/^["']|["']$/g, ''))
    }
  }

  return {
    name: fields.name || fallbackName,
    description: fields.description || '',
    body,
  }
}

const collectSections = (body) => {
  const sections = []
  const lines = body.split(/\r?\n/)
  let current = { heading: 'Overview', lines: [] }

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      if (current.lines.length > 0 || current.heading !== 'Overview') sections.push(current)
      current = { heading: heading[2].trim(), lines: [] }
      continue
    }
    current.lines.push(line)
  }

  if (current.lines.length > 0 || current.heading !== 'Overview') sections.push(current)
  return sections.map((section) => ({
    heading: section.heading,
    text: normalizeWhitespace(
      section.lines
        .filter((line) => !line.trim().startsWith('|'))
        .filter((line) => !line.trim().startsWith('```'))
        .join(' '),
    ),
  })).filter((section) => section.text.length > 0)
}

const summarize = (text, maxLength = 640) => {
  const normalized = normalizeWhitespace(text)
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trim()}...`
}

const listResources = async (skillDir) => {
  const entries = await readdir(skillDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.name !== 'SKILL.md')
    .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'}:${entry.name}`)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

const numberOf = (name) => {
  const match = name.match(/^(\d{3})-/)
  return match ? Number(match[1]) : null
}

const toLiteral = (value) => JSON.stringify(value, null, 2)

const main = async () => {
  const dirs = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => {
      const aNum = numberOf(a)
      const bNum = numberOf(b)
      if (aNum !== null && bNum !== null) return aNum - bNum
      if (aNum !== null) return -1
      if (bNum !== null) return 1
      return a.localeCompare(b)
    })

  const skills = []

  for (const dir of dirs) {
    const skillPath = path.join(skillsRoot, dir, 'SKILL.md')
    const text = await readFile(skillPath, 'utf8')
    const parsed = parseFrontmatter(text, dir)
    const sections = collectSections(parsed.body)
    const firstHeading = sections[0]?.heading || parsed.name
    const firstText = sections[0]?.text || parsed.description
    const functionSection = sections.find((section) => SECTION_PATTERNS.function.test(section.heading))
    const howToUseSection = sections.find((section) => SECTION_PATTERNS.howToUse.test(section.heading))
    const resources = await listResources(path.join(skillsRoot, dir))

    skills.push({
      name: parsed.name,
      folder: dir,
      number: numberOf(dir),
      title: firstHeading.replace(/^Skill\s+\d+:\s*/i, ''),
      description: parsed.description,
      overview: summarize(firstText || parsed.description),
      function: summarize(functionSection?.text || firstText || parsed.description),
      howToUse: summarize(howToUseSection?.text || parsed.description),
      resources,
      sourcePath: `.agents/skills/${dir}/SKILL.md`,
    })
  }

  const output = `// Generated by gantt/scripts/generate-dev-skills-data.mjs. Do not edit by hand.\n\n` +
    `export interface DevSkillResource {\n  label: string\n}\n\n` +
    `export interface DevSkillEntry {\n  name: string\n  folder: string\n  number: number | null\n  title: string\n  description: string\n  overview: string\n  function: string\n  howToUse: string\n  resources: string[]\n  sourcePath: string\n}\n\n` +
    `export const DEV_SKILLS: DevSkillEntry[] = ${toLiteral(skills)}\n`

  await writeFile(outputPath, output)
  console.log(`Generated ${skills.length} skills -> ${path.relative(repoRoot, outputPath)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
