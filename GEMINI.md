I am starting a new project to build a "Smart Email Organizer" for my personal Gmail account. This is my third attempt at this project. My previous two attempts failed specifically because of complex permissions errors within Google Cloud Platform (GCP) that I could not resolve.

**My technical level:** I am a beginner programmer. I am new to the Google Cloud Platform console. I need you to act as a senior mentor and walk me through every manual step in the GCP console, assuming I do not know where buttons or settings are located.

**GC Project Details**
* Project name: Gem-Mail
* Project number: 124652613510
* Project ID :gem-mail-480201

**Project Goal:**
I want to create a Google Apps Script or a Google Cloud Function that:
1.  Triggers when a new email arrives in my Gmail.
2.  Sends the email content to the Gemini API (Vertex AI) to categorize it.
3.  Applies a label to the email in Gmail based on that category.

**Analysis of Past Failures (Context from my previous repos):**
I have uploaded code from my previous failed attempts (`gemail-service` and `mail-organizer`). Here is what went wrong, which I need you to help me avoid this time:
1.  **OAuth2/Token Issues:** I struggled with `OAuth2.js` and manually handling refresh tokens (seen in `getRefreshToken.js`). The authentication flow between Cloud Functions, Pub/Sub, and Gmail API was too complex.
2.  **Service Account vs. User Permissions:** My `cloudFunction/index.js` tried to use `google.auth.getClient` with specific scopes, but I kept hitting "400" or "403" errors regarding permissions or `historyId` access.
3.  **Environment Variables:** I had trouble correctly setting up `.env` variables and making sure the running code could access them safely.
4.  **Vertex AI Integration:** My previous code (`gemini-service.js`) attempted to use the `@google-cloud/vertexai` SDK, but I am unsure if I enabled the correct APIs or set up the IAM roles correctly for the service account to call Vertex AI.

**The Plan for Attempt #3:**
Please guide me through building this from scratch using the *simplest, most robust architecture possible* for a personal user.

**Phase 1: Architecture & Pre-requisites**
* Recommend the best architecture: Should I use a standalone Google Apps Script (bound to the account) to avoid complex Cloud Function IAM roles, or is Cloud Functions still better?
* List every single API I need to enable in the Google Cloud Console.
* Tell me exactly how to configure the OAuth Consent Screen (External vs. Internal for personal use).

**Phase 2: Step-by-Step Implementation**
* Start with setting up the GCP project and enabling APIs.
* Then, move to authentication.

**Phase 3: Deployment & Permissions**
* This is where I failed before. When we deploy, give me the exact `gcloud` commands or Console clicks to ensure the Service Account has `Service Account Token Creator`, `Vertex AI User`, and `Gmail API` access.

