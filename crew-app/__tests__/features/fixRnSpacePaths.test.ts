/**
 * Regression cover for the iCloud space-in-path build break.
 *
 * `npm install` wiped the local RN patches, and the iOS build died in the
 * React-Codegen "Generate Specs" phase with
 *   /bin/sh: /Users/alps/Library/Mobile: No such file or directory
 * because RN interpolates paths unquoted. `scripts/fixRnSpacePaths.js` runs on
 * postinstall to re-apply the quoting; these tests pin that behaviour.
 */

const {
  patchScriptPhasesRb,
  patchWithEnvironmentSh,
  TARGETS,
} = require('../../scripts/fixRnSpacePaths');

// Verbatim from react-native 0.74.5, as shipped (unquoted).
const RB_ORIGINAL = [
  'def get_script_template(react_native_path, export_vars={})',
  '    template =<<~EOS',
  '        pushd "$PODS_ROOT/../" > /dev/null',
  '        RCT_SCRIPT_POD_INSTALLATION_ROOT=$(pwd)',
  '        popd >/dev/null',
  '        <% export_vars.each do |(varname, value)| %>',
  '        export <%= varname -%>=<%= value -%>',
  '        <% end %>',
  '',
  '        SCRIPT_PHASES_SCRIPT="$RCT_SCRIPT_RN_DIR/scripts/react_native_pods_utils/script_phases.sh"',
  '        WITH_ENVIRONMENT="$RCT_SCRIPT_RN_DIR/scripts/xcode/with-environment.sh"',
  '        /bin/sh -c "$WITH_ENVIRONMENT $SCRIPT_PHASES_SCRIPT"',
  '        EOS',
  'end',
].join('\n');

const SH_ORIGINAL = [
  '# Execute argument, if present',
  'if [ -n "$1" ]; then',
  '  $1',
  'fi',
].join('\n');

describe('patchScriptPhasesRb', () => {
  const patched = patchScriptPhasesRb(RB_ORIGINAL);

  it('quotes the nested sh -c so space-bearing paths survive', () => {
    expect(RB_ORIGINAL).toContain('/bin/sh -c "$WITH_ENVIRONMENT $SCRIPT_PHASES_SCRIPT"');
    expect(patched).toContain(
      '/bin/sh -c "\'$WITH_ENVIRONMENT\' \'$SCRIPT_PHASES_SCRIPT\'"',
    );
    expect(patched).not.toContain('/bin/sh -c "$WITH_ENVIRONMENT $SCRIPT_PHASES_SCRIPT"');
  });

  it('quotes exported values without breaking already-quoted ones', () => {
    expect(patched).toContain(
      'export <%= varname -%>=<%= value.start_with?(\'"\') ? value : \'"\' + value + \'"\' -%>',
    );
  });

  it('uses string concatenation, not #{} — the ERB template is an interpolating heredoc', () => {
    // `#{value}` inside <<~EOS resolves at Ruby parse time, where `value` is not
    // in scope, and CocoaPods aborts with "undefined local variable 'value'".
    const exportLine = patched
      .split('\n')
      .find((line: string) => line.includes('export <%= varname'));
    expect(exportLine).toBeDefined();
    expect(exportLine).not.toContain('#{');
  });

  it('is idempotent', () => {
    expect(patchScriptPhasesRb(patched)).toBe(patched);
  });
});

describe('patchWithEnvironmentSh', () => {
  const patched = patchWithEnvironmentSh(SH_ORIGINAL);

  it('quotes $1 so the script path is not word-split', () => {
    expect(patched).toContain('  "$1"\n');
    expect(patched).not.toMatch(/\n {2}\$1\n/);
  });

  it('is idempotent', () => {
    expect(patchWithEnvironmentSh(patched)).toBe(patched);
  });

  it('leaves an unrelated file untouched', () => {
    const unrelated = 'echo hello\n';
    expect(patchWithEnvironmentSh(unrelated)).toBe(unrelated);
  });
});

describe('TARGETS', () => {
  it('points at the two RN scripts that break on spaces', () => {
    expect(TARGETS.map((t: {file: string}) => t.file)).toEqual([
      'react-native/scripts/react_native_pods_utils/script_phases.rb',
      'react-native/scripts/xcode/with-environment.sh',
    ]);
  });
});
