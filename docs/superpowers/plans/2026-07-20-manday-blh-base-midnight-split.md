# Manday BLH Base-Midnight Split — Implementation Plan

> **For agentic workers:** Execute task-by-task. Spec: `docs/superpowers/specs/2026-07-20-manday-blh-base-midnight-split-design.md`

**Goal:** Split flying BLH across crew-base local midnights per flight leg; keep credit on duty start day.

**Architecture:** Pure `splitBlhByBaseMidnight` helper; `loadActivity` returns leg-level times + duty-level credit; `realBlh` accumulates splits; upsert BLH-only days.

**Tech Stack:** live-server TypeScript, Vitest, existing Rust ruletool for credit only.

## Tasks

- [x] Task 1: `manday-blh-split.ts` + unit tests (TDD)
- [x] Task 2: Wire `loadActivity` / `RosterActivity` / `realBlh` / BLH-only upsert
- [x] Task 3: Vitest pass + recompute SIT 677 crew 96 verify 06:00 / 05:20
