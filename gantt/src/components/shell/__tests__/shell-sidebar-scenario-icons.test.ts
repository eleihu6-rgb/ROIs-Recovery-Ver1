import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('ShellSidebar scenario icons', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../shell-sidebar.tsx'),
    'utf8',
  )

  it('uses a planner-facing Pairing label for PO scenarios', () => {
    expect(source).toMatch(/item:\s*'po',\s*label:\s*'Pairing',\s*Icon:\s*Link2/)
  })

  it('renders a visible Roster label for RO scenarios and removes TO', () => {
    expect(source).toMatch(/item:\s*'ro',\s*label:\s*'Roster',\s*Icon:\s*Users/)
    expect(source).toContain('<span className="flex-1">{itemLabel}</span>')
    expect(source).not.toMatch(/item:\s*'to',\s*label:\s*'TO',\s*Icon:\s*GraduationCap/)
  })
})
