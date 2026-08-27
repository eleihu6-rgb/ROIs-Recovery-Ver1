import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GanttContextProvider } from '@/components/gantt/context/gantt-context'
import { getFilterStore, useFilterStore, useFilterStoreForContext } from '../filter-store'

describe('filter-store context factory', () => {
  it("aliases the singleton export to the 'live' instance", () => {
    expect(useFilterStore).toBe(getFilterStore('live'))
  })

  it('isolates state between live and a scenario instance', () => {
    // setCrewFilter takes Partial<CrewFilter> and merges; bases: ['YEG'] sets it
    getFilterStore('live').getState().setCrewFilter({ bases: ['YEG'] })
    expect(getFilterStore(6).getState().crew.bases).not.toContain('YEG')
    expect(getFilterStore('live').getState().crew.bases).toContain('YEG')
  })

  it('exposes getState/subscribe on resolved instances (zustand API preserved)', () => {
    const s = getFilterStore(460)
    expect(typeof s.getState).toBe('function')
    expect(typeof s.subscribe).toBe('function')
  })

  it('persists live and scenario filters to separate localStorage keys', () => {
    localStorage.clear()
    getFilterStore('live').getState().setCrewFilter({ bases: ['YEG'] })
    getFilterStore(6).getState().setCrewFilter({ bases: ['YOW'] })
    expect(localStorage.getItem('gantt-filter-v2')).toContain('YEG')
    expect(localStorage.getItem('gantt-filter-v2')).not.toContain('YOW')
    expect(localStorage.getItem('gantt-filter-v2-6')).toContain('YOW')
  })

  it('useFilterStoreForContext resolves the instance from GanttContext', () => {
    const Probe = () => (
      <span>{useFilterStoreForContext() === getFilterStore(6) ? 'match' : 'no-match'}</span>
    )
    const html = renderToStaticMarkup(
      <GanttContextProvider contextId={6}>
        <Probe />
      </GanttContextProvider>,
    )
    expect(html).toContain('match')
    expect(html).not.toContain('no-match')
  })
})
