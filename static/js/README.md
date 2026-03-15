# Frontend JavaScript Documentation

This document outlines the architecture and specific functions of the frontend JavaScript files used in the Shingaku project. Each file handles a distinct part of the user interface and interacts with the backend APIs to deliver a dynamic, single-page-application feel.

## 1. `attendance.js`
This file manages the attendance tracking interface, calculating percentages and visualizing absence limits.

* **`escHtml(s)`**: Escapes HTML strings to prevent XSS attacks when rendering user data.
* **`loadAll()`**: A wrapper function that concurrently calls `loadSchedule`, `loadGroup`, and `loadStats` before rendering.
* **`loadSchedule()`**: Fetches the user's uploaded class schedule from the `/api/calendar/schedule` endpoint.
* **`normalize(raw)`**: Standardizes the format of schedule data to ensure backward compatibility with older data structures.
* **`loadGroup()`**: Fetches the user's currently selected study group.
* **`loadStats()`**: Retrieves aggregated attendance statistics (total, attended, cancelled) per subject.
* **`setGroup(group)`**: Updates the user's study group on the server and re-renders the UI.
* **`getSubjects()`**: Extracts a unique list of subjects from the schedule based on the selected group.
* **`hasMultipleGroups()`**: Checks if the parsed schedule contains more than one student group.
* **`render()`**: The main UI builder that loops through subjects, calculates safe absence margins (70% rule), and injects HTML cards.
* **`applyTheme()`, `toggleTheme()`, `updateThemeIcons()`**: Utility functions to manage light/dark mode persistence via `localStorage`.
* **`logOut()`**: Submits a logout POST request and redirects the user.
* **`showToast(msg)`**: Displays brief, self-dismissing notification popups.

## 2. `calendar.js`
Manages the interactive calendar interface, allowing users to view schedules, events, and manage daily task lists.

* **`loadAllData()`, `loadCalData()`, `loadUserSchedule()`, `loadCollegeEvents()`**: Functions to hydrate the calendar state from APIs and local storage.
* **`fetchMonthData()`, `saveCalData()`**: Syncs daily modifications (like tasks and attendance) with the backend database.
* **Date Utilities (`dateKey`, `todayKey`, `getMonthName`)**: Helper functions to format JavaScript Date objects into strings compatible with the backend JSON structure.
* **`renderMonthView()`, `buildMonthCell()`**: Generates the grid layout for the monthly calendar view, attaching indicators for events and tasks.
* **`renderMobileMonthView()`, `buildMobCell()`**: Generates a responsive, dot-indicator based month view optimized for smaller screens.
* **`renderWeekView()`, `buildWeekCell()`**: Generates a detailed 7-day column view showing specific class times and to-dos.
* **`openDayModal()`, `switchModalTab()`, `closeDayModal()`**: Controls the popup interface that appears when a user clicks a specific day, utilizing a tabbed layout.
* **`buildTodoPanel()`, `buildSummaryPanel()`**: Generates the internal HTML for the day modal's specific tabs.
* **`toggleCalTodo()`, `addCalTodo()`, `deleteCalTodo()`**: Event listeners to manage the state of tasks for a specific date.
* **`setAttendance()`**: Updates the 3-state attendance metric (present/absent/cancelled) for a specific lecture on a specific day.
* **`handleScheduleUpload(input)`**: Packages an uploaded schedule file into `FormData` and posts it to the AI parsing endpoint.
* **`MapsPrev()`, `MapsNext()`, `goToday()`, `setView()`**: Navigation controls to change the currently viewed month or week.

## 3. `dashboard.js`
Powers the main entry dashboard, bringing together notifications, a pomodoro timer, and a summary of the day's events.

* **`loadAllDashboardData()`**: Concurrently fetches the user schedule, events, today's data, and overall stats.
* **`getGreeting()`, `renderGreeting()`**: Calculates a time-sensitive greeting message (e.g., "Burning the midnight oil") and renders it with the user's name.
* **`renderStats()`**: Updates the top statistic counters for classes, todos, and unread notifications.
* **`renderHighlight()`**: Evaluates today's schedule to display an "Up Next" class card, an "All Done" card, or a meme if it is a holiday.
* **`renderAttendanceBar()`**: Renders a progress bar summarizing total attendance and injecting contextual quips if the percentage falls below 70%.
* **`renderSchedule()`, `renderTodos()`**: Builds the timeline view of the day's lectures and the actionable task list.
* **`toggleTodo()`, `deleteTodo()`, `addTodo()`**: Handlers for marking tasks complete or modifying the day's list.
* **`fetchNotifications()`, `renderNotifications()`, `dismissNotification()`**: Polls the server for new alerts, renders the dropdown list, and handles dismissals.
* **`initBrowserNotifications()`, `showBrowserNotification()`**: Requests permission and triggers native OS push notifications for alerts.
* **Pomodoro Engine (`_loadPomoConfig`, `applyPomoCustom`, `_startPomoTick`, `_pomoFinish`, `_pomoAlarm`, `togglePomo`, `resetPomo`)**: A complex, cross-tab synchronized focus timer that utilizes `BroadcastChannel`, `localStorage`, and the Web Audio API for alarms.
* **`generatePixelAvatar(seed)`**: Generates a deterministic, seeded 12x12 pixel art avatar drawn to an HTML5 canvas.

## 4. `homepage.js`
Handles the unauthenticated landing page, including 3D WebGL animations and authentication flows.

* **`initThreeJS()`, `animate()`**: Sets up a 3D scene using Three.js, rendering a complex floating object (the Hogyoku) with particles, lighting, and scroll-parallax animations.
* **`updateThreeTheme()`**: Adjusts the WebGL fog, material colors, and ambient lighting to match the user's light/dark mode preference.
* **`openAuthModal()`, `switchAuthTab()`, `closeAuthModal()`**: Controls the visibility and layout state of the Login/Signup popup.
* **`togglePassword()`**: Toggles input field types between `password` and `text` for visibility.
* **Regex Validators (`check_username`, `check_email`, `check_password`)**: Client-side form validation before submission.
* **`username_check()`, `email_check()`**: Asynchronous calls to verify if identifiers are already in use.
* **`handleformsubmit(e)`**: Intercepts form submissions, orchestrates validation, switches the UI to OTP entry, and handles the final login/signup API calls.
* **`getUserStatus()`, `ifLoggedIn()`**: Checks session status on page load to morph the homepage CTA buttons into Dashboard links if authenticated.

## 5. `notes.js`
This file powers the academic document repository, PDF viewer, AI Flashcards, and Kindle Mode parser.

* **`getSubject()`, `getChapter()`, `getResources()`**: Helper functions to query the loaded JSON classroom database.
* **`openDriveFile()`, `openPdfViewer()`, `closePdfViewer()`, `downloadCurrentPdf()`**: Controls the overlay iframe used to view PDFs without leaving the platform.
* **`dkRenderSubjects()`, `dkRenderChapters()`, `dkRenderContent()`**: Desktop-specific rendering functions that build the sidebar, chapter list, and main file grid.
* **`dkSearchFilter()`, `highlightMatch()`, `dkCloseSearch()`**: Implements a global search engine across all subjects, chapters, and resources with keyboard navigation.
* **`mobRenderSubjectGrid()`, `mobSelectSubject()`, `mobGoBack()`**: Mobile-specific rendering and navigation flows.
* **`autoWrapMath()`, `renderMathIn()`, `mathSafeLineBreaks()`**: Scans DOM nodes for LaTeX delimiters and executes KaTeX rendering to display mathematical equations properly.
* **`startFlashcardGeneration()`**: Posts selected PDF IDs to the AI backend and initializes the flashcard state.
* **`renderCurrentFlashcard()`, `flashcardFlip()`, `flashcardNext()`, `flashcardFilter()`**: Manages the logic, animation, and filtering of the 3D-flipping flashcard interface.
* **`fcTouchStart()`, `fcTouchMove()`, `fcTouchEnd()`**: Binds swipe gestures to navigate through the flashcard deck on mobile devices.
* **`openKindleMode()`, `renderKindleContent()`, `kindleChangeFontSize()`**: Calls the AI extraction API and renders structured, reading-optimized text with a progress bar.

## 6. `profile.js`
Handles user settings, account security, and personalized feature toggles.

* **`switchTab()`, `enableEdit()`**: Toggles visibility between profile setting categories and unlocks input fields.
* **`playClickSound()`, `showToast()`**: Implements a Web Audio API UI click sound and standard toast notifications.
* **`togglePhotoMenu()`, `openAvatarModal()`, `regenerateAvatarGrid()`, `selectAvatar()`**: Provides UI controls to open the avatar picker, generate an array of new randomized pixel avatars, and save the selection.
* **`updateAvatarLive()`**: Updates the displayed avatar dynamically if the user modifies their username.
* **`fetchUserProfile()`, `handleUpdateProfile()`, `handleChangePassword()`**: Executes fetches to retrieve current settings and post updates to passwords and bio information.
* **`handleDeleteAccount()`, `verifyDeletePassword()`, `verifyOTPAndDelete()`**: Manages the multi-step account termination sequence involving password confirmation and OTP validation.
* **`getWakeMeUpData()`, `updateWakeMeUp()`, `toggleWakeSection()`**: Controls the "Wake Me Up" utility configurations and synchronizes them with the database.
* **`updateClanNDB()`, `updateTodoTimeNDB()`, `updateExamNDB()`**: Specific toggle functions that save individual boolean preference changes.

## 7. `skills.js`
Executes the complex rendering logic for the AI-generated skills roadmaps.

* **`syncTags()`, `updateGenerateBtn()`, `showLoading()`, `resetView()`**: Coordinates the UI state between the preset tag buttons and the custom input field, managing loading spinners.
* **`generateRoadmap()`**: Requests a custom JSON roadmap from the AI endpoint based on the selected skill.
* **`computeLevels(modules)`**: Uses topological sorting to analyze the prerequisites of each roadmap module and assigns them to hierarchical "levels" for visual rendering.
* **`renderRoadmap(roadmap)`**: Builds the DOM elements for the tree graph, structuring the modules into columns based on their calculated level.
* **`drawConnectors(flow, svg, modules, idMap)`**: Calculates bounding box positions and dynamically draws curved SVG paths (`<path>`) connecting prerequisite nodes to their targets.
* **`toggleNodeExpand()`**: Handles click events on a module to expand its container and reveal sub-topics, subsequently recalculating SVG connector lines.
* **`openSkillModal(moduleIdx, topicIdx)`**: Opens a detailed modal populated with external links, books, and YouTube playlists associated with a specific topic.

## 8. `test_section.js`
Manages the Computer-Based Test (CBT) interface, historical analytics, and active live tests.

* **`getPdfsForSubject()`, `countPdfs()`**: Filters the classroom database specifically for documents classified as "Question Papers".
* **`setupUpload()`, `handleFile()`, `syncUploadUI()`**: Initializes drag-and-drop zones, binds click events, and syncs file selection states between mobile and desktop.
* **`startCBTFromUpload()`, `startCBTFromDrive()`**: Dispatches PDF data to the backend for processing, and overwrites the current document with the newly returned CBT HTML interface upon success.
* **`dkRenderSubjects()`, `dkRenderPdfs()`, `mobRenderSubjects()`, `mobRenderPdfs()`**: Functions handling the population of lists and grids for navigating test repositories.
* **`openModeModal()`, `selectMode()`**: Controls a popup allowing users to choose whether to view a file natively, download it, or initiate an AI test conversion.
* **`openCBT()`, `renderCBTPage()`, `cbtPrevPage()`, `cbtNextPage()`, `updateTimerDisplay()`**: Manages a basic client-side PDF viewer utilizing `pdfjsLib` with an attached stopwatch timer.
* **`loadTestHistory()`, `renderHistoryCard()`**: Fetches past exam results from the server and generates historical log cards.
* **`loadLiveTests()`, `liveTestStatus()`, `renderLiveTestCard()`**: Fetches active/upcoming scheduled exams, calculates their state based on system time, and renders the corresponding UI.
* **`openAnalysis()`, `renderAnalysis()`, `switchAnalysisTab()`, `renderAnalysisContent()`**: Coordinates the deep-dive analysis view for a completed exam.
* **`renderAnalysisTab()`, `renderWeaknessesTab()`**: Generates detailed HTML containing correct/incorrect answers, AI explanations, and generated "Weak Topic" cards with study resources.
* **`initCollapsibles()`, `toggleQCard()`**: Initializes accordion-style dropdowns used extensively in the detailed exam analysis interface.
* **`renderMathIn(el)`**: Repeated utility to execute KaTeX math rendering within the analysis UI.
