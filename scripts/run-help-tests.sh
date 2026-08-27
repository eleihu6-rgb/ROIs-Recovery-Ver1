#!/bin/bash
set -e
cd /home/yuan.z/rois/rois-ai/e2e
export GANTT_BASE_URL=http://localhost:5567
exec npx playwright test --config=config/playwright.config.ts --project=gantt "$@" --no-deps