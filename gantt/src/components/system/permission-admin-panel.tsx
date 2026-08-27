import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, KeyRound, UserX, UserCheck, Pencil, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from '@rois/ui'
import { AppDialog } from '@rois/ui'
import { api } from '@/services/api'
import { useShellStore } from '@/stores/shell-store'
import type { ActiveSystemItem } from '@/config/system-tools'
import { menuIcon, ICON_CHOICES } from '@/config/menu-icons'
import { RoleConfigPane } from './role-config-dialog'
import { notify } from '@/utils/notify'
import { dictionaryApi } from '@/services/dictionary-api'
import type { DictionaryItem } from '@/types'

// http-client 拦截器已解包 data 信封 → api.get 直接返回业务数据（如 {rows,total}），此处仅透传
const ok = async <T,>(p: Promise<T>): Promise<T> => p

interface AdminUser {
  id: number
  userCode: string
  userName: string
  branchCode: string
  gender: string | null
  email: string | null
  status: number
  isAdmin: number
  isFirstLogin: string | null
  portalAccess: string | null
  appAccess: string | null
  roles: string[]
  deptName: string | null
}

interface AdminProfile {
  id: number
  profileName: string
  profileCode: string | null
  division: string
  filiale: string
  idx: number | null
}

/** Users 管理：列表 + 新建（含角色/部门一次绑定）+ 启停 + 重置密码 + 编辑 */
const UsersManagement = () => {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [depts, setDepts] = useState<AdminDept[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ userCode: '', userName: '', password: '', pyAbbr: '', branchCode: '', gender: '', email: '' })
  const [selectedProfiles, setSelectedProfiles] = useState<number[]>([])
  const [creating, setCreating] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [editForm, setEditForm] = useState({ userName: '', branchCode: '', gender: '', email: '', portalAccess: 'Y' })
  const [editSelectedProfiles, setEditSelectedProfiles] = useState<number[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  const load = useCallback(async () => {
    const data = await ok<{ rows: AdminUser[] }>(api.get('/api/admin/users'))
    setUsers(data.rows)
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    void ok<AdminProfile[]>(api.get('/api/admin/profiles')).then(setProfiles).catch(() => undefined)
  }, [])
  useEffect(() => {
    void ok<AdminDept[]>(api.get('/api/admin/departments?kind=user')).then(setDepts).catch(() => undefined)
  }, [])

  /** Map a user's role codes/names (from list output) back to profile IDs. */
  const profileIndex = useMemo(() => {
    const byCode = new Map<string, AdminProfile>()
    const byName = new Map<string, AdminProfile>()
    for (const p of profiles) {
      if (p.profileCode) byCode.set(p.profileCode, p)
      if (p.profileName) byName.set(p.profileName, p)
    }
    return { byCode, byName }
  }, [profiles])

  const roleIdsFromNames = (names: string[]): number[] => {
    const ids: number[] = []
    for (const n of names) {
      const p = profileIndex.byCode.get(n) ?? profileIndex.byName.get(n)
      if (p) ids.push(p.id)
    }
    return ids
  }

  const openEdit = (u: AdminUser) => {
    setEditUser(u)
    setEditForm({ userName: u.userName, branchCode: u.branchCode ?? '', gender: u.gender ?? '', email: u.email ?? '', portalAccess: u.portalAccess ?? 'Y' })
    setEditSelectedProfiles(roleIdsFromNames(u.roles ?? []))
  }
  const saveEdit = async () => {
    if (!editUser) return
    const issues: string[] = []
    if (!editForm.userName.trim()) issues.push('Name is required')
    if (!editForm.branchCode) issues.push('Department is required')
    if (issues.length > 0) { notify.error(issues.join('; ')); return }
    setSavingEdit(true)
    try {
      await api.patch(`/api/admin/users/${editUser.id}`, {
        userName: editForm.userName,
        branchCode: editForm.branchCode,
        gender: editForm.gender || null,
        email: editForm.email || null,
        portalAccess: editForm.portalAccess,
      })
      await api.post(`/api/admin/users/${editUser.id}/profiles`, { profileIds: editSelectedProfiles })
      setEditUser(null)
      notify.success('User updated')
      await load()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingEdit(false)
    }
  }

  const create = async () => {
    const issues: string[] = []
    if (!form.userCode.trim()) issues.push('User Code is required')
    if (!form.userName.trim()) issues.push('Name is required')
    if (form.password.length < 8) issues.push('Password must be at least 8 characters')
    if (!form.branchCode) issues.push('Department is required')
    if (issues.length > 0) { notify.error(issues.join('; ')); return }
    setCreating(true)
    try {
      // http-client unwraps the envelope; cast matches runtime { id } (Axios typings stay wrapped).
      const created = await ok<{ id: number }>(
        api.post('/api/admin/users', {
          ...form,
          gender: form.gender || null,
          email: form.email || null,
          portalAccess: 'Y',
          passwordAccess: 'Y',
        }) as Promise<{ id: number }>,
      )
      if (selectedProfiles.length > 0) {
        await api.post(`/api/admin/users/${created.id}/profiles`, { profileIds: selectedProfiles })
      }
      setCreateOpen(false)
      setForm({ userCode: '', userName: '', password: '', pyAbbr: '', branchCode: '', gender: '', email: '' })
      setSelectedProfiles([])
      notify.success('User created')
      await load()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  const toggleStatus = async (u: AdminUser) => {
    try {
      await api.post(`/api/admin/users/${u.id}/disable`, { disabled: u.status !== 1 })
      await load()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Status change failed')
    }
  }

  const resetPassword = async (u: AdminUser) => {
    const newPassword = window.prompt(`Reset password for ${u.userCode} (min 8 chars):`)
    if (newPassword && newPassword.length >= 8) {
      try {
        await api.post(`/api/admin/users/${u.id}/reset-password`, { newPassword })
        notify.success('Password reset')
        await load()
      } catch (e) {
        notify.error(e instanceof Error ? e.message : 'Reset failed')
      }
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Users</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New User</Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-left text-2xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-semibold">User Code</th>
              <th className="px-2 py-1.5 font-semibold">Name</th>
              <th className="px-2 py-1.5 font-semibold">Gender</th>
              <th className="px-2 py-1.5 font-semibold">Email</th>
              <th className="px-2 py-1.5 font-semibold">Department</th>
              <th className="px-2 py-1.5 font-semibold">Roles</th>
              <th className="px-2 py-1.5 font-semibold">Status</th>
              <th className="px-2 py-1.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.userCode}`} className="border-t border-border/60">
                <td className="px-2 py-1.5 font-mono tabular-nums">{u.userCode}</td>
                <td className="px-2 py-1.5">{u.userName}</td>
                <td className="px-2 py-1.5" data-testid={`user-gender-${u.userCode}`}>{u.gender === 'M' ? 'Male' : u.gender === 'F' ? 'Female' : '-'}</td>
                <td className="px-2 py-1.5" data-testid={`user-email-${u.userCode}`}>{u.email ?? '-'}</td>
                <td className="px-2 py-1.5" data-testid={`user-dept-${u.userCode}`}>{u.deptName ?? u.branchCode}</td>
                <td className="px-2 py-1.5" data-testid={`user-roles-${u.userCode}`}>{u.roles.length > 0 ? u.roles.join(', ') : '-'}</td>
                <td className="px-2 py-1.5">
                  <span className={u.status === 0 ? 'text-emerald-600' : 'text-destructive'}>
                    {u.status === 0 ? 'Active' : u.status === 1 ? 'Disabled' : 'Locked'}
                  </span>
                </td>
                <td className="flex items-center gap-1 px-2 py-1.5">
                  <Button size="sm" variant="ghost" title="Edit" data-testid={`edit-user-${u.userCode}`} onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" title="Enable/Disable" onClick={() => void toggleStatus(u)}>
                    {u.status === 0 ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" title="Reset password" onClick={() => void resetPassword(u)}><KeyRound className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AppDialog open={createOpen} onOpenChange={setCreateOpen} title="New User" icon={<Plus className="h-4 w-4" />} draggable data-testid="new-user-dialog">
        <div className="grid gap-2 p-3 text-xs">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">User Code</span><input data-testid="new-user-code" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.userCode} onChange={(e) => setForm({ ...form, userCode: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Name</span><input data-testid="new-user-name" name="new-user-name" autoComplete="off" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Password</span><input type="password" data-testid="new-user-password" name="new-user-password" autoComplete="new-password" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Gender</span>
            <select data-testid="new-user-gender" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">—</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Email</span><input type="email" data-testid="new-user-email" name="new-user-email" autoComplete="off" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Py Abbr</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={form.pyAbbr} onChange={(e) => setForm({ ...form, pyAbbr: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Department</span>
            <select data-testid="new-user-dept" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.branchCode} onChange={(e) => setForm({ ...form, branchCode: e.target.value })}>
              <option value="" disabled>Select department…</option>
              {depts.map((d) => <option key={d.branchCode} value={d.branchCode}>{d.branchName} ({d.branchCode})</option>)}
            </select>
          </label>
          <div className="grid gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Roles</span>
            <div data-testid="new-user-roles" className="grid max-h-40 grid-cols-2 gap-1 overflow-auto rounded-sm border border-border p-2">
              {profiles.length === 0 ? <span className="text-muted-foreground">No roles available</span> : profiles.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    data-testid={`new-user-role-${p.id}`}
                    checked={selectedProfiles.includes(p.id)}
                    onChange={(e) => setSelectedProfiles((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                  />
                  <span className="truncate">{p.profileName}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
          <Button size="sm" data-testid="new-user-save" onClick={() => void create()} disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
        </div>
      </AppDialog>

      <AppDialog open={editUser !== null} onOpenChange={(o) => { if (!o) setEditUser(null) }} title={`Edit User ${editUser?.userCode ?? ''}`} icon={<Pencil className="h-4 w-4" />} draggable data-testid={editUser ? `edit-user-dialog-${editUser.userCode}` : undefined}>
        <div className="grid gap-2 p-3 text-xs">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Name</span><input data-testid="edit-user-name" name="edit-user-name" autoComplete="off" className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.userName} onChange={(e) => setEditForm({ ...editForm, userName: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Gender</span>
            <select data-testid="edit-user-gender" className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
              <option value="">—</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Email</span><input type="email" data-testid="edit-user-email" name="edit-user-email" autoComplete="off" className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Department</span>
            <select data-testid="edit-user-dept" className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.branchCode} onChange={(e) => setEditForm({ ...editForm, branchCode: e.target.value })}>
              <option value="" disabled>Select department…</option>
              {depts.map((d) => <option key={d.branchCode} value={d.branchCode}>{d.branchName} ({d.branchCode})</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Portal Access</span>
            <select className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.portalAccess} onChange={(e) => setEditForm({ ...editForm, portalAccess: e.target.value })}>
              <option value="Y">Yes</option><option value="N">No</option>
            </select>
          </label>
          <div className="grid gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Roles</span>
            <div data-testid="edit-user-roles" className="grid max-h-40 grid-cols-2 gap-1 overflow-auto rounded-sm border border-border p-2">
              {profiles.length === 0 ? <span className="text-muted-foreground">No roles available</span> : profiles.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    data-testid={`edit-user-role-${editUser?.userCode ?? 'x'}-${p.id}`}
                    checked={editSelectedProfiles.includes(p.id)}
                    onChange={(e) => setEditSelectedProfiles((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                  />
                  <span className="truncate">{p.profileName}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => setEditUser(null)} disabled={savingEdit}>Cancel</Button>
          <Button size="sm" data-testid={editUser ? `edit-user-save-${editUser.userCode}` : 'edit-user-save'} onClick={() => void saveEdit()} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save'}</Button>
        </div>
      </AppDialog>
    </div>
  )
}

/** Roles 管理：列表 + 新建（菜单/按钮/数据权限配置在 P2 后续迭代） */
const ProfilesManagement = () => {
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ profileName: '', profileCode: '', division: 'P' })
  const [editProfile, setEditProfile] = useState<AdminProfile | null>(null)
  const [editForm, setEditForm] = useState({ profileName: '', profileCode: '', division: 'P' })
  const [selectedRole, setSelectedRole] = useState<AdminProfile | null>(null)

  const load = useCallback(async () => {
    const data = await ok<AdminProfile[]>(api.get('/api/admin/profiles'))
    setProfiles(data)
    setSelectedRole((cur) => cur ?? data[0] ?? null)
  }, [])
  useEffect(() => { void load() }, [load])

  const create = async () => {
    await api.post('/api/admin/profiles', { ...form, filiale: 'F8' })
    setCreateOpen(false)
    setForm({ profileName: '', profileCode: '', division: 'P' })
    await load()
  }

  const openEdit = (p: AdminProfile) => {
    setEditProfile(p)
    setEditForm({ profileName: p.profileName, profileCode: p.profileCode ?? '', division: p.division })
  }
  const saveEdit = async () => {
    if (!editProfile) return
    await api.patch(`/api/admin/profiles/${editProfile.id}`, editForm)
    setEditProfile(null)
    await load()
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Roles</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New Role</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* 左：角色列表（常驻） */}
        <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-md border border-border">
          <div className="flex h-8 shrink-0 items-center border-b border-border bg-muted/40 px-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Roles ({profiles.length})
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {profiles.map((p) => (
              <div
                key={p.id}
                data-testid={`role-list-${p.profileCode ?? p.id}`}
                role="button"
                tabIndex={0}
                className={`group relative flex cursor-pointer flex-col border-l-2 px-3 py-2 transition-colors ${selectedRole?.id === p.id ? 'border-sidebar-primary bg-sidebar-accent' : 'border-transparent hover:bg-muted/40'}`}
                onClick={() => setSelectedRole(p)}
              >
                <span className={`truncate text-xs ${selectedRole?.id === p.id ? 'font-semibold text-sidebar-accent-foreground' : 'text-foreground'}`}>{p.profileName}</span>
                <span className="truncate font-mono text-2xs text-muted-foreground">{p.profileCode ?? '-'} · {p.division}</span>
                <button
                  className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted group-hover:flex"
                  title="Edit"
                  onClick={(e) => { e.stopPropagation(); openEdit(p) }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 右：角色配置（树形菜单 / 数据权限） */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {selectedRole ? `${selectedRole.profileName} · Permissions` : 'Select a role'}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {selectedRole
              ? <RoleConfigPane role={selectedRole} onClose={() => { setSelectedRole(null); void load() }} />
              : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a role on the left to configure its permissions.</div>}
          </div>
        </div>
      </div>
      <AppDialog open={createOpen} onOpenChange={setCreateOpen} title="New Role" icon={<Plus className="h-4 w-4" />} draggable>
        <div className="grid gap-2 p-3 text-xs">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Code</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={form.profileCode} onChange={(e) => setForm({ ...form, profileCode: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Name</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={form.profileName} onChange={(e) => setForm({ ...form, profileName: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Division</span>
            <select className="flex-1 rounded-sm border border-border px-2 py-1" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })}>
              <option value="P">Pilot (P)</option><option value="C">Cabin (C)</option><option value="A">Air (A)</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={() => void create()}>Create</Button>
        </div>
      </AppDialog>
      <AppDialog open={editProfile !== null} onOpenChange={(o) => { if (!o) setEditProfile(null) }} title={`Edit Role ${editProfile?.profileName ?? ''}`} icon={<Pencil className="h-4 w-4" />} draggable>
        <div className="grid gap-2 p-3 text-xs">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Code</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.profileCode} onChange={(e) => setEditForm({ ...editForm, profileCode: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Name</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.profileName} onChange={(e) => setEditForm({ ...editForm, profileName: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Division</span>
            <select className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.division} onChange={(e) => setEditForm({ ...editForm, division: e.target.value })}>
              <option value="P">Pilot (P)</option><option value="C">Cabin (C)</option><option value="A">Air (A)</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => setEditProfile(null)}>Cancel</Button>
          <Button size="sm" onClick={() => void saveEdit()}>Save</Button>
        </div>
      </AppDialog>
    </div>
  )
}

interface AdminMenu {
  id: number
  menuCode: string
  menuName: string
  parentMenuCode: string
  factoryName: string | null
  systemType: string
  idx: number | null
  icon: string | null
  apiUris: string | null
  ctrls: { id: number; menuCtlCode: string; menuCtlName: string; idx: number | null; icon: string | null; apiUris: string | null }[]
}

interface PbsUser {
  id: number
  crewId: string
  userCode: string
  userName: string
  status: number
  base: string | null
  rank: string | null
  division: string | null
  email: string | null
  tel: string | null
  branchCode: string | null
  pyAbbr: string | null
  gender: string | null
  effDt: string | null
  expDt: string | null
  lastLoginAt: string | null
  lockedUntil: string | null
}

interface AdminDept {
  id: number
  branchCode: string
  branchName: string
  parentCode: string | null
  division: string | null
  idx: number | null
}

/** Icon selector with a visual preview; native select options cannot render Lucide icons. */
const IconPicker = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const [open, setOpen] = useState(false)
  const SelectedIcon = value ? (ICON_CHOICES[value] ?? menuIcon('', value)) : null
  return (
    <div className="relative flex-1">
      <button type="button" className="flex w-full items-center gap-2 rounded-sm border border-border bg-background px-2 py-1 text-left" onClick={() => setOpen((v) => !v)}>
        {SelectedIcon ? <SelectedIcon className="h-4 w-4 shrink-0 text-muted-foreground" /> : <span className="h-4 w-4 shrink-0 rounded-sm border border-dashed border-muted-foreground/50" />}
        <span className="truncate">{value || 'Default (auto)'}</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full min-w-[220px] overflow-auto rounded-sm border border-border bg-popover p-1 shadow-lg">
          <button type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => { onChange(''); setOpen(false) }}>
            <span className="h-4 w-4 shrink-0 rounded-sm border border-dashed border-muted-foreground/50" /> Default (auto)
          </button>
          {Object.entries(ICON_CHOICES).map(([name, Icon]) => (
            <button type="button" key={name} className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted ${value === name ? 'bg-muted font-semibold' : ''}`} onClick={() => { onChange(name); setOpen(false) }}>
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> <span>{name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Menus 管理：左侧 3 级菜单树（顶层Tab→子菜单→页面），右侧显示选中页面的按钮 */
const MenusManagement = () => {
  const [menus, setMenus] = useState<AdminMenu[]>([])
  const [selected, setSelected] = useState<string>('ROOT')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ menuCode: '', menuName: '', parentMenuCode: 'ROOT', idx: '', apiUris: '', icon: '' })
  const [btnOpen, setBtnOpen] = useState(false)
  const [btnForm, setBtnForm] = useState({ menuCtlCode: '', menuCtlName: '', idx: '', apiUris: '', icon: '' })
  const [editBtn, setEditBtn] = useState<{ id: number; menuCtlName: string; idx: string; apiUris: string; icon: string } | null>(null)
  const [editMenu, setEditMenu] = useState<AdminMenu | null>(null)
  const [editMenuForm, setEditMenuForm] = useState({ menuName: '', parentMenuCode: 'ROOT', idx: '', apiUris: '', icon: '' })

  const load = useCallback(async () => {
    const data = await ok<AdminMenu[]>(api.get('/api/admin/menus'))
    setMenus(data)
  }, [])
  useEffect(() => { void load() }, [load])

  const create = async () => {
    await api.post('/api/admin/menus', { ...form, idx: form.idx === '' ? undefined : Number(form.idx), systemType: 'S', icon: form.icon || null, apiUris: form.apiUris || null })
    setCreateOpen(false)
    setForm({ menuCode: '', menuName: '', parentMenuCode: 'ROOT', idx: '', apiUris: '', icon: '' })
    await load()
  }

  const openEditMenu = (m: AdminMenu) => {
    setEditMenu(m)
    setEditMenuForm({ menuName: m.menuName, parentMenuCode: m.parentMenuCode, idx: m.idx == null ? '' : String(m.idx), apiUris: (m as AdminMenu & { apiUris?: string | null }).apiUris ?? '', icon: m.icon ?? '' })
  }
  const saveEditMenu = async () => {
    if (!editMenu) return
    await api.patch(`/api/admin/menus/${editMenu.id}`, { menuName: editMenuForm.menuName, parentMenuCode: editMenuForm.parentMenuCode, idx: editMenuForm.idx === '' ? undefined : Number(editMenuForm.idx), apiUris: editMenuForm.apiUris || null, icon: editMenuForm.icon || null })
    setEditMenu(null)
    await load()
  }

  const removeMenu = async (id: number) => {
    if (!window.confirm('Delete this menu and its buttons?')) return
    await api.delete(`/api/admin/menus/${id}`)
    if (menus.find((m) => m.id === id)?.menuCode === selected) setSelected('ROOT')
    await load()
  }

  const createBtn = async () => {
    if (!selected) return
    await api.post('/api/admin/menus/ctrls', { ...btnForm, idx: btnForm.idx === '' ? undefined : Number(btnForm.idx), icon: btnForm.icon || null, apiUris: btnForm.apiUris || null, menuCode: selected })
    setBtnOpen(false)
    setBtnForm({ menuCtlCode: '', menuCtlName: '', idx: '', apiUris: '', icon: '' })
    await load()
  }
  const saveBtn = async () => {
    if (!editBtn) return
    await api.patch(`/api/admin/menus/ctrls/${editBtn.id}`, { menuCtlName: editBtn.menuCtlName, idx: editBtn.idx === '' ? undefined : Number(editBtn.idx), icon: editBtn.icon || null, apiUris: editBtn.apiUris || null })
    setEditBtn(null)
    await load()
  }
  const removeBtn = async (id: number) => {
    if (!window.confirm('Delete this button?')) return
    await api.delete(`/api/admin/menus/ctrls/${id}`)
    await load()
  }

  const childrenOf = (code: string): AdminMenu[] => menus.filter((m) => m.parentMenuCode === code).sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
  const selectedMenu = menus.find((m) => m.menuCode === selected) ?? null
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['LIVE', 'SCENARIO', 'DATA', 'LEGALITY', 'SYSTEM', 'PBS']))
  const toggleExpand = (code: string) => setExpanded((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })

  const renderNode = (code: string, depth: number): React.ReactNode => {
    const children = childrenOf(code)
    const node = menus.find((m) => m.menuCode === code)
    const hasChildren = children.length > 0
    const Icon = menuIcon(code, node?.icon)
    const isOpen = expanded.has(code)
    return (
      <div key={code}>
        <div
          role="button"
          tabIndex={0}
          data-testid={`menu-tree-${code}`}
          className={`flex cursor-pointer items-center gap-1.5 truncate border-l-2 px-2 py-1 text-xs transition-colors ${selected === code ? 'border-sidebar-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground' : 'border-transparent text-foreground/70 hover:bg-muted/50'}`}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          onClick={() => { setSelected(code); if (hasChildren) toggleExpand(code) }}
        >
          {hasChildren ? (
            isOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : <span className="w-3 shrink-0" />}
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{node?.menuName ?? code}</span>
          {!hasChildren && <span className="text-2xs text-muted-foreground">{node?.ctrls.length}</span>}
        </div>
        {hasChildren && isOpen && children.map((c) => renderNode(c.menuCode, depth + 1))}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Menus</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New Menu</Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        {/* 左：菜单树（跳过 ROOT 根节点） */}
        <div className="w-[35%] min-w-[220px] overflow-auto rounded-md border border-border p-1">
          {childrenOf('ROOT').map((c) => renderNode(c.menuCode, 0))}
        </div>
        {/* 右：选中菜单的按钮 */}
        <div className="flex min-w-0 flex-1 flex-col rounded-md border border-border">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
            {selectedMenu && (() => { const Icon = menuIcon(selectedMenu.menuCode, selectedMenu.icon); return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> })()}
            <span className="truncate text-sm font-semibold text-foreground">{selectedMenu?.menuName ?? selected}</span>
            <span className="truncate font-mono text-2xs text-muted-foreground">{selectedMenu?.menuCode ?? ''}</span>
            <div className="flex-1" />
            {selectedMenu && (
              <>
                <Button size="sm" variant="ghost" onClick={() => openEditMenu(selectedMenu)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => void removeMenu(selectedMenu.id)}>Delete</Button>
              </>
            )}
            {selected && selected !== 'ROOT' && childrenOf(selected).length === 0 && (
              <Button size="sm" onClick={() => setBtnOpen(true)}><Plus className="h-3.5 w-3.5" /> New Button</Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {selectedMenu && selected !== 'ROOT' && childrenOf(selected).length === 0 ? (
              selectedMenu.ctrls.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No buttons for this page.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-muted text-left text-2xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="w-14 px-2 py-1.5 font-semibold">Idx</th><th className="w-16 px-2 py-1.5 font-semibold">Icon</th><th className="px-2 py-1.5 font-semibold">Code</th><th className="px-2 py-1.5 font-semibold">Name</th><th className="px-2 py-1.5 font-semibold">API</th><th className="px-2 py-1.5 font-semibold">Actions</th></tr>
                  </thead>
                  <tbody>
                    {[...selectedMenu.ctrls].sort((a, b) => (a.idx ?? Number.MAX_SAFE_INTEGER) - (b.idx ?? Number.MAX_SAFE_INTEGER)).map((c) => (
                      <tr key={c.id} className="border-t border-border/60">
                        <td className="px-2 py-1.5 font-mono tabular-nums">{c.idx ?? '-'}</td>
                        <td className="px-2 py-1.5">{(() => { const Icon = menuIcon('', c.icon); return c.icon ? <span className="inline-flex items-center gap-1" title={c.icon}><Icon className="h-4 w-4" /><span className="text-2xs">{c.icon}</span></span> : <span className="text-muted-foreground">-</span> })()}</td>
                        <td className="px-2 py-1.5 font-mono tabular-nums">{c.menuCtlCode}</td>
                        <td className="px-2 py-1.5">{c.menuCtlName}</td>
                        <td className="max-w-[200px] truncate px-2 py-1.5 font-mono text-2xs text-muted-foreground" title={c.apiUris ?? ''}>{c.apiUris ?? '-'}</td>
                        <td className="flex items-center gap-1 px-2 py-1.5">
                          <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditBtn({ id: c.id, menuCtlName: c.menuCtlName, idx: c.idx == null ? '' : String(c.idx), icon: c.icon ?? '', apiUris: c.apiUris ?? '' })}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" title="Delete" onClick={() => void removeBtn(c.id)}>Del</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Select a page (leaf) on the left to view its buttons.</div>
            )}
          </div>
        </div>
      </div>
      <AppDialog open={createOpen} onOpenChange={setCreateOpen} title="New Menu" icon={<Plus className="h-4 w-4" />} draggable>
        <div className="grid gap-2 p-3 text-xs">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Code</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={form.menuCode} onChange={(e) => setForm({ ...form, menuCode: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Name</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={form.menuName} onChange={(e) => setForm({ ...form, menuName: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Parent</span>
            <select className="flex-1 rounded-sm border border-border px-2 py-1" value={form.parentMenuCode} onChange={(e) => setForm({ ...form, parentMenuCode: e.target.value })}>
              <option value="ROOT">ROOT (top tab)</option>
              {menus.filter((m) => m.menuCode !== 'ROOT').map((p) => <option key={p.menuCode} value={p.menuCode}>{p.menuCode}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Idx</span><input type="number" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.idx} onChange={(e) => setForm({ ...form, idx: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">API URIs</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={form.apiUris} onChange={(e) => setForm({ ...form, apiUris: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Icon</span>
            <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={() => void create()}>Create</Button>
        </div>
      </AppDialog>
      <AppDialog open={editMenu !== null} onOpenChange={(o) => { if (!o) setEditMenu(null) }} title={`Edit Menu ${editMenu?.menuCode ?? ''}`} icon={<Pencil className="h-4 w-4" />} draggable>
        <div className="grid gap-2 p-3 text-xs">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Name</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={editMenuForm.menuName} onChange={(e) => setEditMenuForm({ ...editMenuForm, menuName: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Parent</span>
            <select className="flex-1 rounded-sm border border-border px-2 py-1" value={editMenuForm.parentMenuCode} onChange={(e) => setEditMenuForm({ ...editMenuForm, parentMenuCode: e.target.value })}>
              <option value="ROOT">ROOT (top tab)</option>
              {menus.filter((m) => m.menuCode !== 'ROOT' && m.menuCode !== editMenu?.menuCode).map((p) => <option key={p.menuCode} value={p.menuCode}>{p.menuCode} - {p.menuName}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Idx</span><input type="number" className="flex-1 rounded-sm border border-border px-2 py-1" value={editMenuForm.idx} onChange={(e) => setEditMenuForm({ ...editMenuForm, idx: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">API URIs</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={editMenuForm.apiUris} onChange={(e) => setEditMenuForm({ ...editMenuForm, apiUris: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Icon</span>
            <IconPicker value={editMenuForm.icon} onChange={(icon) => setEditMenuForm({ ...editMenuForm, icon })} />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => setEditMenu(null)}>Cancel</Button>
          <Button size="sm" onClick={() => void saveEditMenu()}>Save</Button>
        </div>
      </AppDialog>
      <AppDialog open={btnOpen} onOpenChange={setBtnOpen} title={`New Button on ${selected}`} icon={<Plus className="h-4 w-4" />} draggable>
        <div className="grid gap-2 p-3 text-xs">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Code</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={btnForm.menuCtlCode} onChange={(e) => setBtnForm({ ...btnForm, menuCtlCode: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Name</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={btnForm.menuCtlName} onChange={(e) => setBtnForm({ ...btnForm, menuCtlName: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Idx</span><input type="number" className="flex-1 rounded-sm border border-border px-2 py-1" value={btnForm.idx} onChange={(e) => setBtnForm({ ...btnForm, idx: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">API URIs</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={btnForm.apiUris} onChange={(e) => setBtnForm({ ...btnForm, apiUris: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Icon</span><IconPicker value={btnForm.icon} onChange={(icon) => setBtnForm({ ...btnForm, icon })} /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => setBtnOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={() => void createBtn()}>Create</Button>
        </div>
      </AppDialog>
      <AppDialog open={editBtn !== null} onOpenChange={(o) => { if (!o) setEditBtn(null) }} title="Edit Button" icon={<Pencil className="h-4 w-4" />} draggable>
        <div className="grid gap-2 p-3 text-xs">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Name</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={editBtn?.menuCtlName ?? ''} onChange={(e) => setEditBtn((b) => (b ? { ...b, menuCtlName: e.target.value } : b))} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Idx</span><input type="number" className="flex-1 rounded-sm border border-border px-2 py-1" value={editBtn?.idx ?? ''} onChange={(e) => setEditBtn((b) => (b ? { ...b, idx: e.target.value } : b))} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">API URIs</span><input className="flex-1 rounded-sm border border-border px-2 py-1" value={editBtn?.apiUris ?? ''} onChange={(e) => setEditBtn((b) => (b ? { ...b, apiUris: e.target.value } : b))} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Icon</span><IconPicker value={editBtn?.icon ?? ''} onChange={(icon) => setEditBtn((b) => (b ? { ...b, icon } : b))} /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => setEditBtn(null)}>Cancel</Button>
          <Button size="sm" onClick={() => void saveBtn()}>Save</Button>
        </div>
      </AppDialog>
    </div>
  )
}

/** Render an ISO timestamp as YYYY-MM-DD, or '-' when null/empty. */
const formatDate = (iso: string | null): string => {
  if (!iso) return '-'
  const s = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '-'
}

/** PBS Users 管理：机组账号列表 + 启停 + 重置密码 */
const PbsUsersManagement = () => {
  const [users, setUsers] = useState<PbsUser[]>([])
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    const data = await ok<{ rows: PbsUser[] }>(api.get('/api/admin/pbs-users'))
    setUsers(data.rows)
  }, [])
  useEffect(() => { void load() }, [load])

  const toggleStatus = async (u: PbsUser) => {
    await api.post(`/api/admin/pbs-users/${u.id}/disable`, { disabled: u.status !== 1 })
    await load()
  }

  const resetPassword = async (u: PbsUser) => {
    const newPassword = window.prompt(`Reset password for ${u.userCode} (min 8 chars):`)
    if (newPassword && newPassword.length >= 8) {
      await api.post(`/api/admin/pbs-users/${u.id}/reset-password`, { newPassword })
    }
  }

  const visible = users.filter((u) => !filter || u.crewId.toLowerCase().includes(filter.toLowerCase()) || u.userCode.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">PBS Users</h2>
        <div className="flex items-center gap-1">
          <input placeholder="Search crew/user..." className="h-7 w-44 rounded-sm border border-border bg-transparent px-2 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-left text-2xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Crew ID</th>
              <th className="px-2 py-1.5 font-semibold">User Code</th>
              <th className="px-2 py-1.5 font-semibold">Name</th>
              <th className="px-2 py-1.5 font-semibold">Base</th>
              <th className="px-2 py-1.5 font-semibold">Rank</th>
              <th className="px-2 py-1.5 font-semibold">Div</th>
              <th className="px-2 py-1.5 font-semibold">Branch</th>
              <th className="px-2 py-1.5 font-semibold">PyAbbr</th>
              <th className="px-2 py-1.5 font-semibold">Gender</th>
              <th className="px-2 py-1.5 font-semibold">Email</th>
              <th className="px-2 py-1.5 font-semibold">Tel</th>
              <th className="px-2 py-1.5 font-semibold">Eff Dt</th>
              <th className="px-2 py-1.5 font-semibold">Exp Dt</th>
              <th className="px-2 py-1.5 font-semibold">Status</th>
              <th className="px-2 py-1.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => (
              <tr key={u.id} className="border-t border-border/60">
                <td className="px-2 py-1.5 font-mono tabular-nums">{u.crewId}</td>
                <td className="px-2 py-1.5 font-mono tabular-nums">{u.userCode}</td>
                <td className="px-2 py-1.5">{u.userName}</td>
                <td className="px-2 py-1.5 font-mono tabular-nums">{u.base ?? '-'}</td>
                <td className="px-2 py-1.5 font-mono tabular-nums">{u.rank ?? '-'}</td>
                <td className="px-2 py-1.5">{u.division ?? '-'}</td>
                <td className="px-2 py-1.5 font-mono tabular-nums">{u.branchCode ?? '-'}</td>
                <td className="px-2 py-1.5 font-mono tabular-nums">{u.pyAbbr ?? '-'}</td>
                <td className="px-2 py-1.5">{u.gender ?? '-'}</td>
                <td className="px-2 py-1.5">{u.email ?? '-'}</td>
                <td className="px-2 py-1.5 font-mono tabular-nums">{u.tel ?? '-'}</td>
                <td className="px-2 py-1.5 font-mono tabular-nums">{formatDate(u.effDt)}</td>
                <td className="px-2 py-1.5 font-mono tabular-nums">{formatDate(u.expDt)}</td>
                <td className="px-2 py-1.5">
                  <span className={u.status === 0 ? 'text-emerald-600' : 'text-destructive'}>{u.status === 0 ? 'Active' : 'Disabled'}</span>
                </td>
                <td className="flex items-center gap-1 px-2 py-1.5">
                  <Button size="sm" variant="ghost" title="Enable/Disable" onClick={() => void toggleStatus(u)}>
                    {u.status === 0 ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" title="Reset password" onClick={() => void resetPassword(u)}><KeyRound className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Departments 管理：user_department / crew_department 列表 + 新增 */
const DepartmentsManagement = () => {
  const [kind, setKind] = useState<'user' | 'crew'>('user')
  const [depts, setDepts] = useState<AdminDept[]>([])
  const [divisions, setDivisions] = useState<DictionaryItem[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ branchCode: '', branchName: '', parentCode: '', division: '' })
  const [editDept, setEditDept] = useState<AdminDept | null>(null)
  const [editForm, setEditForm] = useState({ branchName: '', parentCode: '', division: '' })

  const load = useCallback(async () => {
    const data = await ok<AdminDept[]>(api.get(`/api/admin/departments?kind=${kind}`))
    setDepts(data)
  }, [kind])
  useEffect(() => { void load() }, [load])

  // Division options are parameterized — fetch from dictionary so admins can
  // add new values (e.g. 'G' for Ground) without a code change.
  useEffect(() => {
    void ok<DictionaryItem[]>(dictionaryApi.getByParentCode('DIVISION'))
      .then(setDivisions)
      .catch(() => undefined)
  }, [])

  const create = async () => {
    await api.post(`/api/admin/departments?kind=${kind}`, {
      ...form,
      parentCode: form.parentCode || null,
      division: form.division || null,
    })
    setCreateOpen(false)
    setForm({ branchCode: '', branchName: '', parentCode: '', division: '' })
    await load()
  }

  const openEdit = (d: AdminDept) => {
    setEditDept(d)
    setEditForm({ branchName: d.branchName, parentCode: d.parentCode ?? '', division: d.division ?? '' })
  }
  const saveEdit = async () => {
    if (!editDept) return
    await api.patch(`/api/admin/departments/${editDept.id}?kind=${kind}`, {
      ...editForm,
      parentCode: editForm.parentCode || null,
      division: editForm.division || null,
    })
    setEditDept(null)
    await load()
  }

  const remove = async (id: number) => {
    if (!window.confirm('Delete this department?')) return
    await api.delete(`/api/admin/departments/${id}?kind=${kind}`)
    await load()
  }

  /** Parent options exclude the row being edited (prevents self-parent cycle). */
  const parentOptions = (excludeId?: number) =>
    depts.filter((d) => d.id !== excludeId)

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Departments</h2>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-muted/40 p-0.5 text-xs">
            <button data-testid="dept-tab-user" className={`rounded px-2 py-0.5 ${kind === 'user' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`} onClick={() => setKind('user')}>User Dept</button>
            <button data-testid="dept-tab-crew" className={`rounded px-2 py-0.5 ${kind === 'crew' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`} onClick={() => setKind('crew')}>Crew Dept</button>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New Dept</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-left text-2xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Code</th>
              <th className="px-2 py-1.5 font-semibold">Name</th>
              <th className="px-2 py-1.5 font-semibold">Parent</th>
              <th className="px-2 py-1.5 font-semibold">Division</th>
              <th className="px-2 py-1.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {depts.map((d) => (
              <tr key={d.id} data-testid={`dept-row-${d.branchCode}`} className="border-t border-border/60">
                <td className="px-2 py-1.5 font-mono tabular-nums">{d.branchCode}</td>
                <td className="px-2 py-1.5">{d.branchName}</td>
                <td className="px-2 py-1.5" data-testid={`dept-parent-${d.branchCode}`}>{d.parentCode ?? '-'}</td>
                <td className="px-2 py-1.5" data-testid={`dept-division-${d.branchCode}`}>{d.division ?? '-'}</td>
                <td className="px-2 py-1.5">
                  <Button size="sm" variant="ghost" title="Edit" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" title="Delete" onClick={() => void remove(d.id)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AppDialog open={createOpen} onOpenChange={setCreateOpen} title={`New ${kind === 'user' ? 'User' : 'Crew'} Department`} icon={<Plus className="h-4 w-4" />} draggable data-testid="new-dept-dialog">
        <div className="grid gap-2 p-3 text-xs">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Code</span><input data-testid="new-dept-code" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.branchCode} onChange={(e) => setForm({ ...form, branchCode: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Name</span><input data-testid="new-dept-name" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Parent</span>
            <select data-testid="new-dept-parent" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.parentCode} onChange={(e) => setForm({ ...form, parentCode: e.target.value })}>
              <option value="">— (top level)</option>
              {parentOptions().map((p) => <option key={p.id} value={p.branchCode}>{p.branchCode} — {p.branchName}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Division</span>
            <select data-testid="new-dept-division" className="flex-1 rounded-sm border border-border px-2 py-1" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })}>
              <option value="">—</option>
              {divisions.map((d) => <option key={d.id} value={d.codeValue ?? d.code ?? ''}>{d.name ?? d.code} ({d.codeValue ?? d.code})</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button size="sm" data-testid="new-dept-save" onClick={() => void create()}>Create</Button>
        </div>
      </AppDialog>
      <AppDialog open={editDept !== null} onOpenChange={(o) => { if (!o) setEditDept(null) }} title={`Edit ${kind === 'user' ? 'User' : 'Crew'} Department ${editDept?.branchCode ?? ''}`} icon={<Pencil className="h-4 w-4" />} draggable data-testid={editDept ? `edit-dept-dialog-${editDept.branchCode}` : undefined}>
        <div className="grid gap-2 p-3 text-xs">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Name</span><input data-testid="edit-dept-name" className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.branchName} onChange={(e) => setEditForm({ ...editForm, branchName: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Parent</span>
            <select data-testid="edit-dept-parent" className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.parentCode} onChange={(e) => setEditForm({ ...editForm, parentCode: e.target.value })}>
              <option value="">— (top level)</option>
              {parentOptions(editDept?.id).map((p) => <option key={p.id} value={p.branchCode}>{p.branchCode} — {p.branchName}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Division</span>
            <select data-testid="edit-dept-division" className="flex-1 rounded-sm border border-border px-2 py-1" value={editForm.division} onChange={(e) => setEditForm({ ...editForm, division: e.target.value })}>
              <option value="">—</option>
              {divisions.map((d) => <option key={d.id} value={d.codeValue ?? d.code ?? ''}>{d.name ?? d.code} ({d.codeValue ?? d.code})</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => setEditDept(null)}>Cancel</Button>
          <Button size="sm" data-testid={editDept ? `edit-dept-save-${editDept.branchCode}` : 'edit-dept-save'} onClick={() => void saveEdit()}>Save</Button>
        </div>
      </AppDialog>
    </div>
  )
}

/** System 管理面板：按 activeSystemItem 渲染对应管理页 */
export const PermissionAdminPanel = () => {
  const activeSystemItem = useShellStore((s) => s.activeSystemItem) as ActiveSystemItem
  switch (activeSystemItem) {
    case 'user-mgmt': return <UsersManagement />
    case 'profile-mgmt': return <ProfilesManagement />
    case 'menu-mgmt': return <MenusManagement />
    case 'pbs-user-mgmt': return <PbsUsersManagement />
    case 'dept-mgmt': return <DepartmentsManagement />
    default: return null
  }
}
