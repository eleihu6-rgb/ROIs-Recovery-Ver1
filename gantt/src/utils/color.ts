/**
 * Color mapping for different assignment groups / task types.
 * Used by the Canvas renderer to draw task blocks.
 */

export interface TaskColor {
  bg: string
  border: string
  text: string
}

/** Assignment group color map */
const ASSIGNMENT_GROUP_COLORS: Record<string, TaskColor> = {
  // Flight duties
  FLT: { bg: '#3b82f6', border: '#2563eb', text: '#ffffff' },
  DHD: { bg: '#60a5fa', border: '#3b82f6', text: '#ffffff' },

  // Ground duties
  SBY: { bg: '#f97316', border: '#ea580c', text: '#ffffff' },  // Standby - orange
  TRN: { bg: '#22c55e', border: '#16a34a', text: '#ffffff' },  // Training - green
  GRD: { bg: '#a855f7', border: '#9333ea', text: '#ffffff' },  // Ground duty - purple
  SIM: { bg: '#14b8a6', border: '#0d9488', text: '#ffffff' },  // Simulator - teal
  OFF: { bg: '#9ca3af', border: '#6b7280', text: '#ffffff' },  // Day off - gray
  VAC: { bg: '#6b7280', border: '#4b5563', text: '#ffffff' },  // Vacation - dark gray
  SLV: { bg: '#78716c', border: '#57534e', text: '#ffffff' },  // Sick leave - stone
  ADM: { bg: '#ec4899', border: '#db2777', text: '#ffffff' },  // Admin - pink
}

/** Default color for unknown assignment groups */
const DEFAULT_COLOR: TaskColor = { bg: '#64748b', border: '#475569', text: '#ffffff' }

/** Get color for a task based on its assignment group */
export const getTaskColor = (assignmentGroup: string): TaskColor => {
  return ASSIGNMENT_GROUP_COLORS[assignmentGroup] || DEFAULT_COLOR
}

/** Color for selected task overlay */
export const SELECTION_COLOR = 'rgba(59, 130, 246, 0.3)'

/** Color for hovered task overlay */
export const HOVER_COLOR = 'rgba(59, 130, 246, 0.15)'

/** Color for violation border */
export const VIOLATION_COLOR = '#ef4444'

/** Get all known assignment group codes */
export const getAssignmentGroupCodes = (): string[] => {
  return Object.keys(ASSIGNMENT_GROUP_COLORS)
}
