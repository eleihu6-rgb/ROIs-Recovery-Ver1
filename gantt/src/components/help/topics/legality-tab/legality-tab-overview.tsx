import { HelpH2 } from '../../help-article'

export default function LegalityTabOverview() {
  return (
    <>
      <HelpH2>What the Legality tab is for</HelpH2>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        The <strong className="text-foreground">Legality</strong> tab is the workspace for managing
        the rule material used by Live and Scenario checks. It is different from the bottom
        <strong className="text-foreground"> Legality Rules</strong> help group, which documents
        individual rule meanings.
      </p>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Use this area to inspect rule sets, browse rule templates and instances, and review
        parameter tables before operational checks consume them.
      </p>

      <HelpH2>Related Help pages</HelpH2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        For detailed rule-set management, rule template browsing, parameter editing, and individual
        F8 rule explanations, open the <strong className="text-foreground">Legality Rules</strong>
        group near the bottom of the Help menu.
      </p>
    </>
  )
}
