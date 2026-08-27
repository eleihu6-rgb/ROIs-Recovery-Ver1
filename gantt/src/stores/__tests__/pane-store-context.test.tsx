import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GanttContextProvider } from '@/components/gantt/context/gantt-context'
import { getPaneStore, usePaneStore, usePaneStoreForContext } from '../pane-store'

describe('pane-store context factory', () => {
  it("aliases the singleton export to the 'live' instance", () => {
    expect(usePaneStore).toBe(getPaneStore('live'))
  })
  it('isolates sort state between live and a scenario instance', () => {
    getPaneStore('live').getState().setSortColumn('scenario-roster', 'rank')
    expect(getPaneStore(6).getState().getSortColumn('scenario-roster')).toBeNull()
    expect(getPaneStore('live').getState().getSortColumn('scenario-roster')).toBe('rank')
  })
  it('resolves the instance from GanttContext', () => {
    const Probe = () => <span>{usePaneStoreForContext() === getPaneStore(6) ? 'match' : 'no'}</span>
    const html = renderToStaticMarkup(
      <GanttContextProvider contextId={6}><Probe /></GanttContextProvider>,
    )
    expect(html).toContain('match')
  })
})
