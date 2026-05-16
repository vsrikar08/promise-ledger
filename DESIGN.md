# Design System - PromiseLedger

## Product Context

- **What this is:** PromiseLedger is an account-memory workbench that turns customer-facing promises into source-backed engineering intake.
- **Who it is for:** Founders, solutions engineers, PMs, and engineering leads reviewing customer commitments before kickoff or issue creation.
- **Space:** Sales engineering, customer success operations, developer intake, and AI-assisted account memory.
- **Project type:** Dense web app / operational workbench, not a marketing site.
- **Memorable thing:** Every claim earns its source before it becomes engineering work.

## Aesthetic Direction

- **Direction:** Evidence-led operational.
- **Decoration level:** Minimal. Typography, spacing, source labels, and semantic state carry the experience.
- **Mood:** Calm, factual, and serious. The product should feel like a trusted intake console, not an AI dashboard.
- **Core principle:** Source evidence is the visual anchor. Decorative chrome must never compete with citations, risk, and mutation safety.

## Typography

- **Display:** IBM Plex Sans SemiBold. Use for product name, account title, and major pane titles.
- **Body:** IBM Plex Sans. It is readable at compact sizes and feels technical without looking raw.
- **UI / Labels:** IBM Plex Sans Medium. Use uppercase sparingly for section labels and status text.
- **Data / Source IDs:** IBM Plex Mono. Use for source IDs, locators, dates, frozen tokens, command output, and issue body snippets.
- **Code:** IBM Plex Mono.
- **Loading:** Prefer Google Fonts or Bunny Fonts for the prototype. If external fonts are avoided, keep the same roles and use the local fallback stack only as a pragmatic constraint.
- **Scale:**
  - Display: 28px / 1.1, 600
  - Page title: 22px / 1.2, 600
  - Pane title: 15px / 1.3, 600
  - Body: 14px / 1.45, 400
  - Metadata: 12px / 1.35, 500
  - Mono metadata: 12px / 1.4, 500

## Color

- **Approach:** Balanced, with restrained surfaces and semantic color doing real work.
- **Canvas:** `#f6f7f4` warm paper background for the app shell.
- **Surface:** `#ffffff` primary panes.
- **Surface Muted:** `#fafbf9` evidence rows and quiet grouped content.
- **Ink:** `#17201c` primary text.
- **Muted Ink:** `#66706b` secondary copy.
- **Line:** `#d9ded8` borders and dividers.
- **Primary:** `#0f766e` ready state, safe state, selected account, primary action.
- **Context:** `#255f85` links, section context, source navigation.
- **Critical:** `#b42318` blocked, critical, destructive action.
- **Warning:** `#a05a00` needs review, duplicate warning, partial state.
- **Semantic surfaces:**
  - Success bg: `#e8f5f2`
  - Error bg: `#fff0ed`
  - Warning bg: `#fff4dd`
  - Info bg: `#edf5fb`
- **Dark code surface:** `#111814` with text `#eff7f2`.
- **Dark mode:** Not required for the hackathon slice. If added, redesign surfaces rather than inverting colors directly; reduce semantic saturation 10-20%.

## Spacing

- **Base unit:** 4px.
- **Density:** Compact, readable, workbench-first.
- **Scale:** 2xs 2px, xs 4px, sm 8px, md 16px, lg 24px, xl 32px, 2xl 48px, 3xl 64px.
- **Pane padding:** 12-14px for dense panels, 18-22px for page shell.
- **Record gaps:** 6-8px inside repeated rows, 12-16px between major zones.

## Layout

- **Approach:** Grid-disciplined app UI.
- **Desktop shell:** Left account sidebar, main workspace header, safety strip, issue queue, and evidence/memory rail.
- **Primary desktop grid:** `316px` sidebar plus flexible workspace. Inside workspace, issue queue and evidence/memory rail should split roughly 45/55 unless the right rail is collapsed.
- **Three-zone hierarchy:**
  1. Account and risk posture.
  2. Promise debt queue and selected evidence.
  3. Guard, Q&A, timeline, and GitHub safety context.
- **Border radius:** 4px for chips and small controls, 8px for panes and buttons, 999px only for pills/dots.
- **Shadows:** Use only `0 1px 2px rgba(23, 32, 28, 0.08)` or none. The UI should still work if shadows are removed.

## Components

- **Sidebar:** Brand, system status, import action, account list. Active account uses primary border and success surface.
- **Score Strip:** Compact counters for issues, critical risks, and sources. Counters are orientation, not decorative KPI cards.
- **Issue Queue:** Repeated records with checkbox, title, summary, risk chip, and flags. Active row uses a quiet surface, not a heavy outline.
- **Evidence Block:** Source ID, locator, date, and quote. Avoid colored left-border decoration; use label hierarchy and quiet surface.
- **Memory Rail:** Guard, Q&A, and timeline sections share one right-side rail. Each section has one job.
- **Promise Guard:** Shows draft status as Safe, Blocked, or Needs review, with citations visible in the result.
- **Q&A Answer:** Preset question, answer bullets, owners, dates, risks, citations. Unknown facts say "Not found in sources."
- **Timeline:** Ordered source events, with support/conflict labels and a "Date unknown" group at the end.
- **GitHub Safety Strip:** Repo target, selected count, dry-run state, duplicate check, label fallback, and frozen token. Mutation controls live nearby.
- **Activity Log:** Timestamped outcomes. Keep it compact and secondary.

## Interaction States

- Keep the current layout stable during loading. Use skeleton rows or persistent previous content instead of empty jumps.
- Empty states must explain the next action and preserve context.
- Error states must name the failing system: import, GBrain, GitHub auth, duplicate check, label fallback, or nonce.
- Partial states are first-class: show what worked, what was skipped, and what can be retried.
- Success states should prove provenance: source count, citation labels, duplicate status, and created issue links.

## Motion

- **Approach:** Minimal-functional.
- **Durations:** Micro 75ms, short 150ms, medium 250ms.
- **Easing:** `ease-out` for enter, `ease-in` for exit, `ease-in-out` for layout movement.
- **Allowed motion:** Button press, row hover, panel state transition, skeleton shimmer if restrained.
- **Avoid:** Decorative entrance sequences, large panel slides, scroll-driven effects, or motion that delays review work.

## Responsive Behavior

- **Desktop >= 1180px:** Full three-zone workbench.
- **Tablet 760-1179px:** Sidebar moves above or becomes a compact account rail; issue queue and evidence stack in two rows; memory rail becomes tabbed within the evidence zone.
- **Mobile < 760px:** Account selector becomes a top control. Use segmented views: Queue, Evidence, Memory, Activity. Mutation actions remain sticky near safety state.
- **Touch targets:** Minimum 44px for primary actions, icon buttons, account rows, and checkboxes.

## Accessibility

- Use landmark regions: sidebar navigation, main workspace, issue queue, evidence detail, memory rail, and activity log.
- All controls need visible labels. Do not rely on placeholder text as a label.
- Preserve focus states for account buttons, issue rows, draft selectors, and GitHub actions.
- Risk and status cannot rely on color alone. Always pair color with text.
- Body copy contrast must meet WCAG AA. Metadata can be smaller only when contrast remains high.
- Activity log should use polite live-region behavior.

## Copy Rules

- Use utility copy, not marketing copy.
- Good: "Blocked by product boundary", "Duplicates checked", "3 selected", "Date unknown", "Not found in sources".
- Avoid: "Unlock insights", "AI-powered intelligence", "Streamline your workflow", "Welcome to PromiseLedger".
- Every mutation action must include the target system or consequence nearby.

## Anti-Slop Rules

- No purple, violet, or indigo gradients as the main look.
- No 3-column feature grids, icon-in-circle decoration, decorative blobs, or centered marketing sections.
- No stacked decorative card mosaics.
- No oversized uniform border radius.
- No generic dashboard widgets when a record, table, strip, or timeline row would communicate better.
- No source-free AI answers. If a panel cannot cite, it must say so.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-16 | Initial design system created | Created during `/plan-design-review` and `/design-consultation` for the PromiseLedger hackathon slice. |
| 2026-05-16 | Evidence-led operational style | The product wins by making account memory trustworthy before creating engineering work. |
| 2026-05-16 | IBM Plex Sans and IBM Plex Mono | The pairing supports dense UI, source IDs, citations, and issue snippets without looking generic. |
| 2026-05-16 | Three-zone workbench | Keeps ledger, evidence, and memory tools visible without turning the app into a report page. |
