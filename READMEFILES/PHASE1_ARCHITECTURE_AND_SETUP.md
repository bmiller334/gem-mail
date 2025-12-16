# Phase 1: Architecture & Setup Guide

## 1. Architecture Recommendation
**We will use Google Apps Script (GAS) linked to a standard Google Cloud Project.**

**Why this solves your past failures:**
*   **Authentication:** GAS runs natively as *you*. You do not need to manage Refresh Tokens, Service Accounts, or complex IAM policies to access your own Gmail. `GmailApp` just works.
*   **Vertex AI Access:** By linking the script to a GCP project, we can call the Gemini API using your user credentials easily.
*   **Simplicity:** No need to deploy Cloud Functions, manage runtimes, or set up Pub/Sub webhooks manually. We will use a "Time-Driven Trigger" (e.g., runs every minute) to check for new emails. This is far more robust for a beginner than setting up real-time push notifications.

## 2. Step-by-Step Setup (Manual Actions Required)

Please follow these steps exactly in your browser.

### Step A: Create the Google Cloud Project
1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Click the project dropdown in the top-left (next to the Google Cloud logo).
3.  Click **"New Project"**.
4.  **Project Name:** `smart-email-organizer-v3` (or similar).
5.  **Organization:** Select "No organization" (if personal).
6.  Click **Create**.
7.  **Important:** Wait for the notification saying it's created, then click **"Select Project"** to ensure you are currently viewing the new project.

### Step B: Enable Required APIs
1.  In the search bar at the top, type **"Vertex AI API"**.
2.  Select "Vertex AI API" from the Marketplace results.
3.  Click **Enable**. (This may take a minute and might ask for billing confirmation. Vertex AI requires a billing account attached, though it has a free tier).
4.  Once enabled, go back to the search bar and type **"Gmail API"**.
5.  Click **Enable**.

### Step C: Configure OAuth Consent Screen
*Even though we are running this privately, GCP requires this setup.*

1.  In the left sidebar menu, go to **APIs & Services** > **OAuth consent screen**.
2.  **User Type:** Select **External**. (Why? "Internal" is only for Google Workspace organizations. Since you are a personal `@gmail.com` user, you must choose External).
3.  Click **Create**.
4.  **App Information:**
    *   **App name:** `Email Organizer`
    *   **User support email:** Select your email.
    *   **Developer contact information:** Enter your email.
5.  Click **Save and Continue**.
6.  **Scopes:** Click **Add or Remove Scopes**.
    *   Search for `vertex` and select `.../auth/cloud-platform` (or similar Vertex AI scopes).
    *   Search for `gmail` and select `.../auth/gmail.modify` (allows reading and adding labels).
    *   Click **Update**, then **Save and Continue**.
7.  **Test Users:**
    *   Click **Add Users**.
    *   Enter **your specific Gmail address**.
    *   Click **Add**, then **Save and Continue**.
8.  Review and click **Back to Dashboard**.

### Step D: Get the Project Number
1.  On the dashboard (main page of your project), look for the card "Project Info".
2.  Note down the **Project Number** (e.g., `123456789012`). We will need this to link the script later.

---

**Once you have completed these steps, please let me know. We will then proceed to Phase 2: Creating the Script.**
