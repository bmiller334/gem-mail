// --- CONFIGURATION ---
const PROJECT_ID = "gem-mail-480201";
const LOCATION = "us-west1"; 
const MODEL_ID = "gemini-2.5-flash";
const PROCESSED_LABEL = "GeminiProcessed";
const FIRESTORE_COLLECTION = "email_logs"; 
const STATS_COLLECTION = "email_stats";

// --- TRIGGERS & UI ---

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Gemini Command')
      .addItem('▶ Run Processor', 'main')
      .addItem('↻ Update Stats', 'updateStats')
      .addToUi();
}

function doGet(e) {
  if (e.parameter.action === "run") {
    main();
    return ContentService.createTextOutput("Processor Started");
  }
  return ContentService.createTextOutput("Gemini Mail API Online");
}

// --- FIRESTORE HELPER ---

function createFirestoreDocument(collection, data, docId = null) {
  const token = ScriptApp.getOAuthToken();
  let url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}`;
  
  if (docId) {
    url = `${url}?documentId=${docId}`;
  }

  const firestoreData = {
    fields: {}
  };

  for (const [key, value] of Object.entries(data)) {
    firestoreData.fields[key] = mapToFirestoreValue(value);
  }

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify(firestoreData),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    // If it fails because it exists, try PATCH (for stats)
    if (response.getResponseCode() === 409 && docId) {
       updateFirestoreDocument(collection, docId, data);
    } else if (response.getResponseCode() !== 200) {
      console.error("Firestore Error:", response.getContentText());
    } else {
      console.log("Logged to Firestore:", docId || "New Doc");
    }
  } catch (e) {
    console.error("Firestore Exception:", e.toString());
  }
}

function updateFirestoreDocument(collection, docId, data) {
  const token = ScriptApp.getOAuthToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;

  const firestoreData = { fields: {} };
  let updateMask = [];

  for (const [key, value] of Object.entries(data)) {
    firestoreData.fields[key] = mapToFirestoreValue(value);
    updateMask.push(`updateMask.fieldPaths=${key}`);
  }
  
  const maskQuery = updateMask.join('&');
  const fullUrl = `${url}?${maskQuery}`;

  const options = {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify(firestoreData),
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(fullUrl, options);
}

function mapToFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: value };
    return { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(mapToFirestoreValue) } };
  if (typeof value === 'object') {
    const mapFields = {};
    for (const k in value) {
      mapFields[k] = mapToFirestoreValue(value[k]);
    }
    return { mapValue: { fields: mapFields } };
  }
  return { stringValue: String(value) };
}

// --- STATS LOGIC ---

function updateStats() {
  const totalUnread = GmailApp.getInboxUnreadCount();
  const processedUnread = GmailApp.search(`label:${PROCESSED_LABEL} is:unread`).length;
  // Inbox unread usually includes everything in inbox, but let's be specific:
  // "Pending" = Unread in Inbox that are NOT yet processed
  const pending = GmailApp.search(`is:unread -label:${PROCESSED_LABEL} in:inbox`).length;

  const stats = {
    totalUnread: totalUnread,
    processedUnread: processedUnread,
    pending: pending,
    lastUpdated: new Date()
  };

  createFirestoreDocument(STATS_COLLECTION, stats, "current");
}

// --- CORE LOGIC ---

function getThreadsToProcess() {
  const query = `is:unread -label:${PROCESSED_LABEL}`;
  return GmailApp.search(query);
}

function ensureLabelExists() {
  let label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  if (!label) label = GmailApp.createLabel(PROCESSED_LABEL);
  return label;
}

function getAvailableLabels() {
  const labels = GmailApp.getUserLabels();
  const names = [];
  for (const label of labels) {
    const name = label.getName();
    if (name !== PROCESSED_LABEL && !name.startsWith('AI-Old-')) { 
      names.push(name);
    }
  }
  if (names.length === 0) return ["Personal", "Work", "Promotions", "Updates"];
  return names;
}

function getEmailBody(thread) {
  if (thread) return thread.getMessages()[0].getPlainBody();
  return null;
}

function cleanJsonResponse(text) {
  let cleanText = text.trim();
  if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
  else if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
  if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
  return cleanText.trim();
}

function callGeminiAPI(emailBody, labelNames) {
  const token = ScriptApp.getOAuthToken();
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;

  const labelString = labelNames.map(n => `- "${n}"`).join('\n');

  const prompt = `
    You are an automated email assistant. 
    1. Analyze the email below.
    2. Select the BEST matching label from this list:
    ${labelString}
    - "Manual Sort" (if unsure)

    3. Extract/Infer the following metadata:
       - Confidence Score (1-10)
       - Urgency (High/Medium/Low)
       - Category (Work/Personal/Finance/Social/Promotions/Updates)
       - Sentiment (Positive/Neutral/Negative)
       - Action Required? (true/false)
       - Summary (1 short sentence)

    Return ONLY a valid JSON object:
    {
      "label": "Selected Label Name",
      "reasoning": "Your summary here",
      "confidence": 8,
      "urgency": "Medium",
      "category": "Work",
      "sentiment": "Neutral",
      "actionRequired": false
    }

    Email Body:
    ${emailBody}
  `;

  const requestBody = {
    "contents": [{
      "role": "user",
      "parts": [{ "text": prompt }]
    }],
    "generation_config": { "response_mime_type": "application/json" }
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": { "Authorization": "Bearer " + token },
    "payload": JSON.stringify(requestBody),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      const parsed = JSON.parse(response.getContentText());
      return parsed.candidates[0].content.parts[0].text;
    } else {
      console.error(`API Error ${response.getResponseCode()}: ${response.getContentText()}`);
      return null;
    }
  } catch (error) {
    console.error("Gemini API failed: " + error.toString());
    return null;
  }
}

function main() {
  const processedLabel = ensureLabelExists();
  const labelNames = getAvailableLabels();
  const threads = getThreadsToProcess();

  updateStats(); // Initial stats update

  if (threads.length === 0) {
    console.log("No new emails.");
    return;
  }

  console.log(`Processing ${threads.length} threads...`);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(`Processing ${threads.length} emails...`, "Gemini HQ"); } catch(e) {}

  for (const thread of threads) {
    const message = thread.getMessages()[0];
    const body = getEmailBody(thread);

    if (body) {
      const startTime = new Date().getTime();
      const response = callGeminiAPI(body, labelNames);
      const endTime = new Date().getTime();
      
      if (response) {
        try {
          const json = JSON.parse(cleanJsonResponse(response));
          const selectedLabel = json.label || "Manual Sort";
          
          // --- LOG TO FIRESTORE ---
          const firestorePayload = {
             messageId: message.getId(),
             threadId: thread.getId(),
             sender: message.getFrom(),
             subject: message.getSubject(),
             receivedDate: message.getDate(),
             processedDate: new Date(),
             bodySnippet: body.substring(0, 200), // First 200 chars preview
             aiResponse: json, // Nested object with confidence, urgency, etc.
             processingTimeMs: endTime - startTime,
             status: "success",
             appliedLabel: selectedLabel,
             hasAttachments: message.getAttachments().length > 0
          };
          createFirestoreDocument(FIRESTORE_COLLECTION, firestorePayload);
          // ------------------------

          if (selectedLabel !== "Manual Sort") {
             const gmailLabel = GmailApp.getUserLabelByName(selectedLabel);
             if (gmailLabel) thread.addLabel(gmailLabel);
          }

          thread.addLabel(processedLabel);
          // Emails remain unread per user request
        } catch (e) {
          console.error("Error parsing response", e);
        }
      }
    }
  }
  updateStats(); // Final stats update
}