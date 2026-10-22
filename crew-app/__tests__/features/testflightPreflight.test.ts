const path = require('node:path');
const { readFileSync } = require('node:fs');
const {
  localConfig,
  readAscJson,
  validateRemote,
} = require('../../scripts/testflight-preflight.cjs');

const crewAppRoot = path.resolve(__dirname, '../..');
const envWithIds = {
  ASC_APP_ID: '1234567890',
  ASC_GROUP_ID: '01234567-89ab-cdef-0123-456789abcdef',
};

function getConfig(env: Record<string, string | undefined> = envWithIds) {
  return localConfig(crewAppRoot, env);
}

function remoteFixtures(config = getConfig()) {
  return {
    app: { data: { id: config.appId, attributes: { bundleId: config.bundle } } },
    group: {
      data: {
        id: config.groupId,
        attributes: {
          isInternalGroup: false,
          publicLinkEnabled: true,
          publicLink: 'https://testflight.apple.com/join/AbC123xY',
        },
      },
    },
    groupApp: { data: { id: config.appId } },
    next: { nextBuildNumber: config.build },
  };
}

function validate(config = getConfig(), overrides = {}) {
  const fixtures = { ...remoteFixtures(config), ...overrides };
  return validateRemote(config, fixtures.app, fixtures.group, fixtures.groupApp, fixtures.next);
}

describe('TestFlight release preflight', () => {
  it('retries transient read-only ASC lookups before returning JSON', () => {
    const run = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('temporary ASC failure');
      })
      .mockReturnValueOnce('{"data":{"id":"123"}}');
    const pause = jest.fn();

    expect(readAscJson(['apps', 'view', '--id', '123'], {
      execFileSync: run,
      sleepSync: pause,
      attempts: 3,
      execOptions: { encoding: 'utf8' },
    })).toEqual({ data: { id: '123' } });
    expect(run).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenLastCalledWith(
      'asc',
      ['apps', 'view', '--id', '123', '--output', 'json'],
      { encoding: 'utf8' },
    );
  });

  it('stops after the configured read-only ASC attempt limit', () => {
    const run = jest.fn(() => {
      throw new Error('ASC unavailable');
    });
    const pause = jest.fn();

    expect(() => readAscJson(['apps', 'list'], {
      execFileSync: run,
      sleepSync: pause,
      attempts: 3,
    })).toThrow('ASC unavailable');
    expect(run).toHaveBeenCalledTimes(3);
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it('reads the real project version and confirms every native build number agrees', () => {
    const config = getConfig();
    const source = readFileSync(path.join(crewAppRoot, 'src/version.ts'), 'utf8');
    const appVersion = Number(source.match(/APP_VERSION\s*=\s*(\d+)/)?.[1]);

    expect(config.build).toBe(appVersion);
    expect(config).toMatchObject({
      version: '1.0',
      bundle: 'com.eleihu6.roycetravel',
      team: '6B2783K6KM',
    });
  });

  it.each([
    ['missing app ID', { ...envWithIds, ASC_APP_ID: undefined }, /ASC_APP_ID/],
    ['invalid app ID', { ...envWithIds, ASC_APP_ID: 'app-123' }, /ASC_APP_ID/],
    ['missing group ID', { ...envWithIds, ASC_GROUP_ID: undefined }, /ASC_GROUP_ID/],
    ['invalid group ID', { ...envWithIds, ASC_GROUP_ID: 'not-a-uuid' }, /ASC_GROUP_ID/],
  ])('rejects %s', (_label, env, message) => {
    expect(() => getConfig(env)).toThrow(message);
  });

  it('accepts matching app, external public group, ownership and unused build while preserving the public URL', () => {
    const config = getConfig();
    const result = validate(config);

    expect(result).toEqual({
      VERSION: config.version,
      BUILD_NUMBER: String(config.build),
      BUNDLE_ID: config.bundle,
      TEAM_ID: config.team,
      PUBLIC_LINK: 'https://testflight.apple.com/join/AbC123xY',
    });
  });

  it('rejects an app with the wrong bundle ID', () => {
    const config = getConfig();
    expect(() => validate(config, {
      app: { data: { id: config.appId, attributes: { bundleId: 'com.example.wrong' } } },
    })).toThrow(/native device bundle ID/);
  });

  it('rejects a group that belongs to another app', () => {
    const config = getConfig();
    expect(() => validate(config, { groupApp: { data: { id: '9876543210' } } })).toThrow(/does not belong/);
  });

  it('rejects an internal group', () => {
    const config = getConfig();
    const fixtures = remoteFixtures(config);
    fixtures.group.data.attributes.isInternalGroup = true;
    expect(() => validate(config, fixtures)).toThrow(/must be external/);
  });

  it('rejects a disabled public link', () => {
    const config = getConfig();
    const fixtures = remoteFixtures(config);
    fixtures.group.data.attributes.publicLinkEnabled = false;
    expect(() => validate(config, fixtures)).toThrow(/no enabled public link/);
  });

  it('rejects a malformed public link', () => {
    const config = getConfig();
    const fixtures = remoteFixtures(config);
    fixtures.group.data.attributes.publicLink = 'https://example.com/join/AbC123xY';
    expect(() => validate(config, fixtures)).toThrow(/no enabled public link/);
  });

  it('rejects a build number already used by ASC', () => {
    const config = getConfig();
    expect(() => validate({ ...config, build: 200 }, { next: { nextBuildNumber: 201 } })).toThrow(/already used\/too low/);
  });

  it.each([undefined, null, '', 'not-a-number', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid next build number %p',
    nextBuildNumber => {
      const config = getConfig();
      expect(() => validate(config, { next: { nextBuildNumber } })).toThrow(/valid next build number/);
    },
  );
});
