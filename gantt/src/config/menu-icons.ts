import {
  LayoutDashboard, CalendarDays, FlaskConical, Database, Scale, Settings2,
  CalendarCog, HelpCircle, Users, Plane, Briefcase, GraduationCap, Layers,
  BookOpen, Search, Award, Building2, Cpu, MapPin, ClipboardList, BarChart2,
  Timer, Gauge, ListChecks, Wrench, Clock3, UserCog, Shield, Menu as MenuIcon,
  FileText, GitBranch, Home, Server, Activity, AlertTriangle, Globe, type LucideIcon,
  Plus, Pencil, Trash2, Copy, RefreshCw, Save, Lock, Unlock, Upload, Download,
  Play, Eye, SearchCheck, KeyRound, RotateCcw, RotateCw, History, Ban,
  SlidersHorizontal, CalendarPlus, ArrowLeftRight, ClipboardCheck,
} from 'lucide-react'

/** 编辑器可选图标（lucide 图标名 → 组件） */
export const ICON_CHOICES: Record<string, LucideIcon> = {
  LayoutDashboard, CalendarDays, FlaskConical, Database, Scale, Settings2,
  CalendarCog, HelpCircle, Users, Plane, Briefcase, GraduationCap, Layers,
  BookOpen, Search, Award, Building2, Cpu, MapPin, ClipboardList, BarChart2,
  Timer, Gauge, ListChecks, Wrench, Clock3, UserCog, Shield, FileText, GitBranch,
  Home, Server, Activity, AlertTriangle, Globe, MenuIcon,
  Plus, Pencil, Trash2, Copy, RefreshCw, Save, Lock, Unlock, Upload, Download,
  Play, Eye, SearchCheck, KeyRound, RotateCcw, RotateCw, History, Ban,
  SlidersHorizontal, CalendarPlus, ArrowLeftRight, ClipboardCheck,
}

/**
 * system_menu.menu_code → lucide 图标映射（默认值）。
 * 若菜单在 DB 存了 icon（lucide 图标名），优先用 DB 值。
 */
const MENU_ICONS: Record<string, LucideIcon> = {
  DASHBOARD: LayoutDashboard,
  LIVE: CalendarDays,
  SCENARIO: FlaskConical,
  DATA: Database,
  LEGALITY: Scale,
  SYSTEM: Settings2,
  PBS: CalendarCog,
  HELP: HelpCircle,
  LIVE_ROSTER: CalendarDays,
  SCENARIO_LIST: FlaskConical,
  SCENARIO_ALL: FlaskConical,
  SCENARIO_PO: GitBranch,
  SCENARIO_RO: CalendarDays,
  SCENARIO_CREW_BIDS: FileText,
  DATA_ORG_BASE: Building2,
  DATA_RANK: Award,
  DATA_FLEET_AIRCRAFT: Cpu,
  DATA_LOCATION_ROUTE: MapPin,
  DATA_ASSIGNMENT: ClipboardList,
  DATA_QUALIFICATION: GraduationCap,
  DATA_COMPOSITION: Layers,
  DATA_ROSTER_PERIOD: CalendarDays,
  DATA_CONFIG_DICTIONARY: BookOpen,
  DATA_QUERY: Search,
  DATA_HOLIDAY: CalendarDays,
  DATA_CREW_MASTER: Users,
  DATA_CREW_WORKLOAD: BarChart2,
  LEGALITY_RULE_SETS: Scale,
  LEGALITY_RULE_INSTANCES: ListChecks,
  LEGALITY_COMPOSITION: Layers,
  LEGALITY_COMP_LOAD: Layers,
  SYSTEM_SCHEDULER: Timer,
  SYSTEM_QUEUE_TASKS: Wrench,
  SYSTEM_GRAFANA: Gauge,
  SYSTEM_PROMETHEUS: Gauge,
  SYSTEM_WINDMILL: Settings2,
  SYSTEM_DATA_QUALITY: Gauge,
  SYSTEM_USER_MGMT: UserCog,
  SYSTEM_PROFILE_MGMT: Shield,
  SYSTEM_MENU_MGMT: ListChecks,
  SYSTEM_PBS_USER_MGMT: Users,
  SYSTEM_DEPT_MGMT: Building2,
  PBS_PERIOD: CalendarCog,
  PBS_BID_DEFINITIONS: ListChecks,
  PBS_BUSINESS_TIME: Clock3,
  PBS_ADMIN_TOOLS: Wrench,
  PBS_SIMULATED_CREW_PORTAL: UserCog,
}

/** 按 menu_code（+可选 DB icon 名）返回 lucide 图标 */
export const menuIcon = (menuCode: string, dbIcon?: string | null): LucideIcon => {
  if (dbIcon && ICON_CHOICES[dbIcon]) return ICON_CHOICES[dbIcon]
  return MENU_ICONS[menuCode] ?? MenuIcon
}
