# Comprehensive Project History & Debugging Log

This document serves as a consolidated history of the **Gem-Mail / Smart Email Organizer** project. It details the architecture decisions, successful configurations, errors encountered, and the final working state. It is designed to be easily referenced by AI models and the user.

---

## 1. Project Overview & Identity

*   **Project Name:** Gem-Mail (Smart Email Organizer)
*   **GCP Project ID:** `gem-mail-480201`
*   **Project Number:** `124652613510`
*   **Goal:** Automatically organize Gmail emails using Google Vertex AI (Gemini) via Google Apps Script, and visualize analytics on a React dashboard.

---

## 2. Architecture & Setup

### Architecture Decision (Success)
*   **Backend Logic:** Google Apps Script (GAS).
    *   **Why:** Simpler authentication than Cloud Functions. GAS runs as the user, bypassing complex IAM Service Account setups for personal Gmail access.
*   **Database:** Google Cloud Firestore (NoSQL).
    *   **Why:** Real-time listeners for the frontend, scalable storage for logs and stats.
*   **Frontend:** React (Vite) + Tailwind CSS + Recharts.
    *   **Hosting:** Firebase Hosting.
    *   **Theme:** 1980's Vaporwave (Cyan/Fuchsia/Yellow on Dark Navy).
*   **Trigger:** Time-Driven (e.g., every 5 minutes) via GAS Triggers.

### GCP Configuration (Success)
*   **APIs Enabled:**
    *   Vertex AI API
    *   Gmail API
    *   Cloud Firestore API
*   **OAuth Consent Screen:**
    *   **Type:** External (Required for personal `@gmail.com` accounts).
*   **Permissions (Scopes):**
    *   `https://www.googleapis.com/auth/gmail.modify` (Read/Label emails)
    *   `https://www.googleapis.com/auth/cloud-platform` (Vertex AI access)
    *   `https://www.googleapis.com/auth/datastore` (Firestore read/write)
    *   `https://www.googleapis.com/auth/script.external_request` (External API calls)

---

## 3. Working Configuration (CRITICAL)

This is the **only** combination of settings that has been proven to work for this project, based on the user's latest findings.

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Region** | `us-west1` | Confirmed by user as the working region for the newer model. |
| **Model ID** | `gemini-2.5-flash` | The newest model version required for this project. |
| **Payload Role** | `"role": "user"` | **MANDATORY.** Newer models (like 2.5-flash) strictly validate the chat structure. |
| **Database** | Firestore (Native) | Used for logging processing results and stats. |

---

## 4. Evolution & Major Pivots

### Pivot 1: From Google Sheets to Firestore
*   **Initial State:** Logs were written to a Google Sheet (`Logs` tab). Dashboard was a Sheet tab.
*   **Problem:** Sheets are not suitable for real-time web dashboards; querying is slow and data structure is rigid.
*   **Solution:** Migrated logging to Firestore (`email_logs` collection). Created a dedicated `email_stats` collection for aggregated metrics (Inbox Pending, Total Unread).
*   **Outcome:** Enabled a real-time, responsive React web app.

### Pivot 2: UI Overhaul (Vaporwave)
*   **Initial State:** Standard "Business SaaS" look (White/Slate).
*   **Request:** "1980's Vaporwave vibe".
*   **Implementation:**
    *   Background: Deep Navy (`#0b0c2a`) with a retro grid perspective animation.
    *   Colors: Cyan (`#22d3ee`), Fuchsia (`#d946ef`), Yellow (`#facc15`).
    *   Typography: Monospace fonts, italicized headers, "scanline" hover effects.

---

## 5. Error Log & Solutions

### Error: `FirebaseError: [code=permission-denied]`
*   **Context:** Web dashboard failed to load data.
*   **Cause:** Firestore security rules were defaulting to "deny all".
*   **Fix:** Updated `firestore.rules` to allow read/write for development (`allow read, write: if true;`). *Note: Should be locked down for production.*

### Error: `409 Conflict` (Firestore Create)
*   **Context:** Occurred when trying to overwrite the "current" stats document using `createDocument`.
*   **Fix:** Implemented a fallback in Apps Script: `if (response code === 409) -> call updateFirestoreDocument (PATCH)`.

### Error: `404 Not Found` (Publisher Model)
*   **Context:** Occurred when using `gemini-1.5-flash`.
*   **Fix:** Updated to `gemini-2.5-flash` in `us-west1`.

### Error: `400 Invalid Argument` (Role)
*   **Context:** API rejected prompts without a role.
*   **Fix:** Enforced `{"role": "user"}` in the JSON payload.

---

## 6. Current Functionality

### Backend (Apps Script)
1.  **Scans Gmail:** Finds unread emails without the `GeminiProcessed` label.
2.  **Calls Vertex AI:** Sends body to Gemini 2.5 Flash.
3.  **Logs to Firestore:** Writes rich metadata (Sender, Subject, AI Confidence, Urgency, Category) to `email_logs`.
4.  **Updates Stats:** Calculates Pending/Processed/Total counts and updates `email_stats/current`.
5.  **Labels Email:** Applies the AI-selected label in Gmail.
6.  **Leaves Unread:** As per user request, emails are **not** marked as read.

### Frontend (React Web App)
1.  **Live Feed:** Real-time stream of processed emails with urgency color-coding.
2.  **Stats:** Live counters for "Inbox Pending", "Sorted (Unread)", and "Total Volume".
3.  **Visuals:** Confidence score, processing velocity, label distribution chart.
4.  **Feedback:** Thumbs Up/Down buttons that update the Firestore document (for future reinforcement learning).

---

## 7. Future Roadmap

1.  **Reinforcement Learning:** Use the collected "Thumbs Up/Down" data to feed "Few-Shot" examples back into the Gemini prompt to improve accuracy over time.
2.  **Remote Trigger:** Expose the Apps Script as a Web App to allow the "Initialize" button on the dashboard to actually run the script.
