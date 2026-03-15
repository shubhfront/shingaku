# Frontend HTML Templates Documentation

This document outlines the architecture and purpose of the HTML template files used in the Shingaku project. As a Flask application, these files act as the foundational markup structures that are dynamically populated by the Python backend via Jinja2 templating, and subsequently manipulated by the frontend JavaScript and CSS.

## File Breakdown

### 1. `homepage.html`
* **Purpose:** The unauthenticated landing page for the platform.
* **Key Elements:** Houses the canvas element required for the 3D WebGL (Hogyoku) background animation. It also contains the HTML markup for the Bento-grid feature showcase and the hidden modal structures for the Login and Signup flows (including the OTP verification step).

### 2. `dashboard.html`
* **Purpose:** The primary authenticated hub providing a high-level overview of the user's day.
* **Key Elements:** Structures the layout for the top-level statistic pills, the daily schedule timeline, the actionable to-do list, and the hidden modal for the cross-tab synchronized Pomodoro timer.

### 3. `attendance.html`
* **Purpose:** The dedicated view for monitoring class attendance and absence margins.
* **Key Elements:** Provides the DOM containers for dynamically rendering the grid of subject cards, the horizontal progress tracking bars, and the "study group" selection chips.

### 4. `calendar.html`
* **Purpose:** The interface for academic scheduling and daily planning.
* **Key Elements:** Contains the base table and grid structures for both the monthly calendar view and the 7-day weekly column view. It also holds the markup for the "Day Detail" popup modal (where users manage daily tasks and specific class attendance) and the drag-and-drop zone for timetable uploads.

### 5. `notes.html`
* **Purpose:** The central repository for academic documents, study materials, and AI reading tools.
* **Key Elements:** A complex layout structuring the collapsible sidebars for subjects and chapters. It houses the integrated PDF viewer iframe, the DOM elements for the 3D-flipping AI Flashcards overlay, and the typography-optimized container for "Kindle Mode".

### 6. `skills.html`
* **Purpose:** The canvas for the AI-generated, non-linear learning roadmaps.
* **Key Elements:** Contains the initial input fields and tag buttons for topic selection. Most importantly, it provides the empty container div where the JavaScript dynamically injects the nested topic nodes and the SVG `<path>` elements used to draw the prerequisite connection lines.

### 7. `test.html` & `test_section.html`
* **Purpose:** The environment for Computer-Based Tests (CBT) and exam analytics.
* **Key Elements:** Structures the drag-and-drop file upload zones for PDF-to-Test conversion. It also provides the complex, multi-tabbed layout required for the post-exam analysis view, accommodating KaTeX math rendering, expandable answer explanations, and "Weak Topic" circular progress rings.

### 8. `live_tests.html` & `live_test_exam.html`
* **Purpose:** The lobby and active examination room for institutionally scheduled live exams.
* **Key Elements:** * `live_tests.html`: Structures the list view of available, upcoming, and past live exams.
  * `live_test_exam.html`: A highly controlled, distraction-free interface strictly structured to support anti-cheat mechanisms, question navigation, and real-time countdown timers without standard platform navigation elements.

### 9. `profile.html`
* **Purpose:** The user settings and account management interface.
* **Key Elements:** Structures the tabbed navigation between generic profile settings, security (password changes, account deletion), and platform preferences. It includes the markup for the randomized pixel-avatar picker grid and custom toggle switches.

### 10. `admin.html`
* **Purpose:** A restricted dashboard for platform administrators.
* **Key Elements:** Provides the layout for administrative controls, likely including interfaces for scheduling new live tests, monitoring system usage, and verifying exam integrity hashes against the blockchain.
