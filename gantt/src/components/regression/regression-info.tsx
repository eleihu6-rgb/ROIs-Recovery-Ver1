import { Info } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@rois/ui'

const b = (label: string, sub: string | undefined, bg: string, fg: string) => (
  <div style={{
    background: bg, border: `1px solid ${bg}`, borderRadius: 5,
    padding: '2px 7px', textAlign: 'center', minWidth: 0, flex: '0 0 auto',
  }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: fg, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{label}</div>
    {sub && <div style={{ fontSize: 9, color: fg, opacity: 0.7, lineHeight: 1.2 }}>{sub}</div>}
  </div>
)

const Arr = ({ t }: { t: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
    <span style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1 }}>→</span>
    <span style={{ fontSize: 8, color: '#9ca3af', whiteSpace: 'nowrap' }}>{t}</span>
  </div>
)

const Sep = () => <div style={{ borderTop: '1px solid #f3f4f6', margin: '6px 0' }} />

/**
 * Step-by-step manual for the Regression playground.
 * Non-intrusive Radix Popover — never blocks the page.
 * Content asserted by e2e/tests/gantt/regression-page.spec.ts.
 */
export const RegressionInfo = () => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label="How to use the regression playground"
        title="How to use — step-by-step manual with flows"
        data-testid="regression-info"
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </PopoverTrigger>

    <PopoverContent
      data-testid="regression-info-popover"
      className="flex max-h-[90vh] w-[52rem] flex-col gap-0 overflow-y-auto p-4 text-xs"
      align="start"
    >
      {/* ── HEADER ── */}
      <div className="mb-3">
        <p className="font-semibold text-foreground">Regression Playground — how it works</p>
        <p className="text-muted-foreground" style={{ fontSize: 10.5, marginTop: 2 }}>
          Plain-English story → AI Playwright code → automated runs → versioned evidence + AI diagnosis. No coding required.
        </p>
      </div>

      {/* ── OVERALL FLOW (full width) ── */}
      <div className="mb-3">
        <p className="mb-1.5 font-medium text-foreground">Overall flow</p>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexWrap: 'wrap' }}>
          {b('Add Test', 'plain English', '#dbeafe', '#1e40af')}
          <Arr t="set" />
          {b('Conditions', 'pass rules', '#ede9fe', '#6d28d9')}
          <Arr t="AI detects" />
          {b('Entity?', '73M / TG123…', '#fef3c7', '#92400e')}
          <Arr t="A or B" />
          {b('Generate', 'Playwright', '#fef9c3', '#854d0e')}
          <Arr t="apply" />
          {b('Run', '▶', '#dcfce7', '#166534')}
          <Arr t="result" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {b('✓ PASS', 'all conditions met', '#dcfce7', '#166534')}
            {b('✗ FAIL', 'condition unmet', '#fee2e2', '#991b1b')}
          </div>
          <Arr t="→" />
          {b('Diagnose', 'AI classifies', '#ffe4e6', '#9f1239')}
        </div>
      </div>

      <Sep />

      {/* ── 2-COLUMN BODY ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* LEFT — Steps + Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          <div>
            <p className="mb-1 font-medium text-foreground">Step-by-step</p>
            <ol
              className="list-decimal pl-4 text-muted-foreground"
              style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
              data-testid="regression-info-steps"
            >
              <li style={{ fontSize: 10.5 }}>
                <span className="font-medium text-foreground">Build the catalog.</span>{' '}
                Import specs or Add Test.
              </li>
              <li style={{ fontSize: 10.5 }}>
                <span className="font-medium text-foreground">Version rule.</span>{' '}
                Every code change → new version; old rounds stay put.
              </li>
              <li style={{ fontSize: 10.5 }}>
                <span className="font-medium text-foreground">Generate code.</span>{' '}
                Wand → fix chips → Apply.
              </li>
              <li style={{ fontSize: 10.5 }}>
                <span className="font-medium text-foreground">Run round rule.</span>{' '}
                Every run records a round under the active version.
              </li>
              <li style={{ fontSize: 10.5 }}>
                <span className="font-medium text-foreground">Evidence rule.</span>{' '}
                Snapshot at assertion point, not page load.
              </li>
              <li style={{ fontSize: 10.5 }}>
                <span className="font-medium text-foreground">Latest/history.</span>{' '}
                Chevron → all versions and rounds.
              </li>
              <li style={{ fontSize: 10.5 }}>
                <span className="font-medium text-foreground">Failure/fix.</span>{' '}
                v1 fails → fix → v2 → compare. Shield to quarantine.
              </li>
            </ol>
          </div>

          <Sep />

          {/* Diagnose classification */}
          <div>
            <p className="mb-1 font-medium text-foreground">Diagnose (on failed rounds)</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              {b('FAIL', undefined, '#fee2e2', '#991b1b')}
              <Arr t="Diagnose →" />
              {b('AI analysis', undefined, '#f3f4f6', '#374151')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {b('code_bug', 'app is broken', '#fee2e2', '#991b1b')}
              {b('data_issue', 'missing data', '#fef3c7', '#92400e')}
              {b('env_issue', 'infra / timeout', '#dbeafe', '#1e40af')}
              {b('test_bug', 'wrong assertion', '#f3e8ff', '#6d28d9')}
            </div>
          </div>

          <Sep />

          {/* Badges */}
          <div>
            <p className="mb-1 font-medium text-foreground">Badges</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: 10 }} className="text-muted-foreground">
              <span><span className="font-semibold text-destructive">N</span> — failures</span>
              <span><span className="font-semibold">flaky</span> — pass on retry</span>
              <span><span className="font-semibold">N% unstable</span> — flip rate</span>
              <span><span className="font-semibold text-amber-600">quarantined</span> — excluded</span>
              <span><span className="font-semibold">vN</span> — version</span>
              <span><span className="font-semibold">round</span> — one run</span>
              <span><span className="font-semibold">trace</span> — PW artifact</span>
              <span><span className="font-semibold">by / tester</span> — actors</span>
            </div>
          </div>
        </div>

        {/* RIGHT — A/B Decision flow */}
        <div>
          <p className="mb-1 font-medium text-foreground">Condition A vs B — entity disambiguation</p>
          <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 8 }}>
            When a condition names a specific value (fleet code, crew ID, flight no.), the system detects it and asks for intent:
          </p>

          {/* Decision tree */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>

            {/* Root */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {b('Specific value in condition', '"73M", "TG123", "P10001"…', '#f3f4f6', '#374151')}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', fontSize: 10, color: '#9ca3af' }}>↓ detected automatically</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {b('Is this intentional?', '', '#fef3c7', '#92400e')}
            </div>

            {/* 3 branches */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 2 }}>

              {/* A branch */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                <div style={{ fontSize: 9, color: '#9ca3af' }}>Yes →</div>
                {b('A', 'UI must return data', '#dbeafe', '#1e40af')}
                <div style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>assert count {'>'} 0</div>
                {b('FAIL if 0', 'data gap / illusion', '#fee2e2', '#991b1b')}
                <div style={{ fontSize: 9, color: '#374151', textAlign: 'center', lineHeight: 1.3, padding: '0 2px' }}>
                  Truth probe — catches missing data and AI assumptions
                </div>
              </div>

              {/* B branch */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                <div style={{ fontSize: 9, color: '#9ca3af' }}>Yes →</div>
                {b('B', 'UI shows empty state', '#dcfce7', '#166534')}
                <div style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>assert empty graceful</div>
                {b('PASS if handled', 'robustness test', '#dcfce7', '#166534')}
                <div style={{ fontSize: 9, color: '#374151', textAlign: 'center', lineHeight: 1.3, padding: '0 2px' }}>
                  Tests UI resilience when expected data is absent
                </div>
              </div>

              {/* No branch */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                <div style={{ fontSize: 9, color: '#9ca3af' }}>No →</div>
                {b('Correct value', 'pick real value', '#f3f4f6', '#374151')}
                <div style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>e.g. 7M8 / 737</div>
                {b('Regenerate', 'with correct value', '#fef9c3', '#854d0e')}
                <div style={{ fontSize: 9, color: '#374151', textAlign: 'center', lineHeight: 1.3, padding: '0 2px' }}>
                  Fix the typo — use a value that exists in the dataset
                </div>
              </div>
            </div>

            <div style={{
              marginTop: 6, background: '#f0f4ff', borderRadius: 6, padding: '6px 10px',
              fontSize: 10, color: '#374151', lineHeight: 1.4,
            }}>
              <strong>Condition A example:</strong> "test with fleet 73M — roster must show crew rows" →
              test <span style={{ color: '#991b1b' }}>FAILS</span> because 73M has no crew →
              AI diagnoses <span style={{ color: '#92400e' }}>data_issue</span>.
              <br />
              <strong>Condition B example:</strong> "fleet 73M does not exist — UI shows empty state" →
              test <span style={{ color: '#166534' }}>PASSES</span> if no crash / empty message shown.
            </div>
          </div>
        </div>

      </div>

      <p className="mt-3 text-2xs text-muted-foreground/70">
        Click outside or Esc to close · Do not record credentials or sensitive crew data in test evidence.
      </p>
    </PopoverContent>
  </Popover>
)
