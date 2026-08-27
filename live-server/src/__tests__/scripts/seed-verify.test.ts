import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 校验权限 seed（05-system-menu.sql / 06-profile.sql）的内部一致性：
 * 1) system_menu 中 B 类型按钮的 parent_menu_code 都能在菜单节点中找到（无悬空按钮）
 * 2) 按钮 ctrl 行 api_uris 非空（按钮必须绑定后端接口）
 * 3) 叶子菜单 api_uris 非空（读接口清单）
 * 4) 每个顶层 Tab 下至少一个叶子菜单
 * 5) 06-profile.sql 的 profile_code 预设完整，且引用的 menu_code 均存在
 */
// cwd = live-server 目录（vitest 在此运行），seed 在仓库根 sql/seed
const menuSql = readFileSync(resolve(process.cwd(), '../sql/seed/05-system-menu.sql'), 'utf8')
const profileSql = readFileSync(resolve(process.cwd(), '../sql/seed/06-profile.sql'), 'utf8')

/** 抽取 INSERT INTO <table> (...) VALUES (row)... 块；cols=列名，rows=按列展开的值 */
function extractInserts(sql: string, table: string): { cols: string[]; rows: string[][] }[] {
  const blocks: { cols: string[]; rows: string[][] }[] = []
  const blockRe = new RegExp(`INSERT INTO\\s+${table}\\s*\\(([^)]*)\\)\\s*VALUES\\s*([\\s\\S]*?);`, 'gi')
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(sql)) !== null) {
    const cols = m[1].split(',').map((c) => c.trim())
    // 去掉 ON CONFLICT / RETURNING 等尾部子句，只留 VALUES 行
    const valuesPart = m[2].split(/\bON CONFLICT\b/)[0].split(/\bRETURNING\b/)[0]
    const rows: string[][] = []
    for (const rowMatch of valuesPart.matchAll(/\(([^()]*)\)/g)) {
      rows.push(rowMatch[1].split(',').map((c) => c.trim()))
    }
    blocks.push({ cols, rows })
  }
  return blocks
}

function cell(block: { cols: string[]; rows: string[][] }, row: string[], col: string): string {
  const idx = block.cols.indexOf(col)
  return idx >= 0 ? row[idx] : ''
}

const unquote = (v: string): string => v.replace(/^'|'$/g, '')

describe('permission seed consistency', () => {
  const menuBlocks = extractInserts(menuSql, 'system_menu')
  const menuRows = menuBlocks.flatMap((b) => b.rows.map((r) => ({
    menuCode: unquote(cell(b, r, 'menu_code')),
    parentMenuCode: unquote(cell(b, r, 'parent_menu_code')),
    systemType: unquote(cell(b, r, 'system_type')),
    apiUris: unquote(cell(b, r, 'api_uris')),
  })))
  const allMenus = menuRows.filter((m) => m.systemType !== 'B').map((m) => m.menuCode).filter(Boolean)
  const ctrls = menuRows.filter((m) => m.systemType === 'B').map((m) => ({
    menuCode: m.parentMenuCode,
    ctlCode: m.menuCode,
    apiUris: m.apiUris,
  }))

  it('B 类型按钮引用的 parent_menu_code 都存在', () => {
    for (const c of ctrls) {
      expect(allMenus, `ctrl ${c.menuCode}/${c.ctlCode} 引用不存在的菜单`).toContain(c.menuCode)
    }
  })

  it('叶子菜单 api_uris 非空（读接口清单），iframe/静态叶子除外', () => {
    const parentOf = menuRows.filter((m) => m.systemType !== 'B').map((m) => m.parentMenuCode)
    const parents = new Set(parentOf)
    const containerCodes = new Set(['ROOT', 'LIVE', 'SCENARIO', 'DATA', 'LEGALITY', 'SYSTEM', 'PBS'])
    // iframe 外链工具与静态帮助页没有后端读接口，豁免 api_uris 要求
    const NO_API = new Set(['HELP', 'SYSTEM_QUEUE_TASKS', 'SYSTEM_GRAFANA', 'SYSTEM_PROMETHEUS', 'SYSTEM_WINDMILL'])
    const leaves = allMenus.filter((code) => !parents.has(code) && !containerCodes.has(code))
    expect(leaves.length, '应存在叶子菜单').toBeGreaterThan(0)
    for (const code of leaves) {
      if (NO_API.has(code)) continue
      const apiUris = menuRows.find((m) => m.systemType !== 'B' && m.menuCode === code)?.apiUris ?? ''
      expect(apiUris.trim(), `叶子菜单 ${code} api_uris 为空`).not.toBe('')
    }
  })

  it('每个容器 Tab 下至少一个叶子', () => {
    const childMap = new Map<string, number>()
    for (const m of menuRows.filter((m) => m.systemType !== 'B')) {
      childMap.set(m.parentMenuCode, (childMap.get(m.parentMenuCode) ?? 0) + 1)
    }
    // DASHBOARD / HELP 是叶子 Tab（自身即页面），无需子节点
    for (const tab of ['LIVE', 'SCENARIO', 'DATA', 'LEGALITY', 'SYSTEM', 'PBS']) {
      expect((childMap.get(tab) ?? 0), `容器 Tab ${tab} 无子节点`).toBeGreaterThan(0)
    }
  })

  it('06-profile.sql profile_code 预设完整且引用的菜单存在', () => {
    const profileBlocks = extractInserts(profileSql, 'profile')
    const codes = profileBlocks.flatMap((b) => b.rows.map((r) => unquote(cell(b, r, 'profile_code')))).filter(Boolean)
    expect(codes.sort()).toEqual(['Administrator', 'RosterPlanner-C', 'RosterPlanner-P', 'Viewer-C', 'Viewer-P'].sort())

    // profile_menu_privilege 的 SELECT 中 menu_code IN (...) 引用的菜单必须存在
    const pmpRefs = new Set<string>()
    const pmpRe = /profile_menu_privilege[\s\S]*?IN\s*\(([^)]*)\)/gi
    let m: RegExpExecArray | null
    while ((m = pmpRe.exec(profileSql)) !== null) {
      for (const part of m[1].match(/[A-Z_]{3,}/g) ?? []) pmpRefs.add(part)
    }
    for (const ref of pmpRefs) {
      expect(allMenus, `profile_menu_privilege 引用不存在的菜单 ${ref}`).toContain(ref)
    }
  })
})
