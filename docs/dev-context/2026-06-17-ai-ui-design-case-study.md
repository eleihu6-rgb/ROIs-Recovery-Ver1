# Case Study: AI-Assisted UI Design Through Visual Brainstorming

**Date:** 2026-06-17
**Project:** ROIS-AI Gantt — Legality Tab, Rule Parameter Table Editing
**Session type:** Design decision session using structured visual mockups

---

## 1. Introduction

This document is a case study on how to effectively use an AI assistant (Claude) to make UI design decisions for a non-trivial feature. The goal is not to show a finished product, but to document the **process**: how the session was structured, how design questions were framed, how visual options were presented, and how decisions were reached one at a time.

### The problem being solved

The ROIS-AI Gantt application has a **Legality tab** where aviation rule engineers view and manage rule parameter tables. These tables show rows of applicability conditions — columns like BASE, RANK, FLEET, TYPE, and ENABLE CHECK — that control how each rule fires during crew scheduling checks.

The tables were read-only. The user needed to add **full editing capability**: the ability to modify rows in place, add new rows, copy existing rows, delete rows with confirmation, reorder rows, undo changes step by step, validate cell format (e.g., enforcing HH:MM on time fields), and add descriptive tooltips to each column header.

That is seven distinct UI behaviors. Getting all seven right in a single pass would be difficult. The session instead tackled them as a series of focused design decisions, each answered with a visual choice.

---

## 2. The AI Interaction Workflow

The session followed a deliberate structure. Each phase built on the previous one.

### Phase 1 — Explore the codebase

Before any design work began, the AI read the actual source files: the component that renders the parameter table, the data shapes it consumes, and the existing patterns in the codebase (dialog standards, existing action buttons, validation conventions). This grounded every subsequent suggestion in what already existed rather than in generic UI patterns.

Key findings from this phase:
- The table renders parameter rows from the rule engine's param_json structure
- The application has an established `AppDialog` standard for modal windows (blue header, draggable, standard footer buttons)
- Some rules have 5–6 columns; others (like rule 8056) have 24 columns — the editing mechanism needed to handle both gracefully
- There was no existing row-editing pattern to inherit; this was net-new

### Phase 2 — Frame requirements as separate decisions

Rather than treating the seven requirements as a single design problem, the session broke them into five independent design decisions, each with a clear question and a bounded set of options. This made each choice concrete and prevented the feature from becoming a single blob of accumulated assumptions.

The five decisions were:
1. How should editing work? (edit mode interaction pattern)
2. Where and when should row action icons appear?
3. How should undo work?
4. How should validation and the "Add Row" affordance look?
5. How should delete confirmation work?

### Phase 3 — Visual companion: present three options per decision

For each decision, the AI generated an HTML mockup showing exactly three options — labeled A, B, C — rendered as realistic mini-previews of the actual table with the actual column names (BASE, RANK, FLEET, TYPE, ENABLE CHECK). Each option showed the live state, not a description of it. The user could see the visual difference between inline editing vs. a dialog, or a toast vs. a side panel, rather than reading about it.

Mockups were saved to `.superpowers/brainstorm/` and presented one decision at a time. The user selected from the visual previews and could add a brief note about their reasoning.

### Phase 4 — Collect decisions into a spec

Once all five decisions were made, the AI assembled the choices into a coherent design specification: a single document that described exactly what to build, with no ambiguity about which option was chosen and why. This spec became the input to the implementation plan.

### Phase 5 — Write an implementation plan

With a confirmed spec, the AI produced a phased implementation plan — not a list of files to change, but a step-by-step roadmap with dependency ordering, test checkpoints, and clear acceptance criteria for each phase.

---

## 3. The Five Design Decisions

Each decision below describes the question, the three options that were presented as visual mockups, and the outcome.

---

### Decision 1 — Edit Mode: How should editing work?

**The question:** When a user wants to modify a cell value in a parameter row, what is the editing experience?

**See mockup:** `.superpowers/brainstorm/76406-1781755336/content/row-editing-approach.html`

**Option A — Inline Cell Edit**
The table row highlights yellow when editing. Clicking any cell turns it into an input field, right there in the table. A checkmark (confirm) and X (cancel) button appear at the row's right end. The undo state is shown in a small dark bar above the table. The editing experience never leaves the table surface.

**Option B — Expand-to-Edit Row**
Clicking the edit icon causes the row to expand vertically, revealing a horizontal form panel below it. All fields are presented as labeled inputs in a compact strip. The rest of the table remains visible above. This separates "reading mode" from "editing mode" more cleanly, but the expansion shifts the layout.

**Option C — Dialog Popup**
Clicking the edit icon opens an AppDialog (the application's standard modal window) with a full form showing all fields with labels. The background table fades. This uses the established dialog standard and is completely separate from the table surface.

**Decision: Hybrid — Option A for rules with 12 or fewer columns, Option C for rules with more than 12 columns.**

Rationale: Inline editing (A) works well for compact rules — the user can see all edits in context, and the table structure provides natural reference. But for wide rules like 8056 (24 columns), inline editing becomes impractical: the cells are too narrow and the row too wide to edit comfortably. A dialog is the right tool for dense data entry. The hybrid approach gives the best experience for both cases based on actual column count, not a manual mode switch.

---

### Decision 2 — Row Action Icons: Where and when should they appear?

**The question:** The row actions are edit, copy, delete, move up, and move down — five icons per row. How should they be displayed?

**See mockup:** `.superpowers/brainstorm/76406-1781755336/content/row-actions-placement.html`

**Option A — Always Visible, Right Column**
A permanent "Actions" column sits at the right of every row. All five icons are always visible. The column header reads "Actions". No hover interaction required. Predictable, immediate, zero discoverability problem. Takes approximately 110px of column width.

**Option B — Hover-Reveal Icons**
The actions column has no permanent content. When the user hovers over a row, that row gets a light blue tint and the five icons fade in. All other rows remain icon-free, keeping the table visually clean. The tradeoff is that the actions are invisible until interaction.

**Option C — Drag Handle Left + Three Icons Right**
A braille-dot drag handle (⠿) appears at the left of each row, replacing the up/down arrow buttons. Move-by-dragging is more natural for reordering. Only three icons (edit, copy, delete) appear on the right, making the action column narrower. The dragged row gets a dashed amber outline to signal active drag state.

**Decision: Option A — Always visible right column.**

Rationale: For an operations interface used by rule engineers who are scanning and modifying data systematically, discoverability matters more than visual density. Hover-reveal (B) hides functionality and doesn't work on touch. The drag handle (C) is elegant but adds implementation complexity and introduces a new interaction paradigm that requires training. The always-visible approach (A) is explicit and accessible.

---

### Decision 3 — Undo Feature: How should it look?

**The question:** Users need to be able to undo edits, deletions, and additions step by step, back to the last saved state. What is the undo interaction model?

**See mockup:** `.superpowers/brainstorm/76406-1781755336/content/undo-design.html`

**Option A — Toast Undo Bar (ephemeral)**
After each action, a dark notification bar appears at the top of the table showing what changed ("Row deleted — TYPE: RANK, BASE: *") with an "Undo" link and a countdown timer. It auto-dismisses after 8 seconds. Lightweight, familiar (matches application-wide toast conventions), no permanent UI footprint. Limited to one undo step at a time; once dismissed, the opportunity is gone.

**Option B — Toolbar with History Dropdown**
A persistent toolbar sits above the table with Undo and Redo buttons, an unsaved-changes count badge, and a "Save All" button. Clicking a dropdown arrow next to Undo reveals a history list showing each action as a line item (edit, delete, add). The user can jump back to any point in the history, not just step back one at a time.

**Option C — Side Change Log Panel**
A persistent panel docks to the right of the table. Every edit, deletion, and addition appears as a tagged log entry: EDIT tags are blue, DEL tags are red, ADD tags are green. The most recent change is highlighted. A "⟲ Undo" link in the panel header steps back one action. A "Save All" button at the bottom commits all pending changes. The panel shows the full unsaved change history at all times.

**Decision: Option C — Side change log panel.**

Rationale: Rule parameter editing sessions tend to involve multiple sequential changes — editing a few rows, deleting one, adding a new one. The user needs to be able to review what has been changed before saving and step back selectively. The toast (A) is too ephemeral for multi-step work. The toolbar dropdown (B) is more powerful but adds a separate UI area above the table. The side panel (C) keeps the change history persistently visible while editing, which matches the workflow of an engineer carefully adjusting parameters. The color-coded EDIT/DEL/ADD tags make the change type scannable at a glance.

---

### Decision 4 — Validation and Add Row: How should cell errors and the "Add Row" affordance look?

**The question:** When a new row is added, all cells are initially empty (required). When a user types a value in a cell that expects a time format (HH:MM), the format must be enforced. How should these states be communicated visually, and how should the "Add Row" button appear?

**See mockup:** `.superpowers/brainstorm/76406-1781755336/content/validation-addrow.html`

**Option A — Red Ring + Inline Error Hint**
Empty required cells get a solid red border (2px) with a light red background tint. Format errors (e.g., a time field containing "90" instead of "01:30") get an orange border. A small error message appears directly below the cell in the cell itself — "Required" for empty, "Use HH:MM" for format violations. The "Add Row" button is a dashed-border ghost button below the table reading "+ Add Row".

**Option B — Soft Red Fill + Error Icon**
Empty cells get a soft pink background fill with a lighter red border — less alarming than a hard red ring. Format errors get a yellow/amber background with a ⚠ icon to the right of the cell value. The feedback is gentler. The "Add Row" button is a solid blue filled button.

**Option C — Dashed Border + Error Badge + Ghost Row**
Empty cells get a dashed red border (less assertive than a solid ring). Format errors get a solid red border with a small inline "ERR" badge in red. The "Add Row" affordance is rendered as a ghost table row at the bottom — a full-width dashed line with "+ Add a new row…" text that becomes blue on hover.

**Decision: Option A — Red ring + inline error hint.**

Rationale: The combination of solid red for missing values and orange for format errors provides a clear two-level signal without ambiguity. The inline hint text ("Required", "Use HH:MM") tells the user exactly what to do without a separate error summary. In a dense parameter table where many cells may be invalid at once, explicit ring outlines are easier to scan than soft fills. The dashed ghost "+ Add Row" button below the table is appropriately unobtrusive — it is an affordance to reach for deliberately, not a button that competes with the data.

---

### Decision 5 — Delete Confirmation: Which double-confirm style?

**The question:** Deleting a parameter row is a significant action that should require explicit confirmation. What is the confirmation interaction?

**See mockup:** `.superpowers/brainstorm/27683-1781762105/content/delete-confirm.html`

**Option A — Inline Row Confirmation**
When the user clicks the delete icon, the row turns red. The action icons in that row are replaced by three elements: "Delete?" label in red, a solid red "Yes, delete" button, and a "Cancel" button. The rest of the table is unaffected. No popup, no modal, no layer on top of the page — the confirmation happens right in the row.

**Option B — Popover Near the Delete Button**
A small popover card appears anchored directly to the delete icon that was clicked. It shows the row's key details ("TYPE: RANK, BASE: *") and presents "Cancel" and "Delete" buttons. The popover has a small arrow pointing back to the trigger button. The row itself does not change appearance.

**Option C — AppDialog Modal**
Clicking delete opens a full AppDialog (the application's standard modal) with a red header bar reading "Delete Row", a summary of the row being deleted (TYPE, BASE, RANK, FLEET values shown in a red-tinted block), and "Cancel" / "Delete" buttons in the footer. The table behind the dialog is dimmed.

**Decision: Option A — Inline row confirmation.**

Rationale: Inline confirmation keeps the user's attention on the data they are about to delete — the row turns red and the confirmation is literally on that row. There is no context-switching to a popup or modal. The two-step interaction (click delete → see red row → explicitly click "Yes, delete") provides sufficient friction without interrupting the editing flow. The AppDialog (C) would be appropriate for deleting a higher-stakes object (a whole ruleset, for example), but for a single parameter row it is over-engineering the confirmation. The popover (B) is compact but can be accidentally dismissed and lacks the visual weight of the red row state.

---

## 4. Final Design Decisions Summary

| Area | Decision |
|---|---|
| Edit mode for narrow rules (≤12 cols) | Inline cell edit — row highlights yellow, inputs appear in place, ✓ / ✕ at row end |
| Edit mode for wide rules (>12 cols) | AppDialog popup — full labeled form, matches app dialog standard |
| Action icons placement | Always visible "Actions" column on the right — edit ✏ copy ⧉ delete 🗑 move ↑ ↓ |
| Undo / change history | Side change log panel — EDIT/DEL/ADD color tags, ⟲ Undo, Save All button |
| Empty cell validation | Red ring outline + "Required" hint text below the cell |
| Format validation (e.g., HH:MM) | Orange ring outline + "Use HH:MM" hint text below the cell |
| Add Row affordance | Dashed ghost button below the table — "+ Add Row" |
| Delete confirmation | Inline — row turns red, action icons replaced by "Delete? / Yes, delete / Cancel" |
| Column header help | Hover tooltip on each column header |

---

## 5. Key Takeaways: How to Use AI for UI Design

### 1. Explore the codebase before designing

The most useful thing the AI did before presenting any options was to read the actual source files. This grounded the design in reality: it knew that the application had an AppDialog standard, that some rules had 24 columns, that there was no existing row-edit pattern to reuse. Generic UI advice is easy to give; advice rooted in the specific codebase is much harder to get elsewhere.

### 2. Break the feature into independent decisions

Seven requirements sounds like one design problem. It is actually five or more independent design choices. The session broke them apart explicitly: edit mode, icon placement, undo model, validation style, delete confirmation. Each question was answerable on its own. This prevented one decision from bleeding into another and made the session faster, not slower.

### 3. Present exactly three options, rendered visually

Describing options in text ("you could do inline editing, or a dialog, or an expand panel") forces the reader to build mental images and compare them in working memory. Showing three rendered HTML mockups — with real column names, real icons, real states — collapses that cognitive work. The user can answer in seconds because they are choosing what they see, not imagining what they would see.

Three options is the right number. Two feels like a binary and invites a third option anyway. Four or more is too much to hold in comparison at once.

### 4. Ask one question at a time

Each of the five decisions was its own message exchange: present three options, get an answer, move to the next question. This discipline prevented the session from becoming a sprawling design conversation where decisions got tangled together. The user's cognitive load at any moment was bounded to one question.

### 5. Capture rationale, not just the choice

For each decision, the user's answer included a brief reason. "I want always-visible because discoverability matters" or "the side panel because I'll make multiple changes before saving." These reasons do two things: they prevent the AI from misinterpreting the choice in later phases, and they seed the specification document with the design intent, which helps anyone reading the spec later understand why things are the way they are.

### 6. Build up to a spec, then a plan

The design session did not produce an implementation plan. It produced a **specification** — a single, unambiguous description of what to build. Only after the spec was confirmed did the session produce a phased implementation plan. This separation matters because specs and plans serve different audiences and purposes. A spec answers "what and why". A plan answers "how and in what order". Mixing them causes both to suffer.

### 7. Visual mockups do not have to be polished

The five HTML mockups in this session were functional but deliberately minimal: monospace table cells, a few color classes, emoji icons for edit/copy/delete. They took minutes to generate. Their purpose was not to look good — it was to be visually distinct enough that the user could tell options A, B, and C apart without reading the description twice. The best visual companion is one that communicates the decision quickly, not one that impresses the viewer.

---

## 6. Artifacts from This Session

| Artifact | Location |
|---|---|
| Edit mode mockup | `.superpowers/brainstorm/76406-1781755336/content/row-editing-approach.html` |
| Row actions placement mockup | `.superpowers/brainstorm/76406-1781755336/content/row-actions-placement.html` |
| Undo design mockup | `.superpowers/brainstorm/76406-1781755336/content/undo-design.html` |
| Validation + Add Row mockup | `.superpowers/brainstorm/76406-1781755336/content/validation-addrow.html` |
| Delete confirmation mockup | `.superpowers/brainstorm/27683-1781762105/content/delete-confirm.html` |
| This case study | `docs/dev-context/2026-06-17-ai-ui-design-case-study.md` |

The implementation spec and plan produced from this session should be filed under `docs/superpowers/specs/` and `docs/superpowers/plans/` respectively, per the project's AI document conventions.
