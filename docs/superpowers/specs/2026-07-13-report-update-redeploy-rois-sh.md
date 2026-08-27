# Report Update + Redeploy in rois.sh

## Goal

Add a single `~/rois/rois.sh` workflow that updates the active PBS Scenario Report project from Git and redeploys it.

Report repo:

- `/home/rois/Flair_PBS_Optimization_Report`

Active report system:

- frontend: `src/frontend`
- services: `src/start.sh`, which starts:
  - API: `src/server/app/main.py` on port `5101`
  - Vite frontend dev server on port `5174`

Legacy report directories are not part of this workflow:

- `backend`
- `python_services`
- root-level `frontend`

## Proposed Command

Add:

```bash
~/rois/rois.sh redeploy report
```

Behavior:

1. Verify the report repo exists and is a Git worktree.
2. Fail if the report repo has uncommitted changes, unless explicitly allowed with:

   ```bash
   ROIS_ALLOW_DIRTY_REPORT=1 ~/rois/rois.sh redeploy report
   ```

3. Run `git pull --ff-only` in `/home/rois/Flair_PBS_Optimization_Report`.
4. Run frontend dependency install with `npm ci` when `package-lock.json` exists, otherwise `npm install`.
5. Build and deploy report frontend using the existing `build_report` path.
6. Restart the active report service through `src/start.sh`.
7. Print final status for report API/frontend ports.

## Non-Goals

- Remove legacy `report-python` and `report-backend` service management from `rois.sh`.
- Do not change report application code.
- Do not deploy SIT; existing script deployment target is UAT.
- Do not add force-pull, reset, stash, or destructive Git behavior.

## Verification

Use shell syntax validation:

```bash
bash -n /home/yuan.z/rois/rois.sh
```

Do not run the redeploy command automatically because it performs remote deployment and service restart.
