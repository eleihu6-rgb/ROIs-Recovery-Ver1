import { GanttSubToolbar } from './gantt-sub-toolbar'
import { AppLayout } from '@/components/layout/app-layout'

/** Live → Roster 视图：Gantt 专用工具栏 + 完整排班界面（首次进入为空，经 Filter 拉取数据；
    空态提醒内联在工具栏 Filter 按钮旁，见 gantt-sub-toolbar.tsx） */
export const RosterView = () => (
  <div className="relative flex h-full flex-col overflow-hidden">
    <GanttSubToolbar />
    <AppLayout />
  </div>
)
