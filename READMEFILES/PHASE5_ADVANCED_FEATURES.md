# PHASE 5: Advanced Features & Quota Safety

You are absolutely right to be concerned about limits. I apologize for dismissing it earlier.

## The Real Limit: "Total Runtime"
The limit you likely hit before is **Google Apps Script Runtime**.
*   **Free Accounts:** You get **90 minutes** of script runtime per day.
*   **The Math:**
    *   If your script runs every **1 minute** (1440 times/day) and takes **4 seconds** to finish (initializing, checking cache, etc.), that is `1440 * 4 = 5760 seconds = 96 minutes`.
    *   **Result:** You hit the limit and the script stops working for 24 hours.

## The Fix: Efficiency & 5-Minute Triggers
1.  **Run Every 5 Minutes:** This reduces executions to ~288/day. Even if the script takes 10 seconds, you are only at 48 minutes total. Safe.
2.  **Code Optimization:** We will move the "Sampling" logic so it **ONLY** runs if there is actually a new email. If the inbox is empty (99% of the time), the script exits in 0.5 seconds.

## Optimized Code (Final Version - Purchases Definition)
This version includes strict definitions for "Purchases" vs "Promotions".

```javascript
// CONFIGURATION
const PROJECT_ID = 'gem-mail-480201'; 
const LOCATION = 'us-west1'; 
const MODEL_ID = 'gemini-2.5-flash'; 

function processNewEmails() {
  const query = 'label:inbox is:unread -label:"Manual Sort"'; 
  const threads = GmailApp.search(query, 0, 10); 

  if (threads.length === 0) {
    return; // Exit immediately to save Runtime Quota
  }

  Logger.log(`Found ${threads.length} threads. Initializing AI...`);

  const labelNames = getAvailableLabels();
  if (labelNames.length === 0) {
    Logger.log("No user labels found.");
    return;
  }
  
  const labelExamples = getLabelExamples(labelNames);

  for (const thread of threads) {
    const messages = thread.getMessages();
    const firstMessage = messages[0]; 
    const subject = firstMessage.getSubject();
    const sender = firstMessage.getFrom(); 
    const body = firstMessage.getPlainBody().substring(0, 5000); 

    try {
      const category = callGeminiAPI(sender, subject, body, labelNames, labelExamples);
      Logger.log(`Categorized "${subject}" as: ${category}`);
      
      if (category !== "Manual Sort" && category !== "Other") {
        // Success: Apply Label + Archive
        applyLabel(thread, category);
        thread.moveToArchive(); 
      } else {
        // Failure: Apply "Manual Sort" + Leave in Inbox
        const manualLabel = GmailApp.getUserLabelByName('Manual Sort') || GmailApp.createLabel('Manual Sort');
        thread.addLabel(manualLabel);
      }
      
    } catch (e) {
      Logger.log(`Error processing thread "${subject}": ${e.toString()}`);
    }
  }
}

function getAvailableLabels() {
  const labels = GmailApp.getUserLabels();
  const names = [];
  for (const label of labels) {
    const name = label.getName();
    if (name !== 'Manual Sort' && !name.startsWith('AI-Old-')) { 
      names.push(name);
    }
  }
  return names;
}

function getLabelExamples(labelNames) {
  const cache = CacheService.getScriptCache();
  // Bumped to v5 to force refresh 
  const cachedData = cache.get('label_examples_v5'); 
  
  if (cachedData) {
    return JSON.parse(cachedData);
  }

  const examples = {};
  for (const name of labelNames) {
    try {
      const threads = GmailApp.search(`label:${name}`, 0, 1);
      if (threads.length > 0) {
        const msg = threads[0].getMessages()[0];
        let cleanBody = msg.getPlainBody().substring(0, 500).replace(/\s+/g, ' ').trim();
        examples[name] = `From: "${msg.getFrom()}" | Subject: "${msg.getSubject()}" | Body: "${cleanBody}..."`;
      }
      Utilities.sleep(100); 
    } catch (e) {
      Logger.log(`Skipping example for ${name}: ${e.toString()}`);
    }
  }
  
  cache.put('label_examples_v5', JSON.stringify(examples), 21600); 
  return examples;
}

function callGeminiAPI(sender, subject, body, labelNames, labelExamples) {
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;

  let examplesText = "";
  for (const [label, example] of Object.entries(labelExamples)) {
    examplesText += `- Example for "${label}": ${example}\n`;
  }

  // --- REFINED PROMPT FOR "Purchases" ---
  const prompt = `
    You are an intelligent email assistant. Your goal is to organize the inbox by assigning the most appropriate label to the email below.
    
    INSTRUCTIONS:
    1. Read the "Available Labels" list. Infer the meaning of each label based on its name.
    2. Analyze the "New Email" (Sender, Subject, Body).
    3. Select the label that best fits. 
    
    CRITICAL DEFINITIONS:
    - **"Purchases" (or Shopping/Orders):** Use this for ANYTHING related to buying things. This includes: Receipts, Order Confirmations, Shipping Notifications, Tracking Updates, Returns, and "Your item has arrived". 
    - **"Promotions":** Use this for Marketing, Sales, Newsletters, and "50% Off" emails. Do NOT put receipts here.
    - **"Finance":** Use this for Banks, Credit Card Statements, Bills, Taxes. (Do not put shopping receipts here unless the user has no "Purchases" label).

    PRIORITY RULES:
    1. If the email is a Receipt or Order Update -> Label as "Purchases" (or "Shopping").
    2. If the email is Marketing/Sale -> Label as "Promotions".
    3. If unsure -> "Manual Sort".

    REFERENCE EXAMPLES:
    ${examplesText}

    AVAILABLE LABELS:
    ${labelNames.map(n => `- "${n}"`).join('\n')}
    - "Manual Sort"

    NEW EMAIL TO CATEGORIZE:
    From: ${sender}
    Subject: ${subject}
    Body: ${body}

    OUTPUT:
    Return ONLY the label name. Do not explain.
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
      "maxOutputTokens": 50
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
     return "Manual Sort"; 
  }

  if (json.candidates[0].content && json.candidates[0].content.parts) {
     let text = json.candidates[0].content.parts[0].text.trim();
     text = text.replace(/^"|"$/g, '');
     return text;
  }
  
  return "Manual Sort";
}

function applyLabel(thread, labelName) {
  if (labelName === "Manual Sort" || labelName === "Other") return; 

  const label = GmailApp.getUserLabelByName(labelName);
  if (label) {
    thread.addLabel(label);
  }
}
```

### Next Steps
1.  **Rename Label:** Go to Gmail and rename your "Shopping" or "Receipts" label to **"Purchases"**.
2.  **Update Code:** Copy the code above.
3.  **Run:** It will now sort tracking numbers and receipts into "Purchases" and coupons into "Promotions".
