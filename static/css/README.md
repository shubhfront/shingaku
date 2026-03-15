# Frontend CSS Architecture Documentation

This document outlines the styling architecture of the Shingaku platform. The project utilizes standard CSS (without preprocessors like SASS/LESS) but heavily relies on CSS Variables (`:root`) to maintain a consistent, modular design system across all pages. 

## Global Design System
All CSS files share a common architectural approach:
* **Theming:** A dual-theme system inspired by the anime "Bleach." The default dark mode features "Soul Reaper" aesthetics (variables like `--getsuga` orange, `--reishi` blue, `--bankai` red, and `--void` background). The light mode (`.light-theme`) represents a "Quincy/Soul Society Day" aesthetic with clean whites, grays, and alternate accent colors.
* **Typography:** Consistent use of web fonts including `Oswald` for headings, `JetBrains Mono` for code/stats, and `Rajdhani` or `Teko` for body and UI elements.
* **Responsiveness:** A strict bifurcation between desktop (`.dk-` prefixes) and mobile (`.mob-` prefixes) layouts. Desktop relies on sidebars and topbars, while mobile (`@media (max-width: 767px)`) utilizes bottom navigation bars (`.mob-bottombar`) and stackable bottom-sheet modals.

---

## File Breakdown

### 1. `attendance.css`
Handles the visual representation of the user's attendance records and statistics.
* **Status Indicators:** Defines color-coded states for attendance metrics using `.good` (green/safe), `.warn` (orange/danger-zone), and `.bad` (red/defaulted) classes.
* **Progress Bars:** Styles the horizontal tracking bars (`.att-progress-track`, `.att-progress-fill`) with animated width transitions and a 70% threshold marker (`.att-progress-threshold`).
* **Subject Cards:** Manages the grid layout (`.att-cards-grid`) for displaying individual subject statistics.

### 2. `calendar.css`
Styles the interactive academic calendar, daily schedules, and event overlays.
* **Grid Systems:** Contains separate CSS Grid definitions for the monthly view (`.cal-grid`) and the detailed 7-day weekly column view (`.cal-week-grid`).
* **Cell Indicators:** Provides styling for the micro-badges (`.cal-indicator`) that appear inside calendar dates to denote todos, events, holidays, and schedules.
* **Day Modals:** Styles the popup overlay (`.cal-modal`) containing tabbed panels for a specific day's to-do list, attendance states, and schedule.
* **Upload Zones:** Includes dashed-border drag-and-drop zones (`.cal-upload-zone`) for schedule parsing.

### 3. `dashboard.css`
Powers the layout and widgets of the main user dashboard.
* **Layout Structure:** Implements a complex grid (`.dk-grid-main`) to divide the screen into a main content area and a secondary sidebar for today's timeline.
* **Statistic Pills:** Styles the top row of summary counters (`.dk-stat-pill`) with hover micro-interactions (floating effects and box-shadows).
* **Pomodoro Overlay:** Designs the focus timer modal (`.dk-pomo-card`), including the large typography (`.dk-pomo-time`) and custom inputs.
* **Highlight Cards:** Provides unique styles for the "Up Next" class tracker (`.dk-next-class-card`) and the holiday meme container (`.dk-holiday-card`) with animated gradient text.

### 4. `homepage.css`
Manages the unauthenticated landing page, focusing heavily on animations and the cyber-aesthetic.
* **Cyber UI:** Introduces custom angular clip-paths (`.clip-cut-corner`, `.clip-button`) to give buttons and containers a futuristic, chamfered look.
* **Bento Grid:** Styles the feature showcase section using a responsive grid (`.bento-grid`, `.bento-item`) with glassmorphism backgrounds (`backdrop-filter: blur`).
* **Auth Modal:** Defines the scaling transition (`transform: scale(0.9)` to `scale(1)`) and floating label inputs (`.input-label`) for the Login/Signup popup.
* **Boot Animation:** Contains the keyframes (`@keyframes tetrisFlash`) for the initial "Tetris-style" loading screen overlay.

### 5. `notes.css`
A massive stylesheet handling the academic document repository, PDF interactions, and reading modes.
* **Complex Routing UI:** Styles a multi-panel layout utilizing nested sidebars for subjects (`.dk-sidebar`) and chapters (`.dk-chapters`), adapting them into bottom-sheet modals (`.mob-subject-sheet`) on mobile devices.
* **3D Flashcards:** Implements CSS 3D transforms (`perspective`, `transform-style: preserve-3d`, `backface-visibility: hidden`) to create a realistic flipping animation for AI flashcards (`.fc-card`, `.fc-card-inner`).
* **Kindle Mode:** Creates a distraction-free, serif-font reading environment (`.kindle-body`, `.kindle-overlay`) with specific styling for AI-extracted tables, blockquotes, and grayscale diagrams.
* **KaTeX Support:** Contains overrides to ensure LaTeX mathematical formulas (`.math-inline`, `.math-display`) render with proper colors and sizing within flashcards and Kindle mode.

### 6. `profile.css`
Focuses on user settings, inputs, and account management views.
* **Arcade Aesthetic:** Introduces the `Press Start 2P` font for specific profile elements and an overlay class (`.scanlines`) to simulate a CRT monitor effect in dark mode.
* **Interactive Inputs:** Styles custom input fields (`.shingaku-input`) with distinct visual states for `.editable`, `.locked`, and `.danger-input` (used for account deletion confirmation).
* **Toggle Switches:** Customizes standard checkboxes into animated UI toggle switches (`.toggle-checkbox`, `.toggle-label`) for adjusting user preferences.

### 7. `skills.css`
Specifically designed to render the complex AI-generated learning roadmaps.
* **Graph Layout:** Styles the hierarchical tree nodes (`.sk-graph-level`, `.sk-node`) to create a flowchart-like structure.
* **SVG Connectors:** Provides stroke and fill definitions for the dynamically drawn SVG paths (`.sk-connector`, `.sk-connector-dot`) that link prerequisite nodes together.
* **Expandable Content:** Manages the transitions when a node is clicked (`.sk-node.expanded`), revealing sub-topics (`.sk-topic-card`) within a nested grid layout.

### 8. `test_section.css`
Styles the Computer-Based Test (CBT) environment and historical analytics.
* **CBT Interface:** Designs the distraction-free exam overlay (`.ts-cbt-overlay`), including the fixed top-bar timer (`.ts-cbt-timer`) and the bottom navigation controls (`.ts-cbt-footer`).
* **Post-Test Analysis:** Styles the deep-dive analytics view (`.ts-analysis-overlay`), including large grade letters (`.analysis-grade-letter-sm`), collapsible question explanations (`.collapsible-toggle`), and correctness badges (`.analysis-pill.correct`/`.wrong`).
* **Weakness Tracking:** Implements visual circular progress rings (`.weakness-overview-ring` using `conic-gradient`) to highlight the user's weakest topics.
* **History Logs:** Styles the interactive cards (`.hist-card`) used to list past exam attempts.
