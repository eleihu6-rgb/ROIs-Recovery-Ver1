/**
 * UI Inspection Overlay — 开发期界面巡检工具
 *
 * 一个零依赖、纯 DOM 的浮层工具，用于给 Gantt 前端的任意元素分配稳定 ID 并复制。
 *
 * 功能：
 * - 右下角浮动开关，默认关闭；打开后进入巡检模式
 * - 悬停任意元素：outline 高亮 + 跟随鼠标的提示框（显示元素 ID 或 "div.classname"）
 * - 没有 ID 的元素自动分配 `ui1001` 起步、全局递增、永不复用的 ID（直接写入 DOM）
 * - 点击元素：复制其 ID 到剪贴板，提示框短暂显示 "Copied: ui1001"；阻止默认行为与冒泡
 * - 关闭开关：清除高亮与提示，完全停用；已分配的 ID 保留
 *
 * 通过 `initUiInspector()` 启动，仅在开发环境挂载（见 main.tsx）。
 */

const ROOT_ID = '__ui_inspector__'
const ID_PREFIX = 'ui'
const ID_START = 1001
const HIGHLIGHT_COLOR = '#e11d48'
const Z_TOP = 2147483647

let idCounter = ID_START

/** 当前高亮元素及其被覆盖前的 outline，用于关闭时还原。 */
interface HighlightState {
  el: HTMLElement
  prevOutline: string
  prevOutlineOffset: string
}

export const initUiInspector = (): void => {
  // 避免重复挂载（HMR / 多次调用）
  if (document.getElementById(ROOT_ID)) return

  let active = false
  let highlight: HighlightState | null = null
  let copiedTimer: ReturnType<typeof setTimeout> | null = null

  // ---- 浮层 DOM：开关 + 提示框 ---------------------------------------------
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.setAttribute('data-ui-inspector', 'root')

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.setAttribute('aria-label', 'Toggle UI inspector')
  Object.assign(toggle.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    width: '56px',
    height: '30px',
    borderRadius: '15px',
    border: 'none',
    background: '#cbd5e1',
    cursor: 'pointer',
    padding: '0',
    transition: 'background 0.2s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    zIndex: String(Z_TOP),
  } satisfies Partial<CSSStyleDeclaration>)

  const knob = document.createElement('span')
  Object.assign(knob.style, {
    position: 'absolute',
    top: '3px',
    left: '3px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.2s ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  } satisfies Partial<CSSStyleDeclaration>)
  toggle.appendChild(knob)

  const label = document.createElement('span')
  Object.assign(label.style, {
    position: 'fixed',
    right: '84px',
    bottom: '23px',
    font: '600 12px/1 system-ui, sans-serif',
    color: '#64748b',
    userSelect: 'none',
    pointerEvents: 'none',
    zIndex: String(Z_TOP),
  } satisfies Partial<CSSStyleDeclaration>)
  label.textContent = 'Inspect: OFF'

  const tooltip = document.createElement('div')
  Object.assign(tooltip.style, {
    position: 'fixed',
    display: 'none',
    maxWidth: '320px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'rgba(15,23,42,0.95)',
    color: '#fff',
    font: '500 12px/1.4 ui-monospace, "SF Mono", Menlo, monospace',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: String(Z_TOP),
  } satisfies Partial<CSSStyleDeclaration>)

  root.append(toggle, label, tooltip)
  document.body.appendChild(root)

  // ---- 工具函数 -------------------------------------------------------------

  /** 元素是否属于巡检浮层自身（开关/提示），这些元素跳过处理。 */
  const isOwnUi = (el: Element | null): boolean => !!el && !!el.closest(`#${ROOT_ID}`)

  /** 给元素分配（或返回已有的）ID。 */
  const ensureId = (el: HTMLElement): string => {
    if (el.id) return el.id
    const id = `${ID_PREFIX}${idCounter++}`
    el.id = id
    return id
  }

  /** 提示框文案：有 ID 用 ID，否则 "tag.firstClass" 或纯 tag。 */
  const describe = (el: HTMLElement): string => {
    if (el.id) return `#${el.id}`
    const tag = el.tagName.toLowerCase()
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : ''
    return cls ? `${tag}.${cls}` : tag
  }

  /** 将提示框定位到鼠标附近，并保证不超出视口。 */
  const positionTooltip = (mouseX: number, mouseY: number): void => {
    const rect = tooltip.getBoundingClientRect()
    const gap = 12
    let x = mouseX + gap
    let y = mouseY - rect.height - gap // 默认显示在鼠标上方

    if (x + rect.width > window.innerWidth) x = mouseX - rect.width - gap
    if (x < 0) x = gap
    if (y < 0) y = mouseY + gap // 上方放不下则移到下方
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - gap

    tooltip.style.left = `${Math.max(0, x)}px`
    tooltip.style.top = `${Math.max(0, y)}px`
  }

  const clearHighlight = (): void => {
    if (!highlight) return
    highlight.el.style.outline = highlight.prevOutline
    highlight.el.style.outlineOffset = highlight.prevOutlineOffset
    highlight = null
  }

  const setHighlight = (el: HTMLElement): void => {
    if (highlight?.el === el) return
    clearHighlight()
    highlight = {
      el,
      prevOutline: el.style.outline,
      prevOutlineOffset: el.style.outlineOffset,
    }
    el.style.outline = `2px solid ${HIGHLIGHT_COLOR}`
    el.style.outlineOffset = '-1px'
  }

  // ---- 事件处理（捕获阶段，抢在 React 之前） --------------------------------

  const onMouseOver = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null
    if (!target || isOwnUi(target)) return
    ensureId(target)
    setHighlight(target)
    tooltip.textContent = describe(target)
    tooltip.style.display = 'block'
    positionTooltip(e.clientX, e.clientY)
  }

  const onMouseMove = (e: MouseEvent): void => {
    if (tooltip.style.display !== 'none' && !copiedTimer) {
      positionTooltip(e.clientX, e.clientY)
    }
  }

  const onMouseOut = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null
    if (target && isOwnUi(target)) return
    // 离开到浮层外的非元素区域时收起
    const related = e.relatedTarget as HTMLElement | null
    if (!related || !isOwnUi(related)) {
      clearHighlight()
      if (!copiedTimer) tooltip.style.display = 'none'
    }
  }

  const onClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null
    if (!target || isOwnUi(target)) return
    e.preventDefault()
    e.stopPropagation()
    const id = ensureId(target)
    void copyToClipboard(id)
    setHighlight(target)
    tooltip.textContent = `Copied: ${id}`
    tooltip.style.display = 'block'
    positionTooltip(e.clientX, e.clientY)
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedTimer = null
      tooltip.textContent = describe(target)
    }, 1000)
  }

  const copyToClipboard = async (text: string): Promise<void> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
    } catch {
      // 降级到 execCommand
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } finally {
      ta.remove()
    }
  }

  // 捕获阶段监听，确保 preventDefault/stopPropagation 早于页面自身的 handler
  const listenerOpts: AddEventListenerOptions = { capture: true }

  const activate = (): void => {
    document.addEventListener('mouseover', onMouseOver, listenerOpts)
    document.addEventListener('mousemove', onMouseMove, listenerOpts)
    document.addEventListener('mouseout', onMouseOut, listenerOpts)
    document.addEventListener('click', onClick, listenerOpts)
  }

  const deactivate = (): void => {
    document.removeEventListener('mouseover', onMouseOver, listenerOpts)
    document.removeEventListener('mousemove', onMouseMove, listenerOpts)
    document.removeEventListener('mouseout', onMouseOut, listenerOpts)
    document.removeEventListener('click', onClick, listenerOpts)
    if (copiedTimer) {
      clearTimeout(copiedTimer)
      copiedTimer = null
    }
    clearHighlight()
    tooltip.style.display = 'none'
  }

  toggle.addEventListener('click', () => {
    active = !active
    if (active) {
      toggle.style.background = HIGHLIGHT_COLOR
      knob.style.left = '29px'
      label.textContent = 'Inspect: ON'
      label.style.color = HIGHLIGHT_COLOR
      activate()
    } else {
      toggle.style.background = '#cbd5e1'
      knob.style.left = '3px'
      label.textContent = 'Inspect: OFF'
      label.style.color = '#64748b'
      deactivate()
    }
  })
}
