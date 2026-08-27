import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Database, Save, Users, UserPlus, Trash2, Search } from 'lucide-react'
import { Button, AppDialog } from '@rois/ui'
import { api } from '@/services/api'
import { menuIcon } from '@/config/menu-icons'
import { notify } from '@/utils/notify'

const ok = async <T,>(p: Promise<T>): Promise<T> => p

interface RoleConfigDialogProps {
  role: { id: number; profileName: string } | null
  onClose: () => void
}

interface AdminMenuNode {
  id: number
  menuCode: string
  menuName: string
  parentMenuCode: string
  idx: number | null
  icon: string | null
  ctrls: { id: number; menuCtlCode: string; menuCtlName: string }[]
}

interface ScopeOption {
  value: string
  label: string
}

interface RoleUser {
  id: number
  userCode: string
  userName: string
  branchCode: string
  status: number
}

const DIMENSIONS = ['FILIALE', 'DIVISION', 'CREW_DEPARTMENT', 'RANK', 'FLEET'] as const
type Dim = (typeof DIMENSIONS)[number]
const EMPTY_SCOPE: Record<Dim, string[]> = { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }

/**
 * 角色权限配置：针对一个 Role 勾选菜单 + 按钮，以及数据权限（5 维度）。
 * 「菜单与按钮」与「数据权限」两段在同一弹窗内切换。
 */
export const RoleConfigPane = ({ role, onClose }: RoleConfigDialogProps) => {
  const [tab, setTab] = useState<'menus' | 'data' | 'users'>('menus')
  const [menus, setMenus] = useState<AdminMenuNode[]>([])
  const [selMenus, setSelMenus] = useState<Set<string>>(new Set())
  const [selCtrls, setSelCtrls] = useState<Set<string>>(new Set()) // `${menuCode}:${ctlCode}`
  const [scope, setScope] = useState<Record<Dim, string[]>>({ ...EMPTY_SCOPE })
  const [options, setOptions] = useState<Record<Dim, ScopeOption[]>>({ FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] })
  const [saving, setSaving] = useState(false)
  const [roleUsers, setRoleUsers] = useState<RoleUser[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<RoleUser[]>([])
  const [candidateUsers, setCandidateUsers] = useState<Set<number>>(new Set())
  const [userSearch, setUserSearch] = useState('')

  const load = useCallback(async () => {
    if (!role) return
    const [menuData, permData, deptData, rankData, fleetData, divData] = await Promise.all([
      ok<AdminMenuNode[]>(api.get('/api/admin/menus')),
      ok<{ menuCodes: string[]; ctrls: { menuCode: string; ctlCode: string }[]; dataScope: Record<Dim, string[]> }>(api.get(`/api/admin/profiles/${role.id}/permissions`)),
      ok<{ branchCode: string }[]>(api.get('/api/admin/departments?kind=crew')).catch(() => []),
      ok<{ rank: string }[]>(api.get('/api/rank')).catch(() => []),
      ok<{ fleet: string }[]>(api.get('/api/fleet')).catch(() => []),
      ok<{ division: string; description: string | null }[]>(api.get('/api/division')).catch(() => []),
    ])
    setMenus(menuData)
    setSelMenus(new Set(permData.menuCodes))
    setSelCtrls(new Set(permData.ctrls.map((c) => `${c.menuCode}:${c.ctlCode}`)))
    setScope({ FILIALE: permData.dataScope.FILIALE ?? [], DIVISION: permData.dataScope.DIVISION ?? [], CREW_DEPARTMENT: permData.dataScope.CREW_DEPARTMENT ?? [], RANK: permData.dataScope.RANK ?? [], FLEET: permData.dataScope.FLEET ?? [] })
    setOptions({
      FILIALE: [{ value: 'F8', label: 'F8' }],
      DIVISION: divData.map((d) => ({ value: d.division, label: d.description ? `${d.division} — ${d.description}` : d.division })),
      CREW_DEPARTMENT: deptData.map((d) => ({ value: d.branchCode, label: d.branchCode })),
      RANK: rankData.map((r) => ({ value: r.rank, label: r.rank })),
      FLEET: fleetData.map((f) => ({ value: f.fleet, label: f.fleet })),
    })
  }, [role])

  useEffect(() => { void load() }, [load])

  const loadRoleUsers = useCallback(async () => {
    if (!role) return
    const data = await ok<RoleUser[]>(api.get(`/api/admin/profiles/${role.id}/users`))
    setRoleUsers(data)
    setSelectedUsers(new Set())
  }, [role])

  useEffect(() => { if (tab === 'users') void loadRoleUsers() }, [tab, loadRoleUsers])

  const openUserPicker = async () => {
    const data = await ok<{ rows: RoleUser[] }>(api.get('/api/admin/users'))
    setAllUsers(data.rows)
    setCandidateUsers(new Set())
    setUserSearch('')
    setPickerOpen(true)
  }
  const addUsers = async () => {
    if (!role || candidateUsers.size === 0) return
    await api.post(`/api/admin/profiles/${role.id}/users`, { userIds: [...candidateUsers] })
    setPickerOpen(false)
    await loadRoleUsers()
  }
  const removeUsers = async () => {
    if (!role || selectedUsers.size === 0) return
    await api.delete(`/api/admin/profiles/${role.id}/users`, { data: { userIds: [...selectedUsers] } })
    await loadRoleUsers()
  }
  const toggleSelectedUser = (id: number) => setSelectedUsers((current) => {
    const next = new Set(current)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleCandidate = (id: number) => setCandidateUsers((current) => {
    const next = new Set(current)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const availableUsers = allUsers.filter((user) => !roleUsers.some((member) => member.id === user.id))
  const visibleCandidates = availableUsers.filter((user) => {
    const needle = userSearch.trim().toLowerCase()
    return !needle || `${user.userCode} ${user.userName} ${user.branchCode}`.toLowerCase().includes(needle)
  })

  // 构建菜单树（parent → children）
  const childrenOf = useMemo(() => {
    const map = new Map<string, AdminMenuNode[]>()
    for (const m of menus) {
      const arr = map.get(m.parentMenuCode) ?? []
      arr.push(m)
      map.set(m.parentMenuCode, arr)
    }
    return (code: string) => (map.get(code) ?? []).slice().sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
  }, [menus])

  // 子树（含自身）内全部菜单 code，用于级联
  const subtreeMenuCodes = useMemo(() => (code: string): string[] => {
    const out: string[] = [code]
    const stack = [...childrenOf(code)]
    while (stack.length > 0) {
      const m = stack.pop()!
      out.push(m.menuCode)
      stack.push(...childrenOf(m.menuCode))
    }
    return out
  }, [childrenOf])

  // 子树（含自身）内全部按钮 key（`menuCode:ctlCode`），用于级联
  const subtreeCtrlKeys = useMemo(() => (code: string): string[] => {
    const keys: string[] = []
    for (const mc of subtreeMenuCodes(code)) {
      const m = menus.find((mm) => mm.menuCode === mc)
      for (const c of m?.ctrls ?? []) keys.push(`${mc}:${c.menuCtlCode}`)
    }
    return keys
  }, [subtreeMenuCodes, menus])

  // 级联：勾选/取消一个菜单时，其下所有后代菜单与按钮全选/全不选
  // 用「视觉上的全选状态」决定方向，而非 `selMenus.has(code)`：
  // 否则部分勾选（indeterminate）时点击父节点会被解读为「全删」（因为父 code 已在 selMenus 里），
  // 这是 Roles 菜单保存后子项丢失的根因。
  const toggleMenu = (code: string) => {
    const menuCodes = subtreeMenuCodes(code)
    const ctrlKeys = subtreeCtrlKeys(code)
    const allSelectedNow = menuCodes.every((mc) => selMenus.has(mc))
      && (ctrlKeys.length === 0 || ctrlKeys.every((k) => selCtrls.has(k)))
    const willCheck = !allSelectedNow
    setSelMenus((s) => {
      const n = new Set(s)
      for (const mc of menuCodes) willCheck ? n.add(mc) : n.delete(mc)
      return n
    })
    setSelCtrls((s) => {
      const n = new Set(s)
      for (const k of ctrlKeys) willCheck ? n.add(k) : n.delete(k)
      return n
    })
  }
  const toggleCtl = (menuCode: string, ctlCode: string) => {
    const key = `${menuCode}:${ctlCode}`
    setSelCtrls((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }
  const toggleScope = (dim: Dim, value: string) => {
    setScope((s) => {
      const cur = s[dim]
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      return { ...s, [dim]: next }
    })
  }

  const saveMenus = async () => {
    if (!role) return
    setSaving(true)
    try {
      const menusRes = await ok<{ menuCodes: string[]; droppedCodes: string[] }>(
        api.put(`/api/admin/profiles/${role.id}/menus`, { menuCodes: [...selMenus] }),
      )
      const ctrlsRes = await ok<{ ctrls: { menuCode: string; ctlCode: string }[]; droppedCtrls: { menuCode: string; ctlCode: string }[] }>(
        api.put(`/api/admin/profiles/${role.id}/ctrls`, { ctrls: [...selCtrls].map((k) => {
          const [menuCode, ctlCode] = k.split(':')
          return { menuCode, ctlCode }
        }) }),
      )
      // Refresh the local selection state to match what the server actually
      // persisted (orphans were silently dropped).
      if (menusRes.menuCodes) setSelMenus(new Set(menusRes.menuCodes))
      const droppedCount = (menusRes.droppedCodes?.length ?? 0) + (ctrlsRes.droppedCtrls?.length ?? 0)
      if (droppedCount > 0) {
        notify.warning(
          `Saved. Dropped ${droppedCount} orphan permission${droppedCount === 1 ? '' : 's'} (deleted menus). ` +
          `Menus: [${(menusRes.droppedCodes ?? []).join(', ')}], ` +
          `Ctrls: [${(ctrlsRes.droppedCtrls ?? []).map((c) => `${c.menuCode}/${c.ctlCode}`).join(', ')}]`,
        )
      } else {
        notify.success(`Role "${role.profileName}" saved`)
      }
      onClose()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to save role permissions')
    } finally { setSaving(false) }
  }
  const saveData = async () => {
    if (!role) return
    setSaving(true)
    try {
      await api.put(`/api/admin/profiles/${role.id}/data-scope`, scope)
      notify.success(`Data scope for "${role.profileName}" saved`)
      onClose()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to save data scope')
    } finally { setSaving(false) }
  }

  // 渲染一个菜单节点及其子节点（递归；不渲染 ROOT，从 ROOT 的子节点开始）
  const renderNode = (code: string, depth: number): React.ReactNode => {
    const children = childrenOf(code)
    const node = menus.find((m) => m.menuCode === code)
    const Icon = menuIcon(node?.menuCode ?? code, node?.icon)
    const hasButtons = !!node && children.length === 0 && node.ctrls.length > 0
    // 复选框状态由整个子树（含自身菜单 + 全部后代按钮）决定：
    // 全选 = 全勾，部分 = indeterminate（与 Menus 树同款图标 + 缩进）
    const menuCodes = subtreeMenuCodes(code)
    const ctrlKeys = subtreeCtrlKeys(code)
    const allSelected = menuCodes.every((mc) => selMenus.has(mc)) && (ctrlKeys.length === 0 || ctrlKeys.every((k) => selCtrls.has(k)))
    const someSelected = menuCodes.some((mc) => selMenus.has(mc)) || ctrlKeys.some((k) => selCtrls.has(k))
    const indeterminate = someSelected && !allSelected
    return (
      <div key={code}>
        <label className="flex items-center gap-1.5 rounded px-1 py-1 text-xs hover:bg-muted/50" style={{ paddingLeft: `${depth * 14 + 6}px` }}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = indeterminate }}
            onChange={() => toggleMenu(code)}
          />
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{node?.menuName ?? code}</span>
          {hasButtons && <span className="text-2xs text-muted-foreground">{node.ctrls.length} btn</span>}
        </label>
        {hasButtons && (
          <div className="flex flex-wrap gap-1 py-1" style={{ paddingLeft: `${depth * 14 + 26}px` }}>
            {node.ctrls.map((c) => {
              const key = `${code}:${c.menuCtlCode}`
              return (
                <label key={key} className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-2xs hover:bg-muted/50">
                  <input type="checkbox" checked={selCtrls.has(key)} onChange={() => toggleCtl(code, c.menuCtlCode)} />
                  {c.menuCtlName}
                </label>
              )
            })}
          </div>
        )}
        {children.map((c) => renderNode(c.menuCode, depth + 1))}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="role-config-pane">
      {/* Tab 切换：菜单与按钮 / 数据权限 */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border p-2 text-xs">
        <button
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${tab === 'menus' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          onClick={() => setTab('menus')}
        >
          <CheckSquare className="h-3.5 w-3.5" /> Menus & Buttons
        </button>
        <button
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${tab === 'data' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          onClick={() => setTab('data')}
        >
          <Database className="h-3.5 w-3.5" /> Data Scope
        </button>
        <button
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${tab === 'users' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          onClick={() => setTab('users')}
        >
          <Users className="h-3.5 w-3.5" /> Users
        </button>
      </div>

      {tab === 'menus' ? (
        <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">
          {menus.length === 0 ? <div className="p-4 text-muted-foreground">Loading menus...</div> : childrenOf('ROOT').map((c) => renderNode(c.menuCode, 0))}
        </div>
      ) : tab === 'data' ? (
        <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
          {DIMENSIONS.map((dim) => (
            <div key={dim} className="mb-3">
              <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{dim}</div>
              <div className="flex flex-wrap gap-1">
                {options[dim].length === 0 && <span className="text-muted-foreground/60">No options</span>}
                {options[dim].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-muted/50">
                    <input type="checkbox" checked={scope[dim].includes(opt.value)} onChange={() => toggleScope(dim, opt.value)} />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="text-2xs text-muted-foreground">Empty dimension = unrestricted. Dimensions combine with AND; values within a dimension with OR.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-3 text-xs">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <span className="text-muted-foreground">{roleUsers.length} users in this role</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => void openUserPicker()}><UserPlus className="h-3.5 w-3.5" /> Add Users</Button>
              <Button size="sm" variant="outline" disabled={selectedUsers.size === 0} onClick={() => void removeUsers()}><Trash2 className="h-3.5 w-3.5" /> Remove ({selectedUsers.size})</Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-sm border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left text-2xs uppercase tracking-wide text-muted-foreground"><tr>
                <th className="w-9 px-2 py-1.5"><input type="checkbox" checked={roleUsers.length > 0 && selectedUsers.size === roleUsers.length} onChange={(e) => setSelectedUsers(e.target.checked ? new Set(roleUsers.map((user) => user.id)) : new Set())} /></th>
                <th className="px-2 py-1.5">User Code</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Department</th><th className="px-2 py-1.5">Status</th>
              </tr></thead>
              <tbody>{roleUsers.map((user) => <tr key={user.id} className="border-t border-border/60">
                <td className="px-2 py-1.5"><input type="checkbox" checked={selectedUsers.has(user.id)} onChange={() => toggleSelectedUser(user.id)} /></td>
                <td className="px-2 py-1.5 font-mono">{user.userCode}</td><td className="px-2 py-1.5">{user.userName}</td><td className="px-2 py-1.5">{user.branchCode}</td><td className="px-2 py-1.5">{user.status === 0 ? 'Active' : 'Disabled'}</td>
              </tr>)}</tbody>
            </table>
            {roleUsers.length === 0 && <div className="p-4 text-muted-foreground">No users are assigned to this role.</div>}
          </div>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border p-2">
        <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>Close</Button>
        {tab !== 'users' && <Button size="sm" onClick={() => void (tab === 'menus' ? saveMenus() : saveData())} disabled={saving}>
          <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save'}
        </Button>}
      </div>
      <AppDialog open={pickerOpen} onOpenChange={setPickerOpen} title={`Add Users to ${role?.profileName ?? ''}`} icon={<UserPlus className="h-4 w-4" />} draggable className="w-[min(860px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]">
        <div className="flex h-[min(520px,70vh)] w-full min-w-0 flex-col p-3 text-xs">
          <div className="relative mb-2 shrink-0"><Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" /><input autoFocus className="w-full rounded-sm border border-border py-1 pl-7 pr-2" placeholder="Search user code, name, or department..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} /></div>
          <div className="min-h-0 flex-1 min-w-0 overflow-x-hidden overflow-y-auto rounded-sm border border-border">
            <table className="w-full table-fixed text-xs"><thead className="sticky top-0 bg-muted text-left text-2xs uppercase tracking-wide text-muted-foreground"><tr>
              <th className="w-9 px-2 py-1.5"><input type="checkbox" checked={visibleCandidates.length > 0 && visibleCandidates.every((user) => candidateUsers.has(user.id))} onChange={(e) => setCandidateUsers(e.target.checked ? new Set(visibleCandidates.map((user) => user.id)) : new Set())} /></th>
              <th className="w-[28%] px-2 py-1.5">User Code</th><th className="w-[32%] px-2 py-1.5">Name</th><th className="w-[40%] px-2 py-1.5">Department</th>
            </tr></thead><tbody>{visibleCandidates.map((user) => <tr key={user.id} className="border-t border-border/60">
              <td className="px-2 py-1.5"><input type="checkbox" checked={candidateUsers.has(user.id)} onChange={() => toggleCandidate(user.id)} /></td><td className="max-w-0 truncate px-2 py-1.5 font-mono" title={user.userCode}>{user.userCode}</td><td className="max-w-0 truncate px-2 py-1.5" title={user.userName}>{user.userName}</td><td className="max-w-0 truncate px-2 py-1.5" title={user.branchCode}>{user.branchCode}</td>
            </tr>)}</tbody></table>
            {visibleCandidates.length === 0 && <div className="p-4 text-muted-foreground">No matching users available.</div>}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2"><Button size="sm" variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button><Button size="sm" disabled={candidateUsers.size === 0} onClick={() => void addUsers()}>Add ({candidateUsers.size})</Button></div>
      </AppDialog>
    </div>
  )
}

/** 弹窗包裹（供旧入口/复用）；Roles 页用内联 RoleConfigPane */
export const RoleConfigDialog = ({ role, onClose }: RoleConfigDialogProps) => (
  <AppDialog open={role !== null} onOpenChange={(o) => { if (!o) onClose() }} title={`Configure Role: ${role?.profileName ?? ''}`} icon={<CheckSquare className="h-4 w-4" />} draggable dismissable className="w-[720px] max-w-[90vw]">
    {role && <RoleConfigPane role={role} onClose={onClose} />}
  </AppDialog>
)
