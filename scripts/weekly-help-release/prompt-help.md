Daily automated Help refresh for the ROIS-AI gantt app in /home/yuan.z/rois/rois-ai.
This job runs unattended every day at 15:00 UTC (23:00 Beijing). It refreshes
Help ONLY — never author a Release note.

0. Sync: run `git fetch origin && git pull --ff-only origin main`. If that fails
   (uncommitted changes in the working tree), STOP, report, end with
   `JOB_RESULT: FAILED` — do not force.

1. Scope the audit window:
   - `LAST_HELP=$(git log -1 --format=%H -- gantt/src/components/help/)`
   - `git log --oneline $LAST_HELP..HEAD --stat -- gantt/src` to see which gantt
     UI components changed since the last help commit.
   - If NO gantt UI component changed (or only non-UI changes: backend/engine/
     tests/version-bumps/pbs-portal/infra): STOP, report "nothing changed", end
     with `JOB_RESULT: SUCCESS`, exit 0. Do not edit / commit / deploy.

2. Help refresh — invoke the `online-help-writing` skill:
   - Audit ONLY the help topics for the components that changed; rewrite any that
     drifted. NEVER write Help from memory — read the component that implements
     the feature.
   - Keep gantt/src/components/help/help-data.ts stepCount/overview/title in
     sync; remove stale isNew (NEW badge) flags in this housekeeping pass.
   - Run `node scripts/check-help-menu-coverage.mjs`. `GAP`, `DRIFT`, and
     `EXTRA` are release blockers: add or update the matching Help topic from
     the implemented UI, then rerun the check. This applies even where the git
     audit window has no other Help-related component change.
   - Do NOT capture or add screenshots.

3. Verify — ALL must pass before commit:
   - cd /home/yuan.z/rois/rois-ai && node scripts/check-help-menu-coverage.mjs
   - cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
   - cd /home/yuan.z/rois/rois-ai && npm run check:ui
   - cd /home/yuan.z/rois/rois-ai/e2e && npx playwright test \
       -c config/playwright.config.ts --project=gantt \
       tests/gantt/help/ --reporter=list --no-deps

4. Commit + push + deploy:
   - Stage ONLY the files you changed (help topic .tsx, help-data.ts, and any
     e2e spec you updated). Do NOT stage unrelated pre-existing working-tree files.
   - Commit message: `docs(gantt): Help refresh + topic updates` + short body +
     trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
   - `git push origin main`.
   - `~/rois/rois.sh build gantt` to deploy the frontend to UAT.

5. Report a concise final summary: what changed, test PASS/FAIL counts, commit
   hash, push + deploy status. Then, on a line of its own, end your report with
   EXACTLY `JOB_RESULT: SUCCESS` if every step completed (including the
   "nothing changed" case), or `JOB_RESULT: FAILED` if any step failed or you
   stopped early. The wrapper scans this sentinel and turns a missing SUCCESS
   into a non-zero exit — never report SUCCESS when the job did not fully
   complete.

Environment notes:
- Linux host, UTC timezone. Work directly in the working tree (no git
  worktrees — no iCloud here).
- UI strings must be English only. Commit message body may be Chinese or English.
- Never run destructive commands (e.g. rm -rf). If a permission is denied,
  adapt and report.
- Never commit unrelated pre-existing working-tree changes.
