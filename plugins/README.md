# Backend Plugins Documentation

This document outlines the architecture and specific functions of the backend Python files located in the `plugins/` directory. These files act as modular helpers managing databases, AI integrations, blockchain transactions, and utilities.

## 1. `plugins/blockchain.py`
Handles Ethereum/Web3 interactions to ensure academic integrity by storing and verifying cryptographic hashes of test materials and submissions.

* **`_get_web3()`**: Initializes and returns a Web3 provider instance using the configured `BLOCKCHAIN_RPC` URL.
* **`_get_contract(w3)`**: Initializes the smart contract object using the defined ABI and `BLOCKCHAIN_CONTRACT_ADDRESS`.
* **`generate_hash(data)`**: Serializes a dictionary or string into bytes and generates a SHA-256 hex digest.
* **`store_hash_on_chain(data_hash)`**: Builds, signs, and sends a transaction to store a data hash on the blockchain. Returns the transaction hex.
* **`verify_hash_on_chain(data_hash)`**: Calls the smart contract's `verifyHash` function to check if a specific hash exists on-chain.
* **`verify_integrity(stored_hash, current_data)`**: Compares a newly generated hash of the current data against the stored hash and cross-verifies it with the blockchain to detect tampering.

## 2. `plugins/database.py`
A wrapper around PyMongo, abstracting MongoDB queries into distinct classes for Users and College Events.

### Class: `Users`
* **Authentication & Profile**:
  * `check_username(username)`, `check_email(email)`: Checks if identifiers exist in the database.
  * `add_user(...)`, `get_user(...)`, `get_user_by_username(...)`, `delete_user(...)`: Standard CRUD operations for user accounts.
  * `update_name(...)`, `update_bio(...)`, `update_password(...)`, `update_avatar(...)`: Functions to modify specific user profile fields.
* **Settings & Preferences**:
  * `set_exam_notification(...)`, `set_clan_notifications(...)`, `set_todo_time_notifications(...)`: Updates specific boolean and time preferences for user notifications.
  * `get_wake_me_up_data(...)`, `get_wake_me_up_settings(...)`, `set_wake_me_up_data(...)`: Manages configurations for the "Wake Me Up" alarm utility.
* **Academics & Analytics**:
  * `save_test_result(...)`, `get_test_history(...)`, `delete_test_result(...)`: Manages the array of completed CBT attempts in the user's document.
  * `save_user_schedule(...)`, `get_user_schedule(...)`, `save_user_group(...)`: Manages the user's parsed class timetable and selected student section/group.
  * `save_calendar_day(...)`, `get_calendar_day(...)`: Saves and retrieves daily modifications like tasks and attendance states.

### Class: `CollegeEvents`
* `set_events(events)`: Replaces the entire global event list (holidays, exams).
* `get_events()`: Retrieves the global event dictionary.
* `add_events(new_events)`: Admin utility to merge new institutional events with existing ones.

## 3. `plugins/devtools.py`
A utility module containing regular expressions for server-side form validation.

* **`is_strong_password(password)`**: Ensures passwords contain uppercase, lowercase, numbers, special characters, and are 8-64 characters long.
* **`check_username(username)`**: Validates usernames (alphanumeric, underscores, 3-20 characters, starting with a letter).
* **`check_email(email)`**: Validates that emails strictly match the institutional format (`@nith.ac.in`) with specific branch codes.

## 4. `plugins/email.py`
Handles SMTP transactions for sending secure HTML emails.

* **`send_email(EMAIL, APP_PASSWORD, receiver_email)`**: Generates a 6-digit OTP, interpolates it into an HTML template, and sends a registration/login authorization email.
* **`send_delete_email(EMAIL, APP_PASSWORD, receiver_email)`**: Sends a distinct, red-themed warning email with an OTP specifically required for irreversible account deletion.

## 5. `plugins/little.py`
The core AI and document processing engine. It utilizes `PyMuPDF` (`fitz`) and the Google GenAI SDK.

### Image & PDF Utilities
* **`_normalize_bbox(bbox)`**: Cleans, pads, and normalizes AI-generated bounding boxes from a 0-1000 scale.
* **`_bbox_to_clip(...)`**: Converts normalized coordinates to absolute PDF points (`fitz.Rect`).
* **`_adaptive_dpi(clip_rect)`**: Adjusts extraction resolution based on crop size to maintain quality while preventing memory blowouts.
* **`_get_native_image_rects(page)`**, **`_rects_overlap(...)`**: Helpers to identify natively embedded images within the PDF.
* **`extract_images_from_pdf(...)`**: Rips images from a PDF using Gemini's predicted coordinates, while utilizing a hybrid fallback to find native images the AI might have missed.
* **`extract_kindle_diagrams(...)`**: Extracts diagrams specific to the "Kindle Mode" output and converts them into base64 data URIs.

### Gemini API Functions
* **`send_pdf_to_gemini(pdf_path, prompt_text)`**: Generic function to push a PDF byte stream to Gemini 3.1 Pro with exponential backoff retries.
* **`evaluate_answers(exam_data, user_answers, pdf_path)`**: Feeds the exam schema and student answers into Gemini to generate scores, feedback, ranks, and YouTube playlist suggestions for weak topics.
* **`generate_flashcards_from_pdf(pdf_path)`**: Prompts Gemini to parse a PDF into structured JSON flashcards complete with LaTeX math, emojis, difficulty levels, and mnemonics.
* **`extract_kindle_content(pdf_path)`**: Instructs Gemini to reformat academic PDFs into structured digital reading chapters, identifying headings, paragraphs, and lists.

## 6. `plugins/live_tests_db.py`
Database models specifically handling the synchronized live examination system.

### Class: `LiveTests`
* **`create_test(test_data)`**: Inserts a new exam into the database and generates a `content_hash` of its questions.
* **`get_available_tests(...)`**: Queries tests whose scheduling window is currently active.
* **`store_blockchain_hash(...)`**, **`update_status(...)`**, **`get_test(...)`**: Update and retrieval methods for exam objects.

### Class: `Attempts`
* **`start_attempt(student_id, test_id)`**: Initializes an `in_progress` test session log for a student.
* **`submit_answers(...)`**: Calculates a `submission_hash`, sets status to `submitted`, and records the final score.
* **`mark_cheating(...)`**: Prematurely terminates an attempt, sets score to 0, and records the reason for the anti-cheat violation.

### Class: `EventLogs`
* **`log_event(...)`**: Records discrete client events (e.g., exiting fullscreen) during a live exam to aid in anti-cheat auditing.

## 7. `plugins/pdf_to_cbt.py`
A high-level orchestration file connecting the file upload process to the AI engines.

* **`pdf_to_cbt(pdf_file)`**: 
  1. Creates a temporary directory.
  2. Saves the uploaded `pdf_file`.
  3. Calls `send_pdf_to_gemini` to extract exam JSON.
  4. Calls `extract_images_from_pdf` to rip corresponding diagrams into the temp folder.
  5. Returns a dictionary containing the extracted data and file paths for frontend rendering.
