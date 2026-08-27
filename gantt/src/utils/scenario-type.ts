import type { ElementType } from 'react'
import { FlaskConical, Users, GraduationCap } from 'lucide-react'
import type { ScenarioType } from '@/types/scenario'

export const SCENARIO_TYPE_ICON: Record<ScenarioType, ElementType> = {
  PO: FlaskConical,
  RO: Users,
  TO: GraduationCap,
}

export const SCENARIO_TYPE_COLOR: Record<ScenarioType, { bg: string; text: string }> = {
  PO: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  RO: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  TO: { bg: 'bg-violet-500/15', text: 'text-violet-400' },
}
