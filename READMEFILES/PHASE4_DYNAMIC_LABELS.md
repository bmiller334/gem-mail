# PHASE 4: Dynamic Categories (Using Your Labels)

You want the script to be smart enough to use **your existing Gmail labels** instead of a hardcoded list. This makes the system truly personalized.

## How it works now
1.  The script fetches all your User Labels from Gmail.
2.  It sends that list to Gemini.
3.  It asks Gemini: "Which of these labels fits this email?"
4.  It applies the chosen label directly (no more "AI-" prefix).

## Updated Code
Replace your **entire** `Code.gs` with this version.

```javascript
// CONFIGURATION
const PROJECT_ID = 'gem-mail-480201'; 
const LOCATION = 'us-west1'; 
const MODEL_ID = 'gemini-2.5-flash'; 

/**
 * Main function to be triggered by Time-Driven Trigger.
 */
function processNewEmails() {
  // 1. Fetch existing user labels to serve as categories
  const labelNames = getAvailableLabels();
  
  if (labelNames.length === 0) {
    Logger.log("No user labels found! Please create some labels (e.g., 'Finance', 'Work') in Gmail first.");
    return;
  }

  // 2. Search for unread emails in Inbox that haven't been organized yet
  const query = 'label:inbox is:unread -label:Organized'; 
  const threads = GmailApp.search(query, 0, 10); 

  Logger.log(`Found ${threads.length} threads. Using labels: ${labelNames.join(', ')}`);

  if (threads.length === 0) return;

  for (const thread of threads) {
    const messages = thread.getMessages();
    const firstMessage = messages[0]; 
    const subject = firstMessage.getSubject();
    const body = firstMessage.getPlainBody().substring(0, 5000); 

    try {
      // Pass the dynamic label list to the API
      const category = callGeminiAPI(subject, body, labelNames);
      Logger.log(`Categorized "${subject}" as: ${category}`);
      
      // Apply the label directly
      applyLabel(thread, category);

      // Mark as processed
      const organizedLabel = GmailApp.getUserLabelByName('Organized') || GmailApp.createLabel('Organized');
      thread.addLabel(organizedLabel);
      
    } catch (e) {
      Logger.log(`Error processing thread "${subject}": ${e.toString()}`);
    }
  }
}

/**
 * Helper to get user labels, excluding 'Organized' and system labels.
 */
function getAvailableLabels() {
  const labels = GmailApp.getUserLabels();
  const names = [];
  
  for (const label of labels) {
    const name = label.getName();
    // Exclude the tracking label and any internal ones you might want to skip
    if (name !== 'Organized' && !name.startsWith('AI-Old-')) { 
      names.push(name);
    }
  }
  return names;
}

function callGeminiAPI(subject, body, labelNames) {
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;

  // Dynamically build the category list for the prompt
  const categoriesList = labelNames.map(name => `- "${name}"`).join('\n');

  const prompt = `
    You are an intelligent email assistant. 
    Analyze the email below and choose the BEST matching label from the following list.
    
    AVAILABLE LABELS:
    ${categoriesList}
    - "Other" (if nothing fits well)

    Return ONLY the label name. Do not explain.

    Subject: ${subject}
    Body: ${body}
  `;

  const payload = {
    "contents": [{
      "role": "user",
      "parts": [{ "text": prompt }]
    }],
    "safetySettings": [
        { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH" },
        { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH" },
        { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH" },
        { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH" }
    ],
    "generationConfig": {
      "temperature": 0.2,
      "maxOutputTokens": 50 // Increased slightly to handle longer label names
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
  
  if (!json.candidates || json.candidates.length === 0) {
     Logger.log(`Warning: Gemini returned no candidates. Returning 'Other'.`);
     return "Other"; 
  }

  if (json.candidates[0].content && json.candidates[0].content.parts) {
     let text = json.candidates[0].content.parts[0].text.trim();
     // Remove quotes if Gemini added them
     text = text.replace(/^"|"$/g, '');
     return text;
  }
  
  return "Other";
}

function applyLabel(thread, labelName) {
  if (labelName === "Other") return; // Skip if no label matched

  // Try to find the existing label
  const label = GmailApp.getUserLabelByName(labelName);
  
  if (label) {
    thread.addLabel(label);
  } else {
    Logger.log(`Warning: Label "${labelName}" returned by AI but not found in Gmail.`);
  }
}
```
