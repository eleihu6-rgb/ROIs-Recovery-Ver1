/**
 * Re-apply React Native's missing shell quoting after every `npm install`.
 *
 * This repo lives under `~/Library/Mobile Documents/…` (iCloud Drive), so every
 * absolute path contains a space. Two RN scripts interpolate paths unquoted and
 * break there — the iOS build fails with `/bin/sh: /Users/alps/Library/Mobile:
 * No such file or directory` during the React-Codegen "Generate Specs" phase.
 *
 * These are edits to files inside `node_modules`, so `npm install` wipes them.
 * Wired as `postinstall` in package.json to survive that. Both transforms are
 * idempotent: running on already-patched input is a no-op.
 */

const fs = require('fs');
const path = require('path');

/** Pods script-phase template: quote the exports and the nested `sh -c`. */
function patchScriptPhasesRb(src) {
  return src
    .replace(
      "export <%= varname -%>=<%= value -%>",
      "export <%= varname -%>=<%= value.start_with?('\"') ? value : '\"' + value + '\"' -%>",
    )
    .replace(
      '/bin/sh -c "$WITH_ENVIRONMENT $SCRIPT_PHASES_SCRIPT"',
      '/bin/sh -c "\'$WITH_ENVIRONMENT\' \'$SCRIPT_PHASES_SCRIPT\'"',
    );
}

/** with-environment.sh runs its argument unquoted, splitting on the space. */
function patchWithEnvironmentSh(src) {
  return src.replace(
    /if \[ -n "\$1" \]; then\n  \$1\n/,
    'if [ -n "$1" ]; then\n  "$1"\n',
  );
}

const TARGETS = [
  {
    file: 'react-native/scripts/react_native_pods_utils/script_phases.rb',
    patch: patchScriptPhasesRb,
  },
  {
    file: 'react-native/scripts/xcode/with-environment.sh',
    patch: patchWithEnvironmentSh,
  },
];

function main() {
  const nodeModules = path.join(__dirname, '..', 'node_modules');
  let changed = 0;

  for (const target of TARGETS) {
    const full = path.join(nodeModules, target.file);
    if (!fs.existsSync(full)) {
      console.warn(`[fixRnSpacePaths] skipped (missing): ${target.file}`);
      continue;
    }
    const before = fs.readFileSync(full, 'utf8');
    const after = target.patch(before);
    if (after !== before) {
      fs.writeFileSync(full, after);
      console.log(`[fixRnSpacePaths] patched ${target.file}`);
      changed += 1;
    }
  }

  if (changed === 0) {
    console.log('[fixRnSpacePaths] nothing to do — already quoted');
  }
}

if (require.main === module) {
  main();
}

module.exports = { patchScriptPhasesRb, patchWithEnvironmentSh, TARGETS };
