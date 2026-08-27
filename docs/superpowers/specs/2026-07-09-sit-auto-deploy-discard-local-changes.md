# SIT Auto Deploy Discard Local Changes

## Problem

SIT auto deploy runs from the webserver checkout at `/home/yuan.z/rois/rois-ai` on `10.15.12.2`.
That checkout is only a deployment mirror and should not preserve local source edits.

Current behavior blocks deployment when any local tracked file differs from `HEAD`.
On July 9, 2026, `git pull --ff-only origin main` failed because `gantt/src/components/dev/dev-skills-data.generated.ts`
had local modifications. The checkout stayed behind `origin/main`, so SIT continued running old backend dist that still
read `f8_pbs.dictionary` after the database migration had removed that table.

## Goal

Before each auto deploy update, force the webserver checkout back to the tracked state of `HEAD`, then fetch and pull
`origin/main`. Local tracked edits and untracked files in the deployment checkout are disposable.

## Design

Add a cleanup step in `deploy/sit/auto-deploy.sh` after acquiring the deploy lock and before `git fetch origin main`.

The cleanup should:

- Log the current dirty status when present.
- Run `git reset --hard HEAD` to discard tracked local modifications.
- Run `git clean -fd` to remove untracked files and directories.
- Continue with the existing `git fetch`, diff analysis, `git pull --ff-only`, and module-specific deploy flow.

Keep ignored files intact. This preserves deployment state such as `.env`, `.pkghash`, logs, build caches, and other
ignored runtime artifacts.

## Non-Goals

- Do not alter `deploy/sit/deploy.sh`.
- Do not change module detection rules.
- Do not force-pull or rewrite branches.
- Do not delete ignored files with `git clean -fdx`.

## Risk

This intentionally discards all non-ignored local work in the webserver deployment checkout. That is acceptable only
because the checkout is designated as an auto-deploy mirror, not a development workspace.

## Acceptance

- A dirty tracked file in the webserver checkout no longer blocks auto deploy.
- Untracked non-ignored files no longer block or pollute auto deploy.
- Ignored env/log/hash files remain untouched.
- Existing behavior is unchanged when the checkout is already clean.
