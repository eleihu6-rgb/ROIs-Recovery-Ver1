# Gantt Help Tab Tree Layout

## Goal

Restructure the Gantt in-app Help navigation so it follows the product's top-level
tab model and presents Help content as a tree.

## Required navigation order

Primary tab groups:

1. Dashboard
2. Live
3. Scenario
4. Data
5. Legality
6. System
7. PBS
8. Release

Retained legacy/support groups at the bottom:

1. Settings & Personalization
2. Legality Rules
3. Glossary

The Regression Playground is not part of this requested Help order and remains
available only if its existing content is deliberately reintroduced later.

## Interaction model

- A top-level group is collapsible.
- A group contains an overview topic followed by page topics.
- A page-level dialog, drawer, or popup may be represented as a child topic.
- Search matches topic titles and overviews and expands matching groups.
- Existing topic bodies remain lazy-loaded.
- Existing Help content is preserved and only moved into the closest matching
  group when the current codebase has no page-specific topic yet.

## Initial data mapping

- Dashboard: new English overview topic.
- Live: existing Live topics.
- Scenario: existing Scenario topics.
- Data: new English overview topic.
- Legality: new tab overview topic.
- System: new English overview topic.
- PBS: new English overview topic.
- Release: existing Regression overview is not reused; add a Release overview.
- Settings & Personalization: existing topics.
- Legality Rules: existing legality rule topics.
- Glossary: existing glossary topic.

The initial pass focuses on the navigation effect and truthful group landing
topics. It does not invent detailed documentation for pages that do not yet have
Help topic implementations.

## Verification

- Add/update Help navigation Playwright coverage for the required order, groups,
  tree indentation, and selection of a landing topic.
- Run the focused Help Playwright suite.
- Run the Gantt TypeScript/build check relevant to the changed files.
