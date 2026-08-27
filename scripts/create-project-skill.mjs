#!/usr/bin/env node
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const skillsRoot = path.join(repoRoot, '.agents/skills')

const RANGE_START = 100
const RANGE_END = 999

const usage = () => {
  console.error('Usage: node scripts/create-project-skill.mjs "<skill title>" "<description>" [--number NNN]')
  process.exit(2)
}

const slugify = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)

const titleize = (slug) =>
  slug
    .replace(/^\d{3}-/, '')
    .split('-')
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ')

const parseArgs = () => {
  const args = process.argv.slice(2)
  if (args.length < 2) usage()

  const title = args[0]
  const description = args[1]
  let requestedNumber = null

  for (let index = 2; index < args.length; index += 1) {
    if (args[index] === '--number') {
      const value = args[index + 1]
      if (!/^\d{1,3}$/.test(value ?? '')) usage()
      requestedNumber = Number(value)
      index += 1
      continue
    }
    usage()
  }

  return { title, description, requestedNumber }
}

const existingNumbers = async () => {
  const entries = await readdir(skillsRoot, { withFileTypes: true })
  return new Set(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name.match(/^(\d{3})-/)?.[1])
      .filter(Boolean)
      .map(Number),
  )
}

const nextNumber = (used) => {
  for (let number = RANGE_START; number <= RANGE_END; number += 1) {
    if (!used.has(number)) return number
  }
  throw new Error(`No free skill numbers in ${RANGE_START}-${RANGE_END}`)
}

const main = async () => {
  const { title, description, requestedNumber } = parseArgs()
  const slug = slugify(title)
  if (!slug) throw new Error('Skill title must contain at least one letter or digit')

  const used = await existingNumbers()
  const number = requestedNumber ?? nextNumber(used)
  if (number < 1 || number > 999) throw new Error('Skill number must be between 001 and 999')
  if (used.has(number)) throw new Error(`Skill number ${String(number).padStart(3, '0')} is already used`)

  const prefix = String(number).padStart(3, '0')
  const skillName = `${prefix}-${slug}`
  const skillDir = path.join(skillsRoot, skillName)
  await mkdir(path.join(skillDir, 'agents'), { recursive: true })

  const skillMd = `---\nname: ${skillName}\ndescription: ${description.trim()}\n---\n\n# ${titleize(skillName)}\n\n## Purpose\n\n${description.trim()}\n\n## Workflow\n\n1. Read relevant project and module rules.\n2. Inspect existing code and docs before changing behavior.\n3. Reuse established project patterns.\n4. Verify with the smallest relevant tests or checks.\n\n## Completion Criteria\n\n- Relevant files updated.\n- Verification command results reported.\n- Remaining risk or test gaps stated.\n`

  const openaiYaml = `interface:\n  display_name: "${titleize(skillName)}"\n  short_description: "Project skill ${skillName}"\n  default_prompt: "Use $${skillName} for the relevant ROIS workflow."\npolicy:\n  allow_implicit_invocation: true\n`

  await writeFile(path.join(skillDir, 'SKILL.md'), skillMd)
  await writeFile(path.join(skillDir, 'agents/openai.yaml'), openaiYaml)
  console.log(`Created .agents/skills/${skillName}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
