# Server Cron Inventory

> **Snapshot date:** 2026-08-24. Re-verify with `crontab -l` on each host before trusting this doc.

ROIS-AI runs scheduled jobs across three hosts. All user crontabs run under `yuan.z`; **system-level cron / systemd timers are stock Ubuntu defaults** (logrotate / apt / sysstat / fwupd / man-db / fstrim / dpkg-db-backup / etc.) and are **not** inventoried here — they exist identically on every host and are not project-owned.

## Hosts at a glance

| Hostname         | SSH address           | Role                                           | User cron? |
|------------------|-----------------------|------------------------------------------------|------------|
| `webserver-01`   | `ssh yuan.z@10.15.12.2` | nginx + gantt static + SIT auto-deploy + pentest | ✅ 3 entries |
| `coreserver-01`  | `ssh yuan.z@10.15.12.3` | dev workstation; gantt/pbs-repo + Claude CLI + UAT deploy keys | ✅ 2 entries |
| `portalserver-01`| `ssh yuan.z@10.15.12.4` | pbs-portal frontend runtime | ❌ none |

> **Timezone:** all three hosts are set to UTC. Cron schedules below quote UTC; Beijing = UTC+8.

---

## 1. webserver-01 (10.15.12.2)

**Role:** nginx reverse proxy, serves built gantt static files, hosts the pentest scanner and the SIT auto-deploy watcher.

### User crontab (`crontab -l`)

```cron
*/10 * * * *   /home/yuan.z/rois/rois-ai/deploy/sit/auto-deploy.sh                    >> /home/yuan.z/rois/rois-ai/deploy/sit/.pkghash/auto-deploy.log 2>&1
17  2 * * 0    /home/yuan.z/rois/rois-ai/pentest/scripts/run-scan.sh --cron            >> /home/yuan.z/rois/rois-ai/pentest/data/logs/weekly-scan.log 2>&1
23  2 1 * *    /home/yuan.z/rois/rois-ai/pentest/scripts/generate-report.sh --cron    >> /home/yuan.z/rois/rois-ai/pentest/data/logs/monthly-report.log 2>&1
```

| Schedule | Job | Beijing | What it does |
|---|---|---|---|
| `*/10 * * * *` | `deploy/sit/auto-deploy.sh` | every 10 min | Polls GitHub `main`; if new commits, diffs them and runs only the affected module deploy (live-server / pbs-server / connector / engine / gantt / pbs-portal / packages-ui). Concurrency guarded by `deploy.lock`. See script header for module→action mapping. |
| `17 2 * * 0` | `pentest/scripts/run-scan.sh --cron` | Sun 10:17 | Weekly pentest scan against SIT+UAT (nuclei + zap + nmap). Writes HTML+PDF report. With `--cron`, auto-commits the report snapshot to the repo. |
| `23 2 1 * *` | `pentest/scripts/generate-report.sh --cron` | 1st 10:23 | Monthly deliverable PDF (customer-facing). With `--cron`, auto-commits the snapshot. |

**Notes:**
- `auto-deploy.sh` is the deploy orchestrator that pulls gantt/pbs-server/etc. — without it, SIT goes stale.
- Pentest cron needs nuclei / zap.sh / nmap installed at `/opt/zap/zap.sh` to run real scans; otherwise both scripts fall back to `--dry-run` (still produces a local report, still commits it).
- Logs: `deploy/sit/.pkghash/auto-deploy.log`, `pentest/data/logs/weekly-scan.log`, `pentest/data/logs/monthly-report.log`.

---

## 2. coreserver-01 (10.15.12.3)

**Role:** primary dev workstation. Has the full repo checkout, Claude CLI, git credentials, and the SSH key that talks to UAT — that's why the Help/Release maintenance job lives here, not on webserver-01 (which is build/deploy-only).

### User crontab (`crontab -l`)

```cron
0 15 * * *   /home/yuan.z/rois/rois-ai/scripts/weekly-help-release/weekly-help-release.sh --mode help      >> /home/yuan.z/rois/rois-ai/logs/weekly-help-release.log 2>&1
0 13 * * 5   /home/yuan.z/rois/rois-ai/scripts/weekly-help-release/weekly-help-release.sh --mode release   >> /home/yuan.z/rois/rois-ai/logs/weekly-help-release.log 2>&1
```

| Schedule | Job | Beijing | What it does |
|---|---|---|---|
| `0 15 * * *` | `weekly-help-release.sh --mode help` | daily 23:00 | Runs a headless `claude -p` with `prompt-help.md`, audits `git log $LAST_HELP..HEAD` for gantt UI changes, refreshes online help, runs `tsc` / `check:ui` / Playwright, then commits + pushes + deploys gantt to UAT via `~/rois/rois.sh build gantt`. |
| `0 13 * * 5` | `weekly-help-release.sh --mode release` | Fri 21:00 | Same harness, `prompt-release.md` (cursor..HEAD release notes). Single Friday-evening slot — Wednesday slot was dropped on 2026-08-24. |

**Notes:**
- **Pre-flight guards** in the wrapper: `HEAD` must be on `main` AND `git pull --ff-only origin main` must succeed, else exit 1 (no Claude invocation). Caught a real failure once where the tree sat on a feature branch and the job silently aborted.
- `--check` mode verifies prerequisites without running Claude; runs `git ls-remote origin HEAD` so it can hang on restricted networks even when the cron itself would work.
- The wrapper scans the run's output for a `JOB_RESULT: SUCCESS/FAILED` sentinel — `claude -p` always exits 0, so this is the only reliable signal that the work completed.
- **Needs API quota** at each run; the account running low produces a loud failure in the log (predated history: 预扣费额度失败).
- Log: `logs/weekly-help-release.log` (gitignored).
- Detail memory: [[project-weekly-help-release-cron]].

---

## 3. portalserver-01 (10.15.12.4)

**Role:** runtime host for the `pbs-portal` frontend (React + Vite build served by nginx).

### User crontab (`crontab -l`)

```
no crontab for yuan.z
```

**No project cron entries.** Only stock Ubuntu system cron + systemd timers exist. If a future job is needed here (e.g. periodic portal rebuild), document it in this file when added.

---

## How to verify after changes

```bash
# User crontab on each host
ssh yuan.z@10.15.12.2 'crontab -l'
ssh yuan.z@10.15.12.3 'crontab -l'
ssh yuan.z@10.15.12.4 'crontab -l'    # currently empty
```

When you add / move / remove a cron entry on any host, update this doc in the same commit. The doc is the single source of truth — don't rely on memory of which host runs what.

## Conventions

- **User (`yuan.z`) crontab** is where project jobs live. Do **not** add them to `root` crontab or `/etc/cron.d/`.
- **UTC** everywhere on the wire; convert to Beijing in the table for human readers.
- **Log paths** must be inside the repo workspace (`/home/yuan.z/rois/rois-ai/...`) or a sibling `.tmp/` — never `/tmp`.
- **Pre-flight checks** for any headless Claude job: on `main`, ff-only pull clean, claude CLI present.
- **Cron line endings** must use `>> log 2>&1` to capture both streams.
- **When the user says "the webserver", double-check** — colloquially that often means the host that runs cron jobs, but on this project that host is `coreserver-01` (dev box), not `webserver-01` (nginx + deploy). See [[project-weekly-help-release-cron]] for the gotcha that motivated this rule.

## Related memories

- [[project-sit-deploy-architecture]] — webserver-01 SIT deploy details, pkghash gotcha
- [[project-uat-deploy-architecture]] — UAT deploy topology
- [[project-weekly-help-release-cron]] — Help/Release cron evolution, fail-safe, on-demand run
- [[project-pentest-p2-merged]] — pentest pipeline that feeds the webserver weekly/monthly cron