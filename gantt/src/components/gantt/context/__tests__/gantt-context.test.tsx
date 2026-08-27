import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GanttContextProvider, useGanttContextId } from '../gantt-context'

const Probe = () => <span>{String(useGanttContextId())}</span>

describe('GanttContext', () => {
  it("defaults to 'live' with no provider", () => {
    const html = renderToStaticMarkup(<Probe />)
    expect(html).toContain('live')
  })

  it('provides the scenario id', () => {
    const html = renderToStaticMarkup(
      <GanttContextProvider contextId={6}>
        <Probe />
      </GanttContextProvider>,
    )
    expect(html).toContain('6')
  })
})
