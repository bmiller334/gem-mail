# Comprehensive Project History & Debugging Log

This document serves as a consolidated history of the **Gem-Mail / Smart Email Organizer** project. It details the architecture decisions, successful configurations, errors encountered, and the final working state. It is designed to be easily referenced by AI models and the user.

---

## 1. Project Overview & Identity

*   **Project Name:** Gem-Mail (Smart Email Organizer)
*   **GCP Project ID:** `gem-mail-480201`
*   **Project Number:** `124652613510`
*   **Goal:** Automatically organize Gmail emails using Google Vertex AI (Gemini) via Google Apps Script.

---

## 2. Architecture & Setup

### Architecture Decision (Success)
*   **Chosen Platform:** Google Apps Script (GAS).
*   **Why:** Simpler authentication than Cloud Functions. GAS runs as the user, bypassing complex IAM Service Account setups for personal Gmail access.
*   **Trigger:** Time-Driven (e.g., every 5 minutes) rather than real-time Pub/Sub hooks.

### GCP Configuration (Success)
*   **APIs Enabled:**
    *   Vertex AI API
    *   Gmail API
*   **OAuth Consent Screen:**
    *   **Type:** External (Required for personal `@gmail.com` accounts).
    *   **Test Users:** None required for the project owner.
*   **Permissions (Scopes):**
    *   `https://www.googleapis.com/auth/gmail.modify` (Read/Label emails)
    *   `https://www.googleapis.com/auth/spreadsheets` (Log to Sheets)
    *   `https://www.googleapis.com/auth/cloud-platform` (Vertex AI access)
    *   `https://www.googleapis.com/auth/script.external_request` (External API calls)

---

## 3. Working Configuration (CRITICAL)

This is the **only** combination of settings that has been proven to work for this project, based on the user's latest findings.

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Region** | `us-west1` | Confirmed by user as the working region for the newer model. |
| **Model ID** | `gemini-2.5-flash` | The newest model version required for this project. Legacy versions (1.5) caused 404s in some contexts. |
| **Payload Role** | `"role": "user"` | **MANDATORY.** Newer models (like 2.5-flash) strictly validate the chat structure. Missing this field causes **400 Invalid Argument**. |

---

## 4. Error Log & Solutions

### Error: `404 Not Found` (Publisher Model ... was not found)
*   **Context:** Occurred when using `gemini-1.5-flash` in regions where it was not provisioned for this project.
*   **Fix:** Updated to the correct model (`gemini-2.5-flash`) and region (`us-west1`) identified by the user.

### Error: `400 Invalid Argument` (Please use a valid role)
*   **Context:** Occurred when switching to `gemini-2.5-flash` without updating the JSON payload.
*   **Cause:** The API expects the prompt to be wrapped in a `contents` array with a defined `role`.
*   **Fix:** Added `"role": "user"` to the payload structure:
    ```json
    "contents": [{
      "role": "user",
      "parts": [{ "text": prompt }]
    }]
    ```

### Error: `ReferenceError: GenerativeLanguage is not defined`
*   **Context:** Occurred when attempting to use the built-in "Advanced Service" for Gemini.
*   **Cause:** The service was either not enabled in the editor or configured incorrectly in the manifest.
*   **Fix:** **Abandoned the built-in service.** Switched to `UrlFetchApp.fetch` to call the Vertex AI REST API directly. This is the robust, industry-standard method used in the final code.

### Error: `TypeError: Cannot read properties of null (reading 'getSheetByName')`
*   **Context:** Occurred when running the script from the editor while using `SpreadsheetApp.getActiveSpreadsheet()`.
*   **Cause:** The script has no "active" sheet when run from the IDE.
*   **Fix:** Implemented a fallback mechanism:
    ```javascript
    try {
      return SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    }
    ```

### Error: `JSON.parse` Failures
*   **Context:** Occurred when Gemini wrapped its JSON response in markdown (e.g., ` ```json ... ``` `).
*   **Fix:** Added a `cleanJsonResponse` helper function to strip markdown tags before parsing.

---

## 5. Deployment & Execution Guide

### How to Run
1.  **Apps Script Editor:** Open the project bound to the Google Sheet.
2.  **Verify ID:** Ensure `SPREADSHEET_ID` is set correctly in `Code.js`.
3.  **Select Function:** Choose `main` from the dropdown.
4.  **Execute:** Click **Run**.

### Automated Triggers
To run automatically:
1.  Go to **Triggers** (clock icon) in the Apps Script editor.
2.  Add a new trigger:
    *   **Function:** `main`
    *   **Event Source:** Time-driven
    *   **Type:** Minutes timer (e.g., Every 5 minutes).

---

## 6. Final Working Code Reference (Snippet)

*See `src/Code.js` for the full implementation.*

```javascript
const LOCATION = "us-west1";
const MODEL_ID = "gemini-2.5-flash";

function callGeminiAPI(emailBody, sheet) {
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;
  
  const requestBody = {
    "contents": [{
      "role": "user", // CRITICAL
      "parts": [{ "text": prompt }]
    }],
    // ...
  };
  // ...
}
```
