import { useShellStore } from '@/stores/shell-store'
import { CompositionView } from '@/components/composition/composition-view'
import { CompositionLoadView } from '@/components/composition/composition-load-view'
import { LegalityRuleSetsView } from './legality-rule-sets-view'
import { RuleInstancesView } from './rule-instances-view'

export const LegalityView = () => {
  const activeLegalityItem = useShellStore((s) => s.activeLegalityItem)

  if (activeLegalityItem === 'rule-instances') return <RuleInstancesView />
  if (activeLegalityItem === 'composition') return <CompositionView />
  if (activeLegalityItem === 'comp-load') return <CompositionLoadView />
  return <LegalityRuleSetsView />
}
