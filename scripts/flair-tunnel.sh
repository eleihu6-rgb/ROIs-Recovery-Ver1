#!/bin/bash
# Local-only: run the Cloudflare tunnel for flair.rois.cloud
# Usage: ./scripts/flair-tunnel.sh
# Not committed to git.

exec cloudflared tunnel --config ~/.cloudflared/flair.yml run
