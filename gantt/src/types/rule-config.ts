export interface RuleGroupConfig {
  id: number
  groupCode: string
  name: string
  description: string | null
  usage: string
  filiale: string
  division: string
  isDefault: boolean
  itemCount: number
}

export interface TemplateVar {
  name: string
  label: string
  example: string | number
}

export interface RuleConditions {
  crew?: {
    rank?: string[]      // e.g. ["CA", "FO"]
    division?: string    // "LH" | "SH"
  }
  pairing?: {
    fleet?: string[]     // e.g. ["B737", "B738"]
  }
}

export interface RuleGroupItemConfig {
  id: number
  instanceId: number
  instanceCode: string
  templateCode: string
  name: string
  reference: string | null
  category: string
  checkType: string        // 'CHECK' | 'CALC' | 'BOTH'
  severity: string
  overridable: boolean
  params: Record<string, unknown>
  conditions: RuleConditions | null
  paramSchema: Record<string, unknown>
  templateVars: TemplateVar[]
  messageTemplate: string | null
  enabled: boolean
  sortOrder: number
  division: string
}

export interface InstancePatch {
  name?: string
  description?: string | null
  reference?: string | null
  conditions?: RuleConditions | null
  params?: Record<string, unknown>
  severity?: string
  overridable?: boolean
  division?: 'P' | 'C' | 'A'
  messageTemplate?: string | null
}

export interface RuleInstanceOption {
  instanceCode: string
  name: string
  templateCode: string
  category: string
  checkType: string
  severity: string
  reference: string | null
}

export interface NewGroupData {
  groupCode: string
  name: string
  description?: string
  usage: string
  division: string
  isDefault: boolean
}

export interface ItemPatch {
  enabled?: boolean
}

export interface RuleTemplate {
  code: string
  name: string
  category: string
  subcategory: string | null
  description: string | null
  reference: string | null
  checkType: string
  paramSchema: Record<string, unknown>
  templateVars: TemplateVar[]
  constraintType: string | null
  owner: string
}

export interface FullInstanceConfig {
  id: number
  templateCode: string
  instanceCode: string
  name: string
  description: string | null
  reference: string | null
  severity: string
  overridable: boolean
  params: Record<string, unknown>
  conditions: RuleConditions | null
  messageTemplate: string | null
  filiale: string
  division: string
  owner: string
}

export interface NewInstanceData {
  templateCode: string
  instanceCode: string
  name: string
  description?: string
  reference?: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  overridable: boolean
  params: Record<string, unknown>
  division: 'P' | 'C' | 'A'
}
