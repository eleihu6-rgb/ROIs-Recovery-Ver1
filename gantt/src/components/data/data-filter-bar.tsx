import { Search } from 'lucide-react'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rois/ui'
import { GanttEnglishDatePicker } from '@/components/common/gantt-date-fields'
import type { DataExpiryFilter } from '@/types/data-maintenance'
import { useDataMaintenanceStore } from '@/stores/data-maintenance-store'

type ExpiryScope = DataExpiryFilter['scope']
type ExpiryMode = DataExpiryFilter['mode']

interface DataFilterBarProps {
  onSearch?: (filters: Record<string, unknown>) => void
}

export const DataFilterBar = ({ onSearch }: DataFilterBarProps) => {
  const { crewFilter, setCrewFilter } = useDataMaintenanceStore()

  const {
    crewId,
    name,
    rank,
    base,
    qualification,
    team,
    expiryScope,
    expiryMode,
    expiryDays,
    referenceDate,
  } = crewFilter

  const handleSearch = () => {
    onSearch?.({
      crewId: crewId || undefined,
      name: name || undefined,
      rank: rank && rank !== 'all' ? rank : undefined,
      base: base && base !== 'all' ? base : undefined,
      qualification: qualification && qualification !== 'all' ? qualification : undefined,
      team: team && team !== 'all' ? team : undefined,
      expiryScope,
      expiryMode,
      expiryDays: expiryMode === 'expiring_in_days' ? expiryDays : undefined,
      referenceDate: referenceDate || undefined,
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/20 px-4 py-2">
      {/* Crew ID */}
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Crew ID</span>
        <Input
          data-testid="data-filter-crew-id"
          value={crewId}
          onChange={(e) => setCrewFilter({ crewId: e.target.value })}
          placeholder="e.g. 247, 248"
          className="h-7 w-36 text-xs font-mono"
        />
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
        <Input
          data-testid="data-filter-name"
          value={name}
          onChange={(e) => setCrewFilter({ name: e.target.value })}
          placeholder="Last or first"
          className="h-7 w-32 text-xs"
        />
      </div>

      {/* Rank */}
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Rank</span>
        <Select value={rank || 'all'} onValueChange={(v) => setCrewFilter({ rank: v === 'all' ? '' : v })}>
          <SelectTrigger data-testid="data-filter-rank" className="h-7 w-24 text-xs">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="CA">CA</SelectItem>
            <SelectItem value="FO">FO</SelectItem>
            <SelectItem value="FE">FE</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Base */}
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Base</span>
        <Select value={base || 'all'} onValueChange={(v) => setCrewFilter({ base: v === 'all' ? '' : v })}>
          <SelectTrigger data-testid="data-filter-base" className="h-7 w-24 text-xs">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Qualification */}
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Qual</span>
        <Select value={qualification || 'all'} onValueChange={(v) => setCrewFilter({ qualification: v === 'all' ? '' : v })}>
          <SelectTrigger data-testid="data-filter-qualification" className="h-7 w-28 text-xs">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Team */}
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Team</span>
        <Select value={team || 'all'} onValueChange={(v) => setCrewFilter({ team: v === 'all' ? '' : v })}>
          <SelectTrigger data-testid="data-filter-team" className="h-7 w-24 text-xs">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mx-1 h-7 w-px bg-border self-end" />

      {/* Expiry scope */}
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Expiry Scope</span>
        <Select value={expiryScope} onValueChange={(v) => setCrewFilter({ expiryScope: v as ExpiryScope })}>
          <SelectTrigger data-testid="data-filter-expiry-scope" className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="base">Base</SelectItem>
            <SelectItem value="rank">Rank</SelectItem>
            <SelectItem value="fleet">Fleet</SelectItem>
            <SelectItem value="qualification">Qualification</SelectItem>
            <SelectItem value="team">Team</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="certificate">Certificate</SelectItem>
            <SelectItem value="license">License</SelectItem>
            <SelectItem value="language">Language</SelectItem>
            <SelectItem value="entitlement">Entitlement</SelectItem>
            <SelectItem value="profile">Profile</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Expiry mode */}
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Expiry Mode</span>
        <Select value={expiryMode} onValueChange={(v) => setCrewFilter({ expiryMode: v as ExpiryMode })}>
          <SelectTrigger data-testid="data-filter-expiry-mode" className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="expiring_in_days">Expiring in Days</SelectItem>
            <SelectItem value="range">Date Range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Expiry days — only shown when mode=expiring_in_days */}
      {expiryMode === 'expiring_in_days' && (
        <div className="flex flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Days</span>
          <Input
            data-testid="data-filter-expiry-days"
            type="number"
            value={expiryDays}
            onChange={(e) => setCrewFilter({ expiryDays: Number(e.target.value) })}
            placeholder="30"
            min={1}
            className="h-7 w-16 text-xs font-mono tabular-nums"
          />
        </div>
      )}

      {/* Reference date */}
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Ref Date</span>
        <GanttEnglishDatePicker
          ariaLabel="Expiry reference date"
          buttonClassName="w-36"
          testId="data-filter-expiry-reference-date"
          value={referenceDate}
          onValueChange={(value) => setCrewFilter({ referenceDate: value })}
        />
      </div>

      {/* Search button */}
      <Button
        size="sm"
        className="h-7 gap-1.5 px-3 text-xs self-end"
        onClick={handleSearch}
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        Search
      </Button>
    </div>
  )
}
