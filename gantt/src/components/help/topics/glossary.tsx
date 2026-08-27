// gantt/src/components/help/topics/glossary.tsx

const TERMS = [
  { term: 'Crew Base', def: 'The airport a crew member is based at. Used in filters and pairing assignments.' },
  { term: 'Draft', def: 'An unsaved change on the canvas. Drafts are held in memory until you press Ctrl+S to save them.' },
  { term: 'Filiale', def: 'A two-letter code identifying the airline operating entity within the system (e.g. F8).' },
  { term: 'Gantt canvas', def: 'The large scheduling grid on the Live screen. Each row is one crew member; each block is an assignment.' },
  { term: 'Ground task', def: 'A non-flight assignment: training, standby, admin duty, etc. Not linked to a pairing.' },
  { term: 'KPI', def: 'Key Performance Indicator — a metric shown after an optimization run. Examples: utilisation rate, violation count, pairing efficiency.' },
  { term: 'Pairing', def: 'A sequence of flights and rest periods that form one multi-day trip for a crew member.' },
  { term: 'Pane', def: 'A panel on the Gantt canvas. Roster, Pairing, and Flight panes can be open at the same time.' },
  { term: 'PO', def: 'Pairing Optimization — builds the best set of pairings from a group of flights.' },
  { term: 'RO', def: 'Roster Optimization — assigns individual crew members to pairings to build personal rosters.' },
  { term: 'Roster', def: "A crew member's personal schedule showing all their assignments over a period." },
  { term: 'Rule Set', def: 'A named set of compliance rules used to check crew assignments on the Live screen.' },
  { term: 'Scenario', def: 'A draft plan you optimize and review without affecting the live schedule.' },
  { term: 'TO', def: 'Training Optimization — plans training assignments alongside operational duties.' },
]

export default function Glossary() {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border">
          <th className="py-2 pr-4 text-left font-semibold text-foreground w-1/3">Term</th>
          <th className="py-2 text-left font-semibold text-foreground">Definition</th>
        </tr>
      </thead>
      <tbody>
        {TERMS.map((t) => (
          <tr key={t.term} className="border-b border-border/50 last:border-0">
            <td className="py-2 pr-4 font-semibold text-foreground align-top">{t.term}</td>
            <td className="py-2 text-muted-foreground align-top leading-relaxed">{t.def}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
