# PHASE 3: The "Region" Fix

Your metrics are super helpful. They show that **Gmail API calls are succeeding (200)** (finding the emails), but **Vertex AI calls are failing (404)**.

Since you have Billing and the API enabled, the 404 error typically means **your project was provisioned in a different region**, or `us-central1` is behaving weirdly for your specific account.

## The Fix: Change Region & Model Version

We are going to make two changes to the code:
1.  **Region:** Switch from `us-central1` to `us-east1`.
2.  **Model:** Use the explicit version `gemini-1.5-flash-001`.

### Updated Code.gs
Please copy this **entire** block and replace your current `Code.gs`.

```javascript
// CONFIGURATION
const PROJECT_ID = 'gem-mail-480201'; 
const LOCATION = 'us-east1'; // <--- CHANGED REGION
const MODEL_ID = 'gemini-1.5-flash-001'; // <--- EXPLICIT VERSION

/**
 * Main function to be triggered by Time-Driven Trigger.
 */
function processNewEmails() {
  const query = 'label:inbox is:unread -label:Organized'; 
  const threads = GmailApp.search(query, 0, 10); 

  Logger.log(`Found ${threads.length} threads to process.`);

  if (threads.length === 0) return;

  for (const thread of threads) {
    const messages = thread.getMessages();
    const firstMessage = messages[0]; 
    const subject = firstMessage.getSubject();
    const body = firstMessage.getPlainBody().substring(0, 5000); 

    try {
      const category = callGeminiAPI(subject, body);
      Logger.log(`Categorized "${subject}" as: ${category}`);
      applyLabel(thread, category);

      const organizedLabel = GmailApp.createLabel('Organized');
      thread.addLabel(organizedLabel);
      
    } catch (e) {
      Logger.log(`Error processing thread "${subject}": ${e.toString()}`);
    }
  }
}

function callGeminiAPI(subject, body) {
  // Note: Using 'us-east1' in the URL now
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
  
  if (json.candidates && json.candidates[0] && json.candidates[0].content) {
     const text = json.candidates[0].content.parts[0].text;
     return text.trim();
  }
  
  return "Other";
}

function applyLabel(thread, categoryName) {
  const safeCategory = categoryName.replace(/[^a-zA-Z0-9]/g, '');
  const labelName = `AI-${safeCategory}`; 
  
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }
  
  thread.addLabel(label);
}
```

### Try Running It
1.  Paste the code.
2.  Save.
3.  Run `processNewEmails`.

If `us-east1` also fails with 404, please try `us-west1`.

## The Working Code(By The User)
Here is the working code that I, the user, corrected. The Gemini models you were trying are outdated. I updated with gemini-2.5-flash. 

```javascript
// CONFIGURATION
const PROJECT_ID = 'gem-mail-480201'; 
const LOCATION = 'us-west1'; // <--- CHANGED REGION
const MODEL_ID = 'gemini-2.5-flash'; // <--- EXPLICIT VERSION

/**
 * Main function to be triggered by Time-Driven Trigger.
 */
function processNewEmails() {
  const query = 'label:inbox is:unread -label:Organized'; 
  const threads = GmailApp.search(query, 0, 10); 

  Logger.log(`Found ${threads.length} threads to process.`);

  if (threads.length === 0) return;

  for (const thread of threads) {
    const messages = thread.getMessages();
    const firstMessage = messages[0]; 
    const subject = firstMessage.getSubject();
    const body = firstMessage.getPlainBody().substring(0, 5000); 

    try {
      const category = callGeminiAPI(subject, body);
      Logger.log(`Categorized "${subject}" as: ${category}`);
      applyLabel(thread, category);

      const organizedLabel = GmailApp.createLabel('Organized');
      thread.addLabel(organizedLabel);
      
    } catch (e) {
      Logger.log(`Error processing thread "${subject}": ${e.toString()}`);
    }
  }
}

function callGeminiAPI(subject, body) {
  // Note: Using 'us-east1' in the URL now
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
  
  if (json.candidates && json.candidates[0] && json.candidates[0].content) {
     const text = json.candidates[0].content.parts[0].text;
     return text.trim();
  }
  
  return "Other";
}

function applyLabel(thread, categoryName) {
  const safeCategory = categoryName.replace(/[^a-zA-Z0-9]/g, '');
  const labelName = `AI-${safeCategory}`; 
  
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }
  
  thread.addLabel(label);
}
```
