import { Scale } from 'lucide-react'
import { AppDialog, Button } from '@rois/ui'
import { LegalityParamTable } from './legality-param-table'
import { LegalityParamTableEditor } from './legality-param-table-editor'
import { ruleDisplayName } from './legality-rule-row'
import { usePermission } from '@/hooks/use-permission'
import { useLegalityStore } from '@/stores/legality-store'
import type { LegalityRule } from '@/types/legality'

interface Props {
  rule: LegalityRule
  open: boolean
  onClose: () => void
}

/**
 * Roomy pop-out for a legacy rule's parameters. Standard AppDialog (blue title bar,
 * draggable, resizable, top-right close). Wide so the compact aligned table fits as
 * many columns per row as possible (8056's 24 columns) with minimal scrolling.
 */
export const LegalityParamDialog = ({ rule, open, onClose }: Props) => {
  const { canAccessCtl } = usePermission()
  const recordParamSave = useLegalityStore((s) => s.recordParamSave)
  // Editor mode is gated by the BTN_EDIT_PARAM ctl (covers /api/legality/rule/*/params).
  // Admin users get the ctl via buildAdminContext().
  const editorMode = Boolean(canAccessCtl('LEGALITY_RULE_SETS', 'BTN_EDIT_PARAM') && rule.paramJson)

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      data-testid="legality-param-dialog"
      className="sm:max-w-[min(1180px,94vw)]"
      icon={<Scale className="h-4 w-4" />}
      title={ruleDisplayName(rule)}
      resizable
      bodyClassName="flex flex-col overflow-hidden py-1.5"
      footerClassName="py-1"
      footer={
        <Button variant="ghost" className="h-6 px-2 py-0 leading-none" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div
        data-testid="legality-param-scroll-area"
        className={
          editorMode
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
            : 'min-h-0 flex-1 overflow-auto'
        }
      >
        {editorMode ? (
          <LegalityParamTableEditor
            ruleId={rule.id}
            paramJson={rule.paramJson!}
            fn={rule.function}
            inst={rule.instance}
            scrollMode="parent"
            onSaved={(result) => recordParamSave(rule.id, result)}
          />
        ) : (
          <LegalityParamTable
            paramJson={rule.paramJson}
            fn={rule.function}
            inst={rule.instance}
            scrollMode="parent"
          />
        )}
      </div>
    </AppDialog>
  )
}
