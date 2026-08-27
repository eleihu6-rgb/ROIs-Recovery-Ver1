# SIT Shared Rules Deployment

## Problem

`live-server` imports `@rois/shared-rules` through a file dependency. The SIT
build could compile against the WebServer checkout while PortalServer had only
the `node_modules` symlink and no `/home/rois/sit/packages/shared-rules` target.
The service then failed at runtime with `MODULE_NOT_FOUND`.

## Contract

- Build `packages/shared-rules` before compiling `live-server`.
- Sync the package, including `dist/index.js` and declarations, to
  `/home/rois/sit/packages/shared-rules` on every `--live` or `--pbs-srv`
  deployment through the existing shared-package push path.
- Fail the deployment if the expected build outputs are absent.
- Keep the existing PortalServer environment and service configuration
  boundaries unchanged.

## Verification

- Shell syntax check for `deploy/sit/deploy.sh`.
- Build `packages/shared-rules` with the live-server TypeScript toolchain.
- Perform a controlled `--live` deployment and verify the service starts.
