Weekly automated maintenance for the ROIS-AI gantt app in /home/yuan.z/rois/rois-ai.
Follow the repo's skills exactly, in order. This job runs unattended on Friday.

0. Sync: run `git fetch origin && git pull --ff-only origin main`. If that fails
   (uncommitted changes in the working tree), STOP, report, end with
   `JOB_RESULT: FAILED` — do not force.

1. Release notes — invoke the `122-release-note-maker` skill:
   - Read the latest release's `toCommit` cursor in
     gantt/src/components/release/release-data.ts.
   - Scope `git log <cursor>..HEAD` to END-USER-FACING gantt UI changes only
     (exclude backend/engine/tests/version-bumps/pbs-portal/infra).
   - If there are NO user-facing gantt UI changes in the window: STOP, report
     "nothing changed", end with `JOB_RESULT: SUCCESS`, exit 0. Do not edit / commit / deploy.
   - Otherwise author the next REL_N (text-only, like REL_3 / REL_4), update
     e2e/tests/gantt/release-tab.spec.ts if the default-release assertions go
     stale, and bump FRONTEND_VERSION in gantt/src/version.ts.

2. Help refresh — invoke the `online-help-writing` skill:
   - Audit only the help topics affected by this week's UI changes; rewrite any
     that drifted. NEVER write Help from memory — read the component that
     implements the feature.
   - Keep gantt/src/components/help/help-data.ts stepCount/overview/title in
     sync; remove stale isNew (NEW badge) flags in this housekeeping pass.
   - Do NOT capture or add screenshots.

3. Verify — ALL must pass before commit:
   - cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit
   - cd /home/yuan.z/rois/rois-ai && npm run check:ui
   - cd /home/yuan.z/rois/rois-ai/e2e && npx playwright test \
       -c config/playwright.config.ts --project=gantt \
       tests/gantt/release-tab.spec.ts tests/gantt/help/ --reporter=list --no-deps

4. Commit + push + deploy:
   - Stage ONLY the files you changed (release-data.ts, help topic .tsx,
     help-data.ts, version.ts, and any e2e spec you updated). Do NOT stage
     unrelated pre-existing working-tree files.
   - Commit message: `docs(gantt): Release N notes + Help refresh` + short body
     + trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
   - `git push origin main`.
   - `~/rois/rois.sh build gantt` to deploy the frontend to UAT.

5. Report a concise final summary: what changed, test PASS/FALL counts, commit
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
