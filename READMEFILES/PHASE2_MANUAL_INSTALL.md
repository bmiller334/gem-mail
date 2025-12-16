# Manual Installation Guide

Since `clasp` login is blocked by the cloud environment, we will manually copy the code to Google Apps Script. This is a one-time setup.

## Step 1: Enable Manifest File
1.  Go to your project at [script.google.com](https://script.google.com).
2.  Click the **Project Settings** (gear icon) in the left sidebar.
3.  Check the box **"Show 'appsscript.json' manifest file in editor"**.

## Step 2: Update `appsscript.json`
1.  Go back to the **Editor** (code icon `< >`).
2.  Click on the file named `appsscript.json` (it should now be visible).
3.  **Replace** its entire content with the JSON below. This enables the necessary permissions for Gmail and Vertex AI.

```json
{
  "timeZone": "America/New_York",
  "dependencies": {
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

## Step 3: Update `Code.gs`
1.  Click on `Code.gs`.
2.  **Replace** its entire content with the code below.
3.  **IMPORTANT:** Look at line 2: `const PROJECT_ID = '...';`
    *   This MUST match the Project ID where you enabled the "Vertex AI API".
    *   If you see `gem-mail-480201` in your error, ensure that is actually the project where you enabled the API. If you created a NEW project, use that ID instead.

```javascript
// CONFIGURATION
const PROJECT_ID = 'smart-email-organizer-v3'; // <--- VERIFY THIS matches your GCP Project ID
const LOCATION = 'us-central1';
const MODEL_ID = 'gemini-1.5-flash'; // Updated to the latest stable model

/**
 * Main function to be triggered by Time-Driven Trigger.
 */
function processNewEmails() {
  // 1. Search for unread emails in Inbox that haven't been organized yet
  // Adjust the query as needed.
  const query = 'label:inbox is:unread -label:Organized'; 
  const threads = GmailApp.search(query, 0, 10); // Process max 10 at a time to stay within limits

  Logger.log(`Found ${threads.length} threads to process.`);

  if (threads.length === 0) return;

  // 2. Iterate through threads
  for (const thread of threads) {
    const messages = thread.getMessages();
    const firstMessage = messages[0]; // Analyze the first message context
    const subject = firstMessage.getSubject();
    const body = firstMessage.getPlainBody().substring(0, 5000); // Truncate to save tokens

    // 3. Call Vertex AI to categorize
    try {
      const category = callGeminiAPI(subject, body);
      Logger.log(`Categorized "${subject}" as: ${category}`);

      // 4. Apply Label
      applyLabel(thread, category);

      // 5. Mark as processed (add 'Organized' label) so we don't loop forever
      // You might also want to markAsRead() or archive() depending on preference.
      const organizedLabel = GmailApp.createLabel('Organized');
      thread.addLabel(organizedLabel);
      
    } catch (e) {
      Logger.log(`Error processing thread "${subject}": ${e.toString()}`);
    }
  }
}

/**
 * Calls the Vertex AI Gemini API using the built-in ScriptApp token.
 */
function callGeminiAPI(subject, body) {
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;

  const prompt = `
    You are an intelligent email assistant. Categorize the following email into exactly one of these categories:
    - "Finance" (bills, receipts, banks)
    - "Social" (friends, family, events)
    - "Promotions" (marketing, newsletters, deals)
    - "Updates" (software updates, notifications)
    - "Work" (business, professional)
    - "Other" (anything else)

    Return ONLY the category name. Do not explain.

    Subject: ${subject}
    Body: ${body}
  `;

  const payload = {
    "contents": [{
      "role": "user",
      "parts": [{ "text": prompt }]
    }],
    "generationConfig": {
      "temperature": 0.2,
      "maxOutputTokens": 20
    }
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new Error(`Vertex AI API failed (${responseCode}): ${responseText}`);
  }

  const json = JSON.parse(responseText);
  
  // Extract text from Gemini response structure
  if (json.candidates && json.candidates[0] && json.candidates[0].content) {
     const text = json.candidates[0].content.parts[0].text;
     return text.trim();
  }
  
  return "Other";
}

/**
 * Helper to create/retrieve label and apply it.
 */
function applyLabel(thread, categoryName) {
  // Sanitize category name
  const safeCategory = categoryName.replace(/[^a-zA-Z0-9]/g, '');
  const labelName = `AI-${safeCategory}`; // E.g., "AI-Finance"
  
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }
  
  thread.addLabel(label);
}
```

## Step 4: Run and Authorize
1.  In the toolbar, select `processNewEmails` from the dropdown.
2.  Click **Run**.
3.  **Authorization:** You will see a pop-up "Authorization Required".
    *   Click "Review Permissions".
    *   Choose your account.
    *   You might see "Google hasn't verified this app" (because it's new). Click **Advanced** > **Go to Smart Email Organizer (unsafe)**.
    *   Click **Allow**.

## Step 5: Check Logs
1.  If successful, the Execution Log at the bottom will show "Found X threads..." or "Categorized...".
2.  Check your Gmail! You should see new labels like `AI-Finance` or `AI-Promotions` appearing on your unread emails.

## Step 6: Automate (Triggers)
1.  Click the **Triggers** icon (clock) on the left sidebar.
2.  Click **Add Trigger**.
    *   Function: `processNewEmails`
    *   Event source: `Time-driven`
    *   Type of time based trigger: `Minutes timer`
    *   Interval: `Every minute` (or Every 5 minutes)
3.  Click **Save**.

**You are done! Your inbox is now AI-powered.**
