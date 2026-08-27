#!/usr/bin/env bash
set -euo pipefail

configs=(
  deploy/nginx/conf.d/f8-sit.conf
  deploy/nginx/conf.d/f8-uat.conf
)

for config in "${configs[@]}"; do
  grep -Fq 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' "$config"

  awk -v config="$config" '
    function brace_delta(line, opened, closed) {
      opened = gsub(/\{/, "{", line)
      closed = gsub(/\}/, "}", line)
      return opened - closed
    }
    /^[[:space:]]*location[^{]*\{/ {
      location = $0
      inside = 1
      depth = brace_delta($0)
      has_header = 0
      has_hsts = 0
      next
    }
    inside && /add_header/ { has_header = 1 }
    inside && /Strict-Transport-Security/ { has_hsts = 1 }
    inside {
      depth += brace_delta($0)
      if (depth > 0) next
      if (has_header && !has_hsts) {
        printf "HSTS missing from header-owning location in %s: %s\n", config, location > "/dev/stderr"
        exit 1
      }
      inside = 0
    }
  ' "$config"
done
