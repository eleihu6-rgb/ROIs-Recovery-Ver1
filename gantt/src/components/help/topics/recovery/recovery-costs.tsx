import { HelpH2, HelpStep, HelpNote, HelpWarning } from '../../help-article'

export default function RecoveryArticle() {
  return <>
<HelpWarning>Partial — recovery uses the cost library, but the current bridge does not provide a complete operational or payroll comparison for cases 102–104. A numeric result, a green status or Best cost is not proof that every relevant cost was priced.</HelpWarning>
<HelpStep n={1}>Compare <strong>Cost</strong> together with crew impact, Cancel/Add counts and <strong>Stability</strong>. Options are reordered by the calculated amount; the tree’s star marks the lowest estimate. Rule status and warnings must be reviewed independently of price.</HelpStep>
<HelpStep n={2}>Click the option’s cost amount to open <strong>Cost breakdown</strong>. Read each cost rule, Qty, Amount and status: <strong>priced</strong>, <strong>unpriced</strong>, <strong>disabled</strong> or <strong>no rev</strong>. Missing or unpriced rows contribute no amount to the total; they are unknown costs, not free services. Read the notes as well as the header.</HelpStep>
<HelpStep n={3}>Review the case-specific gaps. <strong>102</strong> prices one fixed Day-off recall event, not actual airport standby credit or incremental guaranteed pay. <strong>103</strong> requests swap base quantity two, rejected as unpriced by the default fixed tariff, and supplies a separate change-penalty quantity of one. <strong>104</strong> supplies no delay duration; it can receive a roster-change penalty even though its roster-change metric is zero.</HelpStep>
<HelpStep n={4}>Before choosing, confirm the applicable tariffs, quantities and currency and account for omitted costs. An <strong>unavailable</strong> breakdown means a fallback estimate may be displayed. Calculation-failure notes can also accompany a zero result. Mixed currencies are shown separately in the breakdown; the ranking does not perform currency conversion. Do not rank incomparable amounts as a financial recommendation.</HelpStep>
<HelpH2>What the total measures</HelpH2>
<HelpNote>The displayed total is the sum of priced library components, including configured change and follow-on penalties, less any DHD savings. It is the same value as Direct cost in the current model; it is not a separately computed cash-plus-virtual-cost total. These penalties are decision weights expressed as amounts, so the total is not necessarily an invoice or incremental crew pay.</HelpNote>
<HelpH2>What Stability measures</HelpH2>
<HelpNote>Stability = 100 − 100 × (0.30 × cancelled + 0.20 × added + 0.15 × changed + 0.35 × follow-on impact) ÷ loaded roster groups, bounded to 0–100%. The score depends on the loaded scope. Compare solutions generated from the same scope. Follow-on impact is a limited heuristic, not a full downstream recovery analysis.</HelpNote>
<HelpWarning>The recovery bridge chooses the first stored instance of a cost type and its latest revision. It does not select a planner’s Cost Set or price by the disruption’s effective date. Configuring a richer calculator elsewhere does not mean Recovery supplies all its required inputs.</HelpWarning>
  </>
}
