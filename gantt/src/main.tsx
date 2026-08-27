import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@rois/ui/globals.css'
import App from './App'
import { initAppVersionUpdates } from './services/app-version-service'

initAppVersionUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 开发期界面巡检工具（右下角开关，给元素分配 uiXXXX ID 并复制）。
// 自动化测试下（Playwright 设 navigator.webdriver=true）不挂载——其右下角 position:fixed
// 浮动开关会盖住网格右下角的行内动作图标并拦截点击，导致 e2e flake（如 Legal-6003 的
// pop-out 图标）。真人开发浏览器 webdriver=false，不受影响。
if (import.meta.env.DEV && !navigator.webdriver) {
  void import('./utils/ui-inspector').then(({ initUiInspector }) => initUiInspector())
}

// 测试自省钩子：暴露 window.__ganttTest 供 Playwright 断言 Canvas 实际渲染的对象。
// 仅非生产构建生效（installGanttTestHook 内部 import.meta.env.PROD 守卫）。
void import('./utils/gantt-test-hook').then(({ installGanttTestHook }) => installGanttTestHook())
