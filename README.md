# Project Documentation

## Project Overview
The project is a comprehensive educational and academic management platform built with a Python backend. It integrates standard learning management features with advanced AI capabilities, Google Drive synchronization, and blockchain-based integrity verification.

## File Structure & Descriptions
Below is a breakdown of what the key files in the project directory do:

* **`app.py`**: The main Flask application file. It handles all HTTP routing, user authentication, session management, and serves as the central controller connecting the frontend to the backend plugins and database.
* **`requirements.txt`**: Lists all the Python packages and dependencies required to run the server, including Flask, PyMongo, Web3, and the Google GenAI SDK.
* **`README.md`**: The standard markdown file for project introduction (currently acts as a placeholder titled "# tiramisu").
* **`plugins/database.py`**: Contains the `Users` and `CollegeEvents` classes, managing MongoDB queries for user profiles, scheduling, and general data persistence.
* **`plugins/email.py`**: Handles SMTP integrations to send One-Time Passwords (OTPs) for user registration and account deletion verification.
* **`plugins/pdf_to_cbt.py`**: Contains the core parsing logic to read uploaded PDF files and convert their contents into structured Computer-Based Test (CBT) data.
* **`plugins/little.py`**: A utility module that houses AI-specific helper functions, such as sending prompts to the Gemini API, evaluating test answers, and extracting images or flashcards from documents.
* **`plugins/live_tests_db.py`**: Manages the database operations specifically for the live examination system, including test creation, recording student attempts, and logging anti-cheat events.
* **`plugins/blockchain.py`**: Handles Web3 interactions, generating cryptographic hashes for exam content and student submissions, and storing them on-chain for integrity verification.
* **`config.env`**: An environment configuration file that securely stores sensitive keys, such as the `DATABASE_URL`, `SECRET_KEY`, and `GEMINI_API_KEY`.
* **`google_token.json`**: A JSON file used to persist global OAuth credentials, allowing the application to authenticate and fetch user documents directly from Google Drive.

## Core Technologies
* The application is a web server built using the Flask framework.
* It utilizes PyMongo to interact with a MongoDB database for data persistence.
* The project relies on the Google GenAI SDK to communicate with Gemini models.
* It uses Web3 for blockchain interactions.
* PDF processing and image extraction are handled using PyMuPDF and Pillow.

## Key Features

### Authentication & User Management
* Users can sign up, log in, and verify their accounts using an email-based One-Time Password (OTP) system.
* User passwords are securely hashed using `werkzeug.security` before being stored in the database.
* The system programmatically generates a default pixel-art avatar based on the user's username.
* Users have the ability to securely delete their accounts via an OTP confirmation flow.

### AI-Powered Study Tools
* The application can parse uploaded PDF documents and convert them into interactive Computer-Based Tests (CBT).
* It can automatically generate study flashcards from provided PDF files.
* A "Kindle Mode" extracts structured content and diagram regions from academic documents to facilitate easier reading.
* The platform can dynamically generate customized, non-linear learning roadmaps based on a user's chosen speciality.

### Live Examinations & Anti-Cheat
* Administrators can create timed live tests configured with specific start times, scheduling windows, and negative marking rules.
* The system tracks user attempts in real-time, auto-grades the submissions, and calculates detailed score analytics.
* Anti-cheat mechanisms actively log anomalous client events, such as exiting fullscreen mode or switching browser tabs.
* Severe anti-cheat violations trigger an automatic termination of the user's exam session.
* Cryptographic hashes of both the original test content and the final student submissions are stored on a blockchain to guarantee academic integrity.

### Academic Organization
* Users can upload images or PDFs of their class schedules, which the AI automatically parses into structured timetables categorized by subject and group.
* The platform includes an attendance tracker that records per-subject metrics, noting whether a user was present, absent, or if a class was cancelled.
* Administrators can upload institutional academic calendars, allowing the AI to automatically extract official events, holidays, and deadlines.

### Google Drive Integration
* The platform implements an OAuth flow allowing users to authenticate with their Google accounts.
* Users can directly import PDF files from Google Drive to generate tests, flashcards, or access reading modes.
* The system caches the AI-generated results for specific Google Drive files to optimize performance and reduce redundant API calls.


# Tech Stack & Dependencies Documentation

This document outlines the complete technology stack and dependencies used to build the Shingaku platform. It is categorized by architectural layers for clarity.

## 1. Frontend Technologies
The frontend is built as a dynamic, responsive Web App using standard web technologies, integrated tightly with Flask's templating engine.

* **Core Languages:** HTML5, CSS3, JavaScript (ES6+)
* **Templating:** Jinja2 (served via Flask)
* **Styling Architecture:** Custom CSS using CSS Variables (`:root`), CSS Grid, and Flexbox for responsive, modular design (Dark/Light mode themes) without the use of preprocessors.
* **Frontend APIs & Features:**
  * **Canvas API:** Used for procedural pixel-avatar generation and client-side PDF rendering.
  * **Web Audio API:** Used for Pomodoro timer alarms and UI interaction sounds.
  * **BroadcastChannel API:** Used for synchronizing the Pomodoro timer across multiple browser tabs.
* **External Frontend Libraries:**
  * **Three.js:** Used for rendering the interactive 3D WebGL animations (e.g., the Hogyoku on the homepage).
  * **KaTeX:** Used for fast, client-side rendering of LaTeX mathematical formulas in flashcards and reading modes.
  * **PDF.js:** Used for natively rendering PDF documents within the Computer-Based Test (CBT) interface.

## 2. Backend Technologies
The backend is a monolithic Python server that handles API routing, authentication, file processing, and database interactions.

* **Core Language:** Python 3.x
* **Web Framework:** Flask
  * `flask[async]`: Enables asynchronous route handling.
  * `flask_cors`: Manages Cross-Origin Resource Sharing (CORS) headers.
  * `flask_login`: Manages user session state and authentication.
* **WSGI HTTP Server:** Gunicorn (for production deployment)
* **Environment Management:** `python-dotenv` (listed as `dotenv`) for loading secrets from the `config.env` file.

## 3. Database & Storage
* **Primary Database:** MongoDB
* **Database Driver:** `pymongo` (used for all CRUD operations on user profiles, schedules, test history, etc.).

## 4. AI & Cloud Integrations
* **Generative AI:** Google Gemini API
  * `google-genai`: The official SDK used to interface with Gemini models for generating CBTs, flashcards, schedules, and learning roadmaps.
* **Google Cloud / OAuth Integration:**
  * `google-auth` & `google-auth-oauthlib`: Manages OAuth 2.0 user authentication flows.
  * `google-api-python-client`: Interfaces with Google Drive to fetch user documents seamlessly.
* **HTTP Client:** `requests` (used for external API communications).

## 5. Document & Image Processing
The platform performs heavy server-side extraction of PDFs and images to feed structured data to the AI.

* **PDF Processing:** `PyMuPDF` (used for fast PDF reading, page extraction, and text parsing).
* **Image Processing:** `Pillow` (Python Imaging Library, used for manipulating uploaded schedules and extracted diagrams).
* **Computer Vision & Math:** `opencv-python` and `numpy` (used for advanced image manipulation, array handling, and potentially for proctoring/anti-cheat computer vision features).

## 6. Web3 & Blockchain Integration
* **Blockchain Interaction:** `web3` (Web3.py is used to interact with Ethereum-compatible blockchains, generating cryptographic hashes of exam questions and student submissions to ensure tamper-proof academic integrity).
