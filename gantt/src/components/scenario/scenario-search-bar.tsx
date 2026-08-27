import React, { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rois/ui'
import { useScenarioStore } from '@/stores/scenario-store'
import { useShellStore } from '@/stores/shell-store'
import type { ScenarioStatus, ScenarioType } from '@/types'

export const ScenarioSearchBar = (): React.ReactNode => {
  const searchTerm      = useScenarioStore((s) => s.searchTerm)
  const filterType      = useScenarioStore((s) => s.filterType)
  const filterStatus    = useScenarioStore((s) => s.filterStatus)
  const setSearch       = useScenarioStore((s) => s.setSearch)
  const setFilterType   = useScenarioStore((s) => s.setFilterType)
  const setFilterStatus = useScenarioStore((s) => s.setFilterStatus)
  const setScenarioItem = useShellStore((s) => s.setScenarioItem)

  const [inputValue, setInputValue] = useState(searchTerm)

  // 防抖搜索：仅在用户输入时触发，初次 mount 跳过（fetchList 由父组件 useEffect 负责）
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const timer = setTimeout(() => {
      setSearch(inputValue)
    }, 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]) // setSearch 是稳定 Zustand action，不需放入 deps

  const handleTypeChange = (value: string): void => {
    if (value === 'ALL') {
      setFilterType('')
      setScenarioItem('all')
      return
    }
    const type = value as ScenarioType
    setFilterType(type)
    if (type === 'PO') setScenarioItem('po')
    else if (type === 'RO') setScenarioItem('ro')
  }

  const handleStatusChange = (value: string): void => {
    setFilterStatus(value === 'ALL' ? '' : (value as ScenarioStatus))
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 border-b border-border shrink-0">
      {/* 搜索框 — 全宽 */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="h-8 pl-8 text-xs"
          placeholder="Search scenarios…"
          aria-label="Search scenarios by ID, name, or user"
          title="Search by scenario ID, name, or user"
          value={inputValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
        />
      </div>

      {/* 过滤器 — 两列并排 */}
      <div className="flex gap-2">
        <Select value={filterType === '' ? 'ALL' : filterType} onValueChange={handleTypeChange}>
          <SelectTrigger className="h-7 flex-1 text-xs" data-testid="scenario-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">All Types</SelectItem>
            <SelectItem value="PO" className="text-xs">PO</SelectItem>
            <SelectItem value="RO" className="text-xs">RO</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus === '' ? 'ALL' : filterStatus} onValueChange={handleStatusChange}>
          <SelectTrigger className="h-7 flex-1 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">All Status</SelectItem>
            <SelectItem value="DRAFT" className="text-xs">Draft</SelectItem>
            <SelectItem value="RUNNING" className="text-xs">Running</SelectItem>
            <SelectItem value="DONE" className="text-xs">Done</SelectItem>
            <SelectItem value="FAILED" className="text-xs">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
