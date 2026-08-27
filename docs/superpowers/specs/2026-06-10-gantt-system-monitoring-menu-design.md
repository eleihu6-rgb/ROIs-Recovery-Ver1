# Gantt System Monitoring Menu

## Context

Gantt currently has a top-level `System` module, but it renders the generic placeholder view and has no System sidebar entries. Operations pages such as Bull Board, Grafana, Prometheus, and Windmill are deployed behind the same public Nginx gateway as Gantt, so browser URLs must use same-origin `/fpqe/...` paths rather than localhost or internal server addresses.

## Design

Add a System module view with an `Operations` submenu:

- Queue Tasks: `/fpqe/connector/admin/queues/`
- Grafana: `/fpqe/monitor/grafana/`
- Prometheus: `/fpqe/monitor/prometheus/`
- Windmill: `/fpqe/monitor/windmill/`

The selected item renders in the main content area with an iframe, a compact header, refresh control, and external-open control. URLs default to deployment-safe same-origin paths and can be overridden with Vite env variables.

## Scope

Do not change monitoring Docker files or Nginx config in this change. Do not add a separate Loki menu item because Loki is primarily a backend log store and is normally viewed through Grafana.

## Verification

Run Gantt TypeScript validation and verify the Vite dev server logs do not show import or compile errors.
