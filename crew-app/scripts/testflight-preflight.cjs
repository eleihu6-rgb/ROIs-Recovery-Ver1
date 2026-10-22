const { readFileSync, mkdtempSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');

const ASC_READ_ATTEMPTS = 3;
const ASC_READ_RETRY_DELAY_MS = 1000;

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function readAscJson(args, options = {}) {
  const run = options.execFileSync ?? execFileSync;
  const pause = options.sleepSync ?? sleepSync;
  const attempts = options.attempts ?? ASC_READ_ATTEMPTS;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return JSON.parse(run('asc', [...args, '--output', 'json'], options.execOptions));
    } catch (error) {
      if (attempt === attempts) throw error;
      pause(ASC_READ_RETRY_DELAY_MS);
    }
  }

  throw new Error('ASC read failed without an attempt.');
}

function localConfig(root, env) {
  const appId = env.ASC_APP_ID;
  const groupId = env.ASC_GROUP_ID;
  if (!/^\d+$/.test(appId || '')) throw new Error('Set ASC_APP_ID to the numeric Crew App ID.');
  if (!/^[a-f0-9-]{36}$/i.test(groupId || '')) throw new Error('Set ASC_GROUP_ID to the existing external group UUID.');
  const source = readFileSync(join(root, 'src/version.ts'), 'utf8');
  const project = readFileSync(join(root, 'ios/RoyceTravelTemplate.xcodeproj/project.pbxproj'), 'utf8');
  const build = Number(source.match(/APP_VERSION\s*=\s*(\d+)/)?.[1]);
  const nativeBuilds = [...project.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map(m => Number(m[1]));
  if (!build || !nativeBuilds.length || nativeBuilds.some(n => n !== build)) {
    throw new Error('Align APP_VERSION and all native CURRENT_PROJECT_VERSION values before release.');
  }
  const version = project.match(/MARKETING_VERSION = ([\d.]+);/)?.[1];
  const bundle = project.match(/"PRODUCT_BUNDLE_IDENTIFIER\[sdk=iphoneos\*\]" = ([\w.]+);/)?.[1];
  const team = project.match(/DEVELOPMENT_TEAM = (\w+);/)?.[1];
  if (!version || !bundle || !team) throw new Error('Cannot resolve native release version, device bundle ID or team.');
  return { appId, groupId, build, version, bundle, team };
}

function validateRemote(config, app, group, groupApp, next) {
  if (app.data?.id !== config.appId || app.data?.attributes?.bundleId !== config.bundle) {
    throw new Error('ASC app does not match the native device bundle ID.');
  }
  if (group.data?.id !== config.groupId || groupApp.data?.id !== config.appId) {
    throw new Error('The external group does not belong to this app.');
  }
  const g = group.data?.attributes;
  if (g?.isInternalGroup !== false) throw new Error('Selected group must be external.');
  if (g.publicLinkEnabled !== true || !/^https:\/\/testflight\.apple\.com\/join\/[A-Za-z0-9]+$/.test(g.publicLink || '')) {
    throw new Error('Existing group has no enabled public link. Resolve the intended group/link before publishing.');
  }
  const required = Number(next.nextBuildNumber);
  if (!Number.isSafeInteger(required) || required < 1) throw new Error('ASC did not return a valid next build number.');
  if (config.build < required) throw new Error(`Build ${config.build} is already used/too low; increase APP_VERSION and native build to at least ${required}.`);
  return { VERSION: config.version, BUILD_NUMBER: String(config.build), BUNDLE_ID: config.bundle, TEAM_ID: config.team, PUBLIC_LINK: g.publicLink };
}

function main() {
  const root = resolve(__dirname, '..');
  const config = localConfig(root, process.env);
  const asc = args => readAscJson(args, { execOptions: {
    cwd: root, env: { ...process.env, ASC_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024,
  } });
  const result = validateRemote(config,
    asc(['apps', 'view', '--id', config.appId]),
    asc(['testflight', 'groups', 'view', '--id', config.groupId]),
    asc(['testflight', 'groups', 'app', 'view', '--group-id', config.groupId]),
    asc(['builds', 'next-build-number', '--app', config.appId, '--version', config.version, '--platform', 'IOS', '--initial-build-number', String(config.build)]));
  if (process.argv.includes('--publish') && process.env.ASC_RELEASE_CONFIRM !== 'YES') {
    throw new Error('Publishing requires ASC_RELEASE_CONFIRM=YES after reviewing the dry-run.');
  }
  // Unique, outside FileProvider/iCloud; no destructive overwrite or shared DerivedData.
  result.ARTIFACT_DIR = mkdtempSync(join(tmpdir(), 'crew-testflight-'));
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  try { main(); } catch (error) {
    // Do not echo raw API responses or credential-bearing environment values.
    console.error(error.status !== undefined ? 'ASC preflight failed. Check asc auth status and the resolved app/group access.' : error.message);
    process.exitCode = 1;
  }
}
module.exports = { localConfig, readAscJson, validateRemote };
