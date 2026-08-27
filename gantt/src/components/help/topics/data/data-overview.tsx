import { HelpH2 } from '../../help-article'

export default function DataOverview() {
  return (
    <>
      <HelpH2>What the Data tab is for</HelpH2>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        The <strong className="text-foreground">Data</strong> tab is the master-data maintenance
        area. It groups the reference records that scheduling, legality checks, and optimization
        flows depend on.
      </p>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Basic data pages cover items such as bases, ranks, fleets and aircraft, locations and
        routes, assignments, qualifications, compositions, roster periods, dictionaries, queries,
        and holidays. Crew data pages cover crew master records and workload summaries.
      </p>

      <HelpH2>How to work in this section</HelpH2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Open the required submenu page from the Data tree, review the grid or form on that page,
        and make changes only when you understand the downstream scheduling impact. Data changes
        can affect filters, rule checks, crew eligibility, and future optimization inputs.
      </p>
    </>
  )
}
