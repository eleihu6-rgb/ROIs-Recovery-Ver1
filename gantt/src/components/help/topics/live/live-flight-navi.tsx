import { HelpStep, HelpNote, HelpTip, HelpScreenshot, HelpControlsRef } from '../../help-article'
import { Navigation } from 'lucide-react'
import { useHelpExamples } from '../../use-help-examples'

export default function LiveFlightNavi() {
  const ex = useHelpExamples()
  return (
    <>
      <HelpStep n={1}>
        Open a <strong>Flight</strong> pane, then click the <strong>Navi</strong> button
        (the compass icon) in the pane's condition strip. The <strong>Flight Navi</strong>
        window opens as a table of every flight in the current date range.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/flight-navi.png"
        alt="The Flight Navi window: a filterable table of flights with PTNs, Roster, and COF navigation columns"
        caption="Flight Navi lists every flight in the date range; the PTNs, Roster, and COF columns navigate to that flight's pairings, crew, and detail card."
      />

      <HelpNote>
        Flight Navi is a non-modal window: the Roster, Pairing, and Flight panes stay visible
        and live behind it, so you can watch them update as you navigate. Drag the blue title
        bar to move the window aside, and close it with the <strong>×</strong> in the corner.
      </HelpNote>

      <HelpNote>
        The same Navi button and window are available inside a <strong>Scenario</strong>'s Flight
        pane. There the flights, pairing/crew counts, and the PTNs/Roster/COF navigation all come
        from that scenario's own data, so you can explore a scenario's flights exactly as in Live.
      </HelpNote>

      <HelpStep n={2}>
        Narrow the list with the filters along the top: the start/end dates (pre-filled to the
        Gantt's open period), the <strong>FLT Reg</strong> (registration) and
        <strong> Coverage</strong> dropdowns, the <strong>DHD / R/C / P/C / CNL</strong>
        toggles, and the <strong>DEP</strong> / <strong>ARR</strong> / <strong>FLTH</strong> boxes.
      </HelpStep>

      <HelpStep n={3}>
        Use the smart search box (top-right) for quick lookups: type a flight number
        (<em>924</em>), a route (<em>{ex.base}-{ex.second}</em>), departures from an airport
        (<em>{ex.base}-</em>), or arrivals into one (<em>-{ex.base}</em>).
      </HelpStep>

      <HelpStep n={4}>
        Navigate straight from a flight using the last columns:
        click the <strong>PTNs</strong> count to bring that flight's pairings to the top of the
        Pairing pane, the <strong>Roster</strong> count to bring its crew to the top of the
        Roster pane, or <strong>COF</strong> to open the flight's detail card.
      </HelpStep>

      <HelpTip>
        The window stays open after each click, so you can jump from one flight to the next and
        compare results in the panes behind it without reopening Flight Navi.
      </HelpTip>

      <HelpControlsRef items={[
        { name: 'Navi button', icon: <Navigation className="h-3.5 w-3.5" />, description: 'On the Flight pane condition strip — opens the Flight Navi table.' },
        { name: 'FLT Reg / Coverage', description: 'Filter the list by aircraft registration, or by crew coverage (Coverage / Covered / Uncovered).' },
        { name: 'DHD / R/C / P/C / CNL', description: 'Toggles: deadhead flights, roster-covered, pairing-covered, and cancelled flights.' },
        { name: 'DEP / ARR / FLTH', description: 'Filter by departure airport, arrival airport, and minimum flight (block) hours.' },
        { name: 'Smart search', description: `Flight number, route (${ex.base}-${ex.second}), departures (${ex.base}-), or arrivals (-${ex.base}).` },
        { name: 'PTNs', description: "A flight's pairing count — click to float those pairings to the top of the Pairing pane." },
        { name: 'Roster', description: "A flight's crew count — click to float those crew to the top of the Roster pane." },
        { name: 'COF', description: "Open the flight's detail card (same as double-clicking a flight on the canvas)." },
      ]} />
    </>
  )
}
